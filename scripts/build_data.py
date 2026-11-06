#!/usr/bin/env python3
"""Export the kanji data of the site as compact JSON into assets/kanji/data/.

Usage:  python3 scripts/build_data.py [path/to/sources]      (default: ./sources)

Reads (see README.md for how to get them):
  sources/kanjivg/kanji/XXXXX.svg     KanjiVG submodule        (stroke paths, component tree)
  sources/openjlpt/data/json/kanji/nN.json  OpenJLPT submodule      (JLPT N5-N1 levels)
  sources/kanjidic2.xml.gz            scripts/fetch_sources.sh (meanings, readings, grade, frequency)
  sources/JMdict_e.gz                 scripts/fetch_sources.sh (example words, word search)

Writes:
  kanji.json       search index + header data for every kanji (KANJIDIC2 + OpenJLPT level)
  components.json  which kanji contain which part (KanjiVG component tree, for families)
  words.json       common JMdict words written with kanji, for word search and word pages
  s/XXXX.json      stroke paths (KanjiVG) and example words (JMdict), 32 code points per file

Only the standard library is needed. The data stays under its own licences (see /credits/).
"""
import gzip
import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "sources"
OUT = ROOT / "assets" / "kanji" / "data"
SVG = "{http://www.w3.org/2000/svg}"
KVG = "{http://kanjivg.tagaini.net}"
SHARD = 5  # code point >> SHARD = file name
WORDS_PER_KANJI = 6
MAX_PER_KANJI = 12  # candidates ranked per kanji before cutting to WORDS_PER_KANJI
COMMON = ("ichi1", "news1", "spec1", "gai1")  # JMdict priority tags of common words
UNCOMMON = 100  # rank of words without a common tag


def is_kanji(c):
    return "一" <= c <= "鿿"


def rank_of(pris):
    """Lower is more common (lowest nfXX tag, 50 if untagged); UNCOMMON when not tagged as common."""
    if not any(p in COMMON for p in pris):
        return UNCOMMON
    nf = [int(p[2:]) for p in pris if p.startswith("nf") and p[2:].isdigit()]
    return min(nf) if nf else 50


def jmdict_words(path, has_strokes):
    """Two results from one pass over JMdict:
    example words {kanji: [[word, reading, gloss], ...]} (common first, then all-kanji compounds), and
    the common vocabulary [[word, reading, gloss, rank]] whose kanji all have stroke data, most common first."""
    examples, vocab = {}, {}
    for _, el in ET.iterparse(gzip.open(path), events=("end",)):
        if el.tag != "entry":
            continue
        readings = [r.findtext("reb") for r in el.findall("r_ele")]
        sense = el.find("sense")
        glosses = [g.text for g in sense.findall("gloss")][:2] if sense is not None else []
        if glosses:
            gloss = "; ".join(glosses)
            for k in el.findall("k_ele"):
                word = k.findtext("keb")
                pris = [p.text for p in k.findall("ke_pri")]
                rank = rank_of(pris)
                kanji = [c for c in word if is_kanji(c)]
                # example words: up to 4 characters; untagged ones only as all-kanji compounds (e.g. 城下)
                if len(word) <= 4 and (rank != UNCOMMON or (len(word) >= 2 and len(kanji) == len(word))):
                    for c in set(kanji):
                        examples.setdefault(c, []).append((rank, len(word), word, readings[0], gloss))
                # vocabulary: common spellings whose kanji all have stroke data
                short = "; ".join(glosses)
                if kanji and rank != UNCOMMON and all(has_strokes(c) for c in kanji):
                    if word not in vocab or rank < vocab[word][3]:
                        vocab[word] = [word, readings[0], short, rank]
        el.clear()
    examples = {c: [list(e[2:]) for e in sorted(v)[:MAX_PER_KANJI]] for c, v in examples.items()}
    vocab = sorted(vocab.values(), key=lambda w: (w[3], len(w[0]), w[0]))
    return examples, vocab


def dump(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def strokes_and_parts(path):
    """Stroke 'd' strings in order, and [[element, original, [stroke idx]]] of the nested groups."""
    root = ET.parse(path).getroot()
    strokes = []
    for el in root.iter(SVG + "path"):
        sid = el.get("id", "")
        if "-s" in sid and el.get("d"):
            strokes.append((int(sid.rsplit("-s", 1)[1]), el.get("d")))
    strokes = [d for _, d in sorted(strokes)]
    top = next((g for g in root.iter(SVG + "g") if g.get(KVG + "element")), None)
    parts = []
    if top is not None:
        total = len(list(top.iter(SVG + "path")))
        for g in top.iter(SVG + "g"):
            element = g.get(KVG + "element")
            if g is top or not element:
                continue
            idx = sorted(int(p.get("id").rsplit("-s", 1)[1]) - 1 for p in g.iter(SVG + "path") if p.get("id"))
            if len(idx) == total:  # a wrapper around the whole kanji, not a real part
                continue
            parts.append([element, g.get(KVG + "original") or "", idx])
    return strokes, parts


def main():
    strokes, components = {}, {}
    for f in sorted((SRC / "kanjivg" / "kanji").glob("?????.svg")):  # skip variant files like 07c2a-Hyougai.svg
        cp = int(f.stem, 16)
        if cp < 0x2E80:  # latin, kana: not needed
            continue
        s, parts = strokes_and_parts(f)
        strokes[chr(cp)] = s
        if parts:
            components[chr(cp)] = parts

    levels = {}
    for n in (5, 4, 3, 2, 1):
        f = SRC / "openjlpt" / "data" / "json" / "kanji" / f"n{n}.json"
        if f.exists():
            for item in json.loads(f.read_text(encoding="utf-8")):
                levels.setdefault(item["character"], n)

    with gzip.open(SRC / "kanjidic2.xml.gz", "rb") as f:
        root = ET.parse(f).getroot()
    index = []
    for ch in root.iter("character"):
        char = ch.findtext("literal")
        if char not in strokes:
            continue
        misc = ch.find("misc")
        num = lambda tag: int(misc.findtext(tag, 0)) if misc is not None else 0
        rm = ch.find("reading_meaning/rmgroup")
        on = [r.text for r in rm.findall("reading[@r_type='ja_on']")] if rm is not None else []
        kun = [r.text for r in rm.findall("reading[@r_type='ja_kun']")] if rm is not None else []
        meanings = [m.text for m in rm.findall("meaning") if m.get("m_lang") is None] if rm is not None else []
        # [char, meanings, on, kun, strokes, grade, old jlpt, freq, JLPT N-level]
        index.append([char, meanings, on, kun, num("stroke_count"), num("grade"), num("jlpt"), num("freq"),
                      levels.get(char, 0)])

    words, vocab = jmdict_words(SRC / "JMdict_e.gz", lambda c: c in strokes)
    shards = {}
    for char, s in strokes.items():
        ex = [[w, r, g.split(";")[0].strip()] for w, r, g in words.get(char, [])[:WORDS_PER_KANJI]]
        shards.setdefault(ord(char) >> SHARD, {})[char] = [s, ex]

    for old in (OUT / "s").glob("*.json"):
        old.unlink()
    dump(OUT / "kanji.json", index)
    dump(OUT / "components.json", components)
    dump(OUT / "words.json", vocab)
    for key, shard in shards.items():
        dump(OUT / "s" / f"{key:04x}.json", shard)
    print(f"{len(index)} kanji, {len(vocab)} words, {len(components)} with components, {len(strokes)} stroke sets "
          f"in {len(shards)} files -> {OUT}")


if __name__ == "__main__":
    main()
