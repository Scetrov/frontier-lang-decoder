// Throwaway PoC: square-glyph template matching, not general-purpose OCR.
export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
export const UNCONFIRMED = new Set(['N', '9']);
export const SIZE = 32;

export function binarize(rgba, width, height, threshold = 150, polarity = 'dark') {
  const data = new Uint8Array(width * height);
  let light = polarity === 'light';
  if (polarity === 'auto') {
    let sum = 0, count = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (x !== 0 && y !== 0 && x !== width - 1 && y !== height - 1) continue;
      const i = (y * width + x) * 4, a = rgba[i + 3] / 255;
      sum += (rgba[i] * .299 + rgba[i + 1] * .587 + rgba[i + 2] * .114) * a + 255 * (1 - a);
      count++;
    }
    light = sum / count < 128;
  }
  for (let i = 0; i < data.length; i++) {
    const p = i * 4, a = rgba[p + 3] / 255;
    const luminance = (rgba[p] * .299 + rgba[p + 1] * .587 + rgba[p + 2] * .114) * a + 255 * (1 - a);
    data[i] = light ? +(luminance > threshold) : +(luminance < threshold);
  }
  return { data, width, height };
}

export function bounds(mask, box = { x: 0, y: 0, width: mask.width, height: mask.height }) {
  let x0 = mask.width, y0 = mask.height, x1 = -1, y1 = -1;
  for (let y = Math.max(0, box.y); y < Math.min(mask.height, box.y + box.height); y++) {
    for (let x = Math.max(0, box.x); x < Math.min(mask.width, box.x + box.width); x++) {
      if (!mask.data[y * mask.width + x]) continue;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

export function normalize(mask, box) {
  const result = new Float32Array(SIZE * SIZE);
  // Area averaging is less brittle than nearest-neighbour sampling of thin strokes.
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    let sum = 0;
    for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) {
      const px = Math.min(mask.width - 1, Math.floor(box.x + (x + (sx + .5) / 3) * box.width / SIZE));
      const py = Math.min(mask.height - 1, Math.floor(box.y + (y + (sy + .5) / 3) * box.height / SIZE));
      sum += mask.data[py * mask.width + px] || 0;
    }
    result[y * SIZE + x] = sum / 9;
  }
  return result;
}

export function rank(sample, templates) {
  return templates.map(t => {
    let intersection = 0, total = 0;
    for (let i = 0; i < sample.length; i++) {
      intersection += Math.min(sample[i], t.vector[i]); total += sample[i] + t.vector[i];
    }
    return { char: t.char, score: total ? 2 * intersection / total : 0 };
  }).sort((a, b) => b.score - a.score);
}

function runs(values) {
  const result = []; let start = -1;
  for (let i = 0; i <= values.length; i++) {
    if (values[i] && start < 0) start = i;
    if (!values[i] && start >= 0) { result.push([start, i]); start = -1; }
  }
  return result;
}

function columnsIn(mask, y, end) {
  const columns = new Uint32Array(mask.width);
  for (let yy = y; yy < end; yy++) for (let x = 0; x < mask.width; x++) columns[x] += mask.data[yy * mask.width + x];
  return columns;
}

function median(values) {
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)];
}

export function decode(mask, templates, { glyphHeight = 0, widthRatio = 1, minScore = .72 } = {}) {
  const rows = new Uint32Array(mask.height);
  for (let y = 0; y < mask.height; y++) for (let x = 0; x < mask.width; x++) rows[y] += mask.data[y * mask.width + x];
  const lines = [];
  for (const run of runs(rows)) {
    const prev = lines.at(-1);
    const spans = runs(columnsIn(mask, run[0], run[1])).map(([a, b]) => b - a);
    const scale = Math.max(run[1] - run[0], median(spans) || 0);
    const nominal = glyphHeight || Math.max(scale, prev?.[2] || 0);
    // Automatic mode must not merge complete lines of different font sizes.
    // Wide horizontal strokes can still join detached bands within one glyph.
    if (prev && run[0] - prev[1] < nominal * .7 && (glyphHeight || run[1] - prev[0] <= nominal * 1.25)) {
      prev[1] = run[1]; prev[2] = nominal;
    } else lines.push([...run, scale]);
  }
  const output = []; let count = 0;
  for (const [y, end] of lines) {
    const height = end - y;
    if (height < 4) continue;
    const columns = columnsIn(mask, y, end);
    // Rasterized cells can be 28px wide but only 27px tall. Using height alone
    // leaves a one-column tail and turns it into a spurious extra character.
    const fullSpans = runs(columns).map(([a, b]) => b - a).filter(w => w >= height * .7 && w <= height * 1.3);
    const width = Math.max(2, Math.round((median(fullSpans) || height) * widthRatio));
    const glyphs = []; let cursor = 0, previousEnd = null;
    while (cursor < mask.width) {
      while (cursor < mask.width && !columns[cursor]) cursor++;
      if (cursor >= mask.width) break;
      if (++count > 500) throw new Error('Too many regions. Crop to a smaller, cleaner text area.');
      let endX = Math.min(cursor + width, mask.width);
      // Include a small rasterization overhang, but never consume a long
      // touching region as if it were a single character.
      let tail = endX;
      while (tail < mask.width && columns[tail] && tail - endX <= width * .15) tail++;
      if (tail < mask.width && !columns[tail] && tail - endX <= width * .15) endX = tail;
      const box = { x: cursor, y, width: endX - cursor, height };
      const tight = bounds(mask, box);
      const candidates = rank(normalize(mask, tight), templates).slice(0, 3);
      const best = candidates[0];
      const uncertain = best.score < minScore || best.score - (candidates[1]?.score || 0) < .035;
      glyphs.push({ box, candidates, char: uncertain ? '?' : best.char, uncertain,
        spaceBefore: previousEnd !== null && cursor - previousEnd > width * .55 });
      previousEnd = endX; cursor = endX;
    }
    if (glyphs.length) output.push(glyphs);
  }
  return output;
}

export function transcript(lines) {
  return lines.map(line => line.map(g => (g.spaceBefore ? ' ' : '') + g.char).join('')).join('\n');
}
