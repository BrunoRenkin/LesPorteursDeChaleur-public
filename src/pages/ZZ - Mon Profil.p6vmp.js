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

import { authentication } from 'wix-members-frontend';
import wixLocation from 'wix-location';
import { syncCurrentMemberToCollection } from 'backend/members-sync.web';
import { getMyMembreData, submitMembre } from 'backend/form_1-devenir-porteur.web';

// IDs des éléments Studio de la page.
const EL = {
  prenom: '#prenom',
  nom: '#nomDeFamille',
  telephone: '#telephone',
  ville: '#localite',
  commentaire: '#commentaire',
  capacites: '#capacites',            // Groupe de cases à cocher
  disponibilites: '#disponibilites',  // Groupe de cases à cocher
  consentement: '#consentementGdpr',  // Case à cocher unique (RGPD)
  photo: '#uploadPhoto',              // Bouton de téléversement (photo de profil)
  consentementPhoto: '#consentementPhoto', // Case à cocher (consentement image)
  bouton: '#submitBtn',               // Bouton (sans lien)
  erreur: '#text101',                 // Texte affichant les messages d'erreur
};

const PAGE_MERCI = '/devenir-porteur-de-chaleur-merci';

$w.onReady(async () => {
  if (!authentication.loggedIn) { wixLocation.to('/participer'); return; }
  hideErr();

  // 1 — fiche Membres LPC liée
  try {
    const s = await syncCurrentMemberToCollection();
    console.log('[LPC][F1]', s && s.action === 'created' ? 'nouvel inscrit' : 'membre existant');
  } catch (e) {
    console.error('[LPC][F1] sync KO:', e);
  }

  // 2 — options des cases + préremplissage
  try {
    const d = await getMyMembreData();
    $w(EL.capacites).options = (d.capaciteOptions || []).map((v) => ({ label: v, value: v }));
    $w(EL.disponibilites).options = (d.disponibiliteOptions || []).map((v) => ({ label: v, value: v }));

    if (d.existe) {
      $w(EL.prenom).value = d.prenom;
      $w(EL.nom).value = d.nom;
      $w(EL.telephone).value = d.telephone;
      $w(EL.ville).value = d.ville;
      $w(EL.commentaire).value = d.commentaire;
      $w(EL.capacites).value = d.capacites;
      $w(EL.disponibilites).value = d.disponibilites;
      // consentement RGPD : jamais pré-coché (consentement actif à chaque envoi)
      // consentement image : reflète le choix déjà enregistré (l'état du
      // formulaire fait foi à l'envoi ; décocher = retrait du consentement)
      if (d.consentementPhoto) $w(EL.consentementPhoto).checked = true;
    }
  } catch (e) {
    console.error('[LPC][F1] préremplissage KO:', e);
  }

  // 3 + 4 — validation, enregistrement, redirection
  $w(EL.bouton).onClick(async () => {
    hideErr();

    const manque = [];
    if (!($w(EL.capacites).value || []).length) {
      manque.push('nous communiquer au moins une réponse à "Comment aimeriez-vous porter de la chaleur ?"');
    }
    if (!($w(EL.disponibilites).value || []).length) {
      manque.push('nous faire part de votre disponibilité');
    }
    if (!$w(EL.consentement).checked) {
      manque.push('cocher la case "accepter le traitement de vos données" indispensable pour que nous puissions traiter votre inscription');
    }
    const photoEnAttente = !!($w(EL.photo).value && $w(EL.photo).value.length);
    if (photoEnAttente && !$w(EL.consentementPhoto).checked) {
      manque.push('cocher la case de consentement à l\'utilisation de votre photo, ou retirer la photo que vous venez d\'ajouter');
    }
    if (manque.length) {
      showErr('Le formulaire n\'est hélas pas complet. Pourriez-vous ' + manque.join('; ') + '.');
      return;
    }

    $w(EL.bouton).disable();

    // Téléversement de la photo (si un fichier est en attente). En cas d'échec,
    // on interrompt pour laisser l'utilisateur réessayer plutôt que de perdre
    // la photo silencieusement.
    let photoUrl = '';
    let photoW = 0;
    let photoH = 0;
    try {
      const up = $w(EL.photo);
      if (up && up.value && up.value.length > 0) {
        const files = await up.uploadFiles();
        console.log('[LPC][F1][photo] uploadFiles ->', JSON.stringify(files));
        if (files && files.length) {
          photoUrl = files[0].fileUrl || files[0].url || '';
          photoW = Number(files[0].width) || 0;
          photoH = Number(files[0].height) || 0;
        }
        console.log('[LPC][F1][photo] photoUrl transmis =', JSON.stringify(photoUrl), photoW, photoH);
      }
    } catch (e) {
      console.error('[LPC][F1] upload photo KO:', e);
      showErr('Le téléversement de votre photo a échoué. Merci de réessayer, ou de retirer la photo pour envoyer le formulaire sans elle.');
      $w(EL.bouton).enable();
      return;
    }

    try {
      const res = await submitMembre({
        prenom: $w(EL.prenom).value,
        nom: $w(EL.nom).value,
        telephone: $w(EL.telephone).value,
        ville: $w(EL.ville).value,
        commentaire: $w(EL.commentaire).value,
        capacites: $w(EL.capacites).value,
        disponibilites: $w(EL.disponibilites).value,
        consentement: $w(EL.consentement).checked,
        photoUrl,
        photoW,
        photoH,
        consentementPhoto: $w(EL.consentementPhoto).checked,
      });
      if (res && res.ok) {
        wixLocation.to(PAGE_MERCI);
      } else {
        showErr('L\'envoi a échoué, merci de réessayer dans un instant.');
        $w(EL.bouton).enable();
      }
    } catch (e) {
      console.error('[LPC][F1] submit KO:', e);
      showErr('Une erreur est survenue, merci de réessayer dans un instant.');
      $w(EL.bouton).enable();
    }
  });
});

// ─── message d'erreur (élément Texte : .text, sinon .html) ───────────────
function setText(el, msg) {
  if (!el) return;
  if (el.text !== undefined) el.text = msg;
  else if (el.html !== undefined) el.html = msg ? `<p>${msg}</p>` : '';
}
function showErr(msg) {
  const e = $w(EL.erreur);
  setText(e, msg);
  if (e && e.expand) e.expand();
  if (e && e.show) e.show();
}
function hideErr() {
  const e = $w(EL.erreur);
  setText(e, '');
  if (e && e.collapse) e.collapse();
  else if (e && e.hide) e.hide();
}
