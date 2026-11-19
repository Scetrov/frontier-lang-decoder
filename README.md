# Frontier glyph decoder — proof of concept

An unofficial, browser-based decoder for the substitution alphabet in `image.png`. Upload a PNG/JPEG/WebP, crop to the text, adjust threshold/polarity, and inspect or correct the decoded characters. Includes a synthetic signal generator and PNG export so it can be explored without sample screenshots.

**This is an experimental prototype, not arbitrary-image OCR.** The substitution itself is easy; finding the correct glyph regions in an arbitrary scene is the difficult part. No real-world accuracy claim is possible with only a reference chart.

## Live demo

**https://scetrov.github.io/frontier-lang-decoder/**

GitHub Pages serves the static app directly from the root of `main`. `.nojekyll` disables Jekyll processing. Pushes to `main` trigger publication; no custom build workflow is needed. Uploaded images remain in your browser, including on the hosted version.

## Run locally

Requires Python 3; Node.js is optional for the npm shortcut and tests. No packages to install, no API keys, no build step.

```sh
python3 -m http.server 8000 --bind 127.0.0.1
# Or: npm start
```

Open **http://localhost:8000**. Keep `image.png` alongside the app: it supplies the templates. Opening `index.html` directly as a file is not supported (ES modules/canvas origin restrictions).

## Use

1. The initial synthetic message should decode to `EVE FRONTIER` / `SIGNAL 2048`.
2. Open your image. Prefer a close crop with a plain background and upright text. Drag a rectangle on the preview to crop further; **Reset crop** restores the image.
3. Try **Show thresholded image**. Adjust polarity and threshold until glyph strokes are black and the background is white.
4. Uploads reset line grouping to **0 (auto)** so different text sizes can be separated. If detached strokes split into multiple lines, set the glyph height in processed-image pixels manually. The width adjustment multiplies the automatically estimated cell width; normally leave it at 1.
5. Review the character boxes and best-match scores. Each character selector offers corrections; hover it to see the top three candidates. You can also edit/copy the whole transcript.

`?` marks a weak or ambiguous match. **N and 9 are unconfirmed in the supplied mapping** and are highlighted even when their shape match is strong. Scores are similarity measures, not calibrated confidence probabilities. Direct transcript edits are overwritten by re-decoding or changing a per-glyph selector.

## How it works

- Browser Canvas decodes the supplied chart (actually JPEG bytes despite the `.png` filename).
- Extracts 36 glyph templates from the first column: 101-pixel row pitch starting at y=41, each glyph region 96 pixels high.
- Thresholds input luminance, optionally inverting foreground polarity. Transparent pixels are composited onto white.
- Groups occupied image rows into text lines. Automatic mode estimates each band's scale from its height and horizontal ink spans, avoiding merges of nearby complete lines at different font sizes. A manual height override bridges gaps smaller than 70% of that height, for detached strokes.
- Assumes approximately square, monospaced glyphs. Estimates each line's cell width from full-width horizontal ink spans near the line height, falling back to the line height. The width adjustment multiplies this estimate. Includes small rasterization overhangs rather than treating them as extra glyphs. Scans left-to-right, skips blank columns, and treats large gaps as spaces.
- Normalizes each candidate to 32×32 and ranks all templates by soft Dice overlap. Low scores or near-ties become unknown characters.

All processing happens in memory in the browser. No remote OCR, externally hosted fonts, analytics, persistence, or runtime dependencies. Disket Mono and Inter are self-hosted; their upstream licenses, source details, and integrity hashes are in `fonts/`. The Python server only serves local files; it is a development server, not a production deployment.

## Limits

- Not rotation-, perspective-, or background-invariant. Scene objects, table lines, shadows, and noise can be mistaken for glyphs.
- Requires consistent glyph scale within each line and non-touching characters. Automatic grouping supports nearby lines at different sizes, but remains heuristic. Sparse, detached glyphs (especially an isolated O) may split into bands; set a manual grouping height or crop a single line as a fallback. Manual mode requires generous line spacing (roughly 0.7 glyph heights).
- A few stray foreground pixels can distort inferred line height and subsequent segmentation. Threshold/crop manually; there is no learned text detector or automatic deskew. Small rasterized glyphs may remain ambiguous even when the segmentation is correct.
- Word gaps are heuristic; multiple spaces and blank lines are not preserved. Supports only A–Z and 0–9.
- Uploads are restricted to 12 MB and 24 megapixels and resized to a longest edge of 1600 pixels. The browser must decode an image before its dimensions can be checked; this is not a hardened hostile-image processor.
- Stops after 500 candidate regions. Very small or blurred glyphs may lose distinguishing dots.
- Synthetic examples use the same glyph source as recognition. Passing these tests validates implementation consistency, **not unseen-image generalization**.

## Verification

```sh
npm test                       # dependency-free Node unit tests
# With the local server running and Chromium installed:
node tests/browser-check.mjs
# Optional local screenshot regression probe (does not publish/copy the image):
SAMPLE_IMAGE=/path/to/2.png node tests/sample-check.mjs
# Or open http://localhost:8000/tests/browser.html for in-browser checks.
```

Browser checks cover the default message, all 36 glyphs together and individually, inverse polarity, a resized image through the upload path, corrections, empty/invalid input, real pointer cropping/reset, and desktop/mobile layout overflow. Set `CHROMIUM` if the executable has another path. Browser automation uses Node's built-in WebSocket (Node 22+); it does not disable Chromium's sandbox.

`decoder.js` contains the pure recognition routines; `app.js` handles the chart, uploads, canvas, and UI. `tests/` contains synthetic regression checks, including mixed-size nearby lines and cells whose raster width differs from their height. The optional screenshot probe asserts two-line separation and a minimum number of non-unknown outputs for the reported sample; without a verified transcription, it does **not** assert character accuracy.

## Difficulty and next step

A controlled-image PoC is hours to a couple of days of work. Robust screenshot decoding is a substantially larger computer-vision task; budget weeks of iteration rather than assume the substitution table solves it. These are rough scope estimates, not measured delivery promises.

The next useful input is a small collection of real screenshots with manually transcribed text, spanning backgrounds, scales, and lighting. Keep some samples held out. Measure character error rate, unknown rate, and segmentation errors separately before adding sophistication. Existing computer-vision tooling (for example, OpenCV's thresholding and perspective transforms) should be evaluated before building custom image cleanup or a learned recognizer. Preserve explicit unknowns and manual review rather than silently guessing.

The app can run entirely locally; GitHub Pages is optional static hosting. Supplied chart retained unchanged; its source attributions remain visible in the original image.
