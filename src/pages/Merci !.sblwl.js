// Code de PAGE — « Merci » (/merci), page de remerciement commune F1/F2/F3.
// Chaque formulaire redirige vers /merci?f=porteur | accueillant | partenaire ;
// /accueillir-des-porteurs-mes-residents (suite de F2) vers /merci?f=mes-residents (26/09) ;
// /mes-residents (onglet du profil) vers /merci?f=mon-profil-mes-residents (26/09) ;
// /mon-profil et /mon-organisme vers /merci?f=porteur-mon-profil | porteur-mon-organisation (26/09), même message ;
// le texte de #texteMerci est adapté. Sans paramètre (ou valeur inconnue),
// le texte saisi dans l'éditeur reste affiché.
// Textes : validés par Bruno le 24/09/2026 ; ceux du 26/09 (mon-profil, résidents) = PROPOSITIONS à valider.

import wixLocation from 'wix-location';

const MISE_A_JOUR = 'Merci. Vos informations ont bien été mises à jour.';

const TEXTES = {
  porteur: 'Merci. Vous êtes désormais Porteur de chaleur. Votre envie de donner un peu de votre temps vient de rejoindre le mouvement. l’équipe reviendra vers vous très vite pour transformer cette envie en geste concret.',
  accueillant: "Merci pour votre confiance. Nous reviendrons vers vous prochainement afin d'imaginer ensemble comment un Porteur de chaleur pourrait venir à votre rencontre.",
  'porteur-mon-profil': MISE_A_JOUR,
  'porteur-mon-organisation': MISE_A_JOUR,
  // PROPOSITIONS du 26/09, à valider par Bruno
  'mes-residents': 'Merci pour votre confiance. Votre lieu d’accueil et la liste de vos résidents ont bien été enregistrés. Nous reviendrons vers vous prochainement afin d’imaginer ensemble comment un Porteur de chaleur pourrait venir à votre rencontre. Vous pourrez compléter cette liste à tout moment depuis l’onglet « Résidents » de votre profil.',
  'mon-profil-mes-residents': 'Merci. La liste de vos résidents a bien été mise à jour.',
  partenaire: 'Merci de vouloir faire grandir Les Porteurs de chaleur avec nous. Votre proposition de partenariat vient de nous parvenir. Nous reviendrons vers vous prochainement pour découvrir comment nous pourrions ensemble, créer davantage de liens et faire circuler un peu plus de chaleur.',
};

// Wix renomme parfois les ID (ou n'enregistre pas celui saisi) : on essaie plusieurs candidats,
// puis, en dernier recours, le seul texte dont le contenu est le « . » laissé dans l'éditeur.
const CANDIDATS = ['#texteMerci', '#texteMerci1', '#texteMerci2', '#text1', '#texte'];
const ATTENTE = '.';

function trouverTexte() {
  for (const id of CANDIDATS) {
    try { const e = $w(id); if (e && e.length !== 0 && 'text' in e) return { el: e, via: id }; } catch (err) { /* suivant */ }
  }
  for (const type of ['Text', 'RichText']) {
    try {
      const vus = $w(type);
      const attente = [];
      vus.forEach((e) => { try { if (String(e.text || '').replace(/<[^>]+>/g, '').trim() === ATTENTE) attente.push(e); } catch (err) { /* ignore */ } });
      if (attente.length === 1) return { el: attente[0], via: `contenu "${ATTENTE}" (${type}, id ${attente[0].id})` };
      if (attente.length > 1) console.warn('[LPC][Merci] plusieurs textes valent "." :', attente.map((e) => e.id).join(' '));
    } catch (err) { /* type non pris en charge */ }
  }
  return null;
}

$w.onReady(() => {
  console.log('[LPC][Merci] version du code : 2026-09-26-d');
  const f = String(wixLocation.query.f || '').toLowerCase();
  console.log('[LPC][Merci] URL reçue :', wixLocation.url);
  const texte = TEXTES[f];
  const cible = trouverTexte();
  console.log('[LPC][Merci] paramètre f =', JSON.stringify(f), '· texte trouvé :', Boolean(texte),
    '· élément :', cible ? cible.via : 'INTROUVABLE');
  if (!texte || !cible) return;
  try {
    cible.el.text = texte;
  } catch (e) {
    console.error('[LPC][Merci] écriture impossible :', e && e.message);
  }
});
