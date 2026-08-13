import assert from 'node:assert/strict';
import test from 'node:test';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { Scene } from '@babylonjs/core/scene.js';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { keyOf, type VoxelData } from '../src/model.ts';
import { buildVoxelChunk, voxelKeyFromFace } from '../src/voxel-geometry.ts';

test('chunk usuwa wspólne ściany sąsiednich voxeli i zachowuje mapę pickingu', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const material = new StandardMaterial('voxel-test', scene);
  const items: VoxelData[] = [
    { x: 0, y: 0, z: 0, color: '#ff0000' },
    { x: 1, y: 0, z: 0, color: '#00ff00' },
  ];
  const map = new Map(items.map((voxel) => [keyOf(voxel.x, voxel.y, voxel.z), voxel]));
  const mesh = buildVoxelChunk({
    scene,
    chunkKey: 'test',
    voxels: items,
    getVoxel: (key) => map.get(key),
    isVisible: () => true,
    material,
  });
  assert.ok(mesh);
  assert.equal(mesh.sideOrientation, Mesh.FRONTSIDE);
  assert.equal(mesh.getTotalVertices(), 40);
  assert.equal(mesh.getTotalIndices(), 60);
  assert.equal(voxelKeyFromFace(mesh, 0), '0,0,0');
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind)!;
  const normals = mesh.getVerticesData(VertexBuffer.NormalKind)!;
  const indices = mesh.getIndices()!;
  const point = (indexOffset: number) => Vector3.FromArray(positions, indices[indexOffset] * 3);
  for (let faceOffset = 0; faceOffset < indices.length; faceOffset += 6) {
    const windingNormal = Vector3.Cross(
      point(faceOffset + 1).subtract(point(faceOffset)),
      point(faceOffset + 2).subtract(point(faceOffset)),
    );
    const declaredNormal = Vector3.FromArray(normals, indices[faceOffset] * 3);
    assert.ok(Vector3.Dot(windingNormal, declaredNormal) > 0, 'każda ściana musi być skierowana na zewnątrz');
  }
  engine.dispose();
});
