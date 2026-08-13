import assert from 'node:assert/strict';
import test from 'node:test';
import { parseVox } from '../src/importers.ts';

function writeId(view: DataView, offset: number, id: string): void {
  [...id].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
}

function minimalVox(): ArrayBuffer {
  const buffer = new ArrayBuffer(68);
  const view = new DataView(buffer);
  writeId(view, 0, 'VOX ');
  view.setUint32(4, 150, true);
  writeId(view, 8, 'MAIN');
  view.setUint32(12, 0, true);
  view.setUint32(16, 48, true);
  writeId(view, 20, 'SIZE');
  view.setUint32(24, 12, true);
  view.setUint32(28, 0, true);
  view.setInt32(32, 4, true);
  view.setInt32(36, 4, true);
  view.setInt32(40, 4, true);
  writeId(view, 44, 'XYZI');
  view.setUint32(48, 12, true);
  view.setUint32(52, 0, true);
  view.setUint32(56, 2, true);
  view.setUint8(60, 0); view.setUint8(61, 0); view.setUint8(62, 0); view.setUint8(63, 1);
  view.setUint8(64, 1); view.setUint8(65, 2); view.setUint8(66, 3); view.setUint8(67, 2);
  return buffer;
}

test('parser VOX mapuje oś wysokości i respektuje limit', () => {
  const voxels = parseVox(minimalVox(), 10);
  assert.equal(voxels.length, 2);
  assert.equal(voxels[1].y, 3);
  assert.throws(() => parseVox(minimalVox(), 1), /limit/);
});
