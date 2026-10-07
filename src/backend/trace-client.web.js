import { Permissions, webMethod } from 'wix-web-module';
import { currentMember } from 'wix-members-backend';

/*
 *  backend/trace-client.web.js — remonte dans Site Monitoring ce qui se passe dans le NAVIGATEUR des membres.
 *  version du code : 2026-10-03-a
 *
 *  Pourquoi (03/10/2026) : les erreurs de téléversement de photo (uploadFiles, type ou taille de fichier refusés, clic sur
 *  « Retirer ») ne se produisent que dans le navigateur du membre : la console de Bruno ne les voit pas et le backend
 *  n'est jamais appelé quand l'envoi échoue avant. Les journaux de Site Monitoring restaient donc vides.
 *  Ici : la page appelle `tracerClient` à chaque étape de la photo ; le backend écrit une ligne `[LPC][Trace]` dans
 *  Site Monitoring (Tableau de bord → Site Monitoring → Journaux du site, filtre « [LPC][Trace] »).
 *
 *  DONNÉES : l'identifiant du membre Wix (pas l'e-mail), la page, l'étape, le type et la taille du fichier, le message
 *  d'erreur. JAMAIS le nom du fichier, ni l'adresse de la photo.
 *  Ne lève jamais d'erreur vers la page : une trace perdue ne doit rien bloquer.
 */

const MAX = 300;
const NIVEAUX = ['info', 'warn', 'error'];
const txt = (v, n = MAX) => String(v == null ? '' : v).replace(/[\r\n]+/g, ' ').slice(0, n);

export const tracerClient = webMethod(Permissions.SiteMember, async (t = {}) => {
  try {
    let id = '?';
    try { const m = await currentMember.getMember(); id = (m && m._id) || '?'; } catch (e) { /* ignoré */ }
    const niveau = NIVEAUX.includes(t.niveau) ? t.niveau : 'info';
    const ligne = '[LPC][Trace] ' + txt(t.page, 30) + ' · ' + txt(t.etape, 60) + ' · membre ' + id
      + (t.detail ? ' · ' + txt(typeof t.detail === 'string' ? t.detail : JSON.stringify(t.detail), 500) : '');
    if (niveau === 'error') console.error(ligne);
    else if (niveau === 'warn') console.warn(ligne);
    else console.log(ligne);
    return { ok: true };
  } catch (e) {
    return { ok: false };
  }
});
