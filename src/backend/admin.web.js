import { Permissions, webMethod } from 'wix-web-module';
import wixData from 'wix-data';
import { members, authorization } from 'wix-members-backend';
import { members as membersV2 } from 'wix-members.v2';
import { contacts } from 'wix-crm-backend';
import { elevate } from 'wix-auth';
import { exigerAdmin, journaliser, estAdminSilencieux } from 'backend/lpc-acces';

const updateMember = elevate(members.updateMember);   // « Manage Members »
const getMemberWix = elevate(members.getMember);
const createMemberWix = elevate(membersV2.createMember);   // création d'un compte Wix par l'admin (07/10)
const assignRole = elevate(authorization.assignRole);
const queryMembersWix = elevate(membersV2.queryMembers);   // comptes Wix sans fiche LPC (07/10)   // lecture du compte Wix du membre visé (contrôle de la photo)

/*
 *  backend/admin.web.js — back-office, page /admin (listes filtrables et export) + ouverture de fiche.
 *  version du code : 2026-10-07-b
 *    (07/10 b : comptes Wix SANS fiche LPC listés dans l'onglet Membres (statut « Non validé », filtre) ; adminValiderMembreWix = « Valider » : crée la fiche liée au compte Wix)
 *    (07/10 : adminCreationOptions + adminCreerMembre = création d'un membre par l'admin : compte Wix sans mot de passe, fiche Membres, statut choisi, consentement RGPD confirmé par l'admin)
 *    (06/10 suite : champ CMS `infosimportantes` ; listes /admin et /adminjumelages : colonnes indicateur A / indicateur B remplacées par « Infos importantes », filtres retirés)
 *    (06/10 : résidents = champ texte `infosimportantes` à la place des cases indicateur_a / indicateur_b, qui ne sont plus écrites)
 *    (03/10 : adminEnregistrerMembre gère la PHOTO : ajout, remplacement, retrait, avec vérification du compte Wix)
 *    adminEmailPorteurCourant({ ticket })        page /adminprofil (04/10) : même e-mail, porteur = celui du ticket « membres » (aucun identifiant côté page)
 *    adminEmailPorteur({ resident | porteur })   page /adminjumelages (bouton de LIGNE, 04/10) : e-mail de jumelage d'un porteur dont le quota est rempli (brouillon, rien n'est envoyé), JOURNALISÉ
 *    adminJumelageDonnees({ porteur })           page /adminjumelages : porteurs, résidents et actions possibles, JOURNALISÉ
 *    adminJumeler({ ticket, porteur, resident }) crée un jumelage « actif » (un seul porteur par résident), JOURNALISÉ
 *    adminAnnulerJumelage({ ticket, resident })  passe le jumelage du résident à « annule » (ligne conservée), JOURNALISÉ
 *    adminResidentsCourants()                    page /adminresidents : organisme du ticket + ses résidents actifs (jumelés signalés), JOURNALISÉ
 *    adminEnregistrerResidents({ ticket, residents })  crée / modifie / désactive les résidents de l'organisme, JOURNALISÉ
 *    adminOuvrirResidentsOrganisme({ ticket })   depuis /adminorganisme : ticket « gestion-residents »
 *    adminOuvrirOrganismeDepuisResidents({ ticket })  depuis /adminresidents : ticket « organismes » (nom de l'organisme cliquable)
 *    adminOuvrirOrganismeDuResident({ resident })     depuis /adminjumelages (06/10) : ticket « organismes » de l'organisme du résident (colonne Institution)
 *    adminOuvrirResidentsDuResident({ resident })     depuis /adminjumelages (06/10) : ticket « gestion-residents » de l'organisme du résident (colonne Résident)
 *    adminOuvrirJumelageDuResident({ resident })      depuis /admin, onglet Résidents (06/10) : ticket « residents » sur le PORTEUR jumelé du résident (repli : le résident)
 *    adminOuvrirDepuisOrganisme({ organisme, cible }) depuis /admin, onglet Organismes (06/10) : cible = « contact » (fiche du contact), « jumelage » (/adminjumelages de l'organisme) ou « residents » (/adminresidents)
 *    adminOuvrirResidents({ origine, ticket })   ticket « residents » depuis /adminorganisme ou /adminprofil
 *    adminListe({ onglet, recherche, filtre })   lignes + options de filtre d'un onglet
 *    adminExport({ onglet, recherche, filtre })  CSV (+ e-mails pour les membres), JOURNALISÉ
 *    adminOuvrirFiche({ onglet, id })            crée un TICKET serveur pour la fiche choisie (membres ou organismes)
 *    adminFicheCourante()                        renvoie le MEMBRE du ticket + options (page /adminprofil), JOURNALISÉ
 *    adminEnregistrerMembre(payload)             écrit le membre visé par le ticket, JOURNALISÉ
 *    adminOrganismeCourant()                     renvoie l'ORGANISME du ticket + options (page /adminorganisme), JOURNALISÉ
 *    adminEnregistrerOrganisme(payload)          écrit l'organisme visé par le ticket, JOURNALISÉ
 *    adminOuvrirMembreRattache({ ticket, rang }) depuis /adminorganisme : ticket « membres » pour un membre rattaché
 *    adminOuvrirOrganismeDuMembre({ ticket })    depuis /adminprofil : ticket « organismes » pour l'organisme du membre
 *
 *  TICKET (Bruno, 27/09 : jamais d'identifiant de fiche dans l'URL) : ligne de la collection `Tickets_Admin`
 *  (droits Admin partout) { title, adminId, entite, cibleId, expire }. Son `_id` sert de jeton. Il est lié à
 *  l'administrateur qui l'a créé et expire au bout de DUREE_TICKET_MS ; l'identifiant de la fiche ne quitte
 *  jamais le serveur. Un nouveau ticket remplace les précédents du même administrateur POUR LA MÊME ENTITÉ
 *  (un admin peut avoir un ticket « membres » et un ticket « organismes » en même temps).
 *
 *  SÉCURITÉ
 *   - Permissions.SiteMember : Wix refuse déjà tout visiteur non connecté. Le vrai contrôle est
 *     exigerAdmin() (backend/lpc-acces.js), appelé EN PREMIER dans chaque méthode.
 *     (Permissions.Admin est inutilisable : Wix n'y reconnaît pas les co-propriétaires.)
 *   - suppressAuth seulement APRÈS exigerAdmin().
 *   - Paramètres du navigateur jamais crus : onglet sur liste fermée, textes tronqués.
 *   - Données minimales : `Residents.indicateur_a` n'est JAMAIS renvoyé par les listes.
 */

const VERSION = '2026-10-08-b';
const CAMPAGNE = 'Noël 2026';   // valeur de Jumelages.campagne pour les jumelages créés maintenant (⚠️ à confirmer par Bruno)
const COL_TICKETS = 'Tickets_Admin';
const DUREE_TICKET_MS = 2 * 60 * 60 * 1000;
const ONGLETS = ['membres', 'organismes', 'residents'];
const TOUS = '';
const LIMITE = 1000;

// Un refus n'est PAS lancé vers le navigateur : Wix masque le message des erreurs (« Unable to handle the
// request »), la page ne pourrait pas le reconnaître. Un refus est donc renvoyé comme { ok: false, refuse: true }.
const REFUSE = { ok: false, refuse: true };
const estRefus = (e) => !!(e && String(e.message).includes('acces-refuse'));

// Dates système Wix (_createdDate / _updatedDate) au format AAAA-MM-JJ : triable comme du texte.
const jour = (d) => { try { return d ? new Date(d).toISOString().slice(0, 10) : ''; } catch (e) { return ''; } };
const dates = (r) => ({ cree: jour(r._createdDate), modifie: jour(r._updatedDate) });

const clean = (s, m = 200) => (typeof s === 'string' ? s.trim().slice(0, m) : '');
const asArr = (x) => (Array.isArray(x) ? x : x == null || x === '' ? [] : [x]);
const idsOf = (r) => asArr(r).map((x) => (typeof x === 'string' ? x : x && x._id)).filter(Boolean);
const sansAccents = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const ecrit = (caps) => asArr(caps).some((c) => c && sansAccents(c.capacite).includes('ecrire'));

async function tout(col, ...refs) {
  let q = wixData.query(col).limit(LIMITE);
  if (refs.length) q = q.include(...refs);
  return (await q.find({ suppressAuth: true })).items;
}

/** Jumelages en cours (proposés ou actifs), comptés par porteur et par résident. */
async function jumelagesEnCours() {
  const rows = (await wixData.query('Jumelages').hasSome('statut', ['propose', 'actif'])
    .limit(LIMITE).find({ suppressAuth: true })).items;
  const parPorteur = new Map();
  const parResident = new Map();
  const porteurDe = new Map();   // résident -> identifiant du porteur (un seul par résident)
  rows.forEach((j) => {
    idsOf(j.porteur).forEach((id) => parPorteur.set(id, (parPorteur.get(id) || 0) + 1));
    idsOf(j.resident).forEach((id) => { parResident.set(id, (parResident.get(id) || 0) + 1); if (!porteurDe.has(id)) porteurDe.set(id, idsOf(j.porteur)[0] || ''); });
  });
  return { parPorteur, parResident, porteurDe };
}

/** Résidents ACTIFS d'un organisme : total, jumelés (au moins un jumelage en cours) et non jumelés (disponibles). */
function statsResidents(orgId, residents, parResident) {
  const actifs = residents.filter((r) => r.actif !== false && idsOf(r.organisation_id).includes(orgId));
  const jumeles = actifs.filter((r) => (parResident.get(r._id) || 0) > 0).length;
  const jumelages = actifs.reduce((n, r) => n + (parResident.get(r._id) || 0), 0);
  return { total: actifs.length, jumeles, disponibles: actifs.length - jumeles, jumelages };
}
/** « 5 (2 / 3) » = 5 résidents actifs, 2 non jumelés, 3 jumelés. */
const texteResidents = (s) => `${s.jumeles} / ${s.total}`;   // « 5 / 5 » = 5 jumelés sur 5 résidents actifs (Bruno, 02/10)

// ─── construction des lignes, une fonction par onglet ────────────────────
// Chaque ligne porte `_id`, les colonnes affichées et `filtres` (valeurs testées par le filtre).

/** Comptes Wix qui n'ont PAS de fiche `Membres` (ex. code d'activation jamais saisi : members-sync n'a jamais tourné). 100 maximum par appel Wix. */
async function comptesWixSansFiche(membres) {
  try {
    const ids = new Set(membres.map((m) => m.wixMemberId).filter(Boolean));
    const emails = new Set(membres.map((m) => String(m.email || '').toLowerCase()).filter(Boolean));
    const res = await queryMembersWix({ fieldsets: ['FULL'] }).limit(100).find();
    const items = res.items || res._items || [];
    if ((res.totalCount || res._totalCount || 0) > items.length) console.warn('[LPC][Admin] comptes Wix : liste tronquée à ' + items.length);
    return items
      .filter((m) => m && m._id && m.status !== 'BLOCKED' && !ids.has(m._id) && !emails.has(String(m.loginEmail || '').toLowerCase()))
      .map((m) => {
        const c = m.contact || m.contactDetails || {};
        const tel = asArr(c.phones).map((p) => (p && (p.phone || p)) || '').find(Boolean) || '';
        return {
          _id: 'wix:' + m._id,
          nom: `${c.firstName || ''} ${c.lastName || ''}`.trim() || m.loginEmail || '(sans nom)',   // 08/10 : sans prénom ni nom, l'e-mail (lien mailto) sert de nom
          email: m.loginEmail || '',
          telephone: String(tel),
          localite: '',
          statuts: 'Non validé',
          organisation: '',
          cartes: '',
          ...dates(m),
          _jum: 0,
          nonValide: true,
          filtres: ['Non validé'],
        };
      });
  } catch (e) {
    console.warn('[LPC][Admin] comptes Wix sans fiche : requête KO (queryMembers avec elevate ?) :', e && (e.message || e));
    return [];
  }
}

async function lignesMembres() {
  const [membres, orgs, j] = await Promise.all([
    tout('Membres', 'type', 'capacites'), tout('Organisations'), jumelagesEnCours(),
  ]);
  const nomOrg = new Map(orgs.map((o) => [o._id, o.nom || '']));
  const lignes = membres.map((m) => {
    const statuts = asArr(m.type).map((s) => s && s.statut).filter(Boolean);
    const cartes = ecrit(m.capacites);
    const max = Number(m.nbResidentsMax) || 0;
    const encours = j.parPorteur.get(m._id) || 0;
    return {
      _id: m._id,
      nom: `${m.prenom || ''} ${m.nom || ''}`.trim() || m.email || '(sans nom)',   // 08/10 : sans prénom ni nom, l'e-mail (lien mailto) sert de nom
      email: m.email || '',
      telephone: m.telephone || '',
      localite: m.localite || '',
      statuts: statuts.join(', '),
      organisation: nomOrg.get(idsOf(m.organisation_id)[0]) || '',
      cartes: cartes ? `${encours} / ${max || '?'}` : '',
      ...dates(m),
      _jum: encours,
      filtres: [...statuts, cartes ? 'Écrit des cartes' : '', cartes && encours < max ? 'Non jumelés' : ''].filter(Boolean),
    };
  });
  const nonValides = await comptesWixSansFiche(membres);
  return { lignes: [...lignes, ...nonValides], options: ['Porteur', 'Accueillant', 'Partenaire', 'Écrit des cartes', 'Non jumelés', 'Non validé'] };
}

async function lignesOrganismes() {
  const [orgs, membres, residents, j] = await Promise.all([
    tout('Organisations', 'types'), tout('Membres'), tout('Residents'), jumelagesEnCours(),
  ]);
  const compte = (rows) => {
    const m = new Map();
    rows.forEach((r) => idsOf(r.organisation_id).forEach((id) => m.set(id, (m.get(id) || 0) + 1)));
    return m;
  };
  const nbMembres = compte(membres);
  // Contact = premier membre rattaché (même ordre que membresRattaches : nom affiché, puis identifiant)
  const parOrg = new Map();
  membres.forEach((m) => idsOf(m.organisation_id).forEach((id) => { if (!parOrg.has(id)) parOrg.set(id, []); parOrg.get(id).push(m); }));
  const contactDe = (id) => {
    const l = (parOrg.get(id) || []).slice().sort((a, b) => nomAffiche(a).localeCompare(nomAffiche(b), 'fr') || String(a._id).localeCompare(String(b._id)));
    return l.length ? nomAffiche(l[0]) : '';
  };
  const typesVus = new Set();
  const lignes = orgs.map((o) => {
    const types = asArr(o.types).filter(Boolean);
    const libelles = types.map((t) => t.type).filter(Boolean);
    const genres = Array.from(new Set(types.flatMap((t) => asArr(t.Genre)).filter(Boolean)));
    libelles.forEach((t) => typesVus.add(t));
    const sr = statsResidents(o._id, residents, j.parResident);
    return {
      _id: o._id,
      nom: o.nom || '(sans nom)',
      types: libelles.join(', '),
      genres: genres.join(', '),
      localite: o.localite || '',
      contact: contactDe(o._id),
      membres: String(nbMembres.get(o._id) || 0),
      jumeles: String(sr.jumeles),      // résidents jumelés (lien : /adminjumelages de l'organisme)
      actifs: String(sr.total),         // résidents actifs (lien : /adminresidents de l'organisme)
      ...dates(o),
      _jum: sr.jumelages,
      filtres: [...genres, ...libelles],
    };
  });
  return { lignes, options: ['Accueillant', 'Partenaire', ...Array.from(typesVus).sort((a, b) => a.localeCompare(b, 'fr'))] };
}

async function lignesResidents() {
  const [residents, orgs, membres, j] = await Promise.all([tout('Residents'), tout('Organisations'), tout('Membres'), jumelagesEnCours()]);
  const nomOrg = new Map(orgs.map((o) => [o._id, o.nom || '']));
  const nomMembre = new Map(membres.map((m) => [m._id, `${m.prenom || ''} ${m.nom || ''}`.trim() || '(sans nom)']));
  const institutions = new Set();
  // Résidents INACTIFS (désactivés) : écartés de la liste (Bruno, 04/10 : « ils ne doivent apparaître nulle part »)
  const lignes = residents.filter((r) => r.actif !== false).map((r) => {
    const inst = nomOrg.get(idsOf(r.organisation_id)[0]) || '';
    if (inst) institutions.add(inst);
    const jumeles = j.parResident.get(r._id) || 0;
    return {
      _id: r._id,
      nom: `${r.prenom || ''} ${r.nom ? r.nom + '.' : ''}`.trim(),
      institution: inst,
      chambre: r.numero_chambre || '',
      infosimportantes: String(r.infosimportantes || '').slice(0, 300),
      interets: String(r.interets || '').slice(0, 300),
      ...dates(r),
      jumelage: jumeles ? (nomMembre.get(j.porteurDe.get(r._id)) || 'Jumelé') : '',   // nom du porteur (dernière colonne)
      _jum: jumeles,
      filtres: [inst, jumeles ? 'Jumelés' : 'Sans porteur'].filter(Boolean),
    };
  });
  return {
    lignes,
    options: ['Sans porteur', 'Jumelés', ...Array.from(institutions).sort((a, b) => a.localeCompare(b, 'fr'))],
  };
}

const CONSTRUIRE = { membres: lignesMembres, organismes: lignesOrganismes, residents: lignesResidents };

async function lignesFiltrees(params = {}) {
  const onglet = ONGLETS.includes(params.onglet) ? params.onglet : 'membres';
  const q = sansAccents(clean(params.recherche, 100));
  const filtre = sansAccents(clean(params.filtre, 200));
  const { lignes, options } = await CONSTRUIRE[onglet]();
  const gardees = lignes.filter((l) => {
    if (filtre !== TOUS && !l.filtres.some((f) => sansAccents(f) === filtre)) return false;
    if (!q) return true;
    const meule = sansAccents(Object.entries(l).filter(([k]) => k !== '_id' && k !== '_jum' && k !== 'filtres' && k !== 'cree' && k !== 'modifie' && k !== 'nonValide').map(([, v]) => v).join(' '));
    return q.split(/\s+/).every((mot) => meule.includes(mot));
  });
  gardees.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  // Totaux de la liste filtrée : nombre de jumelages en cours (affiché « X membres et Y jumelages »)
  const jumelages = gardees.reduce((n, l) => n + (l._jum || 0), 0);
  return { onglet, options, totaux: { jumelages }, lignes: gardees.map(({ filtres, _jum, ...reste }) => reste) };
}

/** Vrai/faux pour l'affichage du lien « Admin » : aucune donnée, aucun journal. */
export const estAdmin = webMethod(Permissions.SiteMember, async () => estAdminSilencieux());

export const adminListe = webMethod(Permissions.SiteMember, async (params = {}) => {
  try { await exigerAdmin('liste'); } catch (e) { if (estRefus(e)) return REFUSE; throw e; }
  const res = await lignesFiltrees(params);
  return { ok: true, version: VERSION, ...res };
});

const csvCell = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;

export const adminExport = webMethod(Permissions.SiteMember, async (params = {}) => {
  let admin;
  try { admin = await exigerAdmin('export'); } catch (e) { if (estRefus(e)) return REFUSE; throw e; }
  const { onglet, lignes } = await lignesFiltrees(params);
  const cles = lignes.length ? Object.keys(lignes[0]).filter((k) => k !== '_id' && k !== 'nonValide') : [];
  const csv = [cles.map(csvCell).join(';'), ...lignes.map((l) => cles.map((k) => csvCell(l[k])).join(';'))].join('\n');
  const emails = onglet === 'membres' ? lignes.map((l) => l.email).filter(Boolean).join('; ') : '';
  // Un export = une extraction de données personnelles : toujours tracé.
  await journaliser(admin, 'export:' + onglet, '', `${lignes.length} ligne(s) · filtre ${JSON.stringify({
    recherche: clean(params.recherche, 100), filtre: clean(params.filtre, 200) })}`);
  return { ok: true, version: VERSION, nombre: lignes.length, csv, emails };
});

// ─── ouverture d'une fiche membre en mode admin (ticket serveur) ─────────

const ecritDesCartes = (labels) => asArr(labels).some((l) => sansAccents(l).includes('ecrire'));
const norm = (s) => clean(String(s || ''), 300).toLowerCase().replace(/…/g, '...').replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();

function nbResidents(v) {
  const n = parseInt(String(v == null ? '' : v).trim(), 10);
  return Number.isInteger(n) && n >= 1 && n <= 99 ? n : null;
}

/** Même tri que les autres backends : colonne « Ordre » du CMS, lignes sans numéro en fin de liste. */
function parOrdre(rows, champ) {
  const num = (r) => {
    const v = r ? (r.ordre !== undefined && r.ordre !== null ? r.ordre : r.Ordre) : null;
    const n = Number(v);
    return Number.isFinite(n) ? n : Infinity;
  };
  return [...asArr(rows)].sort((a, b) =>
    num(a) - num(b) || String(a[champ] || '').localeCompare(String(b[champ] || ''), 'fr'));
}

function toE164(raw) {
  if (typeof raw !== 'string') return null;
  let s = raw.replace(/[\s.\-()/]/g, '');
  if (/^\+\d{8,15}$/.test(s)) return s;
  if (s.startsWith('00')) s = '+' + s.slice(2);
  else if (s.startsWith('0')) s = '+32' + s.slice(1);
  else if (/^\d{8,9}$/.test(s)) s = '+32' + s;
  return /^\+\d{8,15}$/.test(s) ? s : null;
}

/** URI Wix Media (wix:image://v1/<id>/…) ou URL statique -> URL statique, seule forme acceptée par updateMember pour la photo. */
function toStaticImageUrl(uri) {
  const s = clean(uri, 2000);
  if (!s) return '';
  if (s.startsWith('https://static.wixstatic.com/')) return s.split('#')[0];
  const m = s.match(/^wix:image:\/\/v1\/([^/#]+)/);
  return m ? `https://static.wixstatic.com/media/${m[1]}` : '';
}
/** Photo acceptée venant du navigateur : uniquement un média Wix (jamais une adresse quelconque). */
const photoValide = (u) => /^wix:image:\/\/v1\//.test(u) || /^https:\/\/static\.wixstatic\.com\//.test(u);

async function labelsToIds(col, champ, valeurs) {
  const vals = asArr(valeurs).map((v) => clean(v, 200)).filter(Boolean);
  if (!vals.length) return [];
  const rows = (await wixData.query(col).limit(200).find({ suppressAuth: true })).items;
  const parNorm = new Map(rows.map((r) => [norm(r[champ]), r._id]));
  return vals.map((v) => parNorm.get(norm(v))).filter(Boolean);
}

/**
 * Ticket valide de l'administrateur : celui dont l'_id est donné (il doit lui appartenir), sinon son plus récent
 * de l'entité demandée (un admin peut avoir un ticket « membres » ET un ticket « organismes » : le retour arrière
 * du navigateur d'une fiche à l'autre fonctionne). null si absent, expiré, ou d'un autre administrateur.
 */
async function ticketDe(admin, ticketId, entite) {
  let t = null;
  try {
    if (ticketId) t = await wixData.get(COL_TICKETS, String(ticketId), { suppressAuth: true });
    else {
      let q = wixData.query(COL_TICKETS).eq('adminId', admin.id);
      if (entite) q = q.eq('entite', entite);
      t = (await q.descending('_createdDate').limit(1).find({ suppressAuth: true })).items[0] || null;
    }
  } catch (e) { t = null; }
  if (!t || t.adminId !== admin.id) return null;
  if (!t.expire || new Date(t.expire).getTime() < Date.now()) return null;
  return t;
}

/** Crée le ticket de l'admin pour une entité ; remplace SES anciens tickets de la même entité (pas ceux des autres). */
async function creerTicket(admin, entite, cibleId) {
  const anciens = (await wixData.query(COL_TICKETS).eq('adminId', admin.id).eq('entite', entite)
    .limit(50).find({ suppressAuth: true })).items;
  if (anciens.length) await wixData.bulkRemove(COL_TICKETS, anciens.map((t) => t._id), { suppressAuth: true });
  await wixData.insert(COL_TICKETS, {
    title: 'ticket', adminId: admin.id, entite, cibleId,
    expire: new Date(Date.now() + DUREE_TICKET_MS).toISOString(),
  }, { suppressAuth: true });
}

/** Clic sur « Modifier » : crée le ticket. Ne renvoie AUCUN identifiant de fiche. */
export const adminOuvrirFiche = webMethod(Permissions.SiteMember, async (params = {}) => {
  let admin;
  try { admin = await exigerAdmin('ouvrir'); } catch (e) { if (estRefus(e)) return REFUSE; throw e; }
  // Onglet -> collection et entité du ticket. Résidents : pas de page d'édition pour l'instant.
  const CIBLES = {
    membres: { col: 'Membres', entite: 'membres', cible: (id) => id },
    organismes: { col: 'Organisations', entite: 'organismes', cible: (id) => id },
    residents: { col: 'Residents', entite: ENTITE_RES, cible: (id, fiche) => idsOf(fiche.organisation_id)[0] || '' },   // gestion des résidents DE SON ORGANISME
  };
  const cible = CIBLES[params.onglet];
  if (!cible) return { ok: false, reason: 'entite-non-geree' };

  const id = clean(params.id, 60);
  let fiche = null;
  try { fiche = id ? await wixData.get(cible.col, id, { suppressAuth: true }) : null; } catch (e) { fiche = null; }
  if (!fiche) return { ok: false, reason: 'introuvable' };

  const cibleId = cible.cible(fiche._id, fiche);
  if (!cibleId) return { ok: false, reason: 'pas-d-organisme' };
  try {
    await creerTicket(admin, cible.entite, cibleId);
  } catch (e) {
    console.warn('[LPC][Admin] ticket KO (collection Tickets_Admin absente ?)', e && e.message);
    return { ok: false, reason: 'tickets-indisponibles' };
  }
  await journaliser(admin, 'ouvrir:' + cible.entite, fiche._id, '');
  return { ok: true };
});

/** La page /adminprofil demande la fiche visée par le ticket de l'administrateur connecté. */
export const adminFicheCourante = webMethod(Permissions.SiteMember, async () => {
  let admin;
  try { admin = await exigerAdmin('fiche'); } catch (e) { if (estRefus(e)) return REFUSE; throw e; }
  const t = await ticketDe(admin, null, 'membres');
  if (!t || t.entite !== 'membres') return { ok: false, reason: 'pas-de-ticket' };

  let row = null;
  try {
    row = (await wixData.query('Membres').eq('_id', t.cibleId).include('type', 'capacites', 'disponibilites')
      .limit(1).find({ suppressAuth: true })).items[0] || null;
  } catch (e) { row = null; }
  if (!row) return { ok: false, reason: 'introuvable' };

  const statutIds = idsOf(row.type);
  const [caps, dispos] = await Promise.all([
    statutIds.length
      ? wixData.query('Capacites').hasSome('typesDeMembre', statutIds).ascending('capacite').limit(200).find({ suppressAuth: true })
      : wixData.query('Capacites').ascending('capacite').limit(200).find({ suppressAuth: true }),
    wixData.query('Disponibilites').ascending('disponibilite').limit(200).find({ suppressAuth: true }),
  ]);
  await journaliser(admin, 'lire-fiche:membres', row._id, '');
  const org = await organismeDuMembre(row);
  // E-mail de jumelage (04/10) : proposé seulement quand le quota du porteur est rempli (jumelages proposés ou actifs >= nombre de cartes) ;
  // composerEmailPorteur recontrôle au clic
  const maxCartes = Number(row.nbResidentsMax) || 0;
  let jumelagesEnCours = 0;
  let listeJumelages = [];   // 06/10 : jumelages en cours du porteur (prénom + initiale, organisme), affichés dans #boxResidents de /adminprofil
  const statutsFiche = asArr(row.type).map((s) => s && s.statut).filter(Boolean);
  const estPorteur = statutsFiche.some((s) => norm(s) === 'porteur');   // 08/10 : un porteur sans nombre de cartes peut aussi avoir des jumelages
  if ((ecrit(row.capacites) && maxCartes >= 1) || estPorteur) {
    try {
      const jums = (await wixData.query('Jumelages').eq('porteur', row._id).hasSome('statut', ['propose', 'actif']).limit(LIMITE).find({ suppressAuth: true })).items;
      jumelagesEnCours = jums.length;
      const resIds = [...new Set(jums.flatMap((j) => idsOf(j.resident)))];
      const residents = resIds.length ? (await wixData.query('Residents').hasSome('_id', resIds).limit(LIMITE).find({ suppressAuth: true })).items.filter((r) => r.actif !== false) : [];
      const orgIds = [...new Set(residents.flatMap((r) => idsOf(r.organisation_id)))];
      const orgs = orgIds.length ? (await wixData.query('Organisations').hasSome('_id', orgIds).limit(LIMITE).find({ suppressAuth: true })).items : [];
      const orgPar = new Map(orgs.map((o) => [o._id, o.nom || '']));
      listeJumelages = residents.map((r) => ({ nom: nomResident(r), organisme: orgPar.get(idsOf(r.organisation_id)[0]) || '', interets: clean(String(r.interets || '').replace(/\s+/g, ' '), 120) }))
        .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
    } catch (e) { jumelagesEnCours = 0; listeJumelages = []; }
  }
  return {
    ok: true,
    version: VERSION,
    ticket: t._id,
    expire: t.expire,
    jumelages: { encours: jumelagesEnCours, max: maxCartes, liste: listeJumelages },   // pas de données de santé : nom, initiale, organisme, centres d'intérêt
    statutOptions: statutsFiche.length ? [] : STATUTS_CREATION.slice(),   // 08/10 : membre SANS statut -> #dropdownStatut de /adminprofil (l'admin le définit)
    emailPorteurPossible: maxCartes >= 1 && ecrit(row.capacites) && jumelagesEnCours >= maxCartes && Boolean(row.email),
    organisation: org ? { nom: org.nom || '(sans nom)' } : null,   // lien vers sa fiche : adminOuvrirOrganismeDuMembre
    profil: {
      prenom: row.prenom || '',
      nom: row.nom || '',
      email: row.email || '',
      telephone: row.telephone || '',
      localite: row.localite || '',
      commentaire: row.commentaire || '',
      photoUrl: row.photo || '',
      consentementPhoto: row.consentement_photo === true,
      consentementRgpd: row.consentement_rgpd === true,   // affiché grisé, jamais modifiable ni renvoyé
      statuts: asArr(row.type).map((s) => s && s.statut).filter(Boolean),
      capacites: asArr(row.capacites).map((c) => c && c.capacite).filter(Boolean),
      disponibilites: asArr(row.disponibilites).map((c) => c && c.disponibilite).filter(Boolean),
      nbResidentsMax: nbResidents(row.nbResidentsMax),
    },
    capaciteOptions: parOrdre(caps.items, 'capacite').map((r) => r.capacite).filter(Boolean),
    disponibiliteOptions: parOrdre(dispos.items, 'disponibilite').map((r) => r.disponibilite).filter(Boolean),
  };
});

/**
 * payload = { ticket, prenom, nom, telephone, localite, commentaire, capacites: string[], disponibilites: string[],
 *             nbResidentsMax?, consentementPhoto?, photoUrl?, photoW?, photoH?, supprimerPhoto? }
 * PHOTO (03/10) : `photoUrl` (média Wix téléversé par la page) ajoute ou remplace ; `supprimerPhoto` la retire (et remet le
 * consentement image à faux : plus de photo, plus de consentement). Poussée vers le compte Wix en un appel SÉPARÉ du
 * contact (un refus de la photo ne doit pas faire perdre le nom / téléphone), puis relue : `photoWix` dit si le compte Wix
 * est en accord (sinon members-sync recopierait l'ancienne photo à la prochaine connexion du membre).
 * Consentement image : modifiable (avant/après journalisés). Consentement RGPD, statuts, e-mail et fonction :
 * JAMAIS touchés par l'administrateur.
 * Règle du nombre de cartes = celle de Mon-Profil : « Écrire » décoché -> effacé ; coché + nombre valide -> écrit ;
 * coché sans nombre valide -> valeur conservée.
 * Prénom, nom et téléphone sont aussi poussés vers le compte Wix du membre : sinon members-sync (Wix -> LPC)
 * écraserait la correction à sa prochaine connexion.
 */
export const adminEnregistrerMembre = webMethod(Permissions.SiteMember, async (payload = {}) => {
  let admin;
  try { admin = await exigerAdmin('enregistrer'); } catch (e) { if (estRefus(e)) return REFUSE; throw e; }
  const t = await ticketDe(admin, payload.ticket);
  if (!t || t.entite !== 'membres') return { ok: false, reason: 'ticket-invalide' };

  const row = (await wixData.query('Membres').eq('_id', t.cibleId).include('type', 'capacites', 'disponibilites')
    .limit(1).find({ suppressAuth: true })).items[0];
  if (!row) return { ok: false, reason: 'introuvable' };

  const prenom = clean(payload.prenom, 80);
  const nom = clean(payload.nom, 80);
  if (!prenom || !nom) return { ok: false, reason: 'nom-requis' };
  const telephone = clean(payload.telephone, 40);
  const localite = clean(payload.localite, 120);
  const commentaire = clean(payload.commentaire, 2000);

  const photoUrl = clean(payload.photoUrl, 2000);
  if (photoUrl && !photoValide(photoUrl)) {
    console.warn('[LPC][Admin] photo refusée : adresse qui n’est pas un média Wix');
    return { ok: false, reason: 'photo-invalide' };
  }
  const supprimerPhoto = payload.supprimerPhoto === true && !photoUrl;   // un nouvel envoi l'emporte sur le retrait

  const p = { ...row };
  p.prenom = prenom; p.nom = nom; p.telephone = telephone; p.localite = localite; p.commentaire = commentaire;
  if (typeof payload.consentementPhoto === 'boolean') p.consentement_photo = payload.consentementPhoto;   // modifiable par l'admin (Bruno, 30/09)
  if (photoUrl) p.photo = photoUrl;
  else if (supprimerPhoto) { p.photo = ''; p.consentement_photo = false; }
  if (!ecritDesCartes(payload.capacites)) p.nbResidentsMax = null;
  else if (nbResidents(payload.nbResidentsMax) != null) p.nbResidentsMax = nbResidents(payload.nbResidentsMax);
  delete p.type; delete p.capacites; delete p.disponibilites;   // statuts intacts, références via replaceReferences
  const rowId = (await wixData.update('Membres', p, { suppressAuth: true }))._id;

  const capIds = await labelsToIds('Capacites', 'capacite', payload.capacites);
  const dispoIds = await labelsToIds('Disponibilites', 'disponibilite', payload.disponibilites);
  await wixData.replaceReferences('Membres', 'capacites', rowId, capIds, { suppressAuth: true });
  await wixData.replaceReferences('Membres', 'disponibilites', rowId, dispoIds, { suppressAuth: true });

  // Statut (08/10) : l'admin ne peut le DÉFINIR que pour un membre qui n'en a aucun (les statuts ne se modifient pas ensuite ici)
  let statutAttribue = '';
  if (payload.statut && !idsOf(row.type).length) {
    const st = (await statutsDeCreation()).find((x) => norm(x.statut) === norm(payload.statut));
    if (st) {
      await wixData.replaceReferences('Membres', 'type', rowId, [st._id], { suppressAuth: true });
      statutAttribue = st.statut;
    } else console.warn('[LPC][Admin] statut refusé (inconnu ou hors liste) :', String(payload.statut).slice(0, 40));
  }

  // Push vers le compte Wix du membre visé (jamais celui de l'administrateur)
  let pushWix = false;
  let photoWix = 'sans-objet';   // 'ok' | 'restante' (retrait refusé par Wix) | 'absente' (ajout non vu) | 'non-poussee' | 'non-verifiee' | 'sans-compte'
  if (row.wixMemberId) {
    try {
      const cd = { firstName: prenom, lastName: nom };
      const tel164 = toE164(telephone);
      if (tel164) cd.phones = [tel164];
      await updateMember(row.wixMemberId, { contactDetails: cd });
      pushWix = true;
    } catch (e) {
      console.warn('[LPC][Admin] updateMember (compte Wix du membre) KO :', e && (e.message || e));
    }
    if (photoUrl || supprimerPhoto) {
      const statique = toStaticImageUrl(photoUrl);
      try {
        if (photoUrl && !statique) throw new Error('adresse de photo non convertible en URL statique');
        const profilePhoto = photoUrl
          ? { url: statique, width: Number(payload.photoW) > 0 ? Number(payload.photoW) : 400, height: Number(payload.photoH) > 0 ? Number(payload.photoH) : 400 }
          : null;
        await updateMember(row.wixMemberId, { profile: { profilePhoto } });
        photoWix = 'ok';
      } catch (e) {
        photoWix = 'non-poussee';
        console.warn('[LPC][Admin] updateMember (photo du compte Wix) KO :', e && (e.stack || e.message || e));
      }
      // Relecture : le retrait doit avoir vidé la photo du compte Wix, l'ajout l'avoir posée
      try {
        const m = await getMemberWix(row.wixMemberId, { fieldsets: ['FULL'] });
        const po = m && m.profile && m.profile.photo;
        const presente = Boolean(po && (po.url || (typeof po === 'string' && po)));
        if (supprimerPhoto) photoWix = presente ? 'restante' : 'ok';
        else photoWix = presente ? 'ok' : (photoWix === 'ok' ? 'absente' : photoWix);
      } catch (e) {
        if (photoWix === 'ok') photoWix = 'non-verifiee';
        console.warn('[LPC][Admin] relecture du compte Wix KO :', e && (e.message || e));
      }
      if (photoWix !== 'ok') console.warn('[LPC][Admin] photo : compte Wix pas en accord (' + photoWix + ') : members-sync pourrait recopier l’ancienne photo', rowId);
    }
  } else {
    if (photoUrl || supprimerPhoto) photoWix = 'sans-compte';
    console.warn('[LPC][Admin] fiche sans wixMemberId : rien poussé vers Wix', rowId);
  }

  // Journal : noms des champs seulement, jamais les valeurs (données personnelles)
  await journaliser(admin, 'modifier:membres', rowId,
    'champs : prenom, nom, telephone, localite, commentaire, capacites, disponibilites, nbResidentsMax, consentement_photo'
    + (typeof payload.consentementPhoto === 'boolean' ? ' (' + (row.consentement_photo === true) + ' -> ' + payload.consentementPhoto + ')' : '')
    + (statutAttribue ? ' · statut défini par l’administrateur : ' + statutAttribue : '')
    + (photoUrl ? ' · photo : ajoutée ou remplacée' : supprimerPhoto ? ' · photo : retirée (consentement image remis à faux)' : '')
    + ' · push Wix : ' + pushWix + (photoUrl || supprimerPhoto ? ' · photo Wix : ' + photoWix : ''));
  return { ok: true, version: VERSION, pushWix, photoWix, nbResidentsMax: p.nbResidentsMax == null ? null : p.nbResidentsMax };
});

// ─── création d'un membre par l'administrateur (07/10) ───────────────────
// Compte Wix créé SANS mot de passe (createMember : aucun e-mail envoyé, loginEmailVerified = false) puis fiche `Membres`
// créée tout de suite (members-sync ne la crée qu'à la première connexion du membre, et assignerait le rôle à ce moment).
// La personne prend la main sur son compte par « mot de passe oublié ». Aucun ticket : la page /adminprofil?mode=creation
// n'a pas de fiche visée. Le consentement RGPD est recueilli HORS du site par l'admin (oral ou e-mail de l’équipe) : la case
// #checkbox2 doit être cochée par l'admin, le serveur l'exige et le journal le mentionne.

const STATUTS_CREATION = ['Porteur', 'Accueillant', 'Partenaire'];
const ROLE_MEMBRE_NORMAL = 'REDACTED-MEMBER-ROLE-ID';   // identique à members-sync.web.js
const LANGUE_CONTACT = 'fr-be';
const MOTIF_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function statutsDeCreation() {
  const rows = (await wixData.query('Membres_Statuts').limit(50).find({ suppressAuth: true })).items;
  return STATUTS_CREATION.map((s) => rows.find((r) => norm(r.statut) === norm(s))).filter(Boolean);
}
async function capacitesDuStatut(statutId) {
  const rows = (await wixData.query('Capacites').hasSome('typesDeMembre', [statutId]).limit(200).find({ suppressAuth: true })).items;
  return parOrdre(rows, 'capacite').map((r) => r.capacite).filter(Boolean);
}

/** La page /adminprofil?mode=creation demande les listes : statuts, capacités PAR statut, disponibilités. */
export const adminCreationOptions = webMethod(Permissions.SiteMember, async () => {
  try { await exigerAdmin('creation-options'); } catch (e) { if (estRefus(e)) return REFUSE; throw e; }
  const statuts = await statutsDeCreation();
  const capacitesParStatut = {};
  for (const s of statuts) capacitesParStatut[s.statut] = await capacitesDuStatut(s._id);
  const dispos = (await wixData.query('Disponibilites').ascending('disponibilite').limit(200).find({ suppressAuth: true })).items;
  return {
    ok: true,
    version: VERSION,
    statuts: statuts.map((s) => s.statut),
    capacitesParStatut,
    disponibiliteOptions: parOrdre(dispos, 'disponibilite').map((r) => r.disponibilite).filter(Boolean),
  };
});

/** Langue du contact Wix du nouveau membre (comme members-sync). Jamais bloquant. */
async function langueDuContact(contactId) {
  if (!contactId) return;
  try {
    const contact = await contacts.getContact(contactId, { suppressAuth: true });
    await contacts.updateContact({ contactId, revision: contact.revision }, { locale: LANGUE_CONTACT }, { suppressAuth: true });
  } catch (e) {
    console.warn('[LPC][Admin] langue du contact KO :', e && (e.message || e));
  }
}

/** createMember (wix-members.v2) : la doc montre deux formes d'argument ({ member } ou l'objet seul) ; on essaie la première, puis la seconde. */
async function creerCompteWix(membre) {
  let derniere = null;
  for (const arg of [{ member: membre }, membre]) {
    try {
      const res = await createMemberWix(arg);
      const m = (res && res.member) || res;
      if (m && m._id) return m;
    } catch (e) { derniere = e; }
  }
  console.warn('[LPC][Admin] createMember KO :', derniere && (derniere.message || derniere));
  return null;
}

/**
 * payload = { prenom, nom, email, telephone, localite, commentaire, statut, capacites: string[], disponibilites: string[],
 *             nbResidentsMax?, consentementRgpd }
 * Refus renvoyés en { ok: false, reason } : 'donnees-invalides', 'statut-invalide', 'consentement-requis', 'nb-requis',
 * 'email-existant' (fiche déjà présente), 'wix-refuse' (compte Wix refusé : adresse déjà inscrite ?), 'fiche-ko'.
 */
export const adminCreerMembre = webMethod(Permissions.SiteMember, async (payload = {}) => {
  let admin;
  try { admin = await exigerAdmin('creer-membre'); } catch (e) { if (estRefus(e)) return REFUSE; throw e; }

  const prenom = clean(payload.prenom, 80);
  const nom = clean(payload.nom, 80);
  const email = clean(payload.email, 200).toLowerCase();
  if (!prenom || !nom || !MOTIF_EMAIL.test(email)) return { ok: false, reason: 'donnees-invalides' };
  if (payload.consentementRgpd !== true) return { ok: false, reason: 'consentement-requis' };

  const statut = (await statutsDeCreation()).find((s) => norm(s.statut) === norm(payload.statut));
  if (!statut) return { ok: false, reason: 'statut-invalide' };

  const permises = new Set((await capacitesDuStatut(statut._id)).map(norm));
  const capacites = asArr(payload.capacites).filter((c) => permises.has(norm(c)));
  const nb = nbResidents(payload.nbResidentsMax);
  if (ecritDesCartes(capacites) && nb == null) return { ok: false, reason: 'nb-requis' };

  const existant = (await wixData.query('Membres').eq('email', email).limit(1).find({ suppressAuth: true })).items[0];
  if (existant) return { ok: false, reason: 'email-existant' };

  const telephone = clean(payload.telephone, 40);
  const tel164 = toE164(telephone);
  const contact = { firstName: prenom, lastName: nom };
  if (tel164) contact.phones = [tel164];
  const compte = await creerCompteWix({ loginEmail: email, privacyStatus: 'PRIVATE', contact });
  if (!compte) return { ok: false, reason: 'wix-refuse' };

  let rowId = '';
  try {
    const row = await wixData.insert('Membres', {
      email, prenom, nom, telephone,
      localite: clean(payload.localite, 120),
      commentaire: clean(payload.commentaire, 2000),
      consentement_rgpd: true,            // recueilli hors du site par l'administrateur (journalisé)
      consentement_photo: false,
      abonnement_newsletter: false,
      actif: true,
      wixMemberId: compte._id,
      verified: false,
      nbResidentsMax: ecritDesCartes(capacites) ? nb : null,
      _owner: compte._id,
    }, { suppressAuth: true });
    rowId = row._id;
    await wixData.replaceReferences('Membres', 'type', rowId, [statut._id], { suppressAuth: true });
    await wixData.replaceReferences('Membres', 'capacites', rowId, await labelsToIds('Capacites', 'capacite', capacites), { suppressAuth: true });
    await wixData.replaceReferences('Membres', 'disponibilites', rowId, await labelsToIds('Disponibilites', 'disponibilite', payload.disponibilites), { suppressAuth: true });
  } catch (e) {
    console.error('[LPC][Admin] fiche Membres KO après création du compte Wix (members-sync la créera à la première connexion) :', e && (e.message || e));
    await journaliser(admin, 'creer:membres-KO', compte._id, 'compte Wix créé, fiche non (ou partiellement) créée');
    return { ok: false, reason: 'fiche-ko' };
  }

  let role = true;
  try { await assignRole(ROLE_MEMBRE_NORMAL, compte._id); } catch (e) { role = false; console.error('[LPC][Admin] assignRole KO :', e && (e.message || e)); }
  await langueDuContact((compte.contact && compte.contact.contactId) || compte.contactId || compte._id);

  // Journal : noms des champs, jamais les valeurs ; le statut choisi et l'origine du consentement sont tracés
  await journaliser(admin, 'creer:membres', rowId,
    'champs : prenom, nom, email, telephone, localite, commentaire, capacites, disponibilites, nbResidentsMax · statut : ' + statut.statut
    + ' · consentement RGPD recueilli hors site, confirmé par l’administrateur · compte Wix créé sans mot de passe (verified = false) · rôle membre : ' + role);
  return { ok: true, version: VERSION, role };
});

/**
 * « Valider » (07/10) : crée la fiche `Membres` d'un compte Wix qui n'en a pas (comme members-sync à la première connexion : même champs,
 * rôle « Membre Normal », langue fr-be). Aucun e-mail n'est envoyé (décision de Bruno : l'avertissement du membre reste manuel).
 * ⚠️ loginEmailVerified est en LECTURE SEULE côté Wix : cette action ne peut pas valider l'e-mail du compte.
 * params = { id } ('wix:' + identifiant du compte, tel que renvoyé par la liste). Refus : { ok: false, reason }.
 */
export const adminValiderMembreWix = webMethod(Permissions.SiteMember, async (params = {}) => {
  let admin;
  try { admin = await exigerAdmin('valider-membre-wix'); } catch (e) { if (estRefus(e)) return REFUSE; throw e; }
  const id = clean(params.id, 80).replace(/^wix:/, '');
  if (!id) return { ok: false, reason: 'introuvable' };
  let m = null;
  try { m = await getMemberWix(id, { fieldsets: ['FULL'] }); } catch (e) { m = null; }
  if (!m || !m._id) return { ok: false, reason: 'introuvable' };
  const email = String(m.loginEmail || '').toLowerCase();
  if (!email) return { ok: false, reason: 'sans-email' };

  const deja = (await wixData.query('Membres').eq('email', email).limit(1).find({ suppressAuth: true })).items[0]
    || (await wixData.query('Membres').eq('wixMemberId', m._id).limit(1).find({ suppressAuth: true })).items[0];
  if (deja) return { ok: false, reason: 'deja-synchronise' };

  const c = m.contactDetails || {};
  const tel = asArr(c.phones).map((p) => (p && (p.phone || p)) || '').find(Boolean) || '';
  const po = m.profile && m.profile.photo;
  const photo = (po && (po.url || (typeof po === 'string' ? po : ''))) || '';
  const champs = {
    prenom: c.firstName || '', nom: c.lastName || '', telephone: String(tel), fonction: c.jobTitle || '', entreprise: c.company || '', photo,
  };
  const row = { email, consentement_rgpd: true, abonnement_newsletter: false, actif: true, wixMemberId: m._id, verified: m.loginEmailVerified === true, _owner: m._id };   // consentement : inscription via le popup Wix, comme members-sync
  Object.entries(champs).forEach(([k, v]) => { if (v) row[k] = v; });
  if (c.birthdate) { const d = new Date(c.birthdate); if (!Number.isNaN(d.getTime())) row.date_naissance = d; }

  const cree = await wixData.insert('Membres', row, { suppressAuth: true });
  let role = true;
  try { await assignRole(ROLE_MEMBRE_NORMAL, m._id); } catch (e) { role = false; console.error('[LPC][Admin] assignRole KO :', e && (e.message || e)); }
  await langueDuContact(m.contactId || m._id);
  await journaliser(admin, 'valider:membre-wix', cree._id,
    'fiche créée pour un compte Wix sans fiche · e-mail Wix vérifié : ' + (m.loginEmailVerified === true) + ' · rôle membre : ' + role + ' · aucun e-mail envoyé');
  return { ok: true, version: VERSION, role, emailVerifie: m.loginEmailVerified === true };
});

// ─── organismes : même mécanique de ticket ───────────────────────────────

const GENRES_ORGANISME = ['Accueillant', 'Partenaire'];
const libelles = (refs, champ) => asArr(refs).map((r) => r && r[champ]).filter(Boolean);

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

/** Types d'organisme des deux genres (Accueillant, Partenaire), triés par Ordre. */
function typesDesDeuxGenres(types) {
  return parOrdre(types, 'type')
    .filter((t) => asArr(t.Genre).some((g) => GENRES_ORGANISME.some((x) => norm(x) === norm(g))));
}

/** Listes de référence pour un organisme : types des deux genres, capacités des statuts Accueillant + Partenaire. */
async function optionsOrganisme() {
  const statuts = (await wixData.query('Membres_Statuts').hasSome('statut', GENRES_ORGANISME)
    .limit(20).find({ suppressAuth: true })).items;
  const statutIds = statuts.map((s) => s._id);
  const [caps, types] = await Promise.all([
    statutIds.length
      ? wixData.query('Capacites').hasSome('typesDeMembre', statutIds).ascending('capacite').limit(200).find({ suppressAuth: true })
      : wixData.query('Capacites').ascending('capacite').limit(200).find({ suppressAuth: true }),
    wixData.query('Organisations_Types').ascending('type').limit(200).find({ suppressAuth: true }),
  ]);
  const parGenre = typesDesDeuxGenres(types.items);
  // Repli si aucun Genre n'est reconnu : toute la liste plutôt que rien
  const listeTypes = parGenre.length ? parGenre : parOrdre(types.items, 'type');
  return { caps: parOrdre(caps.items, 'capacite'), types: listeTypes, tousTypes: types.items, parGenre };
}

/** La page /adminorganisme demande l'organisme visé par le ticket de l'administrateur connecté. */
export const adminOrganismeCourant = webMethod(Permissions.SiteMember, async () => {
  let admin;
  try { admin = await exigerAdmin('organisme'); } catch (e) { if (estRefus(e)) return REFUSE; throw e; }
  const t = await ticketDe(admin, null, 'organismes');
  if (!t || t.entite !== 'organismes') return { ok: false, reason: 'pas-de-ticket' };

  let org = null;
  try {
    org = (await wixData.query('Organisations').eq('_id', t.cibleId).include('types', 'capacites')
      .limit(1).find({ suppressAuth: true })).items[0] || null;
  } catch (e) { org = null; }
  if (!org) return { ok: false, reason: 'introuvable' };

  const opts = await optionsOrganisme();
  const typeOptions = opts.types.map((r) => r.type).filter(Boolean);
  const labelsTypes = libelles(org.types, 'type');
  // Le type retenu doit figurer dans la liste, sinon la liste déroulante ne peut pas le sélectionner
  const typeRetenu = labelsTypes.find((x) => typeOptions.some((o) => norm(o) === norm(x))) || labelsTypes[0] || '';
  if (typeRetenu && !typeOptions.some((o) => norm(o) === norm(typeRetenu))) typeOptions.push(typeRetenu);

  // Membres rattachés, dans un ordre STABLE : la page désigne un membre par son rang, jamais par son identifiant
  const rattaches = await membresRattaches(org._id);

  // Résidents actifs de l'organisme (non jumelés / jumelés), affichés dans le titre de la page
  let residents = { total: 0, jumeles: 0, disponibles: 0 };
  try {
    const [rs, j] = await Promise.all([tout('Residents'), jumelagesEnCours()]);
    residents = statsResidents(org._id, rs, j.parResident);
  } catch (e) { /* titre sans chiffres plutôt qu'une page en erreur */ }

  await journaliser(admin, 'lire-fiche:organismes', org._id, '');
  return {
    ok: true,
    version: VERSION,
    ticket: t._id,
    expire: t.expire,
    organisation: {
      nom: org.nom || '',
      localite: org.localite || '',
      type: typeRetenu,
      tousLesTypes: labelsTypes,
      capacites: libelles(org.capacites, 'capacite'),
      nombreDestinataires: org.nombre_destinataires == null ? '' : String(org.nombre_destinataires),
      commentaire: fromRichText(org.commentaire),
    },
    // Liste des membres rattachés : le nom sert de lien vers leur fiche (désignés par leur RANG, jamais par identifiant)
    membres: rattaches.map((m, rang) => ({
      rang,
      nom: nomAffiche(m),
      statuts: asArr(m.type).map((s) => s && s.statut).filter(Boolean),
    })),
    // Contact = PREMIER membre rattaché (ordre alphabétique) : son téléphone et sa fonction sont ÉDITABLES sur la page.
    // Ce sont des champs du membre, pas de l'organisme. `nbMembres` > 1 : le contact n'est qu'un d'entre eux.
    contact: rattaches.length ? { rang: 0, nom: nomAffiche(rattaches[0]), telephone: rattaches[0].telephone || '', fonction: rattaches[0].fonction || '' } : null,
    nbMembres: rattaches.length,
    residents,
    // Organisme ACCUEILLANT = l'un de ses types est de genre Accueillant (seuls ceux-là ont des résidents)
    accueillant: asArr(org.types).some((tp) => asArr(tp && tp.Genre).some((g) => norm(g) === 'accueillant')),
    // Consentement RGPD : lecture seule ; vrai seulement si TOUS les membres rattachés l'ont donné (aucun membre : faux)
    consentementRgpd: rattaches.length > 0 && rattaches.every((m) => m.consentement_rgpd === true),
    capaciteOptions: opts.caps.map((r) => r.capacite).filter(Boolean),
    typeOptions,
  };
});

const nomAffiche = (m) => `${m.prenom || ''} ${m.nom || ''}`.trim() || '(sans nom)';

/** Membres rattachés à un organisme, triés par nom puis identifiant (ordre stable d'un appel à l'autre). */
async function membresRattaches(orgId) {
  const rows = (await wixData.query('Membres').eq('organisation_id', orgId).include('type')
    .limit(50).find({ suppressAuth: true })).items;
  return rows.sort((a, b) => nomAffiche(a).localeCompare(nomAffiche(b), 'fr') || String(a._id).localeCompare(String(b._id)));
}

/** Organisme lié à un membre (identifiant lu sur la fiche, jamais fourni par le navigateur). */
async function organismeDuMembre(row) {
  const orgId = idsOf(row && row.organisation_id)[0];
  if (!orgId) return null;
  try { return await wixData.get('Organisations', orgId, { suppressAuth: true }); } catch (e) { return null; }
}

/** Depuis /adminprofil : ouvre la fiche de l'organisme du membre (ticket « organismes », sans toucher au ticket « membres »). */
export const adminOuvrirOrganismeDuMembre = webMethod(Permissions.SiteMember, async (params = {}) => {
  let admin;
  try { admin = await exigerAdmin('ouvrir-organisme'); } catch (e) { if (estRefus(e)) return REFUSE; throw e; }
  const t = await ticketDe(admin, params.ticket, 'membres');
  if (!t || t.entite !== 'membres') return { ok: false, reason: 'ticket-invalide' };
  let row = null;
  try { row = await wixData.get('Membres', t.cibleId, { suppressAuth: true }); } catch (e) { row = null; }
  const org = await organismeDuMembre(row);
  if (!org) return { ok: false, reason: 'pas-d-organisme' };
  try { await creerTicket(admin, 'organismes', org._id); }
  catch (e) {
    console.warn('[LPC][Admin] ticket KO', e && e.message);
    return { ok: false, reason: 'tickets-indisponibles' };
  }
  await journaliser(admin, 'ouvrir:organismes', org._id, 'depuis le membre ' + t.cibleId);
  return { ok: true };
});

/**
 * Depuis la page /adminorganisme : ouvre la fiche d'un membre rattaché. Le membre est désigné par son RANG dans la
 * liste renvoyée par adminOrganismeCourant (le serveur le retrouve seul : aucun identifiant ne transite).
 * Crée un ticket « membres » SANS toucher au ticket « organismes » : le retour arrière du navigateur reste valide.
 */
export const adminOuvrirMembreRattache = webMethod(Permissions.SiteMember, async (params = {}) => {
  let admin;
  try { admin = await exigerAdmin('ouvrir-membre'); } catch (e) { if (estRefus(e)) return REFUSE; throw e; }
  const t = await ticketDe(admin, params.ticket, 'organismes');
  if (!t || t.entite !== 'organismes') return { ok: false, reason: 'ticket-invalide' };
  const rang = Number(params.rang);
  if (!Number.isInteger(rang) || rang < 0) return { ok: false, reason: 'introuvable' };
  const liste = await membresRattaches(t.cibleId);
  const m = liste[rang];
  if (!m) return { ok: false, reason: 'introuvable' };
  try { await creerTicket(admin, 'membres', m._id); }
  catch (e) {
    console.warn('[LPC][Admin] ticket KO', e && e.message);
    return { ok: false, reason: 'tickets-indisponibles' };
  }
  await journaliser(admin, 'ouvrir:membres', m._id, 'depuis l’organisme ' + t.cibleId);
  return { ok: true };
});

/**
 * payload = { ticket, nom, type, localite, nombreDestinataires, capacites: string[], commentaire }
 * Mêmes règles que « Mon organisme » : `types` et `capacites` remplacés DANS LE PÉRIMÈTRE des deux genres
 * (Accueillant + Partenaire), le reste conservé.
 * payload.contact = { rang, nom, telephone, fonction } (facultatif) : téléphone et fonction du PREMIER membre rattaché,
 * écrits sur sa fiche (et poussés vers son compte Wix).
 */
export const adminEnregistrerOrganisme = webMethod(Permissions.SiteMember, async (payload = {}) => {
  let admin;
  try { admin = await exigerAdmin('enregistrer-organisme'); } catch (e) { if (estRefus(e)) return REFUSE; throw e; }
  const t = await ticketDe(admin, payload.ticket);
  if (!t || t.entite !== 'organismes') return { ok: false, reason: 'ticket-invalide' };

  const org = (await wixData.query('Organisations').eq('_id', t.cibleId).include('types', 'capacites')
    .limit(1).find({ suppressAuth: true })).items[0];
  if (!org) return { ok: false, reason: 'introuvable' };

  const nom = clean(payload.nom, 200);
  if (!nom) return { ok: false, reason: 'nom-requis' };
  const localite = clean(payload.localite, 120);
  const commentaire = clean(payload.commentaire, 4000);
  const nbRaw = parseInt(String(payload.nombreDestinataires == null ? '' : payload.nombreDestinataires).replace(/\s/g, ''), 10);
  const nombre = Number.isFinite(nbRaw) && nbRaw >= 0 ? nbRaw : null;

  const opts = await optionsOrganisme();
  const perimetreTypes = opts.parGenre.map((x) => x._id);
  const perimetreCaps = opts.caps.map((r) => r._id);
  const typesAvant = idsOf(org.types);
  const capsAvant = idsOf(org.capacites);
  const typeIds = await labelsToIds('Organisations_Types', 'type', payload.type);
  const capIds = await labelsToIds('Capacites', 'capacite', payload.capacites);
  const fusion = (avant, nouveaux, perimetre) =>
    Array.from(new Set([...asArr(avant).filter((id) => !perimetre.includes(id)), ...asArr(nouveaux)]));

  const maj = { ...org };
  maj.nom = nom;
  maj.localite = localite;
  maj.commentaire = toRichText(commentaire);
  if (nombre != null) maj.nombre_destinataires = nombre;
  delete maj.types; delete maj.capacites;   // via replaceReferences
  await wixData.update('Organisations', maj, { suppressAuth: true });
  await wixData.replaceReferences('Organisations', 'types', org._id, fusion(typesAvant, typeIds, perimetreTypes), { suppressAuth: true });
  await wixData.replaceReferences('Organisations', 'capacites', org._id, fusion(capsAvant, capIds, perimetreCaps), { suppressAuth: true });

  // Téléphone et fonction du CONTACT (premier membre rattaché) : champs du membre, éditables ici (Bruno, 01/10).
  // Le membre est désigné par son rang ET son nom affiché (un décalage de la liste entre la lecture et l'écriture
  // ne doit jamais faire écrire sur la mauvaise personne).
  let contact = 'non fourni';
  let pushWix = null;
  const c = payload.contact;
  if (c && typeof c === 'object') {
    const liste = await membresRattaches(org._id);
    const m = liste[Number(c.rang)];
    if (!m || nomAffiche(m) !== clean(c.nom, 200)) {
      contact = 'ignoré (la liste des membres a changé)';
    } else {
      const telephone = clean(c.telephone, 40);
      const fonction = clean(c.fonction, 120);
      const p = { ...m };
      p.telephone = telephone; p.fonction = fonction;
      delete p.type;   // références via replaceReferences, intactes
      await wixData.update('Membres', p, { suppressAuth: true });
      contact = 'téléphone, fonction';
      // Push vers le compte Wix : sinon members-sync (Wix -> LPC) écraserait la valeur à la prochaine connexion
      pushWix = false;
      if (m.wixMemberId) {
        try {
          const cd = {};
          const tel164 = toE164(telephone);
          if (tel164) cd.phones = [tel164];
          if (fonction) cd.jobTitle = fonction;
          if (Object.keys(cd).length) await updateMember(m.wixMemberId, { contactDetails: cd });
          pushWix = true;
        } catch (e) { console.warn('[LPC][Admin] updateMember (contact de l’organisme) KO :', e && (e.message || e)); }
      }
    }
  }

  // Journal : noms des champs, plus l'ancien nom en cas de renommage (l'organisme n'est pas une personne)
  await journaliser(admin, 'modifier:organismes', org._id,
    'champs : nom, type, localite, nombre_destinataires, capacites, commentaire · contact : ' + contact
    + (pushWix === null ? '' : ' (push Wix : ' + pushWix + ')')
    + (norm(org.nom) !== norm(nom) ? ' · renommé : ' + clean(org.nom, 200) + ' -> ' + nom : ''));
  return { ok: true, version: VERSION, pushWix };
});

// ─── jumelage manuel (page /adminjumelages) ──────────────────────────────
// Ticket « residents » : cibleId = « mode:identifiant » où mode vaut
//   organisme : résidents d'un organisme (depuis /adminorganisme), aucun porteur choisi d'avance
//   resident  : un seul résident (depuis l'onglet Résidents de /admin), porteur à choisir
//   porteur   : un seul porteur (depuis /adminprofil), tous les résidents non jumelés du site
// Règles (Bruno, 02/10) : UN SEUL porteur par résident ; « Jumeler » crée un jumelage `actif` ; « Annuler » met `annule`
// (ligne gardée, ne compte ni dans les places ni dans « jumelé ») ; places d'un porteur = nbResidentsMax - jumelages
// `propose`/`actif`. Toute la décision (qui peut être jumelé, quelles actions) est calculée ICI, jamais crue du navigateur.
// `indicateur_a` / `indicateur_b` sont visibles de l'équipe admin, jamais envoyés à un porteur.

const parseCible = (c) => {
  const s = String(c || '');
  const i = s.indexOf(':');
  return i < 0 ? { mode: '', id: '' } : { mode: s.slice(0, i), id: s.slice(i + 1) };
};
const nomResident = (r) => `${r.prenom || ''} ${r.nom ? r.nom + '.' : ''}`.trim() || '(sans nom)';

/**
 * Photographie du jumelage pour un ticket : porteurs proposés, porteur choisi, résidents listés avec l'action possible.
 * null si la cible du ticket n'existe plus.
 */
async function donneesJumelage(mode, cibleId, porteurDemande) {
  const [membres, residents, orgs, jums] = await Promise.all([
    tout('Membres', 'capacites'), tout('Residents'), tout('Organisations'),
    wixData.query('Jumelages').hasSome('statut', ['propose', 'actif']).limit(LIMITE).find({ suppressAuth: true }).then((r) => r.items),
  ]);
  const org = new Map(orgs.map((o) => [o._id, o]));
  const nomsMembres = new Map(membres.map((m) => [m._id, nomAffiche(m)]));   // porteurs complets ou qui n'écrivent plus inclus
  const encours = new Map();                       // porteur -> nombre de jumelages en cours
  const parResident = new Map();                   // résident -> { jumelageId, porteurId }
  jums.forEach((j) => {
    const pid = idsOf(j.porteur)[0];
    const rid = idsOf(j.resident)[0];
    if (pid) encours.set(pid, (encours.get(pid) || 0) + 1);
    if (rid && !parResident.has(rid)) parResident.set(rid, { jumelageId: j._id, porteurId: pid });
  });

  // Porteurs = membres qui écrivent des cartes et ont indiqué combien
  const porteurs = new Map();
  membres.forEach((m) => {
    const max = Number(m.nbResidentsMax) || 0;
    if (!ecrit(m.capacites) || max < 1) return;
    const n = encours.get(m._id) || 0;
    porteurs.set(m._id, { id: m._id, nom: nomAffiche(m), localite: m.localite || '', max, encours: n, libres: Math.max(0, max - n) });
  });

  // Périmètre de résidents selon le mode du ticket
  let titre = '';
  let portee = [];
  let porteurFixe = null;
  if (mode === 'organisme') {
    const o = org.get(cibleId);
    if (!o) return null;
    titre = o.nom || '(sans nom)';
    portee = residents.filter((r) => r.actif !== false && idsOf(r.organisation_id).includes(cibleId));
  } else if (mode === 'resident') {
    const r = residents.find((x) => x._id === cibleId);
    if (!r) return null;
    titre = nomResident(r);
    portee = [r];
  } else if (mode === 'tous') {
    titre = 'Tous les résidents';
    portee = residents.filter((r) => r.actif !== false);
  } else if (mode === 'porteur') {
    porteurFixe = porteurs.get(cibleId) || null;
    if (!porteurFixe) return null;   // ne (ou plus) écrit des cartes
    titre = porteurFixe.nom;
    portee = residents.filter((r) => r.actif !== false);
  } else return null;

  // Liste déroulante : porteurs avec des places libres + ceux déjà jumelés à un résident du périmètre + celui choisi
  const dansPortee = new Set(portee.map((r) => r._id));
  const jumelesIci = new Set();
  parResident.forEach((v, rid) => { if (dansPortee.has(rid) && v.porteurId) jumelesIci.add(v.porteurId); });
  const proposes = porteurFixe
    ? [porteurFixe]
    : Array.from(porteurs.values()).filter((p) => p.libres > 0 || jumelesIci.has(p.id) || p.id === porteurDemande);
  proposes.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  const choisi = porteurFixe || (porteurDemande && proposes.find((p) => p.id === porteurDemande)) || null;

  const locPorteur = choisi ? sansAccents(choisi.localite) : '';
  const lignes = [];
  portee.forEach((r) => {
    const j = parResident.get(r._id);
    const avecChoisi = !!(j && choisi && j.porteurId === choisi.id);
    // Mode porteur : non jumelés + jumelés à CE porteur (pour annuler). Modes organisme et resident : TOUS les résidents du
    // périmètre, jumelés ou non (un jumelé à un autre porteur n'a ni bouton ni action : « Jumelé avec Nom »).
    if (j && !avecChoisi && mode === 'porteur') return;
    const o = org.get(idsOf(r.organisation_id)[0]);
    const localite = (o && o.localite) || '';
    // Deux actions seulement (Bruno, 02/10) : « Annuler » pour un résident jumelé (quel que soit le porteur), « Jumeler » pour un
    // résident actif sans porteur quand un porteur avec des places libres est choisi. Changer de porteur = Annuler, puis Jumeler.
    let action = '';
    if (j) action = 'annuler';
    else if (r.actif !== false) action = 'jumeler';   // le choix du porteur et les places sont contrôlés au clic (messages explicites)
    const autre = j && !avecChoisi && j.porteurId ? porteurs.get(j.porteurId) : null;
    // E-mail au porteur depuis la LIGNE (04/10) : proposé seulement si le porteur de ce jumelage a rempli son quota
    const pj = j ? porteurs.get(j.porteurId) : null;
    const emailPossible = !!(pj && pj.max >= 1 && pj.encours >= pj.max);
    lignes.push({
      id: r._id,
      nom: nomResident(r),
      institution: (o && o.nom) || '',
      localite,
      chambre: r.numero_chambre || '',
      infosimportantes: String(r.infosimportantes || '').slice(0, 300),
      interets: String(r.interets || '').slice(0, 300),
      // Nom du porteur + (x/y) : x = jumelages en cours, y = nombre de cartes qu'il veut écrire (04/10) ; sans (x/y) s'il n'est plus porteur
      porteur: j ? 'Jumelé avec ' + (avecChoisi ? choisi.nom + ' (' + choisi.encours + '/' + choisi.max + ')'
        : (autre ? autre.nom + ' (' + autre.encours + '/' + autre.max + ')' : (nomsMembres.get(j.porteurId) || '…'))) : '',
      action,
      emailPossible,
      jumelageId: j ? j.jumelageId : '',
      proche: !!(locPorteur && sansAccents(localite) === locPorteur),
    });
  });
  // Mode porteur : résidents de SA localité d'abord ; sinon ordre alphabétique
  lignes.sort((a, b) => (b.proche - a.proche) || a.nom.localeCompare(b.nom, 'fr'));

  return {
    mode,
    titre,
    selection: choisi ? { id: choisi.id, nom: choisi.nom, localite: choisi.localite, max: choisi.max, encours: choisi.encours, libres: choisi.libres } : null,
    porteurFixe: !!porteurFixe,
    porteurs: proposes.map((p) => ({
      id: p.id,
      label: p.nom + (p.localite ? ' (' + p.localite + ')' : '') + ' - ' + p.libres + ' place' + (p.libres > 1 ? 's' : '') + ' libre' + (p.libres > 1 ? 's' : ''),
    })),
    lignes,
  };
}

/** Données de /adminjumelages. `porteur` = identifiant choisi dans la liste déroulante (sans valeur : aucun porteur choisi). */
export const adminJumelageDonnees = webMethod(Permissions.SiteMember, async (params = {}) => {
  let admin;
  try { admin = await exigerAdmin('jumelage'); } catch (e) { if (estRefus(e)) return REFUSE; throw e; }
  // `tous` (bouton « Jumelage » de la navigation) : tous les résidents actifs du site, sans ticket
  const t = params.tous === true ? { _id: '', expire: '', cibleId: 'tous:' } : await ticketDe(admin, null, 'residents');
  if (!t || (params.tous !== true && t.entite !== 'residents')) return { ok: false, reason: 'pas-de-ticket' };
  const { mode, id } = parseCible(t.cibleId);
  const d = await donneesJumelage(mode, id, clean(params.porteur, 60));
  if (!d) return { ok: false, reason: 'introuvable' };
  await journaliser(admin, 'lire-jumelage:' + mode, id, '');
  return publier(d, t._id, t.expire);
});

/** Réponse envoyée à la page : état complet, sans les champs internes (identifiant du jumelage, proximité). */
const publier = (d, ticket, expire) => ({
  ok: true, version: VERSION, ticket, expire, ...d, lignes: d.lignes.map(({ jumelageId, proche, ...l }) => l),
});

/** Vérifie le ticket et recalcule l'état : l'action demandée doit être celle que le serveur proposerait lui-même. */
async function actionJumelage(admin, p, attendue) {
  const t = p.tous === true ? { cibleId: 'tous:' } : await ticketDe(admin, p.ticket, 'residents');
  if (!t || (p.tous !== true && t.entite !== 'residents')) return { ko: { ok: false, reason: 'ticket-invalide' } };
  const { mode, id } = parseCible(t.cibleId);
  const porteurId = clean(p.porteur, 60);
  const residentId = clean(p.resident, 60);
  const d = await donneesJumelage(mode, id, porteurId);
  if (!d) return { ko: { ok: false, reason: 'introuvable' } };
  const ligne = d.lignes.find((l) => l.id === residentId);
  if (!ligne || ligne.action !== attendue) return { ko: { ok: false, reason: 'non-autorise' } };   // hors périmètre, déjà jumelé, inactif...
  if (attendue === 'jumeler') {
    if (!d.selection || d.selection.id !== porteurId) return { ko: { ok: false, reason: 'pas-de-porteur' } };
    if (d.selection.libres < 1) return { ko: { ok: false, reason: 'complet' } };
  }
  return { d, ligne, mode, cibleId: id, porteurId, residentId, ticketId: t._id || '', expire: t.expire || '' };
}

export const adminJumeler = webMethod(Permissions.SiteMember, async (p = {}) => {
  let admin;
  try { admin = await exigerAdmin('jumeler'); } catch (e) { if (estRefus(e)) return REFUSE; throw e; }
  const r = await actionJumelage(admin, p, 'jumeler');
  if (r.ko) return r.ko;
  await wixData.insert('Jumelages', {
    title: `${r.ligne.nom} ↔ ${r.d.selection.nom}`,
    porteur: r.porteurId,
    resident: r.residentId,
    statut: 'actif',
    dateDebut: new Date(),
    campagne: CAMPAGNE,
  }, { suppressAuth: true });
  // Journal et nouvel état en parallèle, renvoyés dans la même réponse (un seul aller-retour : la page n'a pas à relire)
  const [, fresh] = await Promise.all([
    journaliser(admin, 'jumeler', r.residentId, 'porteur ' + r.porteurId + ' · statut actif · campagne ' + CAMPAGNE + ' · mode ' + r.mode),
    donneesJumelage(r.mode, r.cibleId, r.porteurId),
  ]);
  return { ok: true, version: VERSION, donnees: fresh ? publier(fresh, r.ticketId, r.expire) : null };
});

export const adminAnnulerJumelage = webMethod(Permissions.SiteMember, async (p = {}) => {
  let admin;
  try { admin = await exigerAdmin('annuler-jumelage'); } catch (e) { if (estRefus(e)) return REFUSE; throw e; }
  const r = await actionJumelage(admin, p, 'annuler');
  if (r.ko) return r.ko;
  let j = null;
  try { j = await wixData.get('Jumelages', r.ligne.jumelageId, { suppressAuth: true }); } catch (e) { j = null; }
  if (!j) { console.warn('[LPC][Admin] annuler : jumelage introuvable', r.ligne.jumelageId); return { ok: false, reason: 'introuvable' }; }
  try {
    await wixData.update('Jumelages', { ...j, statut: 'annule', dateFin: new Date() }, { suppressAuth: true });
  } catch (e) {
    console.warn('[LPC][Admin] annuler : écriture KO', e && (e.message || e));
    return { ok: false, reason: 'ecriture' };
  }
  const [, fresh] = await Promise.all([
    journaliser(admin, 'annuler-jumelage', r.residentId, 'porteur ' + (idsOf(j.porteur)[0] || '') + ' · statut annule · mode ' + r.mode),
    donneesJumelage(r.mode, r.cibleId, r.porteurId),
  ]);
  return { ok: true, version: VERSION, donnees: fresh ? publier(fresh, r.ticketId, r.expire) : null };
});

// ─── e-mail de jumelage envoyé au porteur (03/10) ────────────────────────
// Le serveur compose l'e-mail ; la page l'ouvre dans la messagerie de l'administrateur (lien mailto) : RIEN n'est envoyé par le
// site (envoi à des tiers payant, décision du 22/09) et l'administrateur relit avant d'envoyer.
// Disponible seulement quand le QUOTA du porteur est REMPLI (jumelages proposés ou actifs >= nbResidentsMax), recontrôlé ici.
// Contenu : pour chaque résident jumelé, prénom + initiale, établissement (+ localité), centres d'intérêt. JAMAIS les données de santé
// (indicateur_a, indicateur_b) ni la chambre : un porteur ne les reçoit pas.
// Texte destiné à un tiers : pas de tiret cadratin, pas de point final sur les puces (règles de rédaction externe).
// TEXTE DE BRUNO (04/10), tutoiement, variantes SINGULIER / PLURIEL selon le nombre de résidents jumelés. Rédigé à la voix de l’équipe (signature, adresse de dépôt).
// Règles de rédaction externe : pas de tiret cadratin, pas de point final sur les puces.
const REPERES_EMAIL = (n) => [
  "Une carte écrite à la main, quelques lignes sincères suffisent",
  "Appuie-toi sur les centres d'intérêt et présente-toi simplement : ton prénom, ton quotidien, ce que tu aimes…",
  "Garde un ton chaleureux et positif, l'important reste vraiment le geste, la chaleur et l'attention que tu y mettras",
  "Si tu le souhaites, tu peux glisser dans l'enveloppe un petit papier avec ton adresse postale. Cela permettra éventuellement à un résident de te répondre s'il le souhaite mais je ne peux évidemment rien garantir mais certaines maisons de repos trouvent cette idée très belle. Cela reste totalement facultatif",
];
const ADRESSE_DEPOT = '[adresse de dépôt retirée]';
const OBJET_EMAIL = (campagne, n) => 'Les Porteurs de Chaleur : ' + (n > 1 ? 'tes résidents' : 'ton résident') + (campagne ? ' pour ' + campagne : '');

export const adminEmailPorteur = webMethod(Permissions.SiteMember, async (params = {}) => {
  let admin;
  try { admin = await exigerAdmin('email-porteur'); } catch (e) { if (estRefus(e)) return REFUSE; throw e; }
  let porteurId = clean(params.porteur, 60);
  const residentId = clean(params.resident, 60);
  if (residentId) {   // depuis une ligne de /adminjumelages (04/10) : le porteur est celui du jumelage en cours du résident
    try {
      const j = (await wixData.query('Jumelages').eq('resident', residentId).hasSome('statut', ['propose', 'actif']).limit(1).find({ suppressAuth: true })).items[0];
      porteurId = j ? (idsOf(j.porteur)[0] || '') : '';
    } catch (e) { porteurId = ''; }
    if (!porteurId) return { ok: false, reason: 'pas-de-jumelage' };
  }
  return composerEmailPorteur(admin, porteurId);
});

/** Depuis /adminprofil (04/10) : le porteur est celui du ticket « membres » en cours, jamais fourni par la page. */
export const adminEmailPorteurCourant = webMethod(Permissions.SiteMember, async (params = {}) => {
  let admin;
  try { admin = await exigerAdmin('email-porteur'); } catch (e) { if (estRefus(e)) return REFUSE; throw e; }
  const t = await ticketDe(admin, params.ticket, 'membres');
  if (!t || t.entite !== 'membres') return { ok: false, reason: 'ticket-invalide' };
  return composerEmailPorteur(admin, t.cibleId);
});

async function composerEmailPorteur(admin, porteurId) {
  if (!porteurId) return { ok: false, reason: 'pas-de-porteur' };

  let m = null;
  try { m = (await wixData.query('Membres').eq('_id', porteurId).include('capacites').limit(1).find({ suppressAuth: true })).items[0] || null; } catch (e) { m = null; }
  if (!m) return { ok: false, reason: 'introuvable' };
  const max = Number(m.nbResidentsMax) || 0;
  if (!ecrit(m.capacites) || max < 1) return { ok: false, reason: 'pas-porteur' };
  if (!m.email) return { ok: false, reason: 'pas-d-email' };

  const jums = (await wixData.query('Jumelages').eq('porteur', porteurId).hasSome('statut', ['propose', 'actif'])
    .limit(LIMITE).find({ suppressAuth: true })).items;
  if (jums.length < max) return { ok: false, reason: 'quota-non-rempli', encours: jums.length, max };

  const resIds = [...new Set(jums.flatMap((j) => idsOf(j.resident)))];
  const residents = resIds.length ? (await wixData.query('Residents').hasSome('_id', resIds).limit(LIMITE).find({ suppressAuth: true })).items : [];
  const orgIds = [...new Set(residents.flatMap((r) => idsOf(r.organisation_id)))];
  const orgs = orgIds.length ? (await wixData.query('Organisations').hasSome('_id', orgIds).limit(LIMITE).find({ suppressAuth: true })).items : [];
  const orgPar = new Map(orgs.map((o) => [o._id, o]));
  const liste = residents.slice().sort((a, b) => nomResident(a).localeCompare(nomResident(b), 'fr'));

  const campagnes = [...new Set(jums.map((j) => clean(j.campagne, 80)).filter(Boolean))];
  const campagne = campagnes.length === 1 ? campagnes[0] : '';
  const prenom = clean(m.prenom, 80);

  const n = liste.length;
  const plur = n > 1;
  const lignes = [];
  lignes.push(prenom ? 'Bonjour ' + prenom + ',' : 'Bonjour,');
  lignes.push('');
  lignes.push('Merci pour ton engagement auprès des Porteurs de Chaleur. Voici ' + (plur ? 'les personnes' : 'la personne') + ' à qui tu écriras' + (campagne ? ' pour ' + campagne : '') + ' :');
  liste.forEach((r, i) => {
    const o = orgPar.get(idsOf(r.organisation_id)[0]);
    const loc = o ? clean(o.localite, 80) : '';
    const lieu = o ? clean(o.nom, 120) + (loc ? ' à ' + loc : '') : '';   // localité ajoutée seulement si elle est renseignée
    const interets = clean(String(r.interets || '').replace(/\s+/g, ' '), 400);
    lignes.push('');
    lignes.push((i + 1) + '. ' + nomResident(r));
    if (lieu) lignes.push('   Établissement : ' + lieu);
    lignes.push("   Centres d'intérêt : " + (interets || 'non renseignés'));
  });
  lignes.push('');
  lignes.push(plur
    ? 'Les informations sur les résidents sont confidentielles : merci de ne pas les partager ni les publier.'
    : 'Les informations sur le résident sont confidentielles : merci de ne pas les partager ni les publier.');
  lignes.push('');
  lignes.push(plur ? 'Quelques repères pour tes cartes :' : 'Quelques repères pour ta carte :');
  REPERES_EMAIL(n).forEach((p) => lignes.push('- ' + p));
  lignes.push('');
  lignes.push(plur
    ? 'Une fois les cartes rédigées, pourrais-tu les déposer chez moi, ' + ADRESSE_DEPOT + '.'
    : 'Une fois la carte rédigée, pourrais-tu la déposer chez moi, ' + ADRESSE_DEPOT + '.');
  lignes.push(plur
    ? 'De même, pourrais-tu me confirmer par retour de courrier que tu as bien reçu ce mail et que tu es toujours disponible pour rédiger ces cartes.'
    : 'De même, pourrais-tu me confirmer par retour de courrier que tu as bien reçu ce mail et que tu es toujours disponible pour rédiger cette carte.');
  lignes.push('');
  lignes.push('Merci encore du fond du cœur pour ce lien que tu crées avec nos aînés isolés.');
  lignes.push('Je te souhaite une journée douce et lumineuse,');
  lignes.push('Les Porteurs de Chaleur');

  const sansAccord = liste.filter((r) => r.consentement_rgpd !== true).length;
  await journaliser(admin, 'email-porteur', porteurId, liste.length + ' résident(s) · accord RGPD manquant : ' + sansAccord + ' · brouillon seulement, rien envoyé');
  return {
    ok: true, version: VERSION,
    a: m.email,
    objet: OBJET_EMAIL(campagne, liste.length),
    corps: lignes.join('\n'),
    nb: liste.length,
    sansAccord,
  };
}

/**
 * Depuis /adminorganisme (origine « organisme », ticket « organismes ») ou /adminprofil (origine « porteur », ticket
 * « membres ») : crée le ticket « residents » SANS toucher aux autres. La cible est lue sur le ticket, jamais fournie.
 */
export const adminOuvrirResidents = webMethod(Permissions.SiteMember, async (params = {}) => {
  let admin;
  try { admin = await exigerAdmin('ouvrir-residents'); } catch (e) { if (estRefus(e)) return REFUSE; throw e; }
  const origine = params.origine === 'organisme' ? 'organisme' : params.origine === 'porteur' ? 'porteur' : '';
  if (!origine) return { ok: false, reason: 'origine-inconnue' };
  const entite = origine === 'organisme' ? 'organismes' : 'membres';
  const t = await ticketDe(admin, params.ticket, entite);
  if (!t || t.entite !== entite) return { ok: false, reason: 'ticket-invalide' };

  if (origine === 'porteur') {   // seul un PORTEUR (écrit des cartes, nombre indiqué) a des jumelages depuis sa fiche ; un accueillant passe par /adminorganisme
    let m = null;
    try { m = (await wixData.query('Membres').eq('_id', t.cibleId).include('capacites').limit(1).find({ suppressAuth: true })).items[0] || null; } catch (e) { m = null; }
    if (!m) return { ok: false, reason: 'introuvable' };
    if (!ecrit(m.capacites) || !(Number(m.nbResidentsMax) >= 1)) return { ok: false, reason: 'pas-porteur' };
  }
  try { await creerTicket(admin, 'residents', origine + ':' + t.cibleId); }
  catch (e) {
    console.warn('[LPC][Admin] ticket KO', e && e.message);
    return { ok: false, reason: 'tickets-indisponibles' };
  }
  await journaliser(admin, 'ouvrir:residents', t.cibleId, 'depuis ' + origine);
  return { ok: true };
});

// ─── gestion des résidents d'un organisme (page /adminresidents) ─────────
// Modèle : page « Mes résidents » (residents.web.js), version admin. Ticket « gestion-residents » (cibleId = identifiant de
// l'organisme, jamais dans l'URL). Règles :
//   - ajout et modification de TOUS les champs saisis par l'institution (prénom, initiale, chambre, intérêts, infos importantes)
//   - « supprimer » = DÉSACTIVER (`actif = false`, les Jumelages référencent le résident) ; IMPOSSIBLE pour un résident jumelé
//     (jumelage en cours, proposé ou actif) : refusé ici, le bouton est aussi masqué par la page
//   - l'accord RGPD (`consentement_rgpd`) n'est pas un acte de l'admin : conservé sur un résident modifié ; un résident créé reçoit la
//     valeur déjà donnée pour cet organisme (vrai si un de ses résidents la porte), sinon faux
//   - données de santé (indicateur_a, indicateur_b) : visibles de l'équipe admin, jamais envoyées à un porteur
const ENTITE_RES = 'gestion-residents';
const MAX_RESIDENTS = 200;
const initiale = (s) => clean(String(s || '').replace(/[.]/g, ''), 2).toUpperCase();

async function residentsDeOrg(orgId) {
  return (await wixData.query('Residents').eq('organisation_id', orgId).limit(MAX_RESIDENTS).find({ suppressAuth: true })).items;
}

/** Ticket « gestion-residents » de l'admin + organisme visé, ou { ko }. */
async function contexteResidents(admin, ticketId) {
  const t = await ticketDe(admin, ticketId || null, ENTITE_RES);
  if (!t || t.entite !== ENTITE_RES) return { ko: { ok: false, reason: ticketId ? 'ticket-invalide' : 'pas-de-ticket' } };
  let org = null;
  try { org = await wixData.get('Organisations', t.cibleId, { suppressAuth: true }); } catch (e) { org = null; }
  if (!org) return { ko: { ok: false, reason: 'introuvable' } };
  return { t, org };
}

export const adminResidentsCourants = webMethod(Permissions.SiteMember, async () => {
  let admin;
  try { admin = await exigerAdmin('residents'); } catch (e) { if (estRefus(e)) return REFUSE; throw e; }
  const c = await contexteResidents(admin, null);
  if (c.ko) return c.ko;
  const [rs, j] = await Promise.all([residentsDeOrg(c.org._id), jumelagesEnCours()]);
  await journaliser(admin, 'lire-fiche:residents', c.org._id, '');
  const actifs = rs.filter((r) => r.actif !== false).sort((a, b) => String(a.prenom || '').localeCompare(String(b.prenom || ''), 'fr'));
  // Nom COMPLET du porteur de chaque résident jumelé (06/10 : l'équipe admin voit « Prénom Nom », l'institution seulement « Prénom I. »)
  const porteurIds = [...new Set(actifs.map((r) => j.porteurDe.get(r._id)).filter(Boolean))];
  const noms = new Map();
  if (porteurIds.length) {
    try {
      (await wixData.query('Membres').hasSome('_id', porteurIds).limit(LIMITE).find({ suppressAuth: true })).items.forEach((m) => {
        noms.set(m._id, (clean(m.prenom, 80) + ' ' + clean(m.nom, 80)).trim() || 'Un porteur');
      });
    } catch (e) { /* « Un porteur » à défaut */ }
  }
  return {
    ok: true,
    version: VERSION,
    ticket: c.t._id,
    expire: c.t.expire,
    organisation: { nom: c.org.nom || '(sans nom)' },
    inactifs: rs.length - actifs.length,
    residents: actifs.map((r) => ({
      _id: r._id,
      prenom: r.prenom || '',
      initiale: r.nom || '',
      chambre: r.numero_chambre || '',
      interets: r.interets || '',
      infos: r.infosimportantes || '',
      actif: true,
      jumele: (j.parResident.get(r._id) || 0) > 0,
      porteur: noms.get(j.porteurDe.get(r._id)) || ((j.parResident.get(r._id) || 0) > 0 ? 'Un porteur' : ''),
    })),
  };
});

/**
 * payload = { ticket, residents: [{ _id?, prenom, initiale, chambre, interets, infos, actif }], jumelagesAAnnuler?: string[] }
 * 06/10 : supprimer (désactiver) un résident JUMELÉ est possible si la page confirme en envoyant son identifiant dans `jumelagesAAnnuler` :
 * son jumelage en cours passe d'abord à « annule » (ligne conservée), puis le résident est désactivé. Sans cette confirmation : refus « jumele ».
 * Seules les lignes envoyées sont traitées. `_id` absent ou inconnu de l'organisme -> nouvelle ligne ; une ligne NOUVELLE sans
 * prénom est ignorée ; une ligne EXISTANTE sans prénom est refusée. `actif: false` = suppression (désactivation), refusée si le
 * résident est jumelé : rien n'est alors écrit.
 */
export const adminEnregistrerResidents = webMethod(Permissions.SiteMember, async (payload = {}) => {
  let admin;
  try { admin = await exigerAdmin('enregistrer-residents'); } catch (e) { if (estRefus(e)) return REFUSE; throw e; }
  const c = await contexteResidents(admin, payload.ticket);
  if (c.ko) return c.ko;
  const orgId = c.org._id;
  const [rs, j] = await Promise.all([residentsDeOrg(orgId), jumelagesEnCours()]);
  const existants = new Map(rs.map((r) => [r._id, r]));
  const accord = rs.some((r) => r.consentement_rgpd === true);

  const aCreer = [];
  const aMettreAJour = [];
  let desactives = 0;
  const confirmes = new Set(asArr(payload.jumelagesAAnnuler).map((x) => clean(x, 60)).filter(Boolean));
  const aAnnuler = [];   // résidents jumelés dont le jumelage est annulé avant la désactivation
  for (const l of asArr(payload.residents).slice(0, MAX_RESIDENTS)) {
    const prenom = clean(l && l.prenom, 80);
    const avant = l && l._id ? existants.get(clean(l._id, 60)) : null;
    if (!prenom) {
      if (avant) return { ok: false, reason: 'prenom-requis' };
      continue;
    }
    const actif = l.actif !== false;
    if (avant && !actif && avant.actif !== false && (j.parResident.get(avant._id) || 0) > 0) {
      if (!confirmes.has(avant._id)) return { ok: false, reason: 'jumele' };   // jumelé et non confirmé : rien n'est écrit
      aAnnuler.push(avant._id);
    }
    const valeurs = {
      prenom,
      nom: initiale(l.initiale),
      numero_chambre: clean(l.chambre, 5),
      interets: clean(l.interets, 2000),
      infosimportantes: clean(l.infos, 2000),
      actif,
    };
    if (avant) { aMettreAJour.push({ ...avant, ...valeurs }); if (!actif && avant.actif !== false) desactives++; }
    else if (actif) aCreer.push({ ...valeurs, consentement_rgpd: accord, organisation_id: orgId });
  }

  // 1. jumelages annulés (statut « annule », ligne et historique conservés), AVANT la désactivation des résidents
  let jumelagesAnnules = 0;
  for (const rid of aAnnuler) {
    const encours = (await wixData.query('Jumelages').eq('resident', rid).hasSome('statut', ['propose', 'actif']).limit(50).find({ suppressAuth: true })).items;
    for (const jum of encours) {
      await wixData.update('Jumelages', { ...jum, statut: 'annule', dateFin: new Date() }, { suppressAuth: true });
      jumelagesAnnules++;
    }
  }
  // 2. résidents créés, modifiés ou désactivés
  if (aMettreAJour.length) await wixData.bulkUpdate('Residents', aMettreAJour, { suppressAuth: true });
  if (aCreer.length) await wixData.bulkInsert('Residents', aCreer, { suppressAuth: true });
  // Journal : comptes seulement, jamais les valeurs (données de santé comprises)
  await journaliser(admin, 'modifier:residents', orgId, 'créés ' + aCreer.length + ' · mis à jour ' + aMettreAJour.length + ' · désactivés ' + desactives + ' · jumelages annulés ' + jumelagesAnnules
    + (aCreer.length && !accord ? ' · ATTENTION : aucun accord RGPD déjà donné pour cet organisme' : ''));
  return { ok: true, version: VERSION, crees: aCreer.length, misAJour: aMettreAJour.length, desactives, jumelagesAnnules };
});

/** Depuis /adminorganisme : ouvre la gestion des résidents de l'organisme du ticket « organismes ». */
export const adminOuvrirResidentsOrganisme = webMethod(Permissions.SiteMember, async (params = {}) => {
  let admin;
  try { admin = await exigerAdmin('ouvrir-residents-organisme'); } catch (e) { if (estRefus(e)) return REFUSE; throw e; }
  const t = await ticketDe(admin, params.ticket, 'organismes');
  if (!t || t.entite !== 'organismes') return { ok: false, reason: 'ticket-invalide' };
  try { await creerTicket(admin, ENTITE_RES, t.cibleId); }
  catch (e) { console.warn('[LPC][Admin] ticket KO', e && e.message); return { ok: false, reason: 'tickets-indisponibles' }; }
  await journaliser(admin, 'ouvrir:residents-gestion', t.cibleId, 'depuis l’organisme');
  return { ok: true };
});

/** Depuis /adminresidents : le nom de l'organisme ouvre sa fiche (ticket « organismes », sans toucher aux autres). */
export const adminOuvrirOrganismeDepuisResidents = webMethod(Permissions.SiteMember, async (params = {}) => {
  let admin;
  try { admin = await exigerAdmin('ouvrir-organisme-depuis-residents'); } catch (e) { if (estRefus(e)) return REFUSE; throw e; }
  const t = await ticketDe(admin, params.ticket, ENTITE_RES);
  if (!t || t.entite !== ENTITE_RES) return { ok: false, reason: 'ticket-invalide' };
  try { await creerTicket(admin, 'organismes', t.cibleId); }
  catch (e) { console.warn('[LPC][Admin] ticket KO', e && e.message); return { ok: false, reason: 'tickets-indisponibles' }; }
  await journaliser(admin, 'ouvrir:organismes', t.cibleId, 'depuis la gestion des résidents');
  return { ok: true };
});

// ─── liens de /adminjumelages vers l'organisme et la gestion des résidents (06/10) ───
// La page de jumelage connaît l'identifiant du résident de chaque ligne ; le serveur retrouve SEUL son organisme (jamais fourni par le
// navigateur), crée le ticket voulu SANS toucher aux autres et la page ouvre la fiche (aucun identifiant dans l'URL).
async function organismeDuResident(params) {
  const rid = clean(params && params.resident, 60);
  if (!rid) return null;
  let r = null;
  try { r = await wixData.get('Residents', rid, { suppressAuth: true }); } catch (e) { r = null; }
  if (!r || r.actif === false) return null;
  const orgId = idsOf(r.organisation_id)[0];
  return orgId ? { orgId, rid } : null;
}

/** Depuis /adminjumelages, colonne « Institution » : ouvre la fiche de l'organisme du résident (/adminorganisme). */
export const adminOuvrirOrganismeDuResident = webMethod(Permissions.SiteMember, async (params = {}) => {
  let admin;
  try { admin = await exigerAdmin('ouvrir-organisme-du-resident'); } catch (e) { if (estRefus(e)) return REFUSE; throw e; }
  const c = await organismeDuResident(params);
  if (!c) return { ok: false, reason: 'introuvable' };
  try { await creerTicket(admin, 'organismes', c.orgId); }
  catch (e) { console.warn('[LPC][Admin] ticket KO', e && e.message); return { ok: false, reason: 'tickets-indisponibles' }; }
  await journaliser(admin, 'ouvrir:organismes', c.orgId, 'depuis le jumelage');
  return { ok: true };
});

/** Depuis /adminjumelages, colonne « Résident » : ouvre la gestion des résidents de l'organisme du résident (/adminresidents). */
export const adminOuvrirResidentsDuResident = webMethod(Permissions.SiteMember, async (params = {}) => {
  let admin;
  try { admin = await exigerAdmin('ouvrir-residents-du-resident'); } catch (e) { if (estRefus(e)) return REFUSE; throw e; }
  const c = await organismeDuResident(params);
  if (!c) return { ok: false, reason: 'introuvable' };
  try { await creerTicket(admin, ENTITE_RES, c.orgId); }
  catch (e) { console.warn('[LPC][Admin] ticket KO', e && e.message); return { ok: false, reason: 'tickets-indisponibles' }; }
  await journaliser(admin, 'ouvrir:residents-gestion', c.orgId, 'depuis le jumelage');
  return { ok: true };
});

/** Depuis /admin, onglet Résidents, colonne « Jumelage » : ouvre /adminjumelages sur le porteur jumelé du résident (ticket « residents »,
 *  mode « porteur »). Si ce porteur n'écrit plus de cartes (mode porteur impossible), repli sur le résident seul (mode « resident »). */
export const adminOuvrirJumelageDuResident = webMethod(Permissions.SiteMember, async (params = {}) => {
  let admin;
  try { admin = await exigerAdmin('ouvrir-jumelage-du-resident'); } catch (e) { if (estRefus(e)) return REFUSE; throw e; }
  const rid = clean(params.resident, 60);
  if (!rid) return { ok: false, reason: 'introuvable' };
  let r = null;
  try { r = await wixData.get('Residents', rid, { suppressAuth: true }); } catch (e) { r = null; }
  if (!r || r.actif === false) return { ok: false, reason: 'introuvable' };
  let porteurId = '';
  try {
    const j = (await wixData.query('Jumelages').eq('resident', rid).hasSome('statut', ['propose', 'actif']).limit(1).find({ suppressAuth: true })).items[0];
    porteurId = j ? (idsOf(j.porteur)[0] || '') : '';
  } catch (e) { porteurId = ''; }
  let cible = 'resident:' + rid;
  if (porteurId) {
    let m = null;
    try { m = (await wixData.query('Membres').eq('_id', porteurId).include('capacites').limit(1).find({ suppressAuth: true })).items[0] || null; } catch (e) { m = null; }
    if (m && ecrit(m.capacites) && Number(m.nbResidentsMax) >= 1) cible = 'porteur:' + porteurId;
  }
  try { await creerTicket(admin, 'residents', cible); }
  catch (e) { console.warn('[LPC][Admin] ticket KO', e && e.message); return { ok: false, reason: 'tickets-indisponibles' }; }
  await journaliser(admin, 'ouvrir:residents', rid, 'depuis la liste des résidents (' + cible.split(':')[0] + ')');
  return { ok: true };
});

/**
 * Depuis /admin, onglet Organismes (06/10) : `organisme` = identifiant de la ligne (la page le connaît, le serveur vérifie qu'il existe) ;
 * `cible` : « contact » = fiche du premier membre rattaché (ticket « membres ») ; « jumelage » = jumelage des résidents de l'organisme
 * (ticket « residents », mode organisme) ; « residents » = gestion des résidents (ticket « gestion-residents »).
 */
export const adminOuvrirDepuisOrganisme = webMethod(Permissions.SiteMember, async (params = {}) => {
  let admin;
  try { admin = await exigerAdmin('ouvrir-depuis-organisme'); } catch (e) { if (estRefus(e)) return REFUSE; throw e; }
  const orgId = clean(params.organisme, 60);
  const cible = clean(params.cible, 20);
  if (!orgId || !['contact', 'jumelage', 'residents'].includes(cible)) return { ok: false, reason: 'introuvable' };
  let org = null;
  try { org = await wixData.get('Organisations', orgId, { suppressAuth: true }); } catch (e) { org = null; }
  if (!org) return { ok: false, reason: 'introuvable' };
  try {
    if (cible === 'contact') {
      const m = (await membresRattaches(orgId))[0];
      if (!m) return { ok: false, reason: 'pas-de-contact' };
      await creerTicket(admin, 'membres', m._id);
      await journaliser(admin, 'ouvrir:membres', m._id, 'contact de l’organisme ' + orgId);
    } else if (cible === 'jumelage') {
      await creerTicket(admin, 'residents', 'organisme:' + orgId);
      await journaliser(admin, 'ouvrir:residents', orgId, 'depuis la liste des organismes (jumelage)');
    } else {
      await creerTicket(admin, ENTITE_RES, orgId);
      await journaliser(admin, 'ouvrir:residents-gestion', orgId, 'depuis la liste des organismes');
    }
  } catch (e) {
    console.warn('[LPC][Admin] ticket KO', e && e.message);
    return { ok: false, reason: 'tickets-indisponibles' };
  }
  return { ok: true };
});

/** Depuis /admin, onglet Membres, colonne « Organisme » : ouvre la fiche de l'organisme du membre (ticket « organismes »). `membre` = identifiant de la ligne. */
export const adminOuvrirOrganismeDepuisListeMembres = webMethod(Permissions.SiteMember, async (params = {}) => {
  let admin;
  try { admin = await exigerAdmin('ouvrir-organisme-du-membre'); } catch (e) { if (estRefus(e)) return REFUSE; throw e; }
  const mid = clean(params.membre, 60);
  let row = null;
  try { row = mid ? await wixData.get('Membres', mid, { suppressAuth: true }) : null; } catch (e) { row = null; }
  const org = await organismeDuMembre(row);
  if (!org) return { ok: false, reason: 'pas-d-organisme' };
  try { await creerTicket(admin, 'organismes', org._id); }
  catch (e) { console.warn('[LPC][Admin] ticket KO', e && e.message); return { ok: false, reason: 'tickets-indisponibles' }; }
  await journaliser(admin, 'ouvrir:organismes', org._id, 'depuis la liste des membres');
  return { ok: true };
});
