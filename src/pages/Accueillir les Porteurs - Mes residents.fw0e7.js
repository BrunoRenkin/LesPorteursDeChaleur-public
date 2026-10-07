// Code de PAGE « Mes résidents » — résidents saisis par l'institution (Accueillant).
// UN SEUL CODE pour DEUX pages Wix (seule la ligne PARCOURS diffère) :
//   - /mes-residents                          PARCOURS = 'mon-profil' : onglet « Résidents » du profil,
//                                             « Envoyer » -> /merci?f=mon-profil-mes-residents
//   - /accueillir-les-porteurs-mes-residents  PARCOURS = 'creation' : suite de F2 (inscription),
//                                             sans onglets, « Envoyer » -> /merci?f=mes-residents
// Pages « Membres uniquement », hors menu.
//
// Mise en page (Bruno, 26/09) : UN SEUL répéteur. Chaque ligne porte Prénom, Nom (initiale),
// Chambre, indicateur A, Intérêts et un bouton « Ajouter ».
//   - les résidents déjà enregistrés occupent les premières lignes, modifiables ;
//   - la DERNIÈRE ligne est vide : c'est la seule où « Ajouter » est visible ;
//   - Ajouter enregistre toute la liste (dont la dernière ligne) et ajoute une nouvelle ligne vide ;
//   - « Envoyer » enregistre toute la liste et part sur la page Merci (voir PARCOURS).
//
// Le répéteur est trouvé par son ID (#repResidents...) OU, à défaut, comme le seul répéteur de la page.
// Les champs de ligne acceptent plusieurs ID (voir LIGNE) : Wix renomme parfois les ID.
//
// Aucune suppression : un résident qui ne reçoit plus de cartes sera désactivé (case « Actif »,
// facultative : sans elle, un résident reste actif).

import { authentication } from 'wix-members-frontend';
import wixLocation from 'wix-location';
import { getMesResidents, enregistrerMesResidents } from 'backend/residents.web';

const VERSION = '2026-10-06-e';   // 06/10 (c) : #btnAjouter devient « Supprimer » sur les résidents déjà encodés non jumelés ; #NomPorteur si jumelé

// ↓↓↓ SEULE LIGNE DIFFÉRENTE ENTRE LES DEUX PAGES ↓↓↓
const PARCOURS = 'creation';   // 'mon-profil' (/mes-residents) | 'creation' (/accueillir-les-porteurs-mes-residents)

const EL = {
  repeteur: ['#repeaterresidents', '#repeaterResidents', '#repResidents', '#repeteurResidents', '#residents'],
  accord: ['#accordcondidentialite', '#accordconfidentialite', '#accordConfidentialite', '#accordResidents', '#accord', '#accordRgpd', '#rgpd'],
  enregistrer: ['#enregistrerResidents', '#envoyer', '#Envoyer', '#btnEnvoyer', '#boutonEnvoyer', '#envoyerResidents'],
  erreur: ['#messageErreur', '#texteErreur', '#erreur'],
  ongletProfil: ['#ongletProfil'],
  ongletOrganisme: ['#ongletOrganisme'],
  ongletResidents: ['#ongletResidents'],
};

// Éléments d'une ligne du répéteur.
const LIGNE = {
  prenom: ['#rPrenom', '#prenom', '#Prenom', '#nPrenom'],
  initiale: ['#rInitiale', '#rNom', '#nom', '#Nom', '#initiale', '#nInitiale'],
  chambre: ['#rChambre', '#chambre', '#Chambre', '#nChambre'],
  infos: ['#infosimportantes', '#informationsimportantes', '#infosImportantes', '#rInfosImportantes'],
  nomPorteur: ['#NomPorteur', '#nomPorteur', '#rNomPorteur'],   // « Prénom I. » du porteur jumelé (lecture seule)
  interets: ['#rInterets', '#interets', '#Interets', '#nInterets'],
  actif: ['#rActif', '#actif', '#Actif'],
  ajouter: ['#btnAjouter', '#ajouterResident', '#boutonAjouter', '#ajouter'],
};

const ONGLET_ACTIF = { fond: '#C0392B', texte: '#FFFFFF' };
const ONGLET_INACTIF = { fond: '#FFFFFF', texte: '#C0392B' };

const PAGE_F2 = '/accueillir-des-porteur-de-chaleur';
const PAGE_MERCI = PARCOURS === 'creation' ? '/merci?f=mes-residents' : '/merci?f=mon-profil-mes-residents';

const COULEUR_ERREUR = '#C0392B';
const COULEUR_QUESTION = '#B9770E';
const COULEUR_SUCCES = '#1E8449';

const MESSAGES = {
  'pas-accueillant': "Cette page est réservée aux lieux d'accueil. Pour inscrire votre institution, remplissez d'abord le formulaire « Accueillir des Porteurs de chaleur » (" + PAGE_F2 + ').',
  'pas-d-organisation': "Aucun lieu d'accueil n'est rattaché à votre compte. Merci de remplir le formulaire « Accueillir des Porteurs de chaleur » (" + PAGE_F2 + ').',
  'fiche-absente': "Votre fiche n'existe pas encore. Merci de remplir d'abord un formulaire de participation.",
  'accord-requis': "Merci de cocher la case d'accord avant d'enregistrer.",
  'prenom-requis': 'Chaque résident doit avoir un prénom.',
  'jumele': "Un résident jumelé ne peut pas être supprimé : écrivez-nous si vous souhaitez arrêter les cartes pour cette personne.",
};

let enCours = false;
const DUREE_CONFIRMATION_MS = 5000;
let aConfirmer = '';          // identifiant du résident dont la suppression attend une confirmation
let minuterieConfirmation = null;
let compteurNouveau = 0;
let dernierClic = 0;          // anti-doublon : un même clic ne doit déclencher qu'une action, même si le gestionnaire a été posé plusieurs fois

$w.onReady(async () => {
  console.log('[LPC][Residents] version du code : ' + VERSION + ' · parcours : ' + PARCOURS);
  safe('masquage erreur', hideErr);
  safe('contrôle des ID', checkIds);
  safe('onglet actif', () => {
    peindre(trouver(EL.ongletResidents), ONGLET_ACTIF);
    peindre(trouver(EL.ongletProfil), ONGLET_INACTIF);
    peindre(trouver(EL.ongletOrganisme), ONGLET_INACTIF);
  });
  // L'accord n'est jamais coché par l'éditeur : décoché au chargement, puis recoché seulement
  // s'il a déjà été donné pour cette organisation (backend : Residents.consentement_rgpd).
  safe('accord décoché', () => { const a = trouver(EL.accord); if (a) a.checked = false; });

  if (!authentication.loggedIn()) { wixLocation.to('/participer'); return; }

  const bienvenue = PARCOURS === 'creation' || (wixLocation.query || {}).f === 'accueillant';

  let d = {};
  try {
    d = (await getMesResidents()) || {};
    console.log('[LPC][Residents] données reçues', {
      ok: d.ok, reason: d.reason, backend: d.version, residents: (d.residents || []).length,
    });
  } catch (e) {
    console.error('[LPC][Residents] getMesResidents KO:', e);
  }

  if (!d.ok) {
    safe('blocage', bloquer);
    showErr(MESSAGES[d.reason] || 'Le chargement a échoué, merci de réessayer dans un instant.',
      d.reason ? COULEUR_QUESTION : COULEUR_ERREUR);
    return;
  }

  const rep = repeteur();
  if (!rep) {
    showErr('La liste des résidents est introuvable sur la page (répéteur absent).');
    return;
  }
  safe('accord déjà donné', () => { const a = trouver(EL.accord); if (a) a.checked = d.accord === true; });
  safe('répéteur', () => rep.onItemReady(remplirLigne));
  afficher(d.residents || []);

  // Le bouton #btnAjouter de chaque ligne est câblé dans remplirLigne (06/10) : « Ajouter » sur la ligne vide, « Supprimer » sur un résident
  // déjà encodé non jumelé, masqué sur un résident jumelé.
  safe('bouton Envoyer', () => {
    const b = boutonEnvoyer();
    if (b && typeof b.onClick === 'function') b.onClick(() => sauver(true));
    else console.warn('[LPC][Residents] bouton Envoyer introuvable');
  });

  if (bienvenue) {
    showErr("Merci pour votre confiance. Vous pouvez maintenant indiquer les résidents qui aimeraient recevoir des cartes. Vous pourrez compléter cette liste à tout moment depuis l'onglet « Résidents » de votre profil.", COULEUR_SUCCES);
  }
});

// ─── répéteur ────────────────────────────────────────────────────────────
function repeteur() {
  const parId = trouver(EL.repeteur);
  if (parId) return parId;
  try {
    const tous = [];
    $w('Repeater').forEach((r) => tous.push(r));
    if (tous.length === 1) {
      console.log('[LPC][Residents] répéteur trouvé par son type : #' + tous[0].id);
      return tous[0];
    }
  } catch (e) { /* aucun répéteur */ }
  return null;
}

function ligneVide() {
  compteurNouveau += 1;
  return { _id: `nouveau-${Date.now()}-${compteurNouveau}`, nouveau: true, actif: true };
}

/** Résidents enregistrés + une ligne vide en dernier. */
function afficher(liste) {
  safe('données du répéteur', () => {
    const rep = repeteur();
    if (!rep) return;
    rep.data = [...liste.map((r) => ({ ...r })), ligneVide()];
    montrer(rep);
  });
}

function remplirLigne($item, r) {
  const el = (cle) => dansItem($item, LIGNE[cle]);
  setVal(el('prenom'), r.prenom);
  setVal(el('initiale'), r.initiale);
  setVal(el('chambre'), r.chambre);
  setVal(el('interets'), r.interets);
  setVal(el('infos'), r.infos);
  const a = el('actif'); if (a) a.checked = r.actif !== false;
  limiter(el('initiale'), 2, el('chambre'), 5);
  ['prenom', 'initiale', 'chambre', 'interets', 'infos'].forEach((k) => reinitialiser(el(k)));
  // Un seul bouton par ligne, #btnAjouter, à trois états (06/10) :
  //   ligne vide (dernière)            -> « Ajouter »   : enregistre la liste puis ajoute une nouvelle ligne vide
  //   résident encodé, NON jumelé      -> « Supprimer » : désactive le résident, en deux clics (« Confirmer ? »)
  //   résident encodé, jumelé          -> masqué ; #NomPorteur affiche « Prénom I. » du porteur
  const aj = el('ajouter');
  const np = el('nomPorteur');
  const jumele = r.jumele === true && !r.nouveau;
  if (aj) {
    if (jumele) cacher(aj);
    else {
      montrer(aj);
      try { if ('label' in aj) aj.label = r.nouveau ? 'Ajouter' : 'Supprimer'; } catch (e) { /* ignoré */ }
      if (typeof aj.onClick === 'function') {
        aj.onClick(() => {
          const t = Date.now();
          if (t - dernierClic < 600) return;   // gestionnaire en double : un seul traitement par clic
          dernierClic = t;
          if (r.nouveau) sauver(false); else demanderSuppression(r, aj);
        });
      }
    }
  }
  if (np) {
    if (jumele) {
      try { const qui = r.porteur && r.porteur !== 'Un porteur' ? r.porteur : 'un porteur'; const txt = 'Attribué à ' + qui; if ('value' in np) np.value = txt; else if ('text' in np) np.text = txt; } catch (e) { /* ignoré */ }
      try { if (typeof np.disable === 'function') np.disable(); } catch (e) { /* ignoré */ }
      montrer(np);
    } else cacher(np);
  }
  const absents = ['prenom', 'initiale', 'chambre', 'infos', 'interets', 'ajouter', 'nomPorteur'].filter((k) => !el(k));
  if (absents.length) console.warn('[LPC][Residents] ligne du répéteur : ID introuvables :', absents.join(', '));
}

/** Relit toutes les lignes (les données du répéteur ne suivent pas la frappe). */
function lireLignes() {
  const lu = [];
  safe('lecture du répéteur', () => {
    const rep = repeteur();
    if (!rep) return;
    rep.forEachItem(($item, r) => {
      const el = (cle) => dansItem($item, LIGNE[cle]);
      lu.push({
        _id: r._id,
        nouveau: r.nouveau === true,
        prenom: texte(el('prenom')),
        initiale: texte(el('initiale')),
        chambre: texte(el('chambre')),
        interets: texte(el('interets')),
        infos: texte(el('infos')),
        actif: coche(el('actif'), r.actif !== false),
      });
    });
  });
  return lu;
}

// ─── suppression (désactivation) en deux temps ───────────────────────────
function demanderSuppression(r, bouton) {
  if (enCours) return;
  if (aConfirmer === r._id) {   // second clic : on supprime
    clearTimeout(minuterieConfirmation);
    aConfirmer = '';
    sauver(false, r._id);
    return;
  }
  aConfirmer = r._id;
  try { if ('label' in bouton) bouton.label = 'Confirmer ?'; } catch (e) { /* ignoré */ }
  clearTimeout(minuterieConfirmation);
  minuterieConfirmation = setTimeout(() => {
    aConfirmer = '';
    try { if ('label' in bouton) bouton.label = 'Supprimer'; } catch (e) { /* ignoré */ }
  }, DUREE_CONFIRMATION_MS);
}

// ─── enregistrement ──────────────────────────────────────────────────────
/** Ajouter (partir = false) et Envoyer (partir = true) enregistrent la même chose :
 *  toutes les lignes ; la ligne vide n'est retenue que si un prénom y est indiqué. */
async function sauver(partir, supprimeId) {
  if (enCours) return;
  hideErr();
  const lignes = lireLignes();
  const existantes = lignes.filter((l) => !l.nouveau).map((l) => (supprimeId && l._id === supprimeId ? { ...l, actif: false } : l));
  const nouvelles = lignes.filter((l) => l.nouveau);
  const nouvelle = nouvelles[nouvelles.length - 1] || { prenom: '' };
  const saisieCommencee = Boolean(nouvelle.initiale || nouvelle.chambre || nouvelle.interets || nouvelle.infos);

  if (existantes.some((l) => !l.prenom)) { showErr(MESSAGES['prenom-requis']); return; }
  if (!supprimeId && !nouvelle.prenom && (saisieCommencee || !partir)) {
    showErr('Merci d’indiquer le prénom du résident à ajouter.');
    return;
  }
  const envoi = [...existantes, ...nouvelles.filter((l) => l.prenom && !supprimeId)]
    .map(({ nouveau, ...l }) => (nouveau ? { ...l, _id: undefined } : l));
  if (!envoi.length) { showErr("Merci d'indiquer au moins un résident."); return; }
  // Case présente : elle doit être cochée. Case introuvable : l'accord donné dans F2 fait foi.
  const accord = trouver(EL.accord);
  if (accord && accord.checked !== true) { showErr(MESSAGES['accord-requis']); return; }
  if (!accord) console.warn('[LPC][Residents] case d’accord introuvable : accord de F2 retenu');

  enCours = true;
  boutons(false);
  try {
    const res = await enregistrerMesResidents({ accord: true, residents: envoi });
    console.log('[LPC][Residents] enregistrement', res);
    if (res && res.ok) {
      if (partir) { wixLocation.to(PAGE_MERCI); return; }
      // Relecture : la ligne ajoutée reçoit son vrai identifiant ; une nouvelle ligne vide suit.
      const d = (await getMesResidents()) || {};
      if (d.ok) afficher(d.residents || []);
      showErr(supprimeId ? 'Résident supprimé.' : `${nouvelle.prenom} fait maintenant partie de la liste. Vous pouvez saisir la personne suivante.`, COULEUR_SUCCES);
    } else {
      showErr(MESSAGES[res && res.reason] || "L'enregistrement a échoué, merci de réessayer dans un instant.");
    }
  } catch (e) {
    console.error('[LPC][Residents] enregistrerMesResidents KO:', e);
    showErr('Une erreur est survenue, merci de réessayer dans un instant.');
  }
  enCours = false;
  boutons(true);
}

/** Bouton « Envoyer » : par ID, sinon le bouton dont le libellé est « Envoyer ». */
let envoyerEl = null;
function boutonEnvoyer() {
  if (envoyerEl) return envoyerEl;
  envoyerEl = trouver(EL.enregistrer);
  if (!envoyerEl) {
    try {
      $w('Button').forEach((b) => {
        if (!envoyerEl && /^\s*envoyer\s*$/i.test(String(b.label || ''))) envoyerEl = b;
      });
      if (envoyerEl) console.log('[LPC][Residents] bouton Envoyer trouvé par son libellé : #' + envoyerEl.id);
    } catch (e) { /* aucun bouton */ }
  }
  return envoyerEl;
}

function boutons(actifs) {
  [trouver(LIGNE.ajouter), boutonEnvoyer()].forEach((b) => {
    try { if (b) { if (actifs && b.enable) b.enable(); if (!actifs && b.disable) b.disable(); } } catch (e) { /* ignoré */ }
  });
}

/** Accès refusé : liste et accord masqués, bouton Envoyer désactivé. */
function bloquer() {
  cacher(repeteur());
  cacher(trouver(EL.accord));
  const b = boutonEnvoyer();
  if (b && b.disable) b.disable();
}

// ─── onglets ─────────────────────────────────────────────────────────────
function peindre(el, couleurs) {
  if (!el || !el.style) return;
  try { el.style.backgroundColor = couleurs.fond; } catch (e) { /* ignoré */ }
  try { el.style.color = couleurs.texte; } catch (e) { /* ignoré */ }
  try { el.style.borderColor = ONGLET_ACTIF.fond; } catch (e) { /* ignoré */ }
}

// ─── messages ────────────────────────────────────────────────────────────
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
/** Zone de message : par ID, sinon le texte « PlaceHolder Error don't remove » posé dans l'éditeur. */
let zoneMessage = null;
function messageEl() {
  if (zoneMessage) return zoneMessage;
  zoneMessage = trouver(EL.erreur);
  if (!zoneMessage) {
    try {
      $w('Text').forEach((t) => {
        if (!zoneMessage && /placeholder error/i.test(String(t.text || ''))) zoneMessage = t;
      });
      if (zoneMessage) console.log('[LPC][Residents] zone de message trouvée par son texte : #' + zoneMessage.id);
    } catch (e) { /* aucun texte */ }
  }
  return zoneMessage;
}
function showErr(msg, couleur) {
  console.warn('[LPC][Residents] message :', msg);
  const e = messageEl();
  if (!e) return;
  try {
    if (e.html !== undefined) e.html = `<p style="color:${couleur || COULEUR_ERREUR}; margin:0;">${escapeHtml(msg)}</p>`;
    else if (e.text !== undefined) e.text = msg;
    montrer(e);
  } catch (err) {
    console.error('[LPC][Residents] affichage du message KO :', err);
  }
}
function hideErr() {
  const e = messageEl();
  if (!e) return;
  try {
    if (e.html !== undefined) e.html = '<p style="color:transparent; margin:0;">&nbsp;</p>';
    else if (e.text !== undefined) e.text = '';
    if (e.collapse) e.collapse();
  } catch (err) { /* ignoré */ }
}

// ─── utilitaires tolérants aux ID manquants ──────────────────────────────
function safe(label, fn) {
  try { fn(); } catch (e) { console.error('[LPC][Residents] ' + label + ' KO:', e); }
}
function unSeul(id) {
  try { const e = $w(id); return e && typeof e.type === 'string' ? e : null; }
  catch (err) { return null; }
}
function trouver(candidats) {
  for (const id of candidats) { const e = unSeul(id); if (e) return e; }
  return null;
}
function dansItem($item, candidats) {
  for (const id of candidats) {
    try { const e = $item(id); if (e && typeof e.type === 'string') return e; } catch (err) { /* suivant */ }
  }
  return null;
}
function texte(el) { return el ? String(el.value || '').trim() : ''; }
function coche(el, defaut) { return el ? el.checked === true : defaut; }
function setVal(el, v) { if (el) { try { el.value = v == null ? '' : v; } catch (e) { /* ignoré */ } } }
function reinitialiser(el) {
  if (el && typeof el.resetValidityIndication === 'function') {
    try { el.resetValidityIndication(); } catch (e) { /* ignoré */ }
  }
}
function limiter(initiale, maxInitiale, chambre, maxChambre) {
  try { if (initiale) initiale.maxLength = maxInitiale; } catch (e) { /* ignoré */ }
  try { if (chambre) chambre.maxLength = maxChambre; } catch (e) { /* ignoré */ }
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
/** Liste les ID absents, puis les éléments réellement présents : aide à fixer les ID dans l'éditeur. */
function checkIds() {
  const manquants = Object.entries(EL).filter(([, c]) => !trouver(c)).map(([k, c]) => `${k}=${c[0]}`);
  Object.entries(LIGNE).forEach(([k, c]) => { if (!trouver(c)) manquants.push(`ligne.${k}=${c[0]}`); });
  if (manquants.length) console.warn('[LPC][Residents] éléments introuvables :', manquants.join(', '));
  else console.log('[LPC][Residents] tous les éléments sont présents');
  ['TextInput', 'TextBox', 'Checkbox', 'Button', 'Text', 'Repeater'].forEach((type) => {
    try {
      const ids = [];
      $w(type).forEach((x) => ids.push('#' + x.id));
      if (ids.length) console.log(`[LPC][Residents] ${type} présents :`, ids.join(' '));
    } catch (e) { /* type absent */ }
  });
}
