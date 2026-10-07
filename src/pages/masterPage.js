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
  if (!authentication.loggedIn()) { console.log('[LPC][MP] lienAdmin : visiteur non connecté'); return; }
  try {
    const admin = await estAdmin();
    console.log('[LPC][MP] version 2026-10-06-a · estAdmin =', admin);
    if (admin) els.forEach((el) => { try { el.expand(); } catch (e) { /* ignoré */ } try { el.show(); } catch (e) { /* ignoré */ } });
  } catch (e) { console.warn('[LPC][MP] estAdmin KO:', e && e.message); }
}

$w.onReady(() => {
  majLienAdmin();
  authentication.onLogin(async () => {
    majLienAdmin();
    try {
      const res = await syncCurrentMemberToCollection();
      console.log('[LPC] onLogin sync:', res && res.action);
    } catch (e) {
      console.error('[LPC] onLogin sync KO:', e);
    }
  });
});
