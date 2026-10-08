// Code de PAGE « Mon profil » (/mon-profil), mode « profil » du formulaire générique.
// Page « Membres uniquement ». Depuis le 30/09/2026 la page contient la SECTION GLOBALE du formulaire
// de F1 (mêmes ID : input5, checkboxGroup3…), et non plus son propre formulaire. L'ancien formulaire
// (#blocProfil et ses champs) est masqué dans l'éditeur par Bruno : ce code ne le touche plus.
//
// Différences avec F1 (mode « inscription »), décidées pour l'harmonisation du 30/09 :
//   - pas de consentement RGPD à cocher (donné à l'inscription) : case repliée, jamais exigée ni renvoyée
//   - bouton « Enregistrer » ; redirection vers /merci?f=porteur-mon-profil
//   - AUCUN statut ajouté (les statuts s'acquièrent par F1/F2/F3) ; options de cases = celles des statuts du membre
//   - pas de champ « fonction » : absent du formulaire générique ; la valeur enregistrée n'est pas touchée
//   - le backend est mon-profil.web.js (mise à jour partielle), pas form_1
// Validation identique à F1 : ≥1 capacité, ≥1 disponibilité, nombre de cartes si « Écrire » est cochée,
// consentement image si une nouvelle photo est ajoutée. Prénom et nom exigés (comme avant sur cette page).
//
// Hors section globale, propres à cette page : les onglets (#BoxOnglet, #BoxNav2, #ongletProfil,
// #ongletOrganisme, #ongletResidents), inchangés.

import { authentication, currentMember } from 'wix-members-frontend';
import wixLocation from 'wix-location';
import { getMonProfil, enregistrerMonProfil } from 'backend/mon-profil.web';
import { tracerClient } from 'backend/trace-client.web';

// ID de la section globale (identiques à F1, 29/09). Sensibles à la casse.
const EL = {
  prenom: '#input5',
  nom: '#input4',
  telephone: '#input3',
  localite: '#input2',
  commentaire: '#textBox1',
  capacites: '#checkboxGroup3',
  disponibilites: '#checkboxGroup2',
  consentement: '#checkbox2',          // RGPD : replié dans ce mode
  photo: '#uploadButton1',
  consentementPhoto: '#checkbox1',
  bouton: '#button15',
  erreur: '#text112',
};
// Éléments facultatifs : photo déjà enregistrée
const EL_OPT = {
  photoActuelle: '#imageX12',
  supprimerPhoto: '#button14',
  blocPhoto: '#box156',
};
// Nombre de cartes (champ texte 1 à 99) : ID candidats, comme dans F1
// Bouton vers /mon-organisme (06/10) : affiché seulement si « Proposer un lieu » est coché ; absent de F1 et de /adminprofil (leur code le replie)
const BTN_ORGANISATION = ['#btnorganisation', '#btnOrganisation'];
// Box des jumelages (#boxResidents et son contenu) : réservée à /adminprofil, replie ici (elle fait partie de la section globale)
const BOX_ADMIN = ['#boxResidents', '#BoxResidents'];
// 08/10 : la box est AFFICHÉE ici pour un porteur qui a des jumelages (titre + liste) ; ses boutons restent réservés à /adminprofil
const IDS_TITRE_JUM = ['#titreJumelages', '#TitreJumelages'];
const IDS_TEXTE_JUM = ['#textjumelage', '#textJumelage', '#textJumelages'];
const IDS_BOUTONS_ADMIN = ['#buttonJumelages', '#BtnJumelage', '#buttonSendToPorteur'];
const PAGE_ORGANISME = '/mon-organisme';
const CAPACITE_LIEU = 'proposer un lieu';
const NB_RESIDENTS = ['#input6', '#nbResidentsMax'];
const TITRE_NB = ['#text114', '#TitrenbResidentsMax'];
const AIDE_NB = ['#text113', '#aideNbResidents'];
const EMAIL_IDS = ['#input1', '#email', '#email1'];

// Onglets (hors section globale)
const EL_ONGLETS = {
  ongletProfil: '#ongletProfil',
  ongletOrganisme: '#ongletOrganisme',
  ongletResidents: '#ongletResidents',   // affiché pour les Accueillants avec organisation
};
const BOITE_ONGLETS = ['#BoxOnglet', '#boxOnglet', '#BoxOnglets', '#boxOnglets'];
// Pile intérieure : une pile se referme quand son contenu disparaît, pas une cellule de grille
const PILE_ONGLETS = ['#BoxNav2', '#boxNav2', '#BoxNav', '#boxNav'];
const ONGLET_ACTIF = { fond: '#C0392B', texte: '#FFFFFF' };
const ONGLET_INACTIF = { fond: '#FFFFFF', texte: '#C0392B' };
const STATUTS_ORGANISME = ['Accueillant', 'Partenaire'];
const STATUT_RESIDENTS = 'Accueillant';

const PAGE_MERCI = '/merci?f=porteur-mon-profil';
const LIBELLE_BOUTON = 'Enregistrer';

// Nombre de cartes : proposition d'harmonisation (30/09) = modifiable ici comme dans F1.
// Mettre false pour revenir à l'ancienne règle (lecture seule dès qu'un nombre est enregistré).
const NB_MODIFIABLE = true;
const MOTIF_NB = /^[1-9][0-9]?$/;
const NB_OBLIGATOIRE = true;
const MSG_CHIFFRES = 'Veuillez saisir uniquement des chiffres.';
const DUREE_AIDE_MS = 4000;

const COULEUR_ERREUR = '#C0392B';
const COULEUR_QUESTION = '#B9770E';

let d = {};
let photoASupprimer = false;
let nbEnregistre = null;
let champNb;
let minuterieAide = null;

$w.onReady(async () => {
  console.log('[LPC][Profil] version du code : 2026-10-08-a (formulaire générique, mode profil ; traces photo ; bouton organisation ; jumelages du porteur)');
  safe('masquage erreur', hideErr);
  safe('contrôle des ID', checkIds);
  safe('onglet actif', () => marquerOnglet(EL_ONGLETS.ongletProfil, EL_ONGLETS.ongletOrganisme));
  // Onglets, consentement RGPD, champ « nombre de cartes » masqués d'emblée, avant tout appel serveur
  safe('masquage initial', () => {
    cacher(pileOnglets()); cacher(boiteOnglets()); cacher(optionnel(EL_ONGLETS.ongletResidents));
    cacher(optionnel(EL.consentement));
    cacher(premier(BOX_ADMIN));          // box des jumelages : admin seulement
    cacher(premier(BTN_ORGANISATION));   // réaffiché par majBoutonOrganisation() si « Proposer un lieu » est coché
    cacher(champNbResidents()); cacher(premier(TITRE_NB)); cacher(premier(AIDE_NB));
  });
  safe('libellé du bouton', () => { const b = optionnel(EL.bouton); if (b && 'label' in b) b.label = LIBELLE_BOUTON; });

  if (!authentication.loggedIn()) { wixLocation.to('/participer'); return; }

  try {
    d = (await getMonProfil()) || {};
    console.log('[LPC][Profil] données reçues', { existe: d.existe, capacites: (d.capaciteOptions || []).length });
  } catch (e) {
    console.error('[LPC][Profil] getMonProfil KO:', e);
  }

  if (!d.existe) {
    safe('masquage des onglets', () => { cacher(pileOnglets()); cacher(boiteOnglets()); });
    safe('bouton désactivé', () => { const b = optionnel(EL.bouton); if (b && b.disable) b.disable(); });
    showErr("Votre fiche n'existe pas encore. Merci de remplir d'abord un formulaire de participation.");
    return;
  }

  safe('visibilité des onglets', () => ongletsVisibles(d.profil, d.organisation));
  remplir();
  safe('trace du fichier choisi', () => {
    const up = optionnel(EL.photo);
    if (up && typeof up.onChange === 'function') up.onChange(() => tracer('fichier-choisi', 'info', infoFichier()));
  });
  clic(EL.bouton, sauver);
});

// ─── onglets (inchangés) ─────────────────────────────────────────────────
function ongletsVisibles(profil, organisation) {
  const statuts = (profil && profil.statuts) || [];
  const aUnStatut = statuts.some((s) => STATUTS_ORGANISME.some((x) => normTxt(x) === normTxt(s)));
  const aUneOrganisation = Boolean(organisation);
  const boite = boiteOnglets();
  const pile = pileOnglets();
  if (boite || pile) {
    [pile, boite].forEach((el) => { if (!el) return; if (aUneOrganisation) montrer(el); else cacher(el); });
  } else {
    console.warn("[LPC][Profil] boîte d'onglets introuvable (" + BOITE_ONGLETS.join(', ') + ')');
    const onglet = optionnel(EL_ONGLETS.ongletOrganisme);
    if (aUneOrganisation) montrer(onglet); else cacher(onglet);
  }
  const ongletRes = optionnel(EL_ONGLETS.ongletResidents);
  if (ongletRes) {
    peindre(ongletRes, ONGLET_INACTIF);
    const accueillant = statuts.some((s) => normTxt(s) === normTxt(STATUT_RESIDENTS));
    if (accueillant && aUneOrganisation) montrer(ongletRes); else cacher(ongletRes);
  }
  console.log('[LPC][Profil] onglets', aUneOrganisation ? 'affichés' : 'masqués (aucune organisation liée)',
    '| statuts :', statuts.join(', '));
  if (aUnStatut && !aUneOrganisation) {
    console.warn('[LPC][Profil] statut Accueillant/Partenaire SANS organisation liée : fiche à vérifier');
  }
}
function boiteOnglets() { return premier(BOITE_ONGLETS); }
function pileOnglets() { return premier(PILE_ONGLETS); }
function normTxt(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
}
function marquerOnglet(idActif, idInactif) {
  peindre(optionnel(idActif), ONGLET_ACTIF);
  peindre(optionnel(idInactif), ONGLET_INACTIF);
}
function peindre(el, couleurs) {
  if (!el || !el.style) return;
  try { el.style.backgroundColor = couleurs.fond; } catch (e) { /* ignoré */ }
  try { el.style.color = couleurs.texte; } catch (e) { /* ignoré */ }
  try { el.style.borderColor = ONGLET_ACTIF.fond; } catch (e) { /* ignoré */ }
}

// ─── préremplissage ──────────────────────────────────────────────────────
function remplir() {
  const p = d.profil || {};
  safe('profil', () => {
    setVal(EL.prenom, p.prenom);
    setVal(EL.nom, p.nom);
    setVal(EL.telephone, p.telephone);
    setVal(EL.localite, p.localite);
    setVal(EL.commentaire, p.commentaire);
  });
  poserEmail(p.email).catch((e) => console.error('[LPC][Profil] e-mail (lecture seule) KO:', e));
  safe('jumelages du porteur', afficherJumelages);
  safe('options capacites', () => {
    $w(EL.capacites).options = (d.capaciteOptions || []).map((v) => ({ label: v, value: v }));
    setVal(EL.capacites, p.capacites);
  });
  safe('bouton organisation', () => {
    majBoutonOrganisation();
    const caps = optionnel(EL.capacites);
    if (caps && typeof caps.onChange === 'function') caps.onChange(() => majBoutonOrganisation());
  });
  safe('options disponibilites', () => {
    $w(EL.disponibilites).options = (d.disponibiliteOptions || []).map((v) => ({ label: v, value: v }));
    setVal(EL.disponibilites, p.disponibilites);
  });
  safe('consentement image', () => {
    const e = optionnel(EL.consentementPhoto);
    if (e && e.checked !== undefined) e.checked = p.consentementPhoto === true;
  });
  safe('champ nbResidentsMax', () => {
    preparerNbResidents(p.nbResidentsMax);
    majNbResidents();
    const caps = optionnel(EL.capacites);
    if (caps && typeof caps.onChange === 'function') caps.onChange(() => majNbResidents());
  });
  safe('photo existante', () => {
    const img = optionnel(EL_OPT.photoActuelle);
    const btn = optionnel(EL_OPT.supprimerPhoto);
    const bloc = optionnel(EL_OPT.blocPhoto);
    if (!img && !btn && !bloc) return;
    const masquerTout = () => { if (bloc) cacher(bloc); else { cacher(img); cacher(btn); } };
    if (!p.photoUrl) { masquerTout(); return; }
    if (img) { img.src = p.photoUrl; if (img.alt !== undefined) img.alt = 'Votre photo actuelle'; montrer(img); }
    montrer(bloc);
    if (btn) {
      montrer(btn);
      btn.onClick(() => {
        photoASupprimer = true;
        tracer('retrait-demande', 'info');
        masquerTout();
        showErr('Votre photo sera retirée lorsque vous enregistrerez votre profil.', COULEUR_QUESTION);
      });
    }
  });
  // Pas d'indicateur « champ invalide » : Wix a vu les champs vides au rendu serveur
  safe('remise à zéro des indications de validité', () => {
    Object.values(EL).forEach((id) => {
      const el = optionnel(id);
      if (el && typeof el.resetValidityIndication === 'function') {
        try { el.resetValidityIndication(); } catch (e) { /* ignoré */ }
      }
    });
  });
}

// ─── jumelages du porteur (08/10) ────────────────────────────────────────
// Visible seulement si le membre est PORTEUR et a au moins un résident jumelé (le serveur ne renvoie la liste qu'à un porteur).
// #titreJumelages = « Jumelage(s) : N » ; #textjumelage = liste numérotée « Prénom I., Organisme, centres d'intérêt ». Aucune donnée de santé.
function afficherJumelages() {
  IDS_BOUTONS_ADMIN.forEach((id) => cacher(optionnel(id)));   // boutons réservés à l'admin
  const j = d.jumelages || { encours: 0, liste: [] };
  const liste = j.liste || [];
  const box = premier(BOX_ADMIN);
  const porteur = ((d.profil || {}).statuts || []).some((s) => normTxt(s) === 'porteur');
  if (!porteur || !liste.length) { cacher(box); return; }
  montrer(box);
  const titre = premier(IDS_TITRE_JUM);
  if (titre) { try { titre.text = 'Jumelage(s) : ' + liste.length; montrer(titre); } catch (e) { console.error('[LPC][Profil] titre des jumelages KO :', e); } }
  else console.warn('[LPC][Profil] #titreJumelages introuvable');
  const texte = premier(IDS_TEXTE_JUM);
  if (!texte) { console.warn('[LPC][Profil] #textjumelage introuvable'); return; }
  const lignes = liste.map((x, i) => (i + 1) + '. ' + [x.nom, x.organisme, x.interets].filter(Boolean).join(', '));
  try {
    if (texte.html !== undefined) texte.html = lignes.map((l) => '<p class="font_8" style="margin:0;">' + escapeHtml(l) + '</p>').join('');
    else texte.text = lignes.join(String.fromCharCode(10));
    montrer(texte);
  } catch (e) { console.error('[LPC][Profil] liste des jumelages KO :', e); }
}

// ─── e-mail (lecture seule) ──────────────────────────────────────────────
/** E-mail de connexion affiché désactivé, jamais renvoyé. Adresse de la fiche, sinon celle du compte Wix. */
async function poserEmail(email) {
  const el = premier(EMAIL_IDS);
  if (!email) {
    try { const m = await currentMember.getMember({ fieldsets: ['FULL'] }); email = m ? m.loginEmail : ''; }
    catch (e) { console.error('[LPC][Profil] lecture de l’e-mail du compte KO:', e); }
  }
  console.log('[LPC][Profil] e-mail affiché :', Boolean(email), '| champ :', el ? '#' + el.id : 'absent');
  if (!el) return;
  try { el.value = email || ''; } catch (e) { /* ignoré */ }
  try { if (typeof el.disable === 'function') el.disable(); } catch (e) { /* ignoré */ }
  try { if (el.customClassList) el.customClassList.add('lpc-desactive'); } catch (e) { console.warn('[LPC] classe lpc-desactive non posée :', e); }
  try { if (typeof el.resetValidityIndication === 'function') el.resetValidityIndication(); } catch (e) { /* ignoré */ }
}

// ─── bouton « organisation » (06/10) ─────────────────────────────────────
/** « Proposer un lieu » est-il coché ? */
function proposeUnLieu(labels) {
  return (Array.isArray(labels) ? labels : []).some((l) => normTxt(l).includes(CAPACITE_LIEU));
}
let btnOrganisationCable = false;
/** Affiche #btnorganisation si « Proposer un lieu » est coché, le replie sinon. Clic : /mon-organisme?mode=creation (aucune
 *  organisation liée) ou ?mode=modification (organisation déjà liée) ; mode lu sur les données du serveur au moment du clic. */
function majBoutonOrganisation() {
  const b = premier(BTN_ORGANISATION);
  if (!b) { console.warn('[LPC][Profil] bouton #btnorganisation introuvable'); return; }
  if (!proposeUnLieu(valeur(EL.capacites))) { cacher(b); return; }
  montrer(b);
  if (!btnOrganisationCable && typeof b.onClick === 'function') {
    btnOrganisationCable = true;
    b.onClick(() => {
      const mode = d.organisation ? 'modification' : 'creation';
      console.log('[LPC][Profil] vers l’organisation, mode :', mode);
      wixLocation.to(PAGE_ORGANISME + '?mode=' + mode);
    });
  }
}

// ─── nombre de cartes ────────────────────────────────────────────────────
/** « Écrire une ou plusieurs cartes » coché ? Détection sur « ecrire » : « Lecture de cartes » contient « carte ». */
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
  nbEnregistre = nombreDe(actuel);
  console.log('[LPC][Profil] nbResidentsMax enregistré :', nbEnregistre, '| champ :', el ? '#' + el.id : 'INTROUVABLE',
    '| mode :', !NB_MODIFIABLE && nbEnregistre ? 'lecture seule' : 'modifiable');
  if (!el) return;
  try { el.maxLength = 2; } catch (e) { /* ignoré */ }
  el.value = nbEnregistre ? String(nbEnregistre) : '';
  if (!NB_MODIFIABLE && nbEnregistre) {
    if (typeof el.disable === 'function') el.disable();
    try { if (el.customClassList) el.customClassList.add('lpc-desactive'); } catch (e) { /* ignoré */ }
  } else {
    if (typeof el.enable === 'function') el.enable();
    if (typeof el.onInput === 'function') el.onInput(() => filtrerChiffres(el));
  }
  if (typeof el.resetValidityIndication === 'function') el.resetValidityIndication();
}
/** Affiche le champ et son titre si « Écrire… » est coché, les replie sinon. */
function majNbResidents() {
  const el = champNbResidents();
  if (!el) return;
  const ecrit = ecritDesCartes(valeur(EL.capacites));
  [premier(TITRE_NB), el].forEach((x) => { if (ecrit) montrer(x); else cacher(x); });
  if (!ecrit) cacher(premier(AIDE_NB));
  // Jamais de drapeau « obligatoire » Wix (bulle native en doublon) : le contrôle est fait à l'envoi
  try { el.required = false; } catch (e) { /* ignoré */ }
  try { if (typeof el.resetValidityIndication === 'function') el.resetValidityIndication(); } catch (e) { /* ignoré */ }
}
/** Le champ doit-il être contrôlé à l'envoi ? Seulement s'il est saisissable et « Écrire » cochée. */
function nbSaisissable() {
  return (NB_MODIFIABLE || !nbEnregistre) && Boolean(champNbResidents()) && ecritDesCartes(valeur(EL.capacites));
}
/** Nombre à envoyer, ou undefined (le backend garde alors la valeur, ou l'efface si « Écrire » est décochée). */
function nbResidentsAEnvoyer() {
  if (!nbSaisissable()) return undefined;
  return nombreDe(champNbResidents().value) || undefined;
}

// ─── enregistrement ──────────────────────────────────────────────────────
async function sauver() {
  hideErr();
  const manque = [];
  if (!(valeur(EL.prenom) || '').trim() || !(valeur(EL.nom) || '').trim()) manque.push('indiquer votre prénom et votre nom');
  if (!(valeur(EL.capacites) || []).length) manque.push('nous communiquer au moins une réponse à "Comment aimeriez-vous porter de la chaleur ?"');
  if (!(valeur(EL.disponibilites) || []).length) manque.push('nous faire part de votre disponibilité');
  const photoEnAttente = !!(valeur(EL.photo) && valeur(EL.photo).length);
  if (photoEnAttente && !coche(EL.consentementPhoto)) {
    manque.push("cocher la case de consentement à l'utilisation de votre photo, ou retirer la photo que vous venez d'ajouter");
  }
  if (nbSaisissable()) {
    const saisi = String(champNbResidents().value || '').trim();
    if ((saisi && !nombreDe(saisi)) || (!saisi && NB_OBLIGATOIRE)) manque.push('indiquer un nombre de cartes entre 1 et 99');
  }
  if (manque.length) {
    tracer('envoi-bloque', 'warn', { raisons: manque.length, photoEnAttente, consentementPhotoCoche: coche(EL.consentementPhoto), fichier: infoFichier() });
    showErr("Le formulaire n'est hélas pas complet. Pourriez-vous " + manque.join('; ') + '.');
    return;
  }

  const bouton = optionnel(EL.bouton);
  if (bouton && bouton.disable) bouton.disable();

  // Photo éventuellement en attente de téléversement
  let photoUrl = ''; let photoW = 0; let photoH = 0;
  try {
    const up = optionnel(EL.photo);
    if (up && up.value && up.value.length > 0) {
      tracer('upload-debut', 'info', infoFichier());
      const files = await up.uploadFiles();
      if (files && files.length) {
        photoUrl = files[0].fileUrl || files[0].url || '';
        photoW = Number(files[0].width) || 0;
        photoH = Number(files[0].height) || 0;
        tracer('upload-ok', 'info', { urlRecue: Boolean(photoUrl), w: photoW, h: photoH });
      } else {
        tracer('upload-vide', 'warn', { fichier: infoFichier() });   // uploadFiles a répondu sans fichier : rien n'est enregistré
      }
    }
  } catch (e) {
    tracer('upload-KO', 'error', { fichier: infoFichier(), erreur: erreurTxt(e) });
    console.error('[LPC][Profil] upload photo KO:', e);
    showErr('Le téléversement de votre photo a échoué. Merci de réessayer, ou de retirer la photo.');
    if (bouton && bouton.enable) bouton.enable();
    return;
  }

  const nbEnvoye = nbResidentsAEnvoyer();
  console.log('[LPC][Profil] nbResidentsMax envoyé :', nbEnvoye === undefined ? '(rien)' : nbEnvoye, '| enregistré au chargement :', nbEnregistre);
  try {
    // Ni fonction, ni consentement RGPD, ni statut : le backend ne touche que ce qui est envoyé
    const res = await enregistrerMonProfil({
      prenom: valeur(EL.prenom),
      nom: valeur(EL.nom),
      telephone: valeur(EL.telephone),
      localite: valeur(EL.localite),
      commentaire: valeur(EL.commentaire),
      capacites: valeur(EL.capacites),
      disponibilites: valeur(EL.disponibilites),
      consentementPhoto: coche(EL.consentementPhoto),
      nbResidentsMax: nbEnvoye,
      photoUrl, photoW, photoH,
      supprimerPhoto: photoASupprimer,
    });
    console.log('[LPC][Profil] enregistrement', res);
    // Contrôle visible : un nombre envoyé mais non écrit (fichier serveur ancien) -> on RESTE sur la page
    if (res && res.ok && nbEnvoye !== undefined && res.nbResidentsMax !== nbEnvoye) {
      const cause = res.version
        ? 'serveur ' + res.version + ', nombre en base : ' + res.nbResidentsMax
        : 'le fichier serveur mon-profil.web.js en ligne est ANCIEN (aucune version renvoyée)';
      console.warn('[LPC][Profil] nombre de cartes NON enregistré :', cause, res);
      showErr('Diagnostic : le nombre de cartes n’a pas été enregistré (' + cause + ').');
      if (bouton && bouton.enable) bouton.enable();
      return;
    }
    if (res && res.ok) {
      if (photoUrl || photoASupprimer) tracer('enregistre', 'info', { photo: photoUrl ? 'ajout' : 'retrait', versionServeur: res.version });
      photoASupprimer = false;
      console.log('[LPC][Profil] redirection vers', PAGE_MERCI);
      wixLocation.to(PAGE_MERCI);
      return;
    }
    tracer('enregistrement-refuse', 'error', { reponse: res && (res.reason || res.ok) });
    showErr("L'enregistrement a échoué, merci de réessayer dans un instant.");
  } catch (e) {
    tracer('enregistrement-KO', 'error', { erreur: erreurTxt(e) });
    console.error('[LPC][Profil] enregistrerMonProfil KO:', e);
    showErr('Une erreur est survenue, merci de réessayer dans un instant.');
  }
  if (bouton && bouton.enable) bouton.enable();
}

// ─── messages ────────────────────────────────────────────────────────────
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function elErreur() { return optionnel(EL.erreur); }
function showErr(msg, couleur) {
  console.warn('[LPC][Profil] message :', msg);
  const e = elErreur();
  if (!e) { console.error('[LPC][Profil] paragraphe ' + EL.erreur + ' introuvable : message non affiché'); return; }
  try {
    if (e.html !== undefined) e.html = `<p style="color:${couleur || COULEUR_ERREUR}; margin:0;">${escapeHtml(msg)}</p>`;
    else if (e.text !== undefined) e.text = msg;
    if (e.expand) e.expand();
    if (e.show) e.show();
  } catch (err) {
    console.error('[LPC][Profil] affichage du message KO :', err);
  }
}
function hideErr() {
  const e = elErreur();
  if (!e) return;
  try {
    if (e.html !== undefined) e.html = '<p style="color:transparent; margin:0;">&nbsp;</p>';
    else if (e.text !== undefined) e.text = '';
    if (e.collapse) e.collapse();
  } catch (err) { /* ignoré */ }
}

// ─── utilitaires tolérants aux ID manquants ──────────────────────────────
function safe(label, fn) {
  try { fn(); } catch (e) { console.error('[LPC][Profil] ' + label + ' KO:', e); }
}
function optionnel(id) {
  try { const e = $w(id); return e && typeof e.type === 'string' ? e : null; }
  catch (err) { return null; }
}
/** Premier élément présent parmi des ID candidats, null sinon. */
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
function setVal(id, v) {
  const el = optionnel(id);
  if (el && v !== undefined && v !== null) el.value = v;
}
function valeur(id) {
  const el = optionnel(id);
  return el ? el.value : undefined;
}
function coche(id) {
  const el = optionnel(id);
  return Boolean(el && el.checked);
}
function clic(id, fn) {
  const el = optionnel(id);
  if (el && typeof el.onClick === 'function') el.onClick(fn);
  else console.error('[LPC][Profil] bouton ' + id + ' introuvable : le formulaire ne pourra pas être envoyé');
}
/** Signale dans la console les ID de EL absents de la page. */
function checkIds() {
  const manquants = Object.entries(EL).filter(([, id]) => !optionnel(id)).map(([k, id]) => k + '=' + id);
  if (manquants.length) {
    console.warn('[LPC][Profil] éléments introuvables :', manquants.join(', '),
      '| la section globale du formulaire est-elle bien placée sur cette page ?');
    try {
      $w('Button').forEach((x) => console.warn('[LPC][Profil] bouton présent :', x.id, '|', String(x.label || '').slice(0, 40)));
    } catch (e) { /* ignoré */ }
  } else {
    console.log('[LPC][Profil] tous les éléments sont présents');
  }
}

// ─── traces photo (03/10) : remontées dans Site Monitoring, filtre « [LPC][Trace] » ───
/** Type et taille (Ko) du fichier choisi : jamais son nom. */
function infoFichier() {
  try {
    const up = optionnel(EL.photo);
    const f = up && up.value && up.value[0];
    return f ? { type: f.type || '?', ko: Math.round((Number(f.size) || 0) / 1024) } : null;
  } catch (e) { return null; }
}
function erreurTxt(e) {
  try { return (e && (e.message || e.code || e.name)) ? String(e.message || e.code || e.name) : String(e); } catch (x) { return '?'; }
}
function tracer(etape, niveau, detail) {
  try { Promise.resolve(tracerClient({ page: 'mon-profil', etape, niveau, detail })).catch(() => {}); } catch (e) { /* ignoré */ }
}
