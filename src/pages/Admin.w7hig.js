// Code de PAGE « Back-office » (/admin) — listes filtrables Membres / Organismes / Résidents + export.
// version du code : 2026-10-12-a   (12/10 a : #CompteurCartes « nombre de cartes : N » sur l'onglet Membres ; 10/10 b : bouton « Créer un membre » visible sur les trois onglets)
//   (anciennement 2026-10-10-a   (10/10 a : onglet Membres : fiche dont l'e-mail Wix n'est pas vérifié = 2e bouton facultatif #btnEnvoyerLien « Envoyer le lien » à côté de « Modifier »)
//   (anciennement 2026-10-07-c   (07/10 c : « Non validé » + bouton « Valider » ; 07/10 : troncature à 60 caractères des textes libres ; bouton #btnCreerMembre ; 06/10 : colonnes indicateur A / indicateur B remplacées par « Infos importantes »)
//
// Page « Membres uniquement », hors menu, non indexée. Ce réglage n'est qu'un confort : le contrôle
// réel est dans le backend (backend/admin.web.js → backend/lpc-acces.js). Un membre non admin ne
// reçoit AUCUNE donnée et voit seulement « Page réservée à l'équipe ».
//
// UN SEUL répéteur pour les trois onglets : 10 cellules génériques par ligne, dont le code change le
// contenu selon l'onglet ; les cellules et en-têtes inutilisés sont masqués (hide, jamais collapse).
// Les en-têtes sont des boutons HORS du répéteur : un clic trie sur la colonne (2e clic : sens inverse).
//
// Éléments attendus (ID sensibles à la casse) :
//   #ongletMembres #ongletOrganismes #ongletResidents (boutons, peints par le code)
//   #recherche (saisie)  #filtre (liste déroulante)  #compteur (texte)
//   #enteteTable (conteneur des en-têtes)  #h1 … #h10 (boutons d'en-tête, dans #enteteTable)
//   #repeater (répéteur)  dans son modèle : #ligne (conteneur)  #c1 … #c10 (textes)  #btnModifier (bouton « Modifier »,
//   dernière colonne, ouvre la fiche)
//   #btnAide (bouton « ? »)  #texteAide (zone de texte, masquée par défaut, repli si la lightbox manque)
//   #btnExport #btnEmails (boutons)  #zoneExport (zone de texte, lecture seule conseillée)
//   #messageErreur (texte)
// Facultatif : #blocAdmin (pile ou boîte contenant tout le reste, masquée en cas de refus)

import { authentication } from 'wix-members-frontend';
import wixLocation from 'wix-location';
import wixWindowFrontend from 'wix-window-frontend';
import { adminListe, adminExport, adminOuvrirFiche, adminOuvrirOrganismeDuResident, adminOuvrirJumelageDuResident, adminOuvrirDepuisOrganisme, adminOuvrirOrganismeDepuisListeMembres, adminValiderMembreWix, adminEnvoyerLienMotDePasse } from 'backend/admin.web';

const VERSION = '2026-10-12-a';   // 12/10 : #CompteurCartes (cartes promises) ;   // 07/10 (c) : lignes « Non validé » (comptes Wix sans fiche) et bouton « Valider » ; (b) : « Infos importantes » et « Intérêts » tronqués à 60 caractères ; (a) : bouton #btnCreerMembre -> /adminprofil?mode=creation
const TEXTE_LIBRE = ['infosimportantes', 'interets'];
const LONGUEUR_MAX_CELLULE = 60;
const PAGE_CREATION_MEMBRE = '/adminprofil?mode=creation';   // 06/10 (b) : onglet Résidents, liens sur l'institution (fiche de l'organisme) et le porteur jumelé (/adminjumelages)
// Page d'édition par onglet (mode admin). Résidents : /adminresidents = gestion des résidents de l'ORGANISME du résident choisi.
const PAGE_FICHE = { membres: '/adminprofil', organismes: '/adminorganisme', residents: '/adminresidents' };
const LIBELLE_BOUTON = { membres: 'Modifier', organismes: 'Modifier', residents: 'Modifier' };
const TOUS = 'Tous';
const NB_CELLULES = 10;
const ONGLET_ACTIF = { fond: '#C61010', texte: '#FFFFFF', bordure: '#FFFFFF' };
const ONGLET_INACTIF = { fond: '#FFFFFF', texte: '#C61010', bordure: '#C61010' };
const COULEUR_ERREUR = '#C0392B';
const CLASSE_TEXTE = 'font_8';   // style de paragraphe des cellules (vu dans le HTML de #c1)
const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// date : true = valeur AAAA-MM-JJ (triée telle quelle), affichée JJ/MM/AAAA. mailto : 'cle' = la cellule est un lien mailto: vers la valeur de cette clé de la ligne.
const col = (id, label, opts = {}) => ({ id, label, ...opts });
const CREE = col('cree', 'Créé le', { date: true });
const MODIFIE = col('modifie', 'Modifié le', { date: true });
const COLONNES = {
  membres: [col('nom', 'Nom', { mailto: 'email' }), col('telephone', 'Téléphone'),
    col('localite', 'Localité'), col('statuts', 'Statuts'), col('organisation', 'Organisme', { lien: 'organisme-membre' }),
    col('cartes', 'Cartes (en cours / max)'), CREE, MODIFIE],
  organismes: [col('nom', 'Nom', { lien: 'fiche' }), col('types', 'Type'), col('genres', 'Genre'),
    col('localite', 'Localité'), col('contact', 'Contact', { lien: 'contact' }), col('membres', 'Membres'),
    col('jumeles', 'Jumelés', { lien: 'jumelage-org' }), col('actifs', 'Résidents', { lien: 'residents-org' }), CREE, MODIFIE],
  residents: [col('nom', 'Résident'), col('institution', 'Organisme', { lien: 'organisme' }), col('chambre', 'Chambre'),
    col('infosimportantes', 'Infos importantes'), col('interets', 'Intérêts'), CREE, MODIFIE,
    col('jumelage', 'Jumelage', { lien: 'jumelage' })],   // dernière colonne, juste avant le bouton : nom du porteur jumelé
};
// Aide : titres en gras, puces, mots-clés en gras. `**x**` = gras. Rendu en HTML (lightbox ou #texteAide), avec repli en texte brut.
const AIDE = {
  membres: [
    { t: 'FILTRES', li: [
      '**Porteur** / **Accueillant** / **Partenaire** : les membres qui ont ce statut (les statuts se cumulent : un membre peut apparaître sous plusieurs).',
      '**Écrit des cartes** : le membre a coché « Écrire une ou plusieurs cartes » (Porteurs, formulaire Devenir Porteur ou Mon profil).',
      '**Non jumelés** : membre dont le nombre de jumelages en cours est inférieur au nombre de cartes qu’il souhaite écrire. Ne concerne pas les Accueillants ni les Partenaires.',
    ] },
    { t: 'COLONNE', li: [
      '**Nom** : un clic sur le nom ouvre un e-mail vers ce membre.',
      '**Cartes (en cours / max)** : le premier chiffre correspond aux jumelages en cours (proposés ou actifs) avec des résidents. Le second chiffre indique le nombre de cartes que le porteur souhaite écrire (« ? » s’il ne l’a pas indiqué). Le champ est vide si le membre n’écrit pas de cartes.',
      '**Créé le** et **Modifié le** : dates de création et de dernière modification de la fiche.',
      '**Modifier** : permet de consulter et éditer la fiche du membre.',
    ] },
    { t: 'TRI', li: [
      'Cliquer sur un en-tête de colonne trie la liste ; un second clic inverse le sens (▲ croissant, ▼ décroissant).',
    ] },
  ],
  organismes: [
    { t: 'FILTRES', li: [
      '**Accueillant** / **Partenaire** : le genre de l’organisme. Les autres valeurs sont ses types (maison de repos, école, etc.).',
    ] },
    { t: 'COLONNES', li: [
      '**Membres** : nombre de membres rattachés à l’organisme.',
      '**Contact** : premier membre rattaché à l’organisme (clic : sa fiche). **Jumelés** : résidents jumelés (au moins un jumelage en cours, proposé ou actif), clic : jumelage des résidents de l’organisme. **Résidents** : résidents actifs saisis pour cet organisme, clic : leur gestion.',
      '**Créé le** et **Modifié le** : dates de création et de dernière modification de la fiche.',
      '**Modifier** : permet de consulter et éditer la fiche de l’organisme.',
    ] },
    { t: 'TRI', li: [
      'Cliquer sur un en-tête de colonne trie la liste ; un second clic inverse le sens (▲ croissant, ▼ décroissant).',
    ] },
  ],
  residents: [
    { t: 'FILTRES', li: [
      '**Sans porteur** : aucun jumelage en cours. **Jumelés** : au moins un jumelage en cours (proposé ou actif).',
      '**Le nom d’une institution** : les résidents de cette institution.',
    ] },
    { t: 'COLONNE', li: [
      '**Jumelage** : nom du porteur jumelé au résident (jumelage en cours, proposé ou actif). Vide = sans porteur.',
      '**Créé le** et **Modifié le** : dates de création et de dernière modification de la fiche.',
      '**Modifier** : ouvre la gestion des résidents de l’organisme de ce résident (ajouter, modifier, supprimer ; un résident jumelé ne peut pas être supprimé).',
    ] },
    { t: 'TRI', li: [
      'Cliquer sur un en-tête de colonne trie la liste ; un second clic inverse le sens (▲ croissant, ▼ décroissant).',
    ] },
  ],
};
/** `**gras**` -> <strong>, le reste échappé. */
const enHtml = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
/** Aide d'un onglet en HTML : titre en gras, puces (structure <ul><li><p> attendue par les textes Wix), ligne vide entre blocs. */
function aideHtml(o) {
  return AIDE[o].map((b) =>
    '<p class="' + CLASSE_TEXTE + '"><strong>' + esc(b.t) + '</strong></p>'
    + '<ul class="' + CLASSE_TEXTE + '">' + b.li.map((x) => '<li><p class="' + CLASSE_TEXTE + '">' + enHtml(x) + '</p></li>').join('') + '</ul>'
  ).join('<p class="' + CLASSE_TEXTE + '"><br></p>');
}
/** Repli en texte brut si le texte n'accepte pas le HTML. */
function aideTexte(o) {
  const nl = String.fromCharCode(10);
  return AIDE[o].map((b) => b.t + nl + b.li.map((x) => '• ' + x.replace(/\*\*/g, '')).join(nl)).join(nl + nl);
}
const NOM_LIGHTBOX = 'AideAdmin';
const TITRES = { membres: 'Aide : membres', organismes: 'Aide : organismes', residents: 'Aide : résidents' };
const BOUTONS = { membres: '#ongletMembres', organismes: '#ongletOrganismes', residents: '#ongletResidents' };
const NOMS = { membres: ['membre', 'membres'], organismes: ['organisme', 'organismes'], residents: ['résident', 'résidents'] };

let onglet = 'membres';
let tri = { col: 'nom', sens: 1 };   // sens : 1 = croissant, -1 = décroissant
let lignesCourantes = [];
let minuteur = null;
let appel = 0;   // ignore les réponses d'un appel dépassé (frappe rapide dans la recherche)
let rendu = 0;   // change à chaque affichage : ID d'items neufs, donc onItemReady toujours rejoué

// Section Navigation devenue GLOBALE (01/10) : Wix a renommé ses éléments. Les anciens ID du code sont traduits vers les
// nouveaux (testés en premier), l'ancien ID restant en repli. Les ID de la section sont partagés avec /adminprofil et /adminorganisme.
const ALIAS = {
  '#ongletMembres': '#ongletMembresAdmin', '#ongletOrganismes': '#ongletOrganismesAdmin', '#ongletResidents': '#ongletResidentsAdmin',
  '#messageErreur': '#errorText',
};
const el1 = (id) => { try { const e = $w(id); return e && e.length !== 0 ? e : null; } catch (e) { return null; } };
const el = (id) => (ALIAS[id] && el1(ALIAS[id])) || el1(id);
const safe = (nom, fn) => { try { return fn(); } catch (e) { console.warn('[LPC][Admin] ' + nom + ' KO:', e && e.message); } };
const val = (id) => { const e = el(id); return e && typeof e.value === 'string' ? e.value : ''; };
const setTxt = (id, t, couleur) => safe('txt ' + id, () => {
  let e = el(id); if (!e) return;
  // Un conteneur (ex. box155 renommé) n'a pas de `text` : on écrit dans son premier texte
  if (e.text === undefined) {
    let kids = []; try { kids = e.children || []; } catch (x) { kids = []; }
    const k = kids.find((c) => c && c.text !== undefined);
    if (k) e = k; else console.warn('[LPC][Admin] ' + id + ' n’est pas un texte et ne contient aucun texte');
  }
  e.text = t || '';
  if (couleur && e.style) e.style.color = couleur;
  if (t) { e.show && e.show(); } else { e.hide && e.hide(); }
});
const montrer = (id, oui) => safe('vis ' + id, () => { const e = el(id); if (e) { oui ? e.show() : e.hide(); } });
const nums = (prefixe) => Array.from({ length: NB_CELLULES }, (_, i) => prefixe + (i + 1));

function peindre(e, c) {
  if (!e || !e.style) return;
  try { e.style.backgroundColor = c.fond; } catch (x) { /* ignoré */ }
  try { e.style.color = c.texte; } catch (x) { /* ignoré */ }
  try { e.style.borderColor = c.bordure; } catch (x) { /* ignoré */ }
  try { e.style.borderWidth = 1; } catch (x) { /* ignoré */ }
}

// Texte des totaux « X membres et Y jumelages » : #TotauxMembresetJumelage (ex-box155), à défaut #compteur
const IDS_TOTAUX = ['#TotauxMembresetJumelage', '#compteur'];
const idTotaux = () => IDS_TOTAUX.find((id) => el1(id)) || '#compteur';
const TOUT_LE_RESTE = ['#ongletMembres', '#ongletOrganismes', '#ongletResidents', '#recherche', '#filtre',
  '#TotauxMembresetJumelage', '#compteur', '#CompteurCartes', '#enteteTable', '#repeater', '#btnAide', '#btnExport', '#btnEmails', '#zoneExport', '#btnCreerMembre'];

function interfaceVisible(oui) {
  if (el('#blocAdmin')) montrer('#blocAdmin', oui);
  TOUT_LE_RESTE.forEach((id) => montrer(id, oui));
}

/** Texte d'une cellule : dates AAAA-MM-JJ affichées JJ/MM/AAAA. */
function texteCellule(c, ligne) {
  let v = ligne[c.id] == null ? '' : String(ligne[c.id]);
  // 07/10 : texte libre tronqué à l'affichage (2 lignes maximum) ; le tri, la recherche et l'export gardent le texte complet
  if (TEXTE_LIBRE.includes(c.id) && v.length > LONGUEUR_MAX_CELLULE) v = v.slice(0, LONGUEUR_MAX_CELLULE - 1).trimEnd() + '…';
  if (c.date && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v.slice(8, 10) + '/' + v.slice(5, 7) + '/' + v.slice(0, 4);
  return v;
}

/** Remplit un item du répéteur : cellules de l'onglet courant, les autres masquées. */
function remplirItem($item, d) {
  const cols = COLONNES[onglet];
  for (let i = 0; i < NB_CELLULES; i++) {
    const cell = $item('#c' + (i + 1));
    if (!cell) continue;
    safe('cellule c' + (i + 1), () => {
      const c = cols[i];
      if (!c) { cell.text = ''; cell.hide(); return; }
      cell.text = texteCellule(c, d);
      cell.show();
      if (c.lien && cell.text) {
        // Onglet Résidents : institution -> fiche de l'organisme ; porteur jumelé -> /adminjumelages (ticket créé côté serveur, clic)
        try { cell.html = '<p class="' + CLASSE_TEXTE + '"><u>' + esc(texteCellule(c, d)) + '</u></p>'; } catch (e) { /* texte brut conservé */ }
        try { if (typeof cell.onClick === 'function') cell.onClick(() => ouvrirLien(d, c.lien)); } catch (e) { /* ignoré */ }
      }
      if (c.mailto && d[c.mailto]) {
        // `.link` posé par le code n'a produit aucun <a> dans le DOM (constat du 30/09) : lien écrit dans le HTML du texte.
        cell.html = '<p class="' + CLASSE_TEXTE + '"><a href="mailto:' + esc(d[c.mailto]) + '">' + esc(texteCellule(c, d)) + '</a></p>';
      }
    });
  }
  safe('bouton Envoyer le lien (fiche à e-mail non vérifié)', () => {
    // 10/10 : élément FACULTATIF du modèle de ligne ; visible seulement sur une fiche de l'onglet Membres dont l'e-mail Wix n'est pas vérifié
    const l = $item('#btnEnvoyerLien');
    if (!l || typeof l.onClick !== 'function') { if (!lienLigneSignale) { lienLigneSignale = true; console.log('[LPC][Admin] #btnEnvoyerLien absent du modèle de ligne (facultatif) : « Envoyer le lien » reste disponible depuis la fiche'); } return; }
    const oui = onglet === 'membres' && !d.nonValide && d.emailNonVerifie === true;
    if (!oui) { try { if ('text' in l) l.text = ''; } catch (e) { /* ignoré */ } if (l.hide) l.hide(); return; }
    const estBouton = 'label' in l;
    try { if (estBouton) l.label = 'Envoyer le lien'; else l.text = 'Envoyer le lien'; } catch (e) { /* ignoré */ }
    try { if (!estBouton && l.customClassList) { l.customClassList.add('lpc-bouton'); l.customClassList.add('lpc-bouton-contour'); } } catch (e) { /* ignoré */ }   // un texte n'a ni fond ni bordure dans l'éditeur : classes de global.css
    l.onClick(() => envoyerLien(d));
    if (l.show) l.show();
  });
  safe('bouton Modifier', () => {
    const b = $item('#btnModifier');
    if (b && 'label' in b) b.label = d.nonValide ? (d.emailNonVerifie ? 'Envoyer le lien' : 'Créer le profil') : (LIBELLE_BOUTON[onglet] || 'Modifier');   // compte Wix sans fiche : « Créer le profil » crée la fiche (renommé le 08/10, ex-« Valider »)
    if (b && typeof b.onClick === 'function') b.onClick(() => ouvrir(d));
    if (b && b.show) b.show();
    if (b && typeof b.onClick === 'function') return;
    if (!modifierSignale) {   // une seule alerte, pas une par ligne
      modifierSignale = true;
      console.warn('[LPC][Admin] #btnModifier introuvable dans le modèle du répéteur (ou sans onClick) ; type reçu :', b && b.type);
    }
  });
}

$w.onReady(async () => {
  console.log('[LPC][Admin] version du code :', VERSION);
  try { cablerJumelages(); } catch (e) { console.error('[LPC][nav] jumelage KO:', e); }
  safe('inventaire', () => inventaire('Admin'));
  // Éléments de la section Navigation sans objet sur /admin (utiles aux pages d'édition) : masqués
  // Titre de la section Navigation : « Tableau de bord » sur /admin (les pages d'édition y écrivent le nom de la fiche) ;
  // le texte du lien n'a pas d'objet ici.
  safe('titres de la navigation', () => {
    const t = el('#TitreAdmin');
    if (t) { t.text = 'Tableau de bord'; t.show(); }
    montrer('#TitreLinkAdmin', false);
    montrer('#TitreLinkMembre', false);
    montrer('#TitreLinkResidents', false);
    ['#TitreLinkJumelages', '#TitreLinkJumelage', '#TitreLinkJumeles'].forEach((id) => montrer(id, false));
  });
  // Onglet demandé par les pages d'édition (?onglet=membres|organismes|residents) : on revient à la bonne liste
  safe('onglet demandé', () => {
    const o = (wixLocation.query || {}).onglet;
    if (['membres', 'organismes', 'residents'].includes(o)) { onglet = o; console.log('[LPC][Admin] onglet demandé :', o); }
  });
  // Tout est masqué d'emblée : rien ne s'affiche avant la réponse du backend.
  interfaceVisible(false);
  setTxt('#messageErreur', '');

  if (!authentication.loggedIn()) { wixLocation.to('/participer'); return; }

  const manquants = ['#messageErreur', ...TOUT_LE_RESTE, ...nums('#h')].filter((id) => !el(id));
  if (manquants.length) console.warn('[LPC][Admin] ID introuvables :', manquants.join(' '));

  safe('câblage', () => {
    // Bouton « Créer un membre » (07/10) : ouvre /adminprofil en mode création (aucun identifiant ; le serveur contrôle l'admin)
    const bc = el('#btnCreerMembre');
    if (bc && typeof bc.onClick === 'function') { bc.onClick(() => wixLocation.to(PAGE_CREATION_MEMBRE)); try { bc.link = PAGE_CREATION_MEMBRE; } catch (e) { /* repli sur le clic */ } }
    else console.warn('[LPC][Admin] #btnCreerMembre introuvable : ajoutez le bouton « Créer un membre »');
    Object.entries(BOUTONS).forEach(([o, id]) => {
      const b = el(id); if (!b) return;
      b.onClick(() => changerOnglet(o));
      // Lien d'éditeur résiduel (ex. #ongletResidentsAdmin pointait vers /mes-residents) : remplacé par la liste voulue, sinon le clic
      // quitterait la page. Posé AVANT la recherche des boutons /mes-residents ci-dessous, qui ne doit pas toucher aux onglets.
      try { if (String(b.link || '')) b.link = '/admin?onglet=' + o; } catch (e) { /* ignoré */ }
    });
    // Bouton « Jumelage » de la navigation : /adminjumelages avec TOUS les résidents (son lien d'éditeur pointait vers /mes-residents)
    const URL_JUMELAGES = '/adminjumelages?tous=1';
    ['#ongletsJumelagesAdmin', '#ongletsJumelages', '#ongletJumelagesAdmin', '#ongletJumelages'].forEach((id) => {
      const b = el1(id); if (!b) return;
      try { b.link = URL_JUMELAGES; } catch (e) { /* repli sur le clic */ }
      if (typeof b.onClick === 'function') b.onClick(() => wixLocation.to(URL_JUMELAGES));
    });
    // Tout bouton dont le lien d'éditeur pointe encore vers /mes-residents est redirigé de la même façon
    try {
      const t = $w('Button');
      for (let i = 0; i < t.length; i++) {
        const b = t[i];
        let lien = ''; try { lien = String(b.link || ''); } catch (e) { lien = ''; }
        if (/mes-residents/i.test(lien)) {
          try { b.link = URL_JUMELAGES; } catch (e) { /* repli sur le clic */ }
          if (typeof b.onClick === 'function') b.onClick(() => wixLocation.to(URL_JUMELAGES));
          console.log('[LPC][Admin] bouton #' + b.id + ' (lien /mes-residents) redirigé vers ' + URL_JUMELAGES);
        }
      }
    } catch (e) { /* ignoré */ }
    const r = el('#recherche'); if (r) r.onInput(() => { clearTimeout(minuteur); minuteur = setTimeout(() => charger(false), 300); });
    const f = el('#filtre'); if (f) f.onChange(() => charger(false));
    const ai = el('#btnAide'); if (ai) ai.onClick(() => basculerAide());
    const rep = el('#repeater'); if (rep) rep.onItemReady(($item, d) => remplirItem($item, d));
    nums('#h').forEach((id, i) => { const h = el(id); if (h) h.onClick(() => trierSur(i)); });
    const x = el('#btnExport'); if (x) x.onClick(() => exporter('csv'));
    const m = el('#btnEmails'); if (m) m.onClick(() => exporter('emails'));
  });

  const ok = await charger(true);
  if (ok) {
    interfaceVisible(true);
    montrer('#zoneExport', false);
    basculerAide(false);
    peindreOnglets();
    afficher();   // interfaceVisible(true) a réaffiché tous les en-têtes : on remet ceux de l'onglet
  }
});

let aideOuverte = false;
let modifierSignale = false;
let lienLigneSignale = false;
/** Aide en fenêtre (lightbox « AideAdmin », voir lightbox-aide-admin.js) ; à défaut, zone #texteAide. */
async function basculerAide(forcer) {
  if (forcer === false) { aideOuverte = false; montrer('#texteAide', false); return; }
  try {
    await wixWindowFrontend.openLightbox(NOM_LIGHTBOX, { titre: TITRES[onglet], html: aideHtml(onglet), texte: aideTexte(onglet) });
    return;
  } catch (e) {
    console.warn('[LPC][Admin] lightbox « ' + NOM_LIGHTBOX + ' » indisponible, repli sur #texteAide :', e && e.message);
  }
  aideOuverte = !aideOuverte;
  if (aideOuverte) poserAide(); else montrer('#texteAide', false);
}
/** Aide dans la zone #texteAide de la page (repli sans lightbox) : HTML si accepté, sinon texte brut. */
function poserAide() {
  const e = el('#texteAide');
  if (!e) return;
  let ok = false;
  try { if (e.html !== undefined) { e.html = aideHtml(onglet); ok = true; } } catch (err) { ok = false; }
  if (!ok) setTxt('#texteAide', aideTexte(onglet)); else { try { e.show(); } catch (err) { /* ignoré */ } }
}

/** Clic sur l'en-tête n° i : tri sur cette colonne, un second clic inverse le sens. */
function trierSur(i) {
  const c = COLONNES[onglet][i];
  if (!c) return;
  tri = { col: c.id, sens: tri.col === c.id ? -tri.sens : 1 };
  afficher();
}

/** En-têtes de l'onglet courant : libellé (▲ / ▼ sur la colonne triée), inutilisés masqués. */
function afficherEntetes() {
  const cols = COLONNES[onglet];
  nums('#h').forEach((id, i) => safe('en-tête ' + id, () => {
    const h = el(id); if (!h) return;
    const c = cols[i];
    if (!c) { h.hide(); return; }
    const t = c.label + (c.id === tri.col ? (tri.sens === 1 ? ' ▲' : ' ▼') : '');
    // Bouton : `label` ; élément texte : `text`. On pose les deux, l'inutile est sans effet.
    safe('libellé ' + id, () => { h.label = t; });
    safe('texte ' + id, () => { h.text = t; });
    h.show();
  }));
}

/** Tri côté page, sur les lignes déjà reçues (nombres compris comme des nombres, sans accents). */
function afficher() {
  const c = tri.col;
  const lignes = lignesCourantes.slice().sort((a, b) =>
    tri.sens * String(a[c] == null ? '' : a[c]).localeCompare(String(b[c] == null ? '' : b[c]), 'fr', { numeric: true, sensitivity: 'base' }));
  rendu++;
  // `_id` unique à chaque rendu (obligé pour rejouer onItemReady) ; l'identifiant réel est dans `id`.
  safe('lignes', () => { const r = el('#repeater'); if (r) r.data = lignes.map((l, i) => ({ ...l, id: l._id, rang: i, _id: l._id + '~' + rendu })); });
  afficherEntetes();
}

function peindreOnglets() {
  Object.entries(BOUTONS).forEach(([o, id]) => peindre(el(id), o === onglet ? ONGLET_ACTIF : ONGLET_INACTIF));
  // Bouton « Jumelage » : jamais actif ici (sa page est /adminjumelages), donc toujours au style inactif
  ['#ongletsJumelagesAdmin', '#ongletsJumelages', '#ongletJumelagesAdmin', '#ongletJumelages'].forEach((id) => peindre(el1(id), ONGLET_INACTIF));
  montrer('#btnEmails', onglet === 'membres');
  montrer('#btnCreerMembre', true);   // 10/10 : visible sur les trois onglets (ex-07/10 : onglet Membres seulement)
}

async function changerOnglet(o) {
  if (o === onglet) return;
  onglet = o;
  safe('URL ?onglet=', () => { wixLocation.queryParams.add({ onglet: o }); });   // l'adresse reflète l'onglet (lien partageable, rechargement)
  tri = { col: 'nom', sens: 1 };
  lignesCourantes = [];
  safe('vider', () => { const r = el('#repeater'); if (r) r.data = []; });   // pas d'anciennes lignes sous les nouvelles colonnes
  safe('reset recherche', () => { const r = el('#recherche'); if (r) r.value = ''; });
  montrer('#zoneExport', false);
  if (aideOuverte) poserAide();
  peindreOnglets();
  afficherEntetes();
  await charger(true);
}

function filtreCourant() {
  const f = val('#filtre');
  return { onglet, recherche: val('#recherche'), filtre: f && f !== TOUS ? f : '' };
}

/** Non-admin : interface masquée, message bref, puis retour à l\'accueil. */
function refuse() {
  console.warn("[LPC][Admin] accès refusé : redirection vers l\'accueil");
  interfaceVisible(false);
  setTxt('#messageErreur', "Page réservée à l'équipe des Porteurs de Chaleur.", COULEUR_ERREUR);
  wixLocation.to('/');
  return false;
}

/** nouvelOnglet = true : options de filtre remplacées, filtre remis à « Tous ». */
async function charger(nouvelOnglet) {
  const n = ++appel;
  if (nouvelOnglet) safe('reset filtre', () => { const f = el('#filtre'); if (f) f.value = TOUS; });
  try {
    const res = await adminListe(nouvelOnglet ? { onglet, recherche: val('#recherche'), filtre: '' } : filtreCourant());
    if (n !== appel) return true;
    if (res && res.refuse) return refuse();
    if (nouvelOnglet) {
      tri = { col: 'nom', sens: 1 };
      safe('options filtre', () => {
        const f = el('#filtre');
        if (f) { f.options = [{ label: TOUS, value: TOUS }, ...res.options.map((o) => ({ label: o, value: o }))]; f.value = TOUS; }
      });
    }
    lignesCourantes = res.lignes;
    afficher();
    const [un, plusieurs] = NOMS[onglet];
    const nbJum = (res.totaux && res.totaux.jumelages) || 0;
    setTxt(idTotaux(), `${res.lignes.length} ${res.lignes.length > 1 ? plusieurs : un} et ${nbJum} jumelage${nbJum > 1 ? 's' : ''}`);
    // 12/10 : cartes promises (somme des « nombre de cartes » des porteurs de la liste), onglet Membres seulement
    setTxt('#CompteurCartes', onglet === 'membres' ? 'nombre de cartes : ' + ((res.totaux && res.totaux.cartes) || 0) : '');
    setTxt('#messageErreur', '');
    return true;
  } catch (e) {
    if (n !== appel) return true;
    console.warn('[LPC][Admin] adminListe KO:', e);
    interfaceVisible(false);
    setTxt('#messageErreur', 'Impossible de charger la liste.', COULEUR_ERREUR);
    return false;
  }
}

// Ouverture d'une fiche : le backend crée un TICKET lié à l'administrateur, puis on va sur PAGE_FICHE.
// Aucun identifiant dans l'URL. `ligne.id` = identifiant réel de la fiche (`_id` porte un suffixe de rendu).
// Membres, organismes et résidents (gestion des résidents de son organisme) sont gérés.
let validationEnCours = false;
/** « Créer le profil » (ex-« Valider ») : crée la fiche LPC d'un compte Wix qui n'en a pas (aucun e-mail envoyé, l'e-mail du compte n'est PAS vérifié par cette action), puis recharge la liste. */
async function valider(ligne) {
  if (validationEnCours) return;
  validationEnCours = true;
  setTxt('#messageErreur', '');
  try {
    const res = (await adminValiderMembreWix({ id: ligne.id })) || {};
    console.log('[LPC][Admin] validation', { ok: res.ok, reason: res.reason, role: res.role, emailVerifie: res.emailVerifie });
    if (res.refuse) { refuse(); return; }
    if (res.ok) {
      await charger(false);
      setTxt('#messageErreur', 'Fiche créée. Prévenez la personne (e-mail manuel) : elle peut se connecter au site pour compléter son inscription.', '#1E8449');
    } else {
      setTxt('#messageErreur', res.reason === 'deja-synchronise' ? 'Ce membre a déjà une fiche : rechargez la page.'
        : res.reason === 'introuvable' ? 'Compte Wix introuvable.' : 'La création du profil a échoué, merci de réessayer.', COULEUR_ERREUR);
    }
  } catch (e) {
    console.error('[LPC][Admin] adminValiderMembreWix KO:', e);
    setTxt('#messageErreur', 'La création du profil a échoué, merci de réessayer.', COULEUR_ERREUR);
  } finally { validationEnCours = false; }
}

/** « Envoyer le lien » (compte Wix à e-mail non vérifié) : Wix envoie à la personne l'e-mail de définition du mot de passe, qui vérifie l'e-mail. */
async function envoyerLien(ligne) {
  if (validationEnCours) return;
  validationEnCours = true;
  setTxt('#messageErreur', '');
  try {
    const res = (await adminEnvoyerLienMotDePasse({ id: ligne.id })) || {};
    console.log('[LPC][Admin] lien de mot de passe', { ok: res.ok, reason: res.reason });
    if (res.refuse) { refuse(); return; }
    setTxt('#messageErreur', res.ok ? 'Lien envoyé à la personne. Prévenez-la (e-mail manuel) : elle définit son mot de passe puis se connecte.' : "L'envoi du lien a échoué, merci de réessayer.", res.ok ? '#1E8449' : COULEUR_ERREUR);
  } catch (e) {
    console.error('[LPC][Admin] adminEnvoyerLienMotDePasse KO:', e);
    setTxt('#messageErreur', "L'envoi du lien a échoué, merci de réessayer.", COULEUR_ERREUR);
  } finally { validationEnCours = false; }
}

async function ouvrir(ligne) {
  if (!ligne) return;
  if (ligne.nonValide) { await (ligne.emailNonVerifie ? envoyerLien(ligne) : valider(ligne)); return; }
  console.log('[LPC][Admin] ligne choisie :', onglet, ligne.id);
  const page = PAGE_FICHE[onglet];
  if (!page) {
    setTxt('#messageErreur', "L'édition des résidents n'est pas encore disponible.", COULEUR_ERREUR);
    return;
  }
  setTxt('#messageErreur', '');
  try {
    console.log('[LPC][Admin] appel adminOuvrirFiche | fonction présente :', typeof adminOuvrirFiche);
    const res = await adminOuvrirFiche({ onglet, id: ligne.id });
    console.log('[LPC][Admin] réponse adminOuvrirFiche :', JSON.stringify(res));
    if (res && res.refuse) { refuse(); return; }
    if (res && res.ok) { console.log('[LPC][Admin] redirection vers', page); wixLocation.to(page); return; }
    console.warn('[LPC][Admin] ouverture de fiche refusée :', res && res.reason);
    setTxt('#messageErreur', res && res.reason === 'tickets-indisponibles'
      ? "Ouverture impossible : la collection Tickets_Admin est introuvable."
      : res && res.reason === 'pas-d-organisme' ? "Ce résident n'est rattaché à aucun organisme."
      : "Impossible d'ouvrir cette fiche.", COULEUR_ERREUR);
  } catch (e) {
    console.error('[LPC][Admin] adminOuvrirFiche KO:', e);
    setTxt('#messageErreur', "Impossible d'ouvrir cette fiche.", COULEUR_ERREUR);
  }
}

let dernierClicLien = 0;
/** Liens de l'onglet Résidents : `d.id` = identifiant du résident ; le serveur retrouve l'organisme / le porteur et crée le ticket. */
async function ouvrirLien(ligne, lien) {
  const t = Date.now();
  if (t - dernierClicLien < 600) return;   // anti-doublon
  dernierClicLien = t;
  if (lien === 'fiche') { await ouvrir(ligne); return; }   // nom de l'organisme : même ouverture que le bouton « Modifier »
  setTxt('#messageErreur', '');
  try {
    // Onglet Résidents : `ligne.id` = résident ; onglet Organismes : `ligne.id` = organisme
    const DEPUIS_ORG = { contact: { cible: 'contact', page: '/adminprofil' }, 'jumelage-org': { cible: 'jumelage', page: '/adminjumelages' }, 'residents-org': { cible: 'residents', page: '/adminresidents' } };
    const o = DEPUIS_ORG[lien];
    if (lien === 'organisme-membre') {   // onglet Membres : `ligne.id` = membre
      const r = await adminOuvrirOrganismeDepuisListeMembres({ membre: ligne.id });
      console.log('[LPC][Admin] lien', lien, JSON.stringify(r));
      if (r && r.refuse) { refuse(); return; }
      if (r && r.ok) { wixLocation.to('/adminorganisme'); return; }
      setTxt('#messageErreur', "Impossible d'ouvrir cette page.", COULEUR_ERREUR);
      return;
    }
    const res = o ? await adminOuvrirDepuisOrganisme({ organisme: ligne.id, cible: o.cible })
      : lien === 'organisme' ? await adminOuvrirOrganismeDuResident({ resident: ligne.id }) : await adminOuvrirJumelageDuResident({ resident: ligne.id });
    console.log('[LPC][Admin] lien', lien, JSON.stringify(res));
    if (res && res.refuse) { refuse(); return; }
    if (res && res.ok) { wixLocation.to(o ? o.page : (lien === 'organisme' ? '/adminorganisme' : '/adminjumelages')); return; }
    setTxt('#messageErreur', "Impossible d'ouvrir cette page.", COULEUR_ERREUR);
  } catch (e) {
    console.error('[LPC][Admin] lien KO:', e);
    setTxt('#messageErreur', "Impossible d'ouvrir cette page.", COULEUR_ERREUR);
  }
}

async function exporter(mode) {
  try {
    const res = await adminExport(filtreCourant());
    if (res && res.refuse) { refuse(); return; }
    safe('zone export', () => { const z = el('#zoneExport'); if (z) { z.value = mode === 'emails' ? res.emails : res.csv; z.show(); } });
    const [un, plusieurs] = NOMS[onglet];
    setTxt(idTotaux(), `${res.nombre} ${res.nombre > 1 ? plusieurs : un} · ${mode === 'emails' ? 'e-mails' : 'CSV'} prêt à copier`);
  } catch (e) {
    console.warn('[LPC][Admin] export KO:', e && e.message);
    setTxt('#messageErreur', 'Export impossible.', COULEUR_ERREUR);
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
