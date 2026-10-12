import { Permissions, webMethod } from 'wix-web-module';
import wixData from 'wix-data';
import { currentMember, members } from 'wix-members-backend';
import { elevate } from 'wix-auth';
import { notifyNewSubmission } from 'backend/triggers';

const updateMember = elevate(members.updateMember);   // « Manage Members »

/*
 *  backend/form_2-accueillant.web.js — formulaire custom « Accueillir des Porteurs de chaleur »
 *  (même patron que form_1-devenir-porteur.web.js).
 *   - getMyAccueillantData() : options (types de lieu, souhaits) + valeurs à préremplir
 *   - submitAccueillant(p)   : upsert Membres (responsable) + Organisations (le lieu)
 *
 *  Règles (arrêtées le 17/09) :
 *   - Membres.type : AJOUT de « Accueillant », jamais de retrait
 *   - membre avec une organisation liée -> MISE À JOUR de cette organisation (20/09 : plus de doublon
 *     quand la même personne a déjà rempli F3)
 *   - sinon -> CRÉATION d'une organisation + organisation_id ÉCRASÉ (cas rare : membre
 *     déjà lié à une autre organisation, p. ex. via F3)
 *   - pas de dédoublonnage automatique : une fiche par envoi, fusion manuelle par l’équipe ;
 *     l'alerte signale une organisation homonyme (même nom + même localité)
 *   - Organisations.types / capacites : remplacement LIMITÉ au périmètre du formulaire
 *     (les types/capacités du genre Partenaire posés par F3 sont conservés)
 *   - la localité du lieu reste dans Organisations (ce n'est pas le domicile du membre)
 *   - Membres.commentaire / capacites / disponibilites / photo / entreprise : non touchés
 */

const COL_MEMBRES = 'Membres';
const COL_ORGS = 'Organisations';
const COL_ORG_TYPES = 'Organisations_Types';
const COL_CAPACITES = 'Capacites';
const COL_STATUTS = 'Membres_Statuts';
const STATUT_ACCUEILLANT = 'Accueillant';
const TYPE_PAR_DEFAUT = "Institution de soins ou d'hébergement";
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

/** Options : types de lieu au Genre « Accueillant » ; souhaits = capacités rattachées au statut Accueillant (toutes si aucune). */
async function refOptions(accueillantId) {
  // Types de lieu : uniquement ceux dont le champ Genre (tags) contient « Accueillant »
  const types = await wixData.query(COL_ORG_TYPES).ascending('type').limit(200).find({ suppressAuth: true });
  const typesAccueillant = types.items.filter((r) => asArr(r.Genre).some((g) => norm(g) === norm(STATUT_ACCUEILLANT)));
  let caps = { items: [] };
  if (accueillantId) {
    try {
      caps = await wixData.query(COL_CAPACITES).hasSome('typesDeMembre', [accueillantId])
        .ascending('capacite').limit(200).find({ suppressAuth: true });
    } catch (e) {
      console.warn('[LPC][F2] filtre capacités par statut KO, repli sur toutes:', e && e.message);
    }
  }
  if (!caps.items.length) {
    caps = await wixData.query(COL_CAPACITES).ascending('capacite').limit(200).find({ suppressAuth: true });
  }
  return {
    typeOptions: parOrdre(typesAccueillant, 'type').map((r) => r.type).filter(Boolean),
    capaciteOptions: parOrdre(caps.items, 'capacite').map((r) => r.capacite).filter(Boolean),
    typeParDefaut: TYPE_PAR_DEFAUT,
  };
}

/** IDs des types d'organisme proposés par CE formulaire (Genre = Accueillant). */
async function perimetreTypeIds() {
  const rows = (await wixData.query(COL_ORG_TYPES).limit(200).find({ suppressAuth: true })).items;
  return rows.filter((r) => asArr(r.Genre).some((g) => norm(g) === norm(STATUT_ACCUEILLANT))).map((r) => r._id);
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

/** Options + valeurs du responsable et de son organisation liée (quel que soit le formulaire qui l'a créée). */
export const getMyAccueillantData = webMethod(Permissions.SiteMember, async () => {
  const accueillantId = await statutId(STATUT_ACCUEILLANT);
  const opts = await refOptions(accueillantId);

  const member = await currentMember.getMember({ fieldsets: ['FULL'] });
  const email = member ? (member.loginEmail || '').toLowerCase() : '';
  if (!email) return { existe: false, ...opts };

  const row = (await wixData.query(COL_MEMBRES).eq('email', email).include('type', 'capacites')
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
  // après un envoi F3, F2 repartait à vide et créait un doublon d'organisation).
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
        organismeLocalite: org.localite || '',
        nombreDestinataires: org.nombre_destinataires == null ? '' : String(org.nombre_destinataires),
        capacites: (org.capacites || []).map((r) => r && r.capacite).filter(Boolean),
        commentaire: fromRichText(org.commentaire),
        logoUrl: typeof org.logo === 'string' ? org.logo : '',   // 12/10 : logo de l'organisation (champ Image `logo`)
      });
    }
  }
  // 08/10 : sans organisation liée (membre venu de /mon-profil avec la capacité « Accueillir »), les souhaits sont préremplis avec ses
  // capacités DÉJÀ COCHÉES, limitées à celles que ce formulaire propose (sinon la case cochée à l'étape précédente semblait perdue)
  if (!out.orgExiste) {
    const siennes = asArr(row.capacites).map((r) => r && r.capacite).filter(Boolean);
    out.capacites = siennes.filter((c) => (opts.capaciteOptions || []).some((o) => norm(o) === norm(c)));
  }
  return out;
});

/**
 * payload = { prenom, nom, telephone, fonction,
 *             organismeType: string, organisme: string, organismeLocalite: string,
 *             nombreDestinataires: string|number, capacites: string[], commentaire: string,
 *             consentement: boolean,
 *             logoUrl?: string,         // 12/10 : URI Wix Media (wix:image://…) du logo téléversé par la page (uploadFiles)
 *             supprimerLogo?: boolean } // retire le logo déjà enregistré (ignoré si logoUrl est fourni)
 */
export const submitAccueillant = webMethod(Permissions.SiteMember, async (payload = {}) => {
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
  const localite = clean(payload.organismeLocalite, 120);
  const commentaire = clean(payload.commentaire, 4000);
  const nbRaw = parseInt(String(payload.nombreDestinataires ?? '').replace(/\s/g, ''), 10);
  const nombre = Number.isFinite(nbRaw) && nbRaw >= 0 ? nbRaw : null;
  if (!organisme) return { ok: false, reason: 'organisme-requis' };
  // Logo (12/10) : seule une image Wix Media est acceptée (le champ `logo` est de type Image)
  const logoUrl = clean(payload.logoUrl, 2000);
  if (logoUrl && !/^wix:image:\/\/v1\//.test(logoUrl)) {
    console.warn('[LPC][F2] logo refusé (format inattendu) :', logoUrl.slice(0, 40));
    return { ok: false, reason: 'logo-invalide' };
  }
  const supprimerLogo = payload.supprimerLogo === true && !logoUrl;

  // Type de lieu : libellé reçu, sinon type par défaut
  let typeIds = await labelsToIds(COL_ORG_TYPES, 'type', payload.organismeType);
  let typeLabel = clean(payload.organismeType, 200);
  if (!typeIds.length) {
    typeIds = await labelsToIds(COL_ORG_TYPES, 'type', TYPE_PAR_DEFAUT);
    typeLabel = TYPE_PAR_DEFAUT;
  }
  const capIds = await labelsToIds(COL_CAPACITES, 'capacite', payload.capacites);

  const accueillantId = await statutId(STATUT_ACCUEILLANT);
  const existing = (await wixData.query(COL_MEMBRES).eq('email', email).include('type')
    .limit(1).find({ suppressAuth: true })).items[0];

  // Statuts AVANT toute modification : `p` plus bas est le meme objet que `existing`,
  // donc `delete p.type` viderait cette liste si on la lisait apres (bug corrige le 20/09 :
  // le nouveau statut ecrasait les precedents au lieu de s'y ajouter).
  const typeIdsAvant = idsOf(existing && existing.type);
  const dejaAccueillant = Boolean(accueillantId) && typeIdsAvant.includes(accueillantId);
  const linkedOrgId = existing ? idsOf(existing.organisation_id)[0] : null;

  // ── 1. Organisation : mise à jour si retour d'un Accueillant, sinon création ──
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
      org.localite = localite;
      org.nombre_destinataires = nombre;
      org.commentaire = toRichText(commentaire);
      if (logoUrl) org.logo = logoUrl;            // nouveau logo -> écrase ; sinon on garde l'existant
      else if (supprimerLogo) org.logo = '';      // retrait demandé
      delete org.types; delete org.capacites;   // via replaceReferences
      orgId = (await wixData.update(COL_ORGS, org, { suppressAuth: true }))._id;
      console.log('[LPC][F2] organisation mise à jour', orgId);
    }
  }
  const orgCreee = !orgId;
  if (orgCreee) {
    orgId = (await wixData.insert(COL_ORGS, {
      nom: organisme,
      localite,
      pays: 'Belgique',
      ...(nombre == null ? {} : { nombre_destinataires: nombre }),
      commentaire: toRichText(commentaire),
      ...(logoUrl ? { logo: logoUrl } : {}),
    }, { suppressAuth: true }))._id;
    console.log('[LPC][F2] organisation créée', orgId, linkedOrgId ? `(remplace le lien ${linkedOrgId})` : '');
  }
  const typesFinal = fusionRefs(typesAvant, typeIds, await perimetreTypeIds());
  const capsFinal = fusionRefs(capsAvant, capIds, await perimetreCapaciteIds(accueillantId));
  await wixData.replaceReferences(COL_ORGS, 'types', orgId, typesFinal, { suppressAuth: true });
  await wixData.replaceReferences(COL_ORGS, 'capacites', orgId, capsFinal, { suppressAuth: true });

  // Homonyme possible (même nom + même localité) : signalé à l’équipe, pas de fusion auto
  let homonyme = false;
  try {
    const cands = (await wixData.query(COL_ORGS).contains('nom', organisme).ne('_id', orgId)
      .limit(50).find({ suppressAuth: true })).items;
    homonyme = cands.some((o) => norm(o.nom) === norm(organisme) && norm(o.localite) === norm(localite));
  } catch (e) {
    console.warn('[LPC][F2] recherche homonyme KO:', e && e.message);
  }

  // ── 2. Fiche Membres du responsable ──
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
    console.log('[LPC][F2] fiche membre mise à jour', rowId);
  } else {
    rowId = (await wixData.insert(COL_MEMBRES, {
      email, prenom, nom, telephone, fonction,
      consentement_rgpd: true, abonnement_newsletter: false, actif: true,
      organisation_id: orgId,
    }, { suppressAuth: true }))._id;
    console.log('[LPC][F2] fiche membre créée', rowId);
  }

  // type -> AJOUT « Accueillant »
  const typeTarget = Array.from(new Set([...typeIdsAvant, ...(accueillantId ? [accueillantId] : [])]));
  if (typeTarget.length) {
    await wixData.replaceReferences(COL_MEMBRES, 'type', rowId, typeTarget, { suppressAuth: true });
  }

  // ── 3. Push vers le membre Wix : prénom / nom / téléphone / fonction ──
  // (fonction poussée aussi : members-sync la recopie Wix -> LPC au chargement)
  try {
    const cd = {};
    if (prenom) cd.firstName = prenom;
    if (nom) cd.lastName = nom;
    const tel164 = toE164(telephone);
    if (tel164) cd.phones = [tel164];
    if (fonction) cd.jobTitle = fonction;
    if (Object.keys(cd).length) await updateMember(member._id, { contactDetails: cd });
  } catch (e) {
    console.warn('[LPC][F2] updateMember (Wix) KO:', e && (e.stack || e.message || e));
  }

  // ── 4. Alerte interne (best-effort) ──
  const souhaits = asArr(payload.capacites).join(', ');
  const ligne2 = [
    souhaits ? `Souhaits : ${souhaits}` : '',
    nombre != null ? `Personnes concernées : ${nombre}` : '',
    logoUrl ? 'Logo : ajouté' : '',
  ].filter(Boolean).join(' · ');
  let notify = { ok: false, cause: 'non appelé' };
  try {
    notify = (await notifyNewSubmission({
      formName: dejaAccueillant && !orgCreee
        ? 'Accueillir des Porteurs de chaleur (mise à jour)'
        : 'Accueillir des Porteurs de chaleur',
      prenom, nom, email, telephone, localite,
      extra1: `Organisme : ${organisme} (${typeLabel}${localite ? ', ' + localite : ''})`
        + (homonyme ? ' ⚠️ organisation du même nom déjà présente' : ''),
      extra2: ligne2,
      extra3: commentaire ? `Message : ${commentaire}` : '',
      ficheUrl: `https://www.wix.com/dashboard/${SITE_ID}/database/data/${COL_ORGS}/${orgId}`,
    })) || notify;
    console.log('[LPC][F2] alerte interne :', JSON.stringify(notify));
  } catch (e) {
    console.warn('[LPC][F2] notifyNewSubmission KO:', e && (e.stack || e.message || e));
    notify = { ok: false, cause: String((e && (e.message || e)) || 'exception') };
  }

  return { ok: true, id: rowId, organisationId: orgId, notify };
});
