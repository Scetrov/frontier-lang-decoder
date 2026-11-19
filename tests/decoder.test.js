import test from 'node:test';
import assert from 'node:assert/strict';
import { binarize, bounds, normalize, rank, decode, transcript, ALPHABET, UNCONFIRMED } from '../decoder.js';

test('chart alphabet and unconfirmed entries', () => {
  assert.equal(ALPHABET.length, 36);
  assert.deepEqual([...UNCONFIRMED], ['N', '9']);
});
test('threshold, polarity and transparency', () => {
  const rgba = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 0]);
  assert.deepEqual([...binarize(rgba, 3, 1).data], [1, 0, 0]);
  assert.deepEqual([...binarize(rgba, 3, 1, 150, 'light').data], [0, 1, 1]);
  assert.deepEqual([...binarize(new Uint8ClampedArray([0, 0, 0, 255]), 1, 1, 150, 'auto').data], [0]);
});
test('empty images have no glyphs', () => {
  const empty = { width: 20, height: 20, data: new Uint8Array(400) };
  assert.equal(bounds(empty), null);
  assert.deepEqual(decode(empty, []), []);
});
test('bounds, normalized matching and square segmentation', () => {
  const mask = { width: 80, height: 30, data: new Uint8Array(2400) };
  for (const start of [2, 40]) for (let y = 2; y < 22; y++) for (let x = start; x < start + 20; x++) {
    if (x < start + 4 || y < 6 || y >= 18) mask.data[y * 80 + x] = 1;
  }
  const box = bounds(mask, { x: 0, y: 0, width: 25, height: 30 });
  assert.deepEqual(box, { x: 2, y: 2, width: 20, height: 20 });
  const vector = normalize(mask, box), templates = [{ char: 'C', vector }, { char: 'X', vector: new Float32Array(1024) }];
  assert.equal(rank(vector, templates)[0].score, 1);
  assert.equal(transcript(decode(mask, templates, { glyphHeight: 20 })), 'C C');
});
test('weak and ambiguous matches are unknown', () => {
  const mask = { width: 10, height: 10, data: new Uint8Array(100).fill(1) };
  const vector = normalize(mask, bounds(mask));
  const result = decode(mask, [{ char: 'A', vector }, { char: 'B', vector }], { glyphHeight: 10 });
  assert.equal(transcript(result), '?');
});
test('auto mode separates nearby lines at different scales and respects non-square raster bounds', () => {
  const mask = { width: 110, height: 85, data: new Uint8Array(110 * 85) };
  const cells = [
    { x: 4, y: 10, width: 28, height: 27 },
    { x: 40, y: 10, width: 28, height: 27 },
    { x: 10, y: 48, width: 14, height: 16 },
    { x: 30, y: 48, width: 14, height: 16 },
  ];
  for (const b of cells) for (let y = b.y; y < b.y + b.height; y++) for (let x = b.x; x < b.x + b.width; x++) {
    if (x < b.x + 3 || y < b.y + 3 || y >= b.y + b.height - 3) mask.data[y * mask.width + x] = 1;
  }
  const vector = normalize(mask, cells[0]);
  const result = decode(mask, [{ char: 'C', vector }], { minScore: .4 });
  assert.equal(result.length, 2);
  assert.deepEqual(result.map(line => line.map(g => g.box)), [cells.slice(0, 2), cells.slice(2)]);
  assert.equal(transcript(result), 'CC\nCC');
});

test('manual height still joins detached glyph bands', () => {
  const mask = { width: 40, height: 40, data: new Uint8Array(1600) };
  for (const y of [4, 28]) for (const x of [4, 28]) for (let yy = y; yy < y + 6; yy++) for (let xx = x; xx < x + 6; xx++) mask.data[yy * 40 + xx] = 1;
  const vector = normalize(mask, bounds(mask));
  assert.equal(transcript(decode(mask, [{ char: 'O', vector }], { glyphHeight: 30 })), 'O');
});

test('transcript preserves lines, spaces and corrections', () => {
  assert.equal(transcript([[{ char: 'A' }, { char: '?', spaceBefore: true }], [{ char: '9' }]]), 'A ?\n9');
});
