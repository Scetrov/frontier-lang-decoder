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
test('transcript preserves lines, spaces and corrections', () => {
  assert.equal(transcript([[{ char: 'A' }, { char: '?', spaceBefore: true }], [{ char: '9' }]]), 'A ?\n9');
});
