/* Kanji worksheet page: search (kanji and words), bundles and component families; pages are drawn by Worksheet. */
(function () {
  var DATA = '/assets/kanji/data/';
  var root = document.getElementById('kanji-app');
  if (!root) return;
  var $ = function (sel, el) { return (el || root).querySelector(sel); };
  var $$ = function (sel, el) { return Array.prototype.slice.call((el || root).querySelectorAll(sel)); };

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function getJSON(path) {
    return fetch(DATA + path).then(function (r) {
      if (!r.ok) throw new Error(path + ': ' + r.status);
      return r.json();
    });
  }

  /* ---------- language ---------- */
  /* Searching always looks at English and German. The two checkboxes choose which meanings are shown on the
     sheets (one or both). German comes from JMdict and does not cover everything, so a kanji or word without a
     German meaning shows its English one. */
  var langs = { en: true, de: true };
  try {
    var saved = JSON.parse(localStorage.getItem('kanji-langs'));
    if (saved && (saved.en || saved.de)) langs = { en: !!saved.en, de: !!saved.de };
  } catch (e) {}
  function fold(s) {  // lower case, no accents: Über -> uber, Straße -> strasse
    return String(s).toLowerCase().replace(/ß/g, 'ss').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  /* English and German meanings of a kanji, alternating (castle, Burg, …) when both are on */
  function meaningsOf(k) {
    var en = langs.en ? k.en : [], de = langs.de ? k.de : [], out = [], seen = {};
    for (var i = 0; i < Math.max(en.length, de.length); i++) {
      [en[i], de[i]].forEach(function (m) {
        if (m && !seen[m.toLowerCase()]) { seen[m.toLowerCase()] = true; out.push(m); }
      });
    }
    return out.length ? out : k.en;
  }
  function pick(en, de) {  // a gloss for the sheets from an English and a German one ('' when missing)
    var parts = [langs.en ? en : '', langs.de ? de : ''].filter(Boolean);
    return parts.length ? parts.join(' / ') : en;
  }
  function glossOf(w) { return pick(w.en, w.de); }
  /* [English, German] to show; a language that is off or missing is '' (English when nothing is left) */
  function glossPair(en, de) {
    var e = langs.en ? en : '', d = langs.de ? de : '';
    return e || d ? [e, d] : [en, ''];
  }
  /* rows [['EN', text], ['DE', text]] of the meaning block on the sheets */
  function rowsOf(en, de) {
    var g = glossPair(en, de), rows = [];
    if (g[0]) rows.push(['EN', g[0]]);
    if (g[1]) rows.push(['DE', g[1]]);
    return rows.length ? rows : [['EN', '-']];
  }
  function applyLang() {
    kanji.forEach(function (k) { k.meanings = meaningsOf(k); k.rows = rowsOf(k.en.join(', '), k.de.join(', ')); });
    if (vocabList) vocabList.forEach(function (w) { w.gloss = glossOf(w); w.rows = rowsOf(w.en, w.de); });
  }

  /* ---------- data ---------- */
  var kanji = [], byChar = {}, shards = {}, components = null, vocabList = null;
  var ready = getJSON('kanji.json').then(function (rows) {
    kanji = rows.map(function (r) {
      return { char: r[0], en: r[1], de: r[9] || [], meanings: r[1], on: r[2], kun: r[3], strokes: r[4], grade: r[5],
        jlpt: r[6], freq: r[7], level: r[8] };
    });
    kanji.forEach(function (k) { byChar[k.char] = k; });
    applyLang();
  });

  function shardKey(ch) { return ('0000' + (ch.codePointAt(0) >> 5).toString(16)).slice(-4); }
  /* {char: {strokes, size, words}} for the given characters (missing ones are left out) */
  function glyphs(chars) {
    var keys = {};
    chars.forEach(function (c) { keys[shardKey(c)] = true; });
    return Promise.all(Object.keys(keys).map(function (k) {
      if (!shards[k]) shards[k] = getJSON('s/' + k + '.json').catch(function () { return {}; });
      return shards[k];
    })).then(function () {
      var out = {};
      return Promise.all(chars.map(function (c) {
        return shards[shardKey(c)].then(function (s) {
          if (s[c]) out[c] = { strokes: s[c][0], size: 109, words: s[c][1].map(function (w) { var g = glossPair(w[2], w[3] || ''); return [w[0], w[1], g[0], g[1]]; }) };
        });
      })).then(function () { return out; });
    });
  }
  function loadComponents() {
    if (!components) components = getJSON('components.json');
    return components;
  }
  /* common JMdict words: {list: [{word, reading, gloss, rank}], byWord, byReading}, most common first */
  var vocab = null;
  function loadWords() {
    if (!vocab) vocab = getJSON('words.json').then(function (rows) {
      var v = { list: [], byWord: {}, byReading: {} };
      rows.forEach(function (r) {
        var w = { word: r[0], reading: r[1], en: r[2], de: r[4] || '', gloss: glossOf({ en: r[2], de: r[4] || '' }), rank: r[3],
          deFolded: r[4] ? fold(r[4]) : '' };
        w.rows = rowsOf(w.en, w.de);
        v.list.push(w);
        v.byWord[w.word] = w;
        (v.byReading[w.reading] = v.byReading[w.reading] || []).push(w);
      });
      vocabList = v.list;
      return v;
    });
    return vocab;
  }
  function isKanji(c) { return c >= '\u4e00' && c <= '\u9fff'; }
  function kanjiOf(word) { return Array.prototype.filter.call(word, isKanji); }

  /* ---------- search ---------- */
  var CJK = /[⺀-⿟々㐀-䶿一-鿿豈-﫿]/g;
  var KANA = /^[぀-ヿー・.\s-]+$/;

  function rankFreq(k) { return (k.freq || 9999) + (k.grade ? 0 : 5000); }

  function search(q) {
    q = q.trim();
    if (!q) return { items: [] };
    var chars = q.match(CJK);
    if (chars) {
      var seen = {};
      return { exact: true, items: chars.filter(function (c) { return !seen[c] && (seen[c] = true); }) };
    }
    var kana = KANA.test(q) ? Romaji.toHiragana(q.replace(/[\s・.-]/g, '')) : null;
    var lowerEn = q.toLowerCase(), lowerDe = fold(q);
    var asKana = !kana && /^[a-zāīūēō' -]+$/i.test(q) ? Romaji.toKana(q.replace(/\s/g, '')) : null;
    function wordRe(t) { return new RegExp('\\b' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b'); }
    var reEn = wordRe(lowerEn), reDe = wordRe(lowerDe);
    var hits = [];
    kanji.forEach(function (k) {
      var score = null;
      var reading = kana || asKana;
      if (reading) {
        var kun = k.kun.map(function (r) { return r.replace(/-/g, ''); });
        if (k.on.some(function (r) { return Romaji.toHiragana(r) === reading; }) ||
            kun.some(function (r) { return r.replace('.', '') === reading; })) score = 1;
        else if (kun.some(function (r) { return r.split('.')[0] === reading; })) score = 1.5;  // stem: かわ of かわ.る
      }
      if (!kana) {
        [[k.en, lowerEn, reEn, false], [k.de, lowerDe, reDe, true]].forEach(function (t) {
          t[0].some(function (m, i) {
            m = t[3] ? fold(m) : m.toLowerCase();
            var s = m === t[1] ? (t[3] && i ? 0.5 : 0) : t[2].test(m) ? 2 : m.indexOf(t[1]) >= 0 && t[1].length > 2 ? 3 : null;
            if (s != null && (score == null || s < score)) score = s;
            return s === 0;
          });
        });
      }
      if (score != null) hits.push([score, rankFreq(k), k.char]);
    });
    hits.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    return { items: hits.slice(0, 60).map(function (h) { return h[2]; }), total: hits.length };
  }

  /* Words for the query: the written word itself (and longer words starting with it), words read
     as the kana / romaji, or words whose English gloss matches -- most common first. */
  function searchWords(v, q) {
    q = q.trim();
    if (!q) return [];
    var out = [], seen = {};
    function add(w) {  // single kanji are already in the kanji results
      if (w && w.word.length > 1 && !seen[w.word]) { seen[w.word] = true; out.push(w); }
    }
    if (q.match(CJK)) {
      add(v.byWord[q]);
      if (q.length >= 2) v.list.forEach(function (w) { if (out.length < 12 && w.word.indexOf(q) === 0) add(w); });
      return out;
    }
    if (KANA.test(q)) {
      (v.byReading[Romaji.toHiragana(q.replace(/[\s・.-]/g, ''))] || []).forEach(add);
      return out.slice(0, 12);
    }
    if (/^[a-zāīūēō' -]+$/i.test(q)) {
      var compact = q.replace(/\s/g, '');
      [compact, compact.toLowerCase().replace(/ny/g, "n'y")].forEach(function (form) {
        (v.byReading[Romaji.toKana(form)] || []).forEach(add);
      });
    }
    if (/^[a-zäöüßāīūēō' -]+$/i.test(q)) {
      var tests = [[q.toLowerCase(), false], [fold(q), true]].map(function (t) {
        return { lower: t[0], de: t[1], re: new RegExp('(^|; |\\b)' + t[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b') };
      });
      var exact = [], loose = [];
      v.list.forEach(function (w) {
        var isExact = false, isLoose = false;
        tests.forEach(function (t) {
          var g = t.de ? w.deFolded : w.en.toLowerCase(), parts = g.split('; ');
          if (parts.indexOf(t.lower) >= 0 || parts.indexOf('to ' + t.lower) >= 0) isExact = true;
          else if (t.lower.length > 2 && t.re.test(g)) isLoose = true;
        });
        if (isExact) exact.push(w); else if (isLoose) loose.push(w);
      });
      exact.concat(loose).forEach(function (w) { if (out.length < 12) add(w); });
    }
    return out.slice(0, 12);
  }

  /* ---------- families (port of kanjiws/families.py) ---------- */
  function familyRank(k) {
    var group = k.grade >= 1 && k.grade <= 6 ? 0 : k.grade === 8 ? 1 : k.grade ? 2 : 3;
    return [group, k.grade, k.freq || 9999, k.strokes];
  }
  function cmp(a, b) { for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; }

  function buildFamily(comp, includeRare) {
    return loadComponents().then(function (index) {
      var members = [];
      Object.keys(index).forEach(function (ch) {
        if (ch === comp) return;
        var parts = index[ch];
        for (var i = 0; i < parts.length; i++) {
          if (parts[i][0] === comp || parts[i][1] === comp) { members.push({ char: ch, strokes: parts[i][2] }); break; }
        }
      });
      var shown = members.filter(function (m) { return byChar[m.char]; }).map(function (m) {
        return { info: byChar[m.char], strokes: m.strokes };
      });
      if (!includeRare) shown = shown.filter(function (m) { var k = m.info; return k.grade || k.jlpt || (k.freq > 0 && k.freq <= 2500); });
      shown.sort(function (a, b) { return cmp(familyRank(a.info), familyRank(b.info)); });
      var parts = [];
      (index[comp] || []).forEach(function (p) { if (parts.indexOf(p[0]) < 0) parts.push(p[0]); });
      return { component: comp, info: byChar[comp] || null, parts: parts, members: members.length, shown: shown };
    });
  }
  function withGlyphs(family) {
    var chars = family.shown.map(function (m) { return m.info.char; }).concat([family.component]);
    return glyphs(chars).then(function (g) {
      family.glyph = g[family.component] || null;
      family.shown = family.shown.filter(function (m) { return (m.glyph = g[m.info.char]); });
      return family;
    });
  }

  /* ---------- fonts ---------- */
  function fontsFor(text) {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    var sample = Worksheet.fontSample + text;
    return Promise.all([
      document.fonts.load('400 12px "Noto Sans JP"', sample),
      document.fonts.load('700 12px "Noto Sans JP"', 'Meaning Example words Stroke order Practice Component Reading Kanji in this word')
    ]).catch(function () {});
  }
  function infoText(k, g) {
    return k.meanings.join(' ') + k.on.join('') + k.kun.join('') + k.char +
      (g ? g.words.map(function (w) { return w.join(' '); }).join(' ') : '');
  }

  /* ---------- small UI helpers ---------- */
  function badge(k) {
    if (k.level) return '<span class="kj-badge kj-badge--n">N' + k.level + '</span>';
    if (k.grade && k.grade <= 6) return '<span class="kj-badge">G' + k.grade + '</span>';
    return '';
  }
  /* search results: one row per language, with the same EN / DE pills as the sheets */
  function langRows(cls, en, de) {
    return [['en', en], ['de', de]].filter(function (r) { return r[1]; }).map(function (r) {
      return '<span class="' + cls + '"><i class="kj-lg kj-lg--' + r[0] + '">' + r[0].toUpperCase() + '</i>' + esc(r[1]) + '</span>';
    }).join('');
  }
  function tile(ch, extra) {
    var k = byChar[ch];
    return '<button type="button" class="kj-tile" data-char="' + esc(ch) + '"' + (extra || '') + '>' +
      '<span class="kj-tile__char" lang="ja">' + esc(ch) + '</span>' +
      (k ? langRows('kj-tile__meaning', k.en[0], k.de[0]) || '<span class="kj-tile__meaning">–</span>' : '<span class="kj-tile__meaning">component</span>') +
      (k ? badge(k) : '') + '</button>';
  }
  function status(el, text) { el.textContent = text || ''; }

  /* ---------- tabs ---------- */
  function showTab(name) {
    $$('.kj-tab').forEach(function (t) {
      var on = t.getAttribute('data-tab') === name;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    $$('.kj-panel').forEach(function (p) { p.hidden = p.getAttribute('data-panel') !== name; });
  }
  $$('.kj-tab').forEach(function (t) {
    t.addEventListener('click', function () { showTab(t.getAttribute('data-tab')); });
  });

  /* ---------- Kanji tab ---------- */
  var list = [];
  var input = $('#kj-q'), results = $('#kj-results'), wordResults = $('#kj-words'), detail = $('#kj-detail'),
    searchInfo = $('#kj-search-info');

  function wordTile(w) {
    return '<button type="button" class="kj-word" data-word="' + esc(w.word) + '">' +
      '<span class="kj-word__text" lang="ja">' + esc(w.word) + '</span>' +
      '<span class="kj-word__reading" lang="ja">' + esc(w.reading) + ' · ' + esc(Romaji.romaji(w.reading)) + '</span>' +
      langRows('kj-word__gloss', w.en.split('; ')[0], w.de.split('; ')[0]) + '</button>';
  }

  function runSearch() {
    var q = input.value;
    Promise.all([ready, loadWords()]).then(function (res) {
      if (input.value !== q) return;
      var v = res[1], r = search(q), words = searchWords(v, q);
      if (!q.trim()) { results.innerHTML = wordResults.innerHTML = ''; status(searchInfo, ''); return; }
      wordResults.innerHTML = words.length ? '<h3 class="kj-heading">Words</h3><div class="kj-words">' +
        words.map(wordTile).join('') + '</div>' : '';
      results.innerHTML = r.items.length ? '<h3 class="kj-heading">Kanji</h3><div class="kj-results">' +
        r.items.map(function (c) { return tile(c); }).join('') + '</div>' : '';
      if (!r.items.length && !words.length) {
        status(searchInfo, 'No kanji or words found for “' + q.trim() + '”.');
        current = null; detail.hidden = true; detail.innerHTML = '';
        return;
      }
      status(searchInfo, r.exact || !r.total ? '' : (r.total > r.items.length ? 'Showing ' + r.items.length + ' of ' + r.total + ' kanji.' :
        r.total + (r.total === 1 ? ' kanji.' : ' kanji.')));
      var typed = v.byWord[q.trim()];
      if (typed && typed.word.length > 1) selectWord(typed.word);
      else if (r.exact || (r.items.length === 1 && !words.length)) select(r.items[0]);
      else if (!r.items.length && words.length) selectWord(words[0].word);  // most common word for the reading
      else { current = null; detail.hidden = true; detail.innerHTML = ''; }
    });
  }
  var timer;
  input.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(runSearch, 200); });
  $('#kj-search').addEventListener('submit', function (e) { e.preventDefault(); clearTimeout(timer); runSearch(); });
  /* which meanings go on the sheets: English, German or both, never neither */
  var langBoxes = { en: $('#kj-lang-en'), de: $('#kj-lang-de') };
  function syncLangs() {
    langBoxes.en.checked = langs.en;
    langBoxes.de.checked = langs.de;
  }
  syncLangs();
  ['en', 'de'].forEach(function (l) {
    langBoxes[l].addEventListener('change', function () {
      langs[l] = langBoxes[l].checked;
      if (!langs.en && !langs.de) langs[l] = true;
      syncLangs();
      try { localStorage.setItem('kanji-langs', JSON.stringify(langs)); } catch (e) {}
      applyLang();
      reselect();
    });
  });
  $$('[data-example]').forEach(function (b) {
    b.addEventListener('click', function () { input.value = b.getAttribute('data-example'); runSearch(); });
  });

  results.addEventListener('click', function (e) {
    var t = e.target.closest('.kj-tile');
    if (t) select(t.getAttribute('data-char'));
  });
  wordResults.addEventListener('click', function (e) {
    var t = e.target.closest('.kj-word');
    if (t) selectWord(t.getAttribute('data-word'));
  });

  function markSelected(item) {
    $$('.kj-tile', results).forEach(function (t) { t.classList.toggle('is-selected', t.getAttribute('data-char') === item); });
    $$('.kj-word', wordResults).forEach(function (t) { t.classList.toggle('is-selected', t.getAttribute('data-word') === item); });
  }

  /* entry for Worksheet.wordPage, from a word and the glyphs of its kanji */
  function wordEntry(w, g) {
    var chars = kanjiOf(w.word);
    return { word: w.word, reading: w.reading, gloss: w.gloss, rows: w.rows, glyphs: chars.map(function (c) { return g[c]; }),
      infos: chars.filter(function (c, i) { return byChar[c] && chars.indexOf(c) === i; }).map(function (c) { return byChar[c]; }) };
  }
  function entryText(e) {
    return e.word + e.reading + e.gloss + e.infos.map(function (k, i) { return infoText(k, e.glyphs[i]); }).join('');
  }

  function actionsHtml(item, label) {
    var inList = list.indexOf(item) >= 0;
    return '<button type="button" class="kj-btn kj-btn--primary" data-generate="' + esc(item) + '">' + icon('sheet') + label + '</button>' +
      '<button type="button" class="kj-btn" data-add="' + esc(item) + '"' + (inList ? ' disabled' : '') + '>' +
      (inList ? 'In your list' : '+ Add to list') + '</button>';
  }

  var current = null;
  function selectWord(word) {
    current = word;
    markSelected(word);
    detail.hidden = false;
    detail.innerHTML = '<div class="kj-loading">Loading ' + esc(word) + '…</div>';
    loadWords().then(function (v) {
      var w = v.byWord[word];
      return glyphs(kanjiOf(word)).then(function (g) {
        var entry = wordEntry(w, g);
        return fontsFor(entryText(entry)).then(function () {
          if (current !== word) return;
          detail.innerHTML = '<div class="kj-sheet">' + Worksheet.wordPreview(entry) + '</div>' +
            '<div class="kj-parts"><span>Kanji in it</span>' + entry.infos.map(function (k) {
              return '<button type="button" class="kj-chip" data-search="' + esc(k.char) + '" lang="ja">' + esc(k.char) + '</button>';
            }).join('') + '</div>' +
            '<div class="kj-actions">' + actionsHtml(word, 'Generate word worksheet') + '</div>';
        });
      });
    }).catch(function (err) { detail.innerHTML = '<p class="kj-error">Could not load ' + esc(word) + ': ' + esc(err.message) + '</p>'; });
  }

  function select(ch) {
    current = ch;
    markSelected(ch);
    var k = byChar[ch];
    detail.hidden = false;
    detail.innerHTML = '<div class="kj-loading">Loading ' + esc(ch) + '…</div>';
    Promise.all([glyphs([ch]), loadComponents()]).then(function (res) {
      var g = res[0][ch], index = res[1];
      if (current !== ch) return;
      var used = 0;
      Object.keys(index).forEach(function (c) {
        if (c !== ch && index[c].some(function (p) { return p[0] === ch || p[1] === ch; })) used++;
      });
      var parts = [];
      (index[ch] || []).forEach(function (p) { if (parts.indexOf(p[0]) < 0) parts.push(p[0]); });
      var partsHtml = parts.length ? '<div class="kj-parts"><span>Built from</span>' + parts.map(function (p) {
        return '<button type="button" class="kj-chip" data-search="' + esc(p) + '" lang="ja">' + esc(p) + '</button>';
      }).join('') + '</div>' : '';
      if (!k || !g) {  // a component that is not a kanji of its own (氵, 亻 …)
        detail.innerHTML = '<div class="kj-detail__comp"><span lang="ja">' + esc(ch) + '</span><div><strong>Component</strong>' +
          '<p>' + used + ' kanji contain ' + esc(ch) + '.</p></div></div>' + partsHtml +
          '<div class="kj-actions">' + (used ? '<button type="button" class="kj-btn kj-btn--primary" data-family="' + esc(ch) +
          '">Show family of ' + esc(ch) + '</button>' : '') + '</div>';
        return;
      }
      return fontsFor(infoText(k, g)).then(function () {
        if (current !== ch) return;
        detail.innerHTML =
          '<div class="kj-sheet">' + Worksheet.kanjiPreview(k, g) + '</div>' + partsHtml +
          '<div class="kj-actions">' + actionsHtml(ch, 'Generate worksheet') +
          (used ? '<button type="button" class="kj-btn" data-family="' + esc(ch) + '">Family · ' + used + ' kanji contain ' + esc(ch) + '</button>' : '') +
          '</div>';
      });
    }).catch(function (err) { detail.innerHTML = '<p class="kj-error">Could not load ' + esc(ch) + ': ' + esc(err.message) + '</p>'; });
  }

  detail.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-generate')) generateKanji([b.getAttribute('data-generate')], b.getAttribute('data-generate'));
    if (b.hasAttribute('data-add')) { addToList(b.getAttribute('data-add')); b.disabled = true; b.textContent = 'In your list'; }
    if (b.hasAttribute('data-family')) openFamily(b.getAttribute('data-family'));
    if (b.hasAttribute('data-search')) { input.value = b.getAttribute('data-search'); runSearch(); }
  });

  function reselect() { if (current) (current.length > 1 ? selectWord : select)(current); }

  /* the "my list" tray: single kanji and whole words */
  var tray = $('#kj-list');
  function addToList(ch) { if (list.indexOf(ch) < 0) list.push(ch); renderList(); }
  function renderList() {
    tray.hidden = !list.length;
    $('#kj-list-chars').innerHTML = list.map(function (c) {
      return '<span class="kj-chip kj-chip--removable" lang="ja">' + esc(c) +
        '<button type="button" data-remove="' + esc(c) + '" aria-label="Remove ' + esc(c) + '">×</button></span>';
    }).join('');
    var words = list.filter(function (i) { return i.length > 1; }).length, chars = list.length - words;
    $('#kj-list-count').textContent = [chars ? chars + ' kanji' : '', words ? words + (words === 1 ? ' word' : ' words') : '']
      .filter(Boolean).join(', ') + ' · ' + list.length + (list.length === 1 ? ' page' : ' pages');
  }
  tray.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-remove')) { list.splice(list.indexOf(b.getAttribute('data-remove')), 1); renderList(); reselect(); }
    if (b.id === 'kj-list-clear') { list = []; renderList(); reselect(); }
    if (b.id === 'kj-list-generate') generateKanji(list.slice(), 'list');
  });

  /* ---------- Bundles tab ---------- */
  var bundleChars = [];
  function bundleSelect() {
    var level = +$('#kj-b-level').value, grade = +$('#kj-b-grade').value, top = +$('#kj-b-top').value;
    if (!level && !grade && !top) return [];
    return kanji.filter(function (k) {
      return (!level || k.level === level) && (!grade || k.grade === grade) &&
        (!top || (k.freq > 0 && k.freq <= top));
    }).sort(function (a, b) { return (a.freq || 9999) - (b.freq || 9999) || a.strokes - b.strokes; });
  }
  function bundleName() {
    var p = [];
    if (+$('#kj-b-level').value) p.push('n' + $('#kj-b-level').value);
    if (+$('#kj-b-grade').value) p.push('grade' + $('#kj-b-grade').value);
    if (+$('#kj-b-top').value) p.push('top' + $('#kj-b-top').value);
    return p.join('_') || 'bundle';
  }
  var MAX_PAGES = 150;
  function updateBundle() {
    ready.then(function () {
      bundleChars = bundleSelect().map(function (k) { return k.char; });
      var count = bundleChars.length, from = $('#kj-b-from'), to = $('#kj-b-to');
      $('#kj-b-count').textContent = count ? count + ' kanji, most frequent first' : 'Choose at least one filter.';
      $('#kj-b-preview').innerHTML = bundleChars.slice(0, 400).map(function (c) {
        return '<button type="button" class="kj-mini" data-char="' + esc(c) + '" lang="ja" title="' +
          esc((byChar[c].meanings[0] || '')) + '">' + esc(c) + '</button>';
      }).join('') + (count > 400 ? '<span class="kj-more">+' + (count - 400) + ' more</span>' : '');
      from.max = to.max = Math.max(count, 1);
      from.value = 1;
      to.value = Math.min(count, MAX_PAGES);
      $('#kj-b-range').hidden = count <= MAX_PAGES;
      $('#kj-b-generate').disabled = !count;
      rangeNote();
    });
  }
  function bundleRange() {
    var count = bundleChars.length;
    var from = Math.max(1, Math.min(+$('#kj-b-from').value || 1, count));
    var to = Math.max(from, Math.min(+$('#kj-b-to').value || count, count, from + MAX_PAGES - 1));
    return [from, to];
  }
  function rangeNote() {
    var r = bundleRange();
    $('#kj-b-generate').innerHTML = icon('sheet') + 'Generate ' + (r[1] - r[0] + 1) + (r[1] === r[0] ? ' page' : ' pages');
  }
  $$('#kj-b-level, #kj-b-grade, #kj-b-top').forEach(function (el) { el.addEventListener('change', updateBundle); });
  $$('#kj-b-from, #kj-b-to').forEach(function (el) { el.addEventListener('input', rangeNote); });
  $$('[data-bundle]').forEach(function (b) {
    b.addEventListener('click', function () {
      var v = JSON.parse(b.getAttribute('data-bundle'));
      ['level', 'grade', 'top'].forEach(function (f) { $('#kj-b-' + f).value = v[f] || 0; });
      updateBundle();
    });
  });
  $('#kj-b-preview').addEventListener('click', function (e) {
    var t = e.target.closest('[data-char]');
    if (!t) return;
    input.value = t.getAttribute('data-char');
    showTab('search');
    runSearch();
  });
  $('#kj-b-generate').addEventListener('click', function () {
    var r = bundleRange();
    generateKanji(bundleChars.slice(r[0] - 1, r[1]), bundleName() + (bundleChars.length > MAX_PAGES ? '_' + r[0] + '-' + r[1] : ''));
  });

  /* ---------- Families tab ---------- */
  var famInput = $('#kj-f-q'), famOut = $('#kj-f-out'), famState = null;
  function openFamily(comp) { famInput.value = comp; showTab('family'); runFamily(); }
  function runFamily() {
    var comp = (famInput.value.match(CJK) || [])[0];
    if (!comp) { famOut.innerHTML = ''; famState = null; return; }
    famOut.innerHTML = '<div class="kj-loading">Finding kanji that contain ' + esc(comp) + '…</div>';
    ready.then(function () { return buildFamily(comp, $('#kj-f-rare').checked); }).then(function (fam) {
      if (!fam.members) { famOut.innerHTML = '<p class="kj-note">No kanji contain ' + esc(comp) + '.</p>'; famState = null; return; }
      return withGlyphs(fam).then(function (fam) {
        var text = fam.shown.map(function (m) { return infoText(m.info, m.glyph); }).join('') + (fam.info ? infoText(fam.info, fam.glyph) : comp);
        return fontsFor(text).then(function () {
          if ((famInput.value.match(CJK) || [])[0] !== comp) return;
          famState = fam;
          var pages = Math.max(1, Worksheet.familyPages(fam).length) + ($('#kj-f-sheets').checked ? fam.shown.length : 0);
          famOut.innerHTML = '<div class="kj-sheet">' + Worksheet.familyPages(fam, { headerOnly: true }) + '</div>' +
            '<div class="kj-family-grid">' + fam.shown.map(function (m) {
              return '<button type="button" class="kj-fam" data-char="' + esc(m.info.char) + '" title="' + esc(m.info.meanings[0] || '') + '">' +
                Worksheet.glyphSvg(m.glyph, m.strokes, 'kj-fam__glyph') +
                '<span class="kj-fam__meaning">' + esc(m.info.meanings[0] || '–') + '</span></button>';
            }).join('') + '</div>' +
            '<div class="kj-actions"><button type="button" class="kj-btn kj-btn--primary" id="kj-f-generate">' + icon('sheet') +
            'Generate ' + pages + (pages === 1 ? ' page' : ' pages') + '</button></div>';
        });
      });
    }).catch(function (err) { famOut.innerHTML = '<p class="kj-error">' + esc(err.message) + '</p>'; });
  }
  $('#kj-f-form').addEventListener('submit', function (e) { e.preventDefault(); runFamily(); });
  $$('#kj-f-rare, #kj-f-sheets').forEach(function (el) { el.addEventListener('change', runFamily); });
  $$('[data-component]').forEach(function (b) {
    b.addEventListener('click', function () { famInput.value = b.getAttribute('data-component'); runFamily(); });
  });
  famOut.addEventListener('click', function (e) {
    if (e.target.closest('#kj-f-generate') && famState) {
      var fam = famState, pages = Worksheet.familyPages(fam);
      if ($('#kj-f-sheets').checked) {
        fam.shown.forEach(function (m) { pages.push(Worksheet.kanjiPage(m.info, m.glyph)); });
      }
      showPages(pages, 'family_' + fam.component);
      return;
    }
    var t = e.target.closest('.kj-fam');
    if (t) { input.value = t.getAttribute('data-char'); showTab('search'); runSearch(); }
  });

  /* ---------- generating and printing ---------- */
  /* items: single kanji (one kanji page each) and words (one word page each), in order */
  function generateKanji(items, name) {
    if (!items.length) return;
    var hasWords = items.some(function (i) { return i.length > 1; });
    var overlay = openOverlay(name, 'Preparing ' + items.length + (items.length === 1 ? ' page…' : ' pages…'));
    var chars = [];
    items.forEach(function (i) { (i.length > 1 ? kanjiOf(i) : [i]).forEach(function (c) { if (chars.indexOf(c) < 0) chars.push(c); }); });
    Promise.all([ready, hasWords ? loadWords() : null, glyphs(chars)]).then(function (res) {
      var v = res[1], g = res[2], text = '';
      var make = items.map(function (i) {
        if (i.length === 1) {
          if (!byChar[i] || !g[i]) return null;
          text += infoText(byChar[i], g[i]);
          return function () { return Worksheet.kanjiPage(byChar[i], g[i]); };
        }
        var w = v.byWord[i];
        if (!w || kanjiOf(i).some(function (c) { return !g[c]; })) return null;
        var entry = wordEntry(w, g);
        text += entryText(entry);
        return function () { return Worksheet.wordPage(entry); };
      }).filter(Boolean);
      return fontsFor(text).then(function () {
        if (!overlay.isConnected) return;
        showPages(make.map(function (f) { return f(); }), name, overlay);
      });
    }).catch(function (err) { $('.ws-overlay__status', overlay).textContent = 'Failed: ' + err.message; });
  }

  function openOverlay(name, msg) {
    var old = document.getElementById('ws-overlay');
    if (old) old.remove();
    var el = document.createElement('div');
    el.id = 'ws-overlay';
    el.className = 'ws-overlay';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Worksheet preview');
    el.innerHTML = '<div class="ws-overlay__bar"><div><strong>' + esc(name) + '</strong> <span class="ws-overlay__status">' + esc(msg) +
      '</span></div><div class="ws-overlay__actions"><button type="button" class="kj-btn kj-btn--primary" data-print disabled>' + icon('print') +
      'Print / Save as PDF</button><button type="button" class="kj-btn" data-close>Close</button></div></div>' +
      '<p class="ws-overlay__hint">In the print dialog choose <em>Save as PDF</em>, paper size A4, margins <em>none</em> and scale 100 %.</p>' +
      '<div class="ws-pages"></div>';
    document.body.appendChild(el);
    document.body.classList.add('ws-open');
    el.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) closeOverlay();
      if (e.target.closest('[data-print]')) {
        var title = document.title;
        document.title = name;  // becomes the suggested PDF file name
        window.print();
        document.title = title;
      }
    });
    $('[data-close]', el).focus();
    return el;
  }
  function closeOverlay() {
    var el = document.getElementById('ws-overlay');
    if (el) el.remove();
    document.body.classList.remove('ws-open');
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeOverlay(); });

  /* pages: list of Worksheet pages; rendered in chunks so long bundles stay responsive */
  function showPages(pages, name, overlay) {
    overlay = overlay || openOverlay(name, '');
    var box = $('.ws-pages', overlay), i = 0;
    function step() {
      if (!overlay.isConnected) return;
      var html = '';
      for (var end = Math.min(i + 10, pages.length); i < end; i++) html += pages[i].svg();
      box.insertAdjacentHTML('beforeend', html);
      $('.ws-overlay__status', overlay).textContent = i < pages.length ? 'Rendering ' + i + ' / ' + pages.length + '…' :
        pages.length + (pages.length === 1 ? ' page' : ' pages') + ' · A4';
      if (i < pages.length) requestAnimationFrame(step);
      else $('[data-print]', overlay).disabled = false;
    }
    step();
  }

  function icon(name) {
    var d = name === 'print' ? 'M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z' : 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6';
    return '<svg class="kj-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="' + d +
      '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
  }

  updateBundle();
  input.focus();
})();
