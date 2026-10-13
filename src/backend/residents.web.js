import { Permissions, webMethod } from 'wix-web-module';
import wixData from 'wix-data';
import { currentMember } from 'wix-members-backend';

/*
 *  backend/residents.web.js — page « Mes résidents » (/mes-residents), version 2026-10-06-a
 *    getMesResidents()               organisation liée + résidents de cette organisation
 *    enregistrerMesResidents(p)      crée / met à jour les résidents de l'organisation liée
 *
 *  Règles :
 *   - réservé aux membres ayant une organisation liée ET étant Accueillant : statut « Accueillant »
 *     dans Membres.type, OU organisation dont un type a le Genre « Accueillant » (26/09 : un compte
 *     lié à une « Institution de soins ou d'hébergement » était refusé faute du statut membre)
 *     (Membres.organisation_id, une seule par membre) ; l'organisation n'est jamais créée ici
 *   - un résident n'est modifiable que s'il appartient à CETTE organisation (contrôle serveur :
 *     un identifiant envoyé par le navigateur n'est jamais cru sur parole)
 *   - aucune suppression : un résident qui ne reçoit plus de cartes passe `actif = false`
 *     (les Jumelages le référencent)
 *   - `nom` ne contient que l'INITIALE (2 caractères max) ; `prenom` est requis
 *   - `infosimportantes` (texte libre, 06/10, remplace d'anciennes cases de santé, supprimées) : peut contenir des données de santé, lu et écrit ici pour l'institution qui l'a saisi, jamais
 *     renvoyé à un Porteur. Aucune autre web method ne doit l'exposer à un Porteur
 *   - l'accord (`accordResidents`) est exigé à chaque enregistrement ; il est tracé dans
 *     `Residents.consentement_rgpd` sur chaque ligne enregistrée ; getMesResidents renvoie
 *     `accord: true` dès qu'un résident de l'organisation le porte (case pré-cochée, 26/09)
 */

const VERSION = '2026-10-06-b';
const COL_MEMBRES = 'Membres';
const COL_ORGS = 'Organisations';
const COL_RESIDENTS = 'Residents';
const COL_STATUTS = 'Membres_Statuts';
const COL_ORG_TYPES = 'Organisations_Types';
const STATUT_ACCUEILLANT = 'Accueillant';
const MAX_RESIDENTS = 200;

const clean = (s, m = 2000) => (typeof s === 'string' ? s.trim().slice(0, m) : '');
const asArr = (x) => (Array.isArray(x) ? x : x == null || x === '' ? [] : [x]);
const idsOf = (r) => asArr(r).map((x) => (typeof x === 'string' ? x : x && x._id)).filter(Boolean);
const norm = (s) => clean(String(s || ''), 300).toLowerCase().replace(/\s+/g, ' ').trim();

/** Initiale : 2 caractères au plus, sans point final ajouté par l'utilisateur. */
const initiale = (s) => clean(String(s || '').replace(/\./g, ''), 2).toUpperCase();

/** Fiche Membres du membre connecté + son organisation + son statut Accueillant. */
async function contexte() {
  const member = await currentMember.getMember({ fieldsets: ['FULL'] });
  const email = member ? (member.loginEmail || '').toLowerCase() : '';
  if (!email) return { raison: 'not-logged-in' };
  const row = (await wixData.query(COL_MEMBRES).eq('email', email).include('type')
    .limit(1).find({ suppressAuth: true })).items[0];
  if (!row) return { raison: 'fiche-absente' };

  const orgId = idsOf(row.organisation_id)[0];
  const org = orgId
    ? (await wixData.query(COL_ORGS).eq('_id', orgId).include('types').limit(1).find({ suppressAuth: true })).items[0]
    : null;

  const statutIds = idsOf(row.type);
  const statuts = statutIds.length
    ? (await wixData.query(COL_STATUTS).hasSome('_id', statutIds).limit(20).find({ suppressAuth: true })).items
    : [];
  let estAccueillant = statuts.some((s) => norm(s.statut) === norm(STATUT_ACCUEILLANT));

  if (!estAccueillant && org) {
    const typeIds = idsOf(org.types);
    const types = typeIds.length
      ? (await wixData.query(COL_ORG_TYPES).hasSome('_id', typeIds).limit(20).find({ suppressAuth: true })).items
      : [];
    estAccueillant = types.some((t) => asArr(t.Genre).some((g) => norm(g) === norm(STATUT_ACCUEILLANT)));
  }

  if (!orgId) return { raison: 'pas-d-organisation', row };
  if (!org) return { raison: 'organisation-introuvable', row };
  if (!estAccueillant) {
    console.log('[LPC][Residents] refus : statuts', statuts.map((x) => x.statut), '| types org', idsOf(org.types));
    return { raison: 'pas-accueillant', row };
  }

  return { row, org };
}

/** Résidents de l'organisation, les actifs d'abord, puis par prénom. */
async function residentsDe(orgId) {
  const res = await wixData.query(COL_RESIDENTS).eq('organisation_id', orgId)
    .limit(MAX_RESIDENTS).find({ suppressAuth: true });
  return res.items.sort((a, b) =>
    Number(b.actif !== false) - Number(a.actif !== false)
    || String(a.prenom || '').localeCompare(String(b.prenom || ''), 'fr'));
}

/**
 * Jumelages en cours (proposés ou actifs) des résidents donnés : Map résident -> identifiant du porteur. Sert à interdire la
 * suppression d'un résident jumelé et à afficher « Prénom I. » du porteur à l'institution (06/10, demande de Bruno).
 */
async function jumelagesDe(residentIds) {
  const rows = (await wixData.query('Jumelages').hasSome('statut', ['propose', 'actif']).limit(1000).find({ suppressAuth: true })).items;
  const par = new Map();
  rows.forEach((j) => {
    const pid = idsOf(j.porteur)[0];
    idsOf(j.resident).forEach((rid) => { if (residentIds.has(rid) && !par.has(rid)) par.set(rid, pid || ''); });
  });
  return par;
}

/** « Prénom I. » (prénom + première lettre du nom de famille) de chaque porteur : Map identifiant du porteur -> libellé. */
async function nomsDesPorteurs(porteurIds) {
  const ids = [...new Set([...porteurIds].filter(Boolean))];
  if (!ids.length) return new Map();
  const rows = (await wixData.query(COL_MEMBRES).hasSome('_id', ids).limit(1000).find({ suppressAuth: true })).items;
  return new Map(rows.map((m) => {
    const ini = clean(m.nom, 80).charAt(0).toUpperCase();
    return [m._id, (clean(m.prenom, 80) + (ini ? ' ' + ini + '.' : '')).trim() || 'Un porteur'];
  }));
}

const versNavigateur = (r, jumele, porteur) => ({
  _id: r._id,
  prenom: r.prenom || '',
  initiale: r.nom || '',
  chambre: r.numero_chambre || '',
  interets: r.interets || '',
  infos: r.infosimportantes || '',
  actif: r.actif !== false,
  jumele: jumele === true,
  porteur: porteur || '',
});

export const getMesResidents = webMethod(Permissions.SiteMember, async () => {
  const ctx = await contexte();
  if (!ctx.org) {
    console.log('[LPC][Residents] accès refusé :', ctx.raison);
    return { ok: false, reason: ctx.raison, version: VERSION };
  }
  const residents = await residentsDe(ctx.org._id);
  const jum = await jumelagesDe(new Set(residents.map((r) => r._id)));
  const noms = await nomsDesPorteurs(jum.values());
  console.log('[LPC][Residents] lecture', ctx.org._id, residents.length, 'résident(s)');
  return {
    ok: true,
    version: VERSION,
    organisation: { nom: ctx.org.nom || '' },
    accord: residents.some((r) => r.consentement_rgpd === true),
    residents: residents.map((r) => versNavigateur(r, jum.has(r._id), noms.get(jum.get(r._id)) || (jum.has(r._id) ? 'Un porteur' : ''))),
  };
});

/**
 * payload = { accord: boolean,
 *             residents: [{ _id?: string, prenom, initiale, chambre, interets, infos, actif: boolean }] }
 * Seules les lignes envoyées sont traitées : les autres résidents de l'organisation restent intacts.
 * `_id` absent ou inconnu de l'organisation -> nouvelle ligne. Une ligne NOUVELLE sans prénom est
 * ignorée (ligne ajoutée puis laissée vide) ; une ligne EXISTANTE sans prénom est refusée.
 */
export const enregistrerMesResidents = webMethod(Permissions.SiteMember, async (payload = {}) => {
  const ctx = await contexte();
  if (!ctx.org) return { ok: false, reason: ctx.raison, version: VERSION };
  if (payload.accord !== true) return { ok: false, reason: 'accord-requis', version: VERSION };

  const lignes = asArr(payload.residents).slice(0, MAX_RESIDENTS);
  const orgId = ctx.org._id;
  const existants = new Map((await residentsDe(orgId)).map((r) => [r._id, r]));
  const jumeles = await jumelagesDe(new Set(existants.keys()));

  const aCreer = [];
  const aMettreAJour = [];
  for (const l of lignes) {
    const prenom = clean(l && l.prenom, 80);
    const avant = l && l._id ? existants.get(l._id) : null;
    if (!prenom) {
      if (avant) return { ok: false, reason: 'prenom-requis', version: VERSION };
      continue;
    }
    const valeurs = {
      prenom,
      nom: initiale(l.initiale),
      numero_chambre: clean(l.chambre, 5),
      interets: clean(l.interets, 2000),
      infosimportantes: clean(l.infos, 2000),
      actif: l.actif !== false,
      consentement_rgpd: true,
    };
    if (avant && valeurs.actif === false && avant.actif !== false && jumeles.has(avant._id)) return { ok: false, reason: 'jumele', version: VERSION };   // un résident jumelé ne se supprime pas
    if (avant) aMettreAJour.push({ ...avant, ...valeurs });
    else aCreer.push({ ...valeurs, organisation_id: orgId });
  }

  if (aMettreAJour.length) await wixData.bulkUpdate(COL_RESIDENTS, aMettreAJour, { suppressAuth: true });
  if (aCreer.length) await wixData.bulkInsert(COL_RESIDENTS, aCreer, { suppressAuth: true });

  console.log('[LPC][Residents] enregistrement', orgId,
    '| créés :', aCreer.length, '| mis à jour :', aMettreAJour.length);
  return { ok: true, version: VERSION, crees: aCreer.length, misAJour: aMettreAJour.length };
});
