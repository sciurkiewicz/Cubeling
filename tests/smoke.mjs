import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const browserCandidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const executablePath = browserCandidates.find(existsSync);
if (!executablePath) throw new Error('Nie znaleziono Chrome ani Edge do testu smoke');

const server = await createServer({ server: { host: '127.0.0.1', port: 4175, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath, headless: true, args: ['--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const runtimeErrors = [];
page.on('pageerror', (error) => runtimeErrors.push(error.message));

try {
  await page.goto('http://127.0.0.1:4175', { waitUntil: 'networkidle' });
  await page.locator('#applyCanvasSettings').click();
  await page.locator('#setupModal').waitFor({ state: 'hidden' });

  const canvas = page.locator('#renderCanvas');
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Canvas nie jest widoczny');
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.waitForFunction(() => !document.querySelector('#voxelCount')?.textContent?.startsWith('0 '));

  await page.locator('#undoBtn').click();
  await page.waitForFunction(() => document.querySelector('#voxelCount')?.textContent === '0 elementów');
  await page.locator('#redoBtn').click();
  await page.waitForFunction(() => document.querySelector('#voxelCount')?.textContent?.startsWith('1 voxel'));

  await page.locator('#raiseModelBtn').click();
  await page.waitForFunction(() => document.querySelector('#toastText')?.textContent === 'Podniesiono cały model o 1 voxel');
  await page.locator('#lowerModelBtn').click();
  await page.waitForFunction(() => document.querySelector('#toastText')?.textContent === 'Obniżono cały model o 1 voxel');

  await page.locator('[data-tool="paint"]').click();
  await page.locator('#paintBrushSize').fill('5');
  await page.waitForFunction(() => document.querySelector('#paintBrushSizeValue')?.textContent === '5 × 5');

  await page.locator('[data-tool="select"]').click();
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.locator('#voxelSelectionSection').waitFor({ state: 'visible' });

  const largeModel = [];
  for (let y = 0; y < 30; y += 1) {
    for (let z = 0; z < 40; z += 1) {
      for (let x = 0; x < 50; x += 1) largeModel.push({ x, y, z, color: '#f26f4f' });
    }
  }
  await page.locator('#fileInput').setInputFiles({
    name: 'smoke-60000.cubeling.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
      format: 'cubeling', version: 7, name: 'Smoke 60000',
      canvas: { width: 64, depth: 64, height: 64 }, textures: [], primitives: [], voxels: largeModel,
    })),
  });
  await page.waitForFunction(() => document.querySelector('#voxelCount')?.textContent?.startsWith('60000 '), undefined, { timeout: 60_000 });
  await page.locator('#centerModelOnCanvasBtn').click();

  if (runtimeErrors.length) throw new Error(`Błędy strony: ${runtimeErrors.join(' | ')}`);
  process.stdout.write('Smoke UI: pędzel, przesuwanie Y, chunk picking, undo/redo i model 60 000 voxeli działają.\n');
} finally {
  await browser.close();
  await server.close();
}
