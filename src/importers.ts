import { MAX_PROJECT_VOXELS, type VoxelData } from './model.ts';

function readId(view: DataView, offset: number): string {
  return String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));
}

function colorHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function fallbackPalette(index: number): string {
  const level = [255, 204, 153, 102, 51, 0];
  const value = Math.max(0, index - 1);
  return colorHex(level[value % 6], level[Math.floor(value / 6) % 6], level[Math.floor(value / 36) % 6]);
}

interface RawVoxModel {
  size: { x: number; y: number; z: number };
  voxels: Array<{ x: number; y: number; z: number; colorIndex: number }>;
}

export function parseVox(buffer: ArrayBuffer, limit = MAX_PROJECT_VOXELS): VoxelData[] {
  const view = new DataView(buffer);
  if (view.byteLength < 8 || readId(view, 0) !== 'VOX ') throw new Error('Nieprawidłowy plik VOX');
  const models: RawVoxModel[] = [];
  let pendingSize = { x: 1, y: 1, z: 1 };
  const palette = Array.from({ length: 256 }, (_, index) => fallbackPalette(index + 1));
  let offset = 8;
  while (offset + 12 <= view.byteLength) {
    const id = readId(view, offset);
    const contentSize = view.getUint32(offset + 4, true);
    const contentStart = offset + 12;
    const contentEnd = contentStart + contentSize;
    if (contentEnd > view.byteLength) throw new Error('Uszkodzony plik VOX');
    if (id === 'SIZE' && contentSize >= 12) {
      pendingSize = {
        x: view.getInt32(contentStart, true),
        y: view.getInt32(contentStart + 4, true),
        z: view.getInt32(contentStart + 8, true),
      };
    } else if (id === 'XYZI' && contentSize >= 4) {
      const count = view.getUint32(contentStart, true);
      if (count > limit || contentSize < 4 + count * 4) throw new Error('Model przekracza limit voxeli');
      const raw: RawVoxModel['voxels'] = [];
      for (let index = 0; index < count; index += 1) {
        const itemOffset = contentStart + 4 + index * 4;
        raw.push({
          x: view.getUint8(itemOffset),
          y: view.getUint8(itemOffset + 1),
          z: view.getUint8(itemOffset + 2),
          colorIndex: view.getUint8(itemOffset + 3),
        });
      }
      models.push({ size: { ...pendingSize }, voxels: raw });
    } else if (id === 'RGBA' && contentSize >= 1024) {
      for (let index = 0; index < 256; index += 1) {
        const colorOffset = contentStart + index * 4;
        palette[index] = colorHex(view.getUint8(colorOffset), view.getUint8(colorOffset + 1), view.getUint8(colorOffset + 2));
      }
    }
    offset = contentEnd;
  }

  const result: VoxelData[] = [];
  let modelOffsetX = 0;
  models.forEach((model, modelIndex) => {
    model.voxels.forEach((voxel) => {
      result.push({
        x: modelOffsetX + voxel.x - Math.floor(model.size.x / 2),
        y: voxel.z,
        z: voxel.y - Math.floor(model.size.y / 2),
        color: palette[Math.max(0, voxel.colorIndex - 1)] ?? '#ffffff',
        group: models.length > 1 ? `Model ${modelIndex + 1}` : 'VOX',
      });
    });
    modelOffsetX += model.size.x + 2;
  });
  if (!result.length) throw new Error('Plik VOX nie zawiera modelu');
  if (result.length > limit) throw new Error('Model przekracza limit voxeli');
  return result;
}

export async function imageToVoxels(file: File, heightmap: boolean, limit = MAX_PROJECT_VOXELS): Promise<VoxelData[]> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Brak obsługi canvas');
  context.imageSmoothingEnabled = false;
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const pixels = context.getImageData(0, 0, width, height).data;
  const voxels: VoxelData[] = [];
  for (let z = 0; z < height; z += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (z * width + x) * 4;
      if (pixels[offset + 3] < 8) continue;
      const color = colorHex(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
      const luminance = pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722;
      const voxelHeight = heightmap ? Math.max(1, Math.round(luminance / 255 * 16)) : 1;
      for (let y = 0; y < voxelHeight; y += 1) {
        voxels.push({ x: x - Math.floor(width / 2), y, z: z - Math.floor(height / 2), color, group: heightmap ? 'Mapa wysokości' : 'Sprite' });
        if (voxels.length > limit) throw new Error('Obraz tworzy zbyt wiele voxeli');
      }
    }
  }
  if (!voxels.length) throw new Error('Obraz jest pusty');
  return voxels;
}
