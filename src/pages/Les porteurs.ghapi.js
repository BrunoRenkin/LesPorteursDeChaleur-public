// Code de PAGE — « Les porteurs » (page PUBLIQUE, mosaïque des visages), décidé par Bruno le 02/10/2026.
// Éléments : répéteur #mosaique (grille) contenant l'image #photo et le texte #prenom ;
// texte #vide (facultatif), affiché seulement s'il n'y a aucune photo.
// Les données viennent de backend/porteurs-public.web.js : ordre aléatoire à chaque chargement,
// prénom + photo seulement, membres Porteur avec photo ET consentement image.

import { getPorteursMosaique } from 'backend/porteurs-public.web';

const VERSION = '2026-10-02-a';

const EL = { repeteur: '#mosaique', photo: '#photo', prenom: '#prenom', vide: '#vide' };

function el(id) {
  try { const e = $w(id); return e && e.length !== 0 ? e : null; } catch (err) { return null; }
}

$w.onReady(async () => {
  console.log('[LPC][Porteurs] version du code : ' + VERSION);

  const rep = el(EL.repeteur);
  if (!rep) { console.error('[LPC][Porteurs] répéteur introuvable :', EL.repeteur); return; }

  const vide = el(EL.vide);
  if (vide) { try { vide.collapse(); } catch (e) { /* ignore */ } }

  // Dans onItemReady AVANT d'affecter les données.
  rep.onItemReady(($item, d) => {
    try { $item(EL.photo).src = d.photo; $item(EL.photo).alt = d.prenom ? 'Porteur de chaleur : ' + d.prenom : 'Porteur de chaleur'; }
    catch (e) { console.error('[LPC][Porteurs] image :', e && e.message); }
    try { $item(EL.prenom).text = d.prenom || ''; }
    catch (e) { /* #prenom absent : mosaïque sans nom */ }
  });

  let res;
  try { res = await getPorteursMosaique(); }
  catch (e) { console.error('[LPC][Porteurs] appel serveur :', e && e.message); res = { ok: false, items: [] }; }

  const items = (res && res.items) || [];
  console.log('[LPC][Porteurs] photos reçues :', items.length);
  if (items.length === 0) {
    try { rep.collapse(); } catch (e) { /* ignore */ }
    if (vide) { try { vide.expand(); } catch (e) { /* ignore */ } }
    return;
  }
  rep.data = items;
});
