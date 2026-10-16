// store.js — où vivent les données.
//  - DemoStore : tout dans le navigateur (quand config.js est vide).
//  - M365Store : connexion Microsoft + SharePoint du groupe (liste « Progressions »
//    et dossier « QuizzCartes » de la bibliothèque Documents du site).
// Les deux exposent exactement les mêmes méthodes, l'application ne fait pas la différence.
(function(){
'use strict';
const E = window.QuizEngine;

function applyResultsTo(facts, results){
  const out = Object.assign({}, facts);
  results.forEach(r=>{
    const k = E.factKey(r.factId);
    const cur = out[k] || { n:0, k:0 };
    out[k] = { n: cur.n+1, k: r.correct ? cur.k+1 : 0 };
  });
  return out;
}

async function hashCode(code){
  const txt = 'quizz-cartes:' + code;
  if(window.crypto && crypto.subtle){
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
    return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  return 'h' + E.strHash(txt);
}

// =====================================================================
// MODE DÉMO
// =====================================================================
function DemoStore(){
  const K = p => 'qc_demo_' + p;
  const get = (p, def) => { try{ const v = localStorage.getItem(K(p)); return v ? JSON.parse(v) : def; }catch(e){ return def; } };
  const set = (p, v) => { try{ localStorage.setItem(K(p), JSON.stringify(v)); }catch(e){} };
  let user = null;

  return {
    mode: 'demo',
    async init(){
      const name = get('user', null);
      if(name) user = { id: name.toLowerCase(), email: name.toLowerCase()+'@demo', name };
      return { user, needsLogin: !user };
    },
    async loginDemo(name){
      set('user', name);
      user = { id: name.toLowerCase(), email: name.toLowerCase()+'@demo', name };
      return user;
    },
    async login(){},
    async logout(){ try{ localStorage.removeItem(K('user')); }catch(e){} user = null; },
    get user(){ return user; },

    async loadCards(){
      const c = get('cards', null);
      return c ? { data: c.data, updatedAt: c.updatedAt, by: c.by } : null;
    },
    async saveCards(data){
      set('cards', { data, updatedAt: new Date().toISOString(), by: user ? user.name : '' });
    },

    async loadMyProgress(){
      const all = get('progress', {});
      const rec = all[user.email];
      return rec ? { facts: E.decodeFacts(rec.facts), parties: rec.parties||0 } : { facts:{}, parties:0 };
    },
    async saveResults(results){
      const all = get('progress', {});
      const rec = all[user.email] || { name: user.name, facts:'', parties:0 };
      const facts = applyResultsTo(E.decodeFacts(rec.facts), results);
      all[user.email] = { name: user.name, facts: E.encodeFacts(facts), parties: (rec.parties||0)+1, updated: new Date().toISOString() };
      set('progress', all);
      return { facts, parties: all[user.email].parties };
    },
    async loadAllProgress(){
      const all = get('progress', {});
      return Object.keys(all).map(email=>({
        email, name: all[email].name || email, facts: E.decodeFacts(all[email].facts),
        parties: all[email].parties||0, updated: all[email].updated || null,
      }));
    },
    async ensureSetup(){},
    async getAdminHash(){ return get('adminHash', null); },
    async setAdminHash(h){ set('adminHash', h); },
    hashCode,

    // outils démo
    async demoFill(DATA){
      const names = ['Léa','Hugo','Inès','Tom','Manon','Yanis','Chloé'];
      const all = get('progress', {});
      const ids = [];
      ['donna','mamiefada'].forEach(r=>['complet','allergenes','vins'].forEach(m=>{
        E.factsFor(DATA, r, m).forEach((_,k)=>ids.push(k));
      }));
      names.forEach((n,i)=>{
        const level = 0.15 + i*0.11;
        const facts = {};
        ids.forEach(k=>{
          if(Math.random() < level+0.2){
            const good = Math.random() < level+0.25;
            facts[k] = { n: 1+Math.floor(Math.random()*4), k: good ? 2+Math.floor(Math.random()*2) : (Math.random()<0.5?0:1) };
          }
        });
        all[n.toLowerCase()+'@demo'] = {
          name: n, facts: E.encodeFacts(facts), parties: 2+Math.floor(level*30),
          updated: new Date(Date.now() - Math.floor(Math.random()*9)*86400000).toISOString(),
        };
      });
      set('progress', all);
    },
    async demoReset(){
      ['progress','cards','adminHash','user'].forEach(p=>{ try{ localStorage.removeItem(K(p)); }catch(e){} });
    },
  };
}

// =====================================================================
// MICROSOFT 365 (SharePoint via Microsoft Graph)
// =====================================================================
function M365Store(cfg){
  const GRAPH = 'https://graph.microsoft.com/v1.0';
  const SCOPES = ['User.Read', 'Sites.ReadWrite.All'];
  const LIST_NAME = 'Progressions';
  const FOLDER = 'QuizzCartes';
  let msalApp = null, account = null, user = null, siteId = null, listId = null;

  async function token(){
    try{
      const r = await msalApp.acquireTokenSilent({ scopes: SCOPES, account });
      return r.accessToken;
    }catch(e){
      await msalApp.acquireTokenRedirect({ scopes: SCOPES, account });
      throw new Error('Redirection vers la connexion Microsoft…');
    }
  }
  async function graph(path, opts){
    opts = opts || {};
    const headers = Object.assign({ Authorization: 'Bearer ' + await token() }, opts.headers||{});
    if(opts.json!==undefined){ headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(opts.json); }
    const res = await fetch(path.startsWith('http') ? path : GRAPH + path, { method: opts.method||'GET', headers, body: opts.body });
    if(res.status===404 && opts.allow404) return null;
    if(!res.ok){
      let msg = res.status + ' ' + res.statusText;
      try{ const j = await res.json(); if(j.error && j.error.message) msg += ' — ' + j.error.message; }catch(e){}
      const err = new Error(msg); err.status = res.status; throw err;
    }
    if(res.status===204) return null;
    const ct = res.headers.get('content-type')||'';
    return ct.includes('json') ? res.json() : res.text();
  }
  async function getSiteId(){
    if(siteId) return siteId;
    const u = new URL(cfg.siteUrl);
    const site = await graph(`/sites/${u.hostname}:${u.pathname.replace(/\/$/,'')}`);
    siteId = site.id;
    return siteId;
  }
  async function getListId(create){
    if(listId) return listId;
    const sid = await getSiteId();
    const lists = await graph(`/sites/${sid}/lists?$select=id,displayName&$top=200`);
    const found = (lists.value||[]).find(l=>l.displayName===LIST_NAME);
    if(found){ listId = found.id; return listId; }
    if(!create) return null;
    const created = await graph(`/sites/${sid}/lists`, { method:'POST', json:{
      displayName: LIST_NAME,
      columns: [
        { name:'NomAffiche', text:{} },
        { name:'Facts', text:{ allowMultipleLines:true, textType:'plain' } },
        { name:'Parties', number:{} },
      ],
      list: { template:'genericList' },
    }});
    listId = created.id;
    return listId;
  }
  async function listAllItems(){
    const lid = await getListId(false);
    if(!lid) return [];
    const sid = await getSiteId();
    let url = `/sites/${sid}/lists/${lid}/items?$expand=fields($select=Title,NomAffiche,Facts,Parties)&$top=500`;
    const out = [];
    while(url){
      const page = await graph(url);
      (page.value||[]).forEach(it=>out.push(it));
      url = page['@odata.nextLink'] || null;
    }
    return out;
  }
  async function myItem(){
    const items = await listAllItems();
    return items.find(it => (it.fields.Title||'').toLowerCase() === user.email) || null;
  }
  async function readJsonFile(name){
    const sid = await getSiteId();
    const meta = await graph(`/sites/${sid}/drive/root:/${FOLDER}/${name}`, { allow404:true });
    if(!meta) return null;
    const res = await fetch(meta['@microsoft.graph.downloadUrl']);
    if(!res.ok) throw new Error('Lecture de ' + name + ' impossible (' + res.status + ')');
    return { json: await res.json(), meta };
  }
  async function writeJsonFile(name, obj){
    const sid = await getSiteId();
    return graph(`/sites/${sid}/drive/root:/${FOLDER}/${name}:/content`, {
      method:'PUT', body: JSON.stringify(obj), headers:{ 'Content-Type':'application/json' },
    });
  }

  return {
    mode: 'm365',
    async init(){
      msalApp = new msal.PublicClientApplication({
        auth: {
          clientId: cfg.clientId,
          authority: 'https://login.microsoftonline.com/' + cfg.tenantId,
          redirectUri: window.location.origin + window.location.pathname,
        },
        cache: { cacheLocation: 'localStorage' },
      });
      await msalApp.initialize();
      const resp = await msalApp.handleRedirectPromise();
      account = (resp && resp.account) || msalApp.getAllAccounts()[0] || null;
      if(!account) return { user:null, needsLogin:true };
      msalApp.setActiveAccount(account);
      user = { id: account.username.toLowerCase(), email: account.username.toLowerCase(), name: account.name || account.username };
      return { user, needsLogin:false };
    },
    async login(){ await msalApp.loginRedirect({ scopes: SCOPES }); },
    async logout(){ await msalApp.logoutRedirect({ account }); },
    get user(){ return user; },

    async loadCards(){
      const f = await readJsonFile('cartes.json');
      if(!f) return null;
      const by = f.meta.lastModifiedBy && f.meta.lastModifiedBy.user ? f.meta.lastModifiedBy.user.displayName : '';
      return { data: f.json, updatedAt: f.meta.lastModifiedDateTime, by };
    },
    async saveCards(data){ await writeJsonFile('cartes.json', data); },

    async loadMyProgress(){
      const it = await myItem();
      if(!it) return { facts:{}, parties:0 };
      return { facts: E.decodeFacts(it.fields.Facts), parties: it.fields.Parties||0 };
    },
    async saveResults(results){
      const lid = await getListId(false);
      if(!lid) throw new Error("La liste « Progressions » n'existe pas encore : un manager doit d'abord ouvrir l'espace manager.");
      const sid = await getSiteId();
      const it = await myItem(); // relu juste avant l'écriture (autre appareil possible)
      const facts = applyResultsTo(it ? E.decodeFacts(it.fields.Facts) : {}, results);
      const fields = { NomAffiche: user.name, Facts: E.encodeFacts(facts), Parties: ((it && it.fields.Parties)||0) + 1 };
      if(it) await graph(`/sites/${sid}/lists/${lid}/items/${it.id}/fields`, { method:'PATCH', json: fields });
      else await graph(`/sites/${sid}/lists/${lid}/items`, { method:'POST', json:{ fields: Object.assign({ Title: user.email }, fields) } });
      return { facts, parties: fields.Parties };
    },
    async loadAllProgress(){
      const items = await listAllItems();
      return items.map(it=>({
        email: (it.fields.Title||'').toLowerCase(),
        name: it.fields.NomAffiche || it.fields.Title,
        facts: E.decodeFacts(it.fields.Facts),
        parties: it.fields.Parties||0,
        updated: it.lastModifiedDateTime || null,
      }));
    },
    async ensureSetup(){
      await getListId(true);
      const sid = await getSiteId();
      try{
        await graph(`/sites/${sid}/drive/root/children`, { method:'POST', json:{ name: FOLDER, folder:{}, '@microsoft.graph.conflictBehavior':'fail' } });
      }catch(e){ if(e.status!==409) throw e; }
    },
    async getAdminHash(){
      const f = await readJsonFile('config.json');
      return f && f.json ? f.json.adminHash || null : null;
    },
    async setAdminHash(h){ await writeJsonFile('config.json', { adminHash: h }); },
    hashCode,
  };
}

window.createStore = function(){
  const cfg = window.QUIZZ_CONFIG || {};
  return (cfg.clientId && cfg.tenantId && cfg.siteUrl) ? M365Store(cfg) : DemoStore();
};
})();
