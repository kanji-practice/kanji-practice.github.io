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
scripts/fetch_sources.sh         # KANJIDIC2, JMdict with English and German glosses (EDRDG, not git repositories)
python3 scripts/build_data.py
```

Updating KanjiVG or OpenJLPT means moving the submodule (`git -C sources/kanjivg pull`) and rebuilding.

## Deploy

Pushing to `main` runs `.github/workflows/pages.yml` (Settings → Pages → Source: GitHub Actions).

## Password lock (currently ON)

<https://kanji-practice.github.io> asks for a password before the app appears. GitHub Pages is public hosting, so the
page is **encrypted at build time** (AES-256-GCM, key derived from the password with PBKDF2) and decrypted in the
visitor's browser (`_plugins/site_lock.rb`, `assets/js/site-lock.js`). The password is never in the repository.
The key lives only in the page's memory, so every reload asks again.

How it works:

1. `index.html` has `protect: kanji` in its front matter. That line turns the lock on.
2. The password is the GitHub repository secret **`KANJI_PASSWORD`**
   (Settings → Secrets and variables → Actions → Repository secrets).
3. On every push to `main`, the workflow builds with `JEKYLL_ENV=production` and the secret, and publishes the
   encrypted page. A production build without the secret fails on purpose, so the site can never go out unprotected
   by mistake; the previous version stays online.

Common tasks:

- **Change the password:** update the `KANJI_PASSWORD` secret, then re-run the workflow (Actions → Deploy site →
  Run workflow) or push any commit.
- **Log everyone out / invalidate remembered unlocks:** change `salt` in `_config.yml`.
- **Turn the lock off:** delete the `protect: kanji` line from `index.html` and push. The page is public again.
- **Turn it on again:** add the line back (the secret must still exist).
- **Test locally:** `KANJI_PASSWORD=choose-a-test-password JEKYLL_ENV=production bundle exec jekyll build`, then
  serve `_site/`. Without `KANJI_PASSWORD` a non-production build uses the password `dev`.

This is a light gate, not strong security: anyone who gets the password sees everything, and the encrypted page and
the data files are public. The data files under `assets/kanji/data/` are not encrypted (they are public datasets).

## Preview in Claude Code

Claude Code's preview pane starts servers from `.claude/launch.json` in the folder it was opened in. To preview this
site, add an entry like this (adjust the path to where you cloned the repo):

```json
{
  "name": "kanji-site",
  "runtimeExecutable": "python3",
  "runtimeArgs": ["-m", "http.server", "4100", "--directory", "/home/USER/Documents/code/kanji-practice.github.io/_site"],
  "port": 4100
}
```

It serves the built `_site/` folder, so build first (`bundle exec jekyll build`, with `KANJI_PASSWORD` set while the
lock is on). Then ask Claude Code to start `kanji-site`, or open <http://localhost:4100> yourself after running the
`python3 -m http.server 4100 --directory _site` command. Rebuild and reload to see changes. The live site is
<https://kanji-practice.github.io>.

## Embedding in another site

Add `?embed=1` to the address to get a version without the site header, meant for an `<iframe>`:

```html
<iframe src="https://kanji-practice.github.io/?embed=1&theme=light" title="Kanji practice" allow="clipboard-write"
        style="width:100%;height:85vh;border:0"></iframe>
```

- `theme=light|dark` sets the colours; the host page can change them later with
  `frame.contentWindow.postMessage({kanjiTheme: 'dark'}, 'https://kanji-practice.github.io')`.
- Give the frame a fixed height (such as `85vh`) and let it scroll inside: the worksheet preview and the print
  dialog (`window.print()`) work inside the frame and print only the worksheet.
- The password prompt appears inside the frame; the unlocked state lasts until the frame reloads.
