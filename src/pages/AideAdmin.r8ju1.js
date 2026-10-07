// Code de LIGHTBOX « AideAdmin » : fenêtre d'aide de la page /admin (ouverte par page-admin.js).
// version du code : 2026-09-30-a
//
// À créer dans l'éditeur : une lightbox nommée exactement « AideAdmin », avec
//   #titreAide  (texte, facultatif)   #texteAide  (élément TEXTE : l'explication, avec titres, gras et puces)
// La lightbox se ferme par sa croix ; rien à câbler d'autre.
// (Dans une lightbox, les ID sont propres à la lightbox : #texteAide n'entre pas en conflit avec celui de /admin.)
//
// Le contenu arrive en HTML (`html`) : titres en gras, puces, mots-clés en gras. Repli en texte brut (`texte`)
// si l'élément n'accepte pas le HTML.

import wixWindowFrontend from 'wix-window-frontend';

$w.onReady(() => {
  console.log('[LPC][AideAdmin] version du code : 2026-09-30-a');
  const ctx = wixWindowFrontend.lightbox.getContext() || {};
  try { const t = $w('#titreAide'); if (t && t.length !== 0 && ctx.titre) t.text = ctx.titre; } catch (e) { /* facultatif */ }
  let e = null;
  try { e = $w('#texteAide'); } catch (err) { e = null; }
  if (!e) { console.warn('[LPC][AideAdmin] #texteAide introuvable'); return; }
  try {
    if (ctx.html && e.html !== undefined) { e.html = ctx.html; return; }
  } catch (err) { console.warn('[LPC][AideAdmin] HTML refusé, repli sur le texte brut :', err && err.message); }
  try { e.text = ctx.texte || ''; } catch (err) { console.warn('[LPC][AideAdmin] texte non posé :', err && err.message); }
});
