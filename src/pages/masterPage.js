// masterPage.js — code global du site (toutes les pages).
// Site : REDACTED-WIX-SITE-ID (Wix Studio).
//
// À chaque connexion d'un membre : synchronise / lie sa fiche dans la
// collection Membres (members-sync). Filet — la page « Devenir Porteur de
// chaleur » relance aussi la synchro à son chargement, car authentication.onLogin
// n'est pas toujours fiable en Studio.

import { authentication } from 'wix-members-frontend';
import { syncCurrentMemberToCollection } from 'backend/members-sync.web';
import { estAdmin } from 'backend/admin.web';
import wixLocation from 'wix-location-frontend';
import { session } from 'wix-storage-frontend';

// Version du code global (estampille, console : [LPC][MP]).
const VERSION_MP = '2026-10-08-b';

// Redirection après connexion (Bruno, 08/10) : un membre qui se connecte depuis une page PUBLIQUE
// (accueil, pages d'information, pages /auth/* de réinitialisation du mot de passe) arrive sur /mon-profil.
// On ne détourne JAMAIS une connexion faite sur une page qui a son propre parcours : /participer et ses
// formulaires (F1, F2, F3), les pages membres, /merci et le back-office. Comparaison sur le 1er segment de l'adresse.
const PAGE_APRES_CONNEXION = '/mon-profil';
const PREFIXES_SANS_REDIRECTION = [
  'participer', 'devenir-', 'accueillir-', 'mon-', 'mes-residents', 'merci', 'admin'
];
// 08/10 (-b) : Wix RECHARGE la page après la connexion (constaté sur /auth/reset-password : la navigation lancée
// dans onLogin est annulée) et wixLocation.path est vide pendant onLogin. D'où : (1) le chemin est mémorisé au
// chargement de la page ; (2) onLogin pose un drapeau de session (valable 60 s) ; (3) la redirection se fait au
// chargement suivant, page rechargée, membre connecté.
const CLE_REDIRECTION = 'lpc_redirection_apres_connexion';
const DUREE_DRAPEAU_MS = 60000;
function segmentCourant() {
  try { return String((wixLocation.path && wixLocation.path[0]) || '').toLowerCase(); } catch (e) { return ''; }
}
let segmentMemorise = segmentCourant();
try { wixLocation.onChange(() => { const s = segmentCourant(); if (s) segmentMemorise = s; }); } catch (e) { /* ignoré */ }
function redirectionPermise(segment) {
  const exclue = PREFIXES_SANS_REDIRECTION.some((p) => segment === p || segment.indexOf(p) === 0);
  console.log('[LPC][MP] redirection après connexion : page « /' + segment + ' » ' + (exclue ? 'exclue' : 'autorisée'));
  return !exclue;
}
function poserDrapeauRedirection() {
  try { session.setItem(CLE_REDIRECTION, String(Date.now())); } catch (e) { console.warn('[LPC][MP] drapeau de redirection non posé :', e && e.message); }
}
// Au chargement : si un drapeau récent existe et que le membre est connecté, on redirige (puis on l'efface).
function appliquerRedirectionEnAttente() {
  let drapeau = null;
  try { drapeau = session.getItem(CLE_REDIRECTION); session.removeItem(CLE_REDIRECTION); } catch (e) { return; }
  if (!drapeau) return;
  if (!authentication.loggedIn()) return;
  if (Date.now() - Number(drapeau) > DUREE_DRAPEAU_MS) { console.log('[LPC][MP] drapeau de redirection périmé, ignoré'); return; }
  if (redirectionPermise(segmentCourant())) wixLocation.to(PAGE_APRES_CONNEXION);
}

// Lien « Admin » de l'en-tête : masqué par défaut, affiché pour les seuls admins.
// Confort d'affichage uniquement : /admin et ses web methods se protègent seuls.
// Deux ID possibles (04/10) : #lienAdmin (pages admin) et #lienAdminHP (accueil : l'éditeur refuse un doublon d'ID avec l'autre menu).
// Tous ceux que la page contient sont pilotés ; aucun trouvé = simple information (la page n'a pas de lien Admin).
const IDS_LIEN_ADMIN = ['#lienAdmin', '#lienAdminHP'];
async function majLienAdmin() {
  const els = [];
  IDS_LIEN_ADMIN.forEach((id) => { try { const e = $w(id); if (e && e.length !== 0) els.push(e); } catch (x) { /* absent de cette page */ } });
  if (!els.length) { console.log('[LPC][MP] aucun lien Admin sur cette page (' + IDS_LIEN_ADMIN.join(', ') + ')'); return; }
  els.forEach((el) => { try { el.hide(); } catch (e) { /* ignoré */ } });
  if (!authentication.loggedIn()) { console.log('[LPC][MP] lienAdmin : visiteur non connecté (version 2026-10-07-a)'); return; }
  try {
    const admin = await estAdmin();
    console.log('[LPC][MP] version 2026-10-07-a · estAdmin =', admin);
    if (admin) els.forEach((el) => { try { el.expand(); } catch (e) { /* ignoré */ } try { el.show(); } catch (e) { /* ignoré */ } });
  } catch (e) { console.warn('[LPC][MP] estAdmin KO:', e && e.message); }
}

$w.onReady(() => {
  console.log('[LPC][MP] version du code global :', VERSION_MP, '· chemin :', (wixLocation.path || []).join('/'));
  appliquerRedirectionEnAttente();
  majLienAdmin();
  authentication.onLogin(async () => {
    majLienAdmin();
    try {
      const res = await syncCurrentMemberToCollection();
      console.log('[LPC] onLogin sync:', res && res.action);
    } catch (e) {
      console.error('[LPC] onLogin sync KO:', e);
    }
    // Redirection après la synchro (la fiche existe) ; jamais depuis une page à parcours propre.
    // Chemin vivant s'il est lisible, sinon celui mémorisé au chargement.
    const segment = segmentCourant() || segmentMemorise;
    if (redirectionPermise(segment)) {
      poserDrapeauRedirection();      // si Wix recharge la page, la redirection se fait au chargement suivant
      wixLocation.to(PAGE_APRES_CONNEXION);
    }
  });
});
