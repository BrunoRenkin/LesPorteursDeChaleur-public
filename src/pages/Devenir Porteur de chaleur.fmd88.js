// Code de PAGE — « Devenir Porteur de chaleur ».
// Page « Membres uniquement ». Formulaire custom (éléments Studio autonomes,
// PAS le widget Wix Forms qui n'est pas pilotable via $w en Studio).
//
//   1. members-sync : crée + lie la fiche Membres LPC du membre connecté
//   2. préremplit les champs depuis Membres LPC (vide pour un nouvel inscrit,
//      rempli + cases pré-cochées pour un membre qui revient)
//   3. valide capacités / disponibilités / consentement
//   4. téléverse la photo (si fournie), puis enregistre (Membres LPC + push
//      prénom/nom/tél/photo vers le membre Wix) et redirige vers la page de
//      remerciement. Le consentement image n'est écrit que dans Membres LPC.

import { authentication, currentMember } from 'wix-members-frontend';
import wixLocation from 'wix-location';
import { syncCurrentMemberToCollection } from 'backend/members-sync.web';
import { getMyMembreData, submitMembre } from 'backend/form_1-devenir-porteur.web';
import { tracerClient } from 'backend/trace-client.web';

// IDs des éléments Studio de la page.
const EL = {
  prenom: '#input5',                  // ID changés par la section globale (29/09) : input5 = prénom
  nom: '#input4',                     // nom de famille
  telephone: '#input3',
  ville: '#input2',                   // localité
  commentaire: '#textBox1',
  capacites: '#checkboxGroup3',            // Groupe de cases à cocher
  disponibilites: '#checkboxGroup2',  // Groupe de cases à cocher
  consentement: '#checkbox2',  // Case à cocher unique (RGPD)
  photo: '#uploadButton1',              // Bouton de téléversement (photo de profil)
  consentementPhoto: '#checkbox1', // Case à cocher (consentement image)
  bouton: '#button15',               // Bouton (sans lien)
  erreur: '#text112',                 // Texte affichant les messages d'erreur
};

// Éléments FACULTATIFS : s'ils n'existent pas sur la page, le formulaire fonctionne sans eux.
// À ajouter dans l'éditeur pour activer l'aperçu de la photo déjà enregistrée :
//   - une Image nommée photoActuelle (petite, p. ex. 96 x 96)
//   - un Bouton nommé supprimerPhoto (« Retirer cette photo »)
const EL_OPT = {
  photoActuelle: '#imageX12',
  supprimerPhoto: '#button14',
  // Conteneur FACULTATIF (pile / conteneur « ajuster au contenu ») regroupant l'image et le bouton.
  // S'il existe, c'est LUI qu'on replie : un élément replié dans une cellule de grille laisse
  // sinon la hauteur de la cellule, d'où l'espace vide observé le 20/09.
  blocPhoto: '#box156',   // conteneur de la photo (imageX12 + button14) : ID de la section globale, 29/09
};

// Champ de saisie FACULTATIF « Combien de cartes… ? » (#nbResidentsMax, 2 chiffres, 1 à 99), sous
// #capacites, avec son titre séparé (#TitrenbResidentsMax) et un texte d'aide facultatif
// (#aideNbResidents). Affichés seulement quand « Écrire une ou plusieurs cartes » est cochée,
// repliés dès qu'on la décoche. Toujours modifiable dans F1. Le code ne laisse passer que des
// chiffres. Remplace le menu déroulant « 1 carte » … « 10 cartes » le 27/09.
// ID candidats ; à défaut, le champ de saisie dont l'ID parle de « nbResidents »
// (Wix n'enregistre pas toujours l'ID saisi, cf. texteMerci le 24/09).
const NB_RESIDENTS = ['#input6', '#nbResidentsMax', '#nbResidentsMax1', '#nbResidents', '#nbResidents1', '#NbResidents'];
const TITRE_NB = ['#text114', '#TitrenbResidentsMax', '#TitreNbResidentsMax', '#titreNbResidentsMax', '#TitrenbResidentsMax1'];
const AIDE_NB = ['#text113', '#aideNbResidents', '#AideNbResidents', '#aidenbResidentsMax', '#AidenbResidentsMax'];
// Nombre de cartes : 1 à 99, sans zéro en tête (27/09).
const MOTIF_NB = /^[1-9][0-9]?$/;
// Nombre exigé quand « Écrire » est cochée (Bruno, 27/09), par le contrôle à l'envoi SEULEMENT :
// le drapeau « obligatoire » Wix est retiré par le code (bulle native en doublon sur F1, 27/09).
// Ne pas le cocher dans l'éditeur.
const NB_OBLIGATOIRE = true;
const MSG_CHIFFRES = 'Veuillez saisir uniquement des chiffres.';
const DUREE_AIDE_MS = 4000;

const PAGE_MERCI = '/merci?f=porteur';   // page de remerciement commune F1/F2/F3

$w.onReady(async () => {
  console.log('[LPC][F1] version du code : 2026-10-06-b (ID de la section globale ; traces photo ; #btnorganisation replié)');
  // Masquer l'erreur AVANT tout appel reseau (sinon elle reste visible si la suite echoue)
  safe('masquage erreur', hideErr);
  safe('controle des ID', checkIds);
  // Champ, titre et aide repliés d'emblée : Studio n'honore pas toujours « réduit par défaut ». Réaffichés par majNbResidents().
  safe('repli du bouton organisation (réservé à /mon-profil)', () => effacer(premier(['#btnorganisation', '#btnOrganisation'])));
  safe('repli de la box des jumelages (réservée à /adminprofil)', () => effacer(premier(['#boxResidents', '#BoxResidents'])));
  safe('repli initial du champ nbResidentsMax', () => { effacer(champNbResidents()); effacer(premier(TITRE_NB)); effacer(premier(AIDE_NB)); });
  if (!authentication.loggedIn()) { wixLocation.to('/participer'); return; }
  afficherEmailConnecte();   // sans await : ne retarde pas le formulaire

  // 1 - fiche Membres LPC liee
  try {
    const s = await syncCurrentMemberToCollection();
    console.log('[LPC][F1]', s && s.action === 'created' ? 'nouvel inscrit' : 'membre existant');
  } catch (e) {
    console.error('[LPC][F1] sync KO:', e);
  }

  // 2 - donnees (options + preremplissage)
  let d = {};
  try {
    d = (await getMyMembreData()) || {};
    console.log('[LPC][F1] donnees recues', {
      existe: d.existe,
      capaciteOptions: (d.capaciteOptions || []).length,
      disponibiliteOptions: (d.disponibiliteOptions || []).length,
      capacites: d.capacites,
      disponibilites: d.disponibilites,
      commentaire: d.commentaire,
    });
  } catch (e) {
    console.error('[LPC][F1] getMyMembreData KO:', e);
  }

  // Retrait de la photo demande par l'utilisateur (applique a l'envoi)
  let photoASupprimer = false;

  // 2a - champs texte, en premier (independant des listes)
  if (d.existe) {
    safe('preremplissage profil', () => {
      setVal(EL.prenom, d.prenom);
      setVal(EL.nom, d.nom);
      setVal(EL.telephone, d.telephone);
      setVal(EL.ville, d.ville);
      setVal(EL.commentaire, d.commentaire);
    });
  }

  // 2b - options des groupes de cases
  safe('options capacites', () => {
    $w(EL.capacites).options = (d.capaciteOptions || []).map((v) => ({ label: v, value: v }));
  });
  safe('options disponibilites', () => {
    $w(EL.disponibilites).options = (d.disponibiliteOptions || []).map((v) => ({ label: v, value: v }));
  });

  // 2c - cases cochees + consentement image (le consentement RGPD n'est JAMAIS pre-coche)
  if (d.existe) {
    safe('preremplissage cases', () => {
      setVal(EL.capacites, d.capacites);
      setVal(EL.disponibilites, d.disponibilites);
      if (d.consentementPhoto) $w(EL.consentementPhoto).checked = true;
    });
  }

  // 2c bis - champ « nombre de cartes », visible seulement si « Écrire… » est coché
  safe('champ nbResidentsMax', () => {
    preparerNbResidents(d.nbResidentsMax);
    majNbResidents();
    $w(EL.capacites).onChange(majNbResidents);
  });

  // 2d - photo deja enregistree : apercu + bouton de retrait (elements facultatifs)
  safe('photo existante', () => {
    const img = optionnel(EL_OPT.photoActuelle);
    const btn = optionnel(EL_OPT.supprimerPhoto);
    const bloc = optionnel(EL_OPT.blocPhoto);
    console.log('[LPC][F1] photo existante', {
      url: d.photoUrl || '(aucune)',
      photoActuelle: Boolean(img), supprimerPhoto: Boolean(btn), blocPhoto: Boolean(bloc),
    });
    if (!img && !btn && !bloc) {
      console.warn("[LPC][F1] aucun des elements " + Object.values(EL_OPT).join(', ') + " n'existe sur la page");
      return;   // elements non ajoutes dans l'editeur : rien a faire
    }
    // Replier le conteneur quand il existe : lui seul fait disparaitre l'espace reserve
    const masquerTout = () => {
      if (bloc) effacer(bloc); else { effacer(img); effacer(btn); }
      // État réel APRÈS le repli : si `collapsed` reste false, Studio n'honore pas collapse()
      const etat = (n, e) => (e ? n + ': collapsed=' + e.collapsed + ' hidden=' + e.hidden + ' rendered=' + e.rendered : n + ': absent');
      console.log('[LPC][F1] etat apres masquage | ' + etat('bloc', bloc) + ' | ' + etat('img', img) + ' | ' + etat('btn', btn));
    };
    const url = d.photoUrl || '';
    if (!url) { masquerTout(); return; }
    if (img) { img.src = url; if (img.alt !== undefined) img.alt = 'Votre photo actuelle'; afficher(img); }
    afficher(bloc);
    if (btn) {
      afficher(btn);
      btn.onClick(() => {
        photoASupprimer = true;
        tracer('retrait-demande', 'info');
        masquerTout();
        showErr('Votre photo sera retiree lorsque vous enverrez le formulaire.', COULEUR_QUESTION);
        console.log('[LPC][F1] retrait de la photo demande');
      });
    }
  });

  // Pas d'indicateur « champ invalide » affiche au chargement
  safe('reset validite', () => {
    Object.values(EL).forEach((id) => {
      const el = $w(id);
      if (el && typeof el.resetValidityIndication === 'function') el.resetValidityIndication();
    });
  });

  safe('trace du fichier choisi', () => {
    const up = $w(EL.photo);
    if (up && typeof up.onChange === 'function') up.onChange(() => tracer('fichier-choisi', 'info', infoFichier()));
  });

  // 3 + 4 — validation, enregistrement, redirection
  const bouton = elementBouton();
  if (!bouton) {
    showErr('Le bouton d’envoi de ce formulaire n’est pas correctement configuré. Merci de nous signaler ce problème.');
    return;
  }
  bouton.onClick(async () => {
    console.log("[LPC][F1] clic sur le bouton d'envoi");
    hideErr();

    const manque = [];
    if (!(valeur(EL.capacites) || []).length) {
      manque.push('nous communiquer au moins une réponse à "Comment aimeriez-vous porter de la chaleur ?"');
    }
    if (!(valeur(EL.disponibilites) || []).length) {
      manque.push('nous faire part de votre disponibilité');
    }
    if (!coche(EL.consentement)) {
      manque.push('cocher la case "accepter le traitement de vos données" indispensable pour que nous puissions traiter votre inscription');
    }
    const photoEnAttente = !!(valeur(EL.photo) && valeur(EL.photo).length);
    if (photoEnAttente && !coche(EL.consentementPhoto)) {
      manque.push('cocher la case de consentement à l\'utilisation de votre photo, ou retirer la photo que vous venez d\'ajouter');
    }
    if (ecritDesCartes(valeur(EL.capacites)) && champNbResidents()) {
      const saisi = String(champNbResidents().value || '').trim();
      if ((saisi && !nombreDe(saisi)) || (!saisi && NB_OBLIGATOIRE)) {
        manque.push('indiquer un nombre de cartes entre 1 et 99');
      }
    }
    if (manque.length) {
      tracer('envoi-bloque', 'warn', { raisons: manque.length, photoEnAttente, consentementPhotoCoche: coche(EL.consentementPhoto), fichier: infoFichier() });
      showErr('Le formulaire n\'est hélas pas complet. Pourriez-vous ' + manque.join('; ') + '.');
      return;
    }

    bouton.disable();

    // Téléversement de la photo (si un fichier est en attente). En cas d'échec,
    // on interrompt pour laisser l'utilisateur réessayer plutôt que de perdre
    // la photo silencieusement.
    let photoUrl = '';
    let photoW = 0;
    let photoH = 0;
    try {
      const up = $w(EL.photo);
      if (up && up.value && up.value.length > 0) {
        tracer('upload-debut', 'info', infoFichier());
        const files = await up.uploadFiles();
        console.log('[LPC][F1][photo] uploadFiles ->', JSON.stringify(files));
        if (files && files.length) {
          photoUrl = files[0].fileUrl || files[0].url || '';
          photoW = Number(files[0].width) || 0;
          photoH = Number(files[0].height) || 0;
        }
        console.log('[LPC][F1][photo] photoUrl transmis =', JSON.stringify(photoUrl), photoW, photoH);
        if (photoUrl) tracer('upload-ok', 'info', { urlRecue: true, w: photoW, h: photoH });
        else tracer('upload-vide', 'warn', { fichier: infoFichier() });   // uploadFiles a répondu sans adresse : rien n'est enregistré
      }
    } catch (e) {
      tracer('upload-KO', 'error', { fichier: infoFichier(), erreur: erreurTxt(e) });
      console.error('[LPC][F1] upload photo KO:', e);
      showErr('Le téléversement de votre photo a échoué. Merci de réessayer, ou de retirer la photo pour envoyer le formulaire sans elle.');
      bouton.enable();
      return;
    }

    const nbEnvoye = ecritDesCartes(valeur(EL.capacites)) ? valeurNbResidents() : undefined;
    console.log('[LPC][F1] nbResidentsMax envoyé :', nbEnvoye === undefined ? '(rien : champ replié ou vide)' : nbEnvoye);
    try {
      const res = await submitMembre({
        prenom: valeur(EL.prenom),
        nom: valeur(EL.nom),
        telephone: valeur(EL.telephone),
        ville: valeur(EL.ville),
        commentaire: valeur(EL.commentaire),
        capacites: valeur(EL.capacites),
        disponibilites: valeur(EL.disponibilites),
        consentement: coche(EL.consentement),
        photoUrl,
        photoW,
        photoH,
        consentementPhoto: coche(EL.consentementPhoto),
        supprimerPhoto: photoASupprimer,
        // envoyé seulement si le champ est affiché (« Écrire… » cochée) et rempli ; sinon rien n'est modifié
        nbResidentsMax: nbEnvoye,
      });
      console.log('[LPC][F1] réponse du serveur', res, '| alerte interne :', res && res.notify);
      if (res && res.ok) {
        if (photoUrl || photoASupprimer) tracer('enregistre', 'info', { photo: photoUrl ? 'ajout' : 'retrait' });
        console.log('[LPC][F1] redirection vers', PAGE_MERCI);
        wixLocation.to(PAGE_MERCI);
      } else {
        tracer('envoi-refuse', 'error', { reponse: res && (res.reason || res.ok) });
        showErr('L\'envoi a échoué, merci de réessayer dans un instant.');
        bouton.enable();
      }
    } catch (e) {
      tracer('envoi-KO', 'error', { erreur: erreurTxt(e) });
      console.error('[LPC][F1] submit KO:', e);
      showErr('Une erreur est survenue, merci de réessayer dans un instant.');
      bouton.enable();
    }
  });
});

// ─── nombre de résidents ─────────────────────────────────────────────────
/** « Écrire une ou plusieurs cartes » coché ? Détection sur « ecrire » : « Lecture de cartes »
 *  contient aussi « carte ». */
function ecritDesCartes(labels) {
  return (Array.isArray(labels) ? labels : [])
    .some((l) => String(l || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes('ecrire'));
}
/** Nombre valide (1 à 99) lu dans une valeur, null sinon. Chaîne : motif strict, pas de parseInt
 *  (« 1a » ne doit pas devenir 1). */
function nombreDe(v) {
  if (typeof v === 'number') return Number.isInteger(v) && v >= 1 && v <= 99 ? v : null;
  const t = String(v == null ? '' : v).trim();
  return MOTIF_NB.test(t) ? Number(t) : null;
}
/** Premier élément présent parmi des ID candidats, null sinon. */
function premier(ids) {
  for (const id of ids) { const e = optionnel(id); if (e) return e; }
  return null;
}
let champNb;   // champ trouvé (mis en cache), null s'il n'existe pas
function champNbResidents() {
  if (champNb !== undefined) return champNb;
  champNb = premier(NB_RESIDENTS);
  if (!champNb) {
    try {
      const tous = $w('TextInput');
      const liste = [];
      if (tous && tous.length) for (let i = 0; i < tous.length; i++) liste.push(tous[i]);
      champNb = liste.find((x) => /nbresident/i.test(String(x.id || ''))) || null;
      console.warn('[LPC][F1] ' + NB_RESIDENTS[0] + ' introuvable. Saisies présentes :',
        liste.map((x) => '#' + x.id).join(', ') || '(aucune)', '| retenu :', champNb ? '#' + champNb.id : '(aucun)');
    } catch (e) { console.error('[LPC][F1] recherche du champ nbResidentsMax KO:', e); }
  }
  const titre = premier(TITRE_NB);
  const aide = premier(AIDE_NB);
  console.log('[LPC][F1] champ nbResidentsMax :', champNb ? '#' + champNb.id : 'INTROUVABLE',
    '| titre :', titre ? '#' + titre.id : 'absent', '| aide :', aide ? '#' + aide.id : 'absente');
  return champNb;
}
/** Ne garde que les chiffres, 2 au plus, à chaque frappe (le motif de l'éditeur ne bloque pas la saisie). */
function filtrerChiffres(el) {
  const brut = String(el.value == null ? '' : el.value);
  const propre = brut.replace(/\D/g, '').slice(0, 2);
  if (propre !== brut) el.value = propre;
  if (/\D/.test(brut)) signalerChiffres();
  // Efface le « format requis » natif de Wix, déclenché avant que le filtre ait nettoyé la saisie (27/09).
  try { if (typeof el.resetValidityIndication === 'function') el.resetValidityIndication(); } catch (e) { /* ignoré */ }
}
/** Une frappe n'était pas un chiffre (ex. rangée du haut sans Maj en AZERTY) : message temporaire.
 *  Pas d'alert() : le code de page Velo n'a pas accès à window. Texte #aideNbResidents s'il existe,
 *  sinon la zone #messageErreur de la page. */
let minuterieAide = null;
function signalerChiffres() {
  const aide = premier(AIDE_NB);
  if (minuterieAide) clearTimeout(minuterieAide);
  if (aide) {
    try {
      if (aide.html !== undefined) aide.html = `<p style="color:${COULEUR_QUESTION}; margin:0;">${escapeHtml(MSG_CHIFFRES)}</p>`;
      else if (aide.text !== undefined) aide.text = MSG_CHIFFRES;
    } catch (e) { /* ignoré */ }
    afficherComplet(aide);
    minuterieAide = setTimeout(() => effacer(aide), DUREE_AIDE_MS);
  } else {
    showErr(MSG_CHIFFRES, COULEUR_QUESTION);
    minuterieAide = setTimeout(hideErr, DUREE_AIDE_MS);
  }
}
/** Prérempli avec le nombre enregistré (y compris un nombre saisi par l'équipe dans le CMS). */
function preparerNbResidents(actuel) {
  const el = champNbResidents();
  if (!el) return;
  try { el.maxLength = 2; } catch (e) { /* ignoré */ }
  const n = nombreDe(actuel);
  el.value = n ? String(n) : '';
  if (typeof el.onInput === 'function') el.onInput(() => filtrerChiffres(el));
  if (typeof el.resetValidityIndication === 'function') el.resetValidityIndication();
}
/** Affiche le champ et son titre si « Écrire… » est coché, les replie sinon. */
function majNbResidents() {
  const el = champNbResidents();
  if (!el) return;
  const ecrit = ecritDesCartes(valeur(EL.capacites));
  [premier(TITRE_NB), el].forEach((x) => { if (ecrit) afficherComplet(x); else effacer(x); });
  if (!ecrit) effacer(premier(AIDE_NB));
  console.log('[LPC][F1] « Écrire » coché :', ecrit, '→ champ', ecrit ? 'affiché' : 'replié');
  // Jamais de drapeau « obligatoire » Wix ici : sur F1 il affichait sa bulle native sur le champ EN PLUS
  // du message du code (27/09). L'obligation est imposée par le contrôle à l'envoi (NB_OBLIGATOIRE).
  try { el.required = false; } catch (e) { /* ignoré */ }
  try { if (typeof el.resetValidityIndication === 'function') el.resetValidityIndication(); } catch (e) { /* ignoré */ }
  diagChamp(el, 'après majNbResidents');
}
/** Nombre saisi, ou undefined si vide ou invalide (le backend garde alors la valeur enregistrée). */
function valeurNbResidents() {
  const el = champNbResidents();
  return (el && nombreDe(el.value)) || undefined;
}

// ─── message d'erreur ────────────────────────────────────────────────────
// Le texte ET sa couleur sont posés par le code : laisser dans l'éditeur un
// paragraphe quelconque (il est vidé au chargement). Pas besoin de « masquer
// au chargement », que Wix Studio n'expose pas toujours.
const COULEUR_ERREUR = '#C0392B';
const COULEUR_QUESTION = '#B9770E';   // information / confirmation : ce n'est pas une erreur

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
/** Le paragraphe du message, ou null s'il est introuvable (aucune exception propagée). */
function elErreur() {
  try { const e = $w(EL.erreur); return e && typeof e.type === 'string' ? e : null; }
  catch (err) { return null; }
}
function showErr(msg, couleur) {
  console.warn('[LPC][F1] message :', msg);
  const e = elErreur();
  if (!e) { console.error('[LPC][F1] paragraphe ' + EL.erreur + ' introuvable : message non affiché'); return; }
  try {
    if (e.html !== undefined) {
      e.html = `<p style="color:${couleur || COULEUR_ERREUR}; margin:0;">${escapeHtml(msg)}</p>`;
    } else if (e.text !== undefined) {
      e.text = msg;
    }
    if (e.expand) e.expand();
    if (e.show) e.show();
    if (e.scrollTo) e.scrollTo();
  } catch (err) {
    console.error('[LPC][F1] affichage du message KO :', err);
  }
}
function hideErr() {
  const e = elErreur();
  if (!e) return;
  try {
    // texte transparent plutôt que vide : garde la place, ne se voit pas
    if (e.html !== undefined) e.html = '<p style="color:transparent; margin:0;">&nbsp;</p>';
    else if (e.text !== undefined) e.text = '';
    if (e.collapse) e.collapse();
    else if (e.hide) e.hide();
  } catch (err) {
    console.error('[LPC][F1] masquage du message KO :', err);
  }
}

// ─── utilitaires de robustesse ───────────────────────────────────────────
/** Valeur d'un élément, sans jamais lever d'exception si l'ID est absent de la page. */
/**
 * Le bouton d'envoi. Si l'ID de EL.bouton n'existe pas sur la page et qu'il n'y a
 * qu'un seul bouton, on s'y rattache (avec un avertissement) plutôt que de laisser
 * un formulaire muet : sans gestionnaire attaché, le clic ne fait RIEN du tout.
 */
function elementBouton() {
  try {
    const b = $w(EL.bouton);
    if (b && typeof b.type === 'string' && typeof b.onClick === 'function') return b;
  } catch (e) { /* ID absent : on tente le repli */ }
  try {
    const tous = $w('Button');
    if (tous && tous.length === 1) {
      console.warn('[LPC][F1] ' + EL.bouton + ' introuvable : repli sur le seul bouton de la page, #' + tous[0].id);
      return tous[0];
    }
    if (tous && tous.length) {
      console.error('[LPC][F1] ' + EL.bouton + ' introuvable. Boutons présents :',
        tous.map((b) => '#' + b.id + ' « ' + (b.label || '') + ' »').join(', '));
    }
  } catch (e) { /* type non supporté */ }
  console.error('[LPC][F1] aucun bouton d’envoi utilisable');
  return null;
}

/** Élément facultatif : null s'il n'a pas été ajouté dans l'éditeur. */
function optionnel(id) {
  try { const e = $w(id); return e && typeof e.type === 'string' ? e : null; }
  catch (err) { return null; }
}
function afficher(el) { afficherComplet(el); }
function effacer(el) {
  if (!el) return;
  // replier ET cacher : un conteneur Studio peut n'honorer que l'un des deux
  try { if (el.collapse) el.collapse(); } catch (err) { /* ignoré */ }
  try { if (el.hide) el.hide(); } catch (err) { /* ignoré */ }
}
function afficherComplet(el) {
  if (!el) return;
  try { if (el.expand) el.expand(); } catch (err) { /* ignoré */ }
  try { if (el.show) el.show(); } catch (err) { /* ignoré */ }
}

function valeur(id) {
  try { const e = $w(id); return e ? e.value : undefined; }
  catch (err) { console.error('[LPC][F1] lecture impossible de ' + id + ' :', err); return undefined; }
}
/** État d'une case à cocher, false si l'élément est absent. */
function coche(id) {
  try { const e = $w(id); return Boolean(e && e.checked); }
  catch (err) { console.error('[LPC][F1] lecture impossible de ' + id + ' :', err); return false; }
}

function safe(label, fn) {
  try { fn(); } catch (e) { console.error('[LPC][F1] ' + label + ' KO:', e); }
}
function setVal(id, v) {
  const el = $w(id);
  if (el && v !== undefined && v !== null) el.value = v;
}
/** Signale dans la console les ID de EL absents de la page. */
function checkIds() {
  const manquants = Object.entries(EL).filter(([, id]) => {
    try { const el = $w(id); return !el || typeof el.type !== 'string'; } catch (e) { return true; }
  }).map(([k, id]) => k + '=' + id);
  if (manquants.length) {
    console.warn('[LPC][F1] éléments introuvables sur la page :', manquants.join(', '));
    // aide au diagnostic : tous les éléments Texte de la page, avec leur ID réel
    try {
      $w('Text').forEach((x) => console.warn('[LPC][F1] texte présent :', x.id, '|', String(x.text || '').slice(0, 40)));
      $w('Button').forEach((x) => console.warn('[LPC][F1] bouton présent :', x.id, '|', String(x.label || '').slice(0, 40)));
      // Champs de saisie : ID réel + libellé (après la conversion en section globale du 29/09, les ID ont changé)
      ['TextInput', 'TextBox', 'Checkbox', 'CheckboxGroup', 'UploadButton', 'Image'].forEach((type) => {
        try {
          $w(type).forEach((x) => console.warn('[LPC][F1] ' + type + ' présent :', x.id, '|',
            String(x.label || x.placeholder || x.buttonLabel || x.alt || '').slice(0, 50)));
        } catch (e) { /* type absent */ }
      });
    } catch (e) { /* type non supporté, on ignore */ }
  }
  else console.log('[LPC][F1] tous les elements sont presents');
}

// ─── e-mail (lecture seule, ajout du 26/09) ──────────────────────────────
// Champ de saisie FACULTATIF #email : e-mail de connexion affiché DÉSACTIVÉ, jamais envoyé.
// Il ne se change que par l'Espace Membres Wix (il identifie la fiche Membres et le compte).
const EMAIL_IDS = ['#input1', '#email', '#email1', '#Email', '#emailMembre'];
function champEmail() {
  for (const id of EMAIL_IDS) {
    try { const e = $w(id); if (e && typeof e.type === 'string') return e; } catch (err) { /* suivant */ }
  }
  return null;
}
function poserEmail(email) {
  const el = champEmail();
  console.log('[LPC][F1] e-mail affiché :', Boolean(email), '| champ :', el ? '#' + el.id : 'absent');
  if (!el) return;
  try { el.value = email || ''; } catch (err) { /* ignoré */ }
  try { if (typeof el.disable === 'function') el.disable(); } catch (err) { /* ignoré */ }
  // Style gris : classe lpc-desactive (règles dans global.css). Posée par le code, l'éditeur ne l'avait pas (26/09).
  try { if (el.customClassList) el.customClassList.add('lpc-desactive'); } catch (err) { console.warn('[LPC] classe lpc-desactive non posée :', err); }
  try { if (typeof el.resetValidityIndication === 'function') el.resetValidityIndication(); } catch (err) { /* ignoré */ }
}
/** E-mail lu dans le compte Wix, en parallèle du chargement du formulaire (pas d'attente). */
async function afficherEmailConnecte() {
  try {
    const m = await currentMember.getMember({ fieldsets: ['FULL'] });
    poserEmail(m ? m.loginEmail : '');
  } catch (err) {
    console.error('[LPC][F1] lecture de l’e-mail KO :', err);
  }
}

/** Diagnostic : état du champ nombre de cartes et de la case « Écrire », une ligne par appel. */
function diagChamp(el, contexte) {
  try {
    const caps = valeur(EL.capacites);
    console.log('[LPC][F1][diag] ' + contexte, JSON.stringify({
      champ: el ? '#' + el.id : 'INTROUVABLE',
      type: el ? el.type : null,
      hidden: el ? el.hidden : null,
      collapsed: el ? el.collapsed : null,
      valeur: el ? el.value : null,
      cases: caps,
      ecrit: ecritDesCartes(caps),
    }));
  } catch (e) { console.error('[LPC][F1][diag] KO:', e); }
}

// ─── traces photo (03/10) : remontées dans Site Monitoring, filtre « [LPC][Trace] » ───
/** Type et taille (Ko) du fichier choisi : jamais son nom. */
function infoFichier() {
  try {
    const up = $w(EL.photo);
    const f = up && up.value && up.value[0];
    return f ? { type: f.type || '?', ko: Math.round((Number(f.size) || 0) / 1024) } : null;
  } catch (e) { return null; }
}
function erreurTxt(e) {
  try { return (e && (e.message || e.code || e.name)) ? String(e.message || e.code || e.name) : String(e); } catch (x) { return '?'; }
}
function tracer(etape, niveau, detail) {
  try { Promise.resolve(tracerClient({ page: 'f1', etape, niveau, detail })).catch(() => {}); } catch (e) { /* ignoré */ }
}
