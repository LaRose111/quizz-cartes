// engine.js — génération des questions (repris du quizz d'origine, rendu indépendant
// de l'interface pour servir à la fois l'espace équipe et l'espace manager).
(function(){
'use strict';

const POINTS = 1;
const CAP_MENU = 50, CAP_ALLERGEN = 12, CAP_VINS = 50;
const ALLERGEN_GRID_SIZE = 4, ALLERGEN_GRID_MAX_COLS = 6;

function shuffle(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function euro(p){
  if(p===null||p===undefined) return null;
  let v = Math.round(p*100)/100;
  if(Number.isInteger(v)) return v + '€';
  let s = v.toFixed(2);
  if(s.endsWith('0')) s = s.slice(0,-1);
  return s.replace('.', ',') + '€';
}
function strHash(str){
  let h = 0;
  const s = str || '';
  for(let i=0;i<s.length;i++){ h = (Math.imul(31,h) + s.charCodeAt(i)) | 0; }
  return (h>>>0).toString(36);
}
// Clé courte d'une info (stockée dans la progression)
function factKey(factId){ return strHash(factId); }

function escapeHtml(s){
  return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ---------- correction des réponses libres ----------
function normalize(str){
  return (str||'').toLowerCase()
    .replace(/œ/g,'oe').replace(/æ/g,'ae')
    .normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/[^a-z0-9\s]/g,' ')
    .replace(/\s+/g,' ').trim();
}
const STOPWORDS = new Set([
  'de','du','des','la','le','les','l','un','une','et','a','au','aux','en',
  'sur','sous','avec','sans','pour','par','ou','dans','chez','ce','cet','cette','ces',
  'son','sa','ses','the','of',
  'di','del','dei','della','delle','dello','degli','alla','allo','ai','agli','e','con','da',
  'c','d','j','m','n','qu','s','t'
]);
const OPTIONAL_WORDS = new Set([
  'dop','igp','aop','doc','docg','igt','stg','aoc',
  'mois','an','ans','jour','jours','semaine','semaines',
  'g','gr','grammes','kg','cl','ml','l','cm','mm'
]);
const WORD_ALIASES = { 'expresso':'espresso' };
function canonWord(w){
  if(w.length>3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0,-1);
  return WORD_ALIASES[w] || w;
}
function keywordsOf(str){
  return normalize(str).split(' ')
    .filter(w=>w && !STOPWORDS.has(w) && !OPTIONAL_WORDS.has(w) && !/^\d+$/.test(w))
    .map(canonWord);
}
function fuzzyMatch(userInput, correct){
  const u = normalize(userInput);
  if(!u) return false;
  const cKeywords = keywordsOf(correct);
  const uWords = new Set(u.split(' ').filter(Boolean).map(canonWord));
  if(cKeywords.length===0) return u===normalize(correct);
  return cKeywords.every(w=>uWords.has(w));
}

// ---------- périmètre ----------
function getScopeItems(DATA, restaurant){
  const one = r => ({
    dishes: (DATA[r].dishes||[]).map(d=>({...d,_origin:r})),
    drinks: (DATA[r].drinks||[]).map(d=>({...d,_origin:r})),
    wines: (DATA[r].wines||[]).map(d=>({...d,_origin:r})),
    vf: ((DATA.vraifaux||{})[r]||[]).map(v=>({...v,_origin:r})),
  });
  if(restaurant==='mixed'){
    const a = one('donna'), b = one('mamiefada');
    return { dishes:a.dishes.concat(b.dishes), drinks:a.drinks.concat(b.drinks), wines:a.wines.concat(b.wines), vf:a.vf.concat(b.vf) };
  }
  return one(restaurant);
}

// ---------- générateurs ----------
function buildQCMSet(items, field, fieldLabel, formatter){
  const fmt = v => formatter ? formatter(v) : v;
  const withField = items.filter(it => it[field]!==null && it[field]!==undefined && it[field]!=='' && it[field]!=='—');
  if(withField.length < 4) return [];
  const out = [];
  withField.forEach(target => {
    const correctVal = fmt(target[field]);
    const distractVals = shuffle([...new Set(withField.filter(it => it!==target && fmt(it[field])!==correctVal).map(it=>fmt(it[field])))]).slice(0,3);
    if(distractVals.length < 3) return;
    out.push({
      type:'qcm', origin: target._origin,
      kicker: (target._kind==='drink'?'Boisson':'Plat') + ' · ' + (target.section||target.cat),
      text: `${fieldLabel} de « ${target.name} » ?`,
      options: shuffle([correctVal, ...distractVals]), correct: correctVal,
      explain: `${target.name} — ${fieldLabel.toLowerCase()} : ${correctVal}`,
      points: POINTS,
      factId: `qcm|${field}|${target._origin}|${target.section||target.cat}|${target.name}`,
    });
  });
  return out;
}
function buildVFSet(vfPool){
  return vfPool.map(item => ({
    type:'vf', origin:item._origin, kicker:'Règlement & Mise en place',
    text:item.statement, correct: item.isTrue ? 'Vrai':'Faux',
    explain: item.isTrue ? "C'est vrai." : "C'est faux.",
    points: POINTS,
    factId: `vf|${item._origin}|${strHash(item.statement)}`,
  }));
}
function buildFillSet(items){
  const out = [];
  items.forEach(target => {
    [['sauce',"la sauce / l'assaisonnement"], ['accomp',"l'accompagnement"]].forEach(([field,label])=>{
      const val = target[field];
      if(val && val!=='—' && val.length<=42){
        out.push({
          type:'fill', origin:target._origin, kicker:(target._kind==='drink'?'Boisson':'Plat')+' · '+(target.section||target.cat),
          text:`Complète ${label} de « ${target.name} ».`,
          correct: val, explain: `${target.name} — ${label} : ${val}`,
          points: POINTS,
          factId: `fill|${field}|${target._origin}|${target.section||target.cat}|${target.name}`,
        });
      }
    });
  });
  return out;
}
function chunkList(list, size){
  const chunks = [];
  for(let i=0;i<list.length;i+=size) chunks.push(list.slice(i,i+size));
  if(chunks.length>=2 && chunks[chunks.length-1].length===1){
    chunks[chunks.length-2] = chunks[chunks.length-2].concat(chunks.pop());
  }
  return chunks;
}
const SECTION_COURSE = {
  'Antipasti':'Entrée', 'Primi Piatti':'Plat', 'Secondi Piatti':'Plat', 'Insalate e Lasagne':'Plat',
  'Pizza':'Plat', 'Panuozzo':'Plat', 'Per i Bambini':'Autre', 'Dolci':'Dessert', 'Coupes glacées':'Dessert',
  'Brunch salé':'Autre', 'Brunch sucré':'Autre',
  'Pour commencer':'Entrée', 'À partager':'Entrée', 'Sur terre':'Plat', 'Sur mer':'Plat', 'Tartares':'Plat',
  'Végétarien':'Plat', 'Braséro':'Plat', 'Desserts':'Dessert',
};
const COURSE_LABEL_PLURAL = { 'Entrée':'Entrées', 'Plat':'Plats', 'Dessert':'Desserts', 'Autre':'Autres' };
function courseOf(dish){ return SECTION_COURSE[dish.section] || 'Autre'; }

function buildAllergenGridSet(DATA, dishes){
  const byCourse = {};
  dishes.forEach(d=>{ const c = courseOf(d); (byCourse[c] = byCourse[c] || []).push(d); });
  const families = DATA.allergenFamilies || [];
  const out = [];
  Object.keys(byCourse).forEach(course=>{
    chunkList(shuffle(byCourse[course]), ALLERGEN_GRID_SIZE).forEach(batch=>{
      const trueFamilies = new Set();
      batch.forEach(d=> (d.allerg||[]).forEach(f=>trueFamilies.add(f)));
      let columns = shuffle([...trueFamilies]);
      if(columns.length > ALLERGEN_GRID_MAX_COLS){
        columns = columns.slice(0, ALLERGEN_GRID_MAX_COLS);
      } else {
        const decoys = shuffle(families.filter(f=>!trueFamilies.has(f)));
        const want = columns.length===0 ? Math.min(3, decoys.length) : Math.min(2, ALLERGEN_GRID_MAX_COLS-columns.length, decoys.length);
        columns = shuffle(columns.concat(decoys.slice(0, want)));
      }
      if(columns.length===0) return;
      const rows = batch.map(d=>({
        name: d.name, origin: d._origin,
        cells: columns.map(fam=>{
          const isTrue = !!(d.allerg && d.allerg.includes(fam));
          return { family: fam, correct: isTrue, factId: isTrue ? `allergen|${fam}|${d._origin}|${d.name}` : null };
        }),
      }));
      const label = COURSE_LABEL_PLURAL[course] || course;
      out.push({
        type:'allergrid', origin:'mix', kicker:`Allergènes · ${label}`,
        text:`Coche, pour chaque plat (${label.toLowerCase()}), la ou les familles d'allergènes qu'il contient (rien à cocher si aucune de la liste).`,
        columns, rows, candidates: rows.flatMap(r=>r.cells),
        points: rows.length * columns.length,
      });
    });
  });
  return out;
}
function buildWineQCMSet(wines, field, fieldLabel){
  const withField = wines.filter(w => w[field]);
  if(withField.length < 4) return [];
  const out = [];
  withField.forEach(target => {
    const correctVal = target[field];
    const distractVals = shuffle([...new Set(withField.filter(w => w!==target && w[field]!==correctVal).map(w=>w[field]))]).slice(0,3);
    if(distractVals.length < 3) return;
    out.push({
      type:'qcm', origin: target._origin, kicker:'Vin · '+target.category,
      text:`${fieldLabel} de « ${target.name} » ?`,
      options: shuffle([correctVal, ...distractVals]), correct: correctVal,
      explain: `${target.name} (${target.cepage}) — ${fieldLabel.toLowerCase()} : ${correctVal}`,
      points: POINTS,
      factId: `wine|${field}|${target._origin}|${target.name}`,
    });
  });
  return out;
}

function buildFullPool(DATA, restaurant, mode){
  const scope = getScopeItems(DATA, restaurant);
  const dishes = scope.dishes.map(d=>({...d,_kind:'dish'}));
  const drinks = scope.drinks.map(d=>({...d,_kind:'drink'}));
  const all = dishes.concat(drinks);
  if(mode==='allergenes') return { pool: buildAllergenGridSet(DATA, dishes), cap: CAP_ALLERGEN };
  if(mode==='vins') return { pool: [
      ...buildWineQCMSet(scope.wines, 'cepage', 'Le cépage'),
      ...buildWineQCMSet(scope.wines, 'descriptor', 'Le profil sensoriel'),
      ...buildWineQCMSet(scope.wines, 'region', "La région d'origine"),
    ], cap: CAP_VINS };
  let pool = [
    ...buildQCMSet(all,'price','Le prix', euro),
    ...buildQCMSet(all,'accomp',"L'accompagnement"),
    ...buildQCMSet(all,'sauce',"La sauce / l'assaisonnement"),
    ...buildQCMSet(drinks,'comp','La composition'),
    ...buildVFSet(scope.vf),
  ];
  if(mode==='complet') pool = pool.concat(buildFillSet(all));
  return { pool, cap: CAP_MENU };
}

// ---------- progression ----------
// facts : { clé courte : {n: nb de réponses, k: bonnes réponses d'affilée} }
function factWeight(facts, factId){
  const f = facts[factKey(factId)];
  if(!f || !f.n) return 3;
  if(f.k<=0) return 2.6;
  if(f.k===1) return 1.8;
  if(f.k===2) return 1.0;
  return 0.4;
}
function isMastered(facts, factId){
  const f = facts[factKey(factId)];
  return !!(f && f.k>=2);
}
function weightedSample(items, n){
  if(items.length<=n) return items.slice();
  const keyed = items.map(it=>({ it, key: Math.pow(Math.random(), 1/Math.max(it._w||1, 1e-6)) }));
  keyed.sort((a,b)=> b.key-a.key);
  return keyed.slice(0,n).map(k=>k.it);
}
function buildRound(DATA, restaurant, mode, facts){
  const { pool, cap } = buildFullPool(DATA, restaurant, mode);
  pool.forEach(q=>{
    if(q.factId){ q._w = factWeight(facts, q.factId); return; }
    if(q.candidates){
      const ids = q.candidates.map(c=>c.factId).filter(Boolean);
      q._w = ids.length ? ids.reduce((s,id)=>s+factWeight(facts,id),0)/ids.length : 1;
      return;
    }
    q._w = 1;
  });
  return shuffle(weightedSample(pool, Math.min(cap, pool.length)));
}

// Toutes les infos d'un périmètre, avec un libellé lisible (pour l'espace manager).
const _factCache = new Map();
function factsFor(DATA, restaurant, mode){
  const cacheKey = (DATA.version||'') + '|' + restaurant + '|' + mode;
  if(_factCache.has(cacheKey)) return _factCache.get(cacheKey);
  const map = new Map(); // clé courte -> libellé
  if(mode==='allergenes'){
    // énumération exhaustive (la grille tirée au hasard peut couper des colonnes)
    getScopeItems(DATA, restaurant).dishes.forEach(d=>{
      (d.allerg||[]).forEach(fam=> map.set(factKey(`allergen|${fam}|${d._origin}|${d.name}`), `${d.name} contient : ${fam}`));
    });
  } else {
    buildFullPool(DATA, restaurant, mode).pool.forEach(q=>{
      if(q.factId) map.set(factKey(q.factId), q.type==='vf' ? `${q.text} → ${q.correct}` : q.explain);
    });
  }
  _factCache.set(cacheKey, map);
  return map;
}
function coverage(DATA, restaurant, mode, facts){
  const map = factsFor(DATA, restaurant, mode);
  let mastered = 0, seen = 0;
  map.forEach((_, key)=>{
    const f = facts[key];
    if(f && f.n) seen++;
    if(f && f.k>=2) mastered++;
  });
  const total = map.size;
  return { total, mastered, seen, pct: total ? Math.round(mastered/total*100) : 0 };
}

// Encodage compact de la progression pour le stockage ("clé.n.k,clé.n.k,…")
function encodeFacts(facts){
  return Object.keys(facts).map(k=>`${k}.${facts[k].n|0}.${facts[k].k|0}`).join(',');
}
function decodeFacts(str){
  const out = {};
  (str||'').split(',').forEach(part=>{
    if(!part) return;
    const [k,n,kk] = part.split('.');
    if(k) out[k] = { n: parseInt(n,10)||0, k: parseInt(kk,10)||0 };
  });
  return out;
}

// Vérifie qu'un fichier de cartes importé a la bonne forme
function validateCards(d){
  const errs = [];
  if(!d || typeof d!=='object') return ['Le fichier ne contient pas de données.'];
  ['donna','mamiefada'].forEach(r=>{
    if(!d[r]) errs.push(`Restaurant « ${r} » absent.`);
    else ['dishes','drinks','wines'].forEach(k=>{ if(!Array.isArray(d[r][k])) errs.push(`Liste « ${k} » manquante pour ${r}.`); });
  });
  if(!d.vraifaux) errs.push('Règlement (vraifaux) absent.');
  if(!Array.isArray(d.allergenFamilies)) errs.push("Liste des familles d'allergènes absente.");
  return errs;
}

window.QuizEngine = {
  POINTS, euro, strHash, factKey, escapeHtml, fuzzyMatch, normalize,
  buildRound, buildFullPool, factsFor, coverage, isMastered,
  encodeFacts, decodeFacts, validateCards, courseOf,
};
})();
