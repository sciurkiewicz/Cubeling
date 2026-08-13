import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { Material } from '@babylonjs/core/Materials/material.js';
import { keyOf, type VoxelData } from './model.ts';

export const VOXEL_CHUNK_SIZE = 16;

export function chunkKeyOf(x: number, y: number, z: number): string {
  return `${Math.floor(x / VOXEL_CHUNK_SIZE)},${Math.floor(y / VOXEL_CHUNK_SIZE)},${Math.floor(z / VOXEL_CHUNK_SIZE)}`;
}

export function affectedChunkKeys(x: number, y: number, z: number): Set<string> {
  const result = new Set<string>([chunkKeyOf(x, y, z)]);
  const directions = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  directions.forEach(([dx, dy, dz]) => result.add(chunkKeyOf(x + dx, y + dy, z + dz)));
  return result;
}

interface FaceDefinition {
  delta: [number, number, number];
  normal: [number, number, number];
  corners: Array<[number, number, number]>;
}

const FACES: FaceDefinition[] = [
  { delta: [1, 0, 0], normal: [1, 0, 0], corners: [[.5, -.5, -.5], [.5, .5, -.5], [.5, .5, .5], [.5, -.5, .5]] },
  { delta: [-1, 0, 0], normal: [-1, 0, 0], corners: [[-.5, -.5, .5], [-.5, .5, .5], [-.5, .5, -.5], [-.5, -.5, -.5]] },
  { delta: [0, 1, 0], normal: [0, 1, 0], corners: [[-.5, .5, .5], [.5, .5, .5], [.5, .5, -.5], [-.5, .5, -.5]] },
  { delta: [0, -1, 0], normal: [0, -1, 0], corners: [[-.5, -.5, -.5], [.5, -.5, -.5], [.5, -.5, .5], [-.5, -.5, .5]] },
  { delta: [0, 0, 1], normal: [0, 0, 1], corners: [[.5, -.5, .5], [.5, .5, .5], [-.5, .5, .5], [-.5, -.5, .5]] },
  { delta: [0, 0, -1], normal: [0, 0, -1], corners: [[-.5, -.5, -.5], [-.5, .5, -.5], [.5, .5, -.5], [.5, -.5, -.5]] },
];

export interface ChunkBuildOptions {
  scene: Scene;
  chunkKey: string;
  voxels: Iterable<VoxelData>;
  getVoxel: (key: string) => VoxelData | undefined;
  isVisible: (voxel: VoxelData) => boolean;
  material: Material;
}

export function buildVoxelChunk(options: ChunkBuildOptions): Mesh | null {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const faceVoxelKeys: string[] = [];
  const faceNormals: Array<[number, number, number]> = [];

  for (const voxel of options.voxels) {
    if (!options.isVisible(voxel)) continue;
    const color = Color3.FromHexString(voxel.color);
    for (const face of FACES) {
      const neighbor = options.getVoxel(keyOf(
        voxel.x + face.delta[0],
        voxel.y + face.delta[1],
        voxel.z + face.delta[2],
      ));
      if (neighbor && options.isVisible(neighbor)) continue;
      const base = positions.length / 3;
      face.corners.forEach(([x, y, z]) => {
        positions.push(voxel.x + x, voxel.y + y, voxel.z + z);
        normals.push(...face.normal);
        colors.push(color.r, color.g, color.b, 1);
      });
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      faceVoxelKeys.push(keyOf(voxel.x, voxel.y, voxel.z));
      faceNormals.push(face.normal);
    }
  }

  if (!indices.length) return null;
  const mesh = new Mesh(`voxel-chunk-${options.chunkKey}`, options.scene);
  const data = new VertexData();
  data.positions = positions;
  data.normals = normals;
  data.colors = colors;
  data.indices = indices;
  data.applyToMesh(mesh, false);
  // These procedural faces use the same FRONT-side convention as Babylon's
  // mesh builders. A raw Mesh otherwise inherits a scene-dependent winding
  // that makes the voxel shell render from the inside in a left-handed scene.
  mesh.sideOrientation = Mesh.FRONTSIDE;
  mesh.material = options.material;
  mesh.isPickable = true;
  mesh.hasVertexAlpha = false;
  mesh.metadata = { isModel: true, isVoxelChunk: true, kind: 'voxel', chunkKey: options.chunkKey, faceVoxelKeys, faceNormals };
  mesh.freezeWorldMatrix();
  return mesh;
}

export function voxelKeyFromFace(mesh: Mesh, faceId: number): string | null {
  if (!mesh.metadata?.isVoxelChunk || faceId < 0) return null;
  return (mesh.metadata.faceVoxelKeys as string[] | undefined)?.[Math.floor(faceId / 2)] ?? null;
}
