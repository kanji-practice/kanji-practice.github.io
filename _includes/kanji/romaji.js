/* Hepburn romanisation of kana and romaji -> hiragana: a port of kanjiws/romaji.py. */
var Romaji = (function () {
  var BASE = {
    'あ': 'a', 'い': 'i', 'う': 'u', 'え': 'e', 'お': 'o',
    'か': 'ka', 'き': 'ki', 'く': 'ku', 'け': 'ke', 'こ': 'ko',
    'さ': 'sa', 'し': 'shi', 'す': 'su', 'せ': 'se', 'そ': 'so',
    'た': 'ta', 'ち': 'chi', 'つ': 'tsu', 'て': 'te', 'と': 'to',
    'な': 'na', 'に': 'ni', 'ぬ': 'nu', 'ね': 'ne', 'の': 'no',
    'は': 'ha', 'ひ': 'hi', 'ふ': 'fu', 'へ': 'he', 'ほ': 'ho',
    'ま': 'ma', 'み': 'mi', 'む': 'mu', 'め': 'me', 'も': 'mo',
    'や': 'ya', 'ゆ': 'yu', 'よ': 'yo',
    'ら': 'ra', 'り': 'ri', 'る': 'ru', 'れ': 're', 'ろ': 'ro',
    'わ': 'wa', 'を': 'o', 'ん': 'n',
    'が': 'ga', 'ぎ': 'gi', 'ぐ': 'gu', 'げ': 'ge', 'ご': 'go',
    'ざ': 'za', 'じ': 'ji', 'ず': 'zu', 'ぜ': 'ze', 'ぞ': 'zo',
    'だ': 'da', 'ぢ': 'ji', 'づ': 'zu', 'で': 'de', 'ど': 'do',
    'ば': 'ba', 'び': 'bi', 'ぶ': 'bu', 'べ': 'be', 'ぼ': 'bo',
    'ぱ': 'pa', 'ぴ': 'pi', 'ぷ': 'pu', 'ぺ': 'pe', 'ぽ': 'po',
    'ぁ': 'a', 'ぃ': 'i', 'ぅ': 'u', 'ぇ': 'e', 'ぉ': 'o', 'ゔ': 'vu'
  };
  var SMALL = { 'ゃ': 'a', 'ゅ': 'u', 'ょ': 'o' };

  function toHiragana(text) {
    return text.replace(/[ァ-ヶ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0x60); });
  }

  /* Romanise kana; '.', '-' and other characters pass through unchanged. */
  function romaji(text) {
    var s = toHiragana(text), out = [], double = false;
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (c === 'っ') { double = true; continue; }
      if (c === 'ー') { var prev = out[out.length - 1]; out.push(prev ? prev.slice(-1) : ''); continue; }
      var syl = BASE[c];
      if (syl == null) { out.push(c); continue; }
      if (i + 1 < s.length && SMALL[s[i + 1]]) {  // yoon: き+ゃ -> kya
        var glide = SMALL[s[i + 1]];
        syl = (syl === 'shi' || syl === 'chi' || syl === 'ji') ? syl.slice(0, -1) + glide : syl.slice(0, -1) + 'y' + glide;
        i++;
      }
      if (double) { syl = (syl.indexOf('ch') === 0 ? 't' : syl[0]) + syl; double = false; }
      out.push(syl);
    }
    return out.join('');
  }

  var KANA = {};
  Object.keys(BASE).forEach(function (k) { if ('ぢづをぁぃぅぇぉゔ'.indexOf(k) < 0) KANA[BASE[k]] = k; });
  var EXTRA = {
    ji: 'じ', zu: 'ず', wo: 'を', si: 'し', ti: 'ち', tu: 'つ', hu: 'ふ', zi: 'じ', di: 'ぢ', du: 'づ',
    sya: 'しゃ', syu: 'しゅ', syo: 'しょ', tya: 'ちゃ', tyu: 'ちゅ', tyo: 'ちょ', zya: 'じゃ', zyu: 'じゅ', zyo: 'じょ',
    ja: 'じゃ', ju: 'じゅ', jo: 'じょ', ca: 'か', cha: 'ちゃ', chu: 'ちゅ', cho: 'ちょ', sha: 'しゃ', shu: 'しゅ', sho: 'しょ',
    la: 'ら', li: 'り', lu: 'る', le: 'れ', lo: 'ろ'
  };
  Object.keys(EXTRA).forEach(function (k) { KANA[k] = EXTRA[k]; });
  var Y = { k: 'き', g: 'ぎ', n: 'に', h: 'ひ', b: 'び', p: 'ぴ', m: 'み', r: 'り' };
  Object.keys(Y).forEach(function (c) {
    KANA[c + 'ya'] = Y[c] + 'ゃ'; KANA[c + 'yu'] = Y[c] + 'ゅ'; KANA[c + 'yo'] = Y[c] + 'ょ';
  });
  var MACRON = { 'ā': 'aa', 'ī': 'ii', 'ū': 'uu', 'ē': 'ee', 'ō': 'ou' };
  var VOWELS = 'aiueo';

  /* Romaji -> hiragana (Hepburn and Kunrei, macrons, doubled consonants, n/n'); null if not romaji. */
  function toKana(text) {
    var s = text.toLowerCase().trim().replace(/[āīūēō]/g, function (m) { return MACRON[m]; });
    var out = [], i = 0;
    while (i < s.length) {
      var c = s[i];
      if (c === "'" || c === '-') { i++; continue; }
      if (i + 1 < s.length && c === s[i + 1] && (VOWELS + 'n').indexOf(c) < 0) { out.push('っ'); i++; continue; }
      if (c === 'n' && (i + 1 === s.length || (VOWELS + 'y').indexOf(s[i + 1]) < 0)) { out.push('ん'); i++; continue; }
      var found = false;
      for (var size = 3; size >= 1; size--) {
        var chunk = s.slice(i, i + size);
        if (chunk.length === size && KANA[chunk]) { out.push(KANA[chunk]); i += size; found = true; break; }
      }
      if (!found) return null;
    }
    return out.join('');
  }

  return { romaji: romaji, toHiragana: toHiragana, toKana: toKana };
})();
