import { Permissions, webMethod } from 'wix-web-module';
import wixData from 'wix-data';
import { currentMember, authorization } from 'wix-members-backend';
import { elevate } from 'wix-auth';
import { contacts } from 'wix-crm-backend';

/*
 * ────────────────────────────────────────────────────────────────────────────
 *  backend/members-sync.web.js — synchronise le membre Wix -> collection Membres.
 *  Appelé au chargement des pages Membres (page F1, /mon-profil, ...).
 *
 *  Champs PARTAGÉS (le membre Wix fait foi : écrasement quand Wix a une valeur) :
 *    prénom, nom, téléphone, fonction (jobTitle), date de naissance (birthdate),
 *    adresse / cp / localité / région / pays, photo (photo de profil).
 *  Champs COLLECTION SEULE (jamais touchés ici) :
 *    type, capacités, disponibilités, consentements, actif, commentaire, etc.
 *  Langue du contact Wix : forcée à « fr-be » (26/09 : les comptes étaient créés en anglais).
 *  Version 2026-09-26-b.
 * ────────────────────────────────────────────────────────────────────────────
 */

const COL = 'Membres';

// Rôle « Membre Normal » du nouveau site.
const ROLE_MEMBRE_NORMAL = 'REDACTED-MEMBER-ROLE-ID';
const ROLE_LOOKS_VALID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ROLE_MEMBRE_NORMAL);
const assignRole = elevate(authorization.assignRole);

const LANGUE = 'fr-be';

/** Passe la langue (locale) du contact Wix à fr-be si elle est différente. Jamais bloquant. */
async function forcerLangue(contactId) {
  if (!contactId) return;
  try {
    const contact = await contacts.getContact(contactId, { suppressAuth: true });
    const actuelle = String((contact && contact.info && contact.info.locale) || '').toLowerCase();
    if (actuelle === LANGUE) return;
    await contacts.updateContact({ contactId, revision: contact.revision }, { locale: LANGUE }, { suppressAuth: true });
    console.log(`[LPC][sync] langue du contact : "${actuelle || '(vide)'}" -> ${LANGUE}`);
  } catch (e) {
    console.warn('[LPC][sync] langue du contact KO:', e && (e.message || e));
  }
}

function computeProfileComplete(row) {
  return Boolean(row.prenom && row.nom);
}

/** Extrait les champs partagés depuis le membre Wix (Contact + profil).
 *  L'ADRESSE n'est PAS synchronisée : décision 07/09, l'adresse vit uniquement
 *  dans la collection Membres (le champ Adresse Wix est trop rigide). */
function fromWixMember(member) {
  const c = member.contactDetails || {};
  const phone = (Array.isArray(c.phones) && c.phones[0] && (c.phones[0].phone || c.phones[0])) || '';
  const photoObj = member.profile && member.profile.photo;
  const photoUrl = (photoObj && (photoObj.url || (typeof photoObj === 'string' ? photoObj : ''))) || '';

  const out = {
    prenom: c.firstName || '',
    nom: c.lastName || '',
    telephone: phone || '',
    fonction: c.jobTitle || '',
    entreprise: c.company || '',        // « flat » : 1 personne = 1 entreprise
    photo: photoUrl || '',
  };

  if (c.birthdate) {
    const d = new Date(c.birthdate);
    if (!Number.isNaN(d.getTime())) out.date_naissance = d;
  }
  return out;
}

/**
 * Upsert de la fiche Membres à partir du compte Wix connecté (clé : email).
 * Retour : { ok, action:'created'|'updated', id, profileComplete } | { ok:false, reason }
 */
export const syncCurrentMemberToCollection = webMethod(Permissions.SiteMember, async () => {
  const member = await currentMember.getMember({ fieldsets: ['FULL'] });
  if (!member) return { ok: false, reason: 'not-logged-in' };

  const email = (member.loginEmail || '').toLowerCase();
  if (!email) return { ok: false, reason: 'no-email' };

  const wix = fromWixMember(member);
  const existing = (await wixData.query(COL).eq('email', email).limit(1).find({ suppressAuth: true })).items[0];

  let row;
  let action;
  if (existing) {
    row = existing;
    action = 'updated';
  } else {
    row = { email, consentement_rgpd: true, abonnement_newsletter: false, actif: true };
    action = 'created';
  }

  // Champs partagés : le membre Wix fait foi (on n'écrase pas avec du vide).
  for (const [k, v] of Object.entries(wix)) {
    if (v !== undefined && v !== '' && v !== null) row[k] = v;
  }
  row.wixMemberId = member._id;
  row.verified = member.loginEmailVerified === true;
  if (!row._owner) row._owner = member._id;

  if (action === 'created') {
    row = await wixData.insert(COL, row, { suppressAuth: true });
    if (ROLE_LOOKS_VALID) {
      try {
        await assignRole(ROLE_MEMBRE_NORMAL, member._id);
      } catch (e) {
        console.error('[LPC][sync] assignRole KO:', e && e.message);
      }
    }
  } else {
    row = await wixData.update(COL, row, { suppressAuth: true });
  }

  await forcerLangue(member.contactId || member._id);

  console.log(`[LPC][sync] fiche ${action}`, row._id);
  return { ok: true, action, id: row._id, profileComplete: computeProfileComplete(row) };
});
