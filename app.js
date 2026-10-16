// app.js — interfaces « équipe » et « manager ».
(function(){
'use strict';
const E = window.QuizEngine;
const esc = E.escapeHtml;
const $ = id => document.getElementById(id);
const root = document.documentElement;

const store = window.createStore();
const app = {
  cards: null,        // { data, updatedAt, by }
  facts: {},          // progression de la personne connectée
  parties: 0,
  adminRows: null,
  adminResto: 'donna',
  adminSort: { key:'carte', dir:-1 },
  selected: null,
};
const state = {
  restaurant: null, mode: null, pool: [], idx: 0, score: 0, maxScore: 0,
  correctCount: 0, misses: [], answered: false, results: [], coverageBefore: null,
  cellStats: { correct:0, total:0 },
};

// ---------------------------------------------------------------- vues
const VIEWS = ['view-loading','view-login','view-demo-name','view-nocards','screen-home','screen-game','screen-result','view-cards','view-admin-lock','view-admin'];
function show(id){
  VIEWS.forEach(v=> $(v).classList.toggle('hidden', v!==id));
  const inAdmin = id==='view-admin' || id==='view-admin-lock';
  const inCards = id==='view-cards';
  $('nav-quiz').classList.toggle('hidden', !(inAdmin || inCards) || !store.user);
  $('nav-cards').classList.toggle('hidden', inCards || !store.user || !app.cards);
  $('nav-admin').classList.toggle('hidden', inAdmin || !store.user);
  if(id==='screen-home') updateScopeUI();
  if(!['screen-home','screen-game','screen-result','view-cards'].includes(id)) root.setAttribute('data-scope', inAdmin ? app.adminResto : 'mixed');
  window.scrollTo(0,0);
}
function loading(msg){ $('loading-text').textContent = msg || 'Chargement…'; show('view-loading'); }
function fail(msg){ loading(''); $('loading-text').innerHTML = `<span style="color:var(--bad)">${esc(msg)}</span>`; }
function setMast(brand, tag, eyebrow){
  $('mast-brand').textContent = brand; $('mast-tag').textContent = tag;
  $('mast-eyebrow').textContent = eyebrow || 'Formation service';
}

// ---------------------------------------------------------------- démarrage
async function boot(){
  if(store.mode==='demo') $('demo-banner').classList.remove('hidden');
  try{
    const r = await store.init();
    if(r.needsLogin){ show(store.mode==='demo' ? 'view-demo-name' : 'view-login'); return; }
    await afterLogin();
  }catch(e){
    console.error(e);
    fail('Impossible de démarrer : ' + e.message);
  }
}
async function afterLogin(){
  $('who').textContent = store.user.name;
  $('nav-logout').classList.remove('hidden');
  loading('Chargement des cartes…');
  try{
    app.cards = await store.loadCards();
  }catch(e){
    console.error(e); app.cards = null;
    fail('Les cartes n\'ont pas pu être chargées : ' + e.message);
    $('nav-admin').classList.remove('hidden');
    return;
  }
  try{
    const p = await store.loadMyProgress();
    app.facts = p.facts; app.parties = p.parties;
  }catch(e){ console.error(e); app.facts = {}; }
  await flushPending();
  if(app.cards && app.cards.data.label) $('footer-credit').textContent = app.cards.data.label + '. Allergènes indicatifs — toujours confirmer avec la cuisine avant de répondre à un client.';
  goHome();
}
function goHome(){
  setMast('Quizz de la carte', 'DONNA · MAMIE FADA — entraîne-toi avant le service');
  if(!app.cards){ show('view-nocards'); return; }
  show('screen-home');
}

$('login-btn').addEventListener('click', ()=> store.login());
$('demo-name-btn').addEventListener('click', async ()=>{
  const n = $('demo-name-input').value.trim();
  if(!n) return;
  await store.loginDemo(n);
  afterLogin();
});
$('demo-name-input').addEventListener('keydown', e=>{ if(e.key==='Enter') $('demo-name-btn').click(); });
$('nav-logout').addEventListener('click', async e=>{
  e.preventDefault();
  try{ sessionStorage.removeItem('qc_admin_ok'); }catch(_){}
  await store.logout();
  location.reload();
});
$('nav-quiz').addEventListener('click', e=>{ e.preventDefault(); goHome(); });
$('nav-cards').addEventListener('click', e=>{ e.preventDefault(); openCards(); });
$('nav-admin').addEventListener('click', e=>{ e.preventDefault(); openAdmin(); });

// ---------------------------------------------------------------- sauvegarde
const PENDING_KEY = () => 'qc_pending_' + (store.user ? store.user.email : '');
function getPending(){ try{ return JSON.parse(localStorage.getItem(PENDING_KEY())||'[]'); }catch(e){ return []; } }
function setPending(list){ try{ if(list.length) localStorage.setItem(PENDING_KEY(), JSON.stringify(list)); else localStorage.removeItem(PENDING_KEY()); }catch(e){} }
async function flushPending(){
  const pending = getPending();
  if(!pending.length) return true;
  try{
    const r = await store.saveResults(pending);
    app.facts = r.facts; app.parties = r.parties;
    setPending([]);
    $('save-error').classList.add('hidden');
    return true;
  }catch(e){ console.error(e); return false; }
}
async function saveRound(results){
  if(!results.length) return;
  // mise à jour immédiate en mémoire, puis envoi
  results.forEach(r=>{
    const k = E.factKey(r.factId);
    const cur = app.facts[k] || { n:0, k:0 };
    app.facts[k] = { n: cur.n+1, k: r.correct ? cur.k+1 : 0 };
  });
  const pending = getPending().concat(results);
  setPending(pending);
  const ok = await flushPending();
  $('save-error').classList.toggle('hidden', ok);
}

// ================================================================ ÉQUIPE
const els = {
  pickRestaurant: $('pick-restaurant'), pickMode: $('pick-mode'), startBtn: $('start-btn'),
  homeHint: $('home-hint'), progressPanel: $('progress-panel'),
  homeProgressFill: $('home-progress-fill'), homeProgressText: $('home-progress-text'),
};
function updateScopeUI(){
  root.setAttribute('data-scope', state.restaurant || 'mixed');
  [...els.pickRestaurant.children].forEach(b=>b.classList.toggle('active', b.dataset.val===state.restaurant));
  [...els.pickMode.children].forEach(b=>b.classList.toggle('active', b.dataset.val===state.mode));
  els.startBtn.disabled = !(state.restaurant && state.mode);
  if(state.restaurant==='donna') setMast('DONNA', 'Carte, cocktails & cave — quizz de service');
  else if(state.restaurant==='mamiefada') setMast('Mamie Fada', 'Bistrot, cave & bar de Papi — quizz de service');
  else if(state.restaurant==='mixed') setMast('Quizz de la carte', 'DONNA & Mamie Fada mélangés');
  if(!(state.restaurant && state.mode) || !app.cards){
    els.homeHint.textContent = 'Choisis un restaurant et un mode pour commencer — parties courtes, un tirage différent à chaque fois.';
    els.progressPanel.classList.add('hidden');
    return;
  }
  const preview = E.buildRound(app.cards.data, state.restaurant, state.mode, app.facts);
  const totalPts = preview.reduce((s,q)=>s+q.points,0);
  const topic = state.mode==='allergenes' ? 'plats & allergènes (grilles de 4 plats)'
              : state.mode==='vins' ? 'cépages, régions & profils sensoriels'
              : 'carte et règlement';
  els.homeHint.innerHTML = `Partie courte : <b>${preview.length} questions</b> sur ${topic} (score maximum : <b>${totalPts} pts</b>). Le tirage donne la priorité à ce que tu ne maîtrises pas encore.`;
  const cov = E.coverage(app.cards.data, state.restaurant, state.mode, app.facts);
  els.progressPanel.classList.remove('hidden');
  els.homeProgressFill.style.width = cov.pct + '%';
  els.homeProgressText.innerHTML = `<b>${cov.pct}%</b> maîtrisé (${cov.mastered}/${cov.total} infos réussies deux fois de suite).`;
}
els.pickRestaurant.addEventListener('click', e=>{ const b = e.target.closest('.choice'); if(!b) return; state.restaurant = b.dataset.val; updateScopeUI(); });
els.pickMode.addEventListener('click', e=>{ const b = e.target.closest('.choice'); if(!b) return; state.mode = b.dataset.val; updateScopeUI(); });
els.startBtn.addEventListener('click', startRound);
$('replay-btn').addEventListener('click', startRound);
$('home-btn').addEventListener('click', ()=> show('screen-home'));

const g = {
  progressLabel: $('progress-label'), progressFill: $('progress-fill'), scoreVal: $('score-val'),
  qKicker: $('q-kicker'), qText: $('question-text'), qBody: $('question-body'),
  feedback: $('feedback'), nextBtn: $('next-btn'), quitBtn: $('quit-btn'),
};
function startRound(){
  state.coverageBefore = E.coverage(app.cards.data, state.restaurant, state.mode, app.facts);
  state.pool = E.buildRound(app.cards.data, state.restaurant, state.mode, app.facts);
  Object.assign(state, { idx:0, score:0, correctCount:0, misses:[], results:[], cellStats:{correct:0,total:0} });
  state.maxScore = state.pool.reduce((s,q)=>s+q.points,0);
  if(!state.pool.length){ alert('Pas assez de données pour ce quizz — essaie un autre restaurant ou mode.'); return; }
  show('screen-game');
  g.quitBtn.classList.remove('hidden');
  renderQuestion();
}
g.quitBtn.addEventListener('click', ()=> finishRound());
g.nextBtn.addEventListener('click', ()=>{
  state.idx++;
  if(state.idx >= state.pool.length) finishRound(); else renderQuestion();
});
function originPill(origin){
  if(origin==='donna') return `<span class="pill origin-donna">DONNA</span>`;
  if(origin==='mamiefada') return `<span class="pill origin-mamiefada">Mamie Fada</span>`;
  return '';
}
function renderQuestion(){
  state.answered = false;
  const q = state.pool[state.idx];
  g.progressLabel.textContent = `Question ${state.idx+1} / ${state.pool.length}`;
  g.progressFill.style.width = (state.idx/state.pool.length*100)+'%';
  g.scoreVal.textContent = state.score;
  g.feedback.className = 'feedback'; g.feedback.textContent = '';
  g.nextBtn.classList.add('hidden');
  const bits = [];
  if(q.origin && q.origin!=='mix') bits.push(originPill(q.origin));
  if(q.kicker) bits.push(`<span class="pill">${esc(q.kicker)}</span>`);
  g.qKicker.innerHTML = bits.join('');
  g.qText.textContent = q.text;

  if(q.type==='qcm' || q.type==='vf'){
    const opts = q.type==='vf' ? ['Vrai','Faux'] : q.options;
    const wrap = q.type==='vf' ? 'tf-row' : 'options';
    g.qBody.innerHTML = `<div class="${wrap}">${opts.map((o,i)=>
      `<button class="opt" data-i="${i}"><span class="letter">${q.type==='vf' ? o[0] : String.fromCharCode(65+i)}</span>${esc(o)}</button>`).join('')}</div>`;
    g.qBody.querySelectorAll('.opt').forEach(btn=> btn.addEventListener('click', ()=> answerChoice(btn, q, opts[+btn.dataset.i], opts)));
  } else if(q.type==='fill'){
    g.qBody.innerHTML = `<div class="fill-row"><input type="text" id="fill-input" placeholder="Ta réponse…" autocomplete="off"><button class="btn" id="fill-submit">Valider</button></div>`;
    const input = $('fill-input'); input.focus();
    const submit = ()=> answerFill(q);
    $('fill-submit').addEventListener('click', submit);
    input.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); submit(); } });
  } else if(q.type==='allergrid'){
    const head = q.columns.map(f=>`<th>${esc(f)}</th>`).join('');
    const rows = q.rows.map((r,ri)=>{
      const pill = r.origin && state.restaurant==='mixed' ? ' ' + originPill(r.origin) : '';
      return `<tr><td class="allergrid-dish">${esc(r.name)}${pill}</td>${r.cells.map((c,ci)=>`<td><input type="checkbox" data-row="${ri}" data-col="${ci}" aria-label="${esc(r.name)} — ${esc(c.family)}"></td>`).join('')}</tr>`;
    }).join('');
    g.qBody.innerHTML = `<div class="allergrid-wrap"><table class="allergrid"><thead><tr><th class="allergrid-dish"></th>${head}</tr></thead><tbody>${rows}</tbody></table></div>
      <div class="btn-row" style="margin-top:14px;"><button class="btn" id="allergrid-submit">Valider ma grille</button></div>`;
    $('allergrid-submit').addEventListener('click', ()=> answerGrid(q));
  }
}
function lock(){ g.qBody.querySelectorAll('button,input').forEach(el=> el.disabled = true); }
function answerChoice(btn, q, val, opts){
  if(state.answered) return; state.answered = true;
  g.qBody.querySelectorAll('.opt').forEach(o=>{
    const v = opts[+o.dataset.i];
    if(v===q.correct) o.classList.add('correct'); else if(o===btn) o.classList.add('wrong');
  });
  lock();
  applyResult(val===q.correct, q);
}
function answerFill(q){
  if(state.answered) return; state.answered = true;
  const val = $('fill-input').value;
  lock();
  applyResult(E.fuzzyMatch(val, q.correct), q);
}
function answerGrid(q){
  if(state.answered) return; state.answered = true;
  const boxes = [...g.qBody.querySelectorAll('input[type=checkbox]')];
  let ok = 0;
  boxes.forEach(b=>{
    const cell = q.rows[+b.dataset.row].cells[+b.dataset.col];
    const td = b.closest('td'), checked = b.checked;
    if(cell.correct===checked) ok++;
    if(cell.correct && checked) td.classList.add('correct');
    else if(!cell.correct && checked) td.classList.add('wrong');
    else if(cell.correct && !checked) td.classList.add('missed');
    if(cell.factId) state.results.push({ factId: cell.factId, correct: checked });
  });
  lock();
  const total = boxes.length;
  const explain = q.rows.map(r=>{
    const has = r.cells.filter(c=>c.correct).map(c=>c.family);
    return `${r.name} : ${has.length ? has.join(', ') : 'aucun de la liste'}`;
  }).join(' · ');
  state.score += ok; state.cellStats.correct += ok; state.cellStats.total += total;
  const perfect = ok===total;
  if(perfect) state.correctCount++; else state.misses.push({ text:q.text, explain });
  g.feedback.classList.add('show', perfect ? 'good' : 'bad');
  g.feedback.innerHTML = perfect ? `<b>Grille parfaite !</b> +${ok} pts` : `<b>${ok}/${total} cases correctes.</b> +${ok} pts — ${esc(explain)}`;
  afterAnswer();
}
function applyResult(correct, q){
  if(q.factId) state.results.push({ factId:q.factId, correct });
  g.feedback.classList.add('show', correct ? 'good' : 'bad');
  if(correct){ state.score += q.points; state.correctCount++; g.feedback.innerHTML = `<b>Bonne réponse !</b> +${q.points} pts`; }
  else { state.misses.push({ text:q.text, explain:q.explain }); g.feedback.innerHTML = `<b>Pas tout à fait.</b> ${esc(q.explain)}`; }
  afterAnswer();
}
function afterAnswer(){
  g.scoreVal.textContent = state.score;
  g.nextBtn.classList.remove('hidden');
  g.nextBtn.textContent = (state.idx+1>=state.pool.length) ? 'Voir mon score' : 'Question suivante';
  g.nextBtn.focus();
}
async function finishRound(){
  const results = state.results.slice();
  show('screen-result');
  const total = state.pool.length;
  $('result-score').textContent = `${state.score} / ${state.maxScore} pts`;
  let sub, bd;
  if(state.mode==='allergenes' && state.cellStats.total){
    const pct = Math.round(state.cellStats.correct/state.cellStats.total*100);
    sub = `${state.cellStats.correct} / ${state.cellStats.total} cases correctes (${pct}%)`;
    bd = [[state.cellStats.correct,'Cases correctes'],[state.cellStats.total-state.cellStats.correct,'Cases ratées'],[state.maxScore,'Score max']];
  } else {
    const pct = total ? Math.round(state.correctCount/total*100) : 0;
    sub = `${state.correctCount} / ${total} bonnes réponses (${pct}%)`;
    bd = [[state.correctCount,'Bonnes'],[total-state.correctCount,'Ratées'],[state.maxScore,'Score max']];
  }
  $('result-sub').textContent = sub;
  $('result-breakdown').innerHTML = bd.map(([n,l])=>`<div class="bd"><div class="n">${n}</div><div class="l">${l}</div></div>`).join('');
  $('miss-list').innerHTML = state.misses.length
    ? `<span class="section-label">À revoir</span>` + state.misses.map(m=>`<div class="miss-item"><b>${esc(m.text)}</b><br>${esc(m.explain)}</div>`).join('')
    : `<div class="miss-item">Sans faute — tu connais ta carte !</div>`;
  await saveRound(results);
  const after = E.coverage(app.cards.data, state.restaurant, state.mode, app.facts);
  const delta = after.pct - (state.coverageBefore ? state.coverageBefore.pct : 0);
  $('result-sub').innerHTML = esc(sub) + `<br>Progression sur ce mode : <b>${after.pct}%</b> maîtrisé${delta>0 ? ` (+${delta} pt${delta>1?'s':''})` : ''}.`;
}

// ---------------------------------------------------------------- consulter les cartes
const cardsUI = { resto:'donna', tab:'dishes', q:'' };
function openCards(){
  if(!app.cards) return;
  show('view-cards');
  setMast('Les cartes', 'Consulte la carte avant de t\'entraîner', 'Révision');
  renderCards();
}
$('cards-pick').addEventListener('click', e=>{ const b = e.target.closest('.choice'); if(!b) return; cardsUI.resto = b.dataset.val; renderCards(); });
$('cards-tab').addEventListener('click', e=>{ const b = e.target.closest('.choice'); if(!b) return; cardsUI.tab = b.dataset.val; renderCards(); });
$('cards-search').addEventListener('input', e=>{ cardsUI.q = e.target.value; renderCards(); });
function renderCards(){
  root.setAttribute('data-scope', cardsUI.resto);
  [...$('cards-pick').children].forEach(b=>b.classList.toggle('active', b.dataset.val===cardsUI.resto));
  [...$('cards-tab').children].forEach(b=>b.classList.toggle('active', b.dataset.val===cardsUI.tab));
  const D = app.cards.data, r = cardsUI.resto;
  const q = E.normalize(cardsUI.q);
  const match = obj => !q || E.normalize(Object.values(obj).flat().join(' ')).includes(q);
  let groups = [];
  const groupBy = (items, key) => { const m = new Map(); items.forEach(it=>{ const k = it[key]||'Autres'; if(!m.has(k)) m.set(k,[]); m.get(k).push(it); }); return [...m.entries()]; };
  if(cardsUI.tab==='vf'){
    const items = ((D.vraifaux||{})[r]||[]).filter(it=>it.isTrue && match(it));
    groups = [['Règles à retenir', items.map(it=>({ name: it.statement }))]];
  } else {
    const items = (D[r][cardsUI.tab]||[]).filter(match);
    groups = groupBy(items, cardsUI.tab==='dishes' ? 'section' : cardsUI.tab==='drinks' ? 'cat' : 'category');
  }
  const html = groups.filter(([,items])=>items.length).map(([title, items])=>`<div class="carte-section"><h3>${esc(title)}</h3>${items.map(it=>{
    let price = '', detail = '', extra = '';
    if(cardsUI.tab==='dishes'){
      price = it.price!=null ? E.euro(it.price) : '';
      detail = [it.accomp, it.sauce].filter(x=>x && x!=='—').join(' · ');
      extra = it.allerg && it.allerg.length ? 'Allergènes : ' + it.allerg.join(', ') : (it.allerg ? 'Aucun allergène majeur listé' : '');
    } else if(cardsUI.tab==='drinks'){
      price = it.price!=null ? E.euro(it.price) : '';
      detail = [it.comp, it.fmt && it.fmt!=='—' ? it.fmt : ''].filter(Boolean).join(' · ');
    } else if(cardsUI.tab==='wines'){
      price = [it.price12!=null ? E.euro(it.price12)+' le verre' : '', it.price75!=null ? E.euro(it.price75)+' la bouteille' : ''].filter(Boolean).join(' · ');
      detail = [it.cepage, it.region].filter(Boolean).join(' · ');
      extra = it.descriptor || '';
    }
    return `<div class="carte-item"><div class="row1"><span class="name">${esc(it.name)}</span><span class="price">${esc(price)}</span></div>${detail?`<div class="detail">${esc(detail)}</div>`:''}${extra?`<div class="allerg">${esc(extra)}</div>`:''}</div>`;
  }).join('')}</div>`).join('');
  $('cards-list').innerHTML = html || '<p class="meta-line">Rien ne correspond à ta recherche.</p>';
}

// ================================================================ MANAGER
function adminOk(){ try{ return sessionStorage.getItem('qc_admin_ok')==='1'; }catch(e){ return false; } }
function setAdminOk(){ try{ sessionStorage.setItem('qc_admin_ok','1'); }catch(e){} }
let lockMode = 'unlock'; // 'unlock' | 'create'
async function openAdmin(){
  if(adminOk()){ return renderAdmin(); }
  loading('Vérification…');
  let hash = null;
  try{ hash = await store.getAdminHash(); }catch(e){ console.error(e); }
  lockMode = hash ? 'unlock' : 'create';
  $('lock-title').textContent = hash ? 'Espace manager' : 'Créer le code manager';
  $('lock-help').textContent = hash
    ? 'Entre le code manager pour accéder aux progressions des équipes.'
    : 'Aucun code manager n\'existe encore. Choisis-en un (4 caractères minimum) : il sera demandé à chaque ouverture de l\'espace manager. Seuls les comptes autorisés côté SharePoint pourront l\'enregistrer.';
  $('admin-code-confirm-row').classList.toggle('hidden', !!hash);
  $('admin-code-btn').textContent = hash ? 'Déverrouiller' : 'Enregistrer le code';
  $('lock-error').classList.add('hidden');
  $('admin-code-input').value = ''; $('admin-code-confirm').value = '';
  setMast('Espace manager', 'Suivi des équipes de salle', 'Accès réservé');
  show('view-admin-lock');
  $('admin-code-input').focus();
}
function lockError(msg){ const el = $('lock-error'); el.textContent = msg; el.classList.remove('hidden'); }
$('admin-code-input').addEventListener('keydown', e=>{ if(e.key==='Enter') $('admin-code-btn').click(); });
$('admin-code-confirm').addEventListener('keydown', e=>{ if(e.key==='Enter') $('admin-code-btn').click(); });
$('admin-code-btn').addEventListener('click', async ()=>{
  const code = $('admin-code-input').value.trim();
  if(code.length < 4) return lockError('Le code doit faire au moins 4 caractères.');
  const h = await store.hashCode(code);
  if(lockMode==='create'){
    if(code !== $('admin-code-confirm').value.trim()) return lockError('Les deux codes ne sont pas identiques.');
    try{
      await store.ensureSetup();
      await store.setAdminHash(h);
    }catch(e){
      console.error(e);
      return lockError('Enregistrement refusé : ton compte n\'a pas les droits de modification sur le site SharePoint du quizz. (' + e.message + ')');
    }
    setAdminOk(); return renderAdmin();
  }
  let stored = null;
  try{ stored = await store.getAdminHash(); }catch(e){ return lockError('Vérification impossible : ' + e.message); }
  if(h !== stored) return lockError('Code incorrect.');
  setAdminOk(); renderAdmin();
});
$('admin-change-code').addEventListener('click', async ()=>{
  const a = prompt('Nouveau code manager (4 caractères minimum) :');
  if(a===null) return;
  if(a.trim().length < 4) return alert('Le code doit faire au moins 4 caractères.');
  const b = prompt('Confirme le nouveau code :');
  if(b===null) return;
  if(a.trim()!==b.trim()) return alert('Les deux codes ne sont pas identiques.');
  try{ await store.setAdminHash(await store.hashCode(a.trim())); alert('Code manager modifié.'); }
  catch(e){ alert('Modification refusée : ' + e.message); }
});

async function renderAdmin(){
  loading('Chargement des progressions…');
  try{ await store.ensureSetup(); }catch(e){ console.warn('ensureSetup', e); }
  try{ app.adminRows = await store.loadAllProgress(); }
  catch(e){ console.error(e); app.adminRows = []; }
  setMast('Espace manager', 'Suivi des équipes de salle', 'Accès réservé');
  show('view-admin');
  $('admin-demo-fill').classList.toggle('hidden', store.mode!=='demo');
  $('admin-demo-reset').classList.toggle('hidden', store.mode!=='demo');
  renderCardsInfo();
  drawAdmin();
}
function renderCardsInfo(){
  const el = $('admin-cards-info');
  if(!app.cards){ el.innerHTML = '<b>Aucune carte publiée.</b> Importe le fichier des cartes pour que les équipes puissent jouer.'; return; }
  const D = app.cards.data;
  const n = r => `${D[r].dishes.length} plats, ${D[r].drinks.length} boissons, ${D[r].wines.length} vins`;
  const when = app.cards.updatedAt ? new Date(app.cards.updatedAt).toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' }) : '';
  el.innerHTML = `${esc(D.label || 'Cartes publiées')}${when ? ` — publiée le ${when}` : ''}${app.cards.by ? ` par ${esc(app.cards.by)}` : ''}.<br>DONNA : ${n('donna')}. Mamie Fada : ${n('mamiefada')}.`;
}
$('admin-resto').addEventListener('click', e=>{ const b = e.target.closest('.choice'); if(!b) return; app.adminResto = b.dataset.val; root.setAttribute('data-scope', app.adminResto); drawAdmin(); });

const ADMIN_MODES = [['carte','complet','Carte'],['allergenes','allergenes','Allergènes'],['vins','vins','Vins']];
function rowStats(row, resto){
  const D = app.cards.data, s = {};
  let seen = 0;
  ADMIN_MODES.forEach(([key, mode])=>{ const c = E.coverage(D, resto, mode, row.facts); s[key] = c.pct; seen += c.seen; });
  s.started = seen>0;
  return s;
}
function bar(pct){ return `<span class="bar"><span>${pct}%</span><span class="track"><span class="fill" style="width:${pct}%"></span></span></span>`; }
function fmtDate(iso){
  if(!iso) return '—';
  const d = new Date(iso), days = Math.floor((Date.now()-d.getTime())/86400000);
  if(days<=0) return "aujourd'hui"; if(days===1) return 'hier';
  if(days<7) return `il y a ${days} jours`;
  return d.toLocaleDateString('fr-FR', { day:'numeric', month:'short' });
}
function drawAdmin(){
  [...$('admin-resto').children].forEach(b=>b.classList.toggle('active', b.dataset.val===app.adminResto));
  const rows = app.adminRows || [];
  if(!app.cards){
    $('admin-kpis').innerHTML = ''; $('admin-table').innerHTML = ''; $('admin-weak').innerHTML = '';
    $('admin-detail').classList.add('hidden');
    return;
  }
  const resto = app.adminResto;
  const data = rows.map(r=>Object.assign({ row:r }, rowStats(r, resto)));
  const active = data.filter(d=>d.started);
  const avg = k => active.length ? Math.round(active.reduce((s,d)=>s+d[k],0)/active.length) : 0;
  $('admin-kpis').innerHTML = [
    [`${active.length}<span class="meta-line"> / ${rows.length}</span>`, 'Équipiers actifs'],
    [avg('carte')+'%','Moyenne carte'], [avg('allergenes')+'%','Moyenne allergènes'], [avg('vins')+'%','Moyenne vins'],
  ].map(([n,l])=>`<div class="kpi"><div class="n">${n}</div><div class="l">${l}</div></div>`).join('');

  const { key, dir } = app.adminSort;
  data.sort((a,b)=>{
    if(a.started!==b.started) return a.started ? -1 : 1;
    let va, vb;
    if(key==='name'){ va = a.row.name.toLowerCase(); vb = b.row.name.toLowerCase(); return dir * (va<vb?-1:va>vb?1:0); }
    if(key==='parties'){ va = a.row.parties; vb = b.row.parties; }
    else if(key==='updated'){ va = a.row.updated||''; vb = b.row.updated||''; return dir * (va<vb?-1:va>vb?1:0); }
    else { va = a[key]; vb = b[key]; }
    return dir * (va - vb);
  });
  const th = (k, label, num) => `<th data-k="${k}" class="${num?'num':''}">${label}${app.adminSort.key===k ? (app.adminSort.dir>0?' ▲':' ▼') : ''}</th>`;
  $('admin-table').innerHTML = `<thead><tr>${th('name','Nom')}${th('carte','Carte',1)}${th('allergenes','Allergènes',1)}${th('vins','Vins',1)}${th('parties','Parties',1)}${th('updated','Dernière partie',1)}</tr></thead><tbody>${
    data.length ? data.map(d=>`<tr data-email="${esc(d.row.email)}" class="${app.selected===d.row.email?'selected':''}">
      <td>${esc(d.row.name)}</td>
      ${d.started ? `<td class="num">${bar(d.carte)}</td><td class="num">${bar(d.allergenes)}</td><td class="num">${bar(d.vins)}</td>` : `<td class="num meta-line" colspan="3">pas encore joué sur ce restaurant</td>`}
      <td class="num">${d.row.parties}</td><td class="num">${fmtDate(d.row.updated)}</td></tr>`).join('')
    : `<tr><td colspan="6" class="meta-line">Personne n'a encore joué. Les progressions apparaîtront ici après les premières parties.</td></tr>`
  }</tbody>`;
  $('admin-table').querySelectorAll('th').forEach(t=>t.addEventListener('click', ()=>{
    const k = t.dataset.k;
    app.adminSort = { key:k, dir: app.adminSort.key===k ? -app.adminSort.dir : (k==='name'?1:-1) };
    drawAdmin();
  }));
  $('admin-table').querySelectorAll('tbody tr[data-email]').forEach(tr=>tr.addEventListener('click', ()=>{
    app.selected = app.selected===tr.dataset.email ? null : tr.dataset.email;
    drawAdmin();
    if(app.selected) $('admin-detail').scrollIntoView({ behavior:'smooth', block:'start' });
  }));
  drawDetail();
  drawTeamWeak(rows, resto);
}
function weakList(facts, resto){
  const D = app.cards.data, out = [], seenKeys = new Set();
  ADMIN_MODES.forEach(([, mode])=>{
    E.factsFor(D, resto, mode).forEach((label, k)=>{
      if(seenKeys.has(k)) return; seenKeys.add(k);
      const f = facts[k];
      if(f && f.n && f.k===0) out.push({ label, n: f.n });
    });
  });
  return out.sort((a,b)=>b.n-a.n);
}
function drawDetail(){
  const box = $('admin-detail');
  const row = (app.adminRows||[]).find(r=>r.email===app.selected);
  if(!row){ box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  const resto = app.adminResto, restoLabel = resto==='donna' ? 'DONNA' : 'Mamie Fada';
  const both = ['donna','mamiefada'].map(r=>{ const s = rowStats(row, r); return `<div class="kpi"><div class="l">${r==='donna'?'DONNA':'Mamie Fada'}</div><div class="meta-line">Carte <b>${s.carte}%</b> · Allergènes <b>${s.allergenes}%</b> · Vins <b>${s.vins}%</b></div></div>`; }).join('');
  const weak = weakList(row.facts, resto).slice(0, 12);
  box.innerHTML = `<div class="admin-head"><h3>${esc(row.name)}</h3><a href="#" id="detail-close" class="meta-line">Fermer</a></div>
    <div class="kpis">${both}</div>
    <div><span class="section-label">Points faibles — ${restoLabel}</span>${
      weak.length ? weak.map(w=>`<div class="weak-item"><span>${esc(w.label)}</span><span class="count">raté${w.n>1?` (vu ${w.n}×)`:''}</span></div>`).join('')
      : '<p class="meta-line">Rien de raté à la dernière tentative sur ce restaurant.</p>'
    }</div>`;
  $('detail-close').addEventListener('click', e=>{ e.preventDefault(); app.selected = null; drawAdmin(); });
}
function drawTeamWeak(rows, resto){
  const D = app.cards.data, counts = new Map();
  ADMIN_MODES.forEach(([, mode])=>{
    E.factsFor(D, resto, mode).forEach((label, k)=>{
      if(counts.has(k)) return;
      let c = 0;
      rows.forEach(r=>{ const f = r.facts[k]; if(f && f.n && f.k===0) c++; });
      if(c) counts.set(k, { label, c });
    });
  });
  const top = [...counts.values()].sort((a,b)=>b.c-a.c).slice(0, 10);
  $('admin-weak').innerHTML = top.length
    ? top.map(t=>`<div class="weak-item"><span>${esc(t.label)}</span><span class="count">${t.c} personne${t.c>1?'s':''}</span></div>`).join('')
    : '<p class="meta-line">Pas encore assez de parties pour dégager des points faibles.</p>';
}

// import des cartes
$('admin-import-btn').addEventListener('click', ()=> $('admin-import-input').click());
$('admin-import-input').addEventListener('change', e=>{
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if(!file) return;
  const msg = $('admin-import-msg');
  const say = (txt, kind) => { msg.className = 'notice ' + (kind||''); msg.innerHTML = txt; };
  const reader = new FileReader();
  reader.onload = async ()=>{
    let d;
    try{ d = JSON.parse(reader.result); }catch(err){ return say('Ce fichier n\'est pas un fichier de cartes valide (JSON illisible).', 'bad'); }
    const errs = E.validateCards(d);
    if(errs.length) return say('<b>Fichier refusé :</b> ' + errs.map(esc).join(' '), 'bad');
    const summary = r => `${d[r].dishes.length} plats, ${d[r].drinks.length} boissons, ${d[r].wines.length} vins`;
    if(!confirm(`Publier ces cartes pour toutes les équipes ?\n\nDONNA : ${summary('donna')}\nMamie Fada : ${summary('mamiefada')}\n\nLa progression des équipes est conservée pour tout ce qui n'a pas changé.`)) return;
    d.version = d.version || new Date().toISOString().slice(0,10);
    try{
      say('Publication en cours…');
      await store.saveCards(d);
      app.cards = await store.loadCards();
      say('<b>Cartes publiées.</b> Les équipes les verront à leur prochaine ouverture du quizz.', 'good');
      renderCardsInfo(); drawAdmin();
    }catch(err){
      console.error(err);
      say('Publication refusée : ' + esc(err.message), 'bad');
    }
  };
  reader.readAsText(file);
});

// outils démo
$('admin-demo-fill').addEventListener('click', async ()=>{
  if(!app.cards) return alert('Importe d\'abord les cartes.');
  await store.demoFill(app.cards.data);
  renderAdmin();
});
$('admin-demo-reset').addEventListener('click', async ()=>{
  if(!confirm('Effacer toutes les données de démonstration (cartes, progressions, code) ?')) return;
  await store.demoReset();
  try{ sessionStorage.removeItem('qc_admin_ok'); }catch(e){}
  location.reload();
});

boot();
})();
