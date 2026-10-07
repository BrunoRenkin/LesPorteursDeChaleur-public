import { Permissions, webMethod } from 'wix-web-module';
import { currentMember } from 'wix-members-backend';

/*
 *  backend/admin-diagnostic.web.js — ÉTAPE 0 du back-office, À SUPPRIMER APRÈS LES TESTS.
 *  version du code : 2026-09-27-a
 *
 *  But : vérifier sur le site PUBLIÉ qui Wix reconnaît comme « admin » avant d'écrire le back-office.
 *    - quiSuisJe()   : Anyone. Ne renvoie QUE les informations de l'appelant lui-même (ses rôles, son
 *                      e-mail de connexion s'il est membre). Aucune donnée d'un tiers, aucun suppressAuth.
 *    - testAdmin()   : Admin. Wix refuse l'appel à quiconque n'est ni propriétaire ni collaborateur.
 *
 *  Rôle « Admin » documenté par Wix (currentMember.getRoles) : _id 00000000-0000-0000-0000-000000000001,
 *  ajouté pour « le propriétaire du site ou un collaborateur disposant de permissions admin ».
 */

const ID_ROLE_ADMIN = '00000000-0000-0000-0000-000000000001';

export const quiSuisJe = webMethod(Permissions.Anyone, async () => {
  const out = { membre: null, roles: [], estAdminWix: false, erreurRoles: null };
  try {
    const m = await currentMember.getMember({ fieldsets: ['FULL'] });
    out.membre = m ? { id: m._id, loginEmail: m.loginEmail || '' } : null;
  } catch (e) { out.membre = 'erreur : ' + (e && e.message); }
  try {
    const roles = await currentMember.getRoles();
    out.roles = (roles || []).map((r) => ({ id: r._id, titre: r.title }));
    out.estAdminWix = out.roles.some((r) => r.id === ID_ROLE_ADMIN);
  } catch (e) { out.erreurRoles = String(e && e.message); }
  console.log('[LPC][Diag] quiSuisJe', JSON.stringify(out));
  return out;
});

export const testAdmin = webMethod(Permissions.Admin, async () => {
  console.log('[LPC][Diag] testAdmin accepté par Wix');
  return 'accepte';
});
