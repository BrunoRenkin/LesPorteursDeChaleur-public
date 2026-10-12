// Code de PAGE « Adminorganisme » (/adminorganisme) : un administrateur modifie la fiche d'un ORGANISME.
// Page dupliquée de /mon-organisme (mêmes éléments, mêmes ID ou leurs variantes « 1 » : résolution tolérante).
// version du code : 2026-10-12-a   (12/10 : tableau #OrgtableJumelage des jumelages de l'organisme)
//
// La fiche visée n'apparaît JAMAIS dans l'URL : le clic sur « Modifier » (onglet Organismes de /admin) crée un
// ticket serveur (backend/admin.web.js, collection Tickets_Admin). Cette page demande au serveur « l'organisme de
// mon ticket » et le renvoie à chaque enregistrement. Toute la sécurité est côté serveur (exigerAdmin).
//
// Différences avec /mon-organisme :
//   - la cible est l'organisme du ticket, pas celui du membre connecté
//   - l'e-mail (propre au MEMBRE) est replié ; les boutons de navigation (Profil/Membre, Organisme, Résidents) ramènent aux
//     LISTES de /admin (onglet choisi par ?onglet=)
//   - TÉLÉPHONE et FONCTION sont ÉDITABLES (Bruno, 01/10) : ils appartiennent au membre, ce sont ceux du CONTACT = premier
//     membre rattaché par ordre alphabétique ; enregistrés sur sa fiche et poussés vers son compte Wix. Si plusieurs
//     membres sont rattachés, les autres s'éditent depuis leur propre fiche (téléphone seulement : la « fonction » n'existe
//     que sur les pages d'organisme)
//   - le consentement RGPD est affiché GRISÉ (lecture seule) : coché si tous les membres rattachés l'ont donné
//   - pas de confirmation en deux temps pour un renommage (l'administrateur agit en connaissance de cause ;
//     l'ancien nom est inscrit au journal)
//   - retour à la liste : retour arrière du navigateur (pas de bouton)
//
// Éléments FACULTATIFS (le formulaire fonctionne sans eux) :
//   #TitreAdmin  (texte, section Navigation) : « Organisme X [types] : N membre(s) rattaché(s) »
//   #TitreLinkAdmin (texte, section Navigation) : nom du membre CLIQUABLE (un membre : ouvre sa fiche) ; plusieurs membres :
//                           « Nom, Nom » en liens HTML. Remplace le répéteur #repeaterMembres (qui reste un repli).
//   #errorText (texte, section Navigation, masqué par défaut) : messages ; repli sur #messageErreur
//   #repeaterMembres (répéteur) : une ligne par membre rattaché ; son modèle ne contient QUE #membreNom (texte « Prénom Nom »,
//        cliquable : ouvre /adminprofil pour ce membre)
//   #libelleContact (texte) : « Téléphone et fonction de Prénom Nom (premier des N membres rattachés) »
//   #btnResidents (bouton) : visible pour un organisme ACCUEILLANT seulement (page des résidents pas encore créée)

import { authentication } from 'wix-members-frontend';
import wixLocation from 'wix-location';
import { adminOrganismeCourant, adminEnregistrerOrganisme, adminOuvrirMembreRattache, adminOuvrirOrganismeDuMembre, adminOuvrirResidents, adminOuvrirResidentsOrganisme } from 'backend/admin.web';

const EL = {
  blocOrganisme: '#blocOrganisme',
  erreur: '#messageErreur',
  titreAdmin: '#titreAdmin',
  repeaterMembres: '#repeaterMembres',
  btnResidents: '#BtnJumelage2',   // visible dès que l'organisme a des résidents, même tous jumelés (02/10) ; ancien bouton #btnResidents en repli
  libelleContact: '#libelleContact',
};
const PAGE_MEMBRE = '/adminprofil';
// Éléments de la section globale Navigation (01/10) : titre (T majuscule), texte du/des LIEN(S) vers le(s) membre(s), message d'erreur
const IDS_TITRE = ['#TitreAdmin', '#titreAdmin'];
// Titre = #TitreAdmin + #TitreLinkResidents + #TitreLinkMembre (02/10). #TitreLinkAdmin = ancien nom du lien membre (repli).
const IDS_LIEN = ['#TitreLinkMembre', '#TitreLinkAdmin'];
const IDS_LIEN_RESIDENTS = ['#TitreLinkResidents'];
const IDS_LIEN_JUMELES = ['#TitreLinkJumelages', '#TitreLinkJumelage', '#TitreLinkJumeles'];
const IDS_ERREUR = ['#errorText'];
// Page de jumelage (02/10) : le lien du titre et le bouton « Résidents » (organismes accueillants seulement) demandent au
// serveur un ticket « residents » (aucun identifiant dans l'URL), puis vont sur cette page.
const PAGE_RESIDENTS = '/adminjumelages';
const PAGE_GESTION_RESIDENTS = '/adminresidents';   // ajouter / modifier / supprimer les résidents de l'organisme (bouton #btnResidents)
// Éléments de /mon-organisme sans objet ici : repliés
const A_REPLIER = ['#email', '#email1', '#Email', '#emailMembre'];   // les onglets ne sont plus repliés : ils ramènent aux listes de /admin

const CHAMPS = {
  organisme: ['organisme', 'organisme1', 'nomOrganisme'],
  organismeType: ['organismeType', 'organismeType1'],
  organismeAdresse: ['organismeAdresse', 'organismeAdresse1', 'adresseOrganisme'],   // 12/10 : adresse (champ `adresse`), plus la localité
  nombreDestinataires: ['nombreDestinataires', 'nombreDestinataires1'],
  capacites: ['capacitesOrganisme', 'capacitesOrg', 'capacites', 'capacites1'],
  commentaire: ['commentaireOrganisme', 'commentaireOrg', 'commentaire', 'commentaire1'],
  // Champs du MEMBRE (hérités de F2/F3) : repliés
  telephone: ['telephone', 'telephone1', 'phone'],
  fonction: ['fonction', 'fonction1'],
  enregistrer: ['enregistrerOrganisme', 'submitOrganisme', 'submitBtn'],
};
const MOTIFS = {
  capacites: /capacit/i,
  commentaire: /commentaire/i,
  organisme: /^organi(sme|sation)\d*$/i,
  organismeType: /type/i,
  organismeAdresse: /^(?!.*mail).*adresse/i,
  nombreDestinataires: /nombre|destinataire/i,
  telephone: /telephone|phone|tel\d*$/i,
  fonction: /fonction|role|poste/i,
};

const PAGE_LISTE = '/admin?onglet=organismes';
// Retour après enregistrement (04/10) : la page d'où l'on vient, transmise par ?depuis=… (aucun identifiant ; le ticket de l'autre page reste
// valide 2 h). Sans paramètre (arrivée depuis la liste /admin) : la liste /admin, onglet Organismes.
const PAGE_RETOUR = { profil: '/adminprofil', membre: '/adminprofil', residents: '/adminresidents', jumelage: '/adminjumelages', jumelages: '/adminjumelages?tous=1' };
function pageRetour() {
  let o = '';
  try { o = String((wixLocation.query || {}).depuis || ''); } catch (e) { o = ''; }
  return PAGE_RETOUR[o] || PAGE_LISTE;
}
const COULEUR_ERREUR = '#C0392B';
const COULEUR_QUESTION = '#B9770E';

let d = {};
let ID = {};
let ticket = '';

// 12/10 : jumelages de l'organisme = pile #OrgAdminboxResidents > titre #OrgAdmintitreJumelages + tableau #OrgtableJumelage
const IDS_BOX_JUM = ['#OrgAdminboxResidents'];
const IDS_TITRE_JUM = ['#OrgAdmintitreJumelages'];
const IDS_TABLE_JUM = ['#OrgtableJumelage'];
const COLONNES_JUM = [
  { dataPath: 'resident', label: 'Résident', type: 'string', width: 200 },
  { dataPath: 'chambre', label: 'Chambre', type: 'string', width: 100 },
  { dataPath: 'porteur', label: 'Porteur', type: 'string', width: 240 },
];

$w.onReady(async () => {
  console.log('[LPC][AdminOrganisme] version du code : 2026-10-12-f (messages dans #messageErreur ; traces de l’enregistrement ; organismeAdresse ; case du logo non grisée)');
  try { cablerJumelages(); } catch (e) { console.error('[LPC][nav] jumelage KO:', e); }
  safe('inventaire', () => inventaire('AdminOrganisme'));
  safe('masquage erreur', hideErr);
  safe('résolution des ID', resoudreIds);
  safe('contrôle des ID', checkIds);
  safe('navigation vers les listes', cablerNavigationAdmin);
  safe('masquage initial', () => {
    A_REPLIER.forEach((id) => cacher(optionnel(id)));
    // Téléphone et fonction : visibles et ÉDITABLES (ceux du contact, voir remplirContact) ; repliés s'il n'y a aucun membre
    cacher(premier(IDS_TITRE)); cacher(optionnel(EL.repeaterMembres)); IDS_LIEN.forEach((id) => cacher(optionnel(id))); cacher(premier(IDS_LIEN_RESIDENTS)); cacher(premier(IDS_LIEN_JUMELES));   // réaffichés une fois la fiche reçue
    cacher(optionnel(EL.btnResidents)); cacher(optionnel('#btnResidents')); cacher(optionnel(EL.libelleContact));
    cacher(premier(IDS_BOX_JUM)); cacher(premier(IDS_TITRE_JUM)); cacher(premier(IDS_TABLE_JUM));   // réaffichés par afficherJumelagesOrganisme()
  });
  safe('consentement RGPD grisé', () => griserRgpd(false));

  if (!authentication.loggedIn()) { wixLocation.to('/participer'); return; }
  desactiverBouton();   // réactivé une fois la fiche chargée

  // Arrivée par #TitreLinkAdmin de /adminprofil (?depuis=membre) : le serveur ouvre l'organisme du membre en cours, puis la
  // page se charge normalement. Sans ce paramètre (arrivée depuis /admin), rien ne change.
  try {
    const q = wixLocation.query || {};
    if (q.depuis === 'membre') {
      const r = await adminOuvrirOrganismeDuMembre({});
      console.log('[LPC][AdminOrganisme] ouverture depuis le membre', r);
      if (r && r.refuse) { wixLocation.to('/'); return; }
      if (!r || !r.ok) { showErr("Impossible d'ouvrir la fiche de l'organisme."); return; }
    }
  } catch (e) {
    console.error('[LPC][AdminOrganisme] ouverture depuis le membre KO:', e);
    showErr("Impossible d'ouvrir la fiche de l'organisme.");
    return;
  }

  try {
    d = (await adminOrganismeCourant()) || {};
  } catch (e) {
    console.error('[LPC][AdminOrganisme] adminOrganismeCourant KO:', e);
    showErr("Impossible de charger l'organisme.");
    return;
  }
  if (d.refuse) {
    console.warn('[LPC][AdminOrganisme] accès refusé : redirection vers l’accueil');
    wixLocation.to('/');
    return;
  }
  if (!d.ok) {
    console.warn('[LPC][AdminOrganisme] pas de fiche :', d.reason);
    showErr(d.reason === 'pas-de-ticket'
      ? "Aucun organisme n'est ouvert (ou la session a expiré). Retournez à la liste et cliquez sur « Modifier »."
      : 'Organisme introuvable.');
    return;
  }
  ticket = d.ticket;
  console.log('[LPC][AdminOrganisme] fiche reçue', {
    version: d.version, capacites: (d.capaciteOptions || []).length, types: (d.typeOptions || []).length,
  });

  safe('préremplissage', remplir);   // 12/10 : une erreur ici ne doit pas empêcher de câbler le bouton Enregistrer
  safe('jumelages de l’organisme', afficherJumelagesOrganisme);
  safe('logo', () => initLogo((d.organisation || {}).logoUrl, (d.organisation || {}).consentementLogo));
  activerBouton();
  clic(ID.enregistrer, sauver);
});

// ─── résolution des ID (tolérante, comme /mon-organisme) ─────────────────
function descendants(el, acc = []) {
  let enfants = [];
  try { enfants = el && Array.isArray(el.children) ? el.children : []; } catch (e) { enfants = []; }
  enfants.forEach((c) => { acc.push(c); descendants(c, acc); });
  return acc;
}
function trouver(bloc, candidats, motif) {
  const dedans = bloc ? descendants(bloc) : [];
  const parId = new Map(dedans.map((e) => [String(e.id || '').toLowerCase(), e.id]));
  for (const c of candidats) {
    const hit = parId.get(c.toLowerCase());
    if (hit) return '#' + hit;
  }
  if (motif) {
    const e = dedans.find((x) => motif.test(String(x.id || '')));
    if (e) return '#' + e.id;
  }
  for (const c of candidats) if (optionnel('#' + c)) return '#' + c;
  return '#' + candidats[0];
}
function resoudreIds() {
  ID = { ...EL };
  const bloc = optionnel(EL.blocOrganisme);
  Object.entries(CHAMPS).forEach(([k, cands]) => { ID[k] = trouver(bloc, cands, MOTIFS[k]); });
  console.log('[LPC][AdminOrganisme] ID résolus :', JSON.stringify(ID));
}

// ─── navigation vers les listes de /admin ────────────────────────────────
// Les boutons de navigation hérités de /mon-profil et /mon-organisme (Membre, Organisme, Résidents) pointaient vers les
// pages self-service (01/10 : jusqu'à l'ancienne /mon-profil-old). Ici ils ramènent aux LISTES de /admin, onglet choisi
// par ?onglet=… (aucun identifiant). Lien posé par le code (écrase celui de l'éditeur) + clic en doublon sans risque.
const URL_JUMELAGES = '/adminjumelages?tous=1';
// Style commun des boutons de navigation (04/10) : inactif = fond blanc, texte et bordure #C61010 ; actif (la page visée = celle-ci) = fond #C61010, texte et bordure blancs
const NAV_ACTIF = 'organismes';
function peindreNav(b, actif) {
  const rouge = '#C61010', blanc = '#FFFFFF';
  if (!b || !b.style) return;
  try { b.style.backgroundColor = actif ? rouge : blanc; } catch (e) { /* ignoré */ }
  try { b.style.color = actif ? blanc : rouge; } catch (e) { /* ignoré */ }
  try { b.style.borderColor = actif ? blanc : rouge; } catch (e) { /* ignoré */ }
  try { b.style.borderWidth = 1; } catch (e) { /* ignoré */ }
}
const NAV_ADMIN = [
  { cle: 'membres', ids: ['#ongletMembresAdmin', '#ongletProfil', '#ongletMembres'], libelle: /^(profil|membres?)$/i },
  { cle: 'organismes', ids: ['#ongletOrganismesAdmin', '#ongletOrganisme', '#ongletOrganismes'], libelle: /^organismes?$/i },
  { cle: 'residents', ids: ['#ongletResidentsAdmin', '#ongletResidents', '#button10'], libelle: /^r[ée]sidents?$/i },
  // Bouton « Jumelage » (02/10) : /adminjumelages avec TOUS les résidents (?tous=1). Son lien d'éditeur pointait vers /mes-residents : le code le remplace.
  { cle: 'jumelages', ids: ['#ongletsJumelagesAdmin', '#ongletsJumelages', '#ongletJumelagesAdmin', '#ongletJumelages'], libelle: /^jumelages?$/i, url: URL_JUMELAGES },
];
function cablerNavigationAdmin() {
  let boutons = [];
  try { const t = $w('Button'); for (let i = 0; i < t.length; i++) boutons.push(t[i]); } catch (e) { boutons = []; }
  // 09/10 : bouton « Créer un membre » (section Navigation globale) câblé sur TOUTES les pages admin, pas seulement /admin
  try {
    const bc = $w('#btnCreerMembre');
    if (bc && bc.length !== 0 && typeof bc.onClick === 'function') {
      bc.onClick(() => wixLocation.to('/adminprofil?mode=creation'));
      try { bc.link = '/adminprofil?mode=creation'; } catch (e) { /* repli sur le clic */ }
    }
  } catch (e) { /* bouton absent de cette page */ }
  NAV_ADMIN.forEach((n) => {
    let b = null;
    for (const id of n.ids) { b = optionnel(id); if (b) break; }
    if (!b) b = boutons.find((x) => !/^btn/i.test(String(x.id || '')) && n.libelle.test(String(x.label || '').trim())) || null;   // jamais un bouton d'action « Btn… »
    if (!b) { console.warn('[LPC][AdminOrganisme] bouton « ' + n.cle + ' » introuvable : ajoutez-le pour revenir à la liste correspondante'); return; }
    const url = n.url || '/admin?onglet=' + n.cle;
    montrer(b);
    try { b.link = url; } catch (e) { /* repli sur le clic */ }
    if (typeof b.onClick === 'function') b.onClick(() => wixLocation.to(url));
    peindreNav(b, n.cle === NAV_ACTIF);
    console.log('[LPC][AdminOrganisme] navigation « ' + n.cle + ' » → ' + url + ' | bouton #' + b.id);
  });
  // Diagnostic (02/10) : boutons de la page avec leur lien d'éditeur, pour repérer le bouton « Jumelage » s'il n'est pas reconnu
  try { console.log('[LPC][nav] boutons :', boutons.map((x) => { let l = ''; try { l = String(x.link || ''); } catch (e) { l = '?'; } return '#' + x.id + ' « ' + String(x.label || '').slice(0, 20) + ' » → ' + (l || '(aucun)'); }).join(' | ')); } catch (e) { /* ignoré */ }
  // Tout bouton dont le lien d'éditeur pointe encore vers /mes-residents (ancien bouton « Résidents » devenu « Jumelage ») est redirigé
  boutons.filter((x) => { try { return /mes-residents/i.test(String(x.link || '')); } catch (e) { return false; } }).forEach((b) => {
    try { b.link = URL_JUMELAGES; } catch (e) { /* repli sur le clic */ }
    if (typeof b.onClick === 'function') b.onClick(() => wixLocation.to(URL_JUMELAGES));
    console.log('[LPC] bouton #' + b.id + ' (lien /mes-residents) redirigé vers ' + URL_JUMELAGES);
  });
}

/** Consentement RGPD : affiché GRISÉ, jamais modifiable par l'équipe (c'est un acte du membre). Les cases dont l'ID ou
 *  le libellé parle de RGPD / consentement / données / accord. La liste des cases est écrite en console. */
function griserRgpd(valeurCoche) {
  const motif = /rgpd|consent|donn[ée]es|accord|accept|traitement/i;
  let cases = [];
  try { const t = $w('Checkbox'); for (let i = 0; i < t.length; i++) cases.push(t[i]); } catch (e) { cases = []; }
  // 12/10 : la case d'autorisation du logo (#consentementlogo) répond au motif « consent » mais n'est PAS l'accord RGPD : exclue,
  // sinon elle était décochée et grisée (donc impossible à cocher : le logo n'était jamais envoyé)
  const visees = cases.filter((c) => motif.test(String(c.id || '') + ' ' + String(c.label || '')) && !/logo/i.test(String(c.id || '')));
  console.log('[LPC][AdminOrganisme] cases à cocher :', cases.map((c) => '#' + c.id + ' « ' + String(c.label || '').slice(0, 40) + ' »').join(' | ') || '(aucune)',
    '| grisées :', visees.map((c) => '#' + c.id).join(', ') || '(aucune)');
  visees.forEach((c) => {
    try { c.checked = valeurCoche; } catch (e) { /* ignoré */ }
    try { if (typeof c.disable === 'function') c.disable(); } catch (e) { /* ignoré */ }
    try { if (c.customClassList) c.customClassList.add('lpc-desactive'); } catch (e) { /* ignoré */ }
    try { if (typeof c.resetValidityIndication === 'function') c.resetValidityIndication(); } catch (e) { /* ignoré */ }
  });
}

/** Ouvre la page de jumelage des résidents de l'organisme : le serveur crée le ticket « residents » depuis le ticket de l'organisme. */
async function ouvrirResidents() {
  hideErr();
  try {
    const res = await adminOuvrirResidents({ origine: 'organisme', ticket });
    console.log('[LPC][AdminOrganisme] ouverture du jumelage', res);
    if (res && res.refuse) { wixLocation.to('/'); return; }
    if (res && res.ok) { wixLocation.to(PAGE_RESIDENTS); return; }
    showErr(res && res.reason === 'ticket-invalide'
      ? "La session d'édition a expiré. Retournez à la liste et cliquez de nouveau sur « Modifier »."
      : "Impossible d'ouvrir la page de jumelage.");
  } catch (e) {
    console.error('[LPC][AdminOrganisme] adminOuvrirResidents KO:', e);
    showErr("Impossible d'ouvrir la page de jumelage.");
  }
}

/** Ouvre la gestion des résidents de l'organisme (ajout, modification, suppression) : ticket « gestion-residents » créé par le serveur. */
async function ouvrirGestionResidents() {
  hideErr();
  try {
    const res = await adminOuvrirResidentsOrganisme({ ticket });
    console.log('[LPC][AdminOrganisme] ouverture de la gestion des résidents', res);
    if (res && res.refuse) { wixLocation.to('/'); return; }
    if (res && res.ok) { wixLocation.to(PAGE_GESTION_RESIDENTS + '?depuis=organisme'); return; }   // /adminresidents revient ici
    showErr(res && res.reason === 'ticket-invalide'
      ? "La session d'édition a expiré. Retournez à la liste et cliquez de nouveau sur « Modifier »."
      : "Impossible d'ouvrir la gestion des résidents.");
  } catch (e) {
    console.error('[LPC][AdminOrganisme] adminOuvrirResidentsOrganisme KO:', e);
    showErr("Impossible d'ouvrir la gestion des résidents.");
  }
}

/** Ouvre la fiche d'un membre rattaché : le serveur crée le ticket, la page ne connaît que son RANG. */
async function ouvrirMembre(rang) {
  hideErr();
  try {
    const res = await adminOuvrirMembreRattache({ ticket, rang });
    console.log('[LPC][AdminOrganisme] ouverture du membre', rang, res);
    if (res && res.refuse) { wixLocation.to('/'); return; }
    if (res && res.ok) { wixLocation.to(PAGE_MEMBRE + '?depuis=organisme'); return; }   // ?depuis : /adminprofil y revient après l'enregistrement
    showErr(res && res.reason === 'ticket-invalide'
      ? "La session d'édition a expiré. Retournez à la liste et cliquez de nouveau sur « Modifier »."
      : "Impossible d'ouvrir la fiche de ce membre.");
  } catch (e) {
    console.error('[LPC][AdminOrganisme] adminOuvrirMembreRattache KO:', e);
    showErr("Impossible d'ouvrir la fiche de ce membre.");
  }
}


// ─── lien(s) vers le(s) membre(s) dans #TitreLinkAdmin ───────────────────
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Balise ouvrante/fermante de l'élément tel que dessiné dans l'éditeur (style conservé) ; repli sur un paragraphe standard. */
function enveloppe(el) {
  try {
    const m = String(el.html || '').match(/^\s*<(\w+)([^>]*)>/);
    if (m) return { ouvre: '<' + m[1] + m[2] + '>', ferme: '</' + m[1] + '>' };
  } catch (e) { /* ignoré */ }
  return { ouvre: '<p class="font_8">', ferme: '</p>' };
}
/** Un seul membre : le texte lui-même est cliquable. Plusieurs : liens HTML /adminprofil?rang=N (le RANG dans la liste,
 *  jamais un identifiant ; /adminprofil demande alors au serveur d'ouvrir ce membre). */
function remplirLienTitre(lien) {
  const membres = d.membres || [];
  if (!membres.length) { cacher(lien); return; }
  // « Prénom Nom (statuts) » : les statuts aident à reconnaître le membre
  const etiquette = (m) => m.nom;   // sans les statuts (Bruno, 02/10)
  if (membres.length === 1) {
    try { if ('text' in lien) lien.text = etiquette(membres[0]); } catch (e) { /* ignoré */ }
    try { if ('label' in lien) lien.label = etiquette(membres[0]); } catch (e) { /* ignoré */ }
    if (typeof lien.onClick === 'function') lien.onClick(() => ouvrirMembre(membres[0].rang));
  } else {
    const html = membres.map((m) => '<a href="' + PAGE_MEMBRE + '?rang=' + m.rang + '&amp;depuis=organisme">' + esc(etiquette(m)) + '</a>').join(', ');
    let ok = false;
    try { if (lien.html !== undefined) { const w = enveloppe(lien); lien.html = w.ouvre + html + w.ferme; ok = true; } } catch (e) { ok = false; }
    if (!ok) { try { lien.text = membres.map(etiquette).join(', '); } catch (e) { /* ignoré */ } }
  }
  montrer(lien);
}

/** Liste des membres rattachés : seulement « Prénom Nom », cliquable, qui ouvre la fiche du membre (#membreNom). */
function remplirMembres() {
  const lienTitre = premier(IDS_LIEN);
  if (lienTitre) {   // #TitreLinkMembre d'abord, #TitreLinkAdmin en repli ; l'autre, s'il existe, est replié
    IDS_LIEN.forEach((id) => { const e = optionnel(id); if (e && e !== lienTitre && e.id !== lienTitre.id) cacher(e); });
    remplirLienTitre(lienTitre); cacher(optionnel(EL.repeaterMembres)); return;
  }
  const r = optionnel(EL.repeaterMembres);
  const membres = d.membres || [];
  console.log('[LPC][AdminOrganisme] membres rattachés :', membres.length, '| répéteur :', r ? 'présent' : 'absent');
  if (!r) return;
  r.onItemReady(($item, m) => {
    const e = $item('#membreNom');
    if (!e) return;
    try { if ('text' in e) e.text = m.nom; } catch (err) { /* ignoré */ }
    try { if ('label' in e) e.label = m.nom; } catch (err) { /* ignoré */ }
    if (typeof e.onClick === 'function') e.onClick(() => ouvrirMembre(m.rang));
  });
  r.data = membres.map((m) => ({ ...m, _id: 'membre-' + m.rang }));
  if (membres.length) { try { r.expand(); } catch (e) { /* ignoré */ } try { r.show(); } catch (e) { /* ignoré */ } }
}

/** Téléphone et fonction du CONTACT (premier membre rattaché) : champs ÉDITABLES, enregistrés sur la fiche de ce membre. */
function remplirContact() {
  const c = d.contact;
  const tel = optionnel(ID.telephone);
  const fon = optionnel(ID.fonction);
  console.log('[LPC][AdminOrganisme] contact :', c ? c.nom : 'aucun', '| membres :', d.nbMembres, '| champs :', Boolean(tel), Boolean(fon));
  if (!c) { cacher(tel); cacher(fon); return; }
  setVal(ID.telephone, c.telephone);
  setVal(ID.fonction, c.fonction);
  [tel, fon].forEach((e) => { montrer(e); try { if (e && e.resetValidityIndication) e.resetValidityIndication(); } catch (err) { /* ignoré */ } });
  const lib = optionnel(EL.libelleContact);
  if (lib) {
    try { lib.text = 'Téléphone et fonction de ' + c.nom + (d.nbMembres > 1 ? ' (premier des ' + d.nbMembres + ' membres rattachés)' : ''); } catch (e) { /* ignoré */ }
    montrer(lib);
  }
}

/** Bouton « Résidents » : seulement pour un organisme ACCUEILLANT. */
function boutonResidents() {
  // #btnResidents : GESTION des résidents (organisme accueillant, même sans résident encore) ; #BtnJumelage2 : JUMELAGE (dès qu'il y a des résidents)
  const g = optionnel('#btnResidents');
  if (g) {
    if (d.accueillant === true) {
      montrer(g);
      if (typeof g.onClick === 'function') g.onClick(() => ouvrirGestionResidents());
    } else cacher(g);
  }
  const b = optionnel(EL.btnResidents);
  const nb = d.residents ? d.residents.total : 0;
  console.log('[LPC][AdminOrganisme] accueillant :', d.accueillant === true, '| résidents :', nb, '| bouton gestion :', Boolean(g), '| bouton jumelage :', Boolean(b));
  if (!b) return;
  if (!(nb > 0)) { cacher(b); return; }
  montrer(b);
  if (typeof b.onClick === 'function') {
    b.onClick(() => {
      ouvrirResidents();
    });
  }
}

// ─── jumelages de l'organisme (12/10) ────────────────────────────────────
function montrerParents(el) {
  try {
    let x = el && el.parent;
    for (let i = 0; x && i < 6; i++) {
      const id = String(x.id || '');
      if (/^(section|page|masterpage)/i.test(id)) break;
      if (x.hidden === true || x.collapsed === true) montrer(x);
      x = x.parent;
    }
  } catch (e) { /* ignoré */ }
}
/** Titre « Jumelages : N » + tableau (une ligne par jumelage en cours : résident, chambre, porteur). Replié pour un organisme sans résident. */
function afficherJumelagesOrganisme() {
  const liste = (d.jumelages && d.jumelages.liste) || [];
  const box = premier(IDS_BOX_JUM);
  const titre = premier(IDS_TITRE_JUM);
  const tab = premier(IDS_TABLE_JUM);
  console.log('[LPC][AdminOrganisme] jumelages :', liste.length, '| boîte :', box ? box.id : 'introuvable', '| titre :', titre ? titre.id : 'introuvable', '| tableau :', tab ? tab.id : 'introuvable');
  const r = d.residents || { total: 0 };
  if (!liste.length && !(d.accueillant === true || r.total > 0)) { cacher(box); cacher(titre); cacher(tab); return; }
  if (box) { montrer(box); montrerParents(box); }
  if (titre) {
    try { titre.text = liste.length ? (liste.length > 1 ? 'Jumelages : ' : 'Jumelage : ') + liste.length : 'Pas de jumelage en cours'; montrer(titre); montrerParents(titre); }
    catch (e) { console.error('[LPC][AdminOrganisme] titre des jumelages KO :', e); }
  }
  if (!tab) { if (liste.length) console.warn('[LPC][AdminOrganisme] #OrgtableJumelage introuvable : jumelages non affichés'); return; }
  if (!liste.length) { cacher(tab); return; }
  try {
    // Colonnes fusionnées avec celles de l'éditeur (comme #tableJumelage de /adminprofil) ; les dataPath réellement retenus servent aux lignes
    let dp = COLONNES_JUM.map((c) => c.dataPath);
    try {
      const actuelles = Array.isArray(tab.columns) ? tab.columns : [];
      console.log('[LPC][AdminOrganisme] colonnes de l’éditeur :', JSON.stringify(actuelles.map((c) => c && { dataPath: c.dataPath, label: c.label, width: c.width })));
      tab.columns = COLONNES_JUM.map((c, i) => Object.assign({}, actuelles[i] || {}, c));
      const apres = Array.isArray(tab.columns) ? tab.columns : [];
      if (apres.length >= 3) dp = apres.slice(0, 3).map((c, i) => (c && c.dataPath) || dp[i]);
    } catch (e) { console.warn('[LPC][AdminOrganisme] colonnes de #OrgtableJumelage non posées (' + (e && e.message) + ')'); }
    try { if (tab.customClassList) tab.customClassList.add('lpc-table-jumelage'); } catch (e) { /* classe sans effet : style du tableau dans l'éditeur */ }
    tab.rows = liste.map((x, i) => {
      const o = { _id: 'j' + (i + 1) };
      [x.resident || '', x.chambre || '', x.porteur || ''].forEach((v, k) => { o[dp[k]] = v; });
      return o;
    });
    console.log('[LPC][AdminOrganisme] #OrgtableJumelage : lignes posées', liste.length, '| dataPath', dp.join(', '));
    montrer(tab); montrerParents(tab);
  } catch (e) { console.error('[LPC][AdminOrganisme] tableau des jumelages KO :', e); }
}

// ─── préremplissage ──────────────────────────────────────────────────────
function remplir() {
  const o = d.organisation || {};
  safe('titre', () => {
    const t = premier(IDS_TITRE);
    if (!t) return;
    // Titre à 3 liens (Bruno, 02/10) : « Fiche « X » [membre] [Résidents : N] [Jumelés : M] » (sans tiret depuis le 04/10, les éléments sont simplement espacés). #TitreAdmin porte le début,
    // #TitreLinkMembre le(s) membre(s) (/adminprofil), #TitreLinkResidents « Résidents : N » (/adminresidents : gestion des résidents),
    // #TitreLinkJumelages « Jumelés : M » (/adminjumelages : jumelage des résidents de cet organisme).
    const membres = d.membres || [];
    const r = d.residents || { total: 0, jumeles: 0 };
    const nom = 'Fiche « ' + (o.nom || '(sans nom)') + ' »';
    const finTitre = membres.length ? '' : ' (aucun membre rattaché)';
    const lienRes = premier(IDS_LIEN_RESIDENTS);
    const lienJum = premier(IDS_LIEN_JUMELES);
    const afficherResidents = d.accueillant === true || r.total > 0;   // un accueillant peut en ajouter même sans résident
    const afficherJumeles = r.total > 0;
    const txtRes = 'Résidents : ' + r.total;
    const txtJum = 'Jumelés : ' + r.jumeles;
    // SEUL « Jumelés : M » est un lien (rouge #C61010, souligné), en HTML.
    // Le lien est une adresse (/adminjumelages?depuis=organisme) : la page de jumelage demande alors au serveur d'ouvrir les
    // résidents de l'organisme du ticket en cours (aucun identifiant dans l'URL). Si le texte n'accepte pas le HTML : clic sur tout le texte.
    const lierJumeles = (e, n, repli) => {
      let ok = false;
      try {
        if (e.html !== undefined) {
          const w = enveloppe(e);
          e.html = w.ouvre + '<a href="' + PAGE_RESIDENTS + '?depuis=organisme" style="color:#C61010; text-decoration:underline;">Jumelés : ' + n + '</a>' + w.ferme;
          ok = true;
        }
      } catch (x) { ok = false; }
      if (ok) montrer(e); else poser(e, repli, () => ouvrirResidents());
    };
    const poser = (e, txt, fn) => {
      try { if ('text' in e) e.text = txt; } catch (x) { /* ignoré */ }
      try { if ('label' in e) e.label = txt; } catch (x) { /* ignoré */ }
      if (typeof e.onClick === 'function') e.onClick(fn);
      montrer(e);
    };
    console.log('[LPC][AdminOrganisme] titre : TitreAdmin', Boolean(t), '| lien résidents', Boolean(lienRes), '| lien jumelés', Boolean(lienJum),
      '| résidents', r.total, '| jumelés', r.jumeles);
    if (!afficherResidents) { cacher(lienRes); cacher(lienJum); t.text = nom + finTitre; }
    else if (lienRes) {
      t.text = nom + finTitre;
      if (lienJum) {
        poser(lienRes, txtRes, () => ouvrirGestionResidents());
        if (afficherJumeles) lierJumeles(lienJum, r.jumeles, txtJum); else cacher(lienJum);
      } else {
        // Pas d'élément « Jumelés » : tout dans le lien Résidents (le jumelage reste accessible par #BtnJumelage2)
        poser(lienRes, txtRes + (afficherJumeles ? ' ' + txtJum : ''), () => ouvrirGestionResidents());
        console.warn('[LPC][AdminOrganisme] #TitreLinkJumelages introuvable : « Jumelés » écrit dans le lien Résidents');
      }
    } else {
      // Aucun lien de titre : tout dans #TitreAdmin (non cliquable) ; les boutons restent les entrées
      t.text = nom + ' ' + txtRes + (afficherJumeles ? ' ' + txtJum : '') + finTitre;
      console.warn('[LPC][AdminOrganisme] #TitreLinkResidents introuvable : titre non cliquable (vérifier l’ID dans Propriétés, validé par Entrée)');
    }
    try { t.expand(); } catch (e) { /* ignoré */ }
    try { t.show(); } catch (e) { /* ignoré */ }
  });
  safe('membres rattachés', remplirMembres);
  safe('contact (téléphone, fonction)', remplirContact);
  safe('bouton résidents', boutonResidents);
  safe('consentement RGPD (valeur)', () => griserRgpd(d.consentementRgpd === true));
  safe('options type organisme', () => {
    const t = $w(ID.organismeType);
    const options = d.typeOptions || [];
    if (t.options !== undefined) t.options = options.map((v) => ({ label: v, value: v }));
    const cible = options.find((x) => normTxt(x) === normTxt(o.type || ''));
    if (cible) {
      t.value = cible;
      const i = options.indexOf(cible);
      if (i >= 0 && t.selectedIndex !== i) {
        try { t.selectedIndex = i; } catch (e) { /* composant sans selectedIndex */ }
      }
    }
    console.log('[LPC][AdminOrganisme] type :', JSON.stringify({ enBase: o.type || '', choisi: cible || null, options: options.length, valeurLue: t.value }));
  });
  safe('options capacites', () => {
    $w(ID.capacites).options = (d.capaciteOptions || []).map((v) => ({ label: v, value: v }));
  });
  safe('organisme', () => {
    setVal(ID.organisme, o.nom);
    setVal(ID.organismeAdresse, o.adresse);
    setVal(ID.nombreDestinataires, o.nombreDestinataires);
    setVal(ID.capacites, o.capacites);
    setVal(ID.commentaire, o.commentaire);
  });
  safe('remise à zéro des indications de validité', () => {
    ['organisme', 'organismeType', 'organismeAdresse', 'nombreDestinataires', 'capacites', 'commentaire'].forEach((k) => {
      const el = optionnel(ID[k]);
      if (el && typeof el.resetValidityIndication === 'function') {
        try { el.resetValidityIndication(); } catch (e) { /* ignoré */ }
      }
    });
  });
}

// ─── enregistrement ──────────────────────────────────────────────────────
/** Type retenu : .value, ou l'option pointée par selectedIndex si la valeur est vide. */
function typeChoisi() {
  const el = optionnel(ID.organismeType);
  if (!el) return '';
  let v = (el.value || '').trim();
  if (!v && Number.isInteger(el.selectedIndex) && el.selectedIndex >= 0) {
    const opt = (el.options || [])[el.selectedIndex];
    v = ((opt && (opt.value || opt.label)) || '').trim();
  }
  return v;
}

async function sauver() {
  hideErr();
  safe('trace du clic', () => {
    const up = boutonLogo();
    const c = premierPresent(LOGO_CONSENT_IDS);
    console.log('[LPC][AdminOrganisme] clic Enregistrer', { boutonLogo: up ? '#' + up.id : 'introuvable', fichiers: up && up.value ? up.value.length : 0,
      caseLogo: c ? '#' + c.id : 'introuvable', cochee: c ? c.checked : null, messageErreur: Boolean(optionnel(EL.erreur)) });
  });
  const nom = (valeur(ID.organisme) || '').trim();
  if (!nom) { showErr("Merci d'indiquer le nom de l'organisme."); return; }
  if (!typeChoisi()) { showErr("Merci de choisir le type de l'organisme."); return; }
  if (logoSansConsentement()) { showErr(MSG_LOGO_CONSENT); return; }

  desactiverBouton();
  let logoUrl = '';
  try { logoUrl = await televerserLogo(); console.log('[LPC][AdminOrganisme] logo téléversé :', Boolean(logoUrl)); }
  catch (e) {
    console.error('[LPC][AdminOrganisme] upload logo KO:', e);
    showErr(MSG_LOGO_ECHEC);
    activerBouton();
    return;
  }
  try {
    const res = await adminEnregistrerOrganisme({
      ticket,
      nom,
      type: typeChoisi(),
      adresse: valeur(ID.organismeAdresse),
      nombreDestinataires: valeur(ID.nombreDestinataires),
      capacites: valeur(ID.capacites),
      commentaire: valeur(ID.commentaire),
      logoUrl,
      supprimerLogo: logoASupprimer,
      consentementLogo: consentementLogoCoche(),
      // téléphone et fonction du contact : désigné par son rang ET son nom (le serveur refuse si la liste a changé)
      contact: d.contact && optionnel(ID.telephone) && optionnel(ID.fonction)
        ? { rang: d.contact.rang, nom: d.contact.nom, telephone: valeur(ID.telephone), fonction: valeur(ID.fonction) }
        : undefined,
    });
    console.log('[LPC][AdminOrganisme] enregistrement', res);
    if (res && res.ok && res.pushWix === false) console.warn('[LPC][AdminOrganisme] compte Wix du contact NON mis à jour (téléphone / fonction)');
    if (res && res.refuse) { wixLocation.to('/'); return; }
    if (res && res.reason === 'consentement-logo-requis') { showErr(MSG_LOGO_CONSENT); activerBouton(); return; }
    if (res && res.reason === 'logo-invalide') { showErr(MSG_LOGO_INVALIDE); activerBouton(); return; }
    if (res && res.ok) { wixLocation.to(pageRetour()); return; }
    showErr(res && res.reason === 'ticket-invalide'
      ? "La session d'édition a expiré. Retournez à la liste et cliquez de nouveau sur « Modifier »."
      : "L'enregistrement a échoué, merci de réessayer dans un instant.");
  } catch (e) {
    console.error('[LPC][AdminOrganisme] adminEnregistrerOrganisme KO:', e);
    showErr('Une erreur est survenue, merci de réessayer dans un instant.');
  }
  activerBouton();
}

// ─── messages ────────────────────────────────────────────────────────────
function normTxt(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
}
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
/** Message d'erreur : #messageErreur de la page (près du formulaire, 12/10, demande de Bruno), à défaut #errorText de la section Navigation. */
function elErreur() { return optionnel(EL.erreur) || premier(IDS_ERREUR); }
function showErr(msg, couleur) {
  console.warn('[LPC][AdminOrganisme] message :', msg);
  const e = elErreur();
  if (!e) { console.error('[LPC][AdminOrganisme] paragraphe ' + EL.erreur + ' introuvable : message non affiché'); return; }
  try {
    if (e.html !== undefined) e.html = `<p style="color:${couleur || COULEUR_ERREUR}; margin:0;">${escapeHtml(msg)}</p>`;
    else if (e.text !== undefined) e.text = msg;
    if (e.expand) e.expand();
    if (e.show) e.show();
    try { if (typeof e.scrollTo === 'function') e.scrollTo(); } catch (x) { /* ignoré */ }
  } catch (err) {
    console.error('[LPC][AdminOrganisme] affichage du message KO :', err);
  }
}
function hideErr() {
  [premier(IDS_ERREUR), optionnel(EL.erreur)].forEach(masquerErr);
}
function masquerErr(e) {
  if (!e) return;
  try {
    if (e.html !== undefined) e.html = '<p style="color:transparent; margin:0;">&nbsp;</p>';
    else if (e.text !== undefined) e.text = '';
    if (e.collapse) e.collapse();
  } catch (err) { /* ignoré */ }
}

// ─── utilitaires tolérants aux ID manquants ──────────────────────────────
function safe(label, fn) {
  try { fn(); } catch (e) { console.error('[LPC][AdminOrganisme] ' + label + ' KO:', e); }
}
/** Premier élément présent parmi des ID candidats, null sinon. */
function premier(ids) {
  for (const id of ids) { const e = optionnel(id); if (e) return e; }
  return null;
}
function optionnel(id) {
  try { const e = $w(id); return e && typeof e.type === 'string' ? e : null; }
  catch (err) { return null; }
}
function montrer(el) {
  if (!el) return;
  try { if (el.expand) el.expand(); } catch (e) { /* ignoré */ }
  try { if (el.show) el.show(); } catch (e) { /* ignoré */ }
}
function cacher(el) {
  if (!el) return;
  try { if (el.collapse) el.collapse(); } catch (e) { /* ignoré */ }
  try { if (el.hide) el.hide(); } catch (e) { /* ignoré */ }
}
function setVal(id, v) {
  const el = optionnel(id);
  if (el && v !== undefined && v !== null) el.value = v;
}
function valeur(id) {
  const el = optionnel(id);
  return el ? el.value : undefined;
}
function desactiverBouton() { const b = optionnel(ID.enregistrer); if (b && b.disable) b.disable(); }
function activerBouton() { const b = optionnel(ID.enregistrer); if (b && b.enable) b.enable(); }
function clic(id, fn) {
  const el = optionnel(id);
  if (el && typeof el.onClick === 'function') el.onClick(fn);
  else console.error('[LPC][AdminOrganisme] bouton ' + id + ' introuvable : le formulaire ne pourra pas être envoyé');
}
function checkIds() {
  const utiles = ['organisme', 'organismeType', 'organismeAdresse', 'nombreDestinataires', 'capacites', 'commentaire', 'enregistrer'];
  const manquants = utiles.filter((k) => !optionnel(ID[k])).map((k) => `${k}=${ID[k]}`);
  if (manquants.length) {
    console.warn('[LPC][AdminOrganisme] éléments introuvables :', manquants.join(', '));
    try {
      $w('Button').forEach((x) => console.warn('[LPC][AdminOrganisme] bouton présent :', x.id, '|', String(x.label || '').slice(0, 40)));
    } catch (e) { /* ignoré */ }
  } else {
    console.log('[LPC][AdminOrganisme] tous les éléments sont présents');
  }
}

// ─── inventaire des éléments de la page (diagnostic, 01/10) ──────────────
// Après la conversion de la section Navigation en section globale, Wix a renommé les ID de ses éléments et refuse de les
// rétablir. Cette liste écrit en console TOUS les éléments de la page (type, ID, libellé) : « inventaire » dans le filtre
// de la console. Mettre INVENTAIRE à false une fois les ID repris dans le code.
const INVENTAIRE = false;
function inventaire(pref) {
  if (!INVENTAIRE) return;
  const types = ['Button', 'Text', 'TextInput', 'TextBox', 'Dropdown', 'Repeater', 'Image', 'Checkbox', 'CheckboxGroup',
    'UploadButton', 'Container', 'Section', 'Line'];
  types.forEach((type) => {
    let liste = [];
    try { const t = $w(type); for (let i = 0; i < t.length; i++) liste.push(t[i]); } catch (e) { liste = []; }
    liste.forEach((x) => {
      let lib = '';
      try { lib = String(x.label || x.text || x.placeholder || x.alt || '').replace(/\s+/g, ' ').slice(0, 50); } catch (e) { lib = ''; }
      let parent = '';
      try { parent = x.parent && x.parent.id ? ' (dans #' + x.parent.id + ')' : ''; } catch (e) { parent = ''; }
      console.log('[LPC][' + pref + '][inventaire] ' + type + ' #' + x.id + parent + (lib ? ' | « ' + lib + ' »' : ''));
    });
  });
}

// ─── bouton « Jumelage » de la navigation (02/10) ────────────────────────
// Trouvé SANS dépendre d'un ID exact : ID connus, puis tout élément (bouton, icône, boîte, texte) dont l'ID contient « jumelage »
// (casse ignorée, hors boutons d'action « Btn… »), puis un bouton libellé « Jumelage(s) ». Lien posé ET clic branché. La console dit
// ce qui a été trouvé, ou liste les éléments dont l'ID contient « jumel » / « onglet ».
function cablerJumelages() {
  const URL = '/adminjumelages?tous=1';
  const ids = ['#ongletsJumelagesAdmin', '#ongletsJumelages', '#ongletJumelagesAdmin', '#ongletJumelages'];
  let b = null;
  for (const id of ids) { try { const e = $w(id); if (e && typeof e.type === 'string') { b = e; break; } } catch (e) { /* suivant */ } }
  const tous = [];
  ['Button', 'IconButton', 'StylableButton', 'Box', 'Container', 'Text'].forEach((type) => {
    let t = null; try { t = $w(type); } catch (e) { t = null; }
    if (!t) return;
    for (let i = 0; i < t.length; i++) tous.push(t[i]);
  });
  if (!b) b = tous.find((x) => /jumelage/i.test(String(x.id || '')) && !/^btn/i.test(String(x.id || ''))) || null;
  if (!b) b = tous.find((x) => { try { return /^\s*jumelages?\s*$/i.test(String(x.label || x.text || '')) && !/^btn/i.test(String(x.id || '')); } catch (e) { return false; } }) || null;
  if (!b) {
    console.warn('[LPC][nav] bouton « Jumelage » INTROUVABLE. Éléments avec « jumel » ou « onglet » dans l’ID :',
      tous.filter((x) => /jumel|onglet/i.test(String(x.id || ''))).map((x) => '#' + x.id + ' (' + x.type + ')').join(' ') || '(aucun)');
    return;
  }
  try { b.link = URL; } catch (e) { console.warn('[LPC][nav] lien non posé sur #' + b.id + ' :', e && e.message); }
  if (typeof b.onClick === 'function') b.onClick(() => wixLocation.to(URL));
  try { if (b.show) b.show(); } catch (e) { /* ignoré */ }
  console.log('[LPC][nav] bouton « Jumelage » câblé : #' + b.id + ' (' + b.type + ') → ' + URL);
}

// ─── logo de l'organisation (12/10) ──────────────────────────────────────
// Éléments (ajoutés par Bruno) : #uploadLogo (téléversement), #consentementlogo (autorisation, exigée avec un nouveau fichier),
// #logoActuel (aperçu du logo enregistré) et #retirerLogo (retrait). Tous tolérés absents (avertissement console).
const LOGO_UPLOAD_IDS = ['#uploadLogo', '#uploadButtonLogo', '#logoUpload', '#logo'];
const LOGO_CONSENT_IDS = ['#consentementlogo', '#consentementLogo'];
const LOGO_APERCU_IDS = ['#logoActuel', '#imageLogo', '#logoApercu', '#apercuLogo'];
const LOGO_RETRAIT_IDS = ['#retirerLogo', '#supprimerLogo', '#btnRetirerLogo', '#buttonRetirerLogo'];
let logoASupprimer = false;

function premierPresent(ids) {
  for (const id of ids) {
    try { const e = $w(id); if (e && typeof e.type === 'string') return e; } catch (err) { /* suivant */ }
  }
  return null;
}
/** Le bouton de téléversement du logo (doit exposer uploadFiles), sinon l'unique UploadButton de la page. */
function boutonLogo() {
  for (const id of LOGO_UPLOAD_IDS) {
    try { const e = $w(id); if (e && typeof e.uploadFiles === 'function') return e; } catch (err) { /* suivant */ }
  }
  try {
    const tous = $w('UploadButton');
    if (tous && tous.length === 1) return tous[0];
  } catch (e) { /* type non supporté */ }
  return null;
}
/** Aperçu et retrait du logo déjà enregistré ; case d'autorisation préremplie. */
function initLogo(url, consentement) {
  const up = boutonLogo();
  const caseL = premierPresent(LOGO_CONSENT_IDS);
  const apercu = premierPresent(LOGO_APERCU_IDS);
  const retrait = premierPresent(LOGO_RETRAIT_IDS);
  console.log('[LPC][logo] téléversement', up ? '#' + up.id : 'INTROUVABLE', '| case', caseL ? '#' + caseL.id : 'INTROUVABLE',
    '| aperçu', apercu ? '#' + apercu.id : 'absent', '| retrait', retrait ? '#' + retrait.id : 'absent', '| logo enregistré :', Boolean(url));
  if (caseL) { try { caseL.checked = Boolean(url) && consentement === true; } catch (e) { /* ignoré */ } }
  const cacherEl = (e) => { if (!e) return; try { e.hide(); if (e.collapse) e.collapse(); } catch (x) { /* ignoré */ } };
  const montrerEl = (e) => { if (!e) return; try { if (e.expand) e.expand(); e.show(); } catch (x) { /* ignoré */ } };
  if (!url) { cacherEl(apercu); cacherEl(retrait); return; }
  if (apercu) { try { apercu.src = url; if (apercu.alt !== undefined) apercu.alt = 'Logo actuel'; } catch (e) { console.warn('[LPC][logo] aperçu KO :', e && e.message); } montrerEl(apercu); }
  if (retrait && typeof retrait.onClick === 'function') {
    try { if ('label' in retrait) retrait.label = 'Retirer ce logo'; } catch (e) { /* ignoré */ }
    montrerEl(retrait);
    retrait.onClick(() => {
      logoASupprimer = true;
      cacherEl(apercu); cacherEl(retrait);
      if (caseL) { try { caseL.checked = false; } catch (e) { /* ignoré */ } }
    });
  }
}
/** Téléverse le fichier en attente ; renvoie l'URI Wix Media, '' s'il n'y en a pas, lève une erreur en cas d'échec. */
async function televerserLogo() {
  const up = boutonLogo();
  if (!up || !up.value || !up.value.length) return '';
  const files = await up.uploadFiles();
  const url = files && files.length ? (files[0].fileUrl || files[0].url || '') : '';
  console.log('[LPC][logo] uploadFiles ->', url ? 'ok' : 'sans adresse');
  if (!url) throw new Error('uploadFiles sans adresse');
  return url;
}
/** Vrai si un fichier est en attente alors que la case d'autorisation n'est pas cochée. */
function logoSansConsentement() {
  try {
    const up = boutonLogo();
    const c = premierPresent(LOGO_CONSENT_IDS);
    return Boolean(up && up.value && up.value.length > 0 && c && c.checked !== true);
  } catch (e) { return false; }
}
/** État de la case d'autorisation (undefined si la case est absente). */
function consentementLogoCoche() {
  const c = premierPresent(LOGO_CONSENT_IDS);
  return c ? c.checked === true : undefined;
}
const MSG_LOGO_ECHEC = 'Le téléversement du logo a échoué. Merci de réessayer, ou de retirer le fichier pour enregistrer sans logo.';
const MSG_LOGO_CONSENT = 'Merci de cocher la case d’autorisation d’utilisation du logo (ou de retirer le fichier).';
const MSG_LOGO_INVALIDE = 'Le logo n’a pas été accepté : merci de choisir une image (PNG, JPG ou WebP).';
