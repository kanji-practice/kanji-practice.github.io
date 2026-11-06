/* A4 kanji worksheets as SVG: a port of kanjiws/worksheet.py (jp_kanji_worksheet).
   Layout code works in PDF points with y pointing up, like reportlab; Page converts on output. */
var Worksheet = (function () {
  var MM = 72 / 25.4;
  var W = 210 * MM, H = 297 * MM;
  var FONT = "'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', sans-serif";

  var GREY = 'rgb(199,199,199)', LIGHT = 'rgb(217,217,217)', DARK = 'rgb(89,89,89)', RED = 'rgb(217,26,26)';
  var GUIDE_MAX = 0.75, GUIDE_MIN = 0.15;
  var FIRST_ALPHA = 0.5;
  var PANEL_FILL = 'rgb(244,244,244)', PANEL_EDGE = 'rgb(184,184,184)';
  var TITLE_INK = 'rgb(31,59,94)';
  var PAD = 5 * MM, MIN_PANEL = 86 * MM, PRACTICE_COLS = 13, LINE = 16;
  var ON_COLOR = ['rgb(252,232,194)', 'rgb(128,74,5)'], KUN_COLOR = ['rgb(209,240,227)', 'rgb(18,89,64)'];
  var EN_COLOR = ['rgb(214,230,250)', 'rgb(22,62,122)'], DE_COLOR = ['rgb(236,222,248)', 'rgb(88,40,128)'];
  var LANG_COLOR = { EN: EN_COLOR, DE: DE_COLOR };
  var ON_TAG = 'ON 音 katakana', KUN_TAG = 'KUN 訓 hiragana';

  var ctx = document.createElement('canvas').getContext('2d');
  function textWidth(text, size, bold) {
    ctx.font = (bold ? '700 ' : '400 ') + size + 'px ' + FONT;
    return ctx.measureText(text).width;
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function n(v) { return Math.round(v * 100) / 100; }

  /* One A4 page. Methods take reportlab-style coordinates (origin bottom left, y up). */
  function Page() { this.out = []; this.defs = []; this.ids = 0; }
  Page.prototype.text = function (x, y, s, size, fill, opts) {
    opts = opts || {};
    this.out.push('<text x="' + n(x) + '" y="' + n(H - y) + '" font-size="' + size + '" fill="' + (fill || '#000') + '"' +
      (opts.bold ? ' font-weight="700"' : '') + (opts.anchor ? ' text-anchor="' + opts.anchor + '"' : '') +
      '>' + esc(s) + '</text>');
  };
  Page.prototype.rect = function (x, y, w, h, o) {
    o = o || {};
    this.out.push('<rect x="' + n(x) + '" y="' + n(H - y - h) + '" width="' + n(w) + '" height="' + n(h) + '"' +
      (o.r ? ' rx="' + n(o.r) + '"' : '') + ' fill="' + (o.fill || 'none') + '"' +
      (o.stroke ? ' stroke="' + o.stroke + '" stroke-width="' + (o.lw || 1) + '"' : '') + '/>');
  };
  Page.prototype.line = function (x1, y1, x2, y2, o) {
    this.out.push('<line x1="' + n(x1) + '" y1="' + n(H - y1) + '" x2="' + n(x2) + '" y2="' + n(H - y2) + '" stroke="' +
      o.stroke + '" stroke-width="' + o.lw + '"' + (o.dash ? ' stroke-dasharray="' + o.dash + '"' : '') +
      (o.opacity != null ? ' stroke-opacity="' + n(o.opacity) + '"' : '') + '/>');
  };
  /* Remember a block of output so the panel behind it can be drawn first (boxed). */
  Page.prototype.mark = function () { return this.out.length; };
  Page.prototype.insert = function (at, s) { this.out.splice(at, 0, s); };
  Page.prototype.svg = function (viewBox) {
    return '<svg xmlns="http://www.w3.org/2000/svg" class="ws-page" viewBox="' + (viewBox || '0 0 ' + n(W) + ' ' + n(H)) +
      '" font-family="' + esc(FONT) + '">' + (this.defs.length ? '<defs>' + this.defs.join('') + '</defs>' : '') +
      '<rect width="100%" height="100%" fill="#fff"/>' + this.out.join('') + '</svg>';
  };

  function startPoint(d) {
    var m = /^\s*[Mm]\s*(-?[\d.]+)[\s,]*(-?[\d.]+)/.exec(d);
    return m ? [+m[1], +m[2]] : [0, 0];
  }

  /* Strokes[:upto] into the square (x, y)-(x+box, y+box); y is the bottom edge. */
  function strokesSvg(strokes, size, x, y, box, o) {
    o = o || {};
    var upto = o.upto == null ? strokes.length : o.upto;
    var marked = o.marked || {};
    var s = '<g transform="translate(' + n(x) + ',' + n(H - y - box) + ') scale(' + n(box / size * 1000) / 1000 +
      ')" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="' + (o.width || 3) + '"' +
      (o.alpha != null ? ' stroke-opacity="' + n(o.alpha) + '"' : '') + '>';
    for (var i = 0; i < upto; i++) {
      var last = o.highlightLast && i === upto - 1;
      s += '<path d="' + strokes[i] + '" stroke="' + (last || marked[i] ? RED : (o.color || '#000')) + '"/>';
      if (last) {
        var p = startPoint(strokes[i]);
        s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="1.95" fill="' + RED + '" stroke="none"/>';
      }
    }
    return s + '</g>';
  }
  Page.prototype.strokes = function (strokes, size, x, y, box, o) { this.out.push(strokesSvg(strokes, size, x, y, box, o)); };

  function wrap(text, size, width) {
    var lines = [], line = '';
    text.split(' ').forEach(function (word) {
      var trial = (line + ' ' + word).trim();
      if (textWidth(trial, size) <= width) { line = trial; return; }
      if (line) lines.push(line);
      line = word;
      while (textWidth(line, size) > width) {
        var k = line.length;
        while (k > 1 && textWidth(line.slice(0, k), size) > width) k--;
        lines.push(line.slice(0, k));
        line = line.slice(k);
      }
    });
    if (line) lines.push(line);
    return lines;
  }

  function short(text, size, width) {
    while (text && textWidth(text, size) > width) text = text.replace(/…$/, '').slice(0, -1).trim() + '…';
    return text;
  }

  function label(c, x, y, text) { c.text(x, y, text, 10.5, TITLE_INK, { bold: true }); }

  function pillWidth(tags, size) {
    return Math.max.apply(null, tags.map(function (t) { return textWidth(t, size || 7.5); })) + 3.6 * MM;
  }

  function pill(c, x, y, text, color, size, width) {
    size = size || 7.5;
    var w = width || pillWidth([text], size);
    c.rect(x, y - 1.4 * MM, w, size * 0.35 * MM + 2.4 * MM, { r: 1.3 * MM, fill: color[0] });
    c.text(x + 1.8 * MM, y, text, size, color[1]);
    return x + w + 2 * MM;
  }

  /* Pill, then each reading in kana with romaji; wraps within width w. Returns the y below. */
  function readingsLine(c, x, y, w, tag, color, items, size) {
    size = size || 12;
    var pw = pillWidth([ON_TAG, KUN_TAG]);
    x = pill(c, x, y, tag, color, 7.5, pw);
    var x0 = x;
    w -= pw + 2 * MM;
    (items.length ? items : ['-']).forEach(function (item) {
      var kana = item.replace(/\./g, '・');
      var rom = items.length ? '(' + Romaji.romaji(item) + ')' : '';
      var need = textWidth(kana, size) + 1.5 * MM + textWidth(rom, 8.5) + 4 * MM;
      if (x > x0 + 1 && x + need > x0 + w) { x = x0; y -= LINE; }
      c.text(x, y, kana, size, '#000');
      x += textWidth(kana, size) + 1.5 * MM;
      c.text(x, y, rom, 8.5, DARK);
      x += textWidth(rom, 8.5) + 4 * MM;
    });
    return y - LINE - 1 * MM;
  }

  /* One row per language: a small EN / DE pill, then the meanings on a single line (smaller, then cut with …).
     rows: [['EN', text], ['DE', text]]. The text starts where the readings below start. Returns the y below. */
  function meaningRows(c, x, y, w, rows) {
    var pw = pillWidth([ON_TAG, KUN_TAG]) + 2 * MM, tx = x + pw, room = w - pw;
    rows.forEach(function (r) {
      pill(c, x, y, r[0], LANG_COLOR[r[0]] || EN_COLOR, 7.5, pillWidth(['EN', 'DE']));
      var size = 12, text = r[1] || '-';
      while (size > 8.5 && textWidth(text, size) > room) size -= 0.5;
      c.text(tx, y, short(text, size, room), size, '#000');
      y -= LINE + 1 * MM;
    });
    return y;
  }

  /* Meaning, ON and KUN readings, meta line: the same block in every header. Returns y below. */
  function infoBlock(c, info, tx, tw, y, nStrokes) {
    label(c, tx, y, 'Meaning');
    y -= 6.5 * MM;
    y = meaningRows(c, tx, y, tw, info.rows || [['EN', info.meanings.join(', ') || '-']]);
    y -= 1 * MM;
    y = readingsLine(c, tx, y, tw, ON_TAG, ON_COLOR, info.on);
    y = readingsLine(c, tx, y, tw, KUN_TAG, KUN_COLOR, info.kun);
    var meta = [(nStrokes || info.strokes) + ' strokes'];
    if (info.grade) meta.push('grade ' + info.grade);
    if (info.level) meta.push('JLPT N' + info.level);
    c.text(tx, y, meta.join('  ·  '), 9, DARK);
    return y - 4 * MM;
  }

  /* Divider + 'Example words' in two columns (word, kana, romaji, meaning). Returns y below. */
  function exampleWords(c, x0, iw, y, words, limit) {
    if (!words || !words.length) return y;
    c.line(x0, y + 2 * MM, x0 + iw, y + 2 * MM, { stroke: PANEL_EDGE, lw: 0.4 });
    y -= 4.5 * MM;
    label(c, x0, y, 'Example words');
    y -= 6 * MM;
    var colW = iw / 2, shown = words.slice(0, limit || 6), ONE = 5.5 * MM, TWO = 9.2 * MM;
    /* English and German on one line when both fit, else the German one on a second line */
    var cells = shown.map(function (w, i) {
      var wx = x0 + (i % 2) * colW, head = w[0] + '  ' + w[1], rom = '(' + Romaji.romaji(w[1]) + ')';
      var gx = wx + textWidth(head, 10) + 1.5 * MM + textWidth(rom, 8) + 2 * MM, room = wx + colW - 3 * MM - gx;
      var parts = [w[2], w[3]].filter(Boolean), joined = parts.join(' / ');
      var two = parts.length === 2 && textWidth(joined, 8.5) > room;
      return { w: w, wx: wx, head: head, rom: rom, gx: gx, room: room, lines: two ? parts : [joined] };
    });
    var rows = Math.ceil(cells.length / 2), heights = [];
    for (var r = 0; r < rows; r++) {
      heights.push(cells.slice(2 * r, 2 * r + 2).some(function (cell) { return cell.lines.length > 1; }) ? TWO : ONE);
    }
    var top = y;
    cells.forEach(function (cell, i) {
      var wy = top - heights.slice(0, Math.floor(i / 2)).reduce(function (a, h) { return a + h; }, 0);
      c.text(cell.wx, wy, cell.head, 10, '#000');
      c.text(cell.wx + textWidth(cell.head, 10) + 1.5 * MM, wy, cell.rom, 8, DARK);
      cell.lines.forEach(function (line, j) {
        c.text(cell.gx, wy - j * 3.7 * MM, short(line, 8.5, cell.room), 8.5, DARK);
      });
    });
    return y - heights.reduce(function (a, h) { return a + h; }, 0) + 2 * MM;
  }

  /* Rounded panel behind whatever render(c) draws from y_top - PAD down; returns the y below it. */
  function boxed(c, x, yTop, w, render, minHeight) {
    var at = c.mark();
    var yEnd = Math.min(render(c), yTop - (minHeight || 0) + PAD);
    var p = new Page();
    p.rect(x, yEnd - PAD, w, yTop - yEnd + PAD, { r: 3 * MM, fill: PANEL_FILL, stroke: PANEL_EDGE, lw: 0.8 });
    c.insert(at, p.out[0]);
    return yEnd - PAD;
  }

  function glyphTile(c, x, y, size) {
    c.rect(x, y, size, size, { r: 2 * MM, fill: '#fff', stroke: PANEL_EDGE, lw: 0.6 });
  }

  function drawStrokeOrder(c, glyphs, x0, y, innerW, step) {
    label(c, x0, y, 'Stroke order');
    y -= 3 * MM;
    var base = step;
    glyphs.forEach(function (g) {
      var strokes = g.strokes;
      step = base;
      var perRow = Math.floor(innerW / step);
      if (strokes.length > 2 * perRow) { perRow = Math.ceil(strokes.length / 2); step = innerW / perRow; }
      for (var i = 0; i < strokes.length; i++) {
        var cx = x0 + (i % perRow) * step, cy = y - (Math.floor(i / perRow) + 1) * step;
        c.rect(cx, cy, step, step, { stroke: LIGHT, lw: 0.5 });
        c.strokes(strokes, g.size, cx + MM, cy + MM, step - 2 * MM, { width: 2.5, color: GREY, upto: i + 1, highlightLast: true });
        c.text(cx + 1.2 * MM, cy + step - 3.2 * MM, String(i + 1), 7.5, RED);
      }
      y -= (Math.floor((strokes.length - 1) / perRow) + 1) * step + 2 * MM;
    });
    return y - 4 * MM;
  }

  /* Fill the rest of the page with boxes; opacity falls from the first repetition to 0 % in the last. */
  function drawPractice(c, glyphs, x0, y, innerW, bottom) {
    bottom = bottom == null ? 12 * MM : bottom;
    label(c, x0, y, 'Practice');
    y -= 3 * MM;
    var count = glyphs.length, reps = Math.max(Math.floor(PRACTICE_COLS / count), 1), cols = reps * count;
    var box = innerW / cols, rows = Math.max(Math.floor((y - bottom) / box), 1), cellH = (y - bottom) / rows;
    var g = Math.min(box, cellH) - 2.2 * MM;
    var ids = glyphs.map(function (gl, i) {  // each glyph once in <defs>, reused in every box
      var id = 'g' + (c.ids++);
      c.defs.push('<g id="' + id + '">' + strokesSvg(gl.strokes, gl.size, 0, H - g, g, { width: 3, color: 'rgb(38,38,38)' }) + '</g>');
      return id;
    });
    for (var r = 0; r < rows; r++) {
      for (var col = 0; col < cols; col++) {
        var cx = x0 + col * box, cy = y - (r + 1) * cellH;
        var fade = 1 - Math.floor(col / count) / Math.max(reps - 1, 1);
        var guide = GUIDE_MIN + (GUIDE_MAX - GUIDE_MIN) * fade;
        c.rect(cx, cy, box, cellH, { stroke: DARK, lw: 0.8 });
        c.line(cx + box / 2, cy, cx + box / 2, cy + cellH, { stroke: 'rgb(102,102,102)', lw: 0.7, dash: '3 2', opacity: guide });
        c.line(cx, cy + cellH / 2, cx + box, cy + cellH / 2, { stroke: 'rgb(102,102,102)', lw: 0.7, dash: '3 2', opacity: guide });
        var alpha = FIRST_ALPHA * fade;
        if (alpha <= 0.005) continue;
        c.out.push('<use href="#' + ids[col % count] + '" x="' + n(cx + (box - g) / 2) + '" y="' + n(H - cy - (cellH + g) / 2) +
          '" opacity="' + n(alpha) + '"/>');
      }
    }
  }

  var MARGIN = 12 * MM;

  /* Header panel of a kanji page; returns the y below it. */
  function kanjiHeader(c, info, glyph) {
    var innerW = W - 2 * MARGIN, top = H - MARGIN, x0 = MARGIN + PAD, iw = innerW - 2 * PAD;
    var head = 38 * MM, tile = head + 4 * MM;
    return boxed(c, MARGIN, top, innerW, function (cv) {
      var ytop = top - PAD;
      glyphTile(cv, x0, ytop - tile, tile);
      cv.strokes(glyph.strokes, glyph.size, x0 + 2 * MM, ytop - tile + 2 * MM, head, { width: 2.6 });
      var tx = x0 + tile + 8 * MM;
      var y = infoBlock(cv, info, tx, x0 + iw - tx, ytop - 3 * MM, glyph.strokes.length);
      y = Math.min(y, ytop - tile) - 4 * MM;
      return exampleWords(cv, x0, iw, y, glyph.words);
    }, MIN_PANEL);
  }

  /* glyph: {strokes, size, words} */
  function kanjiPage(info, glyph) {
    var c = new Page(), innerW = W - 2 * MARGIN;
    var y = kanjiHeader(c, info, glyph) - 7 * MM;
    y = drawStrokeOrder(c, [glyph], MARGIN, y, innerW, 19 * MM);
    drawPractice(c, [glyph], MARGIN, y, innerW);
    return c;
  }

  /* Header + stroke order only, cropped: the on-screen preview of a kanji page. */
  function kanjiPreview(info, glyph) {
    var c = new Page(), innerW = W - 2 * MARGIN;
    var y = kanjiHeader(c, info, glyph) - 7 * MM;
    y = drawStrokeOrder(c, [glyph], MARGIN, y, innerW, 19 * MM);
    var bottom = H - y - 2 * MM;
    return c.svg(n(MARGIN - 2) + ' ' + n(MARGIN - 2) + ' ' + n(innerW + 4) + ' ' + n(bottom - MARGIN + 4));
  }

  /* Example words for a word page: other words using its kanji, compounds first, interleaved. */
  function wordsForEntry(entry) {
    var pools = entry.glyphs.map(function (g) {
      return (g.words || []).filter(function (w) { return w[0] !== entry.word; });
    });
    var mixed = [], seen = {}, longest = Math.max.apply(null, pools.map(function (p) { return p.length; }).concat([0]));
    for (var i = 0; i < longest; i++) {
      pools.forEach(function (pool) {
        if (i < pool.length && !seen[pool[i][0]]) { seen[pool[i][0]] = true; mixed.push(pool[i]); }
      });
    }
    var compounds = mixed.filter(function (w) { return w[0].length >= 2; });
    return compounds.concat(mixed.filter(function (w) { return w[0].length < 2; })).slice(0, 6);
  }

  /* Header panel of a word page; entry: {word, reading, gloss, infos: [info], glyphs: [glyph]} */
  function wordHeader(c, entry) {
    var innerW = W - 2 * MARGIN, top = H - MARGIN, x0 = MARGIN + PAD, iw = innerW - 2 * PAD;
    var count = entry.glyphs.length, gsize = Math.min(34 * MM, (0.5 * innerW - 4 * MM * count) / count);
    return boxed(c, MARGIN, top, innerW, function (cv) {
      var ytop = top - PAD;
      entry.glyphs.forEach(function (g, i) {
        var gx = x0 + i * (gsize + 4 * MM);
        glyphTile(cv, gx, ytop - gsize - 4 * MM, gsize + 4 * MM);
        cv.strokes(g.strokes, g.size, gx + 2 * MM, ytop - gsize - 2 * MM, gsize, { width: 2.6 });
      });
      var tx = x0 + count * (gsize + 4 * MM) + 8 * MM, tw = x0 + iw - tx, y = ytop - 3 * MM;
      label(cv, tx, y, 'Reading');
      y -= 6 * MM;
      cv.text(tx, y, entry.reading, 14, '#000');
      cv.text(tx + textWidth(entry.reading, 14) + 2 * MM, y, '(' + Romaji.romaji(entry.reading) + ')', 9, DARK);
      y -= LINE + 2 * MM;
      label(cv, tx, y, 'Meaning');
      y -= 6.5 * MM;
      y = meaningRows(cv, tx, y, tw, entry.rows || [['EN', entry.gloss]]);
      y = Math.min(y, ytop - gsize - 4 * MM) - 3 * MM;

      cv.line(x0, y + 2 * MM, x0 + iw, y + 2 * MM, { stroke: PANEL_EDGE, lw: 0.4 });
      y -= 3 * MM;
      label(cv, x0, y, 'Kanji in this word');
      y -= 6 * MM;
      entry.infos.forEach(function (info) {
        cv.text(x0, y - MM, info.char, 16, '#000');
        var bx = x0 + 11 * MM;
        cv.text(bx, y, short(info.meanings.slice(0, 3).join(', '), 9, x0 + iw - bx), 9, '#000');
        y -= 5 * MM;
        y = readingsLine(cv, bx, y, x0 + iw - bx, ON_TAG, ON_COLOR, info.on.slice(0, 3), 10);
        y = readingsLine(cv, bx, y, x0 + iw - bx, KUN_TAG, KUN_COLOR, info.kun.slice(0, 3), 10);
        y -= MM;
      });
      return exampleWords(cv, x0, iw, y, wordsForEntry(entry));
    }, MIN_PANEL);
  }

  /* A page for a whole word: header, stroke order of every kanji, practice rows repeating the word. */
  function wordPage(entry) {
    var c = new Page(), innerW = W - 2 * MARGIN;
    var y = wordHeader(c, entry) - 7 * MM;
    y = drawStrokeOrder(c, entry.glyphs, MARGIN, y, innerW, 15 * MM);
    drawPractice(c, entry.glyphs, MARGIN, y, innerW);
    return c;
  }

  function wordPreview(entry) {
    var c = new Page(), innerW = W - 2 * MARGIN;
    var y = wordHeader(c, entry) - 7 * MM;
    y = drawStrokeOrder(c, entry.glyphs, MARGIN, y, innerW, 15 * MM);
    return c.svg(n(MARGIN - 2) + ' ' + n(MARGIN - 2) + ' ' + n(innerW + 4) + ' ' + n(H - y - 2 * MM - MARGIN + 4));
  }

  function pickWord(words) {
    words = words || [];
    for (var i = 0; i < words.length; i++) if (words[i][0].length >= 2) return words[i];
    return words[0];
  }

  /* family: {component, info, parts, shown: [{info, strokes: [idx], glyph}], glyph (of the component or null)}
     Returns a list of Pages: the overview first, continued on as many pages as needed. */
  function familyPages(family, opts) {
    opts = opts || {};
    var innerW = W - 2 * MARGIN, top = H - MARGIN, x0 = MARGIN + PAD, iw = innerW - 2 * PAD;
    var comp = family.component, head = 30 * MM, tile = head + 4 * MM, gap = 2 * MM;
    var pages = [], c = new Page();
    var yBelow = boxed(c, MARGIN, top, innerW, function (cv) {
      var ytop = top - PAD;
      glyphTile(cv, x0, ytop - tile, tile);
      if (family.glyph) cv.strokes(family.glyph.strokes, family.glyph.size, x0 + 2 * MM, ytop - tile + 2 * MM, head, { width: 2.6 });
      else cv.text(x0 + tile / 2, ytop - tile + 9 * MM, comp, 70, '#000', { anchor: 'middle' });
      var tx = x0 + tile + 8 * MM, tw = x0 + iw - tx, y = ytop - 3 * MM;
      if (family.info) y = infoBlock(cv, family.info, tx, tw, y);
      else { label(cv, tx, y, 'Component'); y -= 6 * MM; }
      if (family.parts.length) {
        cv.text(tx, y, 'built from: ' + family.parts.join('  '), 9, DARK);
        y -= 5 * MM;
      }
      cv.text(tx, y, family.members + ' kanji contain ' + comp + (family.shown.length < family.members ?
        ' (' + family.shown.length + ' common ones shown)' : ''), 9, DARK);
      y -= 5 * MM;
      y = Math.min(y, ytop - tile) - 4 * MM;
      return exampleWords(cv, x0, iw, y, family.glyph ? family.glyph.words : []);
    }) - 6 * MM;
    if (opts.headerOnly) return c.svg(n(MARGIN - 2) + ' ' + n(MARGIN - 2) + ' ' + n(innerW + 4) + ' ' + n(H - yBelow - MARGIN + 4));

    var cols = 2, tileH = 36 * MM, glyphSize = 26 * MM, tileW = innerW / cols;
    var i = 0, first = true;
    while (i < family.shown.length || first) {
      var rowY = first ? yBelow : top;
      if (!first) c.text(MARGIN, rowY + 3 * MM, comp + ' · continued', 8, DARK);
      while (rowY - tileH >= MARGIN && i < family.shown.length) {
        for (var col = 0; col < cols && i < family.shown.length; col++, i++) {
          var m = family.shown[i], k = m.info;
          var x = MARGIN + col * tileW + gap / 2, w = tileW - gap, y0 = rowY - tileH + gap / 2, h = tileH - gap;
          c.rect(x, y0, w, h, { r: 2 * MM, fill: '#fff', stroke: PANEL_EDGE, lw: 0.7 });
          var marked = {};
          m.strokes.forEach(function (s) { marked[s] = true; });
          var gx = x + 2 * MM;
          c.strokes(m.glyph.strokes, m.glyph.size, gx, y0 + (h - glyphSize) / 2, glyphSize, { width: 3, color: DARK, marked: marked });
          var tx = gx + glyphSize + 3 * MM, tw = x + w - 2 * MM - tx, ty = y0 + h - 5 * MM;
          [['ON', k.on, ON_COLOR], ['KUN', k.kun, KUN_COLOR]].forEach(function (r) {
            if (!r[1].length) return;
            var item = r[1][0], kana = item.replace(/\./g, '・');
            var rx = pill(c, tx, ty, r[0], r[2], 6.5, pillWidth(['ON', 'KUN'], 6.5));
            c.text(rx, ty, kana, 9, '#000');
            rx += textWidth(kana, 9) + 1.5 * MM;
            c.text(rx, ty, short('(' + Romaji.romaji(item) + ')', 7.5, tx + tw - rx), 7.5, DARK);
            ty -= 4 * MM;
          });
          c.text(tx, ty, short(k.meanings.slice(0, 2).join(', '), 8.5, tw), 8.5, '#000');
          ty -= 4.6 * MM;
          var ex = pickWord(m.glyph.words);
          if (ex) {
            c.text(tx, ty, short(ex[0] + '  ' + ex[1], 9, tw), 9, '#000');
            ty -= 3.6 * MM;
            c.text(tx, ty, short(Romaji.romaji(ex[1]) + ' – ' + [ex[2], ex[3]].filter(Boolean).join(' / '), 7, tw), 7, DARK);
          }
          var meta = k.strokes + ' strokes' + (k.grade > 0 && k.grade < 7 ? ' · grade ' + k.grade : '');
          c.text(tx, y0 + 2.2 * MM, meta, 6.5, DARK);
        }
        rowY -= tileH;
      }
      pages.push(c);
      c = new Page();
      first = false;
    }
    return pages;
  }

  /* Small glyph for result tiles; marked stroke indices are drawn red. */
  function glyphSvg(glyph, marked, cls) {
    var m = {};
    (marked || []).forEach(function (s) { m[s] = true; });
    var g = strokesSvg(glyph.strokes, glyph.size, 0, H - glyph.size, glyph.size, { width: 3.2, color: 'currentColor', marked: m });
    return '<svg xmlns="http://www.w3.org/2000/svg" class="' + (cls || '') + '" viewBox="0 0 ' +
      glyph.size + ' ' + glyph.size + '" aria-hidden="true">' + g + '</svg>';
  }

  return {
    kanjiPage: kanjiPage, kanjiPreview: kanjiPreview, wordPage: wordPage, wordPreview: wordPreview,
    familyPages: familyPages, glyphSvg: glyphSvg,
    fontSample: ON_TAG + KUN_TAG + 'Reading Kanji in this word Meaning Example words Stroke order Practice Component built from: continued strokes grade JLPT 0123456789',
    FONT: FONT
  };
})();
