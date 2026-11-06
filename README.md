# Kanji practice

Static site for printable kanji and word practice sheets: readings, example words, stroke order and a fading
practice grid. Live at <https://kanji-practice.github.io>.

## Licences

- **Code** (everything except the data below): [MIT](LICENSE).
- **Data** in `assets/kanji/data/` and the generated worksheets are adaptations of KanjiVG (CC BY-SA 3.0),
  KANJIDIC2 and JMdict (EDRDG licence, CC BY-SA 4.0) and OpenJLPT (CC BY-SA 4.0), and stay under those licences.
  See [assets/kanji/LICENSES.txt](assets/kanji/LICENSES.txt) and the [credits page](https://kanji-practice.github.io/credits/).

## Run locally

```bash
bundle install
bundle exec jekyll serve
```

## Rebuild the data

The JSON in `assets/kanji/data/` is generated (standard-library Python only) from the raw dictionaries in `sources/`:

```bash
git submodule update --init      # KanjiVG, OpenJLPT
scripts/fetch_sources.sh         # KANJIDIC2, JMdict (EDRDG, not git repositories)
python3 scripts/build_data.py
```

Updating KanjiVG or OpenJLPT means moving the submodule (`git -C sources/kanjivg pull`) and rebuilding.

## Deploy

Pushing to `main` runs `.github/workflows/pages.yml` (Settings → Pages → Source: GitHub Actions).

## Optional password lock

To put the app behind a password, add `protect: kanji` to the front matter of `index.html` and add a repository
secret `KANJI_PASSWORD` (Settings → Secrets and variables → Actions). The page is then encrypted at build time
(`_plugins/site_lock.rb`, `assets/js/site-lock.js`). Remove the line to make it public again; nothing else changes.
