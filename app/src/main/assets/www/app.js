/* AoE II Wiki — an unofficial, ad-free reader for the Age of Empires Series Wiki (Fandom).
   Article text is written by the wiki's contributors and licensed CC BY-SA 3.0.
   Not affiliated with Fandom or Microsoft. */
'use strict';
(() => {
  const WIKI = 'https://ageofempires.fandom.com';
  const WIKI_HOST = 'ageofempires.fandom.com';
  const API = '/proxy/api';
  const PREFIX = 'Age of Empires II';
  const DAY = 864e5;
  const START = ['Age of Empires II: Definitive Edition', 'Civilizations (Age of Empires II)', 'Age of Empires II'];
  const SUGGEST = ['Britons', 'Knight', 'Castle', 'Bloodlines', 'Trebuchet', 'Mangudai', 'Wonder', 'Imperial Age'];

  // Native bridge (window.Android) with a stand-in for desktop testing.
  const A = window.Android || {
    isSystemDark: () => matchMedia('(prefers-color-scheme: dark)').matches,
    setThemeColors() {}, openExternal: u => window.open(u, '_blank'), share() {}, keepScreenOn() {},
    prefetch: j => JSON.parse(j).length,
    prefetchStatus: () => '{"queued":0,"done":0,"failed":0,"pending":0}',
    cancelPrefetch() {}, mediaCacheInfo: () => '{"files":0,"bytes":0}', clearMediaCache() {},
    isOnline: () => navigator.onLine, appVersion: () => 'dev',
  };
  const call = (fn, ...args) => { try { return A[fn](...args); } catch (e) { return undefined; } };
  const online = () => { const v = call('isOnline'); return v === undefined ? navigator.onLine : !!v; };

  const $ = (s, r = document) => r.querySelector(s);
  const view = $('#view'), bar = $('#bar'), overlay = $('#overlay'), toastEl = $('#toast');

  // ------------------------------------------------------------------ utils
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const plain = s => new DOMParser().parseFromString(String(s ?? ''), 'text/html').body.textContent.trim();
  const safeDecode = s => { try { return decodeURIComponent(s); } catch (e) { return s; } };
  function normTitle(t) {
    t = String(t ?? '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
  }
  const encT = t => encodeURIComponent(normTitle(t).replace(/ /g, '_'));
  const decT = s => normTitle(safeDecode(s));
  const SUFFIX = /\s*\(Age of Empires II(?:[:\s][^)]*)?\)\s*$/;
  const shortName = t => String(t).replace(SUFFIX, '') || String(t);
  const isAoe2Title = t => /\(Age of Empires II(?:[:\s][^)]*)?\)/.test(t);
  const OTHER_GAME_TITLE = /\((?:Age of Empires(?: III| IV| Online|: Castle Siege| Mobile)?|Age of Mythology[^)]*)\)\s*$/;
  const isMediaHost = h => /(^|\.)nocookie\.net$/i.test(h || '');
  const canon = u => { try { return new URL(u, WIKI + '/').href; } catch (e) { return ''; } };
  function fmtBytes(b) {
    if (!b) return '0 MB';
    if (b < 1048576) return Math.max(1, Math.round(b / 1024)) + ' KB';
    return (b / 1048576).toFixed(b < 1e8 ? 1 : 0) + ' MB';
  }
  function ago(ts) {
    const d = Math.floor((Date.now() - ts) / DAY);
    if (d <= 0) return 'today';
    if (d === 1) return 'yesterday';
    if (d < 30) return d + ' days ago';
    const m = Math.floor(d / 30);
    return m === 1 ? 'a month ago' : m + ' months ago';
  }
  async function pool(items, n, fn, stop) {
    let i = 0;
    const worker = async () => {
      while (i < items.length) {
        if (stop && stop()) return;
        const k = i++;
        await fn(items[k], k);
      }
    };
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  }

  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage full or blocked */ } },
  };

  const ICONS = {
    back: '<path d="M15 18l-6-6 6-6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/>',
    settings: '<path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17" r="2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6L6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    bookmark: '<path d="M6.5 3.5h11v17L12 16.5l-5.5 4z"/>',
    more: '<circle cx="12" cy="5" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="12" cy="19" r="1.3"/>',
    share: '<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="M8.2 10.8l7.6-4.1M8.2 13.2l7.6 4.1"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    refresh: '<path d="M20 12a8 8 0 1 1-2.4-5.7M20 4v5h-5"/>',
    download: '<path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5M4.5 19.5h15"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    pause: '<path d="M8.5 5v14M15.5 5v14"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    folder: '<path d="M3 7a1.5 1.5 0 0 1 1.5-1.5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
    shield: '<path d="M12 3l7.5 3v6c0 4.8-3.3 8.2-7.5 9.3C7.8 20.2 4.5 16.8 4.5 12V6z"/><path d="M12 7.5v9M8 11h8"/>',
    sword: '<path d="M20 4l-9.5 9.5M20 4h-4.5M20 4v4.5"/><path d="M6.5 12l5.5 5.5M9 15l-4.5 4.5"/>',
    castle: '<path d="M3.5 20.5V8h2.5v2.5h2.5V8H11v2.5h2V8h2.5v2.5H18V8h2.5v12.5z"/><path d="M10 20.5v-4a2 2 0 0 1 4 0v4"/>',
    book: '<path d="M3 5h5.5A3.5 3.5 0 0 1 12 8.5V20a2.5 2.5 0 0 0-2.5-2.5H3z"/><path d="M21 5h-5.5A3.5 3.5 0 0 0 12 8.5V20a2.5 2.5 0 0 1 2.5-2.5H21z"/>',
    flag: '<path d="M5.5 21V4"/><path d="M5.5 4.5h12l-2.5 4 2.5 4h-12"/>',
    crown: '<path d="M3.5 17.5L5 7.5l4.5 4.5L12 5l2.5 7 4.5-4.5 1.5 10z"/><path d="M4 20.5h16"/>',
    map: '<path d="M3 6.5l6-2 6 2 6-2v13l-6 2-6-2-6 2z"/><path d="M9 4.5v13M15 6.5v13"/>',
    cloudoff: '<path d="M3 3l18 18"/><path d="M8.5 6.3A6 6 0 0 1 17.6 10 4 4 0 0 1 20 17.2M16.5 18H7a4.5 4.5 0 0 1-1.6-8.7"/>',
    alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/>',
  };
  const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  const EMBLEM = '<svg class="emblem" viewBox="0 0 48 48" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M12 6h5v4h4V6h6v4h4V6h5v12h-2.5v24h-19V18H12zM20.5 42v-7a3.5 3.5 0 0 1 7 0v7zM22.5 22h3v7h-3z"/></svg>';

  // ------------------------------------------------------------------ settings & state
  const S = {
    theme: LS.get('theme', 'system'),
    scale: LS.get('scale', 1),
    images: LS.get('images', true),
    recent: LS.get('recent', []),
    marks: LS.get('marks', []),
  };
  const Stats = { pages: 0, bytes: 0 };
  const savedKeys = new Set();
  let titleList = null;

  // ------------------------------------------------------------------ IndexedDB
  let dbPromise = null;
  function db() {
    if (!dbPromise) {
      dbPromise = new Promise((res, rej) => {
        const r = indexedDB.open('aoe2wiki', 1);
        r.onupgradeneeded = () => {
          for (const s of ['pages', 'idx', 'alias', 'meta']) {
            if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, { keyPath: 'k' });
          }
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    }
    return dbPromise;
  }
  const rq = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const store = async (name, mode = 'readonly') => (await db()).transaction(name, mode).objectStore(name);
  const dbGet = async (n, k) => (k ? rq((await store(n)).get(k)) : undefined);
  const dbPut = async (n, v) => rq((await store(n, 'readwrite')).put(v));
  const dbDel = async (n, k) => rq((await store(n, 'readwrite')).delete(k));
  const dbAll = async n => rq((await store(n)).getAll());
  const dbKeys = async n => rq((await store(n)).getAllKeys());
  const dbClear = async n => rq((await store(n, 'readwrite')).clear());
  async function dbTx(names, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const tx = d.transaction(names, 'readwrite');
      fn(Object.fromEntries(names.map(n => [n, tx.objectStore(n)])));
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error);
    });
  }
  const meta = {
    get: async k => { const r = await dbGet('meta', k); return r ? r.v : null; },
    set: (k, v) => dbPut('meta', { k, v }),
  };
  const Catalog = {
    v: undefined,
    async get() { if (this.v === undefined) this.v = (await meta.get('catalog').catch(() => null)) || null; return this.v; },
    set(v) { this.v = v; },
  };

  async function gz(str) {
    try {
      if (typeof CompressionStream === 'undefined') return str;
      const s = new Blob([str]).stream().pipeThrough(new CompressionStream('gzip'));
      return await new Response(s).arrayBuffer();
    } catch (e) { return str; }
  }
  async function gunz(v) {
    if (typeof v === 'string') return v;
    const s = new Blob([v]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(s).text();
  }

  // ------------------------------------------------------------------ wiki API
  class NetError extends Error { constructor(m, status) { super(m); this.name = 'NetError'; this.status = status; } }
  const isNetErr = e => !!e && (e.name === 'NetError' || e.name === 'AbortError' || e.name === 'TypeError');

  async function api(params, { timeout = 30000, retries = 2 } = {}) {
    const qs = new URLSearchParams({ format: 'json', formatversion: '2', ...params });
    for (let attempt = 0; ; attempt++) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeout);
      try {
        let r;
        try { r = await fetch(API + '?' + qs, { signal: ctl.signal, cache: 'no-store' }); } catch (e) { throw new NetError('Network unavailable'); }
        if (r.status === 429 || r.status >= 500) throw new NetError('Server error ' + r.status, r.status);
        let j;
        try { j = await r.json(); } catch (e) { throw new NetError('Bad response', r.status); }
        if (j && j.error) { const e = new Error(j.error.info || j.error.code || 'API error'); e.code = j.error.code; throw e; }
        return j;
      } catch (e) {
        if (!isNetErr(e) || attempt >= retries || !online()) throw e;
        await sleep(700 * (attempt + 1) * (e.status === 429 ? 4 : 1));
      } finally {
        clearTimeout(timer);
      }
    }
  }

  // Follows API continuation and merges generator pages and list results.
  async function apiAll(params, maxReq = 100) {
    let cont = {};
    const pages = new Map();
    const lists = {};
    for (let i = 0; i < maxReq; i++) {
      const j = await api({ ...params, ...cont });
      const q = j.query || {};
      for (const p of q.pages || []) {
        const key = p.pageid || p.title;
        const prev = pages.get(key);
        pages.set(key, prev ? Object.assign(prev, p) : p);
      }
      for (const k of Object.keys(q)) if (k !== 'pages' && Array.isArray(q[k])) (lists[k] = lists[k] || []).push(...q[k]);
      if (!j.continue) break;
      cont = j.continue;
    }
    return { pages: [...pages.values()], lists };
  }

  // ------------------------------------------------------------------ categories & sections
  const MAINT = /\b(stubs?|images?|screenshots?|files?|audio|sounds?|videos?|icons?|templates?|navbox(es)?|needing|cleanup|candidates|disambiguations?|galler(y|ies)|portraits?|concept art|artwork|sprites?|music|soundtracks?|quotes|hidden|maintenance|redirects?|deletion|infobox(es)?)\b/i;
  const OTHER_GAME = /Age of Empires (III|IV|Online|Mobile)|Age of Mythology|Castle Siege|World Domination|Age of Empires: Definitive|^Age of Empires$/i;
  const SECTIONS = [
    { key: 'civilizations', label: 'Civilizations', icon: 'shield', re: /civili[sz]ation/i },
    { key: 'units', label: 'Units', icon: 'sword', re: /\bunits?\b|infantry|cavalry|archers?\b|siege|ships?\b|naval|monks?\b|villagers?/i },
    { key: 'buildings', label: 'Buildings', icon: 'castle', re: /buildings?|wonders?\b|structures?|fortifications?|walls?\b|towers?\b/i },
    { key: 'technologies', label: 'Technologies', icon: 'book', re: /technolog|upgrades?\b|research/i },
    { key: 'campaigns', label: 'Campaigns', icon: 'flag', re: /campaigns?|scenarios?|historical battles?|missions?|chronicles/i },
    { key: 'heroes', label: 'Heroes', icon: 'crown', re: /heroes|\bhero\b|characters?|people\b|leaders?|persons?/i },
    { key: 'maps', label: 'Maps & modes', icon: 'map', re: /\bmaps?\b|game modes?|\bmodes?\b|terrains?/i },
  ];
  const isAoe2Cat = n => n.startsWith(PREFIX) && (n.length === PREFIX.length || /^[\s:(,–—-]/.test(n.slice(PREFIX.length)));
  const catRest = n => (isAoe2Cat(n) ? n.slice(PREFIX.length).replace(/^[\s:–—-]+/, '').trim() : n);
  const catLabel = n => cap(catRest(n)) || n;

  async function loadCategories(force = false) {
    const cached = await meta.get('cats').catch(() => null);
    if (cached && !force && (Date.now() - cached.at < 7 * DAY || !online())) return cached.list;
    try {
      const found = new Map();
      const { lists } = await apiAll({ action: 'query', list: 'allcategories', acprefix: PREFIX, aclimit: 'max', acprop: 'size' }, 20);
      for (const c of lists.allcategories || []) {
        const name = c.category || c['*'] || c.title;
        if (!name || !isAoe2Cat(name) || MAINT.test(name)) continue;
        const pages = c.pages ?? c.size ?? 1;
        if (pages > 0 || (c.subcats || 0) > 0) found.set(name, { name, pages, subcats: c.subcats || 0 });
      }
      if (found.size < 3) {
        // Fallback: find categories by name search.
        const { lists: l2 } = await apiAll({ action: 'query', list: 'search', srsearch: `"${PREFIX}"`, srnamespace: '14', srlimit: '500' }, 4);
        for (const r of l2.search || []) {
          const name = r.title.replace(/^Category:/, '');
          if (/Age of Empires II(?!I)/.test(name) && !MAINT.test(name) && !found.has(name)) found.set(name, { name, pages: 0, subcats: 0 });
        }
      }
      const list = [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
      if (!list.length) throw new Error('No Age of Empires II categories found on the wiki.');
      await meta.set('cats', { at: Date.now(), list }).catch(() => {});
      return list;
    } catch (e) {
      if (cached) return cached.list;
      throw e;
    }
  }

  async function fetchMembers(cat, ns = '0') {
    const { pages } = await apiAll({
      action: 'query', generator: 'categorymembers', gcmtitle: 'Category:' + cat, gcmnamespace: ns, gcmlimit: '50',
      prop: 'info|pageimages', piprop: 'thumbnail', pithumbsize: '120', pilimit: '50',
    }, 400);
    return pages.filter(p => p.title && !p.missing).map(p => ({
      t: p.title, ns: p.ns, r: p.lastrevid || 0, th: p.thumbnail && p.thumbnail.source ? canon(p.thumbnail.source) : '',
    }));
  }

  const sortItems = items => items.sort((a, b) => shortName(a.t).localeCompare(shortName(b.t), 'en', { sensitivity: 'base' }));

  function deriveSection(cat, sec) {
    const idx = cat.cats.map((n, i) => (sec.re.test(catRest(n)) ? i : -1)).filter(i => i >= 0);
    const remap = new Map(idx.map((ci, j) => [ci, j]));
    const items = cat.items.filter(it => it.c.some(c => remap.has(c)))
      .map(it => ({ t: it.t, th: it.th, c: it.c.filter(c => remap.has(c)).map(c => remap.get(c)) }));
    return { at: cat.at, cats: idx.map(i => cat.cats[i]), items: sortItems(items) };
  }

  async function sectionData(key, force = false) {
    const sec = SECTIONS.find(s => s.key === key);
    const mk = 'sec:' + key;
    const stale = await meta.get(mk).catch(() => null);
    if (stale && !force && (Date.now() - stale.at < 7 * DAY || !online())) return stale;
    try {
      if (!online()) throw new NetError('offline');
      const cats = (await loadCategories()).filter(c => sec.re.test(catRest(c.name)));
      const items = new Map();
      let errors = 0;
      await pool(cats, 4, async (c, i) => {
        try {
          for (const m of await fetchMembers(c.name)) {
            const k = normTitle(m.t);
            const it = items.get(k) || { t: m.t, th: m.th, c: [] };
            if (!it.th) it.th = m.th;
            it.c.push(i);
            items.set(k, it);
          }
        } catch (e) { errors++; }
      });
      if (!items.size && errors) throw new NetError('Could not load the list');
      const data = { at: Date.now(), cats: cats.map(c => c.name), items: sortItems([...items.values()]) };
      await meta.set(mk, data).catch(() => {});
      return data;
    } catch (e) {
      if (stale) return stale;
      const cat = await Catalog.get();
      if (cat) return deriveSection(cat, sec);
      throw e;
    }
  }

  async function categoryData(name) {
    const mk = 'cat:' + name;
    const stale = await meta.get(mk).catch(() => null);
    if (stale && (Date.now() - stale.at < 7 * DAY || !online())) return stale;
    try {
      const ms = await fetchMembers(name, '0|14');
      const data = {
        at: Date.now(),
        subs: ms.filter(m => m.ns === 14).map(m => m.t.replace(/^Category:/, '')).sort(),
        items: sortItems(ms.filter(m => m.ns === 0)),
      };
      meta.set(mk, data).catch(() => {});
      return data;
    } catch (e) {
      if (stale) return stale;
      const cat = await Catalog.get();
      const i = cat ? cat.cats.indexOf(name) : -1;
      if (i >= 0) return { at: cat.at, subs: [], items: sortItems(cat.items.filter(it => it.c.includes(i))) };
      throw e;
    }
  }

  // ------------------------------------------------------------------ pages
  async function fetchPage(title) {
    const j = await api({
      action: 'parse', page: title, prop: 'text|displaytitle|revid|categories',
      redirects: '1', disableeditsection: '1', disabletoc: '1', disablelimitreport: '1',
    });
    const p = j.parse || {};
    const html = typeof p.text === 'string' ? p.text : p.text && p.text['*'];
    if (typeof html !== 'string') throw Object.assign(new Error('Empty page'), { code: 'empty' });
    const real = p.title || title;
    const redirects = (p.redirects || []).map(r => r.from);
    if (normTitle(real) !== normTitle(title)) redirects.push(title);
    return {
      title: real,
      display: p.displaytitle || real,
      revid: p.revid || 0,
      html,
      cats: (p.categories || []).filter(c => !c.hidden).map(c => c.category || c['*']).filter(Boolean),
      redirects,
      at: Date.now(),
    };
  }

  function imgSrc(img) {
    const s = img.getAttribute('data-src') || img.getAttribute('src') || '';
    if (!s || s.startsWith('data:')) return '';
    return canon(s);
  }
  function extractImages(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const out = new Set();
    for (const img of doc.querySelectorAll('img')) { const u = imgSrc(img); if (u && isMediaHost(new URL(u).hostname)) out.add(u); }
    return [...out];
  }

  async function savePage(p) {
    const k = normTitle(p.title);
    const data = await gz(p.html);
    const size = data.byteLength ?? data.length ?? 0;
    const im = extractImages(p.html);
    const old = await dbGet('idx', k).catch(() => null);
    const at = Date.now();
    await dbTx(['pages', 'idx', 'alias'], s => {
      s.pages.put({ k, title: p.title, display: p.display, revid: p.revid, cats: p.cats, html: data, at });
      s.idx.put({ k, t: p.title, d: plain(p.display || p.title), r: p.revid, b: size, im, at });
      for (const f of p.redirects || []) { const fk = normTitle(f); if (fk && fk !== k) s.alias.put({ k: fk, to: k }); }
    });
    if (!old) { Stats.pages++; savedKeys.add(k); titleList = null; }
    Stats.bytes += size - (old ? old.b || 0 : 0);
    return im;
  }

  async function loadStored(title) {
    const k = normTitle(title);
    let r = await dbGet('pages', k);
    if (!r) { const al = await dbGet('alias', k); if (al) r = await dbGet('pages', al.to); }
    if (!r) return null;
    return { ...r, html: await gunz(r.html), stored: true };
  }

  async function loadStats() {
    try {
      const all = await dbAll('idx');
      Stats.pages = all.length;
      Stats.bytes = all.reduce((s, x) => s + (x.b || 0), 0);
      for (const x of all) savedKeys.add(x.k);
    } catch (e) { /* no storage */ }
  }

  async function allTitles() {
    if (titleList) return titleList;
    const m = new Map();
    try { for (const x of await dbAll('idx')) m.set(x.k, x.t); } catch (e) { /* ignore */ }
    const cat = await Catalog.get();
    if (cat) for (const it of cat.items) { const k = normTitle(it.t); if (!m.has(k)) m.set(k, it.t); }
    titleList = [...m.values()];
    return titleList;
  }

  // ------------------------------------------------------------------ dark-mode colour adaptation
  const CTX = document.createElement('canvas').getContext('2d');
  function parseColor(str) {
    const s = String(str || '').trim();
    if (!s || /^(transparent|inherit|initial|unset|currentcolor|none)$/i.test(s)) return null;
    CTX.fillStyle = '#010203';
    CTX.fillStyle = s;
    const v = CTX.fillStyle;
    if (v === '#010203' && s.toLowerCase() !== '#010203') return null;
    if (v[0] === '#') return [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16), 1];
    const m = v.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(',').map(parseFloat);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  }
  function rgb2hsl([r, g, b]) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (mx + mn) / 2;
    if (mx !== mn) {
      const d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h /= 6;
    }
    return [h, s, l];
  }
  const hsl = (h, s, l, a) => `hsla(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%, ${a})`;
  function darkBg(str) {
    const c = parseColor(str);
    if (!c || c[3] === 0) return null;
    const [h, s, l] = rgb2hsl(c);
    if (l < 0.42) return null;
    return hsl(h, Math.min(s, 0.5), 0.09 + (1 - l) * 0.42, c[3]);
  }
  function darkFg(str) {
    const c = parseColor(str);
    if (!c) return null;
    const [h, s, l] = rgb2hsl(c);
    if (l > 0.6) return null;
    return hsl(h, Math.min(s, 0.7), 0.93 - l * 0.45, c[3]);
  }
  const COLOR_TOKEN = /#[0-9a-f]{3,8}\b|(?:rgba?|hsla?)\([^)]*\)|\b(?:white|black|whitesmoke|snow|ivory|beige|linen|lavender|gainsboro|silver|gr[ae]y|lightgr[ae]y|darkgr[ae]y|dimgr[ae]y|aliceblue|azure|honeydew|mintcream|oldlace|seashell|floralwhite|ghostwhite|cornsilk|lemonchiffon|lightyellow|lightcyan|lightblue|lightgreen|lightpink|mistyrose|papayawhip|blanchedalmond|bisque|wheat|moccasin|navajowhite|peachpuff|antiquewhite|khaki|palegoldenrod|yellow|gold|orange|red|green|blue|navy|maroon|purple|teal|olive)\b/gi;
  function adaptCss(text) {
    return String(text)
      .replace(/(background(?:-color|-image)?\s*:\s*)([^;}]+)/gi, (m, p, v) => (/url\(/i.test(v) ? m : p + v.replace(COLOR_TOKEN, c => darkBg(c) || c)))
      .replace(/((?:^|[;{\s])color\s*:\s*)([^;}]+)/gi, (m, p, v) => p + v.replace(COLOR_TOKEN, c => darkFg(c) || c));
  }
  function adaptColors(root) {
    for (const el of root.querySelectorAll('[style]')) {
      const st = el.getAttribute('style');
      if (/color|background/i.test(st)) el.setAttribute('style', adaptCss(st));
    }
    for (const el of root.querySelectorAll('[bgcolor]')) {
      const v = darkBg(el.getAttribute('bgcolor'));
      el.removeAttribute('bgcolor');
      if (v) el.style.backgroundColor = v;
    }
    for (const el of root.querySelectorAll('font[color]')) {
      const v = darkFg(el.getAttribute('color'));
      el.removeAttribute('color');
      if (v) el.style.color = v;
    }
    for (const st of root.querySelectorAll('style')) st.textContent = adaptCss(st.textContent);
  }

  // ------------------------------------------------------------------ article HTML clean-up
  const EXT_NS = /^(Special|User|User talk|User blog|User blog comment|Talk|Template|Template talk|Message Wall|Message Wall Greeting|Board|Board Thread|Thread|Forum|MediaWiki|Module|Help|Blog|Map|Project|Age of Empires Series Wiki)$/i;

  function fixLink(a) {
    const href = a.getAttribute('href') || '';
    a.removeAttribute('target');
    if (href.startsWith('#')) { a.setAttribute('data-anchor', safeDecode(href.slice(1))); return; }
    let u;
    try { u = new URL(href, WIKI + '/wiki/'); } catch (e) { a.removeAttribute('href'); return; }
    if (!/^https?:$/.test(u.protocol)) { a.removeAttribute('href'); return; }
    if (isMediaHost(u.hostname)) { a.setAttribute('data-img', u.href); a.setAttribute('href', '#'); return; }
    if (u.hostname === WIKI_HOST) {
      const action = u.searchParams.get('action');
      if (u.searchParams.get('redlink') === '1' || (action && action !== 'view')) {
        const s = a.ownerDocument.createElement('span');
        s.className = 'redlink';
        s.append(...a.childNodes);
        a.replaceWith(s);
        return;
      }
      let title = null;
      if (u.pathname.startsWith('/wiki/')) title = safeDecode(u.pathname.slice(6));
      else if (u.searchParams.get('title')) title = u.searchParams.get('title');
      if (title) {
        title = normTitle(title);
        const ci = title.indexOf(':');
        const ns = ci > 0 ? title.slice(0, ci) : '';
        if (/^Category$/i.test(ns)) { a.setAttribute('href', '#/category/' + encT(title.slice(ci + 1))); return; }
        if (/^(File|Image|Media)$/i.test(ns)) {
          const im = a.querySelector('img');
          if (im) { a.setAttribute('data-img', im.getAttribute('src') || ''); a.setAttribute('href', '#'); }
          else a.setAttribute('data-ext', u.href);
          return;
        }
        if (EXT_NS.test(ns)) { a.setAttribute('data-ext', u.href); return; }
        a.setAttribute('href', '#/wiki/' + encT(title) + (u.hash || ''));
        return;
      }
    }
    a.setAttribute('data-ext', u.href);
    a.setAttribute('href', u.href);
  }

  function transform(root, dark) {
    const doc = root.ownerDocument;
    root.querySelectorAll('script, noscript, iframe, object, embed, form, link, meta, input, button, textarea, select, ' +
      '.mw-editsection, .toc, #toc, .printfooter, .mw-empty-elt, .navbar, .wikia-ad, .ad-slot, [id^="gpt-"]').forEach(n => n.remove());
    for (const el of root.querySelectorAll('*')) {
      for (const at of [...el.attributes]) if (/^on/i.test(at.name)) el.removeAttribute(at.name);
    }
    for (const img of root.querySelectorAll('img')) {
      const u = imgSrc(img);
      if (u) img.setAttribute('src', u);
      for (const a of ['data-src', 'srcset', 'data-srcset', 'sizes']) img.removeAttribute(a);
      img.classList.remove('lazyload', 'lazyloaded');
      img.setAttribute('loading', 'lazy');
      img.setAttribute('decoding', 'async');
    }
    for (const m of root.querySelectorAll('audio, video')) { m.setAttribute('preload', 'none'); m.setAttribute('controls', ''); }
    for (const a of [...root.querySelectorAll('a[href]')]) fixLink(a);

    // Collapsed blocks: show them (navboxes get their own collapsible below).
    root.querySelectorAll('.mw-collapsed').forEach(n => n.classList.remove('mw-collapsed'));
    root.querySelectorAll('.mw-collapsible-content').forEach(n => n.style.removeProperty('display'));

    // Old-style tabbers → same structure as Fandom's wds tabber.
    for (const tb of root.querySelectorAll('.tabber')) {
      if (tb.classList.contains('wds-tabber')) continue;
      const tabs = [...tb.children].filter(c => c.classList.contains('tabbertab'));
      if (!tabs.length) continue;
      const ul = doc.createElement('ul');
      ul.className = 'wds-tabs';
      tabs.forEach((t, i) => {
        const li = doc.createElement('li');
        li.className = 'wds-tabs__tab' + (i ? '' : ' wds-is-current');
        li.textContent = t.getAttribute('title') || t.getAttribute('data-title') || 'Tab ' + (i + 1);
        ul.append(li);
        t.classList.add('wds-tab__content');
        if (!i) t.classList.add('wds-is-current');
      });
      tb.classList.add('wds-tabber');
      tb.prepend(ul);
    }
    for (const tb of root.querySelectorAll('.wds-tabber')) {
      const own = sel => [...tb.querySelectorAll(sel)].filter(n => n.closest('.wds-tabber') === tb);
      const tabs = own('.wds-tabs__tab'), cs = own('.wds-tab__content');
      if (cs.length && !cs.some(c => c.classList.contains('wds-is-current'))) {
        cs[0].classList.add('wds-is-current');
        if (tabs[0]) tabs[0].classList.add('wds-is-current');
      }
    }

    // Navigation boxes collapse into a <details>.
    for (const nb of [...root.querySelectorAll('.navbox')]) {
      if (nb.parentElement && nb.parentElement.closest('.navbox, details.nav')) continue;
      const tEl = nb.querySelector('.navbox-title, th, caption');
      const label = (tEl ? tEl.textContent : '').replace(/\b[vV]\s*[·•]\s*[dDtT]\s*[·•]\s*[eE]\b/g, '').replace(/\[?\s*(show|hide)\s*\]?/gi, '').trim() || 'Navigation';
      const det = doc.createElement('details');
      det.className = 'nav';
      const sum = doc.createElement('summary');
      sum.textContent = label;
      const inner = doc.createElement('div');
      inner.className = 'nav-inner';
      nb.replaceWith(det);
      inner.append(nb);
      det.append(sum, inner);
    }

    // Wide tables scroll sideways.
    for (const t of [...root.querySelectorAll('table')]) {
      if (t.closest('.portable-infobox, details.nav, .tw')) continue;
      const w = doc.createElement('div');
      w.className = 'tw';
      t.replaceWith(w);
      w.append(t);
    }

    if (dark) adaptColors(root);
  }

  // ------------------------------------------------------------------ theme
  const isDark = () => S.theme === 'dark' || (S.theme === 'system' && !!call('isSystemDark'));
  function applyTheme() {
    const dark = isDark();
    const rootEl = document.documentElement;
    rootEl.dataset.theme = dark ? 'dark' : 'light';
    rootEl.style.setProperty('--scale', String(S.scale));
    const bg = getComputedStyle(rootEl).getPropertyValue('--bg').trim();
    call('setThemeColors', dark, bg);
  }
  function setTheme(t) { S.theme = t; LS.set('theme', t); applyTheme(); rerender(); }
  const toggleTheme = () => setTheme(isDark() ? 'light' : 'dark');
  window.onSystemTheme = () => { if (S.theme === 'system') { applyTheme(); rerender(); } };

  // ------------------------------------------------------------------ UI helpers
  function iconBtn(name, label, fn, cls = '') {
    const b = document.createElement('button');
    b.className = 'ib ' + cls;
    b.type = 'button';
    b.setAttribute('aria-label', label);
    b.innerHTML = icon(name);
    b.addEventListener('click', fn);
    return b;
  }
  const themeBtn = () => iconBtn(isDark() ? 'sun' : 'moon', isDark() ? 'Light mode' : 'Dark mode', toggleTheme);

  function setBar({ home = false, back = false, title = '', search = null, actions = [] } = {}) {
    bar.replaceChildren();
    if (back) bar.append(iconBtn('back', 'Back', goBack));
    if (home) {
      const b = document.createElement('div');
      b.className = 'brand';
      b.innerHTML = EMBLEM + '<span>AoE II Wiki</span>';
      bar.append(b);
    } else if (search !== null) {
      const i = document.createElement('input');
      Object.assign(i, { type: 'search', className: 'search-input', placeholder: 'Search the wiki', value: search, autocomplete: 'off' });
      i.setAttribute('enterkeyhint', 'search');
      bar.append(i);
    } else {
      const t = document.createElement('div');
      t.className = 'title';
      t.textContent = title;
      bar.append(t);
    }
    for (const a of actions) bar.append(a);
  }

  function rowHtml(it, { subHtml = '' } = {}) {
    const name = shortName(it.d || it.t);
    const letter = (name.replace(/^[^\p{L}\p{N}]+/u, '').charAt(0) || '•').toUpperCase();
    const th = it.th ? `<img class="ti" src="${esc(it.th)}" alt="" loading="lazy">` : `<span class="ti ph">${esc(letter)}</span>`;
    const saved = savedKeys.has(normTitle(it.t)) ? `<span class="sv" aria-label="Saved offline">${icon('check')}</span>` : '';
    return `<li><a class="row" href="#/wiki/${encT(it.t)}">${th}<span class="row-t">${esc(name)}${subHtml ? `<small>${subHtml}</small>` : ''}</span>${saved}</a></li>`;
  }
  const loadingHtml = (art = false) => `<div class="skel">${art ? '<i class="sk h"></i>' : ''}<i class="sk"></i><i class="sk"></i><i class="sk s"></i><i class="sk"></i><i class="sk"></i><i class="sk s"></i></div>`;
  const emptyHtml = (t, s) => `<div class="empty"><b>${esc(t)}</b>${s ? `<p>${esc(s)}</p>` : ''}</div>`;

  let overlayOnClose = null;
  function openOverlay(html, onClose) {
    if (overlayOnClose) { const f = overlayOnClose; overlayOnClose = null; f(); }
    overlay.innerHTML = html;
    overlay.hidden = false;
    overlayOnClose = onClose || null;
  }
  function closeOverlay() {
    if (overlay.hidden) return false;
    overlay.hidden = true;
    overlay.innerHTML = '';
    const f = overlayOnClose;
    overlayOnClose = null;
    if (f) f();
    return true;
  }
  window.appBack = () => closeOverlay();

  function sheet(items, title) {
    openOverlay(`<div class="scrim" data-close></div><div class="sheet">${title ? `<div class="sheet-t">${esc(title)}</div>` : ''}${items.map((it, i) => `<button class="sheet-b" type="button" data-i="${i}">${icon(it.icon)}<span>${esc(it.label)}</span></button>`).join('')}</div>`);
    overlay.querySelectorAll('.sheet-b').forEach(b => b.addEventListener('click', () => { const it = items[+b.dataset.i]; closeOverlay(); it.run(); }));
  }
  function ask(msg, okLabel = 'OK') {
    return new Promise(res => {
      let answered = false;
      openOverlay(`<div class="scrim" data-close></div><div class="sheet"><p class="sheet-msg">${esc(msg)}</p><div class="sheet-row"><button class="btn sec" type="button" data-close>Cancel</button><button class="btn danger" type="button" id="ask-ok">${esc(okLabel)}</button></div></div>`,
        () => { if (!answered) res(false); });
      $('#ask-ok', overlay).addEventListener('click', () => { answered = true; res(true); closeOverlay(); });
    });
  }
  let toastTimer = 0;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    requestAnimationFrame(() => toastEl.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.classList.remove('show'); setTimeout(() => { toastEl.hidden = true; }, 250); }, 2400);
  }

  function bigImage(u) {
    try {
      const x = new URL(u);
      if (!isMediaHost(x.hostname)) return u;
      x.pathname = x.pathname.replace(/\/revision\/latest(?:\/.*)?$/, '/revision/latest/scale-to-width-down/1200');
      return x.href;
    } catch (e) { return u; }
  }
  function openViewer(a) {
    const img = a.querySelector('img');
    const small = img ? img.currentSrc || img.src : '';
    const big = bigImage(a.getAttribute('data-img') || small);
    if (!small && !big) return;
    const fig = a.closest('figure, .thumb, .wikia-gallery-item, .gallerybox, .pi-image');
    const capEl = fig && fig.querySelector('figcaption, .thumbcaption, .lightbox-caption, .gallerytext, .pi-caption');
    const caption = ((capEl && capEl.textContent) || (img && img.alt) || '').trim();
    openOverlay(`<div class="viewer" data-close><img alt="" src="${esc(small || big)}">${caption ? `<div class="cap">${esc(caption)}</div>` : ''}<button class="ib vclose" type="button" data-close aria-label="Close">${icon('close')}</button></div>`);
    const vi = $('.viewer img', overlay);
    if (big && big !== small) {
      const hi = new Image();
      hi.onload = () => { if (vi.isConnected) vi.src = big; };
      hi.src = big;
    }
    vi.addEventListener('click', e => { e.stopPropagation(); $('.viewer', overlay).classList.toggle('zoom'); });
  }

  function scrollToAnchor(id) {
    if (!id) return;
    const el = document.getElementById(id) || document.getElementById(id.replace(/ /g, '_')) || document.getElementsByName(id)[0];
    if (!el) return;
    const det = el.closest('details');
    if (det) det.open = true;
    scrollTo({ top: el.getBoundingClientRect().top + scrollY - bar.offsetHeight - 8 });
  }

  function switchTab(tab) {
    const tabber = tab.closest('.wds-tabber');
    if (!tabber) return;
    const own = sel => [...tabber.querySelectorAll(sel)].filter(n => n.closest('.wds-tabber') === tabber);
    const tabs = own('.wds-tabs__tab'), cs = own('.wds-tab__content');
    const i = tabs.indexOf(tab);
    if (i < 0) return;
    tabs.forEach((t, j) => t.classList.toggle('wds-is-current', j === i));
    cs.forEach((c, j) => c.classList.toggle('wds-is-current', j === i));
  }

  function sortTable(th) {
    const table = th.closest('table');
    const tbody = table && table.tBodies[0];
    if (!tbody) return;
    const col = [...th.parentElement.children].indexOf(th);
    const rows = [...tbody.rows].filter(r => r.querySelector('td'));
    const dir = th.dataset.dir === 'asc' ? -1 : 1;
    th.parentElement.querySelectorAll('th').forEach(x => x.removeAttribute('data-dir'));
    th.dataset.dir = dir === 1 ? 'asc' : 'desc';
    const val = r => ((r.cells[col] && r.cells[col].textContent) || '').trim();
    const num = s => { const m = s.replace(/[,\s]/g, '').match(/^[-+]?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : NaN; };
    rows.sort((a, b) => {
      const x = val(a), y = val(b), nx = num(x), ny = num(y);
      return (!isNaN(nx) && !isNaN(ny) ? nx - ny : x.localeCompare(y)) * dir;
    });
    for (const r of rows) tbody.appendChild(r);
  }

  let retryFn = null;
  function showError(e, retry, title) {
    const notFound = !!e && (e.code === 'missingtitle' || e.code === 'invalidtitle' || e.code === 'empty');
    const off = !notFound && (isNetErr(e) || !online());
    retryFn = retry;
    const msg = notFound ? 'This page doesn’t exist on the wiki.'
      : off ? (title ? 'This article isn’t saved on your phone yet. Connect to the internet, or download the wiki for offline reading in Settings.'
        : 'Connect to the internet to load this, or download the wiki for offline reading in Settings.')
        : (e && e.message) || 'Please try again.';
    view.innerHTML = `<div class="empty big">${icon(off ? 'cloudoff' : 'alert')}<b>${notFound ? 'Article not found' : off ? 'You’re offline' : 'Something went wrong'}</b><p>${esc(msg)}</p><div class="btns center">${notFound && title ? `<a class="btn" href="#/search?q=${encodeURIComponent(shortName(title))}">Search instead</a>` : '<button class="btn" type="button" data-act="retry">Try again</button>'}${off ? '<a class="btn ghost" href="#/settings">Offline settings</a>' : ''}</div></div>`;
  }

  // ------------------------------------------------------------------ router
  let navToken = 0, curKey = '', depth = 0, isBack = false, cleanup = null, forceY = null, current = null;
  const scrollMem = new Map();

  function go(hash) { location.hash = hash; }
  function goBack() {
    if (history.state && history.state.d > 1) history.back();
    else location.replace('#/');
  }

  function route() {
    if (curKey) scrollMem.set(curKey, scrollY);
    isBack = !!history.state && typeof history.state.d === 'number';
    if (!isBack) history.replaceState({ d: depth + 1 }, '');
    depth = history.state.d;
    dispatch();
  }
  function dispatch() {
    closeOverlay();
    if (cleanup) { const c = cleanup; cleanup = null; c(); }
    const token = ++navToken;
    curKey = location.hash;
    current = null;
    const raw = location.hash.slice(1) || '/';
    const hashAt = raw.indexOf('#');
    const path = hashAt >= 0 ? raw.slice(0, hashAt) : raw;
    const anchor = hashAt >= 0 ? safeDecode(raw.slice(hashAt + 1)) : '';
    const qAt = path.indexOf('?');
    const p = qAt >= 0 ? path.slice(0, qAt) : path;
    const qs = new URLSearchParams(qAt >= 0 ? path.slice(qAt + 1) : '');
    const parts = p.split('/').filter(Boolean);
    const rest = parts.slice(1).join('/');
    switch (parts[0]) {
      case 'wiki': return rest ? viewArticle(decT(rest), anchor, token) : viewHome(token);
      case 'section': return viewSection(parts[1], token);
      case 'category': return viewCategory(decT(rest), token);
      case 'categories': return viewCategories(token);
      case 'search': return viewSearch(qs.get('q') || '', token);
      case 'settings': return viewSettings(token);
      default: return viewHome(token);
    }
  }
  function finishView(token, anchor) {
    if (token !== navToken) return;
    if (anchor) { requestAnimationFrame(() => scrollToAnchor(anchor)); return; }
    const y = forceY != null ? forceY : isBack ? scrollMem.get(curKey) || 0 : 0;
    forceY = null;
    scrollTo(0, y);
  }
  function rerender() {
    const y = scrollY;
    if (current && curKey.startsWith('#/wiki/')) { renderArticle(current.rec, navToken, null, y); return; }
    forceY = y;
    dispatch();
  }

  // ------------------------------------------------------------------ views
  async function viewHome(token) {
    setBar({ home: true, actions: [themeBtn(), iconBtn('settings', 'Settings', () => go('#/settings'))] });
    const counts = {};
    for (const s of SECTIONS) {
      const d = await meta.get('sec:' + s.key).catch(() => null);
      if (d) counts[s.key] = d.items.length;
    }
    if (token !== navToken) return;
    view.innerHTML = `
      <section class="hero">
        <h1>Age of Empires II</h1>
        <p>Definitive Edition wiki · ad-free reader</p>
        <a class="fake-search" href="#/search">${icon('search')}<span>Search units, civilizations, technologies…</span></a>
      </section>
      <div id="offcard"></div>
      <h2 class="h-sec">Browse</h2>
      <div class="grid">
        ${SECTIONS.map(s => `<a class="card" href="#/section/${s.key}">${icon(s.icon)}<b>${esc(s.label)}</b><small>${counts[s.key] ? counts[s.key] + ' articles' : '&nbsp;'}</small></a>`).join('')}
        <a class="card" href="#/categories">${icon('list')}<b>All categories</b><small>&nbsp;</small></a>
      </div>
      <h2 class="h-sec">Start here</h2>
      <ul class="list">${START.map(t => rowHtml({ t, d: t })).join('')}</ul>
      ${S.marks.length ? `<h2 class="h-sec">Bookmarks</h2><ul class="list">${S.marks.map(m => rowHtml(m)).join('')}</ul>` : ''}
      ${S.recent.length ? `<div class="h-row"><h2 class="h-sec">Recently viewed</h2><button class="link-btn" type="button" data-act="clear-recent">Clear</button></div><ul class="list">${S.recent.slice(0, 8).map(r => rowHtml(r)).join('')}</ul>` : ''}
      <p class="foot">Content from the Age of Empires Series Wiki at Fandom (CC BY-SA 3.0).<br>Unofficial app — no ads, no tracking.</p>`;
    const upd = () => renderOffCard();
    upd();
    Offline.on(upd);
    cleanup = () => Offline.off(upd);
    finishView(token);
  }

  async function renderOffCard() {
    const box = $('#offcard');
    if (!box) return;
    const O = Offline;
    if (O.running) {
      const pct = O.total ? Math.round((O.done / O.total) * 100) : 0;
      box.innerHTML = `<a class="offcard" href="#/settings"><div class="offcard-t">${icon('download')}<span><b>Downloading for offline…</b><small>${esc(O.phase)}${O.total ? ` · ${O.done.toLocaleString()} / ${O.total.toLocaleString()}` : ''}</small></span></div><div class="progress"><i style="width:${pct}%"></i></div></a>`;
      return;
    }
    const off = await meta.get('offline').catch(() => null);
    if (!$('#offcard')) return;
    if (Stats.pages >= 50 && off) {
      box.innerHTML = `<a class="offcard ok" href="#/settings"><div class="offcard-t">${icon('check')}<span><b>${Stats.pages.toLocaleString()} articles available offline</b><small>Last updated ${ago(off.at)} · tap to update</small></span></div></a>`;
    } else {
      box.innerHTML = `<a class="offcard cta" href="#/settings"><div class="offcard-t">${icon('download')}<span><b>Read anywhere</b><small>Download the whole AoE II wiki to your phone</small></span></div></a>`;
    }
  }

  function renderList(data, { chips = [], subs = [], placeholder = 'Filter…' } = {}) {
    let q = '', chip = -1;
    view.innerHTML = `
      <div class="filter">${icon('search')}<input type="search" placeholder="${esc(placeholder)}" autocomplete="off"></div>
      ${chips.length > 1 ? `<div class="chips"><button class="chip on" type="button" data-i="-1">All</button>${chips.map((c, i) => `<button class="chip" type="button" data-i="${i}">${esc(c)}</button>`).join('')}</div>` : ''}
      ${subs.length ? `<h2 class="h-sec">Subcategories</h2><ul class="list">${subs.map(s => `<li><a class="row" href="#/category/${encT(s)}"><span class="ti ph">${icon('folder')}</span><span class="row-t">${esc(s)}</span></a></li>`).join('')}</ul>` : ''}
      <div id="lst"></div>
      <p class="foot" id="lcount"></p>`;
    const lst = $('#lst', view), cnt = $('#lcount', view);
    const draw = () => {
      const ql = q.toLowerCase();
      const items = data.items.filter(it => (chip < 0 || (it.c || []).includes(chip)) && (!ql || it.t.toLowerCase().includes(ql)));
      if (!items.length) {
        lst.innerHTML = data.items.length ? emptyHtml('No matches', '') : subs.length ? '' : emptyHtml('No articles here', '');
        cnt.textContent = '';
        return;
      }
      const groups = new Map();
      for (const it of items) {
        let L = shortName(it.t).charAt(0).toUpperCase();
        if (!/\p{L}/u.test(L)) L = '#';
        if (!groups.has(L)) groups.set(L, []);
        groups.get(L).push(it);
      }
      lst.innerHTML = `<ul class="list">${[...groups].map(([L, arr]) => `<li class="letter">${esc(L)}</li>${arr.map(it => rowHtml(it)).join('')}`).join('')}</ul>`;
      cnt.textContent = items.length + (items.length === 1 ? ' article' : ' articles') + (data.at ? ' · list updated ' + ago(data.at) : '');
    };
    $('.filter input', view).addEventListener('input', e => { q = e.target.value.trim(); draw(); });
    view.querySelectorAll('.chip[data-i]').forEach(b => b.addEventListener('click', () => {
      chip = +b.dataset.i;
      view.querySelectorAll('.chip[data-i]').forEach(x => x.classList.toggle('on', x === b));
      draw();
    }));
    draw();
  }

  async function viewSection(key, token) {
    const sec = SECTIONS.find(s => s.key === key);
    if (!sec) { location.replace('#/'); return; }
    setBar({ back: true, title: sec.label, actions: [iconBtn('search', 'Search', () => go('#/search'))] });
    view.innerHTML = loadingHtml();
    let data;
    try { data = await sectionData(key); } catch (e) { if (token === navToken) showError(e, () => dispatch()); return; }
    if (token !== navToken) return;
    renderList(data, { chips: data.cats.map(catLabel), placeholder: `Filter ${sec.label.toLowerCase()}…` });
    finishView(token);
  }

  async function viewCategory(name, token) {
    setBar({ back: true, title: catLabel(name), actions: [iconBtn('search', 'Search', () => go('#/search'))] });
    view.innerHTML = loadingHtml();
    let data;
    try { data = await categoryData(name); } catch (e) { if (token === navToken) showError(e, () => dispatch()); return; }
    if (token !== navToken) return;
    renderList(data, { subs: data.subs || [], placeholder: 'Filter articles…' });
    finishView(token);
  }

  async function viewCategories(token) {
    setBar({ back: true, title: 'All categories' });
    view.innerHTML = loadingHtml();
    let cats;
    try { cats = await loadCategories(); } catch (e) {
      const cat = await Catalog.get();
      if (cat) cats = cat.cats.map((n, i) => ({ name: n, pages: cat.items.filter(it => it.c.includes(i)).length }));
      else { if (token === navToken) showError(e, () => dispatch()); return; }
    }
    if (token !== navToken) return;
    view.innerHTML = `<div class="filter">${icon('search')}<input type="search" placeholder="Filter categories…" autocomplete="off"></div><ul class="list" id="cl"></ul><p class="foot">${cats.length} categories</p>`;
    const cl = $('#cl', view);
    const draw = q => {
      const ql = q.toLowerCase();
      const rows = cats.filter(c => c.name.toLowerCase().includes(ql));
      cl.innerHTML = rows.length ? rows.map(c => `<li><a class="row" href="#/category/${encT(c.name)}"><span class="ti ph">${icon('folder')}</span><span class="row-t">${esc(catLabel(c.name))}<small>${esc(c.name)}${c.pages ? ' · ' + c.pages : ''}</small></span></a></li>`).join('') : `<li>${emptyHtml('No matches', '')}</li>`;
    };
    $('.filter input', view).addEventListener('input', e => draw(e.target.value.trim()));
    draw('');
    finishView(token);
  }

  function localSearch(titles, q) {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return titles.filter(t => { const l = t.toLowerCase(); return words.every(w => l.includes(w)); });
  }
  function rank(titles, q) {
    const ql = q.toLowerCase();
    const cat = Catalog.v;
    const aoe2 = cat ? new Set(cat.items.map(i => normTitle(i.t))) : null;
    return titles.map((t, i) => {
      const s = shortName(t).toLowerCase();
      let sc = -i * 0.01;
      if (s === ql) sc += 100;
      else if (s.startsWith(ql)) sc += 40;
      else if (t.toLowerCase().includes(ql)) sc += 15;
      if (isAoe2Title(t) || (aoe2 && aoe2.has(normTitle(t)))) sc += 30;
      if (OTHER_GAME_TITLE.test(t)) sc -= 20;
      return [sc, t];
    }).sort((a, b) => b[0] - a[0]).map(x => x[1]);
  }
  const cleanSnippet = s => String(s).replace(/<span class="searchmatch">/gi, '<mark>').replace(/<\/span>/gi, '</mark>').replace(/<(?!\/?mark>)[^>]*>/gi, '');

  async function viewSearch(q0, token) {
    setBar({ back: true, search: q0 });
    const input = $('input', bar);
    view.innerHTML = '<div id="res"></div>';
    const res = $('#res', view);
    let timer = 0, seq = 0;
    const suggest = () => `<h2 class="h-sec">Try searching for</h2><div class="chips wrap">${SUGGEST.map(s => `<button class="chip" type="button" data-q="${esc(s)}">${esc(s)}</button>`).join('')}</div>${S.recent.length ? `<h2 class="h-sec">Recently viewed</h2><ul class="list">${S.recent.slice(0, 8).map(r => rowHtml(r)).join('')}</ul>` : ''}`;
    const thumbs = new Map();
    if (Catalog.v) for (const it of Catalog.v.items) if (it.th) thumbs.set(normTitle(it.t), it.th);
    for (const r of [...S.recent, ...S.marks]) if (r.th) thumbs.set(normTitle(r.t), r.th);
    const results = (list, snippets) => `<ul class="list">${list.map(t => rowHtml({ t, th: thumbs.get(normTitle(t)) || '' }, { subHtml: snippets[normTitle(t)] ? cleanSnippet(snippets[normTitle(t)]) : '' })).join('')}</ul>`;
    const run = async () => {
      const q = input.value.trim();
      const my = ++seq;
      const h = '#/search' + (q ? '?q=' + encodeURIComponent(q) : '');
      if (location.hash !== h) { history.replaceState(history.state, '', h); curKey = location.hash; }
      if (!q) { res.innerHTML = suggest(); return; }
      const local = rank(localSearch(await allTitles(), q), q).slice(0, 30);
      if (my !== seq || token !== navToken) return;
      if (!online()) {
        res.innerHTML = local.length ? results(local, {}) : emptyHtml('No offline matches', 'Connect to the internet to search the whole wiki.');
        return;
      }
      res.innerHTML = local.length ? results(local, {}) : loadingHtml();
      const [os, fs] = await Promise.all([
        api({ action: 'opensearch', search: q, limit: '20', namespace: '0', redirects: 'resolve' }, { retries: 0 }).catch(() => null),
        api({ action: 'query', list: 'search', srsearch: q, srlimit: '30', srnamespace: '0', srprop: 'snippet' }, { retries: 0 }).catch(() => null),
      ]);
      if (my !== seq || token !== navToken) return;
      const snippets = {};
      const all = [...local];
      if (Array.isArray(os) && Array.isArray(os[1])) all.push(...os[1]);
      for (const r of (fs && fs.query && fs.query.search) || []) {
        all.push(r.title);
        if (r.snippet) snippets[normTitle(r.title)] = r.snippet;
      }
      const seen = new Set();
      const uniq = all.filter(t => { const k = normTitle(t); if (!k || seen.has(k)) return false; seen.add(k); return true; });
      const ranked = rank(uniq, q).slice(0, 50);
      res.innerHTML = ranked.length ? results(ranked, snippets) : emptyHtml('No results', 'Try a different spelling.');
    };
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 280); });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { clearTimeout(timer); run(); input.blur(); } });
    res.addEventListener('click', e => {
      const b = e.target.closest('[data-q]');
      if (b) { input.value = b.dataset.q; run(); }
    });
    cleanup = () => clearTimeout(timer);
    if (q0) run();
    else { res.innerHTML = suggest(); setTimeout(() => input.focus(), 60); }
    finishView(token);
  }

  function addRecent(rec) {
    const k = normTitle(rec.title);
    S.recent = [{ t: rec.title, d: plain(rec.display || rec.title), th: rec.th || '' }, ...S.recent.filter(r => normTitle(r.t) !== k)].slice(0, 20);
    LS.set('recent', S.recent);
  }
  function markBtn(rec) {
    const k = normTitle(rec.title);
    const on = () => S.marks.some(m => normTitle(m.t) === k);
    const b = iconBtn('bookmark', 'Bookmark', () => {
      if (on()) S.marks = S.marks.filter(m => normTitle(m.t) !== k);
      else S.marks.unshift({ t: rec.title, d: plain(rec.display || rec.title), th: rec.th || '' });
      LS.set('marks', S.marks);
      b.classList.toggle('on', on());
      toast(on() ? 'Bookmarked' : 'Bookmark removed');
    });
    b.classList.toggle('on', on());
    return b;
  }
  function articleMenu(rec) {
    const url = WIKI + '/wiki/' + encT(rec.title);
    const name = plain(rec.display || rec.title);
    sheet([
      { icon: 'share', label: 'Share link', run: () => call('share', name, url) },
      { icon: 'external', label: 'Open on Fandom', run: () => call('openExternal', url) },
      {
        icon: 'refresh', label: 'Reload article', run: async () => {
          if (!online()) { toast('You’re offline'); return; }
          toast('Reloading…');
          try {
            const n = await fetchPage(rec.title);
            await savePage(n);
            if (current && normTitle(current.rec.title) === normTitle(rec.title)) renderArticle(n, navToken, null, scrollY);
            toast('Article reloaded');
          } catch (e) { toast('Could not reload the article'); }
        },
      },
    ], shortName(name));
  }

  async function viewArticle(title, anchor, token) {
    setBar({ back: true, title: shortName(title) });
    view.innerHTML = loadingHtml(true);
    let rec = null, fresh = false;
    try { rec = await loadStored(title); } catch (e) { rec = null; }
    if (!rec) {
      try {
        rec = await fetchPage(title);
        fresh = true;
        savePage(rec).catch(() => {});
      } catch (e) {
        if (token === navToken) showError(e, () => dispatch(), title);
        return;
      }
    }
    if (token !== navToken) return;
    renderArticle(rec, token, anchor, null);
    addRecent(rec);
    if (!fresh && online() && Date.now() - (rec.at || 0) > 3 * DAY) refreshInBackground(rec, token);
  }

  async function refreshInBackground(rec, token) {
    try {
      const j = await api({ action: 'query', prop: 'info', titles: rec.title }, { retries: 0 });
      const p = j.query && j.query.pages && j.query.pages[0];
      if (!p || !p.lastrevid || p.lastrevid === rec.revid) {
        const r = await dbGet('pages', normTitle(rec.title));
        if (r) { r.at = Date.now(); await dbPut('pages', r); }
        return;
      }
      const n = await fetchPage(rec.title);
      await savePage(n);
      if (token === navToken && scrollY < 300) { renderArticle(n, token, null, scrollY); toast('Article updated'); }
    } catch (e) { /* keep the saved copy */ }
  }

  function renderArticle(rec, token, anchor, keepY) {
    const doc = new DOMParser().parseFromString('<!doctype html><body><div id="wr"></div></body>', 'text/html');
    const wr = doc.getElementById('wr');
    wr.innerHTML = rec.html;
    transform(wr, isDark());
    const thumb = wr.querySelector('.portable-infobox img');
    if (thumb && thumb.getAttribute('src')) rec.th = thumb.getAttribute('src');
    current = { rec };
    const display = plain(rec.display || rec.title);
    setBar({ back: true, title: shortName(display), actions: [markBtn(rec), iconBtn('more', 'More options', () => articleMenu(rec))] });
    const art = document.createElement('article');
    art.className = 'article';
    const saved = savedKeys.has(normTitle(rec.title)) || rec.stored;
    art.innerHTML = `<h1 class="art-title">${esc(display)}</h1><div class="art-meta">${saved ? `<span class="badge ok">${icon('check')}Saved offline</span>` : ''}</div>`;
    const body = document.createElement('div');
    body.className = 'wiki';
    body.append(...wr.childNodes);
    const cats = (rec.cats || []).filter(c => !MAINT.test(c));
    const src = WIKI + '/wiki/' + encT(rec.title);
    const lic = 'https://creativecommons.org/licenses/by-sa/3.0/';
    const foot = document.createElement('footer');
    foot.className = 'art-foot';
    foot.innerHTML = `${cats.length ? `<h2 class="h-sec">Categories</h2><div class="chips wrap">${cats.map(c => `<a class="chip" href="#/category/${encT(c)}">${esc(c)}</a>`).join('')}</div>` : ''}
      <p>Text from the article <a data-ext="${esc(src)}" href="${esc(src)}">${esc(rec.title)}</a> on the Age of Empires Series Wiki at Fandom, available under <a data-ext="${lic}" href="${lic}">CC BY-SA 3.0</a>.</p>`;
    art.append(body, foot);
    view.replaceChildren(art);
    if (keepY != null) { forceY = keepY; finishView(token); } else finishView(token, anchor);
  }

  // ------------------------------------------------------------------ offline download
  const Offline = {
    running: false, paused: false, phase: '', total: 0, done: 0, failed: 0, current: '', error: '',
    subs: new Set(), timer: 0,
    on(f) { this.subs.add(f); },
    off(f) { this.subs.delete(f); },
    emit() { for (const f of this.subs) { try { f(); } catch (e) { /* view gone */ } } },
    emitSoon() { if (!this.timer) this.timer = setTimeout(() => { this.timer = 0; this.emit(); }, 200); },
    pause() {
      if (!this.running) return;
      this.paused = true;
      this.phase = 'Pausing…';
      call('cancelPrefetch');
      this.emit();
    },
    async run() {
      if (this.running) return;
      Object.assign(this, { running: true, paused: false, error: '', failed: 0, done: 0, total: 0, current: '', phase: 'Preparing…' });
      this.emit();
      call('keepScreenOn', true);
      try {
        if (!online()) throw new NetError('offline');
        const cat = await buildCatalog((i, n) => { this.phase = `Finding articles (${i}/${n} categories)`; this.emitSoon(); }, () => this.paused);
        if (this.paused) throw new Error('paused');
        Catalog.set(cat);
        titleList = null;
        await meta.set('catalog', cat).catch(() => {});
        const idx = new Map((await dbAll('idx').catch(() => [])).map(x => [x.k, x.r]));
        const aliases = new Set(await dbKeys('alias').catch(() => []));
        const todo = cat.items.filter(it => {
          const k = normTitle(it.t);
          if (idx.has(k)) return !!it.r && !!idx.get(k) && idx.get(k) !== it.r;
          return !aliases.has(k);
        });
        this.total = cat.items.length;
        this.done = this.total - todo.length;
        if (S.images) queueAllImages();
        this.phase = todo.length ? 'Downloading articles' : 'Up to date';
        this.emit();
        await pool(todo, 4, async it => {
          this.current = shortName(it.t);
          try {
            const p = await fetchPage(it.t);
            const im = await savePage(p);
            if (S.images && im.length) call('prefetch', JSON.stringify(im));
            this.done++;
          } catch (e) {
            if (isNetErr(e) && !online()) { this.paused = true; this.error = 'Connection lost. Tap Resume when you are back online.'; }
            else this.failed++;
          }
          this.emitSoon();
        }, () => this.paused);
        this.phase = this.paused ? 'Paused' : todo.length ? 'Complete' : 'Up to date';
        await meta.set('offline', { at: Date.now(), done: Stats.pages, total: this.total, failed: this.failed, complete: !this.paused }).catch(() => {});
      } catch (e) {
        if (e && e.message === 'paused') this.phase = 'Paused';
        else {
          this.phase = 'Stopped';
          this.error = isNetErr(e) ? 'You’re offline. Connect to the internet and try again.' : (e && e.message) || 'Something went wrong.';
        }
      } finally {
        this.running = false;
        this.current = '';
        call('keepScreenOn', false);
        this.emit();
      }
    },
  };

  async function buildCatalog(progress, stop) {
    const cats = await loadCategories(true);
    const names = cats.map(c => c.name);
    const items = new Map();
    const subs = new Set();
    let n = 0;
    const add = (m, ci) => {
      const k = normTitle(m.t);
      let it = items.get(k);
      if (!it) { it = { t: m.t, r: m.r, th: m.th, c: [] }; items.set(k, it); }
      if (!it.c.includes(ci)) it.c.push(ci);
      if (m.r) it.r = m.r;
      if (!it.th && m.th) it.th = m.th;
    };
    const scan = async (name, ci, ns) => {
      try {
        for (const m of await fetchMembers(name, ns)) {
          if (m.ns === 14) {
            const sn = m.t.replace(/^Category:/, '');
            if (!names.includes(sn) && !MAINT.test(sn) && !OTHER_GAME.test(sn)) subs.add(sn);
          } else if (m.ns === 0) add(m, ci);
        }
      } catch (e) {
        if (!online()) throw e;
      }
      progress(++n, names.length + subs.size);
    };
    const base = names.slice();
    await pool(base, 4, (name, i) => scan(name, i, '0|14'), stop);
    const extra = [...subs].filter(s => !names.includes(s));
    const off = names.length;
    names.push(...extra);
    await pool(extra, 4, (name, i) => scan(name, off + i, '0'), stop);
    if (!items.size) throw new NetError('Could not list the wiki’s articles');
    return { at: Date.now(), cats: names, items: [...items.values()] };
  }

  async function queueAllImages() {
    let all = [];
    try { all = await dbAll('idx'); } catch (e) { return; }
    const urls = [];
    for (const x of all) if (x.im) urls.push(...x.im);
    const cat = await Catalog.get();
    if (cat) for (const it of cat.items) if (it.th) urls.push(it.th);
    for (let i = 0; i < urls.length; i += 400) {
      call('prefetch', JSON.stringify(urls.slice(i, i + 400)));
      await sleep(0);
    }
  }

  async function deleteOffline() {
    if (!(await ask('Delete all saved articles and images from this phone? You can download them again later.', 'Delete'))) return;
    try {
      await Promise.all(['pages', 'idx', 'alias'].map(dbClear));
      await dbDel('meta', 'catalog');
      await dbDel('meta', 'offline');
    } catch (e) { /* ignore */ }
    Catalog.set(null);
    savedKeys.clear();
    Stats.pages = 0;
    Stats.bytes = 0;
    titleList = null;
    call('clearMediaCache');
    Offline.phase = '';
    Offline.error = '';
    toast('Offline data deleted');
    imgInfo = { files: 0, bytes: 0 };
    renderOffPanel();
  }

  let imgInfo = null, imgStat = null;
  function imgStatText() {
    if (!imgInfo) return '…';
    const pending = (imgStat && imgStat.pending) || 0;
    return `${(imgInfo.files || 0).toLocaleString()} · ${fmtBytes(imgInfo.bytes)}${pending ? ` (+${pending.toLocaleString()} queued)` : ''}`;
  }

  function renderOffPanel() {
    const p = $('#offpanel');
    if (!p) return;
    const O = Offline;
    const pct = O.total ? Math.min(100, Math.round((O.done / O.total) * 100)) : 0;
    const has = Stats.pages > 0;
    const showProg = O.running || O.phase === 'Paused';
    const finished = !O.running && (O.phase === 'Complete' || O.phase === 'Up to date');
    p.innerHTML = `
      <div class="stat"><span>Articles on this phone</span><b>${Stats.pages.toLocaleString()}</b></div>
      <div class="stat"><span>Article storage</span><b>${fmtBytes(Stats.bytes)}</b></div>
      <div class="stat"><span>Images on this phone</span><b id="imgstat">${imgStatText()}</b></div>
      <label class="switch"><span>Download images<small>Icons, portraits and pictures (uses more space)</small></span><input type="checkbox" id="imgs" ${S.images ? 'checked' : ''}><i></i></label>
      ${showProg ? `<div class="prog"><div class="prog-t"><b>${esc(O.phase)}</b><span>${O.total ? `${O.done.toLocaleString()} / ${O.total.toLocaleString()}` : ''}</span></div><div class="progress"><i style="width:${pct}%"></i></div><small>${esc(O.current ? 'Saving ' + O.current : '')}${O.failed ? ` · ${O.failed} failed` : ''}</small></div>` : ''}
      ${finished ? `<p class="okmsg">${icon('check')}<span>${O.phase === 'Up to date' ? 'Everything is up to date.' : 'Download complete.'}${O.failed ? ` ${O.failed} articles could not be downloaded.` : ''}</span></p>` : ''}
      ${O.error ? `<p class="err">${esc(O.error)}</p>` : ''}
      <div class="btns">
        ${O.running
          ? `<button class="btn" type="button" data-act="pause">${icon('pause')}Pause</button>`
          : `<button class="btn" type="button" data-act="start">${icon('download')}${O.phase === 'Paused' ? 'Resume' : has ? 'Update offline copy' : 'Download for offline'}</button>`}
        ${has && !O.running ? `<button class="btn ghost" type="button" data-act="delete">${icon('trash')}Delete</button>` : ''}
      </div>
      <p class="hint">Saves every Age of Empires II article — civilizations, units, buildings, technologies, campaigns and more — so the wiki works without internet. Keep the app open while downloading; you can pause and resume any time. Articles you open are also saved automatically.</p>`;
    $('#imgs', p).addEventListener('change', e => {
      S.images = e.target.checked;
      LS.set('images', S.images);
      if (S.images && has && !O.running) queueAllImages();
    });
  }

  async function viewSettings(token) {
    setBar({ back: true, title: 'Settings' });
    const version = call('appVersion') || '';
    view.innerHTML = `
      <h2 class="h-sec">Appearance</h2>
      <div class="panel">
        <div class="seg" id="theme">${['system', 'light', 'dark'].map(t => `<button type="button" data-t="${t}" class="${S.theme === t ? 'on' : ''}">${cap(t)}</button>`).join('')}</div>
        <label class="range"><span>Text size</span><input id="scale" type="range" min="0.85" max="1.4" step="0.05" value="${S.scale}"><b id="scalev">${Math.round(S.scale * 100)}%</b></label>
      </div>
      <h2 class="h-sec">Offline reading</h2>
      <div class="panel" id="offpanel"></div>
      <h2 class="h-sec">About</h2>
      <div class="panel about">
        <p><b>AoE II Wiki</b>${version ? ' · version ' + esc(version) : ''}</p>
        <p>An unofficial, ad-free reader for the <a data-ext="${WIKI}/" href="${WIKI}/">Age of Empires Series Wiki</a>. Article text is written by the wiki’s contributors and licensed under <a data-ext="https://creativecommons.org/licenses/by-sa/3.0/" href="https://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA 3.0</a>; images belong to their respective owners.</p>
        <p>Not affiliated with Fandom, Microsoft or World’s Edge.</p>
      </div>`;
    $('#theme', view).addEventListener('click', e => {
      const b = e.target.closest('[data-t]');
      if (!b) return;
      view.querySelectorAll('#theme button').forEach(x => x.classList.toggle('on', x === b));
      S.theme = b.dataset.t;
      LS.set('theme', S.theme);
      applyTheme();
    });
    $('#scale', view).addEventListener('input', e => {
      S.scale = +e.target.value;
      LS.set('scale', S.scale);
      $('#scalev', view).textContent = Math.round(S.scale * 100) + '%';
      applyTheme();
    });
    renderOffPanel();
    const tick = full => {
      try {
        imgStat = JSON.parse(call('prefetchStatus') || '{}');
        if (full || !imgInfo || imgStat.pending) imgInfo = JSON.parse(call('mediaCacheInfo') || '{}');
      } catch (e) { /* ignore */ }
      const el = $('#imgstat');
      if (el) el.textContent = imgStatText();
    };
    tick(true);
    const iv = setInterval(() => tick(false), 3000);
    Offline.on(renderOffPanel);
    cleanup = () => { clearInterval(iv); Offline.off(renderOffPanel); };
    finishView(token);
  }

  // ------------------------------------------------------------------ events & start
  function onViewClick(e) {
    const tab = e.target.closest('.wds-tabs__tab');
    if (tab && view.contains(tab)) { e.preventDefault(); switchTab(tab); return; }
    const act = e.target.closest('[data-act]');
    if (act) {
      const a = act.dataset.act;
      if (a === 'retry' && retryFn) retryFn();
      else if (a === 'start') Offline.run();
      else if (a === 'pause') Offline.pause();
      else if (a === 'delete') deleteOffline();
      else if (a === 'clear-recent') { S.recent = []; LS.set('recent', []); forceY = scrollY; dispatch(); }
      return;
    }
    const th = e.target.closest('table.sortable th');
    if (th && !e.target.closest('a')) { sortTable(th); return; }
    const a = e.target.closest('a');
    if (!a) return;
    if (a.hasAttribute('data-img')) { e.preventDefault(); openViewer(a); return; }
    if (a.hasAttribute('data-ext')) { e.preventDefault(); call('openExternal', a.getAttribute('data-ext')); return; }
    if (a.hasAttribute('data-anchor')) { e.preventDefault(); scrollToAnchor(a.getAttribute('data-anchor')); }
  }

  async function init() {
    applyTheme();
    window.addEventListener('hashchange', route);
    window.addEventListener('scroll', () => bar.classList.toggle('scrolled', scrollY > 4), { passive: true });
    view.addEventListener('click', onViewClick);
    overlay.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeOverlay(); });
    try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { /* optional */ }
    await Promise.race([loadStats(), sleep(1500)]);
    route();
  }
  init();
})();
