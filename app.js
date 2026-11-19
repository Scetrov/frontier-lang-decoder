import { ALPHABET, UNCONFIRMED, binarize, bounds, normalize, decode, transcript } from './decoder.js';
const $ = id => document.getElementById(id);
const canvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
const preview = $('preview'), ctx = preview.getContext('2d');
let templates = [], source = null, crop = null, current = null, mask = null, lines = [], drag = null, loadVersion = 0;
const status = message => { $('status').textContent = message; };

function drawMask(target, binary) {
  target.width = binary.width; target.height = binary.height;
  const c = target.getContext('2d'), image = c.createImageData(binary.width, binary.height);
  for (let i = 0; i < binary.data.length; i++) {
    const v = binary.data[i] ? 0 : 255;
    image.data.set([v, v, v, 255], i * 4);
  }
  c.putImageData(image, 0, 0);
}
function paint() {
  if (!current) return;
  preview.width = current.width; preview.height = current.height;
  if ($('binary').checked && mask) drawMask(preview, mask);
  else ctx.drawImage(current, 0, 0);
  ctx.lineWidth = Math.max(1, current.width / 700);
  for (const line of lines) for (const g of line) {
    ctx.strokeStyle = g.uncertain || UNCONFIRMED.has(g.char) ? '#ed9b30' : '#63ac22';
    ctx.strokeRect(g.box.x, g.box.y, g.box.width, g.box.height);
  }
}
function renderMatches() {
  $('matches').replaceChildren();
  for (const line of lines) for (const g of line) {
    const label = document.createElement('label'); label.className = 'match' + (g.uncertain || UNCONFIRMED.has(g.char) ? ' uncertain' : '');
    const thumb = canvas(40, 40); thumb.getContext('2d').drawImage(current, g.box.x, g.box.y, g.box.width, g.box.height, 0, 0, 40, 40);
    const select = document.createElement('select'); select.setAttribute('aria-label', 'Correct glyph; top match ' + g.candidates[0].char);
    for (const char of '?' + ALPHABET) select.add(new Option(char, char));
    select.value = g.char;
    select.title = g.candidates.map(c => `${c.char}: ${(c.score * 100).toFixed(0)}%`).join(' · ');
    select.addEventListener('change', () => { g.char = select.value; g.uncertain = g.char === '?'; label.classList.toggle('uncertain', g.uncertain || UNCONFIRMED.has(g.char)); $('result').value = transcript(lines); paint(); });
    const score = document.createElement('small'); score.textContent = `${Math.round(g.candidates[0].score * 100)}% fit`;
    label.append(thumb, select, score); $('matches').append(label);
  }
}
function run() {
  if (!source || !templates.length) return;
  try {
    const height = Number($('glyphHeight').value), ratio = Number($('widthRatio').value);
    if (!Number.isFinite(height) || height < 8 || height > 800 || !Number.isFinite(ratio) || ratio < .4 || ratio > 2) throw new Error('Set glyph height to 8–800 and width / height to 0.4–2.');
    const box = crop || { x: 0, y: 0, width: source.width, height: source.height };
    current = canvas(box.width, box.height);
    const c = current.getContext('2d', { willReadFrequently: true });
    c.drawImage(source, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
    mask = binarize(c.getImageData(0, 0, current.width, current.height).data, current.width, current.height, +$('threshold').value, $('polarity').value);
    lines = decode(mask, templates, { glyphHeight: height, widthRatio: ratio, minScore: +$('minScore').value / 100 });
    $('result').value = transcript(lines);
    renderMatches(); paint();
    const glyphs = lines.flat(), uncertain = glyphs.filter(g => g.uncertain).length;
    const unconfirmed = glyphs.filter(g => UNCONFIRMED.has(g.char)).length;
    status(glyphs.length ? `${glyphs.length} glyphs · ${lines.length} lines · ${uncertain} uncertain · ${unconfirmed} unconfirmed mappings. Review before relying on this output.` : 'No glyphs detected. Try another threshold, polarity, or a tighter crop.');
    $('dimensions').textContent = `${current.width} × ${current.height} PX${crop ? ' · CROPPED' : ''}`;
  } catch (error) { lines = []; $('result').value = ''; $('matches').replaceChildren(); paint(); status(error.message); }
}
function demo() {
  loadVersion++;
  const text = $('demoText').value.toUpperCase();
  if (/[^A-Z0-9 \n]/.test(text)) { status('Synthetic generator supports only A–Z, 0–9, spaces and newlines.'); return; }
  const textLines = text.split('\n');
  if (textLines.length > 8 || textLines.some(l => l.length > 32)) { status('Keep the demo to 8 lines and 32 characters per line.'); return; }
  const size = 64, gap = 16, padding = 24;
  const width = Math.max(1, ...textLines.map(l => [...l].reduce((n, ch) => n + (ch === ' ' ? 48 : size + gap), 0)));
  source = canvas(width + padding * 2, textLines.length * 112 + padding * 2 - 48);
  const c = source.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, source.width, source.height);
  textLines.forEach((line, row) => { let x = padding; for (const char of line) {
    if (char === ' ') { x += 48; continue; }
    c.drawImage(templates.find(t => t.char === char).image, x, padding + row * 112, size, size); x += size + gap;
  }});
  if ($('invert').checked) {
    const image = c.getImageData(0, 0, source.width, source.height);
    for (let i = 0; i < image.data.length; i += 4) for (let k = 0; k < 3; k++) image.data[i + k] = 255 - image.data[i + k];
    c.putImageData(image, 0, 0);
  }
  crop = null; $('glyphHeight').value = size; $('widthRatio').value = 1; $('polarity').value = 'auto';
  $('sourceLabel').textContent = 'SYNTHETIC · SAME-SOURCE TEST'; $('download').disabled = false; run();
}
$('upload').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  const version = ++loadVersion;
  if (file.size > 12 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { status('Choose a PNG, JPEG or WebP smaller than 12 MB.'); return; }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    if (version !== loadVersion) return;
    if (image.naturalWidth * image.naturalHeight > 24000000) throw new Error('Image exceeds 24 megapixels. Resize or crop it first.');
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    source = canvas(Math.max(1, Math.round(image.naturalWidth * scale)), Math.max(1, Math.round(image.naturalHeight * scale)));
    source.getContext('2d').drawImage(image, 0, 0, source.width, source.height);
    crop = null; $('sourceLabel').textContent = file.name + (scale < 1 ? ' · resized to ≤1600 px' : ''); $('download').disabled = false; run();
  } catch (error) { if (version === loadVersion) status('Could not open image: ' + error.message); }
  finally { URL.revokeObjectURL(url); }
});
$('decode').addEventListener('click', run);
$('demo').addEventListener('click', demo);
$('resetCrop').addEventListener('click', () => { crop = null; run(); });
for (const id of ['threshold', 'minScore']) $(id).addEventListener('input', () => { $(id + 'Value').textContent = $(id).value + (id === 'minScore' ? '%' : ''); });
for (const id of ['threshold', 'minScore', 'polarity', 'glyphHeight', 'widthRatio']) $(id).addEventListener('change', run);
$('binary').addEventListener('change', paint);
$('copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('result').value); status('Transcript copied.'); } catch { $('result').select(); status('Clipboard unavailable. The text is selected; press Ctrl/Cmd+C.'); } });
$('download').addEventListener('click', () => { if (!source) return; source.toBlob(blob => { if (!blob) return; const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'frontier-signal.png'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }); });
function point(event) { const rect = preview.getBoundingClientRect(); return { x: Math.max(0, Math.min(preview.width, Math.round((event.clientX - rect.left) * preview.width / rect.width))), y: Math.max(0, Math.min(preview.height, Math.round((event.clientY - rect.top) * preview.height / rect.height))) }; }
preview.addEventListener('pointerdown', event => { if (!current) return; drag = point(event); preview.setPointerCapture(event.pointerId); });
preview.addEventListener('pointermove', event => { if (!drag) return; const p = point(event); paint(); ctx.strokeStyle = '#ffbf70'; ctx.lineWidth = 2; ctx.strokeRect(drag.x, drag.y, p.x - drag.x, p.y - drag.y); });
preview.addEventListener('pointerup', event => { if (!drag) return; const p = point(event), x = Math.min(drag.x, p.x), y = Math.min(drag.y, p.y), width = Math.abs(p.x - drag.x), height = Math.abs(p.y - drag.y); drag = null; if (width >= 8 && height >= 8) { crop = { x: (crop?.x || 0) + x, y: (crop?.y || 0) + y, width, height }; run(); } else paint(); });
preview.addEventListener('pointercancel', () => { drag = null; paint(); });

async function init() {
  try {
    const image = new Image(); image.src = 'image.png'; await image.decode();
    // Source is a JPEG despite its .png name. Browser decoding handles its magic bytes.
    // Chart: 36 rows, 101 px pitch, glyph area y=41..136; first column only.
    const chart = canvas(image.naturalWidth, image.naturalHeight), c = chart.getContext('2d', { willReadFrequently: true }); c.drawImage(image, 0, 0);
    const binary = binarize(c.getImageData(0, 0, chart.width, chart.height).data, chart.width, chart.height, 120, 'dark');
    templates = [...ALPHABET].map((char, index) => {
      const box = bounds(binary, { x: 65, y: 41 + index * 101, width: 110, height: 96 });
      if (!box) throw new Error('Missing template ' + char);
      const image = canvas(box.width, box.height);
      const data = new Uint8Array(box.width * box.height);
      for (let y = 0; y < box.height; y++) for (let x = 0; x < box.width; x++) data[y * box.width + x] = binary.data[(box.y + y) * binary.width + box.x + x];
      drawMask(image, { width: box.width, height: box.height, data });
      return { char, box, vector: normalize(binary, box), image };
    });
    for (const t of templates) { const item = document.createElement('div'); item.className = 'letter' + (UNCONFIRMED.has(t.char) ? ' unconfirmed' : ''); item.append(t.image.cloneNode()); item.firstChild.getContext('2d').drawImage(t.image, 0, 0); item.append(document.createTextNode(t.char + (UNCONFIRMED.has(t.char) ? ' *' : ''))); $('alphabet').append(item); }
    $('decode').disabled = false; $('demo').disabled = false; demo();
    document.documentElement.dataset.ready = 'true';
  } catch (error) { status('Reference could not load. Run npm start and open http://localhost:8000. ' + error.message); document.documentElement.dataset.ready = 'error'; }
}
init();
