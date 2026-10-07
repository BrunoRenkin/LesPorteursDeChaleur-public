import { Permissions, webMethod } from 'wix-web-module';
import wixData from 'wix-data';
import { currentMember, members } from 'wix-members-backend';
import { elevate } from 'wix-auth';
import { notifyNewSubmission } from 'backend/triggers';

const updateMember = elevate(members.updateMember);   // « Manage Members »

/*
 *  backend/form_1-devenir-porteur.web.js — lecture + écriture de la fiche Membres LPC
 *  pour le formulaire custom « Devenir Porteur de chaleur ».
 *   - getMyMembreData() : options des cases + valeurs à préremplir (existe:false si nouveau)
 *   - submitMembre(p)   : upsert de la fiche (par email du membre connecté)
 *
 *  La détection « nouveau membre » (existe dans Membres Wix, pas dans Membres LPC)
 *  se fait via syncCurrentMemberToCollection() (module members-sync) : action === 'created'.
 */

const COL_MEMBRES = 'Membres';
const COL_CAPACITES = 'Capacites';
const COL_DISPONIBILITES = 'Disponibilites';
const COL_TYPES = 'Membres_Statuts';
const TYPE_PORTEUR = 'Porteur';

const clean = (s, m = 2000) => (typeof s === 'string' ? s.trim().slice(0, m) : '');
const asArr = (x) => (Array.isArray(x) ? x : x == null || x === '' ? [] : [x]);

/**
 * Tri d'affichage des listes de référence : colonne « Ordre » du CMS (clé `ordre` ou `Ordre`),
 * les lignes sans numéro en fin de liste, puis le libellé en départage. Le tri se fait ici
 * plutôt que par `.ascending('ordre')` pour ne pas dépendre de la clé exacte du champ.
 */
function parOrdre(rows, champ) {
  const num = (r) => {
    const v = r ? (r.ordre !== undefined && r.ordre !== null ? r.ordre : r.Ordre) : null;
    const n = Number(v);
    return Number.isFinite(n) ? n : Infinity;
  };
  return [...asArr(rows)].sort((a, b) =>
    num(a) - num(b) || String(a[champ] || '').localeCompare(String(b[champ] || ''), 'fr'));
}
const idsOf = (r) => (r || []).map((x) => (typeof x === 'string' ? x : x && x._id)).filter(Boolean);
const norm = (s) => clean(s, 300).toLowerCase().replace(/…/g, '...').replace(/\s+/g, ' ').trim();
const sansAccents = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * La capacité « Écrire une ou plusieurs cartes » figure-t-elle parmi les libellés ?
 * Détection sur « ecrire » et NON sur « carte » : « Lecture de cartes » contient aussi « carte ».
 */
const ecritDesCartes = (labels) => asArr(labels).some((l) => sansAccents(l).includes('ecrire'));

/** Nombre de résidents voulu : entier de 1 à 99, sinon null (au-delà de 5, c'est l'équipe qui saisit). */
function nbResidents(v) {
  const n = parseInt(String(v == null ? '' : v).trim(), 10);
  return Number.isInteger(n) && n >= 1 && n <= 99 ? n : null;
}

/** Téléphone -> E.164 (Belgique par défaut). null si impossible. */
function toE164(raw) {
  if (typeof raw !== 'string') return null;
  let s = raw.replace(/[\s.\-()/]/g, '');
  if (/^\+\d{8,15}$/.test(s)) return s;
  if (s.startsWith('00')) s = '+' + s.slice(2);
  else if (s.startsWith('0')) s = '+32' + s.slice(1);
  else if (/^\d{8,9}$/.test(s)) s = '+32' + s;
  return /^\+\d{8,15}$/.test(s) ? s : null;
}

/**
 * URI média Wix -> URL statique `https://static.wixstatic.com/media/<id>`.
 * `updateMember` refuse la forme `wix:image://v1/...` pour la photo de profil ;
 * seule l'URL statique fonctionne (limite connue de wix-members-backend).
 * Tolère plusieurs formes : `wix:image://v1/<id>/<nom>#...`, `wix:image://<id>/...`,
 * `image://v1/<id>`, une URL statique déjà bonne, ou un id média nu.
 */
function toStaticImageUrl(u) {
  if (typeof u !== 'string' || !u) return '';
  const base = u.split('#')[0].split('?')[0];
  if (base.startsWith('https://static.wixstatic.com/')) return base;
  if (/^https?:\/\//.test(base)) return base;
  let m = base.match(/(?:wix:)?image:\/\/(?:v1\/)?([^/]+)/i);
  if (m && m[1]) return `https://static.wixstatic.com/media/${m[1]}`;
  m = base.match(/([0-9a-z]{4,}_[0-9a-z]+~mv2\.[a-z0-9]+)/i);
  if (m && m[1]) return `https://static.wixstatic.com/media/${m[1]}`;
  return '';
}

async function currentEmail() {
  const m = await currentMember.getMember({ fieldsets: ['FULL'] });   // FULL requis pour loginEmail
  return m ? (m.loginEmail || '').toLowerCase() : '';
}

/**
 * Options des deux groupes de cases. Les capacités sont filtrées sur le statut
 * « Porteur » (`Capacites.typesDeMembre`) comme F2 et F3 le font pour leur propre
 * statut : sans ce filtre, F1 proposait aussi les souhaits des accueillants (21/09).
 */
async function refOptions(porteurId) {
  const [c, d] = await Promise.all([
    porteurId
      ? wixData.query(COL_CAPACITES).hasSome('typesDeMembre', [porteurId])
          .ascending('capacite').limit(200).find({ suppressAuth: true })
      : wixData.query(COL_CAPACITES).ascending('capacite').limit(200).find({ suppressAuth: true }),
    wixData.query(COL_DISPONIBILITES).ascending('disponibilite').limit(200).find({ suppressAuth: true }),
  ]);
  const capaciteOptions = parOrdre(c.items, 'capacite').map((r) => r.capacite).filter(Boolean);
  console.log('[LPC][F1] capacites proposees :', capaciteOptions.length, porteurId ? '(filtrees sur Porteur)' : '(NON filtrees : statut Porteur introuvable)');
  return {
    capaciteOptions,
    disponibiliteOptions: parOrdre(d.items, 'disponibilite').map((r) => r.disponibilite).filter(Boolean),
  };
}

/** _id de la ligne Membres_Statuts correspondant au libellé donné. */
async function statutId(label) {
  const r = (await wixData.query(COL_TYPES).eq('statut', label).limit(1).find({ suppressAuth: true })).items[0];
  return r ? r._id : null;
}

/** Options des cases + valeurs actuelles du membre (existe:false = rien à préremplir). */
export const getMyMembreData = webMethod(Permissions.SiteMember, async () => {
  const email = await currentEmail();
  const opts = await refOptions(await statutId(TYPE_PORTEUR));
  if (!email) return { existe: false, ...opts };

  const row = (await wixData.query(COL_MEMBRES)
    .eq('email', email)
    .include('capacites', 'disponibilites')
    .limit(1)
    .find({ suppressAuth: true })).items[0];

  if (!row) return { existe: false, ...opts };

  return {
    existe: true,
    prenom: row.prenom || '',
    nom: row.nom || '',
    telephone: row.telephone || '',
    ville: row.localite || '',
    commentaire: row.commentaire || '',
    capacites: (row.capacites || []).map((r) => r && r.capacite).filter(Boolean),
    disponibilites: (row.disponibilites || []).map((r) => r && r.disponibilite).filter(Boolean),
    consentementPhoto: row.consentement_photo === true,
    photoUrl: row.photo || '',
    nbResidentsMax: nbResidents(row.nbResidentsMax),
    ...opts,
  };
});

async function labelsToIds(col, field, values) {
  const vals = asArr(values).map((v) => clean(v, 200)).filter(Boolean);
  if (!vals.length) return [];
  const rows = (await wixData.query(col).limit(200).find({ suppressAuth: true })).items;
  const byNorm = new Map(rows.map((r) => [norm(r[field]), r._id]));
  return vals.map((v) => byNorm.get(norm(v))).filter(Boolean);
}

/**
 * payload = { prenom, nom, telephone, ville, commentaire,
 *             capacites: string[], disponibilites: string[], consentement: boolean,
 *             photoUrl: string,           // URI Wix Media de la photo téléversée (option.)
 *             supprimerPhoto: boolean,    // retire la photo existante (ignoré si photoUrl est fourni)
 *             photoW, photoH: number,     // dimensions renvoyées par uploadFiles()
 *             consentementPhoto: boolean,  // consentement image -> LPC uniquement
 *             nbResidentsMax: number|string|null } // menu #nbResidents (si « Écrire… » est coché)
 *
 *  nbResidentsMax (option A, décidée le 25/09) :
 *    « Écrire… » décochée            -> EFFACÉ (un porteur qui n'écrit pas n'a pas de nombre)
 *    cochée + nombre choisi          -> enregistré (modifiable dans F1)
 *    cochée sans choix dans le menu  -> valeur enregistrée conservée
 */
export const submitMembre = webMethod(Permissions.SiteMember, async (payload = {}) => {
  console.log('[LPC][F1] backend 2026-09-25-c');
  const member = await currentMember.getMember({ fieldsets: ['FULL'] });
  if (!member) return { ok: false, reason: 'not-logged-in' };
  const email = (member.loginEmail || '').toLowerCase();
  if (!email) return { ok: false, reason: 'no-email' };
  if (payload.consentement !== true) return { ok: false, reason: 'consentement-requis' };

  const prenom = clean(payload.prenom, 80);
  const nom = clean(payload.nom, 80);
  const telephone = clean(payload.telephone, 40);
  const ville = clean(payload.ville, 120);
  const commentaire = clean(payload.commentaire, 2000);
  const photoUrl = clean(payload.photoUrl, 2000);
  // Retrait de la photo déjà enregistrée (bouton « supprimer » du formulaire).
  // Un nouveau téléversement l'emporte : on ne supprime que s'il n'y a pas de nouvelle photo.
  const supprimerPhoto = payload.supprimerPhoto === true && !photoUrl;
  const consentementPhoto = payload.consentementPhoto === true;

  // Dimensions de la photo : d'abord celles fournies par uploadFiles(), sinon
  // celles encodées dans le fragment de l'URI (#originWidth / #originHeight).
  const dimFromUri = (photoUrl.match(/originWidth=(\d+).*?originHeight=(\d+)/) || []);
  const photoW = Number(payload.photoW) || Number(dimFromUri[1]) || 0;
  const photoH = Number(payload.photoH) || Number(dimFromUri[2]) || 0;

  const ecrit = ecritDesCartes(payload.capacites);
  const nbVoulu = nbResidents(payload.nbResidentsMax);

  const capIds = await labelsToIds(COL_CAPACITES, 'capacite', payload.capacites);
  const dispoIds = await labelsToIds(COL_DISPONIBILITES, 'disponibilite', payload.disponibilites);

  const porteur = (await wixData.query(COL_TYPES).eq('statut', TYPE_PORTEUR).limit(1).find({ suppressAuth: true })).items[0];
  const porteurId = porteur && porteur._id;

  const existing = (await wixData.query(COL_MEMBRES)
    .eq('email', email).include('type').limit(1).find({ suppressAuth: true })).items[0];

  // Statuts AVANT toute modification : `p` ci-dessous est le meme objet que `existing`,
  // donc `delete p.type` viderait cette liste si on la lisait apres (bug corrige le 20/09 :
  // un envoi de F2 effacait le statut Porteur).
  const typeIdsAvant = idsOf(existing && existing.type);

  // « Nouveau » vs « mise à jour » : le membre était-il DÉJÀ Porteur avant cet
  // envoi ? (la fiche Membres existe presque toujours déjà, créée par
  // members-sync au chargement de la page — on ne peut donc pas se fier à sa
  // simple existence.)
  const dejaPorteur = Boolean(porteurId) && typeIdsAvant.includes(porteurId);

  let rowId;
  if (existing) {
    const p = { ...existing };   // copie : ne jamais muter `existing`
    p.prenom = prenom || p.prenom;
    p.nom = nom || p.nom;
    p.telephone = telephone || p.telephone;
    p.localite = ville || p.localite;
    p.commentaire = commentaire;
    p.consentement_rgpd = true;
    p.consentement_photo = consentementPhoto;   // état du formulaire = vérité
    if (photoUrl) p.photo = photoUrl;            // nouvelle photo -> écrase ; sinon on garde
    else if (supprimerPhoto) p.photo = '';       // retrait demandé
    if (!ecrit) p.nbResidentsMax = null;                         // « Écrire » décochée : effacé (option A, 25/09)
    else if (nbVoulu != null) p.nbResidentsMax = nbVoulu;        // menu affiché et choisi ; sinon intact
    p.actif = true;
    delete p.type; delete p.capacites; delete p.disponibilites;   // via replaceReferences
    rowId = (await wixData.update(COL_MEMBRES, p, { suppressAuth: true }))._id;
    console.log('[LPC][F1] fiche mise à jour', rowId);
  } else {
    rowId = (await wixData.insert(COL_MEMBRES, {
      email, prenom, nom, telephone, localite: ville, commentaire,
      consentement_rgpd: true, consentement_photo: consentementPhoto,
      abonnement_newsletter: false, actif: true,
      ...(photoUrl ? { photo: photoUrl } : {}),
      ...(ecrit && nbVoulu != null ? { nbResidentsMax: nbVoulu } : {}),
    }, { suppressAuth: true }))._id;
    console.log('[LPC][F1] fiche créée', rowId);
  }

  // type -> AJOUT « Porteur » ; capacités / disponibilités -> REMPLACEMENT
  const typeTarget = Array.from(new Set([...typeIdsAvant, ...(porteurId ? [porteurId] : [])]));
  if (typeTarget.length) {
    await wixData.replaceReferences(COL_MEMBRES, 'type', rowId, typeTarget, { suppressAuth: true });
  }
  await wixData.replaceReferences(COL_MEMBRES, 'capacites', rowId, capIds, { suppressAuth: true });
  await wixData.replaceReferences(COL_MEMBRES, 'disponibilites', rowId, dispoIds, { suppressAuth: true });
  console.log('[LPC][F1] refs', { type: typeTarget, capacites: capIds, disponibilites: dispoIds });

  // Pousser prénom / nom / téléphone (Contact) + photo (profil) vers le membre Wix.
  // (localité reste dans Membres LPC uniquement — l'adresse Contact est trop rigide.)
  // Le consentement image N'EST PAS poussé vers Wix : il vit dans Membres LPC seul.
  try {
    const cd = {};
    if (prenom) cd.firstName = prenom;
    if (nom) cd.lastName = nom;
    const tel164 = toE164(telephone);
    if (tel164) cd.phones = [tel164];

    const upd = {};
    if (Object.keys(cd).length) upd.contactDetails = cd;

    // Photo de profil : clé `profilePhoto` + URL STATIQUE obligatoire + dimensions.
    const staticPhoto = toStaticImageUrl(photoUrl);
    console.log('[LPC][F1][photo] reçue =', JSON.stringify(photoUrl), '| static =', JSON.stringify(staticPhoto), '|', photoW, 'x', photoH);
    if (staticPhoto) {
      // Dimensions TOUJOURS fournies : un profilePhoto renvoyé avec width/height à 0
      // n'est pas affiché par la barre de connexion Wix (constaté le 21/09).
      const pp = {
        url: staticPhoto,
        width: photoW > 0 ? photoW : 400,
        height: photoH > 0 ? photoH : 400,
      };
      upd.profile = { profilePhoto: pp };
    } else if (supprimerPhoto) {
      upd.profile = { profilePhoto: null };   // retire aussi la photo du profil Wix
      console.log('[LPC][F1][photo] suppression demandée');
    }

    if (Object.keys(upd).length) {
      const r = await updateMember(member._id, upd);
      console.log('[LPC][F1][photo] updateMember OK | profile renvoyé =', JSON.stringify(r && r.profile));
    } else {
      console.log('[LPC][F1][photo] rien à pousser vers Wix (upd vide)');
    }
  } catch (e) {
    console.warn('[LPC][F1][photo] updateMember (Wix) KO:', e && (e.stack || e.message || e));
  }

  // Alerte interne (automation Wix « Velo code trigger »). Best-effort.
  const capStr = (payload.capacites || []).join(', ');
  const dispoStr = (payload.disponibilites || []).join(', ');
  console.log('[LPC][F1] -> appel notifyNewSubmission', email);
  let notify = { ok: false, cause: 'non appelé' };
  try {
    notify = (await notifyNewSubmission({
      formName: dejaPorteur ? 'Porteur (mise à jour)' : 'Nouveau porteur',
      prenom, nom, email, telephone, localite: ville,
      extra1: capStr ? `Capacités : ${capStr}` : '',
      extra2: dispoStr ? `Disponibilités : ${dispoStr}` : '',
      extra3: [commentaire ? `Commentaire : ${commentaire}` : '',
        ecrit && nbVoulu != null ? `Résidents souhaités : ${nbVoulu}` : ''].filter(Boolean).join(' · '),
      ficheUrl: `https://www.wix.com/dashboard/REDACTED-WIX-SITE-ID/database/data/Membres/${rowId}`,
    })) || notify;
    console.log('[LPC][F1] alerte interne :', JSON.stringify(notify));
  } catch (e) {
    console.warn('[LPC][F1] notifyNewSubmission KO:', e && (e.stack || e.message || e));
    notify = { ok: false, cause: String((e && (e.message || e)) || 'exception') };
  }

  return { ok: true, id: rowId, notify };
});
