// excel.js — format Excel des cartes (lecture et écriture).
// Utilisé par l'espace manager (import / export) et pour générer le fichier de départ.
// LE FORMAT EST FIGÉ : noms d'onglets et de colonnes ci-dessous. L'ordre des colonnes
// peut changer, leurs titres non.
(function(root){
'use strict';

const RESTOS = [
  { id:'donna', label:'DONNA' },
  { id:'mamiefada', label:'Mamie Fada' },
];
const MOMENTS = ['Entrée', 'Plat', 'Dessert', 'Autre'];
const MAX_ROWS = 600;

const SHEETS = {
  cartes: { name:'Cartes', cols:[
    ['restaurant','Restaurant',14], ['name','Carte',16], ['active','En service',12], ['desc','Description',60],
  ]},
  dishes: { name:'Plats', cols:[
    ['restaurant','Restaurant',13], ['carte','Carte',12], ['section','Section',20], ['course','Moment du repas',16],
    ['name','Nom',32], ['price','Prix (€)',9], ['accomp','Accompagnement',44], ['sauce','Sauce',34],
    ['allerg','Allergènes',34], ['grammage','Grammage',12], ['note','Remarque',36],
  ]},
  drinks: { name:'Boissons', cols:[
    ['restaurant','Restaurant',13], ['cat','Catégorie',24], ['name','Nom',28], ['fmt','Format',12],
    ['comp','Composition',70], ['price','Prix (€)',9],
  ]},
  wines: { name:'Vins', cols:[
    ['restaurant','Restaurant',13], ['category','Catégorie',22], ['name','Nom',40], ['cepage','Cépage',30],
    ['region','Région',22], ['descriptor','Profil sensoriel',46], ['price12','Prix au verre (€)',15], ['price75','Prix bouteille (€)',16],
  ]},
  vf: { name:'Règlement', cols:[
    ['restaurant','Restaurant',13], ['statement','Affirmation',90], ['answer','Réponse',10],
  ]},
  allergens: { name:'Allergènes', cols:[ ['family','Famille d\'allergènes',30] ]},
};

const README = [
  ['Fichier des cartes — Quizz Cartes'],
  [''],
  ['Comment mettre à jour les cartes'],
  ['1. Dans l\'espace manager du quizz, cliquer sur « Télécharger les cartes actuelles (Excel) » pour partir de la dernière version publiée.'],
  ['2. Modifier les onglets : ajouter une ligne pour un nouveau plat, supprimer la ligne d\'un plat retiré, corriger une case.'],
  ['3. Enregistrer, puis cliquer sur « Importer le fichier Excel » dans l\'espace manager. Le quizz vérifie le fichier et liste les erreurs éventuelles avant de publier.'],
  [''],
  ['Règles à respecter'],
  ['• Ne pas renommer les onglets ni les titres de colonnes (la 1re ligne de chaque onglet). L\'ordre des colonnes, lui, peut changer.'],
  ['• Une ligne = un élément. Les lignes vides sont ignorées.'],
  ['• Restaurant : « DONNA » ou « Mamie Fada » (menu déroulant).'],
  ['• Onglet Cartes : la liste des cartes de chaque restaurant. « En service » = Oui : la carte est jouée dans le quizz et visible par les équipes. Non : elle est gardée de côté (ex. Braséro en hiver).'],
  ['• Onglet Plats : la colonne Carte doit reprendre exactement un nom de l\'onglet Cartes du même restaurant. Moment du repas : Entrée, Plat, Dessert ou Autre (sert à grouper les grilles d\'allergènes).'],
  ['• Allergènes : séparés par des virgules, écrits comme dans l\'onglet Allergènes (ex. « Gluten, Lait, Œuf »). Laisser vide si aucun.'],
  ['• Prix : un nombre (12 ou 9,50). Laisser vide si le plat n\'a pas de prix propre (formule).'],
  ['• Deux plats d\'un même restaurant ne peuvent pas avoir le même nom et la même section.'],
  ['• Boissons, vins et règlement sont communs à toutes les cartes d\'un restaurant.'],
  ['• Règlement : écrire une affirmation et indiquer si elle est Vraie ou Fausse (les affirmations vraies sont aussi affichées aux équipes dans « Les cartes »).'],
  [''],
  ['La progression des équipes est conservée pour tout ce qui ne change pas : modifier un prix ne fait repartir de zéro que la question sur ce prix.'],
];

// ---------------------------------------------------------------- écriture
function restoLabel(id){ const r = RESTOS.find(x=>x.id===id); return r ? r.label : id; }

async function writeWorkbook(ExcelJS, data){
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Quizz Cartes';
  wb.created = new Date();
  const HEAD = { font:{ bold:true, color:{ argb:'FFFFFFFF' } }, fill:{ type:'pattern', pattern:'solid', fgColor:{ argb:'FF55693C' } }, alignment:{ vertical:'middle', wrapText:true } };

  const rd = wb.addWorksheet('Lisez-moi', { properties:{ tabColor:{ argb:'FF7C2233' } } });
  rd.getColumn(1).width = 130;
  README.forEach((r,i)=>{
    const row = rd.addRow(r);
    row.alignment = { wrapText:true, vertical:'top' };
    if(i===0) row.font = { bold:true, size:16 };
    else if(['Comment mettre à jour les cartes','Règles à respecter'].includes(r[0])) row.font = { bold:true, size:12 };
  });
  rd.addRow(['']);
  rd.addRow([`Version : ${data.label || ''}${data.version ? ' (' + data.version + ')' : ''}`]).font = { italic:true, color:{ argb:'FF6B6153' } };

  const add = (key, rows) => {
    const def = SHEETS[key];
    const ws = wb.addWorksheet(def.name, { views:[{ state:'frozen', ySplit:1 }] });
    ws.columns = def.cols.map(([k,h,w])=>({ header:h, key:k, width:w }));
    ws.getRow(1).eachCell(c=>{ Object.assign(c, { font:HEAD.font, fill:HEAD.fill, alignment:HEAD.alignment }); });
    ws.getRow(1).height = 22;
    rows.forEach(r=>{ const row = ws.addRow(r); row.alignment = { vertical:'top', wrapText:true }; });
    ws.autoFilter = { from:{ row:1, column:1 }, to:{ row:1, column:def.cols.length } };
    return ws;
  };
  const colLetter = (key, field) => String.fromCharCode(65 + SHEETS[key].cols.findIndex(c=>c[0]===field));
  const listVal = (ws, key, field, formula) => {
    const L = colLetter(key, field);
    const v = { type:'list', allowBlank:true, formulae:[formula], showErrorMessage:true, errorStyle:'error', errorTitle:'Valeur non prévue', error:'Choisir une valeur dans la liste.' };
    if(ws.dataValidations && ws.dataValidations.add) ws.dataValidations.add(`${L}2:${L}${MAX_ROWS}`, v);
    else for(let i=2;i<=MAX_ROWS;i++) ws.getCell(`${L}${i}`).dataValidation = v;
  };
  const restoList = '"' + RESTOS.map(r=>r.label).join(',') + '"';

  const cartes = data.cartes || {};
  const cRows = [];
  RESTOS.forEach(r=> (cartes[r.id] || [{ name:'Classique', active:true }]).forEach(c=> cRows.push({ restaurant:r.label, name:c.name, active:c.active===false?'Non':'Oui', desc:c.desc||'' })));
  const wsC = add('cartes', cRows);
  listVal(wsC, 'cartes', 'restaurant', restoList);
  listVal(wsC, 'cartes', 'active', '"Oui,Non"');

  const dRows = [];
  RESTOS.forEach(r=> ((data[r.id]||{}).dishes||[]).forEach(d=> dRows.push({
    restaurant:r.label, carte:d.carte||'Classique', section:d.section||'', course:d.course||'',
    name:d.name, price: d.price==null ? null : d.price, accomp: d.accomp==='—' ? '' : (d.accomp||''),
    sauce: d.sauce==='—' ? '' : (d.sauce||''), allerg:(d.allerg||[]).join(', '), grammage:d.grammage||'', note:d.note||'',
  })));
  const wsD = add('dishes', dRows);
  listVal(wsD, 'dishes', 'restaurant', restoList);
  listVal(wsD, 'dishes', 'carte', `Cartes!$B$2:$B$60`);
  listVal(wsD, 'dishes', 'course', '"' + MOMENTS.join(',') + '"');
  wsD.getColumn('price').numFmt = '0.00';

  const bRows = [];
  RESTOS.forEach(r=> ((data[r.id]||{}).drinks||[]).forEach(d=> bRows.push({
    restaurant:r.label, cat:d.cat||'', name:d.name, fmt: d.fmt==='—' ? '' : (d.fmt||''), comp:d.comp||'', price: d.price==null ? null : d.price,
  })));
  const wsB = add('drinks', bRows);
  listVal(wsB, 'drinks', 'restaurant', restoList);
  wsB.getColumn('price').numFmt = '0.00';

  const vRows = [];
  RESTOS.forEach(r=> ((data[r.id]||{}).wines||[]).forEach(w=> vRows.push({
    restaurant:r.label, category:w.category||'', name:w.name, cepage:w.cepage||'', region:w.region||'',
    descriptor:w.descriptor||'', price12: w.price12==null ? null : w.price12, price75: w.price75==null ? null : w.price75,
  })));
  const wsV = add('wines', vRows);
  listVal(wsV, 'wines', 'restaurant', restoList);

  const rRows = [];
  RESTOS.forEach(r=> (((data.vraifaux||{})[r.id])||[]).forEach(v=> rRows.push({ restaurant:r.label, statement:v.statement, answer: v.isTrue ? 'Vrai' : 'Faux' })));
  const wsR = add('vf', rRows);
  listVal(wsR, 'vf', 'restaurant', restoList);
  listVal(wsR, 'vf', 'answer', '"Vrai,Faux"');

  add('allergens', (data.allergenFamilies||[]).map(f=>({ family:f })));
  return wb;
}

// ---------------------------------------------------------------- lecture
function cellText(v){
  if(v==null) return '';
  if(typeof v==='object'){
    if(v instanceof Date) return v.toISOString().slice(0,10);
    if(v.richText) return v.richText.map(t=>t.text).join('');
    if('result' in v) return cellText(v.result);
    if(v.text!=null) return String(v.text);
    if(v.error) return '';
  }
  return String(v);
}
function norm(s){ return cellText(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim(); }
function clean(s){ return cellText(s).replace(/\s+/g,' ').trim(); }
function parsePrice(v){
  if(v==null || v==='') return { ok:true, val:null };
  if(typeof v==='number') return { ok:true, val: Math.round(v*100)/100 };
  const s = clean(v).replace(/€/g,'').replace(/\s/g,'').replace(',', '.');
  if(!s) return { ok:true, val:null };
  const n = Number(s);
  return isFinite(n) && n>=0 ? { ok:true, val: Math.round(n*100)/100 } : { ok:false };
}

async function readWorkbook(ExcelJS, arrayBuffer){
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(arrayBuffer);
  const errors = [], warnings = [];
  const err = (sheet, row, msg) => { if(errors.length < 60) errors.push(row ? `${sheet}, ligne ${row} : ${msg}` : `${sheet} : ${msg}`); };

  // lit un onglet en liste d'objets {_row, champ: valeur brute}
  function readSheet(key){
    const def = SHEETS[key];
    const ws = wb.worksheets.find(w=> norm(w.name)===norm(def.name));
    if(!ws){ err(def.name, 0, 'onglet introuvable (son nom ne doit pas être modifié).'); return []; }
    const head = ws.getRow(1);
    const idx = {};
    head.eachCell({ includeEmpty:false }, (c, col)=>{
      const h = norm(c.value);
      const found = def.cols.find(([, label])=> norm(label)===h);
      if(found) idx[found[0]] = col;
    });
    const missing = def.cols.filter(([k])=> !(k in idx)).map(c=>c[1]);
    if(missing.length){ err(def.name, 0, 'colonne(s) introuvable(s) : ' + missing.join(', ') + ' (ne pas renommer la 1re ligne).'); return []; }
    const out = [];
    ws.eachRow({ includeEmpty:false }, (row, n)=>{
      if(n===1) return;
      const o = { _row:n };
      let any = false;
      def.cols.forEach(([k])=>{ const v = row.getCell(idx[k]).value; o[k] = v; if(clean(v)) any = true; });
      if(any) out.push(o);
    });
    return out;
  }
  function resto(sheet, o){
    const v = norm(o.restaurant);
    const r = RESTOS.find(x=> norm(x.label)===v || x.id===v.replace(/\s/g,''));
    if(!r) err(sheet, o._row, `restaurant « ${clean(o.restaurant)} » inconnu (DONNA ou Mamie Fada).`);
    return r ? r.id : null;
  }

  const data = { allergenFamilies:[], cartes:{}, vraifaux:{} };
  RESTOS.forEach(r=>{ data[r.id] = { label:r.label, dishes:[], drinks:[], wines:[] }; data.cartes[r.id] = []; data.vraifaux[r.id] = []; });

  // Allergènes
  readSheet('allergens').forEach(o=>{ const f = clean(o.family); if(f && !data.allergenFamilies.includes(f)) data.allergenFamilies.push(f); });
  if(!data.allergenFamilies.length) err('Allergènes', 0, 'la liste des familles est vide.');
  const canon = s => norm(s).replace(/œ/g,'oe').replace(/æ/g,'ae').replace(/s$/,'');
  const famByCanon = new Map(data.allergenFamilies.map(f=>[canon(f), f]));
  const famLookup = s => famByCanon.get(canon(s)) || null;

  // Cartes
  readSheet('cartes').forEach(o=>{
    const r = resto('Cartes', o); if(!r) return;
    const name = clean(o.name);
    if(!name) return err('Cartes', o._row, 'nom de carte vide.');
    if(data.cartes[r].some(c=>norm(c.name)===norm(name))) return err('Cartes', o._row, `la carte « ${name} » existe déjà pour ce restaurant.`);
    const a = norm(o.active);
    if(a && !['oui','non'].includes(a)) err('Cartes', o._row, '« En service » doit valoir Oui ou Non.');
    data.cartes[r].push({ name, active: a!=='non', desc: clean(o.desc) });
  });
  RESTOS.forEach(r=>{ if(!data.cartes[r.id].length) err('Cartes', 0, `aucune carte déclarée pour ${r.label}.`); });

  // Plats
  const seen = new Set();
  readSheet('dishes').forEach(o=>{
    const S = 'Plats', r = resto(S, o); if(!r) return;
    const name = clean(o.name), section = clean(o.section);
    if(!name) return err(S, o._row, 'nom vide.');
    if(!section) err(S, o._row, `section vide pour « ${name} ».`);
    const carte = data.cartes[r].find(c=> norm(c.name)===norm(o.carte));
    if(!carte) err(S, o._row, `carte « ${clean(o.carte)} » non déclarée dans l'onglet Cartes pour ${restoLabel(r)}.`);
    const course = MOMENTS.find(m=> norm(m)===norm(o.course));
    if(!course) err(S, o._row, `moment du repas « ${clean(o.course)} » invalide (Entrée, Plat, Dessert ou Autre).`);
    const p = parsePrice(o.price); if(!p.ok) err(S, o._row, `prix « ${clean(o.price)} » illisible.`);
    const allerg = [];
    clean(o.allerg).split(/[,;\/]+/).map(s=>s.trim()).filter(Boolean).forEach(a=>{
      const f = famLookup(a);
      if(f){ if(!allerg.includes(f)) allerg.push(f); }
      else err(S, o._row, `allergène « ${a} » absent de l'onglet Allergènes.`);
    });
    const key = r + '|' + norm(section) + '|' + norm(name);
    if(seen.has(key)) err(S, o._row, `« ${name} » apparaît deux fois dans la même section.`);
    seen.add(key);
    data[r].dishes.push({
      name, section, carte: carte ? carte.name : clean(o.carte), course: course || 'Autre',
      price: p.val, accomp: clean(o.accomp) || '—', sauce: clean(o.sauce) || '—', allerg,
      grammage: clean(o.grammage) || null, note: clean(o.note) || null,
    });
  });

  // Boissons
  readSheet('drinks').forEach(o=>{
    const S = 'Boissons', r = resto(S, o); if(!r) return;
    const name = clean(o.name); if(!name) return err(S, o._row, 'nom vide.');
    const p = parsePrice(o.price); if(!p.ok) err(S, o._row, `prix « ${clean(o.price)} » illisible.`);
    data[r].drinks.push({ name, cat: clean(o.cat) || 'Autres', fmt: clean(o.fmt) || '—', comp: clean(o.comp), price: p.val });
  });

  // Vins
  readSheet('wines').forEach(o=>{
    const S = 'Vins', r = resto(S, o); if(!r) return;
    const name = clean(o.name); if(!name) return err(S, o._row, 'nom vide.');
    const p1 = parsePrice(o.price12), p2 = parsePrice(o.price75);
    if(!p1.ok) err(S, o._row, 'prix au verre illisible.');
    if(!p2.ok) err(S, o._row, 'prix bouteille illisible.');
    data[r].wines.push({ name, category: clean(o.category) || 'Autres', cepage: clean(o.cepage), region: clean(o.region), descriptor: clean(o.descriptor), price12: p1.val, price75: p2.val });
  });

  // Règlement
  readSheet('vf').forEach(o=>{
    const S = 'Règlement', r = resto(S, o); if(!r) return;
    const st = clean(o.statement); if(!st) return err(S, o._row, 'affirmation vide.');
    const a = norm(o.answer);
    if(!['vrai','faux'].includes(a)) return err(S, o._row, '« Réponse » doit valoir Vrai ou Faux.');
    data.vraifaux[r].push({ statement: st, isTrue: a==='vrai' });
  });

  RESTOS.forEach(r=>{
    data.cartes[r.id].forEach(c=>{
      if(c.active && !data[r.id].dishes.some(d=>d.carte===c.name)) warnings.push(`La carte « ${c.name} » (${r.label}) est en service mais ne contient aucun plat.`);
    });
    if(!data[r.id].dishes.length) warnings.push(`Aucun plat pour ${r.label}.`);
  });
  return { data, errors, warnings };
}

const api = { RESTOS, SHEETS, MOMENTS, writeWorkbook, readWorkbook };
if(typeof module!=='undefined' && module.exports) module.exports = api;
else root.QuizExcel = api;
})(typeof window!=='undefined' ? window : globalThis);
