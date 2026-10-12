import { Permissions, webMethod } from 'wix-web-module';
import wixData from 'wix-data';
import { currentMember, members } from 'wix-members-backend';
import { elevate } from 'wix-auth';
import { notifyNewSubmission } from 'backend/triggers';

const updateMember = elevate(members.updateMember);   // « Manage Members »

/*
 *  backend/form_3-partenaire.web.js — formulaire custom « Devenir partenaire »
 *  (même patron que form_2-accueillant.web.js).
 *   - getMyPartenaireData() : options (types d'organisme, propositions) + valeurs à préremplir
 *   - submitPartenaire(p)   : upsert Membres (contact) + Organisations (l'organisme partenaire)
 *
 *  Règles (reprises de F2, 17/09) :
 *   - Membres.type : AJOUT de « Partenaire », jamais de retrait
 *   - membre avec une organisation liée -> MISE À JOUR de cette organisation (20/09 : plus de doublon
 *     quand la même personne a déjà rempli F2)
 *   - sinon -> CRÉATION d'une organisation + organisation_id renseigné
 *   - pas de dédoublonnage automatique ; l'alerte signale un homonyme (nom + adresse)
 *   - Organisations.types / capacites : remplacement LIMITÉ au périmètre du formulaire
 *     (les types/capacités du genre Accueillant posés par F2 sont conservés)
 *   - types proposés = Organisations_Types dont Genre contient « Partenaire »
 *   - propositions = Capacites rattachées au statut Partenaire (Capacites.typesDeMembre)
 *   - Membres.commentaire / capacites / disponibilites / photo / localite / entreprise : non touchés
 */

const COL_MEMBRES = 'Membres';
const COL_ORGS = 'Organisations';
const COL_ORG_TYPES = 'Organisations_Types';
const COL_CAPACITES = 'Capacites';
const COL_STATUTS = 'Membres_Statuts';
const STATUT = 'Partenaire';
const TYPE_REPLI = 'Autre';            // si le type reçu est introuvable
const SITE_ID = 'REDACTED-WIX-SITE-ID';

const clean = (s, m = 2000) => (typeof s === 'string' ? s.trim().slice(0, m) : '');
const asArr = (x) => (Array.isArray(x) ? x : x == null || x === '' ? [] : [x]);

/**
 * Tri d'affichage des listes de référence : colonne « Ordre » du CMS (clé `ordre` ou `Ordre`),
 * les lignes sans numéro en fin de liste, puis le libellé en départage. Le tri se fait ici
 * plutôt que par `.ascending('ordre')` pour ne pas dépendre de la clé exacte du champ.
 */
function parOrdre(rows, champ) {
  const num = (r) => {
    const v = r ? (r.ordre !== undefined && r.ordre !== null ? r.ordre : r.Ordre) : null;
    const n = Number(v);
    return Number.isFinite(n) ? n : Infinity;
  };
  return [...asArr(rows)].sort((a, b) =>
    num(a) - num(b) || String(a[champ] || '').localeCompare(String(b[champ] || ''), 'fr'));
}
const idsOf = (r) => asArr(r).map((x) => (typeof x === 'string' ? x : x && x._id)).filter(Boolean);
const norm = (s) => clean(String(s || ''), 300).toLowerCase().replace(/…/g, '...').replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();

/** Téléphone -> E.164 (Belgique par défaut). null si impossible. */
function toE164(raw) {
  if (typeof raw !== 'string') return null;
  let s = raw.replace(/[\s.\-()/]/g, '');
  if (/^\+\d{8,15}$/.test(s)) return s;
  if (s.startsWith('00')) s = '+' + s.slice(2);
  else if (s.startsWith('0')) s = '+32' + s.slice(1);
  else if (/^\d{8,9}$/.test(s)) s = '+32' + s;
  return /^\+\d{8,15}$/.test(s) ? s : null;
}

/** Texte brut -> HTML minimal (Organisations.commentaire est un champ Texte enrichi). */
function toRichText(txt) {
  if (!txt) return '';
  const esc = txt.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc.split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
}

/** HTML du Texte enrichi -> texte brut (préremplissage de la zone de texte). */
function fromRichText(html) {
  if (typeof html !== 'string' || !html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .trim();
}

async function statutId(label) {
  const r = (await wixData.query(COL_STATUTS).eq('statut', label).limit(1).find({ suppressAuth: true })).items[0];
  return r ? r._id : null;
}

/** Options : types d'organisme au Genre « Partenaire » ; propositions = capacités rattachées au statut Partenaire. */
async function refOptions(statutPartenaireId) {
  const types = await wixData.query(COL_ORG_TYPES).ascending('type').limit(200).find({ suppressAuth: true });
  const typesPartenaire = types.items.filter((r) => asArr(r.Genre).some((g) => norm(g) === norm(STATUT)));
  let caps = { items: [] };
  if (statutPartenaireId) {
    try {
      caps = await wixData.query(COL_CAPACITES).hasSome('typesDeMembre', [statutPartenaireId])
        .ascending('capacite').limit(200).find({ suppressAuth: true });
    } catch (e) {
      console.warn('[LPC][F3] filtre capacités par statut KO:', e && e.message);
    }
  }
  return {
    typeOptions: parOrdre(typesPartenaire, 'type').map((r) => r.type).filter(Boolean),
    capaciteOptions: parOrdre(caps.items, 'capacite').map((r) => r.capacite).filter(Boolean),
  };
}

/** IDs des types d'organisme proposés par CE formulaire (Genre = Partenaire). */
async function perimetreTypeIds() {
  const rows = (await wixData.query(COL_ORG_TYPES).limit(200).find({ suppressAuth: true })).items;
  return rows.filter((r) => asArr(r.Genre).some((g) => norm(g) === norm(STATUT))).map((r) => r._id);
}

/** IDs des capacités proposées par CE formulaire (rattachées au statut). */
async function perimetreCapaciteIds(statutRefId) {
  if (!statutRefId) return [];
  try {
    const rows = (await wixData.query(COL_CAPACITES).hasSome('typesDeMembre', [statutRefId])
      .limit(200).find({ suppressAuth: true })).items;
    return rows.map((r) => r._id);
  } catch (e) { return []; }
}

/**
 * Une organisation peut être à la fois lieu d'accueil (F2) et partenaire (F3) :
 * ce formulaire ne remplace que les valeurs de SON périmètre et conserve les autres.
 */
function fusionRefs(avant, nouveaux, perimetre) {
  const gardes = asArr(avant).filter((id) => !perimetre.includes(id));
  return Array.from(new Set([...gardes, ...asArr(nouveaux)]));
}

async function labelsToIds(col, field, values) {
  const vals = asArr(values).map((v) => clean(v, 200)).filter(Boolean);
  if (!vals.length) return [];
  const rows = (await wixData.query(col).limit(200).find({ suppressAuth: true })).items;
  const byNorm = new Map(rows.map((r) => [norm(r[field]), r._id]));
  return vals.map((v) => byNorm.get(norm(v))).filter(Boolean);
}

/** Options + valeurs du contact et de son organisation liée (quel que soit le formulaire qui l'a créée). */
export const getMyPartenaireData = webMethod(Permissions.SiteMember, async () => {
  const partenaireId = await statutId(STATUT);
  const opts = await refOptions(partenaireId);

  const member = await currentMember.getMember({ fieldsets: ['FULL'] });
  const email = member ? (member.loginEmail || '').toLowerCase() : '';
  if (!email) return { existe: false, ...opts };

  const row = (await wixData.query(COL_MEMBRES).eq('email', email).include('type')
    .limit(1).find({ suppressAuth: true })).items[0];
  if (!row) return { existe: false, ...opts };

  const out = {
    existe: true,
    prenom: row.prenom || '',
    nom: row.nom || '',
    telephone: row.telephone || '',
    fonction: row.fonction || '',
    orgExiste: false,
    ...opts,
  };

  // Un membre n'a qu'UNE organisation liée (organisation_id) : on la préremplit dès
  // qu'elle existe, quel que soit le formulaire qui l'a créée (corrigé le 20/09 :
  // après un envoi F2, F3 repartait à vide et créait un doublon d'organisation).
  const orgId = idsOf(row.organisation_id)[0];
  if (orgId) {
    const org = (await wixData.query(COL_ORGS).eq('_id', orgId).include('types', 'capacites')
      .limit(1).find({ suppressAuth: true })).items[0];
    if (org) {
      Object.assign(out, {
        orgExiste: true,
        organisme: org.nom || '',
        // Une organisation peut porter plusieurs types (lieu d'accueil ET partenaire) :
        // on retient celui qui figure dans la liste de CE formulaire, sinon le premier.
        organismeType: (() => {
          const labels = (org.types || []).map((r) => r && r.type).filter(Boolean);
          return labels.find((t) => (opts.typeOptions || []).some((o) => norm(o) === norm(t))) || labels[0] || '';
        })(),
        organismeTypes: (org.types || []).map((r) => r && r.type).filter(Boolean),   // diagnostic
        organismeAdresse: org.adresse || '',   // 12/10 : le formulaire poste dans `adresse` (la localité existante n'est plus touchée)
        capacites: (org.capacites || []).map((r) => r && r.capacite).filter(Boolean),
        commentaire: fromRichText(org.commentaire),
        logoUrl: typeof org.logo === 'string' ? org.logo : '',   // 12/10 : logo de l'organisation
        consentementLogo: org.consentement_logo === true,
      });
    }
  }
  return out;
});

/**
 * payload = { prenom, nom, telephone, fonction,
 *             organismeType: string, organisme: string, organismeAdresse: string,
 *             capacites: string[], commentaire: string, consentement: boolean,
 *             logoUrl?: string, supprimerLogo?: boolean, consentementLogo?: boolean }   (12/10 : logo, voir F2)
 */
export const submitPartenaire = webMethod(Permissions.SiteMember, async (payload = {}) => {
  const member = await currentMember.getMember({ fieldsets: ['FULL'] });
  if (!member) return { ok: false, reason: 'not-logged-in' };
  const email = (member.loginEmail || '').toLowerCase();
  if (!email) return { ok: false, reason: 'no-email' };
  if (payload.consentement !== true) return { ok: false, reason: 'consentement-requis' };

  const prenom = clean(payload.prenom, 80);
  const nom = clean(payload.nom, 80);
  const telephone = clean(payload.telephone, 40);
  const fonction = clean(payload.fonction, 120);
  const organisme = clean(payload.organisme, 200);
  const adresse = clean(payload.organismeAdresse, 300);
  const commentaire = clean(payload.commentaire, 4000);
  if (!organisme) return { ok: false, reason: 'organisme-requis' };
  // Logo (12/10) : image Wix Media seulement ; un nouveau logo exige l'autorisation (comme F2)
  const logoUrl = clean(payload.logoUrl, 2000);
  if (logoUrl && !/^wix:image:\/\/v1\//.test(logoUrl)) return { ok: false, reason: 'logo-invalide' };
  if (logoUrl && payload.consentementLogo !== true) return { ok: false, reason: 'consentement-logo-requis' };
  const supprimerLogo = payload.supprimerLogo === true && !logoUrl;

  let typeIds = await labelsToIds(COL_ORG_TYPES, 'type', payload.organismeType);
  let typeLabel = clean(payload.organismeType, 200);
  if (!typeIds.length) {
    typeIds = await labelsToIds(COL_ORG_TYPES, 'type', TYPE_REPLI);
    typeLabel = TYPE_REPLI;
  }
  const capIds = await labelsToIds(COL_CAPACITES, 'capacite', payload.capacites);

  const partenaireId = await statutId(STATUT);
  const existing = (await wixData.query(COL_MEMBRES).eq('email', email).include('type')
    .limit(1).find({ suppressAuth: true })).items[0];

  // Statuts AVANT toute modification : `p` plus bas est le meme objet que `existing`,
  // donc `delete p.type` viderait cette liste si on la lisait apres (bug corrige le 20/09 :
  // le nouveau statut ecrasait les precedents au lieu de s'y ajouter).
  const typeIdsAvant = idsOf(existing && existing.type);
  const dejaPartenaire = Boolean(partenaireId) && typeIdsAvant.includes(partenaireId);
  const linkedOrgId = existing ? idsOf(existing.organisation_id)[0] : null;

  // ── 1. Organisation : mise à jour si retour d'un Partenaire, sinon création ──
  let orgId = null;
  let typesAvant = [];
  let capsAvant = [];
  if (linkedOrgId) {   // une seule organisation par membre : on la met à jour, jamais de doublon
    const org = (await wixData.query(COL_ORGS).eq('_id', linkedOrgId).include('types', 'capacites')
      .limit(1).find({ suppressAuth: true })).items[0];
    if (org) {
      typesAvant = idsOf(org.types);
      capsAvant = idsOf(org.capacites);
      org.nom = organisme;
      org.adresse = adresse;
      org.commentaire = toRichText(commentaire);
      if (logoUrl) { org.logo = logoUrl; org.consentement_logo = true; }
      else if (supprimerLogo) { org.logo = ''; org.consentement_logo = false; }
      else if (org.logo && typeof payload.consentementLogo === 'boolean') org.consentement_logo = payload.consentementLogo;   // le fichier est conservé
      delete org.types; delete org.capacites;   // via replaceReferences
      orgId = (await wixData.update(COL_ORGS, org, { suppressAuth: true }))._id;
      console.log('[LPC][F3] organisation mise à jour', orgId);
    }
  }
  const orgCreee = !orgId;
  if (orgCreee) {
    orgId = (await wixData.insert(COL_ORGS, {
      nom: organisme,
      adresse,
      pays: 'Belgique',
      commentaire: toRichText(commentaire),
      ...(logoUrl ? { logo: logoUrl, consentement_logo: true } : {}),
    }, { suppressAuth: true }))._id;
    console.log('[LPC][F3] organisation créée', orgId, linkedOrgId ? `(remplace le lien ${linkedOrgId})` : '');
  }
  const typesFinal = fusionRefs(typesAvant, typeIds, await perimetreTypeIds());
  const capsFinal = fusionRefs(capsAvant, capIds, await perimetreCapaciteIds(partenaireId));
  await wixData.replaceReferences(COL_ORGS, 'types', orgId, typesFinal, { suppressAuth: true });
  await wixData.replaceReferences(COL_ORGS, 'capacites', orgId, capsFinal, { suppressAuth: true });

  // Homonyme possible (même nom + même adresse) : signalé à l’équipe, pas de fusion auto
  let homonyme = false;
  try {
    const cands = (await wixData.query(COL_ORGS).contains('nom', organisme).ne('_id', orgId)
      .limit(50).find({ suppressAuth: true })).items;
    homonyme = cands.some((o) => norm(o.nom) === norm(organisme) && norm(o.adresse) === norm(adresse));
  } catch (e) {
    console.warn('[LPC][F3] recherche homonyme KO:', e && e.message);
  }

  // ── 2. Fiche Membres du contact ──
  let rowId;
  if (existing) {
    const p = { ...existing };   // copie : ne jamais muter `existing`
    p.prenom = prenom || p.prenom;
    p.nom = nom || p.nom;
    p.telephone = telephone || p.telephone;
    p.fonction = fonction || p.fonction;
    p.consentement_rgpd = true;
    p.actif = true;
    p.organisation_id = orgId;
    delete p.type; delete p.capacites; delete p.disponibilites;   // multi-références : non touchées ici
    rowId = (await wixData.update(COL_MEMBRES, p, { suppressAuth: true }))._id;
    console.log('[LPC][F3] fiche membre mise à jour', rowId);
  } else {
    rowId = (await wixData.insert(COL_MEMBRES, {
      email, prenom, nom, telephone, fonction,
      consentement_rgpd: true, abonnement_newsletter: false, actif: true,
      organisation_id: orgId,
    }, { suppressAuth: true }))._id;
    console.log('[LPC][F3] fiche membre créée', rowId);
  }

  // type -> AJOUT « Partenaire »
  const typeTarget = Array.from(new Set([...typeIdsAvant, ...(partenaireId ? [partenaireId] : [])]));
  if (typeTarget.length) {
    await wixData.replaceReferences(COL_MEMBRES, 'type', rowId, typeTarget, { suppressAuth: true });
  }

  // ── 3. Push vers le membre Wix : prénom / nom / téléphone / fonction ──
  try {
    const cd = {};
    if (prenom) cd.firstName = prenom;
    if (nom) cd.lastName = nom;
    const tel164 = toE164(telephone);
    if (tel164) cd.phones = [tel164];
    if (fonction) cd.jobTitle = fonction;
    if (Object.keys(cd).length) await updateMember(member._id, { contactDetails: cd });
  } catch (e) {
    console.warn('[LPC][F3] updateMember (Wix) KO:', e && (e.stack || e.message || e));
  }

  // ── 4. Alerte interne (best-effort) ──
  const propositions = asArr(payload.capacites).join(', ');
  let notify = { ok: false, cause: 'non appelé' };
  try {
    notify = (await notifyNewSubmission({
      formName: dejaPartenaire && !orgCreee
        ? 'Devenir partenaire (mise à jour)'
        : 'Devenir partenaire',
      prenom, nom, email, telephone, localite: adresse,
      extra1: `Organisme : ${organisme} (${typeLabel}${adresse ? ', ' + adresse : ''})`
        + (homonyme ? ' ⚠️ organisation du même nom déjà présente' : ''),
      extra2: [propositions ? `Propositions : ${propositions}` : '', logoUrl ? 'Logo : ajouté' : ''].filter(Boolean).join(' · '),
      extra3: commentaire ? `Message : ${commentaire}` : '',
      ficheUrl: `https://www.wix.com/dashboard/${SITE_ID}/database/data/${COL_ORGS}/${orgId}`,
    })) || notify;
    console.log('[LPC][F3] alerte interne :', JSON.stringify(notify));
  } catch (e) {
    console.warn('[LPC][F3] notifyNewSubmission KO:', e && (e.stack || e.message || e));
    notify = { ok: false, cause: String((e && (e.message || e)) || 'exception') };
  }

  return { ok: true, id: rowId, organisationId: orgId, notify };
});
