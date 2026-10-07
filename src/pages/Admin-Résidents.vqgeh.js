// Code de PAGE « Adminresidents » (/adminresidents) : un administrateur gère les RÉSIDENTS d'un organisme.
// Page construite sur le modèle de « Mes résidents » (page-mes-residents.js) + la section globale Navigation de l'admin.
// version du code : 2026-10-06-h   (06/10 : cases indicateur A / indicateur B retirées, champ texte #infosimportantes ; #btnAjouter à trois états comme « Mes résidents »)
//
// L'organisme visé n'apparaît JAMAIS dans l'URL : l'entrée (bouton « Modifier » de l'onglet Résidents de /admin, ou bouton « Résidents »
// de /adminorganisme) crée un ticket serveur « gestion-residents » (backend/admin.web.js, collection Tickets_Admin). Toute la sécurité
// est côté serveur (exigerAdmin) ; ici, seulement du confort.
//
// Titre : #TitreAdmin = « Résidents de » + le NOM DE L'ORGANISME dans #TitreLinkMembre (à défaut #TitreLinkAdmin), cliquable : ouvre sa
// fiche /adminorganisme. Sans élément de lien, le nom est écrit dans #TitreAdmin.
//
// Mise en page (identique à Mes résidents) : UN répéteur ; chaque ligne porte Prénom, Nom (initiale), Chambre, Infos
// importantes (#infosimportantes), Intérêts, « Ajouter » (dernière ligne vide seulement) et, NOUVEAUTÉ, « Supprimer » (#btnSupprimer).
//   - « Ajouter » et « Envoyer » enregistrent toute la liste puis la relisent (une nouvelle ligne vide suit) ; l'admin reste sur la page
//   - « Supprimer » = désactiver le résident (rien n'est effacé : les jumelages le référencent). Deux temps : un premier clic demande
//     « Confirmer ? », le second (dans les 5 s) supprime. IMPOSSIBLE pour un résident JUMELÉ : le bouton est masqué et le serveur refuse
//   - l'accord RGPD n'est pas un acte de l'admin : sa case est repliée, la valeur existante est conservée par le serveur
//   - « Infos importantes » (texte libre, peut contenir des données de santé) : visible de l'équipe admin, jamais envoyée à un porteur

import { authentication } from 'wix-members-frontend';
import wixLocation from 'wix-location';
import { adminResidentsCourants, adminEnregistrerResidents, adminOuvrirOrganismeDepuisResidents } from 'backend/admin.web';

const VERSION = '2026-10-06-h';
const PAGE_ORGANISME = '/adminorganisme';
const PAGE_LISTE = '/admin?onglet=residents';
// Retour après enregistrement (04/10) : la page d'où l'on vient, transmise par ?depuis=… (aucun identifiant ; le ticket de l'autre page reste
// valide 2 h). Sans paramètre (arrivée depuis la liste /admin) : la liste /admin, onglet Résidents.
const PAGE_RETOUR = { organisme: '/adminorganisme', jumelage: '/adminjumelages', jumelages: '/adminjumelages?tous=1' };
function pageRetour() {
  let o = '';
  try { o = String((wixLocation.query || {}).depuis || ''); } catch (e) { o = ''; }
  return PAGE_RETOUR[o] || PAGE_LISTE;
}

const EL = {
  repeteur: ['#repeaterresidents', '#repeaterResidents', '#repResidents', '#repeteurResidents', '#residents', '#repeater'],
  accord: ['#accordcondidentialite', '#accordconfidentialite', '#accordConfidentialite', '#accordResidents', '#accord', '#accordRgpd', '#rgpd'],
  enregistrer: ['#btnEnregistrerResidents', '#enregistrerResidents', '#envoyer', '#Envoyer', '#btnEnvoyer', '#boutonEnvoyer', '#envoyerResidents'],
  erreur: ['#errorText', '#messageErreur', '#texteErreur', '#erreur'],
  titre: ['#TitreAdmin', '#titreAdmin'],
  lien: ['#TitreLinkMembre', '#TitreLinkAdmin'],
  sansObjet: ['#TitreLinkResidents', '#TitreLinkJumelages', '#TitreLinkJumelage', '#TitreLinkJumeles'],
  // Onglets hérités de Mes résidents : sans objet (la navigation Admin les remplace)
  anciensOnglets: ['#ongletProfil', '#ongletOrganisme'],
};

// Éléments d'une ligne du répéteur.
const LIGNE = {
  prenom: ['#rPrenom', '#prenom', '#Prenom', '#nPrenom'],
  initiale: ['#rInitiale', '#rNom', '#nom', '#Nom', '#initiale', '#nInitiale'],
  chambre: ['#rChambre', '#chambre', '#Chambre', '#nChambre'],
  infos: ['#infosimportantes', '#informationsimportantes', '#infosImportantes', '#rInfosImportantes'],
  interets: ['#rInterets', '#interets', '#Interets', '#nInterets'],
  ajouter: ['#btnAjouter', '#ajouterResident', '#boutonAjouter', '#ajouter'],
  nomPorteur: ['#NomPorteur', '#nomPorteur', '#rNomPorteur'],   // « Attribué à Prénom Nom » (résident jumelé, lecture seule)
  supprimer: ['#btnSupprimer', '#supprimerResident', '#boutonSupprimer', '#supprimer'],
};

const COULEUR_ERREUR = '#C0392B';
const COULEUR_SUCCES = '#1E8449';
const COULEUR_ALERTE = '#B9770E';
const DUREE_CONFIRMATION_MS = 5000;

const MESSAGES = {
  'prenom-requis': 'Chaque résident doit avoir un prénom.',
  'jumele': "Un résident jumelé ne peut pas être supprimé : annulez d'abord son jumelage (page Jumelage).",
  'ticket-invalide': "La session d'édition a expiré. Retournez à la liste et cliquez de nouveau sur « Modifier ».",
  'pas-de-ticket': "Aucun organisme n'est ouvert (ou la session a expiré). Retournez à la liste et cliquez sur « Modifier ».",
  'introuvable': 'Organisme introuvable.',
};

let d = {};
let ticket = '';
let enCours = false;
let compteurNouveau = 0;
let dernierClic = 0;          // anti-doublon : un même clic ne doit déclencher qu'une action
let aConfirmer = '';          // identifiant du résident dont la suppression attend une confirmation
let minuterieConfirmation = null;

$w.onReady(async () => {
  console.log('[LPC][AdminResidents] version du code :', VERSION);
  try { cablerJumelages(); } catch (e) { console.error('[LPC][nav] jumelage KO:', e); }
  safe('masquage erreur', hideErr);
  safe('masquage initial', () => {
    cacher(trouver(EL.accord));
    EL.sansObjet.forEach((id) => cacher(unSeul(id)));
    EL.anciensOnglets.forEach((id) => cacher(unSeul(id)));   // remplacés par la navigation Admin
    cacher(trouver(EL.lien));                                 // réaffiché une fois l'organisme connu
  });
  safe('navigation vers les listes', cablerNavigationAdmin);
  safe('contrôle des ID', checkIds);

  if (!authentication.loggedIn()) { wixLocation.to('/participer'); return; }

  try {
    d = (await adminResidentsCourants()) || {};
  } catch (e) {
    console.error('[LPC][AdminResidents] adminResidentsCourants KO:', e);
    showErr('Impossible de charger les résidents.');
    return;
  }
  if (d.refuse) { console.warn('[LPC][AdminResidents] accès refusé : redirection vers l’accueil'); wixLocation.to('/'); return; }
  if (!d.ok) {
    console.warn('[LPC][AdminResidents] pas de données :', d.reason);
    safe('masquer la liste', () => { cacher(repeteur()); const b = boutonEnvoyer(); if (b && b.disable) b.disable(); });
    showErr(MESSAGES[d.reason] || 'Chargement impossible.');
    return;
  }
  ticket = d.ticket;
  console.log('[LPC][AdminResidents] données reçues', { backend: d.version, residents: (d.residents || []).length, inactifs: d.inactifs });

  safe('titre', peindreTitre);
  const rep = repeteur();
  if (!rep) { showErr('La liste des résidents est introuvable sur la page (répéteur absent).'); return; }
  safe('répéteur', () => rep.onItemReady(remplirLigne));
  afficher(d.residents || []);

  // #btnAjouter est câblé ligne par ligne dans remplirLigne : « Ajouter » (ligne vide), « Supprimer » (résident non jumelé), masqué (jumelé)
  safe('bouton Envoyer', () => {
    const b = boutonEnvoyer();
    try { if (b && 'label' in b) b.label = 'Enregistrer'; } catch (e) { /* ignoré */ }   // il enregistre les modifications des lignes existantes
    if (b && typeof b.onClick === 'function') b.onClick(() => sauver(true));
    else console.warn('[LPC][AdminResidents] bouton Envoyer introuvable');
  });
});

// ─── titre : « Résidents de » + nom de l'organisme cliquable ──────────────
function peindreTitre() {
  const t = trouver(EL.titre);
  const lien = trouver(EL.lien);
  const nom = (d.organisation && d.organisation.nom) || '(sans nom)';
  if (t && lien) {
    t.text = 'Résidents de';
    try { if ('text' in lien) lien.text = nom; } catch (e) { /* ignoré */ }
    try { if ('label' in lien) lien.label = nom; } catch (e) { /* ignoré */ }
    if (typeof lien.onClick === 'function') lien.onClick(ouvrirOrganisme);
    montrer(t); montrer(lien);
  } else if (t) {
    t.text = 'Résidents de ' + nom;
    montrer(t);
    console.warn('[LPC][AdminResidents] aucun élément de lien (#TitreLinkMembre / #TitreLinkAdmin) : le nom de l’organisme n’est pas cliquable');
  }
}

/** Ouvre la fiche de l'organisme : le serveur crée le ticket « organismes » depuis le ticket de cette page. */
async function ouvrirOrganisme() {
  hideErr();
  try {
    const res = await adminOuvrirOrganismeDepuisResidents({ ticket });
    console.log('[LPC][AdminResidents] ouverture de l’organisme', res);
    if (res && res.refuse) { wixLocation.to('/'); return; }
    if (res && res.ok) { wixLocation.to(PAGE_ORGANISME + '?depuis=residents'); return; }   // /adminorganisme revient ici après l'enregistrement
    showErr(MESSAGES[res && res.reason] || "Impossible d'ouvrir la fiche de l'organisme.");
  } catch (e) {
    console.error('[LPC][AdminResidents] adminOuvrirOrganismeDepuisResidents KO:', e);
    showErr("Impossible d'ouvrir la fiche de l'organisme.");
  }
}

// ─── répéteur ────────────────────────────────────────────────────────────
function repeteur() {
  const parId = trouver(EL.repeteur);
  if (parId) return parId;
  try {
    const tous = [];
    $w('Repeater').forEach((r) => tous.push(r));
    if (tous.length === 1) {
      console.log('[LPC][AdminResidents] répéteur trouvé par son type : #' + tous[0].id);
      return tous[0];
    }
  } catch (e) { /* aucun répéteur */ }
  return null;
}

function ligneVide() {
  compteurNouveau += 1;
  return { _id: `nouveau-${Date.now()}-${compteurNouveau}`, nouveau: true, actif: true };
}

/** Résidents actifs + une ligne vide en dernier. */
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
  limiter(el('initiale'), 2, el('chambre'), 5);
  ['prenom', 'initiale', 'chambre', 'interets'].forEach((k) => reinitialiser(el(k)));
  const aj = el('ajouter');
  if (!aj) console.warn('[LPC][AdminResidents] #btnAjouter introuvable dans la ligne (candidats : ' + LIGNE.ajouter.join(', ') + ')');
  // Résident jumelé : pas de bouton, #NomPorteur affiche « Attribué à Prénom I. » ; non jumelé : #btnAjouter devient « Supprimer »
  const np = el('nomPorteur');
  const jumele = r.jumele === true && !r.nouveau;
  if (r.nouveau !== true) console.log('[LPC][AdminResidents] ligne', r.prenom, '| jumelé :', r.jumele === true, '| bouton :', 'Supprimer', '| porteur :', r.porteur || '-');
  // DEUX boutons dans le modèle de ligne de cette page (06/10) :
  //   #btnAjouter   : seulement sur la dernière ligne, vide (« Ajouter »)
  //   #btnSupprimer : sur TOUS les résidents encodés, jumelés ou non (jumelé : alerte + « Confirmer », voir demanderSuppression)
  const su = el('supprimer');
  if (aj) {
    if (r.nouveau) {
      montrer(aj);
      if (typeof aj.onClick === 'function') {
        aj.onClick(() => {
          const t = Date.now();
          if (t - dernierClic < 600) return;   // gestionnaire en double : un seul traitement par clic
          dernierClic = t;
          sauver(false);
        });
      }
    } else cacher(aj);
  }
  if (su) {
    if (r.nouveau) cacher(su);
    else {
      montrer(su);
      try { if ('label' in su) su.label = 'Supprimer'; } catch (e) { /* ignoré */ }
      if (typeof su.onClick === 'function') {
        su.onClick(() => {
          const t = Date.now();
          if (t - dernierClic < 600) return;
          dernierClic = t;
          demanderSuppression(r, su, np);
        });
      }
    }
  }
  if (np) {
    if (jumele) {
      poserTexte(np, texteJumele(r));
      try { if (typeof np.disable === 'function') np.disable(); } catch (e) { /* ignoré */ }
      montrer(np);
    } else cacher(np);
  }
  const absents = ['prenom', 'initiale', 'chambre', 'infos', 'interets', 'ajouter', 'supprimer', 'nomPorteur'].filter((k) => !el(k));
  if (absents.length) console.warn('[LPC][AdminResidents] ligne du répéteur : ID introuvables :', absents.join(', '));
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
        actif: true,
      });
    });
  });
  return lu;
}

// ─── suppression (désactivation) en deux temps ───────────────────────────
/** « Jumelé à Prénom Nom » (nom complet fourni par le serveur à l'administrateur). */
function texteJumele(r) {
  return 'Jumelé à ' + (r.porteur && r.porteur !== 'Un porteur' ? r.porteur : 'un porteur');
}
function poserTexte(champ, txt) {
  try { if ('value' in champ) champ.value = txt; else if ('text' in champ) champ.text = txt; } catch (e) { /* ignoré */ }
}
/** `champ` = #NomPorteur de la ligne : l'alerte s'y affiche (06/10), à côté du bouton, pour ne pas passer inaperçue dans une longue liste. */
function demanderSuppression(r, bouton, champ) {
  if (enCours) return;
  if (aConfirmer === r._id) {   // second clic : on supprime
    clearTimeout(minuterieConfirmation);
    aConfirmer = '';
    sauver(false, r._id, r.jumele === true);   // 3e paramètre : le jumelage en cours est supprimé avec le résident (confirmé)
    return;
  }
  aConfirmer = r._id;
  const jumele = r.jumele === true;
  // Résident jumelé : alerte explicite (message de la page, pas de alert() en Velo) + « Confirmer » ; non jumelé : « Confirmer ? »
  if (jumele) {
    if (champ) { poserTexte(champ, 'Attention, le jumelage sera supprimé'); montrer(champ); }
    else showErr('Attention, le jumelage sera supprimé', COULEUR_ALERTE);   // repli : zone de message de la page
  }
  try { if ('label' in bouton) bouton.label = jumele ? 'Confirmer' : 'Confirmer ?'; } catch (e) { /* ignoré */ }
  clearTimeout(minuterieConfirmation);
  minuterieConfirmation = setTimeout(() => {
    aConfirmer = '';
    try { if ('label' in bouton) bouton.label = 'Supprimer'; } catch (e) { /* ignoré */ }
    if (jumele) { if (champ) poserTexte(champ, texteJumele(r)); else hideErr(); }   // l'alerte disparaît, « Jumelé à… » revient
  }, DUREE_CONFIRMATION_MS);
}

// ─── enregistrement ──────────────────────────────────────────────────────
/** Ajouter (partir = false) et Envoyer (partir = true) enregistrent la même chose : toutes les lignes ; la ligne vide n'est
 *  retenue que si un prénom y est indiqué. `supprimeId` : résident à désactiver dans le même envoi. */
async function sauver(partir, supprimeId, avecJumelage) {
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

  enCours = true;
  boutons(false);
  try {
    const res = await adminEnregistrerResidents({ ticket, residents: envoi, jumelagesAAnnuler: supprimeId && avecJumelage ? [supprimeId] : [] });
    console.log('[LPC][AdminResidents] enregistrement', res);
    if (res && res.refuse) { wixLocation.to('/'); return; }
    if (res && res.ok && partir) { wixLocation.to(pageRetour()); return; }   // « Envoyer » : enregistré, retour à la page précédente (04/10)
    if (res && res.ok) {
      // Relecture : les lignes ajoutées reçoivent leur vrai identifiant ; les supprimées disparaissent ; une ligne vide suit.
      const nd = (await adminResidentsCourants()) || {};
      if (nd.ok) { d = nd; ticket = nd.ticket; afficher(nd.residents || []); }
      showErr(supprimeId ? (res.jumelagesAnnules ? 'Jumelage et résident supprimés.' : 'Résident supprimé.')
        : (res.crees ? res.crees + ' résident' + (res.crees > 1 ? 's' : '') + ' ajouté' + (res.crees > 1 ? 's' : '') + '. ' : '') + 'Modifications enregistrées.', COULEUR_SUCCES);
    } else {
      showErr(MESSAGES[res && res.reason] || "L'enregistrement a échoué, merci de réessayer dans un instant.");
    }
  } catch (e) {
    console.error('[LPC][AdminResidents] adminEnregistrerResidents KO:', e);
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
        if (!envoyerEl && /^\s*(envoyer|enregistrer)\s*$/i.test(String(b.label || ''))) envoyerEl = b;
      });
      if (envoyerEl) console.log('[LPC][AdminResidents] bouton Envoyer trouvé par son libellé : #' + envoyerEl.id);
    } catch (e) { /* aucun bouton */ }
  }
  return envoyerEl;
}

function boutons(actifs) {
  [trouver(LIGNE.ajouter), boutonEnvoyer()].forEach((b) => {
    try { if (b) { if (actifs && b.enable) b.enable(); if (!actifs && b.disable) b.disable(); } } catch (e) { /* ignoré */ }
  });
}

// ─── navigation vers les listes de /admin ────────────────────────────────
const URL_JUMELAGES = '/adminjumelages?tous=1';
// Style commun des boutons de navigation (04/10) : inactif = fond blanc, texte et bordure #C61010 ; actif (la page visée = celle-ci) = fond #C61010, texte et bordure blancs
const NAV_ACTIF = 'residents';
function peindreNav(b, actif) {
  const rouge = '#C61010', blanc = '#FFFFFF';
  if (!b || !b.style) return;
  try { b.style.backgroundColor = actif ? rouge : blanc; } catch (e) { /* ignoré */ }
  try { b.style.color = actif ? blanc : rouge; } catch (e) { /* ignoré */ }
  try { b.style.borderColor = actif ? blanc : rouge; } catch (e) { /* ignoré */ }
  try { b.style.borderWidth = 1; } catch (e) { /* ignoré */ }
}
const NAV_ADMIN = [
  { cle: 'membres', ids: ['#ongletMembresAdmin', '#ongletMembres'], libelle: /^(profil|membres?)$/i },
  { cle: 'organismes', ids: ['#ongletOrganismesAdmin', '#ongletOrganismes'], libelle: /^organismes?$/i },
  { cle: 'residents', ids: ['#ongletResidentsAdmin', '#ongletResidents', '#button10'], libelle: /^r[ée]sidents?$/i },
  { cle: 'jumelages', ids: ['#ongletsJumelagesAdmin', '#ongletsJumelages', '#ongletJumelagesAdmin', '#ongletJumelages'], libelle: /^jumelages?$/i, url: URL_JUMELAGES },
];
function cablerNavigationAdmin() {
  let boutons = [];
  try { const t = $w('Button'); for (let i = 0; i < t.length; i++) boutons.push(t[i]); } catch (e) { boutons = []; }
  NAV_ADMIN.forEach((n) => {
    let b = null;
    for (const id of n.ids) { b = unSeul(id); if (b) break; }
    if (!b) b = boutons.find((x) => !/^btn/i.test(String(x.id || '')) && n.libelle.test(String(x.label || '').trim())) || null;
    if (!b) { console.warn('[LPC][AdminResidents] bouton « ' + n.cle + ' » introuvable'); return; }
    const url = n.url || '/admin?onglet=' + n.cle;
    montrer(b);
    try { b.link = url; } catch (e) { /* repli sur le clic */ }
    if (typeof b.onClick === 'function') b.onClick(() => wixLocation.to(url));
    peindreNav(b, n.cle === NAV_ACTIF);
  });
  try { console.log('[LPC][nav] boutons :', boutons.map((x) => { let l = ''; try { l = String(x.link || ''); } catch (e) { l = '?'; } return '#' + x.id + ' « ' + String(x.label || '').slice(0, 20) + ' » → ' + (l || '(aucun)'); }).join(' | ')); } catch (e) { /* ignoré */ }
  // Tout bouton dont le lien d'éditeur pointe encore vers /mes-residents est redirigé vers le jumelage
  boutons.filter((x) => { try { return /mes-residents/i.test(String(x.link || '')); } catch (e) { return false; } }).forEach((b) => {
    try { b.link = URL_JUMELAGES; } catch (e) { /* repli sur le clic */ }
    if (typeof b.onClick === 'function') b.onClick(() => wixLocation.to(URL_JUMELAGES));
  });
}

// ─── messages ────────────────────────────────────────────────────────────
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
/** Zone de message : #errorText (section Navigation), sinon un des ID de EL.erreur, sinon le texte « PlaceHolder Error don't remove ». */
let zoneMessage = null;
function messageEl() {
  if (zoneMessage) return zoneMessage;
  zoneMessage = trouver(EL.erreur);
  if (!zoneMessage) {
    try {
      $w('Text').forEach((t) => {
        if (!zoneMessage && /placeholder error/i.test(String(t.text || ''))) zoneMessage = t;
      });
    } catch (e) { /* aucun texte */ }
  }
  return zoneMessage;
}
function showErr(msg, couleur) {
  console.warn('[LPC][AdminResidents] message :', msg);
  const e = messageEl();
  if (!e) return;
  try {
    if (e.html !== undefined) e.html = `<p style="color:${couleur || COULEUR_ERREUR}; margin:0;">${escapeHtml(msg)}</p>`;
    else if (e.text !== undefined) e.text = msg;
    montrer(e);
  } catch (err) {
    console.error('[LPC][AdminResidents] affichage du message KO :', err);
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
  try { fn(); } catch (e) { console.error('[LPC][AdminResidents] ' + label + ' KO:', e); }
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
/** Liste les ID absents : aide à fixer les ID dans l'éditeur. */
function checkIds() {
  const manquants = ['repeteur', 'erreur', 'titre', 'lien'].filter((k) => !trouver(EL[k])).map((k) => `${k}=${EL[k][0]}`);
  Object.entries(LIGNE).forEach(([k, c]) => { if (!trouver(c)) manquants.push(`ligne.${k}=${c[0]}`); });
  if (manquants.length) console.warn('[LPC][AdminResidents] éléments introuvables hors répéteur (normal pour ceux d’une ligne) :', manquants.join(', '));
  ['TextInput', 'TextBox', 'Checkbox', 'Button', 'Text', 'Repeater'].forEach((type) => {
    try {
      const ids = [];
      $w(type).forEach((x) => ids.push('#' + x.id));
      if (ids.length) console.log(`[LPC][AdminResidents] ${type} présents :`, ids.join(' '));
    } catch (e) { /* type absent */ }
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
