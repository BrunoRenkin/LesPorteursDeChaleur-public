import wixData from 'wix-data';
import { currentMember } from 'wix-members-backend';

/*
 *  backend/lpc-acces.js — CONTRÔLE D'ACCÈS ADMIN, commun à tout le back-office.
 *  version du code : 2026-09-29-d
 *
 *  Module backend ordinaire (.js, PAS .web.js) : aucune de ses fonctions n'est appelable depuis
 *  le navigateur. Seules les web methods du back-office l'importent, et chacune appelle
 *  exigerAdmin() AVANT toute lecture ou écriture.
 *
 *  Cascade (Bruno, 29/09) :
 *   1. rôle « Admin » renvoyé par Wix (propriétaire reconnu) → l’équipe passe ici
 *   2. sinon, rôle membre dédié « admin LPC », reconnu par son ID (le nom est modifiable),
 *      attribué dans le tableau de bord Wix aux personnes autorisées
 *  Plus de liste d'ID de membres (supprimée le 29/09, décision de Bruno). Les co-propriétaires ne sont
 *  PAS reconnus « Admin » par Wix sur le site publié (testé le 27/09) : ils passent par le rôle dédié.
 */

const ID_ROLE_ADMIN = '00000000-0000-0000-0000-000000000001';
const ID_ROLE_ADMIN_LPC = 'REDACTED-ADMIN-ROLE-ID';

const COL_JOURNAL = 'Journal_Admin';

/**
 * Lève Error('acces-refuse') si l'appelant n'est pas admin.
 * Renvoie { id, email, voie } pour la journalisation.
 */
export async function exigerAdmin(action) {
  let member = null;
  try { member = await currentMember.getMember({ fieldsets: ['FULL'] }); } catch (e) { member = null; }
  if (!member || !member._id) return refuser(action, '(anonyme)');

  const id = member._id;
  const email = (member.loginEmail || '').toLowerCase();
  if (member.status && member.status !== 'APPROVED') return refuser(action, email, 'statut ' + member.status);

  let roles = [];
  try { roles = (await currentMember.getRoles()) || []; } catch (e) { roles = []; }
  const accepter = (voie) => {
    // Trace dans Site Monitoring : QUI passe et PAR QUELLE VOIE (contrôle de la cascade).
    console.log('[LPC][Acces] OK', action || '', email, id, voie);
    return { id, email, voie };
  };
  if (roles.some((r) => r && r._id === ID_ROLE_ADMIN)) return accepter('role-admin');
  if (roles.some((r) => r && r._id === ID_ROLE_ADMIN_LPC)) return accepter('role-lpc');

  return refuser(action, email);
}

/**
 * Test SILENCIEUX : vrai/faux, sans erreur, sans journal, sans trace. Sert uniquement à AFFICHER
 * ou non le lien « Admin » (masterPage). Ne protège rien : les web methods appellent exigerAdmin().
 */
export async function estAdminSilencieux() {
  try {
    const member = await currentMember.getMember({ fieldsets: ['FULL'] });
    if (!member || !member._id) { console.log('[LPC][Acces] estAdmin : aucun membre connecté côté serveur'); return false; }
    // (pas de contrôle du statut ici : simple affichage ; exigerAdmin() le contrôle pour le vrai accès)
    const roles = (await currentMember.getRoles()) || [];
    const ok = roles.some((r) => r && (r._id === ID_ROLE_ADMIN || r._id === ID_ROLE_ADMIN_LPC));
    console.log('[LPC][Acces] estAdmin', member._id, 'rôles :', roles.map((r) => r && r._id).join(','), '→', ok);
    return ok;
  } catch (e) { console.warn('[LPC][Acces] estAdmin KO :', e && e.message); return false; }
}

async function refuser(action, qui, motif = '') {
  console.warn('[LPC][Acces] REFUS', action || '', qui, motif);
  await journaliser({ id: '', email: qui }, 'refus:' + (action || ''), '', motif);
  throw new Error('acces-refuse');
}

/**
 * Journal d'audit (collection Journal_Admin, droits « Admin » partout).
 * Ne bloque jamais l'action : si la collection manque, avertissement dans Site Monitoring.
 */
export async function journaliser(admin, action, cible = '', details = '') {
  try {
    await wixData.insert(COL_JOURNAL, {
      title: String(action).slice(0, 100),
      adminId: admin && admin.id ? admin.id : '',
      adminEmail: admin && admin.email ? admin.email : '',
      cible: String(cible || '').slice(0, 100),
      details: String(details || '').slice(0, 2000),
    }, { suppressAuth: true });
  } catch (e) {
    console.warn('[LPC][Acces] journal KO (collection Journal_Admin absente ?)', e && e.message);
  }
}
