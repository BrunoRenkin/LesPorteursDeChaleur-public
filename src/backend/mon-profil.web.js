import { Permissions, webMethod } from 'wix-web-module';
import wixData from 'wix-data';
import { currentMember, members } from 'wix-members-backend';
import { elevate } from 'wix-auth';
import { notifyNewSubmission } from 'backend/triggers';

const updateMember = elevate(members.updateMember);   // « Manage Members »

/*
 *  backend/mon-profil.web.js — page « Mon profil » (/mon-profil), DEUX formulaires éditables :
 *    getMonProfil()             options + valeurs actuelles (profil + organisation liée)
 *    enregistrerMonProfil(p)    met à jour la fiche Membres du membre connecté
 *    enregistrerMonOrganisation(p)  met à jour l'organisation LIÉE (jamais de création ici)
 *    creerMonOrganisation(p)        (06/10) CRÉE l'organisation d'un membre qui n'en a pas, et AJOUTE les statuts du Genre du type choisi
 *
 *  Règles reprises des formulaires F1/F2/F3 :
 *   - les STATUTS (`Membres.type`) ne sont jamais touchés ici : ils s'acquièrent par les formulaires
 *   - `Membres.capacites` / `disponibilites` : remplacement, l'état du formulaire fait foi
 *   - les capacités proposées sont celles rattachées aux STATUTS DU MEMBRE (`Capacites.typesDeMembre`)
 *   - enregistrerMonOrganisation ne crée rien ; la création passe par creerMonOrganisation (06/10, bouton « organisation » de /mon-profil)
 *   - `Organisations.types` / `capacites` : remplacement limité au périmètre des statuts du membre
 *   - l'e-mail n'est pas modifiable (il identifie la fiche et le compte Wix)
 *
 *  2026-09-30-a : harmonisation F1 / Mon-Profil (page = formulaire générique, mode « profil »).
 *   Seul changement : `nbResidentsMax` est désormais MODIFIABLE ici comme dans F1 (voir enregistrerMonProfil).
 */

const VERSION = '2026-10-08-f';
const SITE_ID = 'REDACTED-WIX-SITE-ID';

const COL_MEMBRES = 'Membres';
const COL_ORGS = 'Organisations';
const COL_ORG_TYPES = 'Organisations_Types';
const COL_CAPACITES = 'Capacites';
const COL_DISPONIBILITES = 'Disponibilites';
const COL_STATUTS = 'Membres_Statuts';

const clean = (s, m = 2000) => (typeof s === 'string' ? s.trim().slice(0, m) : '');
const asArr = (x) => (Array.isArray(x) ? x : x == null || x === '' ? [] : [x]);
const idsOf = (r) => asArr(r).map((x) => (typeof x === 'string' ? x : x && x._id)).filter(Boolean);
const libelles = (refs, champ) => asArr(refs).map((r) => r && r[champ]).filter(Boolean);
const norm = (s) => clean(String(s || ''), 300).toLowerCase().replace(/…/g, '...').replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
const sansAccents = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * La capacité « Écrire une ou plusieurs cartes » figure-t-elle parmi les libellés ?
 * Détection sur « ecrire » et NON sur « carte » : « Lecture de cartes » contient aussi « carte ».
 */
const ecritDesCartes = (labels) => asArr(labels).some((l) => sansAccents(l).includes('ecrire'));

/** Nombre de résidents enregistré : entier de 1 à 99, sinon null. */
function nbResidents(v) {
  const n = parseInt(String(v == null ? '' : v).trim(), 10);
  return Number.isInteger(n) && n >= 1 && n <= 99 ? n : null;
}

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

/** URI Wix Media -> URL statique (seule forme acceptée par updateMember pour la photo). */
function toStaticImageUrl(uri) {
  const s = clean(uri, 2000);
  if (!s) return '';
  if (s.startsWith('https://static.wixstatic.com/')) return s.split('#')[0];
  const m = s.match(/^wix:image:\/\/v1\/([^/#]+)/);
  return m ? `https://static.wixstatic.com/media/${m[1]}` : '';
}

/** Texte brut -> HTML minimal (Organisations.commentaire est un champ Texte enrichi). */
function toRichText(txt) {
  if (!txt) return '';
  const esc = txt.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc.split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
}
function fromRichText(html) {
  if (typeof html !== 'string' || !html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .trim();
}

async function labelsToIds(col, champ, valeurs) {
  const vals = asArr(valeurs).map((v) => clean(v, 200)).filter(Boolean);
  if (!vals.length) return [];
  const rows = (await wixData.query(col).limit(200).find({ suppressAuth: true })).items;
  const parNorm = new Map(rows.map((r) => [norm(r[champ]), r._id]));
  return vals.map((v) => parNorm.get(norm(v))).filter(Boolean);
}

/** Fiche Membres du membre connecté, avec ses références. */
async function ficheCourante() {
  const member = await currentMember.getMember({ fieldsets: ['FULL'] });
  const email = member ? (member.loginEmail || '').toLowerCase() : '';
  if (!email) return { member: null, email: '', row: null };
  const row = (await wixData.query(COL_MEMBRES).eq('email', email)
    .include('type', 'capacites', 'disponibilites')
    .limit(1).find({ suppressAuth: true })).items[0] || null;
  return { member, email, row };
}

/** Options proposées, calculées d'après les STATUTS du membre. */
async function options(statutIds) {
  // Membre SANS statut : TOUTES les capacités sont proposées (08/10, Bruno : la majorité des membres seront des Porteurs) ;
  // le statut est déduit des capacités cochées à l'enregistrement (statutsDepuisCapacites).
  const [caps, dispos, types] = await Promise.all([
    statutIds.length
      ? wixData.query(COL_CAPACITES).hasSome('typesDeMembre', statutIds).ascending('capacite').limit(200).find({ suppressAuth: true })
      : wixData.query(COL_CAPACITES).ascending('capacite').limit(200).find({ suppressAuth: true }),
    wixData.query(COL_DISPONIBILITES).ascending('disponibilite').limit(200).find({ suppressAuth: true }),
    wixData.query(COL_ORG_TYPES).ascending('type').limit(200).find({ suppressAuth: true }),
  ]);
  const tri = {
    caps: parOrdre(caps.items, 'capacite'),
    dispos: parOrdre(dispos.items, 'disponibilite'),
    types: parOrdre(types.items, 'type'),
  };
  // Contrôle : si ce log n'apparaît pas dans Site Monitoring, le fichier collé dans Wix
  // n'est pas celui-ci. Si les `ordre` sortent « null », la clé du champ n'est ni `ordre` ni `Ordre`.
  console.log('[LPC][Profil] backend ' + VERSION + ' · tri par Ordre :',
    JSON.stringify(tri.caps.slice(0, 5).map((r) => ({
      capacite: r.capacite,
      ordre: r.ordre !== undefined && r.ordre !== null ? r.ordre : (r.Ordre !== undefined ? r.Ordre : null),
    }))));
  return tri;
}

const GENRES_ORGANISME = ['Accueillant', 'Partenaire'];

/**
 * Statuts déduits des capacités cochées (règle de Bruno, 08/10). Détection sur des radicaux sans accents :
 *   Écrire des cartes, Transporter / accompagner -> Porteur ; Proposer un lieu -> Partenaire ;
 *   Accueillir des Porteurs de chaleur -> Accueillant ;
 *   Lecture de cartes, Proposer ou animer une activité, Partager un talent -> Porteur, SAUF si « Accueillir » est coché (alors Accueillant).
 */
function statutsDepuisCapacites(labels) {
  const ls = asArr(labels).map(sansAccents);
  const a = (mot) => ls.some((l) => l.includes(mot));
  const accueille = a('accueillir');
  const out = new Set();
  if (a('ecrire') || a('transporter')) out.add('Porteur');
  if (a('lieu')) out.add('Partenaire');
  if (accueille) out.add('Accueillant');
  if (a('lecture') || a('activite') || a('talent')) out.add(accueille ? 'Accueillant' : 'Porteur');
  return Array.from(out);
}

/** Types d'organisme des deux genres : la page « Mon organisme » est commune aux deux rôles. */
function typesOrganisme(types) {
  return types.filter((t) => asArr(t.Genre).some((g) => GENRES_ORGANISME.some((x) => norm(x) === norm(g))));
}

/** Libellés des statuts du membre, pour filtrer les types d'organisme par Genre. */
async function statutsDuMembre(row) {
  const ids = idsOf(row && row.type);
  if (!ids.length) return { ids: [], labels: [] };
  const rows = (await wixData.query(COL_STATUTS).hasSome('_id', ids).limit(20).find({ suppressAuth: true })).items;
  return { ids, labels: rows.map((r) => r.statut).filter(Boolean) };
}

/**
 * Identifiant de l'organisation liée au membre SI ELLE EXISTE ENCORE, sinon null (08/10). `organisation_id` peut pointer vers une
 * organisation supprimée (constaté sur un compte de test : lien orphelin) : il ne faut alors ni parler d'organisation liée, ni refuser d'en créer une.
 */
async function organisationExistante(row) {
  const id = idsOf(row && row.organisation_id)[0];
  if (!id) return null;
  try {
    const o = (await wixData.query(COL_ORGS).eq('_id', id).limit(1).find({ suppressAuth: true })).items[0];
    return o ? id : null;
  } catch (e) { return null; }
}

/**
 * Jumelages EN COURS d'un porteur (08/10) : prénom + initiale, organisme, centres d'intérêt de chaque résident.
 * JAMAIS `infosimportantes` (données de santé) ni la chambre. Résidents inactifs écartés.
 */
async function jumelagesDuPorteur(porteurId) {
  const jums = (await wixData.query('Jumelages').eq('porteur', porteurId).hasSome('statut', ['propose', 'actif']).limit(200).find({ suppressAuth: true })).items;
  const resIds = [...new Set(jums.flatMap((j) => idsOf(j.resident)))];
  if (!resIds.length) return { encours: 0, liste: [] };
  const residents = (await wixData.query('Residents').hasSome('_id', resIds).limit(200).find({ suppressAuth: true })).items.filter((r) => r.actif !== false);
  const orgIds = [...new Set(residents.flatMap((r) => idsOf(r.organisation_id)))];
  const orgs = orgIds.length ? (await wixData.query(COL_ORGS).hasSome('_id', orgIds).limit(200).find({ suppressAuth: true })).items : [];
  const orgPar = new Map(orgs.map((o) => [o._id, o.nom || '']));
  const liste = residents.map((r) => ({
    nom: (`${r.prenom || ''} ${r.nom ? r.nom + '.' : ''}`.trim()) || '(sans nom)',
    organisme: orgPar.get(idsOf(r.organisation_id)[0]) || '',
    interets: clean(String(r.interets || '').replace(/\s+/g, ' '), 120),
  })).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  return { encours: liste.length, liste };
}

export const getMonProfil = webMethod(Permissions.SiteMember, async () => {
  const { email, row } = await ficheCourante();
  if (!email) return { existe: false };
  if (!row) return { existe: false };

  const statuts = await statutsDuMembre(row);
  const { caps, dispos, types } = await options(statuts.ids);

  // Une seule page « Mon organisme » sert Accueillants ET Partenaires : on propose les deux
  // genres de types, quels que soient les statuts du membre (il peut changer de rôle ici).
  // Repli si le champ Genre est vide ou mal orthographié en base : toute la liste plutôt que rien.
  const parGenre = typesOrganisme(types).map((t) => t.type).filter(Boolean);
  const typesPertinents = parGenre.length ? parGenre : types.map((t) => t.type).filter(Boolean);
  console.log('[LPC][Profil] types organisme :', typesPertinents.length,
    parGenre.length ? '(filtrés sur Genre)' : '(NON filtrés : aucun Genre reconnu)');

  // Capacités proposées à une organisation en CRÉATION : celles rattachées aux statuts Accueillant et Partenaire
  let capaciteOptionsOrganisme = [];
  try {
    const sts = (await wixData.query(COL_STATUTS).limit(50).find({ suppressAuth: true })).items
      .filter((s) => GENRES_ORGANISME.some((g) => norm(g) === norm(s.statut))).map((s) => s._id);
    if (sts.length) {
      const cs = (await wixData.query(COL_CAPACITES).hasSome('typesDeMembre', sts).limit(200).find({ suppressAuth: true })).items;
      capaciteOptionsOrganisme = parOrdre(cs, 'capacite').map((r) => r.capacite).filter(Boolean);
    }
  } catch (e) { console.warn('[LPC][Profil] capacités de l’organisation KO :', e && e.message); }

  const profil = {
    prenom: row.prenom || '',
    nom: row.nom || '',
    email: row.email || email,
    telephone: row.telephone || '',
    localite: row.localite || '',
    fonction: row.fonction || '',
    commentaire: row.commentaire || '',
    photoUrl: row.photo || '',
    statuts: statuts.labels,
    capacites: libelles(row.capacites, 'capacite'),
    disponibilites: libelles(row.disponibilites, 'disponibilite'),
    consentementPhoto: row.consentement_photo === true,
    consentementRgpd: row.consentement_rgpd === true,   // 08/10 : faux pour un compte créé par l'admin tant que la personne n'a pas confirmé
    nbResidentsMax: nbResidents(row.nbResidentsMax),
  };

  let organisation = null;
  const orgId = idsOf(row.organisation_id)[0];
  if (orgId) {
    const org = (await wixData.query(COL_ORGS).eq('_id', orgId).include('types', 'capacites')
      .limit(1).find({ suppressAuth: true })).items[0];
    if (org) {
      const labelsTypes = libelles(org.types, 'type');
      // Le type retenu doit figurer dans la liste proposée, sinon la liste déroulante
      // ne peut pas le sélectionner ; on l'y ajoute au besoin.
      const typeRetenu = labelsTypes.find((t) => typesPertinents.some((o) => norm(o) === norm(t)))
        || labelsTypes[0] || '';
      if (typeRetenu && !typesPertinents.some((o) => norm(o) === norm(typeRetenu))) {
        typesPertinents.push(typeRetenu);
        console.log('[LPC][Profil] type hors liste ajouté :', typeRetenu);
      }
      organisation = {
        nom: org.nom || '',
        localite: org.localite || '',
        adresse: org.adresse || '',   // 12/10 : adresse de l'organisation (champ `adresse`)
        type: typeRetenu,
        tousLesTypes: labelsTypes,
        capacites: libelles(org.capacites, 'capacite'),
        nombreDestinataires: org.nombre_destinataires == null ? '' : String(org.nombre_destinataires),
        commentaire: fromRichText(org.commentaire),
        logoUrl: typeof org.logo === 'string' ? org.logo : '',   // 12/10 : logo de l'organisation
        consentementLogo: org.consentement_logo === true,
      };
    }
  }

  let jumelages = { encours: 0, liste: [] };
  if (statuts.labels.some((l) => norm(l) === 'porteur')) {
    try { jumelages = await jumelagesDuPorteur(row._id); } catch (e) { console.warn('[LPC][Profil] jumelages du porteur KO :', e && e.message); }
  }

  return {
    existe: true,
    profil,
    organisation,
    jumelages,
    capaciteOptions: caps.map((r) => r.capacite).filter(Boolean),
    capaciteOptionsOrganisme,
    disponibiliteOptions: dispos.map((r) => r.disponibilite).filter(Boolean),
    typeOptions: typesPertinents,
  };
});

/**
 * payload = { prenom, nom, telephone, localite, fonction, commentaire,
 *             capacites: string[], disponibilites: string[],
 *             photoUrl?: string, photoW?, photoH?, supprimerPhoto?: boolean,
 *             consentementPhoto: boolean }
 *
 * nbResidentsMax (payload facultatif), règle harmonisée avec F1 le 30/09 :
 *  - `capacites` envoyé SANS « Écrire… » -> nombre EFFACÉ (option A, comme F1) ;
 *  - `capacites` envoyé AVEC « Écrire… » et un nombre valide (1 à 99) -> nombre ÉCRIT, remplaçant l'ancien ;
 *  - `capacites` avec « Écrire… » mais sans nombre valide -> valeur enregistrée conservée.
 *  (Avant le 30/09 : un nombre déjà enregistré était en lecture seule ici et la valeur envoyée ignorée.
 *   La page garde l'interrupteur NB_MODIFIABLE ; le serveur, lui, n'impose plus la lecture seule.)
 *
 * MISE À JOUR PARTIELLE : seules les clés présentes dans le payload sont écrites. La page
 * « Mon organisme » n'envoie que telephone et fonction ; sans cette règle, ses enregistrements
 * videraient les capacités et disponibilités saisies dans « Mon profil ».
 * Le formulaire générique n'envoie ni `fonction`, ni consentement RGPD, ni statut : ils restent intacts.
 * Les statuts et l'e-mail ne sont pas modifiables ici.
 */
export const enregistrerMonProfil = webMethod(Permissions.SiteMember, async (payload = {}) => {
  const { member, email, row } = await ficheCourante();
  if (!email) return { ok: false, reason: 'not-logged-in' };
  if (!row) return { ok: false, reason: 'fiche-absente' };

  const fourni = (k) => Object.prototype.hasOwnProperty.call(payload, k) && payload[k] !== undefined;

  const prenom = clean(payload.prenom, 80);
  const nom = clean(payload.nom, 80);
  const telephone = clean(payload.telephone, 40);
  const localite = clean(payload.localite, 120);
  const fonction = clean(payload.fonction, 120);
  const commentaire = clean(payload.commentaire, 2000);
  const photoUrl = clean(payload.photoUrl, 2000);
  const supprimerPhoto = payload.supprimerPhoto === true && !photoUrl;

  const p = { ...row };
  if (fourni('prenom')) p.prenom = prenom;
  if (fourni('nom')) p.nom = nom;
  if (fourni('telephone')) p.telephone = telephone;
  if (fourni('localite')) p.localite = localite;
  if (fourni('fonction')) p.fonction = fonction;
  if (fourni('commentaire')) p.commentaire = commentaire;
  if (fourni('consentementPhoto')) p.consentement_photo = payload.consentementPhoto === true;
  if (payload.consentementRgpd === true && row.consentement_rgpd !== true) p.consentement_rgpd = true;   // 08/10 : accord donné par la personne (jamais retiré ici)
  if (photoUrl) p.photo = photoUrl;
  else if (supprimerPhoto) p.photo = '';
  // « Écrire » décochée -> nombre effacé (option A). Mon-Organisme n'envoie pas `capacites` : intact.
  if (fourni('capacites') && !ecritDesCartes(payload.capacites)) p.nbResidentsMax = null;
  else if (fourni('capacites') && nbResidents(payload.nbResidentsMax) != null) {
    p.nbResidentsMax = nbResidents(payload.nbResidentsMax);   // modifiable comme dans F1 (30/09)
  }
  delete p.type; delete p.capacites; delete p.disponibilites;   // statuts intacts, refs via replaceReferences
  const rowId = (await wixData.update(COL_MEMBRES, p, { suppressAuth: true }))._id;

  let statutsFinaux = asArr(row.type).map((s) => s && s.statut).filter(Boolean);   // renvoyés à la page (redirection d'un Accueillant sans organisation)
  if (fourni('capacites')) {
    const capIds = await labelsToIds(COL_CAPACITES, 'capacite', payload.capacites);
    await wixData.replaceReferences(COL_MEMBRES, 'capacites', rowId, capIds, { suppressAuth: true });

    // Statuts déduits des capacités : ils s'AJOUTENT aux statuts existants, jamais retirés (règle des statuts)
    try {
      const voulus = statutsDepuisCapacites(payload.capacites);
      if (voulus.length) {
        const statutsRows = (await wixData.query(COL_STATUTS).limit(50).find({ suppressAuth: true })).items;
        const ajoutIds = voulus.map((v) => (statutsRows.find((x) => norm(x.statut) === norm(v)) || {})._id).filter(Boolean);
        const avant = idsOf(row.type);
        const final = Array.from(new Set([...avant, ...ajoutIds]));
        statutsFinaux = Array.from(new Set([...statutsFinaux, ...voulus]));
        if (final.length !== avant.length) {
          await wixData.replaceReferences(COL_MEMBRES, 'type', rowId, final, { suppressAuth: true });
          console.log('[LPC][Profil] statuts déduits des capacités :', voulus.join(', '), '| avant :', avant.length, '| après :', final.length);
        }
      }
    } catch (e) { console.warn('[LPC][Profil] statuts déduits KO :', e && (e.stack || e.message || e)); }
  }
  if (fourni('disponibilites')) {
    const dispoIds = await labelsToIds(COL_DISPONIBILITES, 'disponibilite', payload.disponibilites);
    await wixData.replaceReferences(COL_MEMBRES, 'disponibilites', rowId, dispoIds, { suppressAuth: true });
  }
  console.log('[LPC][Profil] fiche mise à jour', rowId, Object.keys(payload).join(','));

  // Push vers le membre Wix (contact + photo de profil)
  try {
    const cd = {};
    if (prenom) cd.firstName = prenom;
    if (nom) cd.lastName = nom;
    const tel164 = toE164(telephone);
    if (tel164) cd.phones = [tel164];
    if (fonction) cd.jobTitle = fonction;

    const upd = {};
    if (Object.keys(cd).length) upd.contactDetails = cd;

    const staticPhoto = toStaticImageUrl(photoUrl);
    if (staticPhoto) {
      upd.profile = {
        profilePhoto: {
          url: staticPhoto,
          width: Number(payload.photoW) > 0 ? Number(payload.photoW) : 400,
          height: Number(payload.photoH) > 0 ? Number(payload.photoH) : 400,
        },
      };
    } else if (supprimerPhoto) {
      upd.profile = { profilePhoto: null };
    }
    if (Object.keys(upd).length) await updateMember(member._id, upd);
  } catch (e) {
    console.warn('[LPC][Profil] updateMember KO:', e && (e.stack || e.message || e));
  }

  // `version` et `nbResidentsMax` renvoyés au navigateur : contrôle visible dans la console (26/09).
  return { ok: true, id: rowId, version: VERSION, nbResidentsMax: p.nbResidentsMax == null ? null : p.nbResidentsMax,
    statuts: statutsFinaux, organisation: Boolean(await organisationExistante(row)) };
});

/** Logo d'organisation (12/10) : { logoUrl, supprimerLogo, consentementLogo } ou { refus }. Seule une image Wix Media est acceptée ;
 *  un nouveau logo exige l'autorisation de l'utiliser. */
function lireLogo(payload) {
  const logoUrl = clean(payload.logoUrl, 2000);
  if (logoUrl && !/^wix:image:\/\/v1\//.test(logoUrl)) return { refus: 'logo-invalide' };
  if (logoUrl && payload.consentementLogo !== true) return { refus: 'consentement-logo-requis' };
  return {
    logoUrl,
    supprimerLogo: payload.supprimerLogo === true && !logoUrl,
    consentementLogo: typeof payload.consentementLogo === 'boolean' ? payload.consentementLogo : undefined,
  };
}
/** Applique le logo à la fiche : nouveau fichier (+ accord) ; retrait (accord à faux) ; sinon l'état de la case (le fichier est conservé). */
function appliquerLogo(fiche, l) {
  if (l.logoUrl) { fiche.logo = l.logoUrl; fiche.consentement_logo = true; }
  else if (l.supprimerLogo) { fiche.logo = ''; fiche.consentement_logo = false; }
  else if (fiche.logo && l.consentementLogo !== undefined) fiche.consentement_logo = l.consentementLogo;
}

/**
 * payload = { nom, type, adresse, nombreDestinataires, capacites: string[], commentaire, logoUrl?, supprimerLogo?, consentementLogo? }
 * Met à jour l'organisation DÉJÀ liée. Aucune création : sans organisation, renvoie
 * { ok:false, reason:'pas-d-organisation' } et la page invite à passer par F2 ou F3.
 */
export const enregistrerMonOrganisation = webMethod(Permissions.SiteMember, async (payload = {}) => {
  const { email, row } = await ficheCourante();
  if (!email) return { ok: false, reason: 'not-logged-in' };
  if (!row) return { ok: false, reason: 'fiche-absente' };

  const orgId = idsOf(row.organisation_id)[0];
  if (!orgId) return { ok: false, reason: 'pas-d-organisation' };

  const org = (await wixData.query(COL_ORGS).eq('_id', orgId).include('types', 'capacites')
    .limit(1).find({ suppressAuth: true })).items[0];
  if (!org) return { ok: false, reason: 'organisation-introuvable' };

  const nom = clean(payload.nom, 200);
  if (!nom) return { ok: false, reason: 'nom-requis' };
  const adresse = clean(payload.adresse, 300);   // 12/10 : adresse (la localité existante n'est plus touchée)
  const commentaire = clean(payload.commentaire, 4000);
  const nbRaw = parseInt(String(payload.nombreDestinataires ?? '').replace(/\s/g, ''), 10);
  const nombre = Number.isFinite(nbRaw) && nbRaw >= 0 ? nbRaw : null;

  const statuts = await statutsDuMembre(row);
  const { caps, types } = await options(statuts.ids);

  // Périmètre modifiable = les types des deux genres, comme la liste proposée à l'écran ;
  // sans quoi choisir un type de l'autre rôle ajouterait une valeur au lieu de la remplacer.
  const perimetreTypes = typesOrganisme(types).map((t) => t._id);
  const perimetreCaps = caps.map((r) => r._id);

  const typesAvant = idsOf(org.types);
  const capsAvant = idsOf(org.capacites);
  const typeIds = await labelsToIds(COL_ORG_TYPES, 'type', payload.type);
  const capIds = await labelsToIds(COL_CAPACITES, 'capacite', payload.capacites);

  const fusion = (avant, nouveaux, perimetre) =>
    Array.from(new Set([...asArr(avant).filter((id) => !perimetre.includes(id)), ...asArr(nouveaux)]));

  const logo = lireLogo(payload);
  if (logo.refus) return { ok: false, reason: logo.refus };

  const maj = { ...org };
  maj.nom = nom;
  maj.adresse = adresse;
  maj.commentaire = toRichText(commentaire);
  if (nombre != null) maj.nombre_destinataires = nombre;
  appliquerLogo(maj, logo);
  delete maj.types; delete maj.capacites;   // via replaceReferences
  await wixData.update(COL_ORGS, maj, { suppressAuth: true });

  await wixData.replaceReferences(COL_ORGS, 'types', orgId,
    fusion(typesAvant, typeIds, perimetreTypes), { suppressAuth: true });
  await wixData.replaceReferences(COL_ORGS, 'capacites', orgId,
    fusion(capsAvant, capIds, perimetreCaps), { suppressAuth: true });

  console.log('[LPC][Profil] organisation mise à jour', orgId);
  return { ok: true, id: orgId };
});

/**
 * payload = { nom, type, adresse, nombreDestinataires, capacites: string[], commentaire }   (06/10, décision de Bruno)
 * CRÉE l'organisation d'un membre qui n'en a pas (jamais de doublon : refus si une organisation est déjà liée) et la lie
 * (Membres.organisation_id). Le STATUT du membre découle du TYPE choisi : les statuts ajoutés sont ceux du champ Genre de la
 * ligne d'Organisations_Types (« Accueillant », « Partenaire » ou les deux). Ils s'AJOUTENT aux statuts existants (Porteur…).
 * Capacités de l'organisation : limitées à celles rattachées aux statuts ajoutés.
 */
export const creerMonOrganisation = webMethod(Permissions.SiteMember, async (payload = {}) => {
  const { email, row } = await ficheCourante();
  if (!email) return { ok: false, reason: 'not-logged-in' };
  if (!row) return { ok: false, reason: 'fiche-absente' };
  if (await organisationExistante(row)) return { ok: false, reason: 'deja-organisation' };   // lien orphelin (organisation supprimée) : création permise

  const nom = clean(payload.nom, 200);
  if (!nom) return { ok: false, reason: 'nom-requis' };
  const adresse = clean(payload.adresse, 300);
  const commentaire = clean(payload.commentaire, 4000);
  const nbRaw = parseInt(String(payload.nombreDestinataires ?? '').replace(/\s/g, ''), 10);
  const nombre = Number.isFinite(nbRaw) && nbRaw >= 0 ? nbRaw : null;

  // Type -> Genre(s) -> statut(s) à ajouter
  const typeRow = (await wixData.query(COL_ORG_TYPES).limit(200).find({ suppressAuth: true })).items
    .find((t) => norm(t.type) === norm(payload.type));
  if (!typeRow) return { ok: false, reason: 'type-requis' };
  const genres = asArr(typeRow.Genre).filter((g) => GENRES_ORGANISME.some((x) => norm(x) === norm(g)));
  if (!genres.length) return { ok: false, reason: 'type-sans-genre' };
  const statutsRows = (await wixData.query(COL_STATUTS).limit(50).find({ suppressAuth: true })).items;
  const statutsAjoutes = genres.map((g) => statutsRows.find((s) => norm(s.statut) === norm(g))).filter(Boolean);
  if (!statutsAjoutes.length) return { ok: false, reason: 'statut-introuvable' };
  const statutIdsAjoutes = statutsAjoutes.map((s) => s._id);

  // Capacités : uniquement celles du périmètre des statuts ajoutés
  const perimetreCaps = (await wixData.query(COL_CAPACITES).hasSome('typesDeMembre', statutIdsAjoutes).limit(200).find({ suppressAuth: true })).items.map((r) => r._id);
  const capIds = (await labelsToIds(COL_CAPACITES, 'capacite', payload.capacites)).filter((id) => perimetreCaps.includes(id));

  const logo = lireLogo(payload);   // 12/10 : logo à la création (accord exigé avec un fichier)
  if (logo.refus) return { ok: false, reason: logo.refus };

  const statutIdsAvant = idsOf(row.type);   // lus AVANT tout delete sur la copie
  const orgId = (await wixData.insert(COL_ORGS, {
    nom,
    adresse,
    pays: 'Belgique',
    ...(nombre == null ? {} : { nombre_destinataires: nombre }),
    commentaire: toRichText(commentaire),
    ...(logo.logoUrl ? { logo: logo.logoUrl, consentement_logo: true } : {}),
  }, { suppressAuth: true }))._id;
  await wixData.replaceReferences(COL_ORGS, 'types', orgId, [typeRow._id], { suppressAuth: true });
  await wixData.replaceReferences(COL_ORGS, 'capacites', orgId, capIds, { suppressAuth: true });

  const p = { ...row };
  p.organisation_id = orgId;
  delete p.type; delete p.capacites; delete p.disponibilites;   // références via replaceReferences, intactes
  const rowId = (await wixData.update(COL_MEMBRES, p, { suppressAuth: true }))._id;
  const statutsFinal = Array.from(new Set([...statutIdsAvant, ...statutIdsAjoutes]));
  await wixData.replaceReferences(COL_MEMBRES, 'type', rowId, statutsFinal, { suppressAuth: true });
  console.log('[LPC][Profil] organisation créée', orgId, '| type :', typeRow.type, '| statuts ajoutés :', statutsAjoutes.map((s) => s.statut).join(', '));

  // Homonyme (même nom + même localité) : signalé à l’équipe, pas de fusion automatique
  let homonyme = false;
  try {
    const cands = (await wixData.query(COL_ORGS).contains('nom', nom).ne('_id', orgId).limit(50).find({ suppressAuth: true })).items;
    homonyme = cands.some((o) => norm(o.nom) === norm(nom) && norm(o.adresse) === norm(adresse));
  } catch (e) { /* signalement facultatif */ }
  try {
    await notifyNewSubmission({
      formName: 'Création d’une organisation (Mon profil)',
      prenom: row.prenom || '', nom: row.nom || '', email, telephone: row.telephone || '', localite: adresse,
      extra1: 'Organisme : ' + nom + ' (' + typeRow.type + (adresse ? ', ' + adresse : '') + ') · statut(s) ajouté(s) : ' + statutsAjoutes.map((s) => s.statut).join(', ')
        + (homonyme ? ' ⚠️ organisation du même nom déjà présente' : ''),
      extra2: nombre != null ? 'Personnes concernées : ' + nombre : '',
      extra3: commentaire ? 'Message : ' + commentaire : '',
      ficheUrl: 'https://www.wix.com/dashboard/' + SITE_ID + '/database/data/' + COL_ORGS + '/' + orgId,
    });
  } catch (e) { console.warn('[LPC][Profil] notifyNewSubmission KO :', e && (e.message || e)); }

  return { ok: true, id: orgId, version: VERSION, statuts: statutsAjoutes.map((s) => s.statut) };
});
