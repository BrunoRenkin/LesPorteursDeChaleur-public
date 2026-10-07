import { customTrigger } from '@wix/automations';
import { auth } from '@wix/essentials';

/*
 * backend/triggers.js — déclenche l'automation Wix « Velo code trigger » qui
 * envoie l'alerte interne à chaque nouvelle soumission de formulaire.
 *
 * Une SEULE automation pour F1/F2/F3 : les champs communs (prénom, nom, e-mail,
 * téléphone, localité) sont typés ; le contenu propre à chaque formulaire est
 * composé par l'appelant dans extra1 / extra2 / extra3 (une ligne chacun).
 *
 * Prérequis : packages @wix/automations et @wix/essentials installés
 * (Code → Packages & Apps → npm).
 *
 * Invocation = customTrigger.runTrigger (cf. snippet « Show code » du trigger).
 */

const TRIGGER_ID = 'REDACTED-AUTOMATION-TRIGGER-ID';

// Adresse de l'alerte interne. L'action « Envoyer un e-mail » de l'automation ne sait pas
// adresser une boîte fixe : le destinataire doit lui arriver par le payload, d'où ce champ.
// Un appelant peut le surcharger (ex. futur e-mail de confirmation à l'inscrit).
const DESTINATAIRE_PAR_DEFAUT = 'lesporteursdechaleur@gmail.com';

// L'action « Envoyer un e-mail » n'envoie pas à une adresse mais à un CONTACT : sans `contactId`
// dans le payload, elle échoue avec « nombre de destinataires = 0 » (constaté le 20/09).
// Contact « Les Porteurs de Chaleur » (lesporteursdechaleur@gmail.com) :
const CONTACT_ALERTE = 'REDACTED-CONTACT-ID';

const runTrigger = auth.elevate(customTrigger.runTrigger);

/** Date/heure locale Belgique « JJ/MM/AAAA HH:MM » ; repli ISO si l'ICU manque. */
function frDateTime(d = new Date()) {
  try {
    return d.toLocaleString('fr-BE', {
      timeZone: 'Europe/Brussels',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).replace(',', '');
  } catch (e) {
    return d.toISOString();
  }
}

const s = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * Alerte interne « nouvelle soumission ». Best-effort : ne jette jamais.
 * @param {{
 *   contactId?: string,            // contact destinataire (défaut : contact de l'alerte interne) — INDISPENSABLE à l'action e-mail
 *   destinataire?: string,         // défaut : lesporteursdechaleur@gmail.com (champ « destinataire » côté automation)
 *   formName: string,              // « Nouveau porteur » | « Accueillir des Porteurs de chaleur » | « Devenir partenaire »
 *                                  // (+ « (mise à jour) » si la personne revient) — c'est CE texte qui s'affiche dans l'e-mail d'alerte
 *   prenom?: string, nom?: string, email?: string, telephone?: string, localite?: string,
 *   extra1?: string, extra2?: string, extra3?: string,  // « Libellé : valeur »
 *   ficheUrl?: string
 * }} p
 * @returns {Promise<{ok: boolean}>}
 */
export async function notifyNewSubmission(p = {}) {
  const payload = {
    contactId: s(p.contactId, 60) || CONTACT_ALERTE,
    destinataire: s(p.destinataire, 160) || DESTINATAIRE_PAR_DEFAUT,
    formName: s(p.formName, 60) || 'Formulaire',
    submittedAt: frDateTime(),
    prenom: s(p.prenom, 80),
    nom: s(p.nom, 80),
    email: s(p.email, 160),
    telephone: s(p.telephone, 40),
    localite: s(p.localite, 120),
    extra1: s(p.extra1),
    extra2: s(p.extra2),
    extra3: s(p.extra3),
    ficheUrl: s(p.ficheUrl, 400),
  };

  console.log('[LPC][notify] appel', payload.formName, '-> contact', payload.contactId, '/', payload.destinataire);

  try {
    await runTrigger({ triggerId: TRIGGER_ID, payload });
    console.log('[LPC][notify] runTrigger OK', payload.formName, '-> contact', payload.contactId, '/', payload.destinataire);
    return { ok: true, destinataire: payload.destinataire, contactId: payload.contactId };
  } catch (e) {
    // 404 = automation absente ou désactivée ; 428 = schéma du payload non appliqué (Save Structure + Apply + republier)
    const cause = (e && (e.message || String(e))) || 'inconnue';
    console.warn('[LPC][notify] runTrigger KO:', cause);
    return { ok: false, cause: String(cause).slice(0, 300), destinataire: payload.destinataire };
  }
}
