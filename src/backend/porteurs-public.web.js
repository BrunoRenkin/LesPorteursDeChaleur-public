import { Permissions, webMethod } from 'wix-web-module';
import wixData from 'wix-data';

/*
 *  backend/porteurs-public.web.js — page PUBLIQUE « Les porteurs » (mosaïque des visages).
 *  version du code : 2026-10-02-b  (-b : contrôle strict de la photo en JS, isNotEmpty() laissait passer un membre sans photo)
 *    getPorteursMosaique()   photos + prénoms des membres Porteur ayant une photo ET le consentement image,
 *                            dans un ORDRE ALÉATOIRE à chaque appel
 *
 *  SÉCURITÉ / RGPD (Bruno, 02/10 : prénom seul)
 *   - Appelable par tout visiteur (Permissions.Anyone) : la méthode ne renvoie QUE { photo, prenom }.
 *     Jamais d'identifiant de fiche (les _id renvoyés sont des numéros d'ordre), jamais d'e-mail ni d'autre champ.
 *   - Lecture en direct : décocher le consentement image (ou le retirer en admin) fait disparaître la photo
 *     au chargement suivant.
 *   - suppressAuth : `Membres` est en Admin only.
 */

const VERSION = '2026-10-02-b';
const STATUT = 'porteur';
const LIMITE = 1000;

const asArr = (x) => (Array.isArray(x) ? x : x == null || x === '' ? [] : [x]);
const sansAccents = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Mélange de Fisher-Yates (copie, ne modifie pas la liste d'origine). */
function melanger(liste) {
  const a = liste.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const getPorteursMosaique = webMethod(Permissions.Anyone, async () => {
  try {
    const rows = (await wixData.query('Membres')
      .eq('consentement_photo', true)
      .isNotEmpty('photo')
      .include('type')
      .limit(LIMITE)
      .find({ suppressAuth: true })).items;

    // Contrôle STRICT en JS : isNotEmpty() n'est pas fiable sur un champ Image (membre sans photo affiché, 02/10).
    const photoValide = (p) => typeof p === 'string' && /^(wix:image:\/\/|wix:\/\/|https?:\/\/)\S{8,}/.test(p.trim());
    const sansPhoto = rows.filter((r) => r.consentement_photo === true && !photoValide(r.photo));
    if (sansPhoto.length) {
      console.log('[LPC][porteurs-public] écartés (photo invalide) :',
        sansPhoto.map((r) => r._id + ' => ' + JSON.stringify(r.photo)).join(' | '));
    }

    const porteurs = rows.filter((r) => photoValide(r.photo)
      && r.consentement_photo === true
      && asArr(r.type).some((t) => t && sansAccents(t.statut) === STATUT));
    const items = melanger(porteurs).map((r, i) => ({
      _id: 'p' + i,                                  // numéro d'ordre : jamais l'identifiant du membre
      photo: r.photo.trim(),
      prenom: String(r.prenom || '').trim().slice(0, 60),
    }));
    console.log('[LPC][porteurs-public] version', VERSION, '· éligibles :', items.length, '/ lus :', rows.length);
    return { ok: true, items };
  } catch (e) {
    console.error('[LPC][porteurs-public] erreur :', e && e.message);
    return { ok: false, items: [] };
  }
});
