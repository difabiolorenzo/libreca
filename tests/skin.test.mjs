import { test } from 'node:test';
import assert from 'node:assert/strict';

import { skinMask } from '../src/pipeline/skin.js';
import { makePageImage } from './helpers/synthetic.mjs';

const PAGE = [{ x: 40, y: 20 }, { x: 160, y: 20 }, { x: 160, y: 130 }, { x: 40, y: 130 }];
const FINGER = { x1: 0, y1: 75, x2: 100, y2: 75, r: 10 };

/** Share of skin pixels in a rectangle. */
function skinShare(mask, width, x0, y0, x1, y1) {
  let hit = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (mask[y * width + x]) hit++;
  return hit / ((x1 - x0) * (y1 - y0));
}

const SKINS = { light: [222, 168, 138], medium: [190, 130, 95], dark: [140, 90, 60] };
const PAPERS = { white: [235, 235, 235], cream: [245, 232, 205], warmLight: [252, 228, 190] };

for (const [skinName, skin] of Object.entries(SKINS)) {
  for (const [paperName, paper] of Object.entries(PAPERS)) {
    test(`skinMask: ${skinName} skin on ${paperName} paper`, () => {
      const image = makePageImage(200, 150, PAGE, { paper, skin, fingers: [FINGER] });
      const mask = skinMask(image);
      assert.ok(skinShare(mask, 200, 50, 72, 95, 78) > 0.9, 'finger centre is skin');
      assert.ok(skinShare(mask, 200, 110, 25, 155, 125) < 0.02, 'paper is not skin');
    });
  }
}

test('skinMask finds nothing on a page without hands', () => {
  for (const paper of Object.values(PAPERS)) {
    const mask = skinMask(makePageImage(200, 150, PAGE, { paper }));
    assert.ok(skinShare(mask, 200, 0, 0, 200, 150) < 0.01);
  }
});
