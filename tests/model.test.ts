import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateModelStats,
  centeredBrushOffsets,
  createProjectPatch,
  cuboidPositions,
  generateVoxelShapeOffsets,
  gridCenterOffset,
  linePositions,
  surfaceVoxels,
  translateProject,
  voxelBrushPositions,
  voxelStampPosition,
} from '../src/model.ts';

test('generator brył pilnuje limitu i tworzy poprawne przesunięcia', () => {
  const sphere = generateVoxelShapeOffsets('sphere', { x: 9, y: 9, z: 9 }, 60_000);
  assert.ok(sphere && sphere.length > 200);
  assert.equal(generateVoxelShapeOffsets('cylinder', { x: 100, y: 100, z: 100 }, 10), null);
});

test('narzędzia linii i pustej bryły nie dublują voxeli', () => {
  assert.deepEqual(linePositions({ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }).map((point) => point.x), [0, 1, 2, 3]);
  assert.equal(cuboidPositions({ x: 0, y: 0, z: 0 }, { x: 2, y: 2, z: 2 }, true).length, 26);
  const solid = cuboidPositions({ x: 0, y: 0, z: 0 }, { x: 2, y: 2, z: 2 }).map((point) => ({ ...point, color: '#ffffff' }));
  assert.equal(surfaceVoxels(solid).length, 26);
});

test('statystyki liczą granice jednym przebiegiem', () => {
  const stats = calculateModelStats(
    [{ x: -2, y: 0, z: 3, color: '#ffffff' }, { x: 4, y: 2, z: -1, color: '#000000' }],
    [],
  );
  assert.deepEqual(stats.min, { x: -2, y: 0, z: -1 });
  assert.deepEqual(stats.max, { x: 4, y: 2, z: 3 });
  assert.equal(stats.layers, 2);
});

test('historia delta zapisuje tylko zmienione elementy', () => {
  const before = { voxels: [{ x: 0, y: 0, z: 0, color: '#ffffff' }], primitives: [] };
  const after = { voxels: [{ x: 0, y: 0, z: 0, color: '#ff0000' }, { x: 1, y: 0, z: 0, color: '#ffffff' }], primitives: [] };
  const patch = createProjectPatch(before, after);
  assert.equal(patch.voxels.length, 2);
  assert.equal(patch.primitives.length, 0);
});

test('stempel voxelowy zapisuje piksele dokładnie pod podglądem', () => {
  const anchor = { x: 10, z: 20 };
  const stampSize = { width: 3, height: 3 };
  assert.deepEqual(voxelStampPosition(anchor, stampSize, { x: 0, y: 0 }), { x: 9, z: 21 });
  assert.deepEqual(voxelStampPosition(anchor, stampSize, { x: 1, y: 1 }), { x: 10, z: 20 });
  assert.deepEqual(voxelStampPosition(anchor, stampSize, { x: 2, y: 2 }), { x: 11, z: 19 });
});

test('wyśrodkowanie modelu przesuwa go na środkowe komórki canvasu', () => {
  assert.equal(gridCenterOffset(10, 13, -32, 31), -12);
  assert.equal(gridCenterOffset(-4, 4, -32, 31), 0);
  assert.equal(gridCenterOffset(20, 22, -16, 15), -21);
});

test('większy pędzel tworzy kwadrat na wskazanej płaszczyźnie', () => {
  assert.deepEqual(centeredBrushOffsets(5), [-2, -1, 0, 1, 2]);
  const horizontal = voxelBrushPositions({ x: 10, y: 4, z: 20 }, { x: 0, y: 1, z: 0 }, 3);
  assert.equal(horizontal.length, 9);
  assert.ok(horizontal.every((point) => point.y === 4));
  assert.ok(horizontal.some((point) => point.x === 9 && point.z === 19));
  const vertical = voxelBrushPositions({ x: 10, y: 4, z: 20 }, { x: 1, y: 0, z: 0 }, 3);
  assert.ok(vertical.every((point) => point.x === 10));
  assert.ok(vertical.some((point) => point.y === 5 && point.z === 21));
});

test('przesunięcie całego projektu obejmuje voxele i bryły bez mutowania źródła', () => {
  const project = {
    voxels: [{ x: 1, y: 2, z: 3, color: '#ffffff' }],
    primitives: [{ id: 'box', type: 'box' as const, x: -1, y: 4, z: 2, color: '#000000' }],
  };
  const shifted = translateProject(project, { x: 0, y: 1, z: 0 });
  assert.equal(shifted.voxels[0].y, 3);
  assert.equal(shifted.primitives[0].y, 5);
  assert.equal(project.voxels[0].y, 2);
});
