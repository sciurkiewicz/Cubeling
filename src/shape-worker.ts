import { generateVoxelShapeOffsets, type VoxelShapeType } from './model';

interface ShapeRequest {
  type: VoxelShapeType;
  size: { x: number; y: number; z: number };
  limit: number;
}

self.onmessage = (event: MessageEvent<ShapeRequest>) => {
  const offsets = generateVoxelShapeOffsets(event.data.type, event.data.size, event.data.limit);
  self.postMessage({ offsets });
};
