// Code de PAGE « Adminjumelage » (/adminjumelages) : jumelage MANUEL porteur <-> résident, par un administrateur.
// version du code : 2026-10-12-a   (12/10 : bouton Jumelage de la navigation fonctionne depuis la liste d'un porteur ; 07/10 : « Centres d'intérêt » et « Infos importantes » tronqués à 60 caractères à l'affichage ; 06/10 : colonnes indicateur A / indicateur B remplacées par « Infos importantes » ; ordre Centres d'intérêt, Infos importantes ;
//   #c8 masqué ; Résident -> lien vers /adminresidents, Institution -> lien vers /adminorganisme)
//
// Page « Membres uniquement » : le contrôle réel est dans le backend (backend/admin.web.js -> backend/lpc-acces.js). Aucune
// donnée n'est reçue par un non-admin. Ce que la page montre dépend du TICKET « residents » créé par l'entrée choisie :
//   - lien du titre ou bouton « Jumelage » de /adminorganisme (ou de /adminprofil d'un accueillant) : TOUS les résidents de CET organisme
//   - bouton « Jumelage » de /adminprofil d'un porteur : CE porteur (liste déroulante réduite à lui), les résidents non jumelés du
//     site (ceux de sa localité d'abord) et les siens
//   - bouton « Jumelage » de la navigation (?tous=1, sans ticket) : TOUS les résidents actifs du site
// La page ne décide de rien : chaque ligne porte l'action que le SERVEUR autorise (« jumeler », « annuler » ou aucune), et le
// serveur la recalcule à chaque clic. Un seul porteur par résident ; « Jumeler » crée un jumelage `actif`, « Annuler » passe
// le jumelage à `annule` (rien n'est supprimé).
//
// Éléments attendus (ID sensibles à la casse) :
//   #SelectPorteur (liste déroulante des porteurs)
//   #repeater (répéteur) ; dans son modèle : textes #c1 … #c8 (colonnes), #c9 (« Mail au porteur » ou message de la ligne), #c10 (« Jumeler » / « Annuler »). AUCUN bouton dans le modèle (05/10)
//   Facultatifs : #texteEmail (texte, repli : affiche le texte du brouillon d'e-mail),
//   #h1 … #h10 (en-têtes, texte ou bouton), #compteur (texte), #TitreAdmin et #errorText (section Navigation globale),
//   onglets de la section Navigation (#ongletMembresAdmin, #ongletOrganismesAdmin, #ongletResidentsAdmin)

import { authentication } from 'wix-members-frontend';
import wixLocation from 'wix-location';
import { adminJumelageDonnees, adminJumeler, adminAnnulerJumelage, adminOuvrirResidents, adminEmailPorteur, adminOuvrirOrganismeDuResident, adminOuvrirResidentsDuResident } from 'backend/admin.web';
import wixWindowFrontend from 'wix-window-frontend';

const TEXTE_LIBRE = ['interets', 'infosimportantes'];   // 07/10 : cellules de texte libre tronquées à l'affichage (2 lignes maximum)
const LONGUEUR_MAX_CELLULE = 60;
const coupe = (id, t) => (TEXTE_LIBRE.includes(id) && t.length > LONGUEUR_MAX_CELLULE ? t.slice(0, LONGUEUR_MAX_CELLULE - 1).trimEnd() + '…' : t);
const VERSION = '2026-10-12-a';   // 12/10 : bouton « Jumelage » depuis une liste de porteur ou d'organisme = même page, tous les résidents (en place) ;   // 06/10 (c) : filtre #dropdownfiltre et colonnes triables (en-têtes #h1…#h7, ▲ / ▼)
const NB_CELLULES = 10;
const COULEUR_ERREUR = '#C0392B';
const CLASSE_TEXTE = 'font_8';
const LIBELLE_EMAIL = 'Mail au porteur';
const IDS_SELECT = ['#SelectPorteur'];
const IDS_REPETEUR = ['#repeater'];
const IDS_TITRE = ['#TitreAdmin', '#titreAdmin'];
const IDS_ERREUR = ['#errorText', '#messageErreur'];
const IDS_COMPTEUR = ['#compteur'];
const IDS_FILTRE = ['#dropdownfiltre', '#dropdownFiltre'];   // filtre d'affichage : Tous, Résidents jumelés, Résidents NON jumelés, un organisme
const IDS_TEXTE_EMAIL = ['#texteEmail'];
const GMAIL_COMPTE = 'lesporteursdechaleur@gmail.com';   // ⚠️ compte Gmail d'envoi à CONFIRMER par Bruno (vide = compte Google par défaut du navigateur)
const LONGUEUR_MAX_URL = 6000;   // au-delà, le texte est aussi copié dans le presse-papiers (⚠️ limite réelle de Gmail non vérifiée)
/** Fenêtre de rédaction Gmail pré-remplie (Bruno, 04/10 : l'envoi se fait depuis Gmail, plus de mailto). Rien n'est envoyé : l'admin relit puis envoie. */
function urlGmail(res) {
  return 'https://mail.google.com/mail/?' + (GMAIL_COMPTE ? 'authuser=' + encodeURIComponent(GMAIL_COMPTE) + '&' : '')
    + 'view=cm&fs=1&to=' + encodeURIComponent(res.a) + '&su=' + encodeURIComponent(res.objet) + '&body=' + encodeURIComponent(res.corps);
}
// Éléments de la section Navigation propres aux autres pages : sans objet ici
const IDS_SANS_OBJET = ['#TitreLinkAdmin', '#TitreLinkMembre', '#TitreLinkResidents', '#TitreLinkJumelages', '#TitreLinkJumelage', '#TitreLinkJumeles'];
const AUCUN = '';
const LIBELLES = { jumeler: 'Jumeler', annuler: 'Annuler' };
const COLONNES = [
  { id: 'nom', label: 'Résident', lien: 'residents' }, { id: 'institution', label: 'Organisme', lien: 'organisme' }, { id: 'localite', label: 'Localité' },
  { id: 'chambre', label: 'Chambre' }, { id: 'interets', label: 'Centres d’intérêt' },
  { id: 'infosimportantes', label: 'Infos importantes' }, { id: 'porteur', label: 'Jumelage' },
];
// Cellules de colonne au-delà de COLONNES, jusqu'à #c8 (les #c9 et #c10 portent les actions) : masquées (06/10, #c8 est vide)
const DERNIERE_CELLULE_COLONNE = 8;

let d = {};
let ticket = '';
let porteurChoisi = AUCUN;
let rendu = 0;   // change à chaque affichage : ID d'items neufs, donc onItemReady toujours rejoué
let occupe = false;
let appel = 0;
let filtre = 'tous';   // valeur du filtre : 'tous' | 'jumeles' | 'non-jumeles' | 'org:<nom de l'organisme>' (filtre d'AFFICHAGE : les données restent celles du serveur)
let tri = { id: null, sens: 1 };   // colonne triée (id de COLONNES) et sens (1 = croissant)
let optionsFiltre = '';
let filtreCable = false;
const entetesCables = new Set();
let tous = false;   // ?tous=1 (bouton « Jumelage » de la navigation) : tous les résidents actifs du site, sans ticket

$w.onReady(async () => {
  console.log('[LPC][AdminJumelage] version du code :', VERSION);
  try { cablerJumelages(); } catch (e) { console.error('[LPC][nav] jumelage KO:', e); }
  safe('mode', () => { tous = String((wixLocation.query || {}).tous || '') === '1'; console.log('[LPC][AdminJumelage] mode :', tous ? 'tous les résidents' : 'ticket'); });
  safe('masquage initial', () => { IDS_SANS_OBJET.forEach((id) => cacher(optionnel(id))); cacher(premier(IDS_TEXTE_EMAIL)); hideErr(); });
  safe('navigation vers les listes', cablerNavigationAdmin);
  // 12/10 : Wix ne rejoue pas onReady quand seule la chaîne de requête change (même page) : le lien du bouton « Jumelage » est suivi ici
  safe('changement d’adresse', () => wixLocation.onChange(() => {
    if (String((wixLocation.query || {}).tous || '') === '1') versTous();
  }));
  if (!authentication.loggedIn()) { wixLocation.to('/participer'); return; }

  // Arrivée par le lien « Jumelés : N » du titre de /adminorganisme (?depuis=organisme) : le serveur ouvre les résidents de l'organisme
  // du ticket « organismes » en cours, puis la page se charge normalement (aucun identifiant dans l'URL).
  try {
    if (String((wixLocation.query || {}).depuis || '') === 'organisme') {
      const r = await adminOuvrirResidents({ origine: 'organisme' });
      console.log('[LPC][AdminJumelage] ouverture depuis l’organisme', r);
      if (r && r.refuse) { wixLocation.to('/'); return; }
      if (!r || !r.ok) { showErr("Impossible d'ouvrir le jumelage de cet organisme (session expirée ? rouvrez la fiche de l'organisme)."); return; }
    }
  } catch (e) {
    console.error('[LPC][AdminJumelage] ouverture depuis l’organisme KO:', e);
    showErr("Impossible d'ouvrir le jumelage de cet organisme.");
    return;
  }

  const manquants = [...IDS_SELECT, ...IDS_REPETEUR].filter((id) => !optionnel(id));
  if (manquants.length) console.warn('[LPC][AdminJumelage] ID introuvables :', manquants.join(' '));

  safe('câblage', () => {
    const s = premier(IDS_SELECT);
    if (s) s.onChange(() => { porteurChoisi = String(s.value || AUCUN); charger(); });
    const r = premier(IDS_REPETEUR);
    if (r) r.onItemReady(($item, ligne) => remplirItem($item, ligne));
  });
  safe('en-têtes', afficherEntetes);

  await charger(true);
});

/**
 * Bouton « Jumelage » de la navigation (12/10) : depuis la liste d'un porteur (#SelectPorteur désactivé) ou d'un organisme, on revient à la
 * MÊME page avec TOUS les résidents. Wix ne recharge pas une page quand seule la chaîne de requête change (onReady n'est pas rejoué) :
 * `wixLocation.to` ne faisait donc rien ; le changement de mode se fait ici, en place.
 */
function versTous() {
  if (tous) return;   // déjà la liste de tous les résidents (le bouton est câblé deux fois : anti-doublon)
  tous = true;
  porteurChoisi = AUCUN;
  filtre = 'tous';
  console.log('[LPC][AdminJumelage] navigation : tous les résidents (même page, sans rechargement)');
  charger();
}

/** Charge l'état depuis le serveur et le peint. premier = true : première arrivée sur la page. */
async function charger(premiereFois) {
  const n = ++appel;
  hideErr();
  let res = null;
  try {
    res = (await adminJumelageDonnees({ porteur: porteurChoisi, tous })) || {};
  } catch (e) {
    console.error('[LPC][AdminJumelage] adminJumelageDonnees KO:', e);
    if (n === appel) showErr('Impossible de charger les données de jumelage.');
    return;
  }
  if (n !== appel) return;   // réponse d'un appel dépassé
  if (res.refuse) { console.warn('[LPC][AdminJumelage] accès refusé : redirection vers l’accueil'); wixLocation.to('/'); return; }
  if (!res.ok) {
    console.warn('[LPC][AdminJumelage] pas de données :', res.reason);
    safe('vider', () => { const r = premier(IDS_REPETEUR); if (r) r.data = []; });
    showErr(res.reason === 'pas-de-ticket'
      ? "Aucun jumelage n'est ouvert (ou la session a expiré). Retournez à la liste et utilisez « Jumeler », ou le lien « résidents » d'un organisme."
      : 'Données introuvables.');
    return;
  }
  appliquer(res);
}

/** Peint un état complet reçu du serveur (lecture, ou réponse d'un jumelage / d'une annulation). */
function appliquer(res) {
  d = res;
  ticket = res.ticket;
  console.log('[LPC][AdminJumelage] état reçu', { version: res.version, mode: res.mode, porteurs: res.porteurs.length, lignes: res.lignes.length,
    choisi: res.selection ? res.selection.nom : null });
  safe('titre', peindreTitre);
  safe('liste déroulante', peindreSelect);
  safe('filtre', peindreFiltre);
  safe('lignes', afficher);
  safe('compteur', peindreCompteur);
}

function peindreTitre() {
  const t = premier(IDS_TITRE);
  if (!t) return;
  t.text = 'Jumelage : ' + (d.titre || '');
  montrer(t);
}

function peindreCompteur() {
  const c = premier(IDS_COMPTEUR);
  if (!c) return;
  const s = d.selection;
  const n = d.lignes.length;
  const base = n + ' résident' + (n > 1 ? 's' : '');
  c.text = s ? base + ' · ' + s.nom + ' : ' + s.encours + ' / ' + s.max + ' jumelé' + (s.encours > 1 ? 's' : '') + ', ' + s.libres + ' place' + (s.libres > 1 ? 's' : '') + ' libre' + (s.libres > 1 ? 's' : '')
    : base + ' · choisissez un porteur pour jumeler';
  montrer(c);
}

/** Liste déroulante : porteurs proposés par le serveur ; le porteur choisi est conservé après chaque action. */
function peindreSelect() {
  const s = premier(IDS_SELECT);
  if (!s) return;
  const options = [{ label: d.porteurFixe ? '' : 'Choisir un porteur…', value: AUCUN }, ...d.porteurs.map((p) => ({ label: p.label, value: p.id }))];
  s.options = d.porteurFixe ? options.slice(1) : options;
  const choisi = d.selection ? d.selection.id : AUCUN;
  porteurChoisi = choisi;
  s.value = choisi;
  try {
    if (d.porteurFixe && typeof s.disable === 'function') s.disable();
    else if (!d.porteurFixe && typeof s.enable === 'function') s.enable();   // 12/10 : réactivée en passant à « tous les résidents »
  } catch (e) { /* ignoré */ }
  montrer(s);
}

// ─── en-têtes et lignes ──────────────────────────────────────────────────
const nums = (prefixe) => Array.from({ length: NB_CELLULES }, (_, i) => prefixe + (i + 1));

function afficherEntetes() {
  nums('#h').forEach((id, i) => safe('en-tête ' + id, () => {
    const h = optionnel(id);
    if (!h) return;
    const c = COLONNES[i];
    if (!c) { h.hide(); return; }
    const libelle = c.label + (tri.id === c.id ? (tri.sens > 0 ? ' ▲' : ' ▼') : '');
    try { h.label = libelle; } catch (e) { /* élément texte */ }
    try { h.text = libelle; } catch (e) { /* bouton */ }
    h.show();
    // Clic sur l'en-tête = tri par cette colonne (un second clic inverse le sens) ; câblé une seule fois par en-tête
    if (!entetesCables.has(id) && typeof h.onClick === 'function') {
      entetesCables.add(id);
      h.onClick(() => trierPar(COLONNES[i].id));
    }
  }));
}

function trierPar(id) {
  tri = tri.id === id ? { id, sens: -tri.sens } : { id, sens: 1 };
  afficher();
}

/** Liste déroulante #dropdownfiltre : Tous, Résidents jumelés, Résidents NON jumelés, puis un choix par organisme présent dans la liste. */
function peindreFiltre() {
  const dd = premier(IDS_FILTRE);
  if (!dd) { console.warn('[LPC][AdminJumelage] #dropdownfiltre introuvable'); return; }
  const orgs = Array.from(new Set((d.lignes || []).map((l) => l.institution).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'fr'));
  const opts = [
    { label: 'Tous', value: 'tous' },
    { label: 'Résidents jumelés', value: 'jumeles' },
    { label: 'Résidents NON jumelés', value: 'non-jumeles' },
    ...orgs.map((o) => ({ label: 'Organisme : ' + o, value: 'org:' + o })),
  ];
  if (filtre.indexOf('org:') === 0 && !orgs.includes(filtre.slice(4))) filtre = 'tous';
  const signature = JSON.stringify(opts);
  if (signature !== optionsFiltre) { optionsFiltre = signature; dd.options = opts; }
  try { dd.value = filtre; } catch (e) { /* ignoré */ }
  if (!filtreCable && typeof dd.onChange === 'function') {
    filtreCable = true;
    dd.onChange(() => { filtre = String(dd.value || 'tous'); afficher(); });
  }
}

/** Lignes affichées : filtre puis tri, sur les données déjà reçues (aucun appel serveur). Sans tri choisi : ordre du serveur. */
function lignesVisibles() {
  let l = (d.lignes || []).slice();
  if (filtre === 'jumeles') l = l.filter((x) => x.porteur);
  else if (filtre === 'non-jumeles') l = l.filter((x) => !x.porteur);
  else if (filtre.indexOf('org:') === 0) { const o = filtre.slice(4); l = l.filter((x) => x.institution === o); }
  if (tri.id) {
    const cle = tri.id;
    l.sort((a, b) => {
      const va = String(a[cle] == null ? '' : a[cle]);
      const vb = String(b[cle] == null ? '' : b[cle]);
      if (!va && vb) return 1;    // valeurs vides toujours en fin de liste
      if (va && !vb) return -1;
      return tri.sens * va.localeCompare(vb, 'fr', { numeric: true, sensitivity: 'base' });
    });
  }
  return l;
}

function afficher() {
  rendu++;
  const r = premier(IDS_REPETEUR);
  if (!r) return;
  // `_id` unique à chaque rendu (obligé pour rejouer onItemReady) ; l'identifiant réel est dans `id`.
  const lignes = lignesVisibles();
  r.data = lignes.map((l, i) => ({ ...l, rang: i, _id: l.id + '~' + rendu }));
  afficherEntetes();
  if (lignes.length) montrer(r);
}


/** Élément texte d'une ligne s'il existe VRAIMENT (un `$item` d'ID absent renvoie un objet sans méthodes). */
function elementLigne($item, id) {
  try { const e = $item(id); return e && typeof e.onClick === 'function' ? e : null; } catch (err) { return null; }
}

// 05/10 : plus AUCUN bouton dans les lignes (Wix déclarait les boutons masqués mais les affichait partout ; les textes se comportent).
// Les textes de ligne portent les actions. Un style posé par le code (`style.*`) n'est PAS rendu sur les textes (05/10) : l'apparence de
// bouton vient de CLASSES CSS (global.css, voir Code/lpc-boutons.css) que le code pose / retire par `customClassList`.
//   #c10 = « Jumeler » (classe lpc-bouton-plein) ou « Annuler » (lpc-bouton-contour), selon l'action du SERVEUR ; masqué sinon
//   #c9  = « Mail au porteur » (lpc-bouton-plein) seulement si `emailPossible` ; aussi le message de la ligne (sans classe)
// Un texte sans contenu est MASQUÉ (hide), sinon son fond et sa bordure resteraient visibles comme un bouton vide.
const CELLULE_ACTION = '#c10';
const CELLULE_EMAIL = '#c9';
let classesLues = false;
/** Classes d'apparence : variante = 'plein' | 'contour' | null (aucune classe, ex. message). */
function classer(cell, variante) {
  let l = null;
  try { l = cell.customClassList; } catch (e) { l = null; }
  if (!l || typeof l.add !== 'function') { if (!classesLues) { classesLues = true; console.warn('[LPC][AdminJumelage] customClassList indisponible : classes non posées'); } return; }
  try {
    l.remove('lpc-bouton'); l.remove('lpc-bouton-plein'); l.remove('lpc-bouton-contour');
    if (variante) { l.add('lpc-bouton'); l.add('lpc-bouton-' + variante); }
  } catch (e) { console.warn('[LPC][AdminJumelage] classes KO :', e && e.message); }
  if (!classesLues) { classesLues = true; console.log('[LPC][AdminJumelage] customClassList disponible, classes posées :', variante || '(aucune)'); }
}
/** Texte d'action : contenu + classe, masqué si vide. */
function peindreTexteAction(cell, contenu, variante) {
  if (!cell) return;
  if (!contenu) { try { cell.text = ''; } catch (e) { /* ignoré */ } try { cell.hide(); } catch (e) { /* ignoré */ } return; }
  try { cell.text = contenu; } catch (e) { /* ignoré */ }
  classer(cell, variante);
  try { cell.show(); } catch (e) { /* ignoré */ }
}

let dernierClicLien = 0;
/** Liens de la ligne (06/10) : le serveur crée le ticket de l'organisme du résident, puis la page ouvre la fiche. `depuis` ramène ici. */
async function ouvrirFiche(ligne, type) {
  const t = Date.now();
  if (t - dernierClicLien < 600) return;   // anti-doublon
  dernierClicLien = t;
  hideErr();
  try {
    const res = type === 'organisme' ? await adminOuvrirOrganismeDuResident({ resident: ligne.id }) : await adminOuvrirResidentsDuResident({ resident: ligne.id });
    console.log('[LPC][AdminJumelage] ouverture', type, res);
    if (res && res.refuse) { wixLocation.to('/'); return; }
    if (res && res.ok) { wixLocation.to((type === 'organisme' ? '/adminorganisme' : '/adminresidents') + '?depuis=' + (tous ? 'jumelages' : 'jumelage')); return; }
    showErr("Impossible d'ouvrir cette fiche.");
  } catch (e) {
    console.error('[LPC][AdminJumelage] ouverture KO:', e);
    showErr("Impossible d'ouvrir cette fiche.");
  }
}

function remplirItem($item, ligne) {
  COLONNES.forEach((c, i) => safe('cellule c' + (i + 1), () => {
    const cell = $item('#c' + (i + 1));
    if (!cell) return;
    const texte = ligne[c.id] == null ? '' : String(ligne[c.id]);
    if (c.lien && texte && ligne.id) {
      // Nom du résident -> /adminresidents ; institution -> /adminorganisme (souligné + clic ; le ticket est créé côté serveur)
      try { if (cell.html !== undefined) cell.html = '<p class="' + CLASSE_TEXTE + '" style="margin:0;"><u>' + esc(texte) + '</u></p>'; else cell.text = texte; } catch (e) { cell.text = texte; }
      try { if (typeof cell.onClick === 'function') cell.onClick(() => ouvrirFiche(ligne, c.lien === 'organisme' ? 'organisme' : 'residents')); } catch (e) { /* ignoré */ }
    } else cell.text = coupe(c.id, texte);
    cell.show();
  }));
  // Cellules de colonne inutilisées (#c8 : vide) : masquées
  for (let i = COLONNES.length; i < DERNIERE_CELLULE_COLONNE; i++) safe('cellule inutilisée c' + (i + 1), () => {
    const x = $item('#c' + (i + 1));
    try { x.text = ''; } catch (e) { /* ignoré */ }   // contenu vidé d'abord : même si Wix n'honore pas le masquage dans le répéteur, rien ne s'affiche
    cacher(x);
  });

  const action = elementLigne($item, CELLULE_ACTION);
  const mail = elementLigne($item, CELLULE_EMAIL);
  if (ligne.rang === 0) console.log('[LPC][AdminJumelage] éléments de ligne : action ' + CELLULE_ACTION + ' = ' + (action ? action.type : 'ABSENT')
    + ' | mail ' + CELLULE_EMAIL + ' = ' + (mail ? mail.type : 'ABSENT'));

  safe('action de la ligne', () => {
    if (!action) return;
    peindreTexteAction(action, ligne.action ? LIBELLES[ligne.action] : '', ligne.action === 'jumeler' ? 'plein' : 'contour');
    // Le clic est branché même sur un texte masqué : agir() ignore une ligne sans action
    action.onClick(() => agir(ligne, action, $item));
  });
  safe('« Mail au porteur »', () => {
    if (!mail) return;
    peindreTexteAction(mail, ligne.emailPossible ? LIBELLE_EMAIL : '', 'plein');
    mail.onClick(() => { if (ligne.emailPossible) envoyerEmail(mail, ligne); });
  });
}

// ─── message dans la ligne ───────────────────────────────────────────────
// Jumeler sans porteur choisi : le message s'affiche dans #c9 DE LA LIGNE cliquée (05/10 : plus #c10), à la place de son contenu éventuel
// (« Mail au porteur » n'existe que sur une ligne déjà jumelée, jamais sur une ligne « Jumeler »), sans classe de bouton, puis #c9
// retrouve son état d'origine après quelques secondes.
const MSG_SANS_PORTEUR = 'Vous devez sélectionner un porteur';
const CELLULE_MESSAGE = '#c9';
const DUREE_MESSAGE_MS = 4000;
function messageLigne($item, texte, ligne) {
  const cell = elementLigne($item, CELLULE_MESSAGE);
  if (!cell) { showErr(texte); return; }   // pas de cellule #c9 : repli sur le message de la page
  try { cell.text = texte; } catch (e) { /* ignoré */ }
  classer(cell, null);   // le message n'est pas un bouton
  try { cell.show(); } catch (e) { /* ignoré */ }
  // Retour à l'état d'origine : contenu recalculé depuis la ligne (jamais relu dans la cellule), puis, si la liste n'a pas été redessinée
  // entre-temps, redessin complet (recrée les items : fiable même si le masquage d'une cellule déjà posée est resté sans effet).
  const n = rendu;
  setTimeout(() => {
    console.log('[LPC][AdminJumelage] fin du message de ligne');
    try { peindreTexteAction(cell, ligne && ligne.emailPossible ? LIBELLE_EMAIL : '', 'plein'); } catch (e) { /* ligne déjà redessinée */ }
    if (n === rendu && !occupe) safe('redessin après message', afficher);
  }, DUREE_MESSAGE_MS);
}

// ─── actions ─────────────────────────────────────────────────────────────
// Texte d'action en attente de la réponse du serveur (lente) : il devient « En cours… » (la ligne est redessinée dès la réponse).
function attente(cell) {
  if (!cell) return;
  try { cell.text = 'En cours…'; } catch (e) { /* ignoré */ }
}

async function agir(ligne, bouton, $item) {
  if (occupe || !ligne || !ligne.action) return;
  hideErr();
  if (ligne.action === 'jumeler') {   // contrôles côté page pour un message immédiat ; le serveur recontrôle tout
    if (!d.selection) { messageLigne($item, MSG_SANS_PORTEUR, ligne); return; }
    if (d.selection.libres < 1) { showErr(d.selection.nom + ' n’a plus de place libre : choisissez un autre porteur.'); return; }
  }
  occupe = true;
  attente(bouton);
  const porteur = d.selection ? d.selection.id : AUCUN;   // « Annuler » n'a pas besoin du porteur : il retire le jumelage du résident
  let fraiche = null;
  try {
    const appelServeur = ligne.action === 'annuler' ? adminAnnulerJumelage : adminJumeler;
    console.log('[LPC][AdminJumelage] clic', ligne.action, '| résident :', ligne.id, '| porteur :', porteur || '(aucun)', '| tous :', tous);
    const res = await appelServeur({ ticket, porteur, resident: ligne.id, tous });
    console.log('[LPC][AdminJumelage] ' + ligne.action, res && res.ok);
    if (res && res.refuse) { wixLocation.to('/'); return; }
    if (res && res.ok && res.donnees && res.donnees.ok) fraiche = res.donnees;   // nouvel état renvoyé avec la réponse : pas de relecture
    if (!res || !res.ok) {
      const msg = {
        'ticket-invalide': 'La session a expiré. Retournez à la liste et rouvrez le jumelage.',
        'ecriture': 'Écriture impossible dans Jumelages (voir Site Monitoring).',
        'pas-de-porteur': MSG_SANS_PORTEUR,
        'complet': 'Ce porteur n’a plus de place libre : choisissez un autre porteur.',
      }[res && res.reason] || 'Action impossible (état modifié entre-temps). La liste a été actualisée.';
      showErr(msg);
    }
  } catch (e) {
    console.error('[LPC][AdminJumelage] action KO:', e);
    showErr('Une erreur est survenue, merci de réessayer dans un instant.');
  } finally {
    occupe = false;
  }
  porteurChoisi = porteur;
  if (fraiche) appliquer(fraiche);
  else await charger(false);   // échec : relit l'état réel
}

// ─── e-mail de jumelage au porteur (03/10, bouton de LIGNE depuis le 04/10) ───
// Le bouton #btnEmailPorteur est dans le MODÈLE DE LIGNE du répéteur (là où Bruno l'a posé) : une ligne l'affiche seulement si le porteur
// de son jumelage a rempli son quota (`emailPossible`, décidé par le serveur, recontrôlé au clic). Un clic = fenêtre de rédaction Gmail
// pour ce porteur : rien n'est envoyé par le site.
async function envoyerEmail(bouton, ligne) {
  console.log('[LPC][AdminJumelage] clic sur le bouton e-mail | occupé :', occupe, '| porteur complet :', Boolean(ligne && ligne.emailPossible));
  if (occupe || !ligne) return;
  hideErr();
  occupe = true;
  try { if (bouton && typeof bouton.disable === 'function') bouton.disable(); } catch (e) { /* ignoré */ }
  try {
    const res = (await adminEmailPorteur({ resident: ligne.id })) || {};
    console.log('[LPC][AdminJumelage] e-mail porteur', { ok: res.ok, reason: res.reason, nb: res.nb, sansAccord: res.sansAccord });
    if (res.refuse) { wixLocation.to('/'); return; }
    if (!res.ok) {
      showErr({
        'quota-non-rempli': 'Le quota de ce porteur n’est pas rempli : l’e-mail n’est pas disponible.',
        'pas-d-email': 'Ce porteur n’a pas d’adresse e-mail enregistrée.',
        'pas-porteur': 'Ce membre n’écrit pas de cartes (ou n’a pas indiqué leur nombre).',
        'pas-de-jumelage': 'Ce résident n’a pas de porteur jumelé.',
      }[res.reason] || 'Impossible de préparer l’e-mail.');
      return;
    }
    const url = urlGmail(res);
    let note = '';
    if (res.sansAccord > 0) note += res.sansAccord + ' résident' + (res.sansAccord > 1 ? 's' : '') + ' sans accord RGPD enregistré : à vérifier avant d’envoyer. ';
    // Repli : texte du brouillon affiché (si #texteEmail existe) ; copié dans le presse-papiers si possible ou si le lien est long
    const zone = premier(IDS_TEXTE_EMAIL);
    if (zone) { try { zone.text = 'À : ' + res.a + '\nObjet : ' + res.objet + '\n\n' + res.corps; montrer(zone); } catch (e) { /* ignoré */ } }
    if (url.length > LONGUEUR_MAX_URL) {
      try {
        if (wixWindowFrontend && typeof wixWindowFrontend.copyToClipboard === 'function') {
          await wixWindowFrontend.copyToClipboard(res.corps);
          note += 'Le texte du message a aussi été copié dans le presse-papiers. ';
        }
      } catch (e) { console.warn('[LPC][AdminJumelage] copie dans le presse-papiers KO :', e && e.message); }
    }
    if (note) showErr(note.trim(), '#B9770E');
    wixLocation.to(url);
  } catch (e) {
    console.error('[LPC][AdminJumelage] e-mail porteur KO:', e);
    showErr('Impossible de préparer l’e-mail, merci de réessayer dans un instant.');
  } finally {
    occupe = false;
    try { if (bouton && typeof bouton.enable === 'function') bouton.enable(); } catch (e) { /* ignoré */ }
  }
}

// ─── navigation vers les listes de /admin ────────────────────────────────
const URL_JUMELAGES = '/adminjumelages?tous=1';
// Style commun des boutons de navigation (04/10) : inactif = fond blanc, texte et bordure #C61010 ; actif (la page visée = celle-ci) = fond #C61010, texte et bordure blancs
const NAV_ACTIF = 'jumelages';
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
    if (!b) { console.warn('[LPC][AdminJumelage] bouton « ' + n.cle + ' » introuvable'); return; }
    const url = n.url || '/admin?onglet=' + n.cle;
    montrer(b);
    try { b.link = url; } catch (e) { /* repli sur le clic */ }
    if (typeof b.onClick === 'function') b.onClick(() => { if (n.url === URL_JUMELAGES) versTous(); else wixLocation.to(url); });
    peindreNav(b, n.cle === NAV_ACTIF);
  });
  // Diagnostic (02/10) : boutons de la page avec leur lien d'éditeur, pour repérer le bouton « Jumelage » s'il n'est pas reconnu
  try { console.log('[LPC][nav] boutons :', boutons.map((x) => { let l = ''; try { l = String(x.link || ''); } catch (e) { l = '?'; } return '#' + x.id + ' « ' + String(x.label || '').slice(0, 20) + ' » → ' + (l || '(aucun)'); }).join(' | ')); } catch (e) { /* ignoré */ }
  // Tout bouton dont le lien d'éditeur pointe encore vers /mes-residents (ancien bouton « Résidents » devenu « Jumelage ») est redirigé
  boutons.filter((x) => { try { return /mes-residents/i.test(String(x.link || '')); } catch (e) { return false; } }).forEach((b) => {
    try { b.link = URL_JUMELAGES; } catch (e) { /* repli sur le clic */ }
    if (typeof b.onClick === 'function') b.onClick(() => versTous());
    console.log('[LPC] bouton #' + b.id + ' (lien /mes-residents) redirigé vers ' + URL_JUMELAGES);
  });
}

// ─── messages ────────────────────────────────────────────────────────────
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function showErr(msg, couleur) {
  console.warn('[LPC][AdminJumelage] message :', msg);
  const e = premier(IDS_ERREUR);
  if (!e) { console.error('[LPC][AdminJumelage] #errorText introuvable : message non affiché'); return; }
  try {
    if (e.html !== undefined) e.html = '<p class="' + CLASSE_TEXTE + '" style="color:' + (couleur || COULEUR_ERREUR) + '; margin:0;">' + esc(msg) + '</p>';
    else if (e.text !== undefined) e.text = msg;
    if (e.expand) e.expand();
    if (e.show) e.show();
  } catch (err) { console.error('[LPC][AdminJumelage] affichage du message KO :', err); }
}
function hideErr() {
  IDS_ERREUR.forEach((id) => {
    const e = optionnel(id);
    if (!e) return;
    try {
      if (e.html !== undefined) e.html = '<p style="color:transparent; margin:0;">&nbsp;</p>';
      else if (e.text !== undefined) e.text = '';
      if (e.collapse) e.collapse();
    } catch (err) { /* ignoré */ }
  });
}

// ─── utilitaires tolérants aux ID manquants ──────────────────────────────
function safe(label, fn) {
  try { return fn(); } catch (e) { console.error('[LPC][AdminJumelage] ' + label + ' KO:', e); }
}
function optionnel(id) {
  try { const e = $w(id); return e && typeof e.type === 'string' ? e : null; }
  catch (err) { return null; }
}
function premier(ids) {
  for (const id of ids) { const e = optionnel(id); if (e) return e; }
  return null;
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
  if (typeof b.onClick === 'function') b.onClick(() => versTous());
  try { if (b.show) b.show(); } catch (e) { /* ignoré */ }
  console.log('[LPC][nav] bouton « Jumelage » câblé : #' + b.id + ' (' + b.type + ') → ' + URL);
}
