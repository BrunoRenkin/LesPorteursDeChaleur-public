// Code de PAGE « Mon organisme » (/mon-organisme) — formulaire éditable de l'organisation liée.
// Page « Membres uniquement ». Jumelle de /mon-profil : mêmes helpers, même backend.
//
// Depuis le 06/10 la page CRÉE aussi l'organisation d'un membre qui n'en a pas (bouton « organisation » de /mon-profil, lien
// /mon-organisme?mode=creation ; ?mode=modification sinon). Le mode réel est celui du serveur : sans organisation liée = création.
// En création, le STATUT du membre (Accueillant, Partenaire ou les deux) découle du type choisi : champ Genre d'Organisations_Types
// (backend creerMonOrganisation).
//
// Éléments attendus (ID sensibles à la casse), dans #blocOrganisme :
//   #organisme #organismeLocalite #nombreDestinataires (saisies)  #organismeType (liste)
//   #capacitesOrganisme (groupe de cases)  #commentaireOrganisme (zone de texte)
//   #enregistrerOrganisme (bouton)
// Commun : #messageErreur (texte)

import { authentication } from 'wix-members-frontend';
import wixLocation from 'wix-location';
import { getMonProfil, enregistrerMonProfil, enregistrerMonOrganisation, creerMonOrganisation } from 'backend/mon-profil.web';

const EL = {
  blocOrganisme: '#blocOrganisme',
  erreur: '#messageErreur',
  ongletProfil: '#ongletProfil',
  ongletOrganisme: '#ongletOrganisme',
  ongletResidents: '#ongletResidents',   // facultatif, affiché pour les Accueillants (26/09)
};

// Onglet actif : peint par le code, l'éditeur ne sait pas distinguer les deux pages.
const ONGLET_ACTIF = { fond: '#C0392B', texte: '#FFFFFF' };
const ONGLET_INACTIF = { fond: '#FFFFFF', texte: '#C0392B' };

const CHAMPS = {
  organisme: ['organisme', 'organisme1', 'nomOrganisme'],
  organismeType: ['organismeType', 'organismeType1'],
  organismeLocalite: ['organismeLocalite', 'organismeLocalite1', 'localiteOrganisme'],
  nombreDestinataires: ['nombreDestinataires', 'nombreDestinataires1'],
  capacites: ['capacitesOrganisme', 'capacitesOrg', 'capacites', 'capacites1'],
  commentaire: ['commentaireOrganisme', 'commentaireOrg', 'commentaire', 'commentaire1'],
  // Ces deux champs, hérités de F2/F3, appartiennent au MEMBRE et non à l'organisation
  telephone: ['telephone', 'telephone1', 'phone'],
  fonction: ['fonction', 'fonction1'],
  enregistrer: ['enregistrerOrganisme', 'submitOrganisme', 'submitBtn'],
};

const MOTIFS = {
  capacites: /capacit/i,
  commentaire: /commentaire/i,
  organisme: /^organi(sme|sation)\d*$/i,
  organismeType: /type/i,
  organismeLocalite: /localit|ville/i,
  nombreDestinataires: /nombre|destinataire/i,
  telephone: /telephone|phone|tel\d*$/i,
  fonction: /fonction|role|poste/i,
};

const PAGE_F2 = '/accueillir-des-porteur-de-chaleur';
const PAGE_F3 = '/devenir-partenaire';
const PAGE_PROFIL = '/mon-profil';
// Le bouton « Résidents » de cette page s'appelle #button10 dans l'éditeur (page dupliquée) : on essaie les deux ID, puis le libellé
const ID_RESIDENTS = ['#ongletResidents', '#button10'];
// Paramètre propre à cette page : même message que Mon-Profil sur /merci (26/09).
const PAGE_MERCI = '/merci?f=porteur-mon-organisation';
// Après une CRÉATION qui rend le membre Accueillant : saisie des résidents (même page que la suite de F2)
const PAGE_RESIDENTS_CREATION = '/accueillir-les-porteurs-mes-residents';

// Statuts donnant accès à l'onglet « Organisme »
const STATUTS_ORGANISME = ['Accueillant', 'Partenaire'];
// Statut donnant accès à l'onglet « Résidents »
const STATUT_RESIDENTS = 'Accueillant';

const COULEUR_ERREUR = '#C0392B';
const COULEUR_QUESTION = '#B9770E';
const COULEUR_SUCCES = '#1E8449';

let d = {};
let ID = {};
let renommageConfirme = null;

$w.onReady(async () => {
  console.log('[LPC][Organisme] version du code : 2026-10-06-c (création + modification ; Accueillant -> saisie des résidents ; onglet Profil câblé, onglet Résidents masqué sans organisation)');
  safe('masquage erreur', hideErr);
  safe('résolution des ID', resoudreIds);
  safe('contrôle des ID', checkIds);
  safe('onglet actif', () => marquerOnglet(EL.ongletOrganisme, EL.ongletProfil));
  safe('lien de l’onglet Profil', cablerOngletProfil);
  safe('onglet résidents (masquage initial)', () => cacher(boutonResidents()));

  if (!authentication.loggedIn()) { wixLocation.to('/participer'); return; }

  try {
    d = (await getMonProfil()) || {};
    console.log('[LPC][Organisme] données reçues', {
      mode: modeDemande(), existe: d.existe, organisation: Boolean(d.organisation),
      capacites: (d.capaciteOptions || []).length, types: (d.typeOptions || []).length,
    });
  } catch (e) {
    console.error('[LPC][Organisme] getMonProfil KO:', e);
  }

  if (!d.existe) {
    showErr("Votre fiche n'existe pas encore. Merci de remplir d'abord un formulaire de participation.");
    return;
  }

  safe('visibilité onglet organisme', () => ongletOrganismeVisible(d.profil));
  safe('visibilité onglet résidents', () => ongletResidentsVisible(d.profil));
  safe('e-mail (lecture seule)', () => poserEmail(d.profil && d.profil.email));
  remplir();
  clic(ID.enregistrer, sauver);
});

/** Mode demandé par le lien (?mode=creation | modification) : indicatif, le serveur fait foi (organisation liée ou non). */
function modeDemande() {
  try { return String((wixLocation.query || {}).mode || ''); } catch (e) { return ''; }
}

/** L'onglet « Organisme » n'a de sens que pour un Accueillant ou un Partenaire. */
function ongletOrganismeVisible(profil) {
  const statuts = (profil && profil.statuts) || [];
  const autorise = statuts.some((s) => STATUTS_ORGANISME.some((x) => normTxt(x) === normTxt(s)));
  const el = optionnel(EL.ongletOrganisme);
  if (!el) return;
  try {
    if (autorise) { if (el.expand) el.expand(); }
    else if (el.collapse) el.collapse();
  } catch (e) { /* ignoré */ }
  console.log('[LPC][Organisme] onglet organisme', autorise ? 'affiché' : 'masqué', '| statuts :', statuts.join(', '));
}

/** L'onglet « Résidents » (page /mes-residents) est réservé aux Accueillants (26/09). */
function ongletResidentsVisible(profil) {
  const statuts = (profil && profil.statuts) || [];
  const el = boutonResidents();
  if (!el) return;
  peindre(el, ONGLET_INACTIF);
  // 06/10 : jamais en création (le futur statut, Accueillant ou Partenaire, dépend du type choisi) ni sans organisation liée
  const accueillant = statuts.some((s) => normTxt(s) === normTxt(STATUT_RESIDENTS));
  if (accueillant && d.organisation) montrer(el); else cacher(el);
}
/** Bouton « Résidents » : #ongletResidents, sinon #button10, sinon le premier bouton libellé « Résidents ». */
function boutonResidents() {
  for (const id of ID_RESIDENTS) { const el = optionnel(id); if (el) return el; }
  let trouve = null;
  try { $w('Button').forEach((b) => { if (!trouve && normTxt(b.label) === 'résidents') trouve = b; }); } catch (e) { /* ignoré */ }
  return trouve;
}
/** Le bouton « Profil » ramène à la fiche du membre (/mon-profil), sans identifiant dans l'adresse. */
function cablerOngletProfil() {
  const el = optionnel(EL.ongletProfil);
  if (el && typeof el.onClick === 'function') el.onClick(() => wixLocation.to(PAGE_PROFIL));
  else console.warn('[LPC][Organisme] bouton Profil introuvable ou sans onClick :', EL.ongletProfil);
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

// ─── résolution des ID ───────────────────────────────────────────────────
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
  console.log('[LPC][Organisme] ID résolus :', JSON.stringify(ID));
}

// ─── onglets ─────────────────────────────────────────────────────────────
/** Peint l'onglet de la page courante en plein, l'autre en contour. */
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
  safe('champs du membre', () => {
    setVal(ID.telephone, p.telephone);
    setVal(ID.fonction, p.fonction);
  });
  const o = d.organisation;
  safe('options type organisme', () => {
    const t = $w(ID.organismeType);
    const options = d.typeOptions || [];
    if (t.options !== undefined) t.options = options.map((v) => ({ label: v, value: v }));
    const voulu = (o && o.type) || '';
    const cible = options.find((x) => normTxt(x) === normTxt(voulu));
    if (cible) {
      t.value = cible;
      // Certains rendus de liste déroulante gardent le placeholder tant que l'index n'est pas
      // fixé, même quand .value porte la bonne valeur : on le pose explicitement.
      const i = options.indexOf(cible);
      if (i >= 0 && t.selectedIndex !== i) {
        try { t.selectedIndex = i; } catch (e) { /* composant sans selectedIndex */ }
      }
    }
    console.log('[LPC][Organisme] type :', JSON.stringify({
      enBase: voulu, choisi: cible || null, options: options.length,
      valeurLue: t.value, index: t.selectedIndex,
    }));
  });
  safe('options capacites', () => {
    // En création, le membre n'a pas encore de statut d'organisme : on propose les capacités des statuts Accueillant et Partenaire
    const opts = !o && (d.capaciteOptionsOrganisme || []).length ? d.capaciteOptionsOrganisme : (d.capaciteOptions || []);
    $w(ID.capacites).options = opts.map((v) => ({ label: v, value: v }));
  });
  if (!o) {
    // Pas d'organisation liée : mode CRÉATION (06/10). Formulaire vide, « Enregistrer » crée l'organisation.
    if (modeDemande() === 'modification') console.warn('[LPC][Organisme] mode=modification demandé mais aucune organisation liée : création');
    showErr("Vous n'avez pas encore d'organisation : renseignez-la ci-dessous. Votre statut (Accueillant ou Partenaire) dépendra du type choisi.", COULEUR_QUESTION);
    safe('remise à zéro des indications de validité', reinitialiserValidite);
    return;
  }
  if (modeDemande() === 'creation') console.warn('[LPC][Organisme] mode=creation demandé mais une organisation est déjà liée : modification');
  safe('organisme', () => {
    setVal(ID.organisme, o.nom);
    setVal(ID.organismeLocalite, o.localite);
    setVal(ID.nombreDestinataires, o.nombreDestinataires);
    setVal(ID.capacites, o.capacites);
    setVal(ID.commentaire, o.commentaire);
  });
  safe('remise à zéro des indications de validité', reinitialiserValidite);
}

/** Les champs remplis par le code restent marqués « invalides » par Wix, qui les a vus vides
 *  au rendu serveur. On efface cette indication une fois le préremplissage terminé. */
function reinitialiserValidite() {
  ['organisme', 'organismeType', 'organismeLocalite', 'nombreDestinataires',
    'capacites', 'commentaire', 'telephone', 'fonction'].forEach((k) => {
    const el = optionnel(ID[k]);
    if (el && typeof el.resetValidityIndication === 'function') {
      try { el.resetValidityIndication(); } catch (e) { /* ignoré */ }
    }
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
  if (!v) console.warn('[LPC][Organisme] type lu comme vide :', JSON.stringify({ value: el.value, index: el.selectedIndex }));
  return v;
}

async function sauver() {
  hideErr();
  const creation = !d.organisation;
  const nomSaisi = (valeur(ID.organisme) || '').trim();
  if (!nomSaisi) {
    showErr("Merci d'indiquer le nom de votre organisme.");
    return;
  }
  if (!typeChoisi()) {
    showErr("Merci de choisir le type de votre organisme.");
    return;
  }
  const nomOrigine = creation ? '' : (d.organisation.nom || '').trim();
  if (nomOrigine && normTxt(nomSaisi) !== normTxt(nomOrigine) && renommageConfirme !== nomSaisi) {
    renommageConfirme = nomSaisi;
    showErr(`Voulez-vous réellement changer le nom de votre organisme ? « ${nomOrigine} » sera renommé en « ${nomSaisi} ». Cliquez une seconde fois sur Enregistrer pour confirmer.`, COULEUR_QUESTION);
    return;
  }

  const bouton = optionnel(ID.enregistrer);
  if (bouton && bouton.disable) bouton.disable();
  try {
    // Téléphone et fonction appartiennent au membre : mise à jour partielle de sa fiche,
    // les capacités et disponibilités saisies dans « Mon profil » restent intactes.
    const res = await enregistrerMonProfil({
      telephone: valeur(ID.telephone),
      fonction: valeur(ID.fonction),
    });
    console.log('[LPC][Organisme] champs du membre', res);
  } catch (e) {
    console.error('[LPC][Organisme] enregistrerMonProfil KO:', e);
  }
  try {
    const charge = {
      nom: nomSaisi,
      type: typeChoisi(),
      localite: valeur(ID.organismeLocalite),
      nombreDestinataires: valeur(ID.nombreDestinataires),
      capacites: valeur(ID.capacites),
      commentaire: valeur(ID.commentaire),
    };
    const res = creation ? await creerMonOrganisation(charge) : await enregistrerMonOrganisation(charge);
    console.log('[LPC][Organisme] ' + (creation ? 'création' : 'enregistrement'), res);
    if (res && res.ok) {
      if (!creation) d.organisation.nom = nomSaisi;   // nouvelle référence pour la confirmation de renommage
      showErr(creation ? 'Votre organisation a bien été créée.' : 'Les informations de votre organisme ont bien été enregistrées.', COULEUR_SUCCES);
      const accueillant = creation && (res.statuts || []).some((s) => normTxt(s) === normTxt(STATUT_RESIDENTS));
      const suite = accueillant ? PAGE_RESIDENTS_CREATION : PAGE_MERCI;
      console.log('[LPC][Organisme] redirection vers', suite);
      wixLocation.to(suite);
      return;
    } else if (res && res.reason === 'pas-d-organisation') {
      showErr("Aucun organisme n'est rattaché à votre compte.");
    } else if (res && res.reason === 'deja-organisation') {
      showErr('Une organisation est déjà rattachée à votre compte : rechargez la page pour la modifier.');
    } else if (res && (res.reason === 'type-requis' || res.reason === 'type-sans-genre' || res.reason === 'statut-introuvable')) {
      showErr("Le type d'organisme choisi n'est pas utilisable. Merci d'en choisir un autre.");
    } else {
      showErr("L'enregistrement a échoué, merci de réessayer dans un instant.");
    }
  } catch (e) {
    console.error('[LPC][Organisme] enregistrerMonOrganisation KO:', e);
    showErr('Une erreur est survenue, merci de réessayer dans un instant.');
  }
  if (bouton && bouton.enable) bouton.enable();
}

// ─── messages ────────────────────────────────────────────────────────────
function normTxt(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
}
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function elErreur() {
  try { const e = $w(EL.erreur); return e && typeof e.type === 'string' ? e : null; }
  catch (err) { return null; }
}
function showErr(msg, couleur) {
  console.warn('[LPC][Organisme] message :', msg);
  const e = elErreur();
  if (!e) return;
  try {
    if (e.html !== undefined) e.html = `<p style="color:${couleur || COULEUR_ERREUR}; margin:0;">${escapeHtml(msg)}</p>`;
    else if (e.text !== undefined) e.text = msg;
    if (e.expand) e.expand();
    if (e.show) e.show();
  } catch (err) {
    console.error('[LPC][Organisme] affichage du message KO :', err);
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
  try { fn(); } catch (e) { console.error('[LPC][Organisme] ' + label + ' KO:', e); }
}
function optionnel(id) {
  try { const e = $w(id); return e && typeof e.type === 'string' ? e : null; }
  catch (err) { return null; }
}
function setVal(id, v) {
  const el = optionnel(id);
  if (el && v !== undefined && v !== null) el.value = v;
}
function valeur(id) {
  const el = optionnel(id);
  return el ? el.value : undefined;
}
function clic(id, fn) {
  const el = optionnel(id);
  if (el && typeof el.onClick === 'function') el.onClick(fn);
  else console.warn('[LPC][Organisme] bouton ' + id + ' introuvable');
}
/** Signale dans la console les ID absents de la page. */
function checkIds() {
  const manquants = Object.entries(ID).filter(([, id]) => !optionnel(id)).map(([k, id]) => `${k}=${id}`);
  if (manquants.length) {
    console.warn('[LPC][Organisme] éléments introuvables :', manquants.join(', '));
    try {
      $w('Button').forEach((x) => console.warn('[LPC][Organisme] bouton présent :', x.id, '|', String(x.label || '').slice(0, 40)));
    } catch (e) { /* ignoré */ }
  } else {
    console.log('[LPC][Organisme] tous les éléments sont présents');
  }
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
  console.log('[LPC][Organisme] e-mail affiché :', Boolean(email), '| champ :', el ? '#' + el.id : 'absent');
  if (!el) return;
  try { el.value = email || ''; } catch (err) { /* ignoré */ }
  try { if (typeof el.disable === 'function') el.disable(); } catch (err) { /* ignoré */ }
  try { if (typeof el.resetValidityIndication === 'function') el.resetValidityIndication(); } catch (err) { /* ignoré */ }
}
