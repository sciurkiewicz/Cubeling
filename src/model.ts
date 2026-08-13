export type ShapeType = 'box' | 'pyramid' | 'circle' | 'sphere' | 'cylinder' | 'square' | 'plane' | 'billboard';
export type VoxelShapeType = 'pyramid' | 'sphere' | 'cylinder';

export interface VoxelData {
  x: number;
  y: number;
  z: number;
  color: string;
  texture?: string;
  group?: string;
}

export interface PrimitivePaintCell {
  face: number;
  u: number;
  v: number;
  color: string;
}

export interface PrimitiveData {
  id: string;
  type: ShapeType;
  x: number;
  y: number;
  z: number;
  color: string;
  texture?: string;
  sizeX?: number;
  sizeY?: number;
  sizeZ?: number;
  paint?: PrimitivePaintCell[];
  group?: string;
}

export interface CanvasSettings {
  width: number;
  depth: number;
  height: number;
}

export interface ProjectSnapshot {
  voxels: VoxelData[];
  primitives: PrimitiveData[];
}

export interface ModelStats {
  count: number;
  min: { x: number; y: number; z: number } | null;
  max: { x: number; y: number; z: number } | null;
  layers: number;
}

export interface ValueChange<T> {
  key: string;
  before?: T;
  after?: T;
}

export interface ProjectPatch {
  voxels: ValueChange<VoxelData>[];
  primitives: ValueChange<PrimitiveData>[];
}

export const MAX_PROJECT_VOXELS = 60_000;
export const MAX_SHAPE_SIZE = 2_048;
export const MAX_IMPORT_BYTES = 32 * 1024 * 1024;
export const DEFAULT_CANVAS: CanvasSettings = { width: 64, depth: 64, height: 64 };

export const keyOf = (x: number, y: number, z: number): string => `${x},${y},${z}`;

export function gridCenterOffset(sourceMin: number, sourceMax: number, targetMin: number, targetMax: number): number {
  const sourceCenterCell = Math.round((sourceMin + sourceMax) / 2);
  const targetCenterCell = Math.round((targetMin + targetMax) / 2);
  return targetCenterCell - sourceCenterCell || 0;
}

export function centeredBrushOffsets(size: number): number[] {
  const normalizedSize = Math.max(1, Math.round(size));
  const radius = Math.floor(normalizedSize / 2);
  return Array.from({ length: radius * 2 + 1 }, (_value, index) => index - radius);
}

export function voxelBrushPositions(
  anchor: { x: number; y: number; z: number },
  normal: { x: number; y: number; z: number },
  size: number,
): Array<{ x: number; y: number; z: number }> {
  const absolute = { x: Math.abs(normal.x), y: Math.abs(normal.y), z: Math.abs(normal.z) };
  const axis = absolute.x >= absolute.y && absolute.x >= absolute.z
    ? 'x'
    : absolute.y >= absolute.z ? 'y' : 'z';
  const offsets = centeredBrushOffsets(size);
  const positions: Array<{ x: number; y: number; z: number }> = [];
  offsets.forEach((first) => {
    offsets.forEach((second) => {
      if (axis === 'x') positions.push({ x: anchor.x, y: anchor.y + first, z: anchor.z + second });
      else if (axis === 'y') positions.push({ x: anchor.x + first, y: anchor.y, z: anchor.z + second });
      else positions.push({ x: anchor.x + first, y: anchor.y + second, z: anchor.z });
    });
  });
  return positions;
}

export function translateProject(
  project: ProjectSnapshot,
  offset: { x: number; y: number; z: number },
): ProjectSnapshot {
  return {
    voxels: project.voxels.map((voxel) => ({
      ...voxel,
      x: voxel.x + offset.x,
      y: voxel.y + offset.y,
      z: voxel.z + offset.z,
    })),
    primitives: project.primitives.map((primitive) => ({
      ...primitive,
      x: primitive.x + offset.x,
      y: primitive.y + offset.y,
      z: primitive.z + offset.z,
    })),
  };
}

export function voxelStampPosition(
  anchor: { x: number; z: number },
  stampSize: { width: number; height: number },
  pixel: { x: number; y: number },
): { x: number; z: number } {
  return {
    x: anchor.x - Math.floor(stampSize.width / 2) + pixel.x,
    // The horizontal Babylon preview maps its first image row towards +Z.
    z: anchor.z - Math.floor(stampSize.height / 2) + stampSize.height - 1 - pixel.y,
  };
}

export function parseVoxelKey(key: string): { x: number; y: number; z: number } {
  const [x, y, z] = key.split(',').map(Number);
  return { x, y, z };
}

export function isVoxelShape(type: ShapeType): type is VoxelShapeType {
  return type === 'pyramid' || type === 'sphere' || type === 'cylinder';
}

function ellipseAxisDistance(index: number, size: number): number {
  if (size <= 1) return 0;
  const center = (size - 1) / 2;
  const radius = size === 2 ? 1 : (size - 0.5) / 2;
  return ((index - center) / radius) ** 2;
}

export function generateVoxelShapeOffsets(
  type: VoxelShapeType,
  size: { x: number; y: number; z: number },
  limit = MAX_PROJECT_VOXELS,
): Array<[number, number, number]> | null {
  const boundingVolume = size.x * size.y * size.z;
  if (!Number.isSafeInteger(boundingVolume) || boundingVolume > limit * 8) return null;
  const offsets: Array<[number, number, number]> = [];
  const append = (x: number, y: number, z: number): boolean => {
    if (offsets.length >= limit) return false;
    offsets.push([x, y, z]);
    return true;
  };

  if (type === 'pyramid') {
    const maxInsetX = Math.floor((size.x - 1) / 2);
    const maxInsetZ = Math.floor((size.z - 1) / 2);
    for (let y = 0; y < size.y; y += 1) {
      const progress = size.y === 1 ? 0 : y / (size.y - 1);
      const insetX = Math.round(progress * maxInsetX);
      const insetZ = Math.round(progress * maxInsetZ);
      for (let z = insetZ; z < size.z - insetZ; z += 1) {
        for (let x = insetX; x < size.x - insetX; x += 1) {
          if (!append(x, y, z)) return null;
        }
      }
    }
  } else if (type === 'sphere') {
    for (let z = 0; z < size.z; z += 1) {
      for (let y = 0; y < size.y; y += 1) {
        for (let x = 0; x < size.x; x += 1) {
          const distance = ellipseAxisDistance(x, size.x)
            + ellipseAxisDistance(y, size.y)
            + ellipseAxisDistance(z, size.z);
          if (distance <= 1 && !append(x, y, z)) return null;
        }
      }
    }
  } else {
    for (let y = 0; y < size.y; y += 1) {
      for (let z = 0; z < size.z; z += 1) {
        for (let x = 0; x < size.x; x += 1) {
          if (ellipseAxisDistance(x, size.x) + ellipseAxisDistance(z, size.z) <= 1 && !append(x, y, z)) return null;
        }
      }
    }
  }
  return offsets;
}

export function calculateModelStats(voxels: Iterable<VoxelData>, primitives: Iterable<PrimitiveData>): ModelStats {
  let count = 0;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  const layers = new Set<number>();
  const include = (x: number, y: number, z: number): void => {
    count += 1;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
    layers.add(y);
  };
  for (const voxel of voxels) include(voxel.x, voxel.y, voxel.z);
  for (const primitive of primitives) {
    include(primitive.x, primitive.y, primitive.z);
    include(
      primitive.x + (primitive.sizeX ?? 1) - 1,
      primitive.y + (primitive.sizeY ?? 1) - 1,
      primitive.z + (primitive.sizeZ ?? 1) - 1,
    );
  }
  return count === 0
    ? { count: 0, min: null, max: null, layers: 0 }
    : {
      count,
      min: { x: minX, y: minY, z: minZ },
      max: { x: maxX, y: maxY, z: maxZ },
      layers: layers.size,
    };
}

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function valuesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function diffValues<T>(before: T[], after: T[], getKey: (value: T) => string): ValueChange<T>[] {
  const beforeMap = new Map(before.map((value) => [getKey(value), value]));
  const afterMap = new Map(after.map((value) => [getKey(value), value]));
  const changes: ValueChange<T>[] = [];
  new Set([...beforeMap.keys(), ...afterMap.keys()]).forEach((key) => {
    const previous = beforeMap.get(key);
    const next = afterMap.get(key);
    if (previous && next && valuesEqual(previous, next)) return;
    changes.push({
      key,
      ...(previous ? { before: cloneValue(previous) } : {}),
      ...(next ? { after: cloneValue(next) } : {}),
    });
  });
  return changes;
}

export function createProjectPatch(before: ProjectSnapshot, after: ProjectSnapshot): ProjectPatch {
  return {
    voxels: diffValues(before.voxels, after.voxels, (voxel) => keyOf(voxel.x, voxel.y, voxel.z)),
    primitives: diffValues(before.primitives, after.primitives, (primitive) => primitive.id),
  };
}

export function linePositions(
  start: { x: number; y: number; z: number },
  end: { x: number; y: number; z: number },
): Array<{ x: number; y: number; z: number }> {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
  if (steps === 0) return [{ ...start }];
  const result: Array<{ x: number; y: number; z: number }> = [];
  for (let step = 0; step <= steps; step += 1) {
    const ratio = step / steps;
    const point = {
      x: Math.round(start.x + dx * ratio),
      y: Math.round(start.y + dy * ratio),
      z: Math.round(start.z + dz * ratio),
    };
    if (!result.length || keyOf(point.x, point.y, point.z) !== keyOf(result.at(-1)!.x, result.at(-1)!.y, result.at(-1)!.z)) {
      result.push(point);
    }
  }
  return result;
}

export function cuboidPositions(
  start: { x: number; y: number; z: number },
  end: { x: number; y: number; z: number },
  hollow = false,
): Array<{ x: number; y: number; z: number }> {
  const min = { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), z: Math.min(start.z, end.z) };
  const max = { x: Math.max(start.x, end.x), y: Math.max(start.y, end.y), z: Math.max(start.z, end.z) };
  const result: Array<{ x: number; y: number; z: number }> = [];
  for (let y = min.y; y <= max.y; y += 1) {
    for (let z = min.z; z <= max.z; z += 1) {
      for (let x = min.x; x <= max.x; x += 1) {
        if (hollow && x > min.x && x < max.x && y > min.y && y < max.y && z > min.z && z < max.z) continue;
        result.push({ x, y, z });
      }
    }
  }
  return result;
}

export function surfaceVoxels(voxels: Iterable<VoxelData>): VoxelData[] {
  const items = [...voxels];
  const occupied = new Set(items.map((voxel) => keyOf(voxel.x, voxel.y, voxel.z)));
  const directions = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  return items.filter((voxel) => !directions.every(([dx, dy, dz]) => occupied.has(keyOf(voxel.x + dx, voxel.y + dy, voxel.z + dz))));
}
