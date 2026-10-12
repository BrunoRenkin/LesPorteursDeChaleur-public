// Code de PAGE — « Devenir partenaire ».
// Page « Membres uniquement ». Formulaire custom, même patron que page-accueillir.js (F2) :
// dupliquer la page F2 garde les ID ; supprimer seulement le champ #nombreDestinataires.
//
//   1. members-sync : crée + lie la fiche Membres LPC du membre connecté
//   2. préremplit : contact (Membres) + organisme (Organisations) si déjà Partenaire
//   3. valide organisme / type / consentement RGPD (message facultatif, cf. MESSAGE_OBLIGATOIRE)
//   4. enregistre (Membres + Organisations) et redirige vers /merci?f=partenaire

import { authentication, currentMember } from 'wix-members-frontend';
import wixLocation from 'wix-location';
import { syncCurrentMemberToCollection } from 'backend/members-sync.web';
import { getMyPartenaireData, submitPartenaire } from 'backend/form_3-partenaire.web';

// IDs des éléments Studio de la page.
const EL = {
  prenom: '#prenom',
  nom: '#nomDeFamille',
  telephone: '#telephone',
  fonction: '#fonction',
  type: '#organismeType',                 // Liste déroulante ou boutons radio (options remplies par le code)
  organisme: '#organisme',
  adresse: '#organismeAdresse',           // 12/10 : adresse de l'organisme (champ `adresse`), plus la localité
  capacites: '#capacites',                // Groupe de cases « Comment pourriez-vous aider les Porteurs de chaleur ? » (options remplies par le code)
  commentaire: '#commentaire',
  consentement: '#consentementGdpr',      // Case à cocher unique (RGPD)
  bouton: '#submitBtn',                   // Bouton (sans lien)
  erreur: '#messageErreur',                     // Texte affichant les messages d'erreur
};

const PAGE_MERCI = '/merci?f=partenaire';
const MESSAGE_OBLIGATOIRE = false;        // passer à true si le message doit être obligatoire
const PROPOSITIONS_OBLIGATOIRES = true;   // >= 1 case cochée exigée (passer à false pour rendre facultatif)

$w.onReady(async () => {
  console.log('[LPC][F3] version du code : 2026-10-12-b (organismeAdresse ; logo de l’organisation)');
  console.log('[LPC][F3] champs obligatoires', { propositions: PROPOSITIONS_OBLIGATOIRES, message: MESSAGE_OBLIGATOIRE });
  // Masquer l'erreur AVANT tout appel réseau (sinon elle reste visible si la suite échoue)
  safe('masquage erreur', hideErr);
  safe('contrôle des ID', checkIds);
  if (!authentication.loggedIn()) { wixLocation.to('/participer'); return; }
  afficherEmailConnecte();   // sans await : ne retarde pas le formulaire

  // 1 — fiche Membres LPC liée
  try {
    await syncCurrentMemberToCollection();
  } catch (e) {
    console.error('[LPC][F3] sync KO:', e);
  }

  // 2 — données (options + préremplissage)
  let d = {};
  try {
    d = (await getMyPartenaireData()) || {};
    console.log('[LPC][F3] données reçues', { existe: d.existe, orgExiste: d.orgExiste, types: (d.typeOptions || []).length, propositions: (d.capaciteOptions || []).length });
  } catch (e) {
    console.error('[LPC][F3] getMyPartenaireData KO:', e);
  }

  // 2a — profil du contact, en premier (indépendant des listes)
  if (d.existe) {
    safe('préremplissage profil', () => {
      setVal(EL.prenom, d.prenom);
      setVal(EL.nom, d.nom);
      setVal(EL.telephone, d.telephone);
      setVal(EL.fonction, d.fonction);
    });
  }

  // 2b — listes (types d'organisme au Genre « Partenaire », propositions). Pas de type par défaut.
  safe("options type d'organisme", () => {
    const t = $w(EL.type);
    const options = d.typeOptions || [];
    if (t.options !== undefined) t.options = options.map((v) => ({ label: v, value: v }));
    // Rapprochement tolérant (casse, espaces, apostrophes) : le libellé stocké peut différer
    // typographiquement de l'option. On affecte TOUJOURS la valeur exacte de l'option.
    const cible = options.find((o) => normTxt(o) === normTxt(d.organismeType || ''));
    if (cible) t.value = cible;
    console.log("[LPC][F3] type d'organisme", {
      enBase: d.organismeType || '(aucun)',
      tousLesTypesDeLOrganisation: d.organismeTypes || [],
      options, retenu: cible || '(aucun)',
    });
  });
  safe('options propositions', () => {
    $w(EL.capacites).options = (d.capaciteOptions || []).map((v) => ({ label: v, value: v }));
  });

  // 2c — organisme partenaire déjà enregistré
  // Nom d'origine : sert à demander confirmation avant de renommer l'organisation
  let nomOrigine = '';
  let renommageConfirme = null;
  if (d.orgExiste) {
    nomOrigine = d.organisme || '';
    safe('préremplissage organisation', () => {
      setVal(EL.organisme, d.organisme);
      setVal(EL.adresse, d.organismeAdresse);
      setVal(EL.capacites, d.capacites);
      setVal(EL.commentaire, d.commentaire);
    });
  }
  console.log('[LPC][F3] organisation chargée', { orgExiste: Boolean(d.orgExiste), nomOrigine, type: d.organismeType });
  safe('logo', () => initLogo(d.logoUrl, d.consentementLogo));

  // consentement RGPD : jamais pré-coché (consentement actif à chaque envoi)

  // Pas d'indicateur « champ invalide » affiché au chargement
  safe('reset validité', () => {
    Object.values(EL).forEach((id) => {
      const el = $w(id);
      if (el && typeof el.resetValidityIndication === 'function') el.resetValidityIndication();
    });
  });

  // 3 + 4 — validation, enregistrement, redirection
  const bouton = elementBouton();
  if (!bouton) {
    showErr('Le bouton d’envoi de ce formulaire n’est pas correctement configuré. Merci de nous signaler ce problème.');
    return;
  }
  bouton.onClick(async () => {
    console.log("[LPC][F3] clic sur le bouton d'envoi");
    hideErr();

    const manque = [];
    if (!(valeur(EL.organisme) || '').trim()) {
      manque.push('indiquer le nom de votre organisme');
    }
    if (!valeur(EL.type)) {
      manque.push('choisir le type d\'organisme');
    }
    if (PROPOSITIONS_OBLIGATOIRES && !((valeur(EL.capacites) || []).length)) {
      manque.push('cocher au moins une réponse à "Comment pourriez-vous aider les Porteurs de chaleur ?"');
    }
    if (MESSAGE_OBLIGATOIRE && !(valeur(EL.commentaire) || '').trim()) {
      manque.push('nous dire comment vous envisagez cette collaboration');
    }
    if (logoSansConsentement()) manque.push('cocher la case d’autorisation d’utilisation de votre logo (ou retirer le fichier)');
    if (!coche(EL.consentement)) {
      manque.push('cocher la case "accepter le traitement de vos données" indispensable pour que nous puissions traiter votre demande');
    }
    if (manque.length) {
      showErr('Le formulaire n\'est hélas pas complet. Pourriez-vous ' + manque.join('; ') + '.');
      return;
    }

    // Renommage d'une organisation existante : Velo n'a pas de boîte de dialogue,
    // la confirmation se fait donc en deux temps dans le message (20/09).
    const nomSaisi = (valeur(EL.organisme) || '').trim();
    console.log('[LPC][F3] contrôle du nom', { nomOrigine, nomSaisi, dejaConfirme: renommageConfirme });
    // Diagnostic : si le nom lu est identique au nom chargé alors qu'il a été modifié à l'écran,
    // c'est qu'un AUTRE champ porte la saisie. On liste donc toutes les zones de saisie.
    if (nomOrigine && normTxt(nomSaisi) === normTxt(nomOrigine)) {
      try {
        $w('TextInput').forEach((x) => console.log('[LPC][F3] champ texte', x.id, '=', JSON.stringify(x.value)));
      } catch (e) { /* type non supporté */ }
    }
    if (nomOrigine && normTxt(nomSaisi) !== normTxt(nomOrigine) && renommageConfirme !== nomSaisi) {
      renommageConfirme = nomSaisi;
      showErr(`Voulez-vous réellement changer le nom de votre organisme ? « ${nomOrigine} » sera renommé en « ${nomSaisi} ». Cliquez une seconde fois sur le bouton d'envoi pour confirmer, ou corrigez le nom.`, COULEUR_QUESTION);
      return;
    }

    bouton.disable();

    // Téléversement du logo (si un fichier est en attente) : en cas d'échec on interrompt, rien n'est perdu en silence
    let logoUrl = '';
    try { logoUrl = await televerserLogo(); }
    catch (e) {
      console.error('[LPC][F3] upload logo KO:', e);
      showErr(MSG_LOGO_ECHEC);
      bouton.enable();
      return;
    }

    try {
      const res = await submitPartenaire({
        prenom: valeur(EL.prenom),
        nom: valeur(EL.nom),
        telephone: valeur(EL.telephone),
        fonction: valeur(EL.fonction),
        organismeType: valeur(EL.type),
        organisme: valeur(EL.organisme),
        organismeAdresse: valeur(EL.adresse),
        capacites: valeur(EL.capacites),
        commentaire: valeur(EL.commentaire),
        consentement: coche(EL.consentement),
        logoUrl,
        supprimerLogo: logoASupprimer,
        consentementLogo: consentementLogoCoche(),
      });
      console.log('[LPC][F3] réponse du serveur', res, '| alerte interne :', res && res.notify);
      if (res && res.ok) {
        wixLocation.to(PAGE_MERCI);
      } else if (res && res.reason === 'consentement-logo-requis') {
        showErr(MSG_LOGO_CONSENT);
        bouton.enable();
      } else if (res && res.reason === 'logo-invalide') {
        showErr(MSG_LOGO_INVALIDE);
        bouton.enable();
      } else {
        showErr('L\'envoi a échoué, merci de réessayer dans un instant.');
        bouton.enable();
      }
    } catch (e) {
      console.error('[LPC][F3] submit KO:', e);
      showErr('Une erreur est survenue, merci de réessayer dans un instant.');
      bouton.enable();
    }
  });
});

// ─── message d'erreur ────────────────────────────────────────────────────
// Le texte ET sa couleur sont posés par le code : laisser dans l'éditeur un
// paragraphe quelconque (il est vidé au chargement). Pas besoin de « masquer
// au chargement », que Wix Studio n'expose pas toujours.
const COULEUR_ERREUR = '#C0392B';
const COULEUR_QUESTION = '#B9770E';   // demande de confirmation : ce n'est pas une erreur

/** Comparaison souple de deux libellés (casse, accents typographiques, espaces). */
function normTxt(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
}

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
  console.warn('[LPC][F3] message :', msg);
  const e = elErreur();
  if (!e) { console.error('[LPC][F3] paragraphe ' + EL.erreur + ' introuvable : message non affiché'); return; }
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
    console.error('[LPC][F3] affichage du message KO :', err);
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
    console.error('[LPC][F3] masquage du message KO :', err);
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
      console.warn('[LPC][F3] ' + EL.bouton + ' introuvable : repli sur le seul bouton de la page, #' + tous[0].id);
      return tous[0];
    }
    if (tous && tous.length) {
      console.error('[LPC][F3] ' + EL.bouton + ' introuvable. Boutons présents :',
        tous.map((b) => '#' + b.id + ' « ' + (b.label || '') + ' »').join(', '));
    }
  } catch (e) { /* type non supporté */ }
  console.error('[LPC][F3] aucun bouton d’envoi utilisable');
  return null;
}

function valeur(id) {
  try { const e = $w(id); return e ? e.value : undefined; }
  catch (err) { console.error('[LPC][F3] lecture impossible de ' + id + ' :', err); return undefined; }
}
/** État d'une case à cocher, false si l'élément est absent. */
function coche(id) {
  try { const e = $w(id); return Boolean(e && e.checked); }
  catch (err) { console.error('[LPC][F3] lecture impossible de ' + id + ' :', err); return false; }
}

function safe(label, fn) {
  try { fn(); } catch (e) { console.error('[LPC][F3] ' + label + ' KO:', e); }
}
function setVal(id, v) {
  const el = $w(id);
  if (el && v !== undefined && v !== null) el.value = v;
}
/** Signale dans la console les ID de EL absents de la page. */
function checkIds() {
  const manquants = Object.entries(EL).filter(([, id]) => {
    try { const el = $w(id); return !el || typeof el.type !== 'string'; } catch (e) { return true; }
  }).map(([k, id]) => `${k}=${id}`);
  if (manquants.length) {
    console.warn('[LPC][F3] éléments introuvables sur la page :', manquants.join(', '));
    // aide au diagnostic : tous les éléments Texte de la page, avec leur ID réel
    try {
      $w('Text').forEach((x) => console.warn('[LPC][F3] texte présent :', x.id, '|', String(x.text || '').slice(0, 40)));
      $w('Button').forEach((x) => console.warn('[LPC][F3] bouton présent :', x.id, '|', String(x.label || '').slice(0, 40)));
    } catch (e) { /* type non supporté, on ignore */ }
  }
  else console.log('[LPC][F3] tous les éléments sont présents');
}

// ─── e-mail (lecture seule, ajout du 26/09) ──────────────────────────────
// Champ de saisie FACULTATIF #email : e-mail de connexion affiché DÉSACTIVÉ, jamais envoyé.
// Il ne se change que par l'Espace Membres Wix (il identifie la fiche Membres et le compte).
const EMAIL_IDS = ['#email', '#email1', '#Email', '#emailMembre'];
function champEmail() {
  for (const id of EMAIL_IDS) {
    try { const e = $w(id); if (e && typeof e.type === 'string') return e; } catch (err) { /* suivant */ }
  }
  return null;
}
function poserEmail(email) {
  const el = champEmail();
  console.log('[LPC][F3] e-mail affiché :', Boolean(email), '| champ :', el ? '#' + el.id : 'absent');
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
    console.error('[LPC][F3] lecture de l’e-mail KO :', err);
  }
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
