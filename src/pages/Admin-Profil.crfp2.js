// Code de PAGE « Adminprofil » (/adminprofil) : un administrateur modifie la fiche d'un MEMBRE.
// Mode « admin » du formulaire générique : la page contient la SECTION GLOBALE de F1 (mêmes ID).
// version du code : 2026-10-12-a   (12/10 a : totaux du site dans #TotauxMembresetJumelage en mode création ; 10/10 d : message de refus de création : e-mail ou téléphone déjà utilisé)
//   (anciennement 2026-10-10-c   (10/10 c : création : le détail de l'erreur Wix est écrit en console)
//   (anciennement 2026-10-10-b   (10/10 b : le lien vers /adminjumelages n'est plus sur le titre #AdmintitreJumelages mais sur #LienJumelages (visible seulement si le porteur peut jumeler))
//   (anciennement 2026-10-10-a   (10/10 a : mode création : photo (ajout, vignette, retrait, consentement image) comme en modification, envoyée à la création ; capacités rouvertes explicitement ; tableau des jumelages : colonnes Nom / Centres d'intérêt / Établissement, police et graisse harmonisées (classe lpc-table-jumelage))
//   (anciennement 2026-10-08-j   (08/10 j : box des jumelages = pile de la PAGE #AdminboxResidents > #AdmintitreJumelages + tableau #tableJumelage ; titre = lien vers /adminjumelages ; plus de bouton dans la box)
//   (anciennement 2026-10-07-b   (07/10 b : mode création : interface préparée avant l'appel serveur, e-mail rendu saisissable en premier)
//   (07/10 : MODE CRÉATION /adminprofil?mode=creation : l'admin crée un membre (compte Wix sans mot de passe + fiche Membres) ; e-mail saisissable,
//    liste #dropdownStatut (Porteur / Accueillant / Partenaire, hors section globale), capacités selon le statut, #checkbox2 = consentement RGPD
//    recueilli hors site, À COCHER par l'admin ; pas de photo à la création)
//   (06/10 : #boxResidents (porteur seulement) = #titreJumelages « Jumelages : X/Y », #textjumelage (liste numérotée des jumelages en cours
//    ou « Pas de jumelage en cours »), #buttonJumelages (ouvre /adminjumelages sur ce porteur) ; #btnorganisation toujours replié ici)
//
// La fiche visée n'apparaît JAMAIS dans l'URL : le clic sur « Modifier » de /admin crée un ticket serveur
// (backend/admin.web.js, collection Tickets_Admin) ; cette page demande au serveur « la fiche de mon ticket »
// et renvoie le ticket à chaque enregistrement. Toute la sécurité est côté serveur (exigerAdmin) ; les
// éléments masqués ici ne sont qu'un confort.
//
// L'administrateur PEUT modifier : identité, coordonnées, capacités, disponibilités, nombre de cartes,
// CONSENTEMENT IMAGE (Bruno, 30/09 ; avant et après sont journalisés) et, depuis le 03/10, la PHOTO : ajout ou
// remplacement (#uploadButton1), retrait (#button14, appliqué à l'enregistrement). Retirer la photo remet le
// consentement image à faux (côté serveur). Il NE PEUT PAS : le consentement RGPD, les statuts, l'e-mail.
// Chaque étape de la photo est tracée dans Site Monitoring (backend/trace-client.web.js, filtre « [LPC][Trace] »).
//
// Élément FACULTATIF (le formulaire fonctionne sans lui) :
//   #TitreAdmin  (texte, section Navigation)  : « Fiche de Prénom Nom (statuts) »
//   #TitreLinkAdmin (texte, section Navigation) : nom de l'organisme du membre, CLIQUABLE : ouvre /adminorganisme
//   #errorText (texte, section Navigation, masqué par défaut) : messages ; repli sur #text112
//   #BtnJumelage (bouton) : ouvre /adminjumelages pour ce porteur ; MASQUÉ si le porteur n'écrit pas de cartes (état ENREGISTRÉ)
//   #pileOrganisme (pile) contenant #lienOrganisme (texte ou bouton) : nom de l'organisme du membre, cliquable,
//                          ouvre /adminorganisme ; pile repliée si le membre n'a pas d'organisme
// Pas de bouton de retour : le retour arrière du navigateur suffit (Bruno, 30/09).

import { authentication } from 'wix-members-frontend';
import wixLocation from 'wix-location';
import wixWindowFrontend from 'wix-window-frontend';
import { adminTotaux, adminCreationOptions, adminCreerMembre, adminFicheCourante, adminEnregistrerMembre, adminOuvrirOrganismeDuMembre, adminOuvrirMembreRattache, adminOuvrirResidents, adminEmailPorteurCourant, adminEnvoyerLienMotDePasse } from 'backend/admin.web';
import { tracerClient } from 'backend/trace-client.web';

// ID de la section globale (identiques à F1 et /mon-profil). Sensibles à la casse.
const EL = {
  prenom: '#input5',
  nom: '#input4',
  telephone: '#input3',
  localite: '#input2',
  commentaire: '#textBox1',
  capacites: '#checkboxGroup3',
  disponibilites: '#checkboxGroup2',
  consentementPhoto: '#checkbox1',
  bouton: '#button15',
  erreur: '#text112',
};
// Consentement RGPD (#checkbox2) : AFFICHÉ GRISÉ depuis le 04/10 (valeur lue, jamais modifiable ni renvoyée). Le téléversement (#uploadButton1) est TOUJOURS affiché (ajout ou remplacement).
// Le conteneur de la photo (#box156), l'aperçu (#imageX12) et le bouton de retrait (#button14) sont gérés par vignette() :
// affichés seulement s'il y a une photo.
const A_REPLIER = [];
const ID_RGPD = '#checkbox2';
const EL_PHOTO = { bloc: '#box156', image: '#imageX12', retrait: '#button14', envoi: '#uploadButton1' };
const NB_RESIDENTS = ['#input6', '#nbResidentsMax'];
const TITRE_NB = ['#text114', '#TitrenbResidentsMax'];
const AIDE_NB = ['#text113', '#aideNbResidents'];
const EMAIL_IDS = ['#input1', '#email', '#email1'];
// Éléments de la section globale Navigation (01/10) : titre (T majuscule), texte du LIEN vers l'organisme, message d'erreur
const TITRE_ADMIN = ['#TitreAdmin', '#titreAdmin'];
const IDS_LIEN = ['#TitreLinkMembre', '#TitreLinkAdmin'];   // lien vers l'organisme : #TitreLinkAdmin, ou #TitreLinkMembre s'il l'a remplacé (02/10)
const IDS_ERREUR = ['#errorText'];
const EL_ORG = { pile: '#pileOrganisme', lien: '#lienOrganisme' };
const PAGE_ORGANISME = '/adminorganisme';
const PAGE_RESIDENTS = '/adminjumelages';
// 08/10 (nuit) : décision de Bruno : une section globale se gère depuis la page où elle se trouve et ses éléments se retrouvent sur
// /mon-profil. La box des jumelages de /adminprofil est donc la pile de la PAGE : #AdminboxResidents > #AdmintitreJumelages (titre, qui
// ouvre /adminjumelages) + tableau #tableJumelage (colonnes : n°, nom, établissement, centres d'intérêt). #AdmintexteJumelages est abandonné.
// Les éléments de la section globale (#boxResidents…) sont repliés ici par sécurité. #BtnJumelage reste le bouton de la page.
const IDS_BTN_JUMELAGE = ['#BtnJumelage'];   // ouvre /adminjumelages sur ce porteur
const IDS_BOX_RESIDENTS = ['#AdminboxResidents'];
const IDS_GLOBAL_A_REPLIER = ['#boxResidents', '#buttonJumelages', '#titreJumelages', '#textjumelage'];   // éléments de la section globale, partagés avec /mon-profil
const IDS_TABLE_JUMELAGES = ['#tableJumelage'];
const IDS_LIEN_JUMELAGES = ['#LienJumelages'];   // 10/10 : lien vers /adminjumelages (ex-clic sur le titre), affiché seulement si le porteur peut jumeler
const IDS_TITRE_JUMELAGES = ['#AdmintitreJumelages'];   // les ID sont sensibles à la casse
const IDS_TEXTE_JUMELAGES = ['#AdmintexteJumelages'];   // abandonné : replié
const COLONNES_JUMELAGES = [
  { dataPath: 'nom', label: 'Nom', type: 'string' },
  { dataPath: 'interets', label: "Centres d'intérêt", type: 'string' },
  { dataPath: 'etablissement', label: 'Établissement', type: 'string' }
];   // 10/10 (Bruno) : les deux dernières colonnes inversées
const STATUTS_PAR_DEFAUT = ['Porteur', 'Accueillant', 'Partenaire'];   // repli si le serveur n'envoie pas `statutOptions` (backend ancien) ; le serveur valide
const IDS_BTN_ORGANISATION = ['#btnorganisation', '#btnOrganisation'];   // réservé à /mon-profil : replié ici
const IDS_BTN_EMAIL = ['#buttonSendToPorteur'];
const IDS_BTN_LIEN_MDP = ['#buttonLienMdp', '#buttonLienMotDePasse'];   // facultatif (08/10) : « Envoyer le lien de mot de passe », visible si l'e-mail du compte n'est pas vérifié   // masqué par défaut ; affiché quand le porteur a tous ses jumelages
const GMAIL_COMPTE = 'lesporteursdechaleur@gmail.com';   // ⚠️ compte Gmail d'envoi à CONFIRMER par Bruno (vide = compte Google par défaut du navigateur)
const LONGUEUR_MAX_URL = 6000;   // au-delà, le texte est aussi copié dans le presse-papiers (⚠️ limite réelle de Gmail non vérifiée)
/** Fenêtre de rédaction Gmail pré-remplie (Bruno, 04/10 : l'envoi se fait depuis Gmail, plus de mailto). Rien n'est envoyé : l'admin relit puis envoie. */
function urlGmail(res) {
  return 'https://mail.google.com/mail/?' + (GMAIL_COMPTE ? 'authuser=' + encodeURIComponent(GMAIL_COMPTE) + '&' : '')
    + 'view=cm&fs=1&to=' + encodeURIComponent(res.a) + '&su=' + encodeURIComponent(res.objet) + '&body=' + encodeURIComponent(res.corps);
}
let emailEnCours = false;
// Éléments de la section Navigation propres à /adminorganisme : sans objet ici, repliés
const IDS_SANS_OBJET = ['#TitreLinkResidents', '#TitreLinkJumelages', '#TitreLinkJumelage', '#TitreLinkJumeles'];

const PAGE_LISTE = '/admin?onglet=membres';
// Retour après enregistrement (04/10) : la page d'où l'on vient. Seules deux pages ouvrent cette fiche : la liste /admin (« Modifier »,
// défaut) et /adminorganisme (lien d'un membre, qui ajoute ?depuis=organisme : aucun identifiant). Le ticket « organismes » reste valide.
const PAGE_RETOUR = { organisme: '/adminorganisme' };
function pageRetour() {
  let o = '';
  try { o = String((wixLocation.query || {}).depuis || ''); } catch (e) { o = ''; }
  return PAGE_RETOUR[o] || PAGE_LISTE;
}
const LIBELLE_BOUTON = 'Enregistrer';
const MOTIF_NB = /^[1-9][0-9]?$/;
const NB_OBLIGATOIRE = true;
const MSG_CHIFFRES = 'Veuillez saisir uniquement des chiffres.';
const DUREE_AIDE_MS = 4000;
const COULEUR_ERREUR = '#C0392B';
const COULEUR_QUESTION = '#B9770E';

// Mode création (07/10) : /adminprofil?mode=creation (aucun identifiant). Le serveur ne croit pas ce paramètre : adminCreerMembre exige l'admin.
const CREATION = (() => { try { return String((wixLocation.query || {}).mode || '') === 'creation'; } catch (e) { return false; } })();
const IDS_STATUT = { liste: '#dropdownStatut', titre: '#titreStatut' };   // éléments de la PAGE (pas de la section globale) : repliés en modification
const PAGE_APRES_CREATION = '/admin?onglet=membres';
let d = {};
let aPhoto = false;   // le membre a une photo enregistrée (sinon la case de consentement image est repliée)
let photoASupprimer = false;   // retrait demandé, appliqué à l'enregistrement
let photoCreation = null;   // 10/10 : mode création : photo déjà téléversée { url, w, h } (téléversement dès le choix du fichier, pour afficher la vignette)
let rangeeConsentement = null;   // rangée de la case de consentement image, repliée tant qu'il n'y a ni photo ni fichier choisi
let ticket = '';
let statutPropose = false;   // 08/10 : #dropdownStatut affiché en modification (membre SANS statut) : sa valeur est envoyée à l'enregistrement
let champNb;
let minuterieAide = null;

$w.onReady(async () => {
  console.log('[LPC][AdminProfil] version du code : 2026-10-12-a', CREATION ? '(mode création)' : '');
  try { cablerJumelages(); } catch (e) { console.error('[LPC][nav] jumelage KO:', e); }
  safe('inventaire', () => inventaire('AdminProfil'));
  safe('masquage erreur', hideErr);
  safe('masquage initial', () => {
    A_REPLIER.forEach((id) => cacher(optionnel(id)));
    cacher(optionnel(EL_PHOTO.bloc)); cacher(optionnel(EL_PHOTO.image));   // réaffichés par vignette() s'il y a une photo
    cacher(optionnel(EL_ORG.pile)); cacher(optionnel(EL_ORG.lien)); cacher(premier(IDS_LIEN));        // réaffichés par lienOrganisme() s'il y a un organisme
    cacher(champNbResidents()); cacher(premier(TITRE_NB)); cacher(premier(AIDE_NB));
    IDS_SANS_OBJET.forEach((id) => cacher(optionnel(id)));
    IDS_BTN_JUMELAGE.forEach((id) => cacher(optionnel(id)));   // réaffichés par boutonJumelage() si le porteur écrit des cartes
    IDS_GLOBAL_A_REPLIER.forEach((id) => cacher(optionnel(id)));   // éléments de la section globale : jamais utilisés ici
    cacher(premier(IDS_TABLE_JUMELAGES)); cacher(premier(IDS_TEXTE_JUMELAGES));   // réaffichés par afficherJumelages()
    cacher(premier(IDS_BOX_RESIDENTS));   // réaffichée par boutonJumelage() pour un porteur
    cacher(premier(IDS_LIEN_JUMELAGES));   // réaffiché par afficherJumelages() si le porteur peut jumeler
    cacher(premier(IDS_BTN_ORGANISATION));
    IDS_BTN_LIEN_MDP.forEach((id) => cacher(optionnel(id)));   // réaffiché par boutonLienMdp() si l'e-mail n'est pas vérifié
    cacher(premier(IDS_BTN_EMAIL));      // réaffiché par boutonEmail() si le quota du porteur est rempli
    cacher(optionnel(IDS_STATUT.liste)); cacher(optionnel(IDS_STATUT.titre));   // réaffichés par initCreation()
  });
  safe('libellé du bouton', () => { const b = optionnel(EL.bouton); if (b && 'label' in b) b.label = LIBELLE_BOUTON; });
  safe('contrôle des ID', checkIds);
  safe('navigation vers les listes', cablerNavigationAdmin);

  if (!authentication.loggedIn()) { wixLocation.to('/participer'); return; }
  desactiverBouton();   // réactivé une fois la fiche chargée
  if (CREATION) { safe('totaux du site', peindreTotauxSite); await initCreation(); return; }

  // Arrivée par un lien de membre de #TitreLinkAdmin de /adminorganisme (?rang=N, quand l'organisme a PLUSIEURS membres) : le
  // serveur ouvre ce membre rattaché à l'organisme en cours, puis la page se charge normalement. Sans ce paramètre
  // (arrivée depuis /admin ou clic sur l'unique membre), rien ne change.
  try {
    const q = wixLocation.query || {};
    if (q.rang !== undefined && q.rang !== '') {
      const r = await adminOuvrirMembreRattache({ rang: Number(q.rang) });
      console.log('[LPC][AdminProfil] ouverture depuis l’organisme', r);
      if (r && r.refuse) { wixLocation.to('/'); return; }
      if (!r || !r.ok) { showErr("Impossible d'ouvrir la fiche de ce membre."); return; }
    }
  } catch (e) {
    console.error('[LPC][AdminProfil] ouverture depuis l’organisme KO:', e);
    showErr("Impossible d'ouvrir la fiche de ce membre.");
    return;
  }

  try {
    d = (await adminFicheCourante()) || {};
  } catch (e) {
    console.error('[LPC][AdminProfil] adminFicheCourante KO:', e);
    showErr('Impossible de charger la fiche.');
    return;
  }
  if (d.refuse) {
    console.warn('[LPC][AdminProfil] accès refusé : redirection vers l’accueil');
    wixLocation.to('/');
    return;
  }
  if (!d.ok) {
    console.warn('[LPC][AdminProfil] pas de fiche :', d.reason);
    showErr(d.reason === 'pas-de-ticket'
      ? "Aucune fiche n'est ouverte (ou elle a expiré). Retournez à la liste et cliquez sur « Modifier »."
      : 'Fiche introuvable.');
    return;
  }
  ticket = d.ticket;
  console.log('[LPC][AdminProfil] fiche reçue', { version: d.version, capacites: (d.capaciteOptions || []).length });

  remplir();
  safe('photo : téléversement et retrait', cablerPhoto);
  activerBouton();
  clic(EL.bouton, sauver);
});

// ─── mode création (07/10) ───────────────────────────────────────────────
let creationEnCours = false;
async function initCreation() {
  // L'interface est préparée AVANT l'appel serveur (07/10 b) : si le backend ne répond pas, l'e-mail reste saisissable et la console dit pourquoi.
  safe('titre', () => { const t = premier(TITRE_ADMIN); if (t) t.text = 'Nouveau membre'; });
  safe('bouton', () => { const b = optionnel(EL.bouton); if (b && 'label' in b) b.label = 'Créer le membre'; });
  safe('vignette : rien à afficher', () => vignette(''));   // replie la rangée du consentement image
  safe('photo : téléversement et retrait', () => { cablerPhoto(); montrerParents(optionnel(EL_PHOTO.envoi)); });   // 10/10 : photo possible dès la création (téléversée au choix du fichier, enregistrée à « Créer le membre »)
  safe('e-mail saisissable', () => {
    const el = premier(EMAIL_IDS);
    if (!el) { console.warn('[LPC][AdminProfil] champ e-mail introuvable (' + EMAIL_IDS.join(', ') + ')'); return; }
    try { el.value = ''; } catch (e) { /* ignoré */ }
    try { if (typeof el.enable === 'function') el.enable(); } catch (e) { /* ignoré */ }
    try { if (el.customClassList) el.customClassList.remove('lpc-desactive'); } catch (e) { /* ignoré */ }
    try { if (el.customClassList) el.customClassList.add('lpc-saisie'); } catch (e) { /* ignoré */ }   // 09/10 : apparence « saisissable » (global.css) : le champ n'est plus grisé en création
    try { if (typeof el.resetValidityIndication === 'function') el.resetValidityIndication(); } catch (e) { /* ignoré */ }
    console.log('[LPC][AdminProfil] création : e-mail #' + el.id + ' | enabled = ' + el.enabled + ' | readOnly = ' + el.readOnly);
    try { if (el.readOnly === true) el.readOnly = false; } catch (e) { /* ignoré */ }
  });
  safe('consentement RGPD : donné par la personne elle-même', () => { cacher(optionnel(ID_RGPD)); });   // 08/10 : plus coché par l'admin (la personne le donne à sa première connexion)
  try { d = (await adminCreationOptions()) || {}; } catch (e) {
    console.error('[LPC][AdminProfil] adminCreationOptions KO (backend admin.web.js non collé en 2026-10-07-a ?) :', e);
    showErr('Impossible de charger les listes (statuts, capacités). Rechargez la page ; si le problème persiste, prévenez Bruno.');
    return;
  }
  if (d.refuse) { wixLocation.to('/'); return; }
  if (!d.ok) { showErr('Impossible de charger les listes (statuts, capacités).'); return; }
  console.log('[LPC][AdminProfil] création : options reçues', { version: d.version, statuts: (d.statuts || []).length });
  safe('statut', () => {
    const l = optionnel(IDS_STATUT.liste);
    if (!l) { console.warn('[LPC][AdminProfil] ' + IDS_STATUT.liste + ' introuvable : ajoutez la liste déroulante des statuts sur la page'); return; }
    l.options = (d.statuts || []).map((v) => ({ label: v, value: v }));
    l.value = '';
    montrer(l); montrerParents(l); montrer(optionnel(IDS_STATUT.titre));   // 08/10 : le parent de la liste est masqué dans l'éditeur (box185)
    if (typeof l.onChange === 'function') l.onChange(() => majCapacitesCreation());
  });
  safe('options disponibilites', () => {
    $w(EL.disponibilites).options = (d.disponibiliteOptions || []).map((v) => ({ label: v, value: v }));
    setVal(EL.disponibilites, []);
  });
  safe('capacités : toutes proposées dès l’ouverture (09/10)', () => {
    const caps = $w(EL.capacites);
    caps.options = (d.capaciteOptions || []).map((v) => ({ label: v, value: v }));
    setVal(EL.capacites, []);
    montrer(caps); montrerParents(caps);   // 10/10 : la pile des capacités est réaffichée explicitement (conteneur masqué ou replié)
  });
  safe('champ nbResidentsMax', () => {
    preparerNbResidents(null);
    majNbResidents();
    const caps = optionnel(EL.capacites);
    if (caps && typeof caps.onChange === 'function') caps.onChange(() => majNbResidents());
  });
  safe('remise à zéro des indications de validité', () => {
    Object.values(EL).forEach((id) => {
      const el = optionnel(id);
      if (el && typeof el.resetValidityIndication === 'function') { try { el.resetValidityIndication(); } catch (e) { /* ignoré */ } }
    });
  });
  activerBouton();
  clic(EL.bouton, sauverCreation);
}

/** Les capacités proposées dépendent du statut choisi ; celles déjà cochées et encore valides sont conservées. */
function majCapacitesCreation() {
  // 09/10 : le choix du statut ne filtre plus les capacités (toutes proposées) ; les statuts s'ajoutent côté serveur d'après les capacités cochées
  majNbResidents();
}

const MOTIF_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MSG_CREATION = {
  'donnees-invalides': 'Prénom, nom ou adresse e-mail invalide.',
  'statut-invalide': 'Statut non reconnu : choisissez-en un dans la liste.',
  'consentement-requis': 'Le consentement RGPD doit être recueilli (oralement ou par e-mail) puis la case cochée.',
  'nb-requis': 'Indiquez un nombre de cartes entre 1 et 99.',
  'photo-invalide': "La photo n'a pas été reconnue : choisissez-en une autre ou retirez-la.",
  'email-existant': 'Un membre avec cette adresse e-mail existe déjà.',
  'wix-refuse': "Wix a refusé de créer le compte : l'e-mail ou le numéro de téléphone correspond à un compte déjà créé. Si la personne s'est déjà inscrite, sa fiche se créera à sa connexion.",
  'fiche-ko': "Le compte Wix a été créé mais la fiche n'a pas pu être enregistrée : elle se créera à la première connexion du membre (sans statut). Prévenez Bruno.",
};
async function sauverCreation() {
  if (creationEnCours) return;
  hideErr();
  const email = String(valeur(EMAIL_IDS.find((id) => optionnel(id))) || '').trim();
  const statut = String(valeur(IDS_STATUT.liste) || '');
  const manque = [];
  if (!(valeur(EL.prenom) || '').trim() || !(valeur(EL.nom) || '').trim()) manque.push('indiquer le prénom et le nom');
  if (!MOTIF_EMAIL.test(email)) manque.push('indiquer une adresse e-mail valide');
  if (!statut) manque.push('choisir un statut');
  if (nbSaisissable()) {
    const saisi = String(champNbResidents().value || '').trim();
    if (!nombreDe(saisi)) manque.push('indiquer un nombre de cartes entre 1 et 99');
  }
  if (manque.length) { showErr("Le formulaire n'est pas complet : merci de " + manque.join('; ') + '.'); return; }

  creationEnCours = true;
  desactiverBouton();
  try {
    const res = (await adminCreerMembre({
      prenom: valeur(EL.prenom),
      nom: valeur(EL.nom),
      email,
      telephone: valeur(EL.telephone),
      localite: valeur(EL.localite),
      commentaire: valeur(EL.commentaire),
      statut,
      capacites: valeur(EL.capacites),
      disponibilites: valeur(EL.disponibilites),
      nbResidentsMax: nbSaisissable() ? (nombreDe(champNbResidents().value) || undefined) : undefined,
      photoUrl: photoCreation ? photoCreation.url : undefined,
      photoW: photoCreation ? photoCreation.w : undefined,
      photoH: photoCreation ? photoCreation.h : undefined,
      consentementPhoto: photoCreation ? Boolean((optionnel(EL.consentementPhoto) || {}).checked) : undefined,
    })) || {};
    console.log('[LPC][AdminProfil] création', { ok: res.ok, reason: res.reason, detail: res.detail, role: res.role, version: res.version });
    if (res.refuse) { wixLocation.to('/'); return; }
    if (res.ok) {
      if (res.role === false) console.warn('[LPC][AdminProfil] membre créé mais rôle « Membre Normal » non attribué (voir Site Monitoring)');
      wixLocation.to(PAGE_APRES_CREATION);
      return;
    }
    showErr(MSG_CREATION[res.reason] || 'La création a échoué, merci de réessayer dans un instant.');
  } catch (e) {
    console.error('[LPC][AdminProfil] adminCreerMembre KO:', e);
    showErr('Une erreur est survenue, merci de réessayer dans un instant.');
  }
  creationEnCours = false;
  activerBouton();
}

// ─── préremplissage ──────────────────────────────────────────────────────
function remplir() {
  const p = d.profil || {};
  safe('titre', () => {
    const t = premier(TITRE_ADMIN);
    if (!t) return;
    const nom = ((p.prenom || '') + ' ' + (p.nom || '')).trim() || '(sans nom)';
    const statuts = (p.statuts || []).join(', ');
    t.text = 'Fiche de ' + nom + (statuts ? ' (' + statuts + ')' : '');
  });
  safe('lien vers l’organisme', lienOrganisme);
  safe('bouton de jumelage', boutonJumelage);
  safe('statut à définir', statutADefinir);
  safe('bouton e-mail au porteur', boutonEmail);
  safe('bouton lien de mot de passe', boutonLienMdp);
  safe('consentement RGPD grisé', griserRgpd);
  safe('profil', () => {
    setVal(EL.prenom, p.prenom);
    setVal(EL.nom, p.nom);
    setVal(EL.telephone, p.telephone);
    setVal(EL.localite, p.localite);
    setVal(EL.commentaire, p.commentaire);
  });
  safe('e-mail', () => poserEmail(p.email));
  safe('consentement image', () => {
    const e = optionnel(EL.consentementPhoto);
    if (e && e.checked !== undefined) e.checked = p.consentementPhoto === true;
  });
  safe('vignette', () => vignette(p.photoUrl));
  safe('options capacites', () => {
    $w(EL.capacites).options = (d.capaciteOptions || []).map((v) => ({ label: v, value: v }));
    setVal(EL.capacites, p.capacites);
  });
  safe('options disponibilites', () => {
    $w(EL.disponibilites).options = (d.disponibiliteOptions || []).map((v) => ({ label: v, value: v }));
    setVal(EL.disponibilites, p.disponibilites);
  });
  safe('champ nbResidentsMax', () => {
    preparerNbResidents(p.nbResidentsMax);
    majNbResidents();
    const caps = optionnel(EL.capacites);
    if (caps && typeof caps.onChange === 'function') caps.onChange(() => majNbResidents());
  });
  safe('remise à zéro des indications de validité', () => {
    Object.values(EL).forEach((id) => {
      const el = optionnel(id);
      if (el && typeof el.resetValidityIndication === 'function') {
        try { el.resetValidityIndication(); } catch (e) { /* ignoré */ }
      }
    });
  });
}

/** Vignette de la photo enregistrée (lecture seule) : conteneur et image affichés seulement s'il y a une photo.
 *  Le bouton de retrait reste replié : l'administrateur ne retire pas la photo d'un membre. */
/** Tous les descendants d'un élément, à plat. */
function descendantsDe(el, acc = []) {
  let enfants = [];
  try { enfants = el && Array.isArray(el.children) ? el.children : []; } catch (e) { enfants = []; }
  enfants.forEach((c) => { acc.push(c); descendantsDe(c, acc); });
  return acc;
}
/** Sans photo, la case « consentement image » prête à confusion : on replie TOUTE LA RANGÉE qui la contient. La rangée = le plus
 *  grand ancêtre de la case qui ne contient AUCUN autre champ du formulaire (on s'arrête avant le premier conteneur partagé). */
function masquerRangeeConsentement() {
  const case_ = optionnel(EL.consentementPhoto);
  if (!case_) return;
  const autres = new Set(Object.entries(EL).filter(([k]) => k !== 'consentementPhoto').map(([, id]) => id.replace('#', '').toLowerCase()));
  ['input1', 'input6', 'text113', 'text114', 'uploadbutton1'].forEach((x) => autres.add(x));   // e-mail, nombre de cartes, son titre et son aide
  const contientAutre = (el) => descendantsDe(el).some((x) => autres.has(String(x.id || '').toLowerCase()));
  let rangee = case_;
  let p = null;
  try { p = case_.parent; } catch (e) { p = null; }
  for (let i = 0; p && i < 6; i++) {
    if (contientAutre(p)) break;   // conteneur partagé avec d'autres champs : on ne le replie pas
    rangee = p;
    try { p = p.parent; } catch (e) { p = null; }
  }
  console.log('[LPC][AdminProfil] pas de photo : rangée du consentement image repliée :', '#' + rangee.id);
  rangeeConsentement = rangee;   // réaffichée si un fichier est choisi (cablerPhoto)
  cacher(rangee);
  cacher(optionnel(EL_PHOTO.bloc)); cacher(optionnel(EL_PHOTO.image)); cacher(optionnel(EL_PHOTO.retrait));
}

function vignette(url) {
  const bloc = optionnel(EL_PHOTO.bloc);
  let img = optionnel(EL_PHOTO.image);
  // Image introuvable par son ID : liste des images de la page (diagnostic) et repli sur celle dont l'ID parle d'image/photo
  if (!img) {
    let images = [];
    try { const t = $w('Image'); for (let i = 0; i < t.length; i++) images.push(t[i]); } catch (e) { images = []; }
    console.warn('[LPC][AdminProfil] ' + EL_PHOTO.image + ' introuvable. Images présentes :', images.map((x) => '#' + x.id).join(', ') || '(aucune)');
    img = images.find((x) => /photo|image/i.test(String(x.id || ''))) || null;
  }
  console.log('[LPC][AdminProfil] photo :', url ? String(url).slice(0, 70) : 'aucune',
    '| image :', img ? '#' + img.id : 'absente', '| conteneur ' + EL_PHOTO.bloc + ' :', Boolean(bloc));
  aPhoto = Boolean(url);
  if (!url) { masquerRangeeConsentement(); return; }   // aucune photo : ni vignette, ni case de consentement image (Bruno, 01/10)
  if (!img) return;
  try { img.src = url; } catch (e) { console.error('[LPC][AdminProfil] img.src KO :', e); }
  try { if (img.alt !== undefined) img.alt = 'Photo du membre'; } catch (e) { /* ignoré */ }
  montrer(img);
  montrer(bloc);
  // L'image peut se trouver dans un conteneur replié ou masqué que l'on ne connaît pas (#box156 n'existe pas sur toutes
  // les pages) : on rouvre toute sa chaîne de parents.
  let p = null;
  try { p = img.parent; } catch (e) { p = null; }
  for (let i = 0; p && i < 6; i++) {
    montrer(p);
    try { p = p.parent; } catch (e) { p = null; }
  }
  montrer(optionnel(EL_PHOTO.retrait));   // retrait possible (03/10) : appliqué à l'enregistrement
  console.log('[LPC][AdminProfil] vignette état :', JSON.stringify({ hidden: img.hidden, collapsed: img.collapsed, src: String(img.src || '').slice(0, 50) }));
}

// ─── navigation vers les listes de /admin ────────────────────────────────
// Les boutons de navigation hérités de /mon-profil et /mon-organisme (Membre, Organisme, Résidents) pointaient vers les
// pages self-service (01/10 : jusqu'à l'ancienne /mon-profil-old). Ici ils ramènent aux LISTES de /admin, onglet choisi
// par ?onglet=… (aucun identifiant). Lien posé par le code (écrase celui de l'éditeur) + clic en doublon sans risque.
const URL_JUMELAGES = '/adminjumelages?tous=1';
// Style commun des boutons de navigation (04/10) : inactif = fond blanc, texte et bordure #C61010 ; actif (la page visée = celle-ci) = fond #C61010, texte et bordure blancs
const NAV_ACTIF = 'membres';
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
    if (!b) { console.warn('[LPC][AdminProfil] bouton « ' + n.cle + ' » introuvable : ajoutez-le pour revenir à la liste correspondante'); return; }
    const url = n.url || '/admin?onglet=' + n.cle;
    montrer(b);
    try { b.link = url; } catch (e) { /* repli sur le clic */ }
    if (typeof b.onClick === 'function') b.onClick(() => wixLocation.to(url));
    peindreNav(b, n.cle === NAV_ACTIF);
    console.log('[LPC][AdminProfil] navigation « ' + n.cle + ' » → ' + url + ' | bouton #' + b.id);
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

// ─── lien vers l'organisme du membre ─────────────────────────────────────
// Éléments FACULTATIFS : #pileOrganisme (pile, repliée si le membre n'a pas d'organisme) et #lienOrganisme (texte ou
// bouton cliquable : le nom de l'organisme). Le clic ouvre /adminorganisme ; le serveur retrouve l'organisme seul.
function lienOrganisme() {
  const pile = optionnel(EL_ORG.pile);
  const lien = premier(IDS_LIEN) || optionnel(EL_ORG.lien);   // #TitreLinkAdmin d'abord
  const org = d.organisation;
  console.log('[LPC][AdminProfil] organisme :', org ? org.nom : 'aucun', '| pile :', Boolean(pile), '| lien :', Boolean(lien));
  if (!org || !lien) { cacher(pile); return; }
  IDS_LIEN.forEach((id) => { const x = optionnel(id); if (x && x.id !== lien.id) cacher(x); });   // l'autre lien éventuel est replié
  try { if ('label' in lien) lien.label = org.nom; } catch (e) { /* ignoré */ }
  try { if ('text' in lien) lien.text = org.nom; } catch (e) { /* ignoré */ }
  if (typeof lien.onClick === 'function') lien.onClick(ouvrirOrganisme);
  montrer(lien); montrer(pile);
}
// ─── bouton « Jumelage » ─────────────────────────────────────────────────
// Visible seulement si le porteur ÉCRIT DES CARTES (capacités enregistrées) et a un nombre de cartes ; le serveur recontrôle.
let lienJumelage = false;   // #LienJumelages ouvre /adminjumelages seulement si le porteur peut jumeler
function boutonJumelage() {
  const boutons = IDS_BTN_JUMELAGE.map((id) => optionnel(id)).filter(Boolean);
  const box = premier(IDS_BOX_RESIDENTS);
  if (!boutons.length) console.warn('[LPC][AdminProfil] #BtnJumelage introuvable');
  if (!box) console.warn('[LPC][AdminProfil] #AdminboxResidents introuvable');
  const p = d.profil || {};
  // Box visible pour un PORTEUR : « Écrire des cartes » enregistré ET nombre de cartes indiqué (peut jumeler : boutons affichés, le serveur
  // recontrôle), ou statut Porteur avec au moins un jumelage (08/10 : liste seule). Un accueillant n'a pas de jumelages ici : ses
  // résidents se jumellent depuis /adminorganisme.
  const peutJumeler = ecritDesCartes(p.capacites) && nombreDe(p.nbResidentsMax);
  const statutPorteur = (p.statuts || []).some((s) => String(s).toLowerCase() === 'porteur');
  const aDesJumelages = statutPorteur && ((d.jumelages || {}).liste || []).length > 0;
  lienJumelage = Boolean(peutJumeler);
  console.log('[LPC][AdminProfil] jumelages : statut Porteur =', statutPorteur, '| peut jumeler (écrit des cartes + nombre) =', Boolean(peutJumeler),
    '| jumelés reçus :', ((d.jumelages || {}).liste || []).length, '| box :', box ? box.id : 'introuvable',
    '| titre :', (premier(IDS_TITRE_JUMELAGES) || {}).id || 'introuvable', '| texte :', (premier(IDS_TEXTE_JUMELAGES) || {}).id || 'introuvable',
    '| boutons :', boutons.map((b) => b.id).join(', ') || 'aucun');
  if (!peutJumeler && !aDesJumelages) { boutons.forEach(cacher); cacher(box); return; }
  montrer(box); montrerParents(box);
  try { let x = box.parent; const ch = []; for (let i = 0; x && i < 5; i++) { ch.push(x.id + ':' + (x.hidden ? 'H' : '') + (x.collapsed ? 'C' : '')); x = x.parent; } console.log('[LPC][AdminProfil] box des jumelages : hidden =', box.hidden, '| collapsed =', box.collapsed, '| visible =', box.isVisible, '| parents :', ch.join(' > ')); } catch (e) { /* ignoré */ }
  boutons.forEach((b) => { if (peutJumeler) { montrer(b); montrerParents(b); if (typeof b.onClick === 'function') b.onClick(ouvrirJumelage); } else cacher(b); });
  afficherJumelages();
}
/** Diagnostic (08/10) : état à l'exécution de tous les éléments dont l'ID évoque les jumelages ou les résidents (id, masqué, replié, visible, parent). */
function inventaireJumelages() {
  try {
    const sortie = [];
    ['Text', 'Button', 'Container', 'Box', 'Stack', 'Repeater', 'Image', 'Strip', 'Column'].forEach((type) => {
      let els = null;
      try { els = $w(type); } catch (e) { return; }
      if (!els || typeof els.forEach !== 'function') return;
      els.forEach((e) => {
        const id = String((e && e.id) || '');
        if (!/jum|resid|box185|admin/i.test(id)) return;
        let p = null; try { p = e.parent; } catch (x) { p = null; }
        sortie.push(type + ' #' + id + ' [' + (e.hidden ? 'H' : '') + (e.collapsed ? 'C' : '') + (e.isVisible ? 'V' : '-') + '] <' + (p ? p.id : '?') + '>');
      });
    });
    console.log('[LPC][Inventaire] jumelages / résidents :', sortie.join(' | ') || 'aucun élément');
  } catch (e) { console.warn('[LPC][Inventaire] KO :', e && e.message); }
}
/** Tableau des jumelés = tableau Wix #tableJumelage (colonnes posées par le code : num, nom, etablissement, interets). Renvoie false s'il est absent. */
function remplirTableau(liste) {
  const tab = premier(IDS_TABLE_JUMELAGES);
  if (!tab) return false;
  try {
    try {
      const actuelles = Array.isArray(tab.columns) ? tab.columns : [];
      const cols = COLONNES_JUMELAGES.map((c, i) => Object.assign({}, actuelles[i] || {}, c));   // largeurs de l'éditeur conservées au départ
      // 08/10 (Bruno) : colonnes = nom du résident, établissement, centres d'intérêt (plus de numéro) ; largeurs fixes demandées : 120 / 220 / 240
      const LARGEURS = [120, 240, 220];   // 10/10 : centres d'intérêt (240) avant l'établissement (220)
      cols.forEach((c, i) => { if (LARGEURS[i]) c.width = LARGEURS[i]; });
      console.log('[LPC] largeurs de #tableJumelage : ' + cols.map((c) => c.width).join(' / ') + ' (éditeur : ' + JSON.stringify(actuelles.map((c) => c && c.width)) + ')');
      tab.columns = cols;
    } catch (e) {
      let dp = '?'; try { dp = (tab.columns || []).map((c) => c.dataPath).join(', '); } catch (x) { /* ignoré */ }
      console.warn('[LPC][AdminProfil] colonnes de #tableJumelage non posées (' + (e && e.message) + ') ; dataPath de l\'éditeur : ' + dp);
    }
    try { if (tab.customClassList) tab.customClassList.add('lpc-table-jumelage'); } catch (e) { console.warn('[LPC][AdminProfil] classe lpc-table-jumelage non posée :', e && e.message); }   // 10/10 : police Paragraphe 2 (Wix Madefor Text 16 px), sans gras (global.css)
    tab.rows = liste.map((x, i) => ({ _id: 'j' + (i + 1), nom: x.nom || '', etablissement: x.organisme || '', interets: x.interets || '' }));
    montrer(tab); montrerParents(tab);
    return true;
  } catch (e) { console.error('[LPC] tableau des jumelages KO :', e); return false; }
}
/** « Jumelages : 2/2 » : « Jumelage » au singulier pour 0 ou 1 ; « /Y » (cartes à écrire) seulement si Y est connu. */
function titreJumelages(n, max) {
  return (n > 1 ? 'Jumelages' : 'Jumelage') + ' : ' + n + (Number(max) > 0 ? '/' + Number(max) : '');
}
/** #AdmintitreJumelages = « Jumelages : X/Y » (X jumelages en cours, Y cartes à écrire), (non cliquable : le lien vers /adminjumelages est #LienJumelages) ;
 *  tableau #tableJumelage (une ligne par résident, replié s'il n'y en a pas). Prénom + initiale, établissement, centres d'intérêt : aucune donnée de santé ni chambre. */
function afficherJumelages() {
  const j = d.jumelages || { encours: 0, max: 0, liste: [] };
  const liste = j.liste || [];
  cacher(premier(IDS_TEXTE_JUMELAGES));
  const titre = premier(IDS_TITRE_JUMELAGES);
  if (titre) {
    try {
      titre.text = liste.length || Number(j.max) > 0 ? titreJumelages(Number(j.encours) || 0, j.max) : 'Pas de jumelage en cours';
      montrer(titre);
    } catch (e) { console.error('[LPC][AdminProfil] titre des jumelages KO :', e); }
  } else console.warn('[LPC][AdminProfil] #AdmintitreJumelages introuvable');
  const lien = premier(IDS_LIEN_JUMELAGES);
  if (!lien) console.warn('[LPC][AdminProfil] #LienJumelages introuvable : lien vers /adminjumelages non disponible');
  else if (!lienJumelage) cacher(lien);
  else {
    montrer(lien); montrerParents(lien);
    if (!lienCable && typeof lien.onClick === 'function') { lienCable = true; lien.onClick(ouvrirJumelage); }
  }
  if (liste.length && remplirTableau(liste)) return;
  cacher(premier(IDS_TABLE_JUMELAGES));
  if (liste.length) console.warn('[LPC][AdminProfil] #tableJumelage introuvable : jumelages non affichés');
}
let lienCable = false;
// ─── statut d'un membre qui n'en a pas (08/10) ───────────────────────────
// #dropdownStatut (élément de la PAGE, replié par défaut) apparaît seulement pour un membre SANS statut : l'admin le définit, il est
// envoyé à l'enregistrement. Le serveur ne l'accepte que si le membre n'a toujours aucun statut.
function statutADefinir() {
  const p = d.profil || {};
  const sansStatut = !(p.statuts || []).length;
  console.log('[LPC][AdminProfil] statut : membre ' + (sansStatut ? 'SANS statut' : 'avec statut (' + (p.statuts || []).join(', ') + ')'),
    '| options reçues :', Array.isArray(d.statutOptions) ? d.statutOptions.length : 'aucune (backend ancien ?)', '| liste présente :', Boolean(optionnel(IDS_STATUT.liste)));
  if (!sansStatut) return;
  let options = d.statutOptions || [];
  if (!options.length) { options = STATUTS_PAR_DEFAUT; console.warn('[LPC][AdminProfil] statutOptions absentes : liste par défaut (le backend admin.web.js en ligne est peut-être ancien)'); }
  const l = optionnel(IDS_STATUT.liste);
  if (!l) { console.warn('[LPC][AdminProfil] ' + IDS_STATUT.liste + ' introuvable : membre sans statut, impossible de le définir'); return; }
  l.options = options.map((v) => ({ label: v, value: v }));
  l.value = '';
  montrer(l); montrerParents(l); montrer(optionnel(IDS_STATUT.titre));
  statutPropose = true;
  console.log('[LPC][AdminProfil] membre sans statut : liste des statuts affichée');
  // Diagnostic : « affichée » côté code ne garantit pas qu'elle soit visible (parent replié ou masqué dans l'éditeur ?)
  try {
    const etat = (e) => (e ? { id: e.id, hidden: e.hidden, collapsed: e.collapsed, visible: e.isVisible } : null);
    const parents = [];
    let x = l.parent;
    for (let i = 0; x && i < 5; i++) { parents.push(etat(x)); x = x.parent; }
    console.log('[LPC][AdminProfil] état de #dropdownStatut :', JSON.stringify({ liste: etat(l), titre: etat(optionnel(IDS_STATUT.titre)), options: (l.options || []).length, parents }));
  } catch (e) { console.warn('[LPC][AdminProfil] diagnostic de la liste KO :', e && e.message); }
}
async function ouvrirJumelage() {
  hideErr();
  try {
    const res = await adminOuvrirResidents({ origine: 'porteur', ticket });
    console.log('[LPC][AdminProfil] ouverture du jumelage', res);
    if (res && res.refuse) { wixLocation.to('/'); return; }
    if (res && res.ok) { wixLocation.to(PAGE_RESIDENTS); return; }
    showErr(res && res.reason === 'ticket-invalide'
      ? "La session d'édition a expiré. Retournez à la liste et cliquez de nouveau sur « Modifier »."
      : res && res.reason === 'pas-porteur'
        ? "Ce membre n'écrit pas de cartes (ou n'a pas indiqué leur nombre) : jumelage impossible."
        : "Impossible d'ouvrir la page de jumelage.");
  } catch (e) {
    console.error('[LPC][AdminProfil] adminOuvrirResidents KO:', e);
    showErr("Impossible d'ouvrir la page de jumelage.");
  }
}

// ─── e-mail de jumelage au porteur (04/10) ───────────────────────────────
// Le bouton #buttonSendToPorteur (masqué par défaut) n'apparaît que si le porteur a TOUS ses jumelages (quota rempli, calculé par le
// serveur : d.emailPorteurPossible). Un clic = brouillon ouvert dans Gmail (fenêtre de rédaction), RIEN n'est envoyé par le site.
let lienEnCours = false;
/** « Envoyer le lien de mot de passe » : visible seulement si l'e-mail du compte Wix n'est PAS vérifié (d.emailVerifie === false). Wix envoie à la personne l'e-mail
 *  de définition du mot de passe ; ce parcours vérifie l'e-mail. L'admin prévient ensuite la personne à la main. */
function boutonLienMdp() {
  const b = premier(IDS_BTN_LIEN_MDP);
  if (!b) { console.log('[LPC][AdminProfil] bouton « Envoyer le lien de mot de passe » absent (facultatif : ' + IDS_BTN_LIEN_MDP[0] + ')'); return; }
  if (d.emailVerifie !== false) { cacher(b); return; }
  montrer(b); montrerParents(b);
  if (typeof b.onClick !== 'function') return;
  b.onClick(async () => {
    if (lienEnCours) return;
    lienEnCours = true; hideErr();
    try {
      const res = (await adminEnvoyerLienMotDePasse({ ticket })) || {};
      console.log('[LPC][AdminProfil] lien de mot de passe', { ok: res.ok, reason: res.reason });
      if (res.refuse) { wixLocation.to('/'); return; }
      if (res.ok) showErr('Lien envoyé à la personne. Prévenez-la (e-mail manuel) : elle définit son mot de passe puis se connecte.', '#1E8449');
      else showErr("L'envoi du lien a échoué, merci de réessayer dans un instant.");
    } catch (e) { console.error('[LPC][AdminProfil] adminEnvoyerLienMotDePasse KO:', e); showErr("L'envoi du lien a échoué, merci de réessayer dans un instant."); }
    lienEnCours = false;
  });
}
function boutonEmail() {
  const b = premier(IDS_BTN_EMAIL);
  if (!b) { console.warn('[LPC][AdminProfil] #buttonSendToPorteur introuvable'); return; }
  if (d.emailPorteurPossible !== true) { cacher(b); return; }
  montrer(b);
  if (typeof b.onClick === 'function') b.onClick(() => envoyerEmailPorteur(b));
}
async function envoyerEmailPorteur(bouton) {
  if (emailEnCours) return;
  hideErr();
  emailEnCours = true;
  try { if (bouton && typeof bouton.disable === 'function') bouton.disable(); } catch (e) { /* ignoré */ }
  try {
    const res = (await adminEmailPorteurCourant({ ticket })) || {};
    console.log('[LPC][AdminProfil] e-mail porteur', { ok: res.ok, reason: res.reason, nb: res.nb, sansAccord: res.sansAccord });
    if (res.refuse) { wixLocation.to('/'); return; }
    if (!res.ok) {
      showErr({
        'quota-non-rempli': "Le quota de ce porteur n'est pas rempli : l'e-mail n'est pas disponible.",
        'pas-d-email': "Ce porteur n'a pas d'adresse e-mail enregistrée.",
        'pas-porteur': "Ce membre n'écrit pas de cartes (ou n'a pas indiqué leur nombre).",
        'ticket-invalide': "La session d'édition a expiré. Retournez à la liste et cliquez de nouveau sur « Modifier ».",
      }[res.reason] || "Impossible de préparer l'e-mail.");
      return;
    }
    const url = urlGmail(res);
    let note = '';
    if (res.sansAccord > 0) note += res.sansAccord + ' résident' + (res.sansAccord > 1 ? 's' : '') + " sans accord RGPD enregistré : à vérifier avant d'envoyer. ";
    if (url.length > LONGUEUR_MAX_URL) {   // lien long : le texte est aussi copié (⚠️ copyToClipboard non vérifié sur Wix)
      try {
        if (typeof wixWindowFrontend.copyToClipboard === 'function') {
          await wixWindowFrontend.copyToClipboard(res.corps);
          note += 'Le texte du message a aussi été copié dans le presse-papiers. ';
        }
      } catch (e) { console.warn('[LPC][AdminProfil] copie dans le presse-papiers KO :', e && e.message); }
    }
    if (note) showErr(note.trim(), COULEUR_QUESTION);
    wixLocation.to(url);
  } catch (e) {
    console.error('[LPC][AdminProfil] e-mail porteur KO:', e);
    showErr("Impossible de préparer l'e-mail, merci de réessayer dans un instant.");
  } finally {
    emailEnCours = false;
    try { if (bouton && typeof bouton.enable === 'function') bouton.enable(); } catch (e) { /* ignoré */ }
  }
}

// ─── consentement RGPD : affiché, grisé ──────────────────────────────────
function griserRgpd() {
  const c = optionnel(ID_RGPD);
  if (!c) { console.warn('[LPC][AdminProfil] ' + ID_RGPD + ' introuvable : consentement RGPD non affiché'); return; }
  montrer(c);
  try { c.checked = ((d.profil || {}).consentementRgpd === true); } catch (e) { /* ignoré */ }
  try { if (typeof c.disable === 'function') c.disable(); } catch (e) { /* ignoré */ }
  try { if (c.customClassList) c.customClassList.add('lpc-desactive'); } catch (e) { /* ignoré */ }
  try { if (typeof c.resetValidityIndication === 'function') c.resetValidityIndication(); } catch (e) { /* ignoré */ }
}

async function ouvrirOrganisme() {
  hideErr();
  try {
    const res = await adminOuvrirOrganismeDuMembre({ ticket });
    console.log('[LPC][AdminProfil] ouverture de l’organisme', res);
    if (res && res.refuse) { wixLocation.to('/'); return; }
    if (res && res.ok) { wixLocation.to(PAGE_ORGANISME + '?depuis=profil'); return; }   // /adminorganisme revient ici après l'enregistrement
    showErr(res && res.reason === 'ticket-invalide'
      ? "La session d'édition a expiré. Retournez à la liste et cliquez de nouveau sur « Modifier »."
      : "Impossible d'ouvrir la fiche de l'organisme.");
  } catch (e) {
    console.error('[LPC][AdminProfil] adminOuvrirOrganismeDuMembre KO:', e);
    showErr("Impossible d'ouvrir la fiche de l'organisme.");
  }
}

/** E-mail du membre visé, affiché désactivé (jamais modifiable, jamais renvoyé). */
function poserEmail(email) {
  const el = premier(EMAIL_IDS);
  if (!el) return;
  try { el.value = email || ''; } catch (e) { /* ignoré */ }
  try { if (typeof el.disable === 'function') el.disable(); } catch (e) { /* ignoré */ }
  try { if (el.customClassList) el.customClassList.add('lpc-desactive'); } catch (e) { /* ignoré */ }
  try { if (typeof el.resetValidityIndication === 'function') el.resetValidityIndication(); } catch (e) { /* ignoré */ }
}

// ─── nombre de cartes ────────────────────────────────────────────────────
function ecritDesCartes(labels) {
  return (Array.isArray(labels) ? labels : [])
    .some((l) => String(l || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes('ecrire'));
}
function nombreDe(v) {
  if (typeof v === 'number') return Number.isInteger(v) && v >= 1 && v <= 99 ? v : null;
  const s = String(v == null ? '' : v).trim();
  return MOTIF_NB.test(s) ? Number(s) : null;
}
function champNbResidents() {
  if (champNb === undefined) champNb = premier(NB_RESIDENTS);
  return champNb;
}
function filtrerChiffres(el) {
  const brut = String(el.value == null ? '' : el.value);
  const propre = brut.replace(/\D/g, '').slice(0, 2);
  if (propre !== brut) el.value = propre;
  if (/\D/.test(brut)) signalerChiffres();
  try { if (typeof el.resetValidityIndication === 'function') el.resetValidityIndication(); } catch (e) { /* ignoré */ }
}
function signalerChiffres() {
  const aide = premier(AIDE_NB);
  if (minuterieAide) clearTimeout(minuterieAide);
  if (aide) {
    try {
      if (aide.html !== undefined) aide.html = `<p style="color:${COULEUR_QUESTION}; margin:0;">${escapeHtml(MSG_CHIFFRES)}</p>`;
      else if (aide.text !== undefined) aide.text = MSG_CHIFFRES;
    } catch (e) { /* ignoré */ }
    montrer(aide);
    minuterieAide = setTimeout(() => cacher(aide), DUREE_AIDE_MS);
  } else {
    showErr(MSG_CHIFFRES, COULEUR_QUESTION);
    minuterieAide = setTimeout(hideErr, DUREE_AIDE_MS);
  }
}
function preparerNbResidents(actuel) {
  const el = champNbResidents();
  if (!el) return;
  try { el.maxLength = 2; } catch (e) { /* ignoré */ }
  const n = nombreDe(actuel);
  el.value = n ? String(n) : '';
  if (typeof el.enable === 'function') el.enable();
  if (typeof el.onInput === 'function') el.onInput(() => filtrerChiffres(el));
  try { if (typeof el.resetValidityIndication === 'function') el.resetValidityIndication(); } catch (e) { /* ignoré */ }
}
function majNbResidents() {
  const el = champNbResidents();
  if (!el) return;
  const ecrit = ecritDesCartes(valeur(EL.capacites));
  [premier(TITRE_NB), el].forEach((x) => { if (ecrit) montrer(x); else cacher(x); });
  if (!ecrit) cacher(premier(AIDE_NB));
  try { el.required = false; } catch (e) { /* ignoré */ }   // pas de bulle native : contrôle à l'envoi
  try { if (typeof el.resetValidityIndication === 'function') el.resetValidityIndication(); } catch (e) { /* ignoré */ }
}
function nbSaisissable() {
  return Boolean(champNbResidents()) && ecritDesCartes(valeur(EL.capacites));
}

// ─── photo : téléversement, retrait, traces (03/10) ──────────────────────
function tracer(etape, niveau, detail) {
  try { Promise.resolve(tracerClient({ page: 'adminprofil', etape, niveau, detail })).catch(() => {}); } catch (e) { /* ignoré */ }
}
function erreurTxt(e) {
  try { return (e && (e.message || e.code || e.name)) ? String(e.message || e.code || e.name) : String(e); } catch (x) { return '?'; }
}
/** Type et taille (Ko) du fichier choisi : jamais son nom. */
function infoFichier() {
  try {
    const up = optionnel(EL_PHOTO.envoi);
    const f = up && up.value && up.value[0];
    return f ? { type: f.type || '?', ko: Math.round((Number(f.size) || 0) / 1024) } : null;
  } catch (e) { return null; }
}
function fichierEnAttente() {
  const up = optionnel(EL_PHOTO.envoi);
  return Boolean(up && up.value && up.value.length > 0);
}
function cablerPhoto() {
  const up = optionnel(EL_PHOTO.envoi);
  if (!up) { console.warn('[LPC][AdminProfil] ' + EL_PHOTO.envoi + ' introuvable : ajout de photo impossible sur cette page'); }
  else {
    montrer(up);
    if (typeof up.onChange === 'function') up.onChange(() => {
      const en = fichierEnAttente();
      tracer('fichier-choisi', 'info', infoFichier());
      if (en) {
        photoASupprimer = false;                  // un nouvel envoi l'emporte sur un retrait demandé
        if (rangeeConsentement) montrer(rangeeConsentement);   // la case de consentement image doit pouvoir être cochée
        hideErr();
        if (CREATION) televerserCreation();   // 10/10 : en création, téléversement immédiat pour afficher la vignette
      }
    });
  }
  const retrait = optionnel(EL_PHOTO.retrait);
  if (retrait && typeof retrait.onClick === 'function') {
    retrait.onClick(() => {
      if (CREATION) { retirerPhotoCreation(); return; }
      photoASupprimer = true;
      tracer('retrait-demande', 'info');
      cacher(optionnel(EL_PHOTO.bloc)); cacher(optionnel(EL_PHOTO.image)); cacher(retrait);
      const c = optionnel(EL.consentementPhoto);
      if (c && c.checked !== undefined) c.checked = false;   // plus de photo, plus de consentement (le serveur l'applique aussi)
      showErr("La photo sera retirée lorsque vous enregistrerez. Le consentement image sera remis à « non ».", COULEUR_QUESTION);
    });
  } else if (aPhoto) {
    console.warn('[LPC][AdminProfil] ' + EL_PHOTO.retrait + ' introuvable : retrait de photo impossible sur cette page');
  }
}
/** Mode création (10/10) : téléverse le fichier dès qu'il est choisi, affiche la vignette et la case de consentement image. */
async function televerserCreation() {
  const photo = await televerser();
  if (!photo) return;
  if (photo.erreur) {
    photoCreation = null;
    showErr("Le téléversement de la photo a échoué (format ou taille refusés ?). Réessayez avec un autre fichier.");
    return;
  }
  photoCreation = photo;
  safe('vignette (création)', () => vignette(photo.url));
  if (rangeeConsentement) { montrer(rangeeConsentement); montrerParents(rangeeConsentement); }
}
/** Mode création : retrait de la photo choisie (rien n'est encore enregistré). */
function retirerPhotoCreation() {
  photoCreation = null; aPhoto = false;
  tracer('retrait-creation', 'info');
  cacher(optionnel(EL_PHOTO.bloc)); cacher(optionnel(EL_PHOTO.image)); cacher(optionnel(EL_PHOTO.retrait));
  const c = optionnel(EL.consentementPhoto);
  if (c && c.checked !== undefined) c.checked = false;
  try { const up = optionnel(EL_PHOTO.envoi); if (up && typeof up.reset === 'function') up.reset(); } catch (e) { /* ignoré */ }
  if (rangeeConsentement) cacher(rangeeConsentement);
}
/** Téléverse le fichier choisi. Renvoie { url, w, h } ou null (rien à envoyer) ; { erreur } si le téléversement échoue. */
async function televerser() {
  if (!fichierEnAttente()) return null;
  tracer('upload-debut', 'info', infoFichier());
  try {
    const files = await optionnel(EL_PHOTO.envoi).uploadFiles();
    const url = files && files.length ? (files[0].fileUrl || files[0].url || '') : '';
    if (!url) { tracer('upload-vide', 'warn', { fichier: infoFichier() }); return { erreur: true }; }
    const r = { url, w: Number(files[0].width) || 0, h: Number(files[0].height) || 0 };
    tracer('upload-ok', 'info', { urlRecue: true, w: r.w, h: r.h });
    return r;
  } catch (e) {
    tracer('upload-KO', 'error', { fichier: infoFichier(), erreur: erreurTxt(e) });
    console.error('[LPC][AdminProfil] upload photo KO:', e);
    return { erreur: true };
  }
}
const MSG_PHOTO_WIX = {
  restante: "Photo retirée de la fiche, mais le compte Wix du membre la conserve : elle pourrait réapparaître à sa prochaine connexion.",
  'non-poussee': "Photo enregistrée dans la fiche, mais Wix a refusé la mise à jour du compte du membre : l'ancienne photo pourrait réapparaître à sa prochaine connexion.",
  absente: "Photo enregistrée dans la fiche, mais le compte Wix du membre ne la montre pas encore (barre de connexion).",
  'non-verifiee': "Photo enregistrée ; le compte Wix du membre n'a pas pu être relu pour contrôle.",
  'sans-compte': "Photo enregistrée dans la fiche ; ce membre n'a pas de compte Wix lié (rien poussé).",
};

// ─── enregistrement ──────────────────────────────────────────────────────
async function sauver() {
  hideErr();
  const manque = [];
  if (!(valeur(EL.prenom) || '').trim() || !(valeur(EL.nom) || '').trim()) manque.push('indiquer le prénom et le nom');
  if (nbSaisissable()) {
    const saisi = String(champNbResidents().value || '').trim();
    if ((saisi && !nombreDe(saisi)) || (!saisi && NB_OBLIGATOIRE)) manque.push('indiquer un nombre de cartes entre 1 et 99');
  }
  if (manque.length) {
    showErr("Le formulaire n'est pas complet : merci de " + manque.join('; ') + '.');
    return;
  }
  desactiverBouton();
  const photo = await televerser();
  if (photo && photo.erreur) {
    showErr("Le téléversement de la photo a échoué (format ou taille refusés ?). Réessayez avec un autre fichier, ou retirez le fichier choisi pour enregistrer le reste.");
    activerBouton();
    return;
  }
  try {
    const res = await adminEnregistrerMembre({
      ticket,
      prenom: valeur(EL.prenom),
      nom: valeur(EL.nom),
      telephone: valeur(EL.telephone),
      localite: valeur(EL.localite),
      commentaire: valeur(EL.commentaire),
      capacites: valeur(EL.capacites),
      disponibilites: valeur(EL.disponibilites),
      // Sans photo (ni fichier choisi), la case est repliée : on n'envoie rien (le consentement enregistré reste tel quel)
      consentementPhoto: (aPhoto || photo) && !photoASupprimer ? Boolean((optionnel(EL.consentementPhoto) || {}).checked) : undefined,
      photoUrl: photo ? photo.url : undefined,
      photoW: photo ? photo.w : undefined,
      photoH: photo ? photo.h : undefined,
      supprimerPhoto: photoASupprimer && !photo ? true : undefined,
      nbResidentsMax: nbSaisissable() ? (nombreDe(champNbResidents().value) || undefined) : undefined,
      statut: statutPropose ? (String(valeur(IDS_STATUT.liste) || '') || undefined) : undefined,
    });
    console.log('[LPC][AdminProfil] enregistrement', res);
    if (res && res.refuse) { wixLocation.to('/'); return; }
    if (res && res.ok) {
      if (!res.pushWix) console.warn('[LPC][AdminProfil] compte Wix du membre NON mis à jour (nom / téléphone)');
      if (photo || photoASupprimer) tracer('enregistre', res.photoWix === 'ok' ? 'info' : 'warn', { photo: photo ? 'ajout' : 'retrait', photoWix: res.photoWix, versionServeur: res.version });
      // La fiche est enregistrée : retour à la page précédente DANS TOUS LES CAS (Bruno, 04/10). Un désaccord du compte Wix pour la photo
      // n'est plus affiché : il reste dans la console, les traces ([LPC][Trace]) et le journal.
      if ((photo || photoASupprimer) && res.photoWix && res.photoWix !== 'ok') {
        console.warn('[LPC][AdminProfil] photo : ' + (MSG_PHOTO_WIX[res.photoWix] || ('contrôle du compte Wix « ' + res.photoWix + ' ».')));
      }
      wixLocation.to(pageRetour());
      return;
    }
    tracer('enregistrement-refuse', 'error', { reponse: res && res.reason });
    showErr(res && res.reason === 'ticket-invalide'
      ? "La session d'édition a expiré. Retournez à la liste et cliquez de nouveau sur « Modifier »."
      : res && res.reason === 'photo-invalide'
        ? "La photo n'a pas été reconnue : réessayez avec un autre fichier."
        : "L'enregistrement a échoué, merci de réessayer dans un instant.");
  } catch (e) {
    tracer('enregistrement-KO', 'error', { erreur: erreurTxt(e) });
    console.error('[LPC][AdminProfil] adminEnregistrerMembre KO:', e);
    showErr('Une erreur est survenue, merci de réessayer dans un instant.');
  }
  activerBouton();
}

// ─── messages ────────────────────────────────────────────────────────────
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
/** Message : #errorTextAdminProfil (à côté du bouton « Enregistrer », 04/10) en priorité, à défaut #errorText de la section Navigation, puis #text112. */
const ID_ERREUR_PAGE = '#errorTextAdminProfil';
function erreurEl() { return optionnel(ID_ERREUR_PAGE) || premier(IDS_ERREUR) || optionnel(EL.erreur); }
function showErr(msg, couleur) {
  console.warn('[LPC][AdminProfil] message :', msg);
  const e = erreurEl();
  if (!e) { console.error('[LPC][AdminProfil] paragraphe ' + EL.erreur + ' introuvable : message non affiché'); return; }
  try {
    if (e.html !== undefined) e.html = `<p style="color:${couleur || COULEUR_ERREUR}; margin:0;">${escapeHtml(msg)}</p>`;
    else if (e.text !== undefined) e.text = msg;
    if (e.expand) e.expand();
    if (e.show) e.show();
  } catch (err) {
    console.error('[LPC][AdminProfil] affichage du message KO :', err);
  }
}
function hideErr() {
  [optionnel(ID_ERREUR_PAGE), premier(IDS_ERREUR), optionnel(EL.erreur)].forEach(masquerErr);
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
/** « 90 membres, 90 cartes, 9 résidents et 6 jumelages » (totaux du site, adminTotaux) ; séparateur de milliers : point. */
function texteTotaux(t) {
  const f = (n) => String(Number(n) || 0).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const p = (n, u, m) => f(n) + ' ' + ((Number(n) || 0) > 1 ? m : u);
  return p(t.membres, 'membre', 'membres') + ', ' + p(t.cartes, 'carte', 'cartes') + ', ' + p(t.residents, 'résident', 'résidents') + ' et ' + p(t.jumelages, 'jumelage', 'jumelages');
}
let totauxSite = null;
const IDS_TOTAUX_SITE = ['#TotauxMembresetJumelage', '#TotauxAdmin', '#TotauxMembresetJumelageAdmin'];
/** Écrit les totaux du site dans #TotauxMembresetJumelage (12/10) ; élément absent : avertissement, rien d'autre. */
async function peindreTotauxSite() {
  const e = premier(IDS_TOTAUX_SITE);
  if (!e) { console.warn('[LPC][AdminProfil] #TotauxMembresetJumelage introuvable : totaux du site non affichés (à créer dans l’éditeur)'); return; }
  if (!totauxSite) {
    try { const t = await adminTotaux(); if (t && t.ok) totauxSite = t; }
    catch (x) { console.warn('[LPC][AdminProfil] adminTotaux KO :', x && x.message); }
  }
  if (!totauxSite) return;
  try { e.text = texteTotaux(totauxSite); montrer(e); if (typeof montrerParents === 'function') montrerParents(e); } catch (x) { console.warn('[LPC][AdminProfil] totaux KO :', x && x.message); }
}

function safe(label, fn) {
  try { fn(); } catch (e) { console.error('[LPC][AdminProfil] ' + label + ' KO:', e); }
}
function optionnel(id) {
  try { const e = $w(id); return e && typeof e.type === 'string' ? e : null; }
  catch (err) { return null; }
}
function premier(ids) {
  for (const id of ids) { const e = optionnel(id); if (e) return e; }
  return null;
}
/** Réaffiche les conteneurs MASQUÉS ou REPLIÉS au-dessus d'un élément (jusqu'à la section) : montrer l'élément seul ne suffit pas quand son parent
 *  est masqué dans l'éditeur (constaté le 08/10 : #dropdownStatut dans une boîte `hidden`, donc invisible alors que le code l'« affichait »). */
function montrerParents(el) {
  try {
    let x = el && el.parent;
    for (let i = 0; x && i < 6; i++) {
      const id = String(x.id || '');
      if (/^(section|page|masterpage)/i.test(id)) break;
      if (x.hidden === true || x.collapsed === true) { console.log('[LPC] conteneur réaffiché :', id); montrer(x); }
      x = x.parent;
    }
  } catch (e) { /* ignoré */ }
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
function desactiverBouton() { const b = optionnel(EL.bouton); if (b && b.disable) b.disable(); }
function activerBouton() { const b = optionnel(EL.bouton); if (b && b.enable) b.enable(); }
/** Attache un clic ; `facultatif` = pas d'erreur si l'élément n'existe pas. */
function clic(id, fn, facultatif) {
  const el = optionnel(id);
  if (el && typeof el.onClick === 'function') el.onClick(fn);
  else if (!facultatif) console.error('[LPC][AdminProfil] bouton ' + id + ' introuvable : le formulaire ne pourra pas être envoyé');
}
function checkIds() {
  const manquants = Object.entries(EL).filter(([, id]) => !optionnel(id)).map(([k, id]) => k + '=' + id);
  if (manquants.length) {
    console.warn('[LPC][AdminProfil] éléments introuvables :', manquants.join(', '),
      '| la section globale du formulaire est-elle bien placée sur cette page ?');
  } else {
    console.log('[LPC][AdminProfil] tous les éléments sont présents');
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
