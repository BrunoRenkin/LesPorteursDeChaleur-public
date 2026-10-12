// Code de PAGE : Accueil (/).
// 12/10 : compteurs publics (porteurs, institutions, résidents) sous les boutons du hero, valeurs RÉELLES du CMS.
// Éléments TEXTE à créer dans l'éditeur (le chiffre seul ; le libellé « porteurs », « institutions »… est un texte à côté) :
//   #compteurPorteurs  #compteurInstitutions  #compteurResidents
// Un élément absent est ignoré (avertissement en console) ; en cas d'échec du serveur, le texte de l'éditeur reste affiché.

import { getCompteursPublics } from 'backend/porteurs-public.web';

const VERSION = '2026-10-12-a';
const COMPTEURS = [
  { cle: 'porteurs', id: '#compteurPorteurs' },
  { cle: 'institutions', id: '#compteurInstitutions' },
  { cle: 'residents', id: '#compteurResidents' },
];

/** 1234 -> « 1.234 » (point comme séparateur de milliers). */
const formater = (n) => String(Number(n) || 0).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

$w.onReady(async () => {
  console.log('[LPC][Accueil] version du code :', VERSION);
  try {
    const r = await getCompteursPublics();
    if (!r || r.ok !== true) { console.warn('[LPC][Accueil] compteurs indisponibles', r); return; }
    COMPTEURS.forEach((c) => {
      let e = null;
      try { e = $w(c.id); } catch (err) { e = null; }
      if (!e || typeof e.type !== 'string') { console.warn('[LPC][Accueil] ' + c.id + ' introuvable : compteur non affiché (à créer dans l’éditeur)'); return; }
      try { e.text = formater(r[c.cle]); } catch (err) { console.warn('[LPC][Accueil] ' + c.id + ' : écriture KO', err && err.message); }
    });
    console.log('[LPC][Accueil] compteurs', { porteurs: r.porteurs, institutions: r.institutions, residents: r.residents });
  } catch (e) {
    console.error('[LPC][Accueil] getCompteursPublics KO :', e);
  }
});
