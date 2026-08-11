import './style.css';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { ArcRotateCameraPointersInput } from '@babylonjs/core/Cameras/Inputs/arcRotateCameraPointersInput';
import '@babylonjs/core/Culling/ray';
import { Engine } from '@babylonjs/core/Engines/engine';
import { PointerEventTypes } from '@babylonjs/core/Events/pointerEvents';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Plane } from '@babylonjs/core/Maths/math.plane';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { SubMesh } from '@babylonjs/core/Meshes/subMesh';
import { GizmoManager } from '@babylonjs/core/Gizmos/gizmoManager';
import { Material } from '@babylonjs/core/Materials/material';
import { MultiMaterial } from '@babylonjs/core/Materials/multiMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import '@babylonjs/core/Rendering/edgesRenderer';
import '@babylonjs/core/Shaders/line.vertex';
import '@babylonjs/core/Shaders/line.fragment';
import { Scene } from '@babylonjs/core/scene';
import { GLTF2Export } from '@babylonjs/serializers/glTF/2.0/glTFSerializer';
import { OBJExport } from '@babylonjs/serializers/OBJ/objSerializer';
import { STLExport } from '@babylonjs/serializers/stl/stlSerializer';
import { icon } from './icons';

type Tool = 'select' | 'add' | 'erase' | 'paint' | 'eyedropper' | 'texture' | 'shape';
type ShapeType = 'box' | 'pyramid' | 'circle' | 'sphere' | 'cylinder' | 'square' | 'plane' | 'billboard';
type VoxelShapeType = 'pyramid' | 'sphere' | 'cylinder';
type ExportFormat = 'glb' | 'gltf' | 'obj' | 'stl' | 'json';

interface VoxelData {
  x: number;
  y: number;
  z: number;
  color: string;
  texture?: string;
}

interface PrimitiveData {
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
}

interface PrimitivePaintCell {
  face: number;
  u: number;
  v: number;
  color: string;
}

interface TextureLibraryItem {
  id: string;
  name: string;
  data: string;
  width: number;
  height: number;
  pixels?: Uint8ClampedArray;
}

interface PackedTextureLibraryItem {
  id: string;
  name: string;
  textureId: number;
  width: number;
  height: number;
}

interface CanvasSettings {
  width: number;
  depth: number;
  height: number;
}

interface ProjectSnapshot {
  voxels: VoxelData[];
  primitives: PrimitiveData[];
}

type PackedVoxelData = Omit<VoxelData, 'texture'> & { textureId?: number; texture?: string };
type PackedPrimitiveData = Omit<PrimitiveData, 'texture'> & { textureId?: number; texture?: string };

interface PackedProjectSnapshot {
  textures: string[];
  voxels: PackedVoxelData[];
  primitives: PackedPrimitiveData[];
  textureLibrary?: PackedTextureLibraryItem[];
}

const PALETTE = [
  '#f26f4f', '#f6b94f', '#f2df63', '#91c95b', '#42b987',
  '#49a8d8', '#6977d9', '#9a6bd2', '#d46b9d', '#e9e3d7',
  '#9d988e', '#42443f', '#8d5b42', '#d89367', '#f4c9a0',
];

const MAX_HISTORY = 60;
const MAX_SHAPE_SIZE = 2048;
const MAX_VOXEL_SHAPE_VOXELS = 12000;
const TEXTURE_ALPHA_CUTOFF = 8 / 255;
const DEFAULT_CANVAS: CanvasSettings = { width: 64, depth: 64, height: 64 };
let canvasSettings: CanvasSettings = { ...DEFAULT_CANVAS };

const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <div class="app-shell">
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true">
          <span></span><span></span><span></span>
        </div>
        <span class="brand-name">Cubeling</span>
        <span class="beta">MVP</span>
      </div>
      <div class="project-name-wrap">
        <input id="projectName" class="project-name" value="Mój model" aria-label="Nazwa projektu" maxlength="48" />
        <span class="save-state" id="saveState">Nowy projekt</span>
      </div>
      <div class="top-actions">
        <button class="icon-button" id="undoBtn" title="Cofnij (Ctrl+Z)">${icon('undo')}</button>
        <button class="icon-button" id="redoBtn" title="Ponów (Ctrl+Shift+Z)">${icon('redo')}</button>
        <span class="separator"></span>
        <button class="button secondary" id="importBtn">${icon('upload', 16)} Import</button>
        <div class="export-wrap">
          <button class="button primary" id="exportBtn" aria-haspopup="menu" aria-expanded="false">${icon('download', 16)} Eksportuj ${icon('arrowDown', 13)}</button>
          <div class="export-menu" id="exportMenu" role="menu" hidden>
            <button data-format="glb" role="menuitem"><span class="format-badge">GLB</span><span><strong>Binary glTF</strong><small>Model i tekstury w jednym pliku</small></span></button>
            <button data-format="gltf" role="menuitem"><span class="format-badge">GLTF</span><span><strong>glTF 2.0</strong><small>Standard do web i silników 3D</small></span></button>
            <button data-format="obj" role="menuitem"><span class="format-badge">OBJ</span><span><strong>Wavefront OBJ</strong><small>Uniwersalna geometria siatkowa</small></span></button>
            <button data-format="stl" role="menuitem"><span class="format-badge">STL</span><span><strong>STL</strong><small>Format do druku 3D</small></span></button>
            <button data-format="json" role="menuitem"><span class="format-badge">JSON</span><span><strong>Projekt Cubeling</strong><small>Do dalszej edycji w aplikacji</small></span></button>
          </div>
        </div>
        <input id="fileInput" type="file" accept="application/json,.json" hidden />
      </div>
    </header>

    <main class="workspace">
      <aside class="tool-rail" aria-label="Narzędzia">
        <button class="tool-button" data-tool="select" title="Zaznacz i edytuj obiekt (V)">
          ${icon('focus', 20)}<span>Edytuj</span><kbd>V</kbd>
        </button>
        <button class="tool-button active" data-tool="add" title="Rysuj voxele (B)">
          ${icon('plus', 21)}<span>Rysuj</span><kbd>B</kbd>
        </button>
        <button class="tool-button" data-tool="erase" title="Usuń voxel (E lub PPM)">
          ${icon('trash', 20)}<span>Usuń</span><kbd>E</kbd>
        </button>
        <button class="tool-button" data-tool="paint" title="Pomaluj voxel (P)">
          ${icon('brush', 20)}<span>Maluj</span><kbd>P</kbd>
        </button>
        <button class="tool-button" data-tool="texture" title="Nałóż teksturę (T)">
          ${icon('texture', 20)}<span>Tekstura</span><kbd>T</kbd>
        </button>
        <button class="tool-button" id="shapeBtn" title="Dodaj kształt">
          ${icon('cube', 20)}<span>Kształty</span>
        </button>
        <div class="rail-spacer"></div>
        <button class="tool-button compact" id="focusBtn" title="Wycentruj model (F)">
          ${icon('focus', 20)}<span>Wycentruj</span><kbd>F</kbd>
        </button>
        <button class="tool-button compact danger" id="clearBtn" title="Wyczyść scenę">
          ${icon('reset', 20)}<span>Wyczyść</span>
        </button>
      </aside>

      <section class="viewport" id="viewport">
        <canvas id="renderCanvas" aria-label="Edytor modelu 3D"></canvas>
        <div class="shape-popover" id="shapePopover" hidden>
          <span class="popover-label">DODAJ KSZTAŁT</span>
          <div class="shape-grid">
            <button data-shape="box">${icon('cube', 21)}<span>Box</span></button>
            <button data-shape="pyramid">${icon('pyramid', 21)}<span>Piramida</span></button>
            <button data-shape="sphere">${icon('circle', 21)}<span>Kula</span></button>
            <button data-shape="cylinder">${icon('cylinder', 21)}<span>Cylinder</span></button>
            <button data-shape="plane">${icon('plane', 21)}<span>Plane</span></button>
            <button data-shape="billboard">${icon('billboard', 21)}<span>Billboard</span></button>
          </div>
        </div>
        <div class="viewport-top-left">
          <div class="view-chip">${icon('cube', 14)} Perspektywa</div>
          <div class="edit-mode-switch" aria-label="Tryb pracy">
            <button class="active" data-mode-tool="add">${icon('plus', 14)} Rysuj voxele</button>
            <button data-mode-tool="select">${icon('focus', 14)} Edytuj obiekt</button>
          </div>
        </div>
        <div class="hint" id="hint">
          <div class="mouse-icon"><span></span></div>
          <div><strong>Lewy klik</strong> stawia voxel · <strong>PPM</strong> usuwa · <strong>Środkowy</strong> obraca · <strong>Rolka</strong> przybliża</div>
          <button id="dismissHint" aria-label="Zamknij wskazówkę">${icon('x', 14)}</button>
        </div>
        <div class="statusbar">
          <div class="coordinates" id="coordinates">X — &nbsp; Y — &nbsp; Z —</div>
          <div class="status-center"><span class="status-dot"></span> Gotowy</div>
          <div>Siatka 1 × 1</div>
        </div>
      </section>

      <aside class="inspector">
        <section class="panel-section color-section">
          <div class="section-heading">
            <div><span class="eyebrow">MATERIAŁ</span><h2>Kolor voxela</h2></div>
            <button class="section-tool-button" id="colorPickerBtn" title="Próbnik koloru (I)">${icon('picker', 17)}</button>
          </div>
          <div class="current-color-row">
            <div class="current-swatch" id="currentSwatch"></div>
            <div><span>Wybrany kolor</span><strong id="colorValue">${PALETTE[0].toUpperCase()}</strong></div>
            <input type="color" id="customColor" value="${PALETTE[0]}" aria-label="Własny kolor" />
          </div>
          <div class="palette" id="palette"></div>
        </section>

        <section class="panel-section texture-section">
          <div class="section-heading">
            <div><span class="eyebrow">TEKSTUROWANIE</span><h2>Tekstura powierzchni</h2></div>
          </div>
          <button class="texture-upload" id="uploadTextureBtn">
            <span class="texture-preview empty" id="texturePreview">${icon('texture', 20)}</span>
            <span><strong id="textureName">Wgraj teksturę</strong><small>PNG, JPG lub WebP · max 512 px</small></span>
            ${icon('upload', 17)}
          </button>
          <div class="texture-library-heading"><span>BIBLIOTEKA PROJEKTU</span><strong id="textureLibraryCount">0</strong></div>
          <div class="texture-library" id="textureLibrary">
            <div class="texture-library-empty">Wgrane tekstury pojawią się tutaj i zapiszą się w pliku projektu.</div>
          </div>
          <div class="texture-actions">
            <span id="textureHelp">Po wgraniu kliknij obiekt, aby ją nałożyć.</span>
            <div>
              <button class="stamp-rotate-button" id="rotateStampBtn" type="button" hidden>
                ${icon('reset', 12)}<span id="stampRotationLabel">Obróć 90° · 0°</span><kbd>Spacja</kbd>
              </button>
              <button id="applyTextureAllBtn" hidden>Nałóż na voxele</button><button id="clearTextureBtn" hidden>Usuń</button>
            </div>
          </div>
          <input id="textureInput" type="file" accept="image/png,image/jpeg,image/webp" hidden />
        </section>

        <section class="panel-section">
          <div class="section-heading collapsible" id="modelHeading">
            <div><span class="eyebrow">SCENA</span><h2>Twój model</h2></div>
            ${icon('chevron', 17)}
          </div>
          <div class="model-card">
            <div class="model-icon">${icon('cube', 21)}</div>
            <div class="model-info"><strong id="modelNameDisplay">Mój model</strong><span id="voxelCount">0 voxeli</span></div>
            <div class="visibility-dot" title="Widoczny"></div>
          </div>
          <div class="stats-grid">
            <div><span>Rozmiar</span><strong id="modelSize">0 × 0 × 0</strong></div>
            <div><span>Warstwy</span><strong id="layerCount">0</strong></div>
          </div>
        </section>

        <section class="panel-section canvas-section">
          <div class="section-heading">
            <div><span class="eyebrow">OBSZAR ROBOCZY</span><h2>Canvas voxelowy</h2></div>
          </div>
          <div class="canvas-size-display"><strong id="canvasSizeDisplay">64 × 64</strong><span>1 voxel = 1 piksel</span></div>
          <button class="button secondary canvas-settings-button" id="openCanvasSettings">Zmień rozmiar</button>
        </section>

        <section class="panel-section transform-section" id="transformSection" hidden>
          <div class="section-heading">
            <div><span class="eyebrow">ZAZNACZENIE</span><h2 id="selectedShapeName">Kształt</h2></div>
          </div>
          <div class="transform-grid">
            <label><span>Szerokość X</span><input id="selectedSizeX" type="number" min="1" /></label>
            <label><span>Wysokość Y</span><input id="selectedSizeY" type="number" min="1" /></label>
            <label><span>Głębokość Z</span><input id="selectedSizeZ" type="number" min="1" /></label>
          </div>
          <div class="object-origin"><span>Początek obiektu</span><strong id="selectedOrigin">X 0 · Y 0 · Z 0</strong></div>
          <button class="button primary resize-button" id="applyResizeBtn">Zastosuj rozmiar</button>
          <p class="transform-note">Przeciągnij uchwyty X/Y/Z lub wpisz rozmiar. Dwuklik na obiekcie włącza przesuwanie po siatce.</p>
        </section>

        <section class="panel-section tips-section">
          <span class="eyebrow">NA SKRÓTY</span>
          <div class="shortcut"><span>Rysuj / Usuń / Maluj</span><div><kbd>B</kbd><kbd>E</kbd><kbd>P</kbd></div></div>
          <div class="shortcut"><span>Nałóż teksturę</span><div><kbd>T</kbd></div></div>
          <div class="shortcut"><span>Próbnik koloru</span><div><kbd>I</kbd></div></div>
          <div class="shortcut"><span>Kopiuj / wklej kształt</span><div><kbd>Ctrl</kbd><kbd>C</kbd><kbd>V</kbd></div></div>
          <div class="shortcut"><span>Cofnij</span><div><kbd>Ctrl</kbd><kbd>Z</kbd></div></div>
          <div class="shortcut"><span>Wycentruj model</span><div><kbd>F</kbd></div></div>
        </section>
      </aside>
    </main>
    <div class="toast" id="toast"><span class="toast-icon">${icon('check', 15)}</span><span id="toastText">Gotowe</span></div>
    <div class="modal-backdrop" id="confirmModal" hidden>
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
        <div class="modal-icon">${icon('reset', 23)}</div>
        <h2 id="modalTitle">Wyczyścić scenę?</h2>
        <p>Wszystkie voxele zostaną usunięte. Możesz później cofnąć tę operację.</p>
        <div class="modal-actions">
          <button class="button secondary" id="cancelClear">Anuluj</button>
          <button class="button danger-button" id="confirmClear">Wyczyść</button>
        </div>
      </div>
    </div>
    <div class="modal-backdrop setup-backdrop" id="setupModal" hidden>
      <div class="modal setup-modal" role="dialog" aria-modal="true" aria-labelledby="setupTitle">
        <div class="setup-mark">${icon('grid', 25)}</div>
        <span class="eyebrow">NOWY OBSZAR ROBOCZY</span>
        <h2 id="setupTitle">Ustaw canvas voxelowy</h2>
        <p>Każda komórka siatki to jeden voxel i jeden piksel nakładanej tekstury.</p>
        <div class="canvas-presets">
          <button data-canvas-preset="32">32²</button><button data-canvas-preset="64" class="active">64²</button><button data-canvas-preset="128">128²</button><button data-canvas-preset="256">256²</button>
        </div>
        <div class="setup-fields">
          <label><span>Szerokość X</span><input id="canvasWidth" type="number" min="8" max="256" value="64" /></label>
          <span>×</span>
          <label><span>Głębokość Z</span><input id="canvasDepth" type="number" min="8" max="256" value="64" /></label>
        </div>
        <label class="height-field"><span>Maksymalna wysokość Y</span><input id="canvasHeight" type="number" min="8" max="256" value="64" /></label>
        <div class="modal-actions">
          <button class="button secondary" id="cancelCanvasSettings" hidden>Anuluj</button>
          <button class="button primary" id="applyCanvasSettings">Utwórz canvas</button>
        </div>
      </div>
    </div>
    <div class="modal-backdrop" id="shapeSizeModal" hidden>
      <div class="modal shape-config-modal" role="dialog" aria-modal="true" aria-labelledby="shapeSizeTitle">
        <div class="setup-mark">${icon('cube', 25)}</div>
        <span class="eyebrow">NOWY KSZTAŁT</span>
        <h2 id="shapeSizeTitle">Rozmiar Boxa</h2>
        <p id="shapeSizeDescription">Podaj wymiary w komórkach siatki. Po zatwierdzeniu kliknij miejsce, w którym ma powstać obiekt.</p>
        <div class="shape-config-grid">
          <label><span>Szerokość X</span><input id="modalShapeSizeX" type="number" min="1" max="2048" value="1" /></label>
          <label><span>Wysokość Y</span><input id="modalShapeSizeY" type="number" min="1" max="2048" value="1" /></label>
          <label><span>Głębokość Z</span><input id="modalShapeSizeZ" type="number" min="1" max="2048" value="1" /></label>
        </div>
        <div class="modal-actions">
          <button class="button secondary" id="cancelShapeSize">Anuluj</button>
          <button class="button primary" id="applyShapeSize">Dodaj kształt</button>
        </div>
      </div>
    </div>
    <div class="modal-backdrop" id="textureCropModal" hidden>
      <div class="modal texture-crop-modal" role="dialog" aria-modal="true" aria-labelledby="textureCropTitle">
        <span class="eyebrow">BIBLIOTEKA TEKSTUR</span>
        <h2 id="textureCropTitle">Wytnij fragment tekstury</h2>
        <p>Zaznacz fragment przeciągnięciem. Jeden piksel wycinka odpowiada jednej komórce stempla.</p>
        <div class="crop-canvas-wrap"><canvas id="textureCropCanvas"></canvas></div>
        <div class="crop-fields">
          <label><span>X</span><input id="cropX" type="number" min="0" value="0" /></label>
          <label><span>Y</span><input id="cropY" type="number" min="0" value="0" /></label>
          <label><span>Szer.</span><input id="cropWidth" type="number" min="1" value="1" /></label>
          <label><span>Wys.</span><input id="cropHeight" type="number" min="1" value="1" /></label>
        </div>
        <div class="modal-actions crop-actions">
          <button class="button secondary" id="cancelTextureCrop">Anuluj</button>
          <button class="button secondary" id="useTextureBase">Dopasuj jako bazę</button>
          <button class="button primary" id="useTextureStamp">Stempluj fragment</button>
        </div>
      </div>
    </div>
  </div>
`;

const canvas = document.querySelector<HTMLCanvasElement>('#renderCanvas')!;
const engine = new Engine(canvas, true, { preserveDrawingBuffer: false, stencil: false }, false);
engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 1.25));
const scene = new Scene(engine);
scene.clearColor = new Color4(0.905, 0.902, 0.875, 1);
scene.skipPointerMovePicking = false;

const camera = new ArcRotateCamera('camera', -Math.PI / 4, Math.PI / 3.2, 18, new Vector3(0, 1.5, 0), scene);
camera.lowerRadiusLimit = 4;
camera.upperRadiusLimit = 42;
camera.minZ = 0.05;
camera.lowerBetaLimit = 0.18;
camera.upperBetaLimit = Math.PI - 0.18;
// Procentowy krok utrzymuje tę samą szybkość zoomu na canvasie 32 i 256.
camera.wheelDeltaPercentage = 0.25;
camera.panningSensibility = 80;
camera.inertia = 0;
camera.panningInertia = 0;
camera.attachControl(canvas, true);
const pointerInput = camera.inputs.attached.pointers as ArcRotateCameraPointersInput | undefined;
if (pointerInput) pointerInput.buttons = [1];

const hemi = new HemisphericLight('ambient', new Vector3(0.25, 1, 0.3), scene);
hemi.intensity = 0.95;
hemi.groundColor = new Color3(0.55, 0.56, 0.52);
const sun = new DirectionalLight('sun', new Vector3(-0.8, -1.6, -0.65), scene);
sun.position = new Vector3(10, 18, 12);
sun.intensity = 0.9;

const ground = MeshBuilder.CreateGround('ground', { width: 1, height: 1 }, scene);
ground.position.set(-0.5, -0.505, -0.5);
ground.isPickable = true;
ground.metadata = { isGround: true };
const groundMaterial = new StandardMaterial('groundMaterial', scene);
groundMaterial.diffuseColor = new Color3(0.82, 0.815, 0.78);
groundMaterial.specularColor = Color3.Black();
// The work surface is visually opaque and must participate in the depth buffer.
// Treating it as transparent makes it sort against textured model faces by mesh
// centre, which can cover otherwise visible walls at some camera angles.
groundMaterial.alpha = 1;
ground.material = groundMaterial;
groundMaterial.freeze();

let viewingFromBelow = false;

function getCanvasBounds(settings = canvasSettings): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const minX = -Math.floor(settings.width / 2);
  const minZ = -Math.floor(settings.depth / 2);
  return { minX, maxX: minX + settings.width - 1, minZ, maxZ: minZ + settings.depth - 1 };
}

let gridMesh: Mesh | null = null;

function createGrid(): void {
  gridMesh?.dispose();
  const { minX, maxX, minZ, maxZ } = getCanvasBounds();
  const lines: Vector3[][] = [];
  const colors: Color4[][] = [];
  for (let i = minX; i <= maxX + 1; i++) {
    const coordinate = i - 0.5;
    const major = i === 0 || (i - minX) % 16 === 0;
    const lineColor = major ? new Color3(0.38, 0.39, 0.36) : new Color3(0.69, 0.68, 0.64);
    const alpha = major ? 0.72 : 0.42;
    const color = new Color4(lineColor.r, lineColor.g, lineColor.b, alpha);
    lines.push([new Vector3(coordinate, -0.498, minZ - 0.5), new Vector3(coordinate, -0.498, maxZ + 0.5)]);
    colors.push([color, color]);
  }
  for (let i = minZ; i <= maxZ + 1; i++) {
    const coordinate = i - 0.5;
    const major = i === 0 || (i - minZ) % 16 === 0;
    const lineColor = major ? new Color3(0.38, 0.39, 0.36) : new Color3(0.69, 0.68, 0.64);
    const alpha = major ? 0.72 : 0.42;
    const color = new Color4(lineColor.r, lineColor.g, lineColor.b, alpha);
    lines.push([new Vector3(minX - 0.5, -0.498, coordinate), new Vector3(maxX + 0.5, -0.498, coordinate)]);
    colors.push([color, color]);
  }
  gridMesh = MeshBuilder.CreateLineSystem('grid-lines', { lines, colors, updatable: false }, scene);
  gridMesh.isPickable = false;
  gridMesh.setEnabled(!viewingFromBelow);
  gridMesh.freezeWorldMatrix();
}

function updateWorkSurfaceVisibility(): void {
  // Ground leży tuż pod dolnymi ścianami modeli. Od spodu był pierwszym
  // trafieniem pickera i blokował malowanie, mimo że jego materiał był od tyłu
  // niewidoczny. Histereza zapobiega miganiu dokładnie na poziomie siatki.
  const shouldHide = viewingFromBelow
    ? camera.position.y < -0.47
    : camera.position.y < -0.53;
  if (shouldHide === viewingFromBelow) return;
  viewingFromBelow = shouldHide;
  ground.setEnabled(!viewingFromBelow);
  gridMesh?.setEnabled(!viewingFromBelow);
}

scene.onBeforeRenderObservable.add(updateWorkSurfaceVisibility);

function applyCanvasVisuals(frame = false): void {
  const { minX, maxX, minZ, maxZ } = getCanvasBounds();
  ground.unfreezeWorldMatrix();
  ground.scaling.set(canvasSettings.width, 1, canvasSettings.depth);
  ground.position.set((minX + maxX) / 2, -0.505, (minZ + maxZ) / 2);
  ground.freezeWorldMatrix();
  createGrid();
  camera.upperRadiusLimit = 10000;
  document.querySelector('#canvasSizeDisplay')!.textContent = `${canvasSettings.width} × ${canvasSettings.depth}`;
  if (frame) {
    camera.setTarget(new Vector3((minX + maxX) / 2, 0, (minZ + maxZ) / 2));
    camera.radius = Math.max(canvasSettings.width, canvasSettings.depth) * 0.92;
  }
}
applyCanvasVisuals(true);

const previewMaterial = new StandardMaterial('previewMaterial', scene);
previewMaterial.diffuseColor = Color3.FromHexString(PALETTE[0]);
previewMaterial.emissiveColor = Color3.FromHexString(PALETTE[0]).scale(0.18);
previewMaterial.alpha = 0.58;
previewMaterial.specularColor = Color3.Black();

const deleteHoverMaterial = new StandardMaterial('delete-hover-material', scene);
deleteHoverMaterial.diffuseColor = new Color3(0.95, 0.08, 0.04);
deleteHoverMaterial.emissiveColor = new Color3(0.72, 0.025, 0.01);
deleteHoverMaterial.specularColor = Color3.Black();
deleteHoverMaterial.alpha = 0.88;
deleteHoverMaterial.freeze();

const voxels = new Map<string, Mesh>();
const primitives = new Map<string, Mesh>();
const materials = new Map<string, StandardMaterial>();
let currentTool: Tool = 'add';
let currentShape: ShapeType = 'box';
let currentShapeSize = { x: 1, y: 1, z: 1 };
let selectedPrimitiveId: string | null = null;
let canvasConfigured = false;
let currentColor = PALETTE[0];
let currentTexture: string | null = null;
let currentTexturePixels: Uint8ClampedArray | null = null;
let currentTexturePixelSize = { width: 0, height: 0 };
let texturePlacementPending = false;
let textureStampPending = false;
let stampRotation = 0;
const textureLibrary = new Map<string, TextureLibraryItem>();
let hoveredMesh: Mesh | null = null;
let hoveredTool: Tool | null = null;
let previewPosition: Vector3 | null = null;
let history: ProjectSnapshot[] = [];
let historyIndex = -1;
let projectDirty = false;
let toastTimer: number | undefined;
let copiedPrimitive: PrimitiveData | null = null;
let pasteOffset = 0;
let paintStrokeActive = false;
let paintStrokeChanged = false;
const paintedInStroke = new Set<string>();
let hoveredOriginalMaterial: Mesh['material'] = null;

const keyOf = (x: number, y: number, z: number) => `${x},${y},${z}`;

function clearHoverOutline(mesh: Mesh | null): void {
  if (!mesh) return;
  mesh.disableEdgesRendering();
  if (hoveredOriginalMaterial) {
    mesh.material = hoveredOriginalMaterial;
    hoveredOriginalMaterial = null;
  }
}

function applyHoverOutline(mesh: Mesh): void {
  if (currentTool === 'erase') {
    hoveredOriginalMaterial = mesh.material;
    mesh.material = deleteHoverMaterial;
  }
  mesh.enableEdgesRendering(0.999);
  mesh.edgesWidth = 2.2;
  mesh.edgesColor = currentTool === 'erase'
    ? new Color4(0.95, 0.2, 0.12, 1)
    : currentTool === 'texture' ? new Color4(0.16, 0.55, 0.95, 1) : new Color4(1, 1, 1, 0.95);
}

const shapeSources = new Map<'voxel' | ShapeType, Mesh>();

function createShapeSource(type: 'voxel' | ShapeType): Mesh {
  let source: Mesh;
  if (type === 'voxel') source = MeshBuilder.CreateBox(`source-${type}`, { size: 1 }, scene);
  if (type === 'pyramid') {
    source = MeshBuilder.CreateCylinder(`source-${type}`, { height: 1.5, diameterTop: 0, diameterBottom: 1.38, tessellation: 4 }, scene);
    source.rotation.y = Math.PI / 4;
  } else if (type === 'circle') {
    source = MeshBuilder.CreateDisc(`source-${type}`, { radius: 0.72, tessellation: 32, sideOrientation: Mesh.DOUBLESIDE }, scene);
    source.rotation.x = Math.PI / 2;
  } else if (type === 'sphere') {
    source = MeshBuilder.CreateSphere(`source-${type}`, { diameter: 1, segments: 24 }, scene);
  } else if (type === 'cylinder') {
    source = MeshBuilder.CreateCylinder(`source-${type}`, { height: 1, diameter: 1, tessellation: 32 }, scene);
  } else if (type === 'box' || type === 'square') {
    // `square` zostaje tylko jako migracja projektów zapisanych w poprzedniej wersji.
    source = MeshBuilder.CreateBox(`source-${type}`, { size: 1 }, scene);
  } else if (type === 'plane') {
    source = MeshBuilder.CreateGround(`source-${type}`, { width: 1.65, height: 1.65, subdivisions: 1 }, scene);
  } else if (type === 'billboard') {
    source = MeshBuilder.CreatePlane(`source-${type}`, { size: 1.5, sideOrientation: Mesh.DOUBLESIDE }, scene);
    source.billboardMode = Mesh.BILLBOARDMODE_ALL;
  }
  source!.isPickable = false;
  source!.setEnabled(false);
  shapeSources.set(type, source!);
  return source!;
}

function createShapeMesh(name: string, type: 'voxel' | ShapeType): Mesh {
  const source = shapeSources.get(type) ?? createShapeSource(type);
  const mesh = source.clone(name, null, false);
  mesh.setEnabled(true);
  return mesh;
}

function positionShape(
  mesh: Mesh,
  type: 'voxel' | ShapeType,
  logicalPosition: Vector3,
  size = { x: 1, y: 1, z: 1 },
): void {
  mesh.scaling.set(1, 1, 1);
  if (type === 'voxel') {
    mesh.position.copyFrom(logicalPosition);
    return;
  }
  const centerX = logicalPosition.x + (size.x - 1) / 2;
  const centerZ = logicalPosition.z + (size.z - 1) / 2;
  if (type === 'pyramid') {
    mesh.scaling.set(size.x / 1.38, size.y / 1.5, size.z / 1.38);
    mesh.position.set(centerX, logicalPosition.y - 0.5 + size.y / 2, centerZ);
  } else if (type === 'circle') {
    mesh.scaling.set(size.x / 1.44, size.z / 1.44, 1);
    mesh.position.set(centerX, logicalPosition.y, centerZ);
  } else if (type === 'sphere') {
    mesh.scaling.set(size.x, size.y, size.z);
    mesh.position.set(centerX, logicalPosition.y - 0.5 + size.y / 2, centerZ);
  } else if (type === 'cylinder') {
    mesh.scaling.set(size.x, size.y, size.z);
    mesh.position.set(centerX, logicalPosition.y - 0.5 + size.y / 2, centerZ);
  } else if (type === 'box' || type === 'square') {
    mesh.scaling.set(size.x, size.y, size.z);
    mesh.position.set(centerX, logicalPosition.y - 0.5 + size.y / 2, centerZ);
  } else if (type === 'plane') {
    mesh.scaling.set(size.x / 1.65, 1, size.z / 1.65);
    mesh.position.set(centerX, logicalPosition.y - 0.485, centerZ);
  } else {
    mesh.scaling.set(size.x / 1.5, size.y / 1.5, 1);
    mesh.position.set(centerX, logicalPosition.y - 0.5 + size.y / 2, centerZ);
  }
}

function createPreview(type: 'voxel' | ShapeType): Mesh {
  const mesh = createShapeMesh('preview', type);
  mesh.material = previewMaterial;
  mesh.isPickable = false;
  mesh.setEnabled(false);
  mesh.enableEdgesRendering();
  mesh.edgesWidth = 1.5;
  mesh.edgesColor = new Color4(1, 1, 1, 0.48);
  return mesh;
}

let previewType: 'voxel' | ShapeType = 'voxel';
let preview = createPreview(previewType);

const selectionBox = MeshBuilder.CreateBox('selection-box', { size: 1 }, scene);
const selectionMaterial = new StandardMaterial('selection-material', scene);
selectionMaterial.diffuseColor = new Color3(0.95, 0.42, 0.28);
selectionMaterial.emissiveColor = new Color3(0.95, 0.42, 0.28);
selectionMaterial.alpha = 0.035;
selectionBox.material = selectionMaterial;
selectionBox.isPickable = false;
selectionBox.enableEdgesRendering(0.999);
selectionBox.edgesWidth = 2.4;
selectionBox.edgesColor = new Color4(0.96, 0.34, 0.18, 1);
selectionBox.setEnabled(false);

const stampPreview = MeshBuilder.CreatePlane('stamp-preview', { size: 1, sideOrientation: Mesh.DOUBLESIDE }, scene);
const stampPreviewMaterial = new StandardMaterial('stamp-preview-material', scene);
stampPreviewMaterial.diffuseColor = Color3.White();
stampPreviewMaterial.ambientColor = new Color3(0.22, 0.22, 0.22);
stampPreviewMaterial.specularColor = new Color3(0.18, 0.18, 0.18);
stampPreviewMaterial.alpha = 1;
stampPreviewMaterial.useAlphaFromDiffuseTexture = true;
stampPreviewMaterial.disableDepthWrite = true;
stampPreviewMaterial.zOffset = -2;
stampPreview.material = stampPreviewMaterial;
stampPreview.isPickable = false;
stampPreview.renderingGroupId = 2;
stampPreview.setEnabled(false);
let stampPreviewTexture: Texture | null = null;

const stampBoxPreview = MeshBuilder.CreateBox('stamp-box-preview', { size: 1 }, scene);
stampBoxPreview.isPickable = false;
stampBoxPreview.renderingGroupId = 2;
stampBoxPreview.setEnabled(false);

interface StampBoxPreviewResources {
  signature: string;
  multiMaterial: MultiMaterial;
  materials: StandardMaterial[];
  textures: DynamicTexture[];
}

let stampBoxPreviewResources: StampBoxPreviewResources | null = null;
let stampBoxPreviewFace = -1;
let stampBoxPreviewKey = '';

function getStampPixelSize(): { width: number; height: number } {
  return stampRotation % 2 === 0
    ? { ...currentTexturePixelSize }
    : { width: currentTexturePixelSize.height, height: currentTexturePixelSize.width };
}

function stampSourceOffsetAt(x: number, y: number): number {
  const { width, height } = currentTexturePixelSize;
  let sourceX = x;
  let sourceY = y;
  if (stampRotation === 1) {
    sourceX = y;
    sourceY = height - 1 - x;
  } else if (stampRotation === 2) {
    sourceX = width - 1 - x;
    sourceY = height - 1 - y;
  } else if (stampRotation === 3) {
    sourceX = width - 1 - y;
    sourceY = x;
  }
  return (sourceY * width + sourceX) * 4;
}

function stampPixelColorAt(x: number, y: number): string | null {
  if (!currentTexturePixels) return null;
  const offset = stampSourceOffsetAt(x, y);
  if (currentTexturePixels[offset + 3] < 8) return null;
  return `#${[currentTexturePixels[offset], currentTexturePixels[offset + 1], currentTexturePixels[offset + 2]]
    .map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function hideStampPreviews(): void {
  stampPreview.setEnabled(false);
  stampBoxPreview.setEnabled(false);
}

function disposeStampBoxPreviewResources(): void {
  if (!stampBoxPreviewResources) return;
  stampBoxPreviewResources.textures.forEach((texture) => texture.dispose());
  stampBoxPreviewResources.materials.forEach((material) => material.dispose(false, false));
  stampBoxPreviewResources.multiMaterial.dispose(false, false);
  stampBoxPreviewResources = null;
  stampBoxPreviewFace = -1;
  stampBoxPreviewKey = '';
}

function ensureStampBoxPreviewResources(mesh: Mesh): StampBoxPreviewResources {
  const signature = `${String(mesh.metadata.id)}:${mesh.metadata.sizeX}:${mesh.metadata.sizeY}:${mesh.metadata.sizeZ}`;
  if (stampBoxPreviewResources?.signature === signature) return stampBoxPreviewResources;
  disposeStampBoxPreviewResources();
  stampBoxPreview.releaseSubMeshes();
  const multiMaterial = new MultiMaterial('stamp-box-preview-multi-material', scene);
  const materials: StandardMaterial[] = [];
  const textures: DynamicTexture[] = [];
  for (let face = 0; face < 6; face += 1) {
    const logicalSize = boxFaceGridSize(mesh, face);
    const texture = new DynamicTexture(
      `stamp-box-preview-${face}`,
      {
        width: Math.min(MAX_PAINT_TEXTURE_SIZE, logicalSize.width),
        height: Math.min(MAX_PAINT_TEXTURE_SIZE, logicalSize.height),
      },
      scene,
      false,
      Texture.NEAREST_SAMPLINGMODE,
    );
    texture.hasAlpha = true;
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    const context = texture.getContext();
    const textureSize = texture.getSize();
    context.clearRect(0, 0, textureSize.width, textureSize.height);
    texture.update(true);

    const material = new StandardMaterial(`stamp-box-preview-material-${face}`, scene);
    material.diffuseColor = Color3.White();
    material.ambientColor = new Color3(0.22, 0.22, 0.22);
    material.specularColor = new Color3(0.18, 0.18, 0.18);
    material.alpha = 1;
    material.diffuseTexture = texture;
    material.useAlphaFromDiffuseTexture = true;
    material.disableDepthWrite = true;
    material.zOffset = -3;
    multiMaterial.subMaterials.push(material);
    materials.push(material);
    textures.push(texture);
    new SubMesh(face, 0, stampBoxPreview.getTotalVertices(), face * 6, 6, stampBoxPreview);
  }
  stampBoxPreviewResources = { signature, multiMaterial, materials, textures };
  stampBoxPreview.material = multiMaterial;
  return stampBoxPreviewResources;
}

function clearStampBoxPreviewFace(resources: StampBoxPreviewResources, face: number): void {
  if (face < 0) return;
  const texture = resources.textures[face];
  const textureSize = texture.getSize();
  texture.getContext().clearRect(0, 0, textureSize.width, textureSize.height);
  texture.update(true);
}

function updateBoxStampPreview(
  mesh: Mesh,
  normal: Vector3 | null,
  uv: { x: number; y: number } | null,
): boolean {
  const surfaceCell = getBoxSurfaceCell(mesh, normal, uv);
  if (!surfaceCell || !currentTexturePixels) return false;
  const resources = ensureStampBoxPreviewResources(mesh);
  stampBoxPreview.position.copyFrom(mesh.position);
  stampBoxPreview.rotation.copyFrom(mesh.rotation);
  stampBoxPreview.scaling.copyFrom(mesh.scaling).scaleInPlace(1.001);
  stampBoxPreview.setEnabled(true);

  const stampSize = getStampPixelSize();
  const previewKey = `${resources.signature}:${surfaceCell.face}:${surfaceCell.u}:${surfaceCell.v}:${stampRotation}`;
  if (previewKey === stampBoxPreviewKey) return true;
  if (stampBoxPreviewFace !== surfaceCell.face) clearStampBoxPreviewFace(resources, stampBoxPreviewFace);
  const texture = resources.textures[surfaceCell.face];
  const context = texture.getContext();
  const textureSize = texture.getSize();
  const faceSize = boxFaceGridSize(mesh, surfaceCell.face);
  context.clearRect(0, 0, textureSize.width, textureSize.height);
  const startU = surfaceCell.u - Math.floor(stampSize.width / 2);
  const startV = surfaceCell.v - Math.floor(stampSize.height / 2);
  for (let y = 0; y < stampSize.height; y += 1) {
    for (let x = 0; x < stampSize.width; x += 1) {
      const u = startU + x;
      const v = startV + y;
      if (u < 0 || v < 0 || u >= faceSize.width || v >= faceSize.height) continue;
      const color = stampPixelColorAt(x, y);
      if (!color) continue;
      const x0 = Math.floor(u * textureSize.width / faceSize.width);
      const y0 = Math.floor(v * textureSize.height / faceSize.height);
      const x1 = Math.max(x0 + 1, Math.ceil((u + 1) * textureSize.width / faceSize.width));
      const y1 = Math.max(y0 + 1, Math.ceil((v + 1) * textureSize.height / faceSize.height));
      context.fillStyle = color;
      context.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
  }
  texture.update(true);
  stampBoxPreviewFace = surfaceCell.face;
  stampBoxPreviewKey = previewKey;
  return true;
}

function refreshStampPreviewTexture(): void {
  stampPreviewTexture?.dispose();
  stampPreviewTexture = null;
  hideStampPreviews();
  stampBoxPreviewKey = '';
  const rotateButton = document.querySelector('#rotateStampBtn') as HTMLButtonElement;
  rotateButton.hidden = !textureStampPending;
  document.querySelector('#stampRotationLabel')!.textContent = `Obróć 90° · ${stampRotation * 90}°`;
  rotateButton.setAttribute('aria-label', `Obróć stempel o 90 stopni. Aktualny obrót: ${stampRotation * 90} stopni`);
  if (!textureStampPending || !currentTexturePixels || !currentTexturePixelSize.width) return;
  const stampSize = getStampPixelSize();
  const texture = new DynamicTexture(
    'stamp-preview-texture',
    stampSize,
    scene,
    false,
    Texture.NEAREST_SAMPLINGMODE,
  );
  const context = texture.getContext();
  const image = new ImageData(stampSize.width, stampSize.height);
  for (let y = 0; y < stampSize.height; y += 1) {
    for (let x = 0; x < stampSize.width; x += 1) {
      const targetOffset = (y * stampSize.width + x) * 4;
      const sourceOffset = stampSourceOffsetAt(x, y);
      image.data[targetOffset] = currentTexturePixels[sourceOffset];
      image.data[targetOffset + 1] = currentTexturePixels[sourceOffset + 1];
      image.data[targetOffset + 2] = currentTexturePixels[sourceOffset + 2];
      image.data[targetOffset + 3] = currentTexturePixels[sourceOffset + 3] < 8 ? 0 : 255;
    }
  }
  context.putImageData(image, 0, 0);
  texture.update(true);
  texture.hasAlpha = true;
  texture.wrapU = Texture.CLAMP_ADDRESSMODE;
  texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  stampPreviewTexture = texture;
  stampPreviewMaterial.diffuseTexture = stampPreviewTexture;
  stampPreviewMaterial.opacityTexture = stampPreviewTexture;
}

function rotateStamp(): void {
  if (!textureStampPending || !currentTexturePixels) return;
  stampRotation = (stampRotation + 1) % 4;
  refreshStampPreviewTexture();
  const pick = scene.pick(
    scene.pointerX,
    scene.pointerY,
    (candidate) => Boolean(candidate.metadata?.isModel),
  );
  if (pick?.hit && pick.pickedMesh) {
    updateStampPreview(
      pick.pickedMesh as Mesh,
      pick.getNormal(true),
      pick.getTextureCoordinates(),
    );
  }
  showToast(`Obrót stempla: ${stampRotation * 90}°`);
}

function updateStampPreview(
  mesh: Mesh,
  normal: Vector3 | null,
  uv: { x: number; y: number } | null,
): void {
  if (!textureStampPending || !stampPreviewTexture || !currentTexturePixelSize.width) {
    hideStampPreviews();
    return;
  }
  if (updateBoxStampPreview(mesh, normal, uv)) {
    stampPreview.setEnabled(false);
    return;
  }
  stampBoxPreview.setEnabled(false);
  if (!mesh.metadata.isVoxel) return;
  const logical = getLogicalPosition(mesh);
  const stampSize = getStampPixelSize();
  const startX = logical.x - Math.floor(stampSize.width / 2);
  const startZ = logical.z - Math.floor(stampSize.height / 2);
  const point = new Vector3(
    startX + (stampSize.width - 1) / 2,
    logical.y + 0.501,
    startZ + (stampSize.height - 1) / 2,
  );
  stampPreview.rotation.set(0, 0, 0);
  stampPreview.rotation.x = Math.PI / 2;
  stampPreview.scaling.set(stampSize.width, stampSize.height, 1);
  stampPreview.position.copyFrom(point);
  stampPreview.setEnabled(true);
}

const gizmoManager = new GizmoManager(scene);
gizmoManager.usePointerToAttachGizmos = false;
gizmoManager.enableAutoPicking = false;
gizmoManager.clearGizmoOnEmptyPointerEvent = false;
gizmoManager.scaleRatio = 0.78;
gizmoManager.scaleGizmoEnabled = true;
gizmoManager.positionGizmoEnabled = true;
const scaleGizmo = gizmoManager.gizmos.scaleGizmo!;
const positionGizmo = gizmoManager.gizmos.positionGizmo!;
scaleGizmo.updateGizmoRotationToMatchAttachedMesh = false;
scaleGizmo.uniformScaleGizmo.isEnabled = false;
scaleGizmo.sensitivity = 0.85;
scaleGizmo.incrementalSnap = true;
positionGizmo.updateGizmoRotationToMatchAttachedMesh = false;
positionGizmo.planarGizmoEnabled = false;
positionGizmo.snapDistance = 1;

let scaleStartSize: { x: number; y: number; z: number } | null = null;
let moveStartPosition: Vector3 | null = null;
let gizmoMode: 'scale' | 'move' = 'scale';

function attachTransformGizmo(mesh: Mesh | null): void {
  scaleGizmo.attachedMesh = currentTool === 'select' && gizmoMode === 'scale' ? mesh : null;
  positionGizmo.attachedMesh = currentTool === 'select' && gizmoMode === 'move' ? mesh : null;
}

function sizeFromMeshScale(mesh: Mesh): { x: number; y: number; z: number } {
  const kind = mesh.metadata.kind as ShapeType;
  const current = {
    x: Number(mesh.metadata.sizeX ?? 1),
    y: Number(mesh.metadata.sizeY ?? 1),
    z: Number(mesh.metadata.sizeZ ?? 1),
  };
  const positive = {
    x: Math.max(0, mesh.scaling.x),
    y: Math.max(0, mesh.scaling.y),
    z: Math.max(0, mesh.scaling.z),
  };
  if (kind === 'box' || kind === 'square') return positive;
  if (kind === 'pyramid') return { x: positive.x * 1.38, y: positive.y * 1.5, z: positive.z * 1.38 };
  if (kind === 'circle') return { x: positive.x * 1.44, y: current.y, z: positive.y * 1.44 };
  if (kind === 'sphere') return positive;
  if (kind === 'cylinder') return positive;
  if (kind === 'plane') return { x: positive.x * 1.65, y: current.y, z: positive.z * 1.65 };
  return { x: positive.x * 1.5, y: positive.y * 1.5, z: current.z };
}

function normalizeShapeSize(requested: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  return {
    x: Math.max(1, Math.min(MAX_SHAPE_SIZE, Math.round(requested.x))),
    y: Math.max(1, Math.min(MAX_SHAPE_SIZE, Math.round(requested.y))),
    z: Math.max(1, Math.min(MAX_SHAPE_SIZE, Math.round(requested.z))),
  };
}

function configureScaleAxes(mesh: Mesh): void {
  const kind = mesh.metadata.kind as ShapeType;
  scaleGizmo.xGizmo.isEnabled = true;
  scaleGizmo.yGizmo.isEnabled = kind !== 'plane' && kind !== 'circle';
  scaleGizmo.zGizmo.isEnabled = kind === 'box' || kind === 'square' || kind === 'pyramid' || kind === 'circle' || kind === 'sphere' || kind === 'cylinder' || kind === 'plane';
  const snap = kind === 'pyramid'
    ? { x: 1 / 1.38, y: 1 / 1.5, z: 1 / 1.38 }
    : kind === 'circle'
      ? { x: 1 / 1.44, y: 1, z: 1 / 1.44 }
      : kind === 'plane'
        ? { x: 1 / 1.65, y: 1, z: 1 / 1.65 }
        : kind === 'billboard'
          ? { x: 1 / 1.5, y: 1 / 1.5, z: 1 }
          : { x: 1, y: 1, z: 1 };
  scaleGizmo.xGizmo.snapDistance = snap.x;
  scaleGizmo.yGizmo.snapDistance = snap.y;
  scaleGizmo.zGizmo.snapDistance = snap.z;
  // AxisScaleGizmo mierzy próg snapa jako względną zmianę skali. Bez
  // kompensacji obiekt 40× potrzebował około 40 razy dłuższego ruchu myszy niż
  // obiekt 1×, zanim wykonał pierwszy krok. Czułość zależna od aktualnej skali
  // daje podobny ekranowy dystans dla zmiany o jedną komórkę na każdej osi;
  // dolny i górny limit usuwają martwą strefę bez nadwrażliwości wielkich brył.
  const baseSensitivity = 0.85;
  const axisSensitivity = (scale: number) => baseSensitivity * Math.min(64, Math.max(8, Math.abs(scale)));
  scaleGizmo.xGizmo.sensitivity = axisSensitivity(mesh.scaling.x);
  scaleGizmo.yGizmo.sensitivity = axisSensitivity(mesh.scaling.y);
  scaleGizmo.zGizmo.sensitivity = axisSensitivity(mesh.scaling.z);
}

scaleGizmo.onDragStartObservable.add(() => {
  const mesh = scaleGizmo.attachedMesh as Mesh | null;
  if (!mesh?.metadata?.isModel || mesh.metadata.isVoxel) return;
  mesh.unfreezeWorldMatrix();
  scaleStartSize = {
    x: Number(mesh.metadata.sizeX ?? 1),
    y: Number(mesh.metadata.sizeY ?? 1),
    z: Number(mesh.metadata.sizeZ ?? 1),
  };
});

scaleGizmo.onDragObservable.add(() => {
  const mesh = scaleGizmo.attachedMesh as Mesh | null;
  if (!mesh?.metadata?.isModel || mesh.metadata.isVoxel || !scaleStartSize) return;
  const next = normalizeShapeSize(sizeFromMeshScale(mesh));
  // Nie nadpisujemy transformacji pomiędzy progami snapa — gizmo potrzebuje
  // tych zdarzeń, żeby uzbierać dystans do następnego kroku. Kotwiczenie jest
  // wykonywane dopiero przy faktycznej zmianie rozmiaru o jedną komórkę.
  if (next.x === mesh.metadata.sizeX && next.y === mesh.metadata.sizeY && next.z === mesh.metadata.sizeZ) return;
  mesh.metadata.sizeX = next.x;
  mesh.metadata.sizeY = next.y;
  mesh.metadata.sizeZ = next.z;
  positionShape(mesh, mesh.metadata.kind as ShapeType, getLogicalPosition(mesh), next);
  const logical = getLogicalPosition(mesh);
  selectionBox.scaling.set(next.x + 0.06, Math.max(0.08, next.y + 0.06), next.z + 0.06);
  selectionBox.position.set(
    logical.x + (next.x - 1) / 2,
    logical.y - 0.5 + Math.max(0.04, next.y / 2),
    logical.z + (next.z - 1) / 2,
  );
  (document.querySelector('#selectedSizeX') as HTMLInputElement).value = String(next.x);
  (document.querySelector('#selectedSizeY') as HTMLInputElement).value = String(next.y);
  (document.querySelector('#selectedSizeZ') as HTMLInputElement).value = String(next.z);
});

scaleGizmo.onDragEndObservable.add(() => {
  const mesh = scaleGizmo.attachedMesh as Mesh | null;
  if (!mesh?.metadata?.isModel || mesh.metadata.isVoxel || !scaleStartSize) return;
  const next = normalizeShapeSize(sizeFromMeshScale(mesh));
  const changed = next.x !== scaleStartSize.x || next.y !== scaleStartSize.y || next.z !== scaleStartSize.z;
  mesh.metadata.sizeX = next.x;
  mesh.metadata.sizeY = next.y;
  mesh.metadata.sizeZ = next.z;
  positionShape(mesh, mesh.metadata.kind as ShapeType, getLogicalPosition(mesh), next);
  if (mesh.metadata.kind !== 'billboard') mesh.freezeWorldMatrix();
  refreshPrimitivePaint(mesh);
  selectPrimitive(mesh, 'scale');
  scaleStartSize = null;
  if (changed) {
    pushHistory();
    updateStats();
    showToast(`Rozmiar: ${next.x} × ${next.y} × ${next.z}`);
  }
});

function logicalPositionFromMesh(mesh: Mesh): Vector3 {
  const size = {
    x: Number(mesh.metadata.sizeX ?? 1),
    y: Number(mesh.metadata.sizeY ?? 1),
    z: Number(mesh.metadata.sizeZ ?? 1),
  };
  const kind = mesh.metadata.kind as ShapeType;
  const y = kind === 'plane'
    ? Math.round(mesh.position.y + 0.485)
    : Math.round(mesh.position.y + 0.5 - size.y / 2);
  return new Vector3(
    Math.round(mesh.position.x - (size.x - 1) / 2),
    Math.max(0, y),
    Math.round(mesh.position.z - (size.z - 1) / 2),
  );
}

positionGizmo.onDragStartObservable.add(() => {
  const mesh = positionGizmo.attachedMesh as Mesh | null;
  if (!mesh?.metadata?.isModel || mesh.metadata.isVoxel) return;
  moveStartPosition = getLogicalPosition(mesh).clone();
  mesh.unfreezeWorldMatrix();
});

positionGizmo.onDragEndObservable.add(() => {
  const mesh = positionGizmo.attachedMesh as Mesh | null;
  if (!mesh?.metadata?.isModel || mesh.metadata.isVoxel || !moveStartPosition) return;
  const next = logicalPositionFromMesh(mesh);
  const changed = !next.equals(moveStartPosition);
  mesh.metadata.logicalPosition = next;
  positionShape(mesh, mesh.metadata.kind as ShapeType, next, {
    x: Number(mesh.metadata.sizeX ?? 1),
    y: Number(mesh.metadata.sizeY ?? 1),
    z: Number(mesh.metadata.sizeZ ?? 1),
  });
  if (mesh.metadata.kind !== 'billboard') mesh.freezeWorldMatrix();
  selectPrimitive(mesh, 'move');
  moveStartPosition = null;
  if (changed) {
    pushHistory();
    updateStats();
    showToast(`Przesunięto do X ${next.x} · Y ${next.y} · Z ${next.z}`);
  }
});

function updatePreviewType(type: 'voxel' | ShapeType): void {
  if (previewType === type) return;
  preview.dispose(false, false);
  previewType = type;
  preview = createPreview(type);
}

const shapeNames: Record<ShapeType, string> = {
  box: 'Box',
  pyramid: 'Piramida',
  circle: 'Koło',
  sphere: 'Kula',
  cylinder: 'Cylinder',
  square: 'Box',
  plane: 'Plane',
  billboard: 'Billboard',
};

function clearSelection(): void {
  selectedPrimitiveId = null;
  attachTransformGizmo(null);
  selectionBox.setEnabled(false);
  (document.querySelector('#transformSection') as HTMLElement).hidden = true;
}

function selectPrimitive(mesh: Mesh, mode: 'scale' | 'move' = 'scale'): void {
  if (mesh.metadata?.isVoxel) {
    clearSelection();
    showToast('Voxel ma stały rozmiar 1 × 1 × 1');
    return;
  }
  selectedPrimitiveId = String(mesh.metadata.id);
  gizmoMode = mode;
  configureScaleAxes(mesh);
  attachTransformGizmo(mesh);
  const size = {
    x: Number(mesh.metadata.sizeX ?? 1),
    y: Number(mesh.metadata.sizeY ?? 1),
    z: Number(mesh.metadata.sizeZ ?? 1),
  };
  const logical = getLogicalPosition(mesh);
  selectionBox.scaling.set(size.x + 0.06, Math.max(0.08, size.y + 0.06), size.z + 0.06);
  selectionBox.position.set(
    logical.x + (size.x - 1) / 2,
    logical.y - 0.5 + Math.max(0.04, size.y / 2),
    logical.z + (size.z - 1) / 2,
  );
  selectionBox.setEnabled(true);
  (document.querySelector('#transformSection') as HTMLElement).hidden = false;
  document.querySelector('#selectedShapeName')!.textContent = shapeNames[mesh.metadata.kind as ShapeType];
  (document.querySelector('#selectedSizeX') as HTMLInputElement).value = String(size.x);
  (document.querySelector('#selectedSizeY') as HTMLInputElement).value = String(size.y);
  (document.querySelector('#selectedSizeZ') as HTMLInputElement).value = String(size.z);
  document.querySelector('#selectedOrigin')!.textContent = `X ${logical.x} · Y ${logical.y} · Z ${logical.z}`;
}

function getMaterial(hex: string, textureData?: string, unlit = false): StandardMaterial {
  const normalized = hex.toLowerCase();
  const materialKey = `${normalized}|${textureData ?? ''}|${unlit ? 'unlit' : 'lit'}`;
  const cached = materials.get(materialKey);
  if (cached) return cached;
  const material = new StandardMaterial(`mat-${materials.size}`, scene);
  const base = Color3.FromHexString(normalized);
  // A texture already contains its own colours; tinting it with the selected
  // object colour made images inherit the default orange palette colour.
  const surfaceColor = textureData ? Color3.White() : base;
  material.diffuseColor = surfaceColor;
  material.disableLighting = unlit;
  if (unlit) material.emissiveColor = surfaceColor;
  material.specularColor = Color3.Black();
  // Babylon maps StandardMaterial.specularPower to glTF roughness during export.
  // Zero produces roughness 1, keeping GLB/glTF models fully matte in other viewers.
  material.specularPower = 0;
  material.ambientColor = surfaceColor.scale(0.22);
  if (textureData) {
    const texture = new Texture(textureData, scene, false, false, Texture.NEAREST_SAMPLINGMODE);
    texture.name = `texture-${materials.size}`;
    texture.hasAlpha = textureData.startsWith('data:image/png') || textureData.startsWith('data:image/webp');
    material.diffuseTexture = texture;
    material.useAlphaFromDiffuseTexture = texture.hasAlpha;
    if (texture.hasAlpha) {
      // Textured model surfaces are solid geometry. Alpha blending moves them to
      // Babylon's distance-sorted transparent queue, where intersecting/large
      // boxes can be drawn in the wrong order as the camera rotates. Alpha test
      // preserves cut-out pixels while keeping normal depth writes and occlusion.
      material.transparencyMode = Material.MATERIAL_ALPHATEST;
      material.alphaCutOff = TEXTURE_ALPHA_CUTOFF;
    }
  }
  material.freeze();
  materials.set(materialKey, material);
  return material;
}

const MAX_PAINT_TEXTURE_SIZE = 512;

interface BoxPaintResources {
  signature: string;
  multiMaterial: MultiMaterial;
  materials: StandardMaterial[];
  textures: DynamicTexture[];
}

interface PixelTextureData {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
}

const pendingPaintTextureUpdates = new Map<Mesh, Set<number>>();
let paintTextureFramePending = false;

function flushPaintTextureUpdates(): void {
  paintTextureFramePending = false;
  pendingPaintTextureUpdates.forEach((faces, mesh) => {
    const resources = mesh.metadata?.paintResources as BoxPaintResources | undefined;
    if (!resources || mesh.isDisposed()) return;
    faces.forEach((face) => resources.textures[face]?.update(true));
  });
  pendingPaintTextureUpdates.clear();
}

function schedulePaintTextureUpdate(mesh: Mesh, face: number): void {
  const faces = pendingPaintTextureUpdates.get(mesh) ?? new Set<number>();
  faces.add(face);
  pendingPaintTextureUpdates.set(mesh, faces);
  if (paintTextureFramePending) return;
  paintTextureFramePending = true;
  requestAnimationFrame(flushPaintTextureUpdates);
}

function getPaintCells(mesh: Mesh): Map<string, string> {
  if (!(mesh.metadata.paintCells instanceof Map)) mesh.metadata.paintCells = new Map<string, string>();
  return mesh.metadata.paintCells as Map<string, string>;
}

function boxFaceGridSize(mesh: Mesh, face: number): { width: number; height: number } {
  const x = Number(mesh.metadata.sizeX ?? 1);
  const y = Number(mesh.metadata.sizeY ?? 1);
  const z = Number(mesh.metadata.sizeZ ?? 1);
  if (face <= 1) return { width: x, height: y };
  // Babylon obraca UV ścian ±X: oś U biegnie po Y, a oś V po Z.
  if (face <= 3) return { width: y, height: z };
  // Na górze i spodzie U biegnie po Z, a V po X.
  return { width: z, height: x };
}

function boxFaceFromNormal(normal: Vector3 | null): number | null {
  if (!normal) return null;
  const axis = dominantGridNormal(normal);
  if (axis.z > 0) return 0;
  if (axis.z < 0) return 1;
  if (axis.x > 0) return 2;
  if (axis.x < 0) return 3;
  if (axis.y > 0) return 4;
  return 5;
}

function disposeBoxPaintResources(mesh: Mesh): void {
  pendingPaintTextureUpdates.delete(mesh);
  const resources = mesh.metadata?.paintResources as BoxPaintResources | undefined;
  if (!resources) return;
  resources.textures.forEach((texture) => texture.dispose());
  resources.materials.forEach((material) => material.dispose(false, false));
  resources.multiMaterial.dispose(false, false);
  mesh.metadata.paintResources = undefined;
}

function fillTextureBase(
  context: ReturnType<DynamicTexture['getContext']>,
  width: number,
  height: number,
  baseColor: string,
  source?: PixelTextureData,
): void {
  if (!source) {
    context.fillStyle = baseColor;
    context.fillRect(0, 0, width, height);
    return;
  }
  const imageData = new ImageData(width, height);
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(source.height - 1, Math.floor(y * source.height / height));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(source.width - 1, Math.floor(x * source.width / width));
      const sourceOffset = (sourceY * source.width + sourceX) * 4;
      const targetOffset = (y * width + x) * 4;
      imageData.data[targetOffset] = source.pixels[sourceOffset];
      imageData.data[targetOffset + 1] = source.pixels[sourceOffset + 1];
      imageData.data[targetOffset + 2] = source.pixels[sourceOffset + 2];
      imageData.data[targetOffset + 3] = source.pixels[sourceOffset + 3];
    }
  }
  context.putImageData(imageData, 0, 0);
}

function fillBoxPaintCell(mesh: Mesh, face: number, u: number, v: number, color: string): void {
  const resources = mesh.metadata.paintResources as BoxPaintResources;
  const texture = resources.textures[face];
  const context = texture.getContext();
  const logicalSize = boxFaceGridSize(mesh, face);
  const textureSize = texture.getSize();
  const x0 = Math.floor(u * textureSize.width / logicalSize.width);
  const y0 = Math.floor(v * textureSize.height / logicalSize.height);
  const x1 = Math.max(x0 + 1, Math.ceil((u + 1) * textureSize.width / logicalSize.width));
  const y1 = Math.max(y0 + 1, Math.ceil((v + 1) * textureSize.height / logicalSize.height));
  context.fillStyle = color;
  context.fillRect(x0, y0, x1 - x0, y1 - y0);
}

function drawBoxPaintCell(mesh: Mesh, face: number, u: number, v: number, color: string): void {
  fillBoxPaintCell(mesh, face, u, v, color);
  schedulePaintTextureUpdate(mesh, face);
}

function drawBoxPaintFace(mesh: Mesh, face: number): void {
  const resources = mesh.metadata.paintResources as BoxPaintResources;
  const texture = resources.textures[face];
  const context = texture.getContext();
  const logicalSize = boxFaceGridSize(mesh, face);
  const textureSize = texture.getSize();
  context.clearRect(0, 0, textureSize.width, textureSize.height);
  fillTextureBase(
    context,
    textureSize.width,
    textureSize.height,
    String(mesh.metadata.color),
    mesh.metadata.baseTexturePixels as PixelTextureData | undefined,
  );
  getPaintCells(mesh).forEach((color, key) => {
    const [cellFace, u, v] = key.split(':').map(Number);
    if (cellFace !== face || u < 0 || v < 0 || u >= logicalSize.width || v >= logicalSize.height) return;
    fillBoxPaintCell(mesh, face, u, v, color);
  });
  texture.update(true);
}

function ensureBoxPaintResources(mesh: Mesh): BoxPaintResources {
  const signature = `${mesh.metadata.sizeX}:${mesh.metadata.sizeY}:${mesh.metadata.sizeZ}`;
  const existing = mesh.metadata.paintResources as BoxPaintResources | undefined;
  if (existing?.signature === signature) return existing;
  disposeBoxPaintResources(mesh);
  mesh.releaseSubMeshes();
  const multiMaterial = new MultiMaterial(`paint-${mesh.metadata.id}`, scene);
  const textures: DynamicTexture[] = [];
  const faceMaterials: StandardMaterial[] = [];
  for (let face = 0; face < 6; face += 1) {
    const logicalSize = boxFaceGridSize(mesh, face);
    const texture = new DynamicTexture(
      `paint-${mesh.metadata.id}-${face}`,
      {
        width: Math.min(MAX_PAINT_TEXTURE_SIZE, logicalSize.width),
        height: Math.min(MAX_PAINT_TEXTURE_SIZE, logicalSize.height),
      },
      scene,
      false,
      Texture.NEAREST_SAMPLINGMODE,
    );
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    texture.hasAlpha = true;
    const faceMaterial = new StandardMaterial(`paint-material-${mesh.metadata.id}-${face}`, scene);
    faceMaterial.diffuseColor = Color3.White();
    faceMaterial.ambientColor = new Color3(0.22, 0.22, 0.22);
    faceMaterial.specularColor = Color3.Black();
    faceMaterial.specularPower = 0;
    faceMaterial.diffuseTexture = texture;
    faceMaterial.useAlphaFromDiffuseTexture = true;
    faceMaterial.transparencyMode = Material.MATERIAL_ALPHATEST;
    faceMaterial.alphaCutOff = TEXTURE_ALPHA_CUTOFF;
    multiMaterial.subMaterials.push(faceMaterial);
    textures.push(texture);
    faceMaterials.push(faceMaterial);
    new SubMesh(face, 0, mesh.getTotalVertices(), face * 6, 6, mesh);
  }
  const resources = { signature, multiMaterial, materials: faceMaterials, textures };
  mesh.metadata.paintResources = resources;
  mesh.material = multiMaterial;
  for (let face = 0; face < 6; face += 1) drawBoxPaintFace(mesh, face);
  return resources;
}

function restoreSingleMaterialSubMesh(mesh: Mesh): void {
  mesh.releaseSubMeshes();
  new SubMesh(0, 0, mesh.getTotalVertices(), 0, mesh.getTotalIndices(), mesh);
}

function clearPrimitivePaint(mesh: Mesh): void {
  disposeBoxPaintResources(mesh);
  if (mesh.metadata) {
    mesh.metadata.paintCells = new Map<string, string>();
    mesh.metadata.baseTexturePixels = undefined;
  }
  restoreSingleMaterialSubMesh(mesh);
}

function refreshPrimitivePaint(mesh: Mesh): void {
  const kind = mesh.metadata.kind as ShapeType;
  if ((kind === 'box' || kind === 'square') && (getPaintCells(mesh).size || mesh.metadata.baseTexturePixels)) {
    ensureBoxPaintResources(mesh);
  }
}

function applyPixelTextureToBox(mesh: Mesh, texturePixels: PixelTextureData): void {
  mesh.metadata.baseTexturePixels = texturePixels;
  ensureBoxPaintResources(mesh);
  for (let face = 0; face < 6; face += 1) drawBoxPaintFace(mesh, face);
}

async function decodeTexturePixels(textureData: string): Promise<PixelTextureData> {
  const response = await fetch(textureData);
  const bitmap = await createImageBitmap(await response.blob());
  const textureCanvas = document.createElement('canvas');
  textureCanvas.width = Math.min(MAX_PAINT_TEXTURE_SIZE, bitmap.width);
  textureCanvas.height = Math.min(MAX_PAINT_TEXTURE_SIZE, bitmap.height);
  const context = textureCanvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    bitmap.close();
    throw new Error('Canvas unavailable');
  }
  context.imageSmoothingEnabled = false;
  context.drawImage(bitmap, 0, 0, textureCanvas.width, textureCanvas.height);
  bitmap.close();
  return {
    pixels: context.getImageData(0, 0, textureCanvas.width, textureCanvas.height).data,
    width: textureCanvas.width,
    height: textureCanvas.height,
  };
}

function createVoxel(data: VoxelData): Mesh {
  const mesh = createShapeMesh(`voxel-${keyOf(data.x, data.y, data.z)}`, 'voxel');
  const logicalPosition = new Vector3(data.x, data.y, data.z);
  positionShape(mesh, 'voxel', logicalPosition);
  mesh.material = getMaterial(data.color, data.texture);
  mesh.isPickable = true;
  mesh.metadata = { isModel: true, isVoxel: true, kind: 'voxel', color: data.color.toLowerCase(), texture: data.texture, logicalPosition };
  mesh.freezeWorldMatrix();
  voxels.set(keyOf(data.x, data.y, data.z), mesh);
  return mesh;
}

function createPrimitive(data: PrimitiveData): Mesh {
  const mesh = createShapeMesh(`${data.type}-${data.id}`, data.type);
  const logicalPosition = new Vector3(data.x, data.y, data.z);
  const sizeX = Math.max(1, Math.round(data.sizeX ?? 1));
  const sizeY = Math.max(1, Math.round(data.sizeY ?? 1));
  const sizeZ = Math.max(1, Math.round(data.sizeZ ?? 1));
  positionShape(mesh, data.type, logicalPosition, { x: sizeX, y: sizeY, z: sizeZ });
  mesh.material = getMaterial(data.color, data.texture, data.type === 'billboard');
  mesh.isPickable = true;
  const paintCells = new Map<string, string>();
  data.paint?.forEach((cell) => paintCells.set(`${cell.face}:${cell.u}:${cell.v}`, cell.color.toLowerCase()));
  mesh.metadata = { isModel: true, kind: data.type, id: data.id, color: data.color.toLowerCase(), texture: data.texture, logicalPosition, sizeX, sizeY, sizeZ, paintCells };
  refreshPrimitivePaint(mesh);
  if (data.type !== 'billboard') mesh.freezeWorldMatrix();
  primitives.set(data.id, mesh);
  if (data.texture && (data.type === 'box' || data.type === 'square')) {
    void decodeTexturePixels(data.texture).then((pixels) => {
      if (!mesh.isDisposed() && mesh.metadata.texture === data.texture) applyPixelTextureToBox(mesh, pixels);
    }).catch(() => undefined);
  }
  return mesh;
}

function serializeVoxels(): VoxelData[] {
  return [...voxels.values()]
    .map((mesh) => ({
      x: Math.round(mesh.metadata.logicalPosition.x),
      y: Math.round(mesh.metadata.logicalPosition.y),
      z: Math.round(mesh.metadata.logicalPosition.z),
      color: String(mesh.metadata.color),
      ...(mesh.metadata.texture ? { texture: String(mesh.metadata.texture) } : {}),
    }))
    .sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);
}

function serializePrimitive(mesh: Mesh): PrimitiveData {
    const paint = [...getPaintCells(mesh).entries()].map(([key, color]) => {
      const [face, u, v] = key.split(':').map(Number);
      return { face, u, v, color };
    });
    return {
      id: String(mesh.metadata.id),
      type: mesh.metadata.kind as ShapeType,
      x: Math.round(mesh.metadata.logicalPosition.x),
      y: Math.round(mesh.metadata.logicalPosition.y),
      z: Math.round(mesh.metadata.logicalPosition.z),
      color: String(mesh.metadata.color),
      sizeX: Number(mesh.metadata.sizeX ?? 1),
      sizeY: Number(mesh.metadata.sizeY ?? 1),
      sizeZ: Number(mesh.metadata.sizeZ ?? 1),
      ...(mesh.metadata.texture ? { texture: String(mesh.metadata.texture) } : {}),
      ...(paint.length ? { paint } : {}),
    };
}

function serializePrimitives(): PrimitiveData[] {
  return [...primitives.values()].map(serializePrimitive);
}

function copySelectedPrimitive(): void {
  if (!selectedPrimitiveId) {
    showToast('Najpierw zaznacz kształt do skopiowania', true);
    return;
  }
  const mesh = primitives.get(selectedPrimitiveId);
  if (!mesh) return;
  copiedPrimitive = structuredClone(serializePrimitive(mesh));
  pasteOffset = 0;
  showToast(`Skopiowano: ${shapeNames[copiedPrimitive.type]}`);
}

function pastePrimitive(): void {
  if (!copiedPrimitive) {
    showToast('Schowek kształtów jest pusty', true);
    return;
  }
  pasteOffset += 1;
  const data = structuredClone(copiedPrimitive);
  data.id = crypto.randomUUID();
  data.x += pasteOffset;
  data.z += pasteOffset;
  const mesh = createPrimitive(data);
  setTool('select');
  selectPrimitive(mesh, 'move');
  pushHistory();
  updateStats();
  showToast(`Wklejono kopię · przesunięcie ${pasteOffset} kom.`);
}

function serializeProject(): ProjectSnapshot {
  return { voxels: serializeVoxels(), primitives: serializePrimitives() };
}

function packProject(project: ProjectSnapshot): PackedProjectSnapshot {
  const textures: string[] = [];
  const textureIds = new Map<string, number>();
  const getTextureId = (texture: string): number => {
    const existing = textureIds.get(texture);
    if (existing !== undefined) return existing;
    const id = textures.length;
    textures.push(texture);
    textureIds.set(texture, id);
    return id;
  };
  const packItem = <T extends VoxelData | PrimitiveData>(item: T): Omit<T, 'texture'> & { textureId?: number } => {
    const { texture, ...rest } = item;
    return texture ? { ...rest, textureId: getTextureId(texture) } : rest;
  };
  return {
    textures,
    voxels: project.voxels.map(packItem),
    primitives: project.primitives.map(packItem),
    textureLibrary: [...textureLibrary.values()].map((item) => ({
      id: item.id,
      name: item.name,
      textureId: getTextureId(item.data),
      width: item.width,
      height: item.height,
    })),
  };
}

function unpackProject(project: { textures?: string[]; voxels?: PackedVoxelData[]; primitives?: PackedPrimitiveData[] }): ProjectSnapshot {
  const textures = Array.isArray(project.textures) ? project.textures : [];
  const unpackItem = <T extends PackedVoxelData | PackedPrimitiveData>(item: T): Omit<T, 'textureId'> & { texture?: string } => {
    const { textureId, ...rest } = item;
    if (textureId === undefined) return rest;
    const texture = textures[textureId];
    if (!texture) throw new Error('Brak tekstury w bibliotece projektu');
    return { ...rest, texture };
  };
  return {
    voxels: Array.isArray(project.voxels) ? project.voxels.map((item) => unpackItem(item) as VoxelData) : [],
    primitives: Array.isArray(project.primitives) ? project.primitives.map((item) => unpackItem(item) as PrimitiveData) : [],
  };
}

function unpackTextureLibrary(textures: string[], library: PackedTextureLibraryItem[] = []): TextureLibraryItem[] {
  return library.map((item) => {
    const data = textures[item.textureId];
    if (!data) throw new Error('Brak pliku tekstury w bibliotece');
    return { id: item.id, name: item.name, data, width: item.width, height: item.height };
  });
}

function loadProject(data: ProjectSnapshot): void {
  clearHoverOutline(hoveredMesh);
  clearSelection();
  hoveredMesh = null;
  voxels.forEach((mesh) => mesh.dispose());
  primitives.forEach((mesh) => {
    disposeBoxPaintResources(mesh);
    mesh.dispose();
  });
  voxels.clear();
  primitives.clear();
  data.voxels.forEach(createVoxel);
  data.primitives.forEach(createPrimitive);
  updateStats();
}

function pushHistory(): void {
  history = history.slice(0, historyIndex + 1);
  history.push(serializeProject());
  if (history.length > MAX_HISTORY) history.shift();
  historyIndex = history.length - 1;
  updateHistoryButtons();
  setProjectDirty(true);
}

function undo(): void {
  if (historyIndex <= 0) return;
  historyIndex -= 1;
  loadProject(history[historyIndex]);
  updateHistoryButtons();
  setProjectDirty(true);
  showToast('Cofnięto ostatnią zmianę');
}

function redo(): void {
  if (historyIndex >= history.length - 1) return;
  historyIndex += 1;
  loadProject(history[historyIndex]);
  updateHistoryButtons();
  setProjectDirty(true);
  showToast('Przywrócono zmianę');
}

function updateHistoryButtons(): void {
  (document.querySelector('#undoBtn') as HTMLButtonElement).disabled = historyIndex <= 0;
  (document.querySelector('#redoBtn') as HTMLButtonElement).disabled = historyIndex >= history.length - 1;
}

function addVoxel(position: Vector3, commit = true): boolean {
  const x = Math.round(position.x);
  const y = Math.max(0, Math.round(position.y));
  const z = Math.round(position.z);
  const logical = new Vector3(x, y, z);
  if (isPositionOccupied(logical)) return false;
  const pixelColor = currentTexturePixels ? sampleTextureColor(logical) : null;
  createVoxel({ x, y, z, color: pixelColor ?? currentColor });
  if (commit) {
    pushHistory();
    updateStats();
  }
  return true;
}

function isVoxelShape(type: ShapeType): type is VoxelShapeType {
  return type === 'pyramid' || type === 'sphere' || type === 'cylinder';
}

function ellipseAxisDistance(index: number, size: number): number {
  if (size <= 1) return 0;
  const center = (size - 1) / 2;
  // Half-cell inset keeps small even and odd diameters circular instead of
  // turning 3x3/6x6 footprints into almost solid squares.
  const radius = size === 2 ? 1 : (size - 0.5) / 2;
  return ((index - center) / radius) ** 2;
}

function generateVoxelShapeOffsets(type: VoxelShapeType, size: { x: number; y: number; z: number }): Vector3[] | null {
  const boundingVolume = size.x * size.y * size.z;
  if (!Number.isSafeInteger(boundingVolume) || boundingVolume > MAX_VOXEL_SHAPE_VOXELS * 4) return null;
  const offsets: Vector3[] = [];
  const append = (x: number, y: number, z: number): boolean => {
    if (offsets.length >= MAX_VOXEL_SHAPE_VOXELS) return false;
    offsets.push(new Vector3(x, y, z));
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

function addShape(position: Vector3): void {
  const logical = new Vector3(Math.round(position.x), Math.max(0, Math.round(position.y)), Math.round(position.z));
  if (isVoxelShape(currentShape)) {
    const offsets = generateVoxelShapeOffsets(currentShape, currentShapeSize);
    if (!offsets) {
      showToast(`Kształt przekracza limit ${MAX_VOXEL_SHAPE_VOXELS} voxeli`, true);
      return;
    }
    const positions = offsets.map((offset) => logical.add(offset));
    if (positions.some(isPositionOccupied)) {
      showToast('Kształt nachodzi na istniejący model', true);
      return;
    }
    positions.forEach((voxelPosition) => {
      const pixelColor = currentTexturePixels ? sampleTextureColor(voxelPosition) : null;
      createVoxel({
        x: voxelPosition.x,
        y: voxelPosition.y,
        z: voxelPosition.z,
        color: pixelColor ?? currentColor,
      });
    });
    pushHistory();
    updateStats();
    showToast(`${shapeNames[currentShape]}: dodano ${positions.length} voxeli 1 × 1 × 1`);
    return;
  }
  if (isPositionOccupied(logical)) return;
  createPrimitive({
    id: crypto.randomUUID(),
    type: currentShape,
    x: logical.x,
    y: logical.y,
    z: logical.z,
    color: currentColor,
    sizeX: currentShapeSize.x,
    sizeY: currentShapeSize.y,
    sizeZ: currentShapeSize.z,
    ...(currentTexture ? { texture: currentTexture } : {}),
  });
  pushHistory();
  updateStats();
}

function eraseObject(mesh: Mesh): void {
  clearHoverOutline(mesh);
  hoveredMesh = null;
  if (mesh.metadata.isVoxel) {
    const position = mesh.metadata.logicalPosition as Vector3;
    voxels.delete(keyOf(position.x, position.y, position.z));
  } else {
    if (selectedPrimitiveId === String(mesh.metadata.id)) clearSelection();
    primitives.delete(String(mesh.metadata.id));
    disposeBoxPaintResources(mesh);
  }
  mesh.dispose();
  pushHistory();
  updateStats();
}

function getBoxSurfaceCell(
  mesh: Mesh,
  normal: Vector3 | null,
  uv: { x: number; y: number } | null,
): { key: string; face: number; u: number; v: number } | null {
  const kind = mesh.metadata.kind as ShapeType | 'voxel';
  if (mesh.metadata.isVoxel || (kind !== 'box' && kind !== 'square') || !uv) return null;
  const face = boxFaceFromNormal(normal);
  if (face === null) return null;
  const size = boxFaceGridSize(mesh, face);
  const u = Math.max(0, Math.min(size.width - 1, Math.floor(uv.x * size.width)));
  const v = Math.max(0, Math.min(size.height - 1, Math.floor((1 - uv.y) * size.height)));
  return { key: `${face}:${u}:${v}`, face, u, v };
}

function colorFromPixels(source: PixelTextureData, u: number, v: number): string | null {
  const x = Math.max(0, Math.min(source.width - 1, Math.floor(u * source.width)));
  const y = Math.max(0, Math.min(source.height - 1, Math.floor(v * source.height)));
  const offset = (y * source.width + x) * 4;
  if (source.pixels[offset + 3] < 8) return null;
  return `#${[source.pixels[offset], source.pixels[offset + 1], source.pixels[offset + 2]]
    .map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function sampleObjectColor(
  mesh: Mesh,
  normal: Vector3 | null,
  uv: { x: number; y: number } | null,
): string {
  const cell = getBoxSurfaceCell(mesh, normal, uv);
  if (cell) {
    const paintedColor = getPaintCells(mesh).get(cell.key);
    if (paintedColor) return paintedColor;
    const baseTexture = mesh.metadata.baseTexturePixels as PixelTextureData | undefined;
    if (baseTexture && uv) {
      const textureColor = colorFromPixels(baseTexture, uv.x, 1 - uv.y);
      if (textureColor) return textureColor;
    }
  }
  return String(mesh.metadata.color ?? currentColor);
}

function paintObject(
  mesh: Mesh,
  commit = true,
  normal: Vector3 | null = null,
  uv: { x: number; y: number } | null = null,
): boolean {
  const logical = getLogicalPosition(mesh);
  const paintCell = getBoxSurfaceCell(mesh, normal, uv);
  const targetKey = paintCell
    ? `p-${String(mesh.metadata.id)}-${paintCell.key}`
    : mesh.metadata.isVoxel ? `v-${keyOf(logical.x, logical.y, logical.z)}` : `p-${String(mesh.metadata.id)}`;
  if (!commit && paintedInStroke.has(targetKey)) return false;
  if (paintCell) {
    const cells = getPaintCells(mesh);
    const brushColor = currentColor.toLowerCase();
    const previousColor = cells.get(paintCell.key);
    if (previousColor === brushColor) return false;
    if (previousColor === undefined && !mesh.metadata.texture && String(mesh.metadata.color) === brushColor) return false;
    const resetsSolidBase = !mesh.metadata.texture && brushColor === String(mesh.metadata.color);
    if (resetsSolidBase) cells.delete(paintCell.key);
    else cells.set(paintCell.key, brushColor);
    ensureBoxPaintResources(mesh);
    if (resetsSolidBase) drawBoxPaintFace(mesh, paintCell.face);
    else drawBoxPaintCell(mesh, paintCell.face, paintCell.u, paintCell.v, brushColor);
  } else {
    if (mesh.metadata.color === currentColor.toLowerCase() && !mesh.metadata.texture) return false;
    if (!mesh.metadata.isVoxel) clearPrimitivePaint(mesh);
    // Kształty bez siatki UV nadal są malowane całym materiałem.
    mesh.metadata.texture = undefined;
    mesh.material = getMaterial(currentColor, undefined, mesh.metadata.kind === 'billboard');
    mesh.metadata.color = currentColor.toLowerCase();
  }
  if (commit) pushHistory();
  else {
    paintedInStroke.add(targetKey);
    paintStrokeChanged = true;
  }
  return true;
}

function finishPaintStroke(): void {
  if (pendingPaintTextureUpdates.size) flushPaintTextureUpdates();
  if (!paintStrokeActive) return;
  paintStrokeActive = false;
  paintedInStroke.clear();
  if (paintStrokeChanged) pushHistory();
  paintStrokeChanged = false;
}

function dominantGridNormal(normal: Vector3 | null): Vector3 {
  if (!normal) return Vector3.Up();
  const absolute = { x: Math.abs(normal.x), y: Math.abs(normal.y), z: Math.abs(normal.z) };
  if (absolute.x >= absolute.y && absolute.x >= absolute.z) return new Vector3(Math.sign(normal.x) || 1, 0, 0);
  if (absolute.y >= absolute.z) return new Vector3(0, Math.sign(normal.y) || 1, 0);
  return new Vector3(0, 0, Math.sign(normal.z) || 1);
}

function pointOnPointerPlane(plane: Plane): Vector3 | null {
  const ray = scene.createPickingRay(scene.pointerX, scene.pointerY, Matrix.Identity(), camera, false);
  const distance = ray.intersectsPlane(plane);
  return distance === null ? null : ray.origin.add(ray.direction.scale(distance));
}

function textureObject(mesh: Mesh): void {
  if (mesh.metadata.isVoxel && currentTexturePixels) {
    voxels.forEach((voxel) => {
      const sampledColor = sampleTextureColor(getLogicalPosition(voxel));
      if (!sampledColor) return;
      voxel.metadata.texture = undefined;
      voxel.metadata.color = sampledColor;
      voxel.material = getMaterial(sampledColor);
    });
    pushHistory();
    showToast(`Tekstura dopasowana 1:1 do ${voxels.size} voxeli — możesz dalej rysować`);
    return;
  }
  const nextTexture = currentTexture ?? undefined;
  if (mesh.metadata.texture === nextTexture && (!mesh.metadata.paintCells || mesh.metadata.paintCells.size === 0)) return;
  if (!mesh.metadata.isVoxel) clearPrimitivePaint(mesh);
  mesh.metadata.texture = nextTexture;
  const kind = mesh.metadata.kind as ShapeType;
  if (nextTexture && currentTexturePixels && (kind === 'box' || kind === 'square')) {
    applyPixelTextureToBox(mesh, {
      pixels: currentTexturePixels,
      width: currentTexturePixelSize.width,
      height: currentTexturePixelSize.height,
    });
  } else {
    mesh.material = getMaterial(String(mesh.metadata.color), nextTexture, kind === 'billboard');
  }
  pushHistory();
  showToast(nextTexture ? 'Tekstura dopasowana do siatki — możesz po niej malować' : 'Tekstura została usunięta');
}

function stampTextureOnObject(
  mesh: Mesh,
  normal: Vector3 | null,
  uv: { x: number; y: number } | null,
): boolean {
  if (!currentTexturePixels || !currentTexturePixelSize.width || !currentTexturePixelSize.height) return false;
  const surfaceCell = getBoxSurfaceCell(mesh, normal, uv);
  let changed = 0;
  if (surfaceCell) {
    const faceSize = boxFaceGridSize(mesh, surfaceCell.face);
    const stampSize = getStampPixelSize();
    const startU = surfaceCell.u - Math.floor(stampSize.width / 2);
    const startV = surfaceCell.v - Math.floor(stampSize.height / 2);
    const cells = getPaintCells(mesh);
    ensureBoxPaintResources(mesh);
    for (let y = 0; y < stampSize.height; y += 1) {
      for (let x = 0; x < stampSize.width; x += 1) {
        const u = startU + x;
        const v = startV + y;
        if (u < 0 || v < 0 || u >= faceSize.width || v >= faceSize.height) continue;
        const color = stampPixelColorAt(x, y);
        if (!color) continue;
        const key = `${surfaceCell.face}:${u}:${v}`;
        if (cells.get(key) === color) continue;
        cells.set(key, color);
        fillBoxPaintCell(mesh, surfaceCell.face, u, v, color);
        changed += 1;
      }
    }
    if (changed) schedulePaintTextureUpdate(mesh, surfaceCell.face);
  } else if (mesh.metadata.isVoxel) {
    const anchor = getLogicalPosition(mesh);
    const stampSize = getStampPixelSize();
    const startX = anchor.x - Math.floor(stampSize.width / 2);
    const startZ = anchor.z - Math.floor(stampSize.height / 2);
    for (let y = 0; y < stampSize.height; y += 1) {
      for (let x = 0; x < stampSize.width; x += 1) {
        const voxel = voxels.get(keyOf(startX + x, anchor.y, startZ + y));
        const color = stampPixelColorAt(x, y);
        if (!voxel || !color || voxel.metadata.color === color) continue;
        voxel.metadata.texture = undefined;
        voxel.metadata.color = color;
        voxel.material = getMaterial(color);
        changed += 1;
      }
    }
  } else {
    showToast('Stempel pikselowy działa na Boxach i modelach voxelowych', true);
    return false;
  }
  if (!changed) {
    showToast('Stempel nie trafił w żadną nową komórkę', true);
    return false;
  }
  flushPaintTextureUpdates();
  pushHistory();
  showToast(`Przystemplowano ${changed} ${changed === 1 ? 'piksel' : 'pikseli'}`);
  return true;
}

function getLogicalPosition(mesh: Mesh): Vector3 {
  return mesh.metadata?.logicalPosition instanceof Vector3 ? mesh.metadata.logicalPosition : mesh.position;
}

function isPositionOccupied(position: Vector3): boolean {
  const key = keyOf(Math.round(position.x), Math.round(position.y), Math.round(position.z));
  if (voxels.has(key)) return true;
  return [...primitives.values()].some((mesh) => {
    const logical = getLogicalPosition(mesh);
    return keyOf(logical.x, logical.y, logical.z) === key;
  });
}

function getEditPosition(pickedMesh: Mesh, pickedPoint: Vector3, normal: Vector3 | null): Vector3 {
  if (pickedMesh.metadata?.isGround) {
    return new Vector3(Math.round(pickedPoint.x), 0, Math.round(pickedPoint.z));
  }
  const offset = dominantGridNormal(normal).scale(0.51);
  return pickedPoint.add(offset);
}

function getSnappedEditPosition(pickedMesh: Mesh, pickedPoint: Vector3, normal: Vector3 | null): Vector3 {
  const position = getEditPosition(pickedMesh, pickedPoint, normal);
  return new Vector3(Math.round(position.x), Math.max(0, Math.round(position.y)), Math.round(position.z));
}

const infiniteGroundPlane = Plane.FromPositionAndNormal(new Vector3(0, -0.5, 0), Vector3.Up());

scene.onPointerObservable.add((pointerInfo) => {
  if (pointerInfo.type === PointerEventTypes.POINTERMOVE) {
    const pick = pointerInfo.pickInfo;
    preview.setEnabled(false);
    hideStampPreviews();
    previewPosition = null;
    document.querySelector('#coordinates')!.textContent = 'X —   Y —   Z —';

    let pickedMesh = pick?.hit && pick.pickedMesh ? pick.pickedMesh as Mesh : null;
    let pickedPoint = pick?.hit && pick.pickedPoint ? pick.pickedPoint : null;
    let normal = pick?.hit ? pick.getNormal(true) : null;
    if ((!pickedMesh || !pickedPoint) && (currentTool === 'add' || currentTool === 'shape')) {
      pickedPoint = pointOnPointerPlane(infiniteGroundPlane);
      if (pickedPoint) {
        pickedMesh = ground;
        normal = Vector3.Up();
      }
    }

    if (!pickedMesh || !pickedPoint) {
      clearHoverOutline(hoveredMesh);
      hoveredMesh = null;
      hoveredTool = null;
      return;
    }

    const nextHovered = pickedMesh.metadata?.isModel ? pickedMesh : null;
    if (nextHovered !== hoveredMesh || hoveredTool !== currentTool) {
      clearHoverOutline(hoveredMesh);
      hoveredMesh = nextHovered;
      hoveredTool = currentTool;
      if (hoveredMesh) applyHoverOutline(hoveredMesh);
    }

    if (currentTool === 'paint' && textureStampPending && pickedMesh.metadata?.isModel) {
      updateStampPreview(pickedMesh, normal, pick?.getTextureCoordinates() ?? null);
    }

    if (currentTool === 'add' || currentTool === 'shape') {
      const logical = getSnappedEditPosition(pickedMesh, pickedPoint, normal);
      const valid = !isPositionOccupied(logical);
      if (valid) {
        positionShape(preview, currentTool === 'shape' ? currentShape : 'voxel', logical, currentTool === 'shape' ? currentShapeSize : undefined);
        preview.setEnabled(true);
        previewPosition = logical;
      }
    }

    const displayPos = (currentTool === 'add' || currentTool === 'shape') && previewPosition ? previewPosition : getLogicalPosition(pickedMesh);
    document.querySelector('#coordinates')!.textContent = `X ${Math.round(displayPos.x)}   Y ${Math.round(displayPos.y)}   Z ${Math.round(displayPos.z)}`;
  }

  if (pointerInfo.type === PointerEventTypes.POINTERDOWN) {
    const event = pointerInfo.event as PointerEvent;
    const pick = pointerInfo.pickInfo;
    if (event.button === 2) {
      if (pick?.hit && pick.pickedMesh?.metadata?.isModel) eraseObject(pick.pickedMesh as Mesh);
      return;
    }
    if (event.button !== 0) return;
    let mesh = pick?.hit && pick.pickedMesh ? pick.pickedMesh as Mesh : null;
    let point = pick?.hit && pick.pickedPoint ? pick.pickedPoint : null;
    let normal = pick?.hit ? pick.getNormal(true) : null;
    if ((!mesh || !point) && (currentTool === 'add' || currentTool === 'shape')) {
      point = pointOnPointerPlane(infiniteGroundPlane);
      if (point) {
        mesh = ground;
        normal = Vector3.Up();
      }
    }
    if (!mesh || !point) return;
    if (currentTool === 'select' && mesh.metadata?.isModel) {
      selectPrimitive(mesh);
    } else if (currentTool === 'add') {
      addVoxel(getSnappedEditPosition(mesh, point, normal));
    } else if (currentTool === 'shape') {
      addShape(getSnappedEditPosition(mesh, point, normal));
    } else if (mesh.metadata?.isModel && currentTool === 'erase') {
      eraseObject(mesh);
    } else if (mesh.metadata?.isModel && currentTool === 'eyedropper') {
      const sampledColor = sampleObjectColor(mesh, normal, pick?.getTextureCoordinates() ?? null);
      activateColorBrush(sampledColor);
      setTool('paint');
      showToast(`Pobrano kolor ${sampledColor.toUpperCase()}`);
    } else if (mesh.metadata?.isModel && currentTool === 'paint') {
      if (textureStampPending) {
        stampTextureOnObject(mesh, normal, pick?.getTextureCoordinates() ?? null);
        return;
      }
      if (texturePlacementPending && currentTexture) {
        textureObject(mesh);
        texturePlacementPending = false;
        document.querySelector('#textureHelp')!.textContent = 'Tekstura jest bazą. Wybierz kolor i maluj po jej pikselach.';
        return;
      }
      paintStrokeActive = true;
      paintStrokeChanged = false;
      paintedInStroke.clear();
      paintObject(mesh, false, normal, pick?.getTextureCoordinates() ?? null);
    } else if (mesh.metadata?.isModel && currentTool === 'texture') {
      textureObject(mesh);
    }
  }
  if (pointerInfo.type === PointerEventTypes.POINTERUP) {
    finishPaintStroke();
  }
});

window.addEventListener('pointerup', () => {
  finishPaintStroke();
});

// Wymuszamy świeży picking podczas przeciągania. Babylon może zwrócić w
// POINTERMOVE wynik z poprzedniej klatki, szczególnie przy szybkich ruchach.
canvas.addEventListener('pointermove', (event) => {
  if (currentTool === 'paint' && textureStampPending) {
    const stampPick = scene.pick(
      scene.pointerX,
      scene.pointerY,
      (candidate) => Boolean(candidate.metadata?.isModel),
    );
    hideStampPreviews();
    if (stampPick?.hit && stampPick.pickedMesh && stampPick.pickedPoint) {
      updateStampPreview(
        stampPick.pickedMesh as Mesh,
        stampPick.getNormal(true),
        stampPick.getTextureCoordinates(),
      );
    }
    return;
  }
  if (texturePlacementPending || !paintStrokeActive || currentTool !== 'paint' || (event.buttons & 1) === 0) return;
  const pick = scene.pick(
    scene.pointerX,
    scene.pointerY,
    (candidate) => Boolean(candidate.metadata?.isModel),
  );
  if (pick?.hit && pick.pickedMesh?.metadata?.isModel) {
    paintObject(pick.pickedMesh as Mesh, false, pick.getNormal(true), pick.getTextureCoordinates());
  }
});

canvas.addEventListener('contextmenu', (event) => event.preventDefault());
canvas.addEventListener('dblclick', () => {
  if (currentTool !== 'select') return;
  const pick = scene.pick(
    scene.pointerX,
    scene.pointerY,
    (candidate) => Boolean(candidate.metadata?.isModel && !candidate.metadata?.isVoxel),
  );
  if (!pick?.hit || !pick.pickedMesh) return;
  selectPrimitive(pick.pickedMesh as Mesh, 'move');
  showToast('Tryb przesuwania: przeciągnij uchwyt osi');
});

function setTool(tool: Tool): void {
  finishPaintStroke();
  currentTool = tool;
  if (tool !== 'select') attachTransformGizmo(null);
  else if (selectedPrimitiveId) {
    const selected = primitives.get(selectedPrimitiveId);
    if (selected) {
      configureScaleAxes(selected);
      attachTransformGizmo(selected);
    }
  }
  document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((button) => {
    button.classList.toggle('active', button.dataset.tool === tool);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-mode-tool]').forEach((button) => {
    button.classList.toggle('active', button.dataset.modeTool === tool);
  });
  document.querySelector('#shapeBtn')!.classList.toggle('active', tool === 'shape');
  updatePreviewType(tool === 'shape' ? currentShape : 'voxel');
  preview.setEnabled(false);
  previewPosition = null;
  if (hoveredMesh) {
    clearHoverOutline(hoveredMesh);
    hoveredMesh = null;
  }
  hoveredTool = null;
  if (tool !== 'paint') hideStampPreviews();
  (document.querySelector('.color-section') as HTMLElement).hidden = tool !== 'paint' && tool !== 'eyedropper';
  (document.querySelector('.texture-section') as HTMLElement).hidden = tool !== 'paint';
  document.querySelector('#colorPickerBtn')?.classList.toggle('active', tool === 'eyedropper');
  canvas.style.cursor = tool === 'erase' || tool === 'eyedropper' ? 'crosshair' : tool === 'paint' || tool === 'texture' ? 'cell' : 'copy';
}

document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((button) => {
  button.addEventListener('click', () => {
    if (button.dataset.tool === 'texture') {
      setTool('paint');
      (document.querySelector('#textureInput') as HTMLInputElement).click();
      return;
    }
    setTool(button.dataset.tool as Tool);
  });
});
document.querySelectorAll<HTMLButtonElement>('[data-mode-tool]').forEach((button) => {
  button.addEventListener('click', () => setTool(button.dataset.modeTool as Tool));
});
document.querySelector('#colorPickerBtn')!.addEventListener('click', () => {
  setTool('eyedropper');
  showToast('Kliknij komórkę modelu, aby pobrać jej kolor');
});

const shapePopover = document.querySelector('#shapePopover') as HTMLElement;
const shapeSizeModal = document.querySelector('#shapeSizeModal') as HTMLElement;
const shapeSizeInputs = {
  x: document.querySelector('#modalShapeSizeX') as HTMLInputElement,
  y: document.querySelector('#modalShapeSizeY') as HTMLInputElement,
  z: document.querySelector('#modalShapeSizeZ') as HTMLInputElement,
};
document.querySelector('#shapeBtn')!.addEventListener('click', (event) => {
  event.stopPropagation();
  shapePopover.hidden = !shapePopover.hidden;
});
document.querySelectorAll<HTMLButtonElement>('[data-shape]').forEach((button) => {
  button.addEventListener('click', () => {
    currentShape = button.dataset.shape as ShapeType;
    document.querySelectorAll<HTMLButtonElement>('[data-shape]').forEach((item) => item.classList.toggle('selected', item === button));
    shapeSizeInputs.x.value = String(currentShapeSize.x);
    shapeSizeInputs.y.value = String(currentShape === 'circle' ? 1 : currentShapeSize.y);
    shapeSizeInputs.z.value = String(currentShapeSize.z);
    shapeSizeInputs.y.disabled = currentShape === 'circle';
    document.querySelector('#shapeSizeTitle')!.textContent = `Rozmiar: ${shapeNames[currentShape]}`;
    document.querySelector('#shapeSizeDescription')!.textContent = currentShape === 'sphere'
      ? 'Kula zostanie wypełniona osobnymi voxelami 1 × 1 × 1. Równe wymiary X/Y/Z dadzą kulę, a różne — ellipsoidę.'
      : currentShape === 'circle'
        ? 'Koło powstanie jako jedna pozioma warstwa osobnych voxeli na płaszczyźnie X/Z.'
      : isVoxelShape(currentShape)
        ? 'Kształt zostanie wygenerowany z osobnych voxeli 1 × 1 × 1, które możesz później niezależnie edytować.'
        : 'Podaj wymiary w komórkach siatki. Po zatwierdzeniu kliknij miejsce, w którym ma powstać obiekt.';
    shapePopover.hidden = true;
    shapeSizeModal.hidden = false;
    shapeSizeInputs.x.focus();
    shapeSizeInputs.x.select();
  });
});

function readSizeInput(input: HTMLInputElement, max: number): number {
  const value = Math.max(1, Math.min(max, Math.round(Number(input.value) || 1)));
  input.value = String(value);
  return value;
}

document.querySelector('#cancelShapeSize')!.addEventListener('click', () => {
  shapeSizeModal.hidden = true;
});
document.querySelector('#applyShapeSize')!.addEventListener('click', () => {
  currentShapeSize = {
    x: readSizeInput(shapeSizeInputs.x, MAX_SHAPE_SIZE),
    y: currentShape === 'circle' ? 1 : readSizeInput(shapeSizeInputs.y, MAX_SHAPE_SIZE),
    z: readSizeInput(shapeSizeInputs.z, MAX_SHAPE_SIZE),
  };
  shapeSizeModal.hidden = true;
  setTool('shape');
  showToast(`${shapeNames[currentShape]} ${currentShapeSize.x} × ${currentShapeSize.y} × ${currentShapeSize.z}: kliknij miejsce`);
});
shapeSizeModal.addEventListener('click', (event) => {
  if (event.target === shapeSizeModal) shapeSizeModal.hidden = true;
});
shapeSizeModal.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') (document.querySelector('#applyShapeSize') as HTMLButtonElement).click();
  if (event.key === 'Escape') shapeSizeModal.hidden = true;
});

document.querySelector('#applyResizeBtn')!.addEventListener('click', () => {
  if (!selectedPrimitiveId) return;
  const mesh = primitives.get(selectedPrimitiveId);
  if (!mesh) return;
  const size = {
    x: readSizeInput(document.querySelector('#selectedSizeX') as HTMLInputElement, MAX_SHAPE_SIZE),
    y: readSizeInput(document.querySelector('#selectedSizeY') as HTMLInputElement, MAX_SHAPE_SIZE),
    z: readSizeInput(document.querySelector('#selectedSizeZ') as HTMLInputElement, MAX_SHAPE_SIZE),
  };
  const logical = getLogicalPosition(mesh);
  mesh.unfreezeWorldMatrix();
  mesh.metadata.sizeX = size.x;
  mesh.metadata.sizeY = size.y;
  mesh.metadata.sizeZ = size.z;
  positionShape(mesh, mesh.metadata.kind as ShapeType, logical, size);
  if (mesh.metadata.kind !== 'billboard') mesh.freezeWorldMatrix();
  refreshPrimitivePaint(mesh);
  selectPrimitive(mesh, 'scale');
  pushHistory();
  updateStats();
  showToast('Rozmiar kształtu został zmieniony');
});
document.addEventListener('click', (event) => {
  if (!shapePopover.contains(event.target as Node)) shapePopover.hidden = true;
});

function setColor(color: string): void {
  currentColor = color.toLowerCase();
  const color3 = Color3.FromHexString(currentColor);
  previewMaterial.diffuseColor = color3;
  previewMaterial.emissiveColor = color3.scale(0.18);
  (document.querySelector('#currentSwatch') as HTMLElement).style.background = currentColor;
  document.querySelector('#colorValue')!.textContent = currentColor.toUpperCase();
  (document.querySelector('#customColor') as HTMLInputElement).value = currentColor;
  document.querySelectorAll<HTMLButtonElement>('.palette-color').forEach((swatch) => {
    swatch.classList.toggle('selected', swatch.dataset.color === currentColor);
  });
}

function activateColorBrush(color: string): void {
  texturePlacementPending = false;
  textureStampPending = false;
  refreshStampPreviewTexture();
  setColor(color);
  if (currentTexture) document.querySelector('#textureHelp')!.textContent = 'Pędzel koloru aktywny. Tekstura pozostaje bazą modelu.';
}

const palette = document.querySelector('#palette')!;
PALETTE.forEach((color) => {
  const button = document.createElement('button');
  button.className = 'palette-color';
  button.dataset.color = color;
  button.style.background = color;
  button.title = color.toUpperCase();
  button.setAttribute('aria-label', `Wybierz kolor ${color}`);
  button.innerHTML = `<span>${icon('check', 13)}</span>`;
  button.addEventListener('click', () => activateColorBrush(color));
  palette.append(button);
});
setColor(currentColor);

document.querySelector('#customColor')!.addEventListener('input', (event) => {
  activateColorBrush((event.target as HTMLInputElement).value);
});

function setCurrentTexture(
  textureData: string | null,
  name = '',
  pixels?: Uint8ClampedArray,
  pixelSize?: { width: number; height: number },
): void {
  currentTexture = textureData;
  if (pixels && pixelSize) {
    currentTexturePixels = pixels;
    currentTexturePixelSize = pixelSize;
  } else if (!textureData) {
    currentTexturePixels = null;
    currentTexturePixelSize = { width: 0, height: 0 };
  }
  const previewElement = document.querySelector('#texturePreview') as HTMLElement;
  const nameElement = document.querySelector('#textureName')!;
  const helpElement = document.querySelector('#textureHelp')!;
  const clearButton = document.querySelector('#clearTextureBtn') as HTMLButtonElement;
  if (textureData) {
    previewElement.classList.remove('empty');
    previewElement.innerHTML = '';
    previewElement.style.backgroundImage = `url("${textureData}")`;
    nameElement.textContent = name || 'Własna tekstura';
    helpElement.textContent = texturePlacementPending
      ? 'Kliknij obiekt, aby dopasować teksturę 1:1 do jego komórek.'
      : 'Tekstura jest bazą — możesz dalej malować po jej pikselach.';
    clearButton.hidden = false;
    (document.querySelector('#applyTextureAllBtn') as HTMLButtonElement).hidden = false;
  } else {
    texturePlacementPending = false;
    textureStampPending = false;
    previewElement.classList.add('empty');
    previewElement.style.backgroundImage = '';
    previewElement.innerHTML = icon('texture', 20);
    nameElement.textContent = 'Wgraj teksturę';
    helpElement.textContent = 'Wgraj obraz, a potem kliknij obiekt w trybie Maluj.';
    clearButton.hidden = true;
    (document.querySelector('#applyTextureAllBtn') as HTMLButtonElement).hidden = true;
  }
  refreshStampPreviewTexture();
}

const textureCropModal = document.querySelector('#textureCropModal') as HTMLElement;
const textureCropCanvas = document.querySelector('#textureCropCanvas') as HTMLCanvasElement;
const cropInputs = {
  x: document.querySelector('#cropX') as HTMLInputElement,
  y: document.querySelector('#cropY') as HTMLInputElement,
  width: document.querySelector('#cropWidth') as HTMLInputElement,
  height: document.querySelector('#cropHeight') as HTMLInputElement,
};
let cropTextureItem: TextureLibraryItem | null = null;
let cropBitmap: ImageBitmap | null = null;
let cropDragStart: { x: number; y: number } | null = null;
let cropSelection = { x: 0, y: 0, width: 1, height: 1 };
let cropOpenRequest = 0;

function renderTextureLibrary(): void {
  const container = document.querySelector('#textureLibrary') as HTMLElement;
  container.innerHTML = '';
  document.querySelector('#textureLibraryCount')!.textContent = String(textureLibrary.size);
  if (!textureLibrary.size) {
    const empty = document.createElement('div');
    empty.className = 'texture-library-empty';
    empty.textContent = 'Wgrane tekstury pojawią się tutaj i zapiszą się w pliku projektu.';
    container.append(empty);
    return;
  }
  textureLibrary.forEach((item) => {
    const button = document.createElement('button');
    button.className = 'texture-library-item';
    button.title = `${item.name} · ${item.width}×${item.height}`;
    const image = document.createElement('img');
    image.src = item.data;
    image.alt = '';
    const label = document.createElement('span');
    label.textContent = item.name;
    button.append(image, label);
    button.addEventListener('click', () => void openTextureCrop(item));
    container.append(button);
  });
}

function syncCropInputs(): void {
  cropInputs.x.value = String(cropSelection.x);
  cropInputs.y.value = String(cropSelection.y);
  cropInputs.width.value = String(cropSelection.width);
  cropInputs.height.value = String(cropSelection.height);
}

function normalizeCropSelection(selection = cropSelection): void {
  if (!cropTextureItem) return;
  const x = Math.max(0, Math.min(cropTextureItem.width - 1, Math.round(selection.x)));
  const y = Math.max(0, Math.min(cropTextureItem.height - 1, Math.round(selection.y)));
  cropSelection = {
    x,
    y,
    width: Math.max(1, Math.min(cropTextureItem.width - x, Math.round(selection.width))),
    height: Math.max(1, Math.min(cropTextureItem.height - y, Math.round(selection.height))),
  };
  syncCropInputs();
}

function drawTextureCrop(): void {
  if (!cropBitmap || !cropTextureItem) return;
  const context = textureCropCanvas.getContext('2d');
  if (!context) return;
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, textureCropCanvas.width, textureCropCanvas.height);
  context.drawImage(cropBitmap, 0, 0, textureCropCanvas.width, textureCropCanvas.height);
  context.fillStyle = 'rgba(22, 22, 20, .52)';
  const { x, y, width, height } = cropSelection;
  context.fillRect(0, 0, textureCropCanvas.width, y);
  context.fillRect(0, y + height, textureCropCanvas.width, textureCropCanvas.height - y - height);
  context.fillRect(0, y, x, height);
  context.fillRect(x + width, y, textureCropCanvas.width - x - width, height);
  context.strokeStyle = '#ffffff';
  context.lineWidth = Math.max(1, Math.min(textureCropCanvas.width, textureCropCanvas.height) / 160);
  context.setLineDash([4, 3]);
  context.strokeRect(x + 0.5, y + 0.5, Math.max(0, width - 1), Math.max(0, height - 1));
  context.setLineDash([]);
}

async function openTextureCrop(item: TextureLibraryItem): Promise<void> {
  const request = ++cropOpenRequest;
  cropBitmap?.close();
  const response = await fetch(item.data);
  const bitmap = await createImageBitmap(await response.blob());
  if (request !== cropOpenRequest) {
    bitmap.close();
    return;
  }
  cropTextureItem = item;
  cropBitmap = bitmap;
  textureCropCanvas.width = item.width;
  textureCropCanvas.height = item.height;
  cropSelection = { x: 0, y: 0, width: item.width, height: item.height };
  syncCropInputs();
  drawTextureCrop();
  document.querySelector('#textureCropTitle')!.textContent = `Wytnij: ${item.name}`;
  textureCropModal.hidden = false;
}

function closeTextureCrop(): void {
  cropOpenRequest += 1;
  textureCropModal.hidden = true;
  cropDragStart = null;
  cropBitmap?.close();
  cropBitmap = null;
  cropTextureItem = null;
}

function cropPointFromEvent(event: PointerEvent): { x: number; y: number } {
  const bounds = textureCropCanvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(textureCropCanvas.width - 1, Math.floor((event.clientX - bounds.left) * textureCropCanvas.width / bounds.width))),
    y: Math.max(0, Math.min(textureCropCanvas.height - 1, Math.floor((event.clientY - bounds.top) * textureCropCanvas.height / bounds.height))),
  };
}

textureCropCanvas.addEventListener('pointerdown', (event) => {
  cropDragStart = cropPointFromEvent(event);
  textureCropCanvas.setPointerCapture(event.pointerId);
  cropSelection = { ...cropDragStart, width: 1, height: 1 };
  syncCropInputs();
  drawTextureCrop();
});
textureCropCanvas.addEventListener('pointermove', (event) => {
  if (!cropDragStart) return;
  const point = cropPointFromEvent(event);
  cropSelection = {
    x: Math.min(cropDragStart.x, point.x),
    y: Math.min(cropDragStart.y, point.y),
    width: Math.abs(point.x - cropDragStart.x) + 1,
    height: Math.abs(point.y - cropDragStart.y) + 1,
  };
  syncCropInputs();
  drawTextureCrop();
});
textureCropCanvas.addEventListener('pointerup', () => { cropDragStart = null; });

Object.values(cropInputs).forEach((input) => {
  input.addEventListener('change', () => {
    normalizeCropSelection({
      x: Number(cropInputs.x.value),
      y: Number(cropInputs.y.value),
      width: Number(cropInputs.width.value),
      height: Number(cropInputs.height.value),
    });
    drawTextureCrop();
  });
});

async function ensureTextureAssetPixels(item: TextureLibraryItem): Promise<PixelTextureData> {
  if (item.pixels) return { pixels: item.pixels, width: item.width, height: item.height };
  const decoded = await decodeTexturePixels(item.data);
  item.pixels = decoded.pixels;
  item.width = decoded.width;
  item.height = decoded.height;
  return decoded;
}

async function useTextureCrop(mode: 'base' | 'stamp'): Promise<void> {
  if (!cropTextureItem) return;
  const item = cropTextureItem;
  normalizeCropSelection();
  const source = await ensureTextureAssetPixels(item);
  const pixels = new Uint8ClampedArray(cropSelection.width * cropSelection.height * 4);
  for (let row = 0; row < cropSelection.height; row += 1) {
    const sourceStart = ((cropSelection.y + row) * source.width + cropSelection.x) * 4;
    const sourceEnd = sourceStart + cropSelection.width * 4;
    pixels.set(source.pixels.subarray(sourceStart, sourceEnd), row * cropSelection.width * 4);
  }
  const output = document.createElement('canvas');
  output.width = cropSelection.width;
  output.height = cropSelection.height;
  output.getContext('2d')?.putImageData(new ImageData(pixels, output.width, output.height), 0, 0);
  const data = output.toDataURL('image/png');
  texturePlacementPending = mode === 'base';
  textureStampPending = mode === 'stamp';
  stampRotation = 0;
  setCurrentTexture(data, `${item.name} · wycinek ${output.width}×${output.height}`, pixels, { width: output.width, height: output.height });
  closeTextureCrop();
  setTool('paint');
  document.querySelector('#textureHelp')!.textContent = mode === 'stamp'
    ? 'Stempel aktywny: kliknij model. Przezroczyste piksele zostaną pominięte.'
    : 'Kliknij model, aby dopasować wycinek jako bazę tekstury.';
  showToast(mode === 'stamp' ? `Stempel ${output.width}×${output.height} gotowy` : 'Wycinek gotowy do nałożenia');
}

document.querySelector('#cancelTextureCrop')!.addEventListener('click', closeTextureCrop);
document.querySelector('#useTextureBase')!.addEventListener('click', () => void useTextureCrop('base'));
document.querySelector('#useTextureStamp')!.addEventListener('click', () => void useTextureCrop('stamp'));
textureCropModal.addEventListener('click', (event) => { if (event.target === textureCropModal) closeTextureCrop(); });

async function processTextureFile(file: File): Promise<void> {
  if (file.size > 8 * 1024 * 1024) {
    showToast('Tekstura może mieć maksymalnie 8 MB', true);
    return;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const textureCanvas = document.createElement('canvas');
    textureCanvas.width = Math.min(MAX_PAINT_TEXTURE_SIZE, bitmap.width);
    textureCanvas.height = Math.min(MAX_PAINT_TEXTURE_SIZE, bitmap.height);
    const context = textureCanvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas unavailable');
    context.imageSmoothingEnabled = false;
    context.drawImage(bitmap, 0, 0, textureCanvas.width, textureCanvas.height);
    bitmap.close();
    const pixels = context.getImageData(0, 0, textureCanvas.width, textureCanvas.height).data;
    const outputType = file.type === 'image/png' ? 'image/png' : file.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
    const dataUrl = textureCanvas.toDataURL(outputType, 0.9);
    let item = [...textureLibrary.values()].find((candidate) => candidate.data === dataUrl);
    if (!item) {
      item = {
        id: crypto.randomUUID(),
        name: file.name,
        data: dataUrl,
        width: textureCanvas.width,
        height: textureCanvas.height,
        pixels,
      };
      textureLibrary.set(item.id, item);
      setProjectDirty(true);
    }
    renderTextureLibrary();
    await openTextureCrop(item);
    showToast('Tekstura dodana do biblioteki projektu');
  } catch {
    showToast('Nie udało się odczytać tekstury', true);
  }
}

document.querySelector('#uploadTextureBtn')!.addEventListener('click', () => {
  (document.querySelector('#textureInput') as HTMLInputElement).click();
});
document.querySelector('#rotateStampBtn')!.addEventListener('click', rotateStamp);
document.querySelector('#textureInput')!.addEventListener('change', (event) => {
  const input = event.target as HTMLInputElement;
  if (input.files?.[0]) void processTextureFile(input.files[0]);
  input.value = '';
});
document.querySelector('#clearTextureBtn')!.addEventListener('click', () => {
  setCurrentTexture(null);
  setTool('paint');
  showToast('Usunięto zaimportowaną teksturę z pędzla');
});

function sampleTextureColor(position: Vector3): string | null {
  if (!currentTexturePixels || !currentTexturePixelSize.width) return null;
  const { minX, maxZ } = getCanvasBounds();
  const canvasX = Math.max(0, Math.min(canvasSettings.width - 1, Math.round(position.x - minX)));
  const canvasY = Math.max(0, Math.min(canvasSettings.depth - 1, Math.round(maxZ - position.z)));
  const pixelX = Math.round(canvasX * (currentTexturePixelSize.width - 1) / Math.max(1, canvasSettings.width - 1));
  const pixelY = Math.round(canvasY * (currentTexturePixelSize.height - 1) / Math.max(1, canvasSettings.depth - 1));
  const index = (pixelY * currentTexturePixelSize.width + pixelX) * 4;
  if (currentTexturePixels[index + 3] < 8) return '#000000';
  return `#${[currentTexturePixels[index], currentTexturePixels[index + 1], currentTexturePixels[index + 2]]
    .map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

document.querySelector('#applyTextureAllBtn')!.addEventListener('click', () => {
  if (!currentTexturePixels || !voxels.size) {
    showToast('Nie ma voxeli do teksturowania', true);
    return;
  }
  voxels.forEach((mesh) => {
    const sampledColor = sampleTextureColor(getLogicalPosition(mesh));
    if (!sampledColor) return;
    mesh.metadata.texture = undefined;
    mesh.metadata.color = sampledColor;
    mesh.material = getMaterial(sampledColor);
  });
  texturePlacementPending = false;
  document.querySelector('#textureHelp')!.textContent = 'Tekstura została dopasowana do voxeli. Możesz dalej malować kolorami.';
  pushHistory();
  showToast(`Tekstura została rozłożona 1:1 na ${voxels.size} voxelach`);
});

function allLogicalPositions(): Array<{ x: number; y: number; z: number }> {
  const primitiveBounds = serializePrimitives().flatMap((item) => [
    { x: item.x, y: item.y, z: item.z },
    { x: item.x + (item.sizeX ?? 1) - 1, y: item.y + (item.sizeY ?? 1) - 1, z: item.z + (item.sizeZ ?? 1) - 1 },
  ]);
  return [
    ...serializeVoxels().map(({ x, y, z }) => ({ x, y, z })),
    ...primitiveBounds,
  ];
}

function updateStats(): void {
  const data = allLogicalPositions();
  const voxelCount = voxels.size;
  const shapeCount = primitives.size;
  const parts: string[] = [];
  if (voxelCount) parts.push(`${voxelCount} ${voxelCount === 1 ? 'voxel' : voxelCount < 5 ? 'voxele' : 'voxeli'}`);
  if (shapeCount) parts.push(`${shapeCount} ${shapeCount === 1 ? 'kształt' : shapeCount < 5 ? 'kształty' : 'kształtów'}`);
  document.querySelector('#voxelCount')!.textContent = parts.join(' · ') || '0 elementów';
  const count = data.length;
  if (!count) {
    document.querySelector('#modelSize')!.textContent = '0 × 0 × 0';
    document.querySelector('#layerCount')!.textContent = '0';
    camera.lowerRadiusLimit = 4;
    return;
  }
  const xs = data.map((v) => v.x);
  const ys = data.map((v) => v.y);
  const zs = data.map((v) => v.z);
  const dimensions = `${Math.max(...xs) - Math.min(...xs) + 1} × ${Math.max(...ys) - Math.min(...ys) + 1} × ${Math.max(...zs) - Math.min(...zs) + 1}`;
  document.querySelector('#modelSize')!.textContent = dimensions;
  document.querySelector('#layerCount')!.textContent = String(new Set(ys).size);
  const modelDiagonal = Vector3.Distance(
    new Vector3(Math.min(...xs), Math.min(...ys), Math.min(...zs)),
    new Vector3(Math.max(...xs), Math.max(...ys), Math.max(...zs)),
  );
  camera.lowerRadiusLimit = Math.max(3, Math.min(12, modelDiagonal * 0.6 + 1));
  if (camera.radius < camera.lowerRadiusLimit) camera.radius = camera.lowerRadiusLimit;
}

function frameModel(): void {
  const data = allLogicalPositions();
  if (!data.length) {
    camera.setTarget(new Vector3(0, 1.2, 0));
    camera.radius = 18;
    return;
  }
  const min = new Vector3(Math.min(...data.map((v) => v.x)), Math.min(...data.map((v) => v.y)), Math.min(...data.map((v) => v.z)));
  const max = new Vector3(Math.max(...data.map((v) => v.x)), Math.max(...data.map((v) => v.y)), Math.max(...data.map((v) => v.z)));
  const center = min.add(max).scale(0.5);
  camera.setTarget(center);
  camera.radius = Math.max(8, Vector3.Distance(min, max) * 2.1 + 4);
}

function setProjectDirty(dirty: boolean): void {
  projectDirty = dirty;
  const saveState = document.querySelector('#saveState')!;
  saveState.textContent = dirty ? 'Niezapisane zmiany' : 'Projekt zapisany';
  saveState.classList.toggle('dirty', dirty);
}

function projectSlug(): string {
  const name = (document.querySelector('#projectName') as HTMLInputElement).value.trim() || 'moj-model';
  return name.toLowerCase().replace(/[^a-z0-9ąćęłńóśźż]+/gi, '-').replace(/^-|-$/g, '') || 'model';
}

function downloadBlob(content: BlobPart, fileName: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportModel(format: ExportFormat): Promise<void> {
  const meshes = [...voxels.values(), ...primitives.values()];
  if (!meshes.length && format !== 'json') {
    showToast('Dodaj przynajmniej jeden obiekt', true);
    return;
  }
  const name = projectSlug();
  const exportButton = document.querySelector('#exportBtn') as HTMLButtonElement;
  exportButton.disabled = true;
  exportButton.classList.add('loading');
  try {
    if (format === 'json') {
      const projectName = (document.querySelector('#projectName') as HTMLInputElement).value.trim() || 'Mój model';
      const payload = { format: 'cubeling', version: 6, name: projectName, canvas: canvasSettings, ...packProject(serializeProject()) };
      downloadBlob(JSON.stringify(payload, null, 2), `${name}.cubeling.json`, 'application/json');
      setProjectDirty(false);
    } else if (format === 'glb') {
      const data = await GLTF2Export.GLBAsync(scene, name, { shouldExportNode: (node) => Boolean(node.metadata?.isModel) });
      data.downloadFiles();
    } else if (format === 'gltf') {
      const data = await GLTF2Export.GLTFAsync(scene, name, { shouldExportNode: (node) => Boolean(node.metadata?.isModel) });
      data.downloadFiles();
    } else if (format === 'obj') {
      const data = OBJExport.OBJ(meshes, false, undefined, true);
      downloadBlob(data, `${name}.obj`, 'text/plain');
    } else {
      const exportMeshes = meshes.map((mesh, index) => {
        const clone = mesh.clone(`stl-export-${index}`);
        clone.billboardMode = Mesh.BILLBOARDMODE_NONE;
        clone.bakeCurrentTransformIntoVertices();
        return clone;
      });
      const data = STLExport.CreateSTL(exportMeshes, false, name, false, true, true) as string;
      downloadBlob(data, `${name}.stl`, 'model/stl');
      exportMeshes.forEach((mesh) => mesh.dispose());
    }
    showToast(`Eksport ${format.toUpperCase()} gotowy`);
  } catch (error) {
    console.error(error);
    showToast(`Nie udało się wyeksportować ${format.toUpperCase()}`, true);
  } finally {
    exportButton.disabled = false;
    exportButton.classList.remove('loading');
  }
}

function importProject(file: File): void {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result)) as {
        name?: string;
        canvas?: CanvasSettings;
        textures?: string[];
        voxels?: PackedVoxelData[];
        primitives?: PackedPrimitiveData[];
        textureLibrary?: PackedTextureLibraryItem[];
      };
      const validTexture = (texture?: string) => texture === undefined || /^data:image\/(png|jpeg|webp);base64,/i.test(texture);
      const validPosition = (item: { x: number; y: number; z: number; color: string; texture?: string }) => Number.isInteger(item.x)
        && Number.isInteger(item.y) && Number.isInteger(item.z) && /^#[0-9a-f]{6}$/i.test(item.color) && validTexture(item.texture);
      const validShapes: ShapeType[] = ['box', 'pyramid', 'circle', 'square', 'plane', 'billboard'];
      if (parsed.textures && (!Array.isArray(parsed.textures) || !parsed.textures.every((texture) => validTexture(texture)))) {
        throw new Error('Nieprawidłowa biblioteka tekstur');
      }
      const importedLibrary = Array.isArray(parsed.textureLibrary) ? parsed.textureLibrary : [];
      if (!importedLibrary.every((item) => typeof item.id === 'string' && typeof item.name === 'string'
        && Number.isInteger(item.textureId) && Number.isInteger(item.width) && item.width > 0 && item.width <= 512
        && Number.isInteger(item.height) && item.height > 0 && item.height <= 512)) {
        throw new Error('Nieprawidłowe pliki w bibliotece tekstur');
      }
      if (!Array.isArray(parsed.voxels) || !parsed.voxels.every((item) => validPosition(item)
        && (item.textureId === undefined || Number.isInteger(item.textureId)))) {
        throw new Error('Nieprawidłowy format');
      }
      const importedPrimitives = Array.isArray(parsed.primitives) ? parsed.primitives : [];
      if (!importedPrimitives.every((item) => validPosition(item) && validShapes.includes(item.type)
        && (item.sizeX === undefined || Number.isInteger(item.sizeX) && item.sizeX > 0)
        && (item.sizeY === undefined || Number.isInteger(item.sizeY) && item.sizeY > 0)
        && (item.sizeZ === undefined || Number.isInteger(item.sizeZ) && item.sizeZ > 0)
        && (item.paint === undefined || Array.isArray(item.paint) && item.paint.every((cell) => Number.isInteger(cell.face)
          && cell.face >= 0 && cell.face < 6 && Number.isInteger(cell.u) && cell.u >= 0
          && Number.isInteger(cell.v) && cell.v >= 0 && /^#[0-9a-f]{6}$/i.test(cell.color)))
        && (item.textureId === undefined || Number.isInteger(item.textureId)))) throw new Error('Nieprawidłowe kształty');
      const project = unpackProject({ ...parsed, primitives: importedPrimitives.map((item) => ({ ...item, id: item.id || crypto.randomUUID() })) });
      const library = unpackTextureLibrary(Array.isArray(parsed.textures) ? parsed.textures : [], importedLibrary);
      const importedCanvas = parsed.canvas && isValidCanvasSettings(parsed.canvas) ? parsed.canvas : canvasSettings;
      if (parsed.canvas && isValidCanvasSettings(parsed.canvas)) {
        canvasSettings = { ...importedCanvas };
        canvasConfigured = true;
        applyCanvasVisuals(true);
      }
      loadProject(project);
      textureLibrary.clear();
      library.forEach((item) => textureLibrary.set(item.id, item));
      setCurrentTexture(null);
      renderTextureLibrary();
      if (parsed.name) {
        (document.querySelector('#projectName') as HTMLInputElement).value = parsed.name.slice(0, 48);
        document.querySelector('#modelNameDisplay')!.textContent = parsed.name.slice(0, 48);
      }
      history = [serializeProject()];
      historyIndex = 0;
      updateHistoryButtons();
      frameModel();
      setProjectDirty(false);
      showToast('Projekt zaimportowany');
    } catch {
      showToast('Nie udało się otworzyć tego pliku', true);
    }
  };
  reader.readAsText(file);
}

function showToast(message: string, error = false): void {
  const toast = document.querySelector('#toast')!;
  document.querySelector('#toastText')!.textContent = message;
  toast.classList.toggle('error', error);
  toast.classList.add('visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 2600);
}

function isValidCanvasSettings(settings: CanvasSettings): boolean {
  return Number.isInteger(settings.width) && settings.width >= 8 && settings.width <= 256
    && Number.isInteger(settings.depth) && settings.depth >= 8 && settings.depth <= 256
    && Number.isInteger(settings.height) && settings.height >= 8 && settings.height <= 256;
}

const setupModal = document.querySelector('#setupModal') as HTMLElement;
const canvasInputs = {
  width: document.querySelector('#canvasWidth') as HTMLInputElement,
  depth: document.querySelector('#canvasDepth') as HTMLInputElement,
  height: document.querySelector('#canvasHeight') as HTMLInputElement,
};

function openCanvasSetup(canCancel: boolean): void {
  canvasInputs.width.value = String(canvasSettings.width);
  canvasInputs.depth.value = String(canvasSettings.depth);
  canvasInputs.height.value = String(canvasSettings.height);
  (document.querySelector('#cancelCanvasSettings') as HTMLButtonElement).hidden = !canCancel;
  document.querySelector('#applyCanvasSettings')!.textContent = canCancel ? 'Zastosuj rozmiar' : 'Utwórz canvas';
  setupModal.hidden = false;
}

document.querySelectorAll<HTMLButtonElement>('[data-canvas-preset]').forEach((button) => {
  button.addEventListener('click', () => {
    const size = Number(button.dataset.canvasPreset);
    canvasInputs.width.value = String(size);
    canvasInputs.depth.value = String(size);
    canvasInputs.height.value = String(size);
    document.querySelectorAll<HTMLButtonElement>('[data-canvas-preset]').forEach((item) => item.classList.toggle('active', item === button));
  });
});
document.querySelector('#openCanvasSettings')!.addEventListener('click', () => openCanvasSetup(true));
document.querySelector('#cancelCanvasSettings')!.addEventListener('click', () => { setupModal.hidden = true; });
document.querySelector('#applyCanvasSettings')!.addEventListener('click', () => {
  const next: CanvasSettings = {
    width: Math.round(Number(canvasInputs.width.value)),
    depth: Math.round(Number(canvasInputs.depth.value)),
    height: Math.round(Number(canvasInputs.height.value)),
  };
  if (!isValidCanvasSettings(next)) {
    showToast('Rozmiar canvasu musi mieścić się w zakresie 8–256', true);
    return;
  }
  canvasSettings = next;
  canvasConfigured = true;
  setupModal.hidden = true;
  if (currentTexture) setCurrentTexture(null);
  applyCanvasVisuals(true);
  setProjectDirty(true);
  showToast(`Canvas ${next.width} × ${next.depth} jest gotowy`);
});

document.querySelector('#undoBtn')!.addEventListener('click', undo);
document.querySelector('#redoBtn')!.addEventListener('click', redo);
document.querySelector('#focusBtn')!.addEventListener('click', frameModel);
const exportMenu = document.querySelector('#exportMenu') as HTMLElement;
const exportButton = document.querySelector('#exportBtn') as HTMLButtonElement;
exportButton.addEventListener('click', (event) => {
  event.stopPropagation();
  exportMenu.hidden = !exportMenu.hidden;
  exportButton.setAttribute('aria-expanded', String(!exportMenu.hidden));
});
document.querySelectorAll<HTMLButtonElement>('[data-format]').forEach((button) => {
  button.addEventListener('click', () => {
    exportMenu.hidden = true;
    exportButton.setAttribute('aria-expanded', 'false');
    void exportModel(button.dataset.format as ExportFormat);
  });
});
document.addEventListener('click', (event) => {
  if (!exportMenu.contains(event.target as Node)) {
    exportMenu.hidden = true;
    exportButton.setAttribute('aria-expanded', 'false');
  }
});
document.querySelector('#importBtn')!.addEventListener('click', () => (document.querySelector('#fileInput') as HTMLInputElement).click());
document.querySelector('#fileInput')!.addEventListener('change', (event) => {
  const input = event.target as HTMLInputElement;
  if (input.files?.[0]) importProject(input.files[0]);
  input.value = '';
});

const modal = document.querySelector('#confirmModal') as HTMLElement;
document.querySelector('#clearBtn')!.addEventListener('click', () => { modal.hidden = false; });
document.querySelector('#cancelClear')!.addEventListener('click', () => { modal.hidden = true; });
document.querySelector('#confirmClear')!.addEventListener('click', () => {
  modal.hidden = true;
  loadProject({ voxels: [], primitives: [] });
  pushHistory();
  showToast('Scena została wyczyszczona');
});
modal.addEventListener('click', (event) => { if (event.target === modal) modal.hidden = true; });

document.querySelector('#dismissHint')!.addEventListener('click', () => {
  document.querySelector('#hint')!.classList.add('hidden');
  localStorage.setItem('cubeling-hint-dismissed', 'true');
});
if (localStorage.getItem('cubeling-hint-dismissed')) document.querySelector('#hint')!.classList.add('hidden');

const projectNameInput = document.querySelector('#projectName') as HTMLInputElement;
projectNameInput.addEventListener('input', () => {
  document.querySelector('#modelNameDisplay')!.textContent = projectNameInput.value || 'Bez nazwy';
  setProjectDirty(true);
});

window.addEventListener('beforeunload', (event) => {
  if (!projectDirty) return;
  event.preventDefault();
  event.returnValue = '';
});

window.addEventListener('keydown', (event) => {
  const isTyping = document.activeElement instanceof HTMLInputElement;
  const isButtonFocused = document.activeElement instanceof HTMLButtonElement;
  if (event.key === 'Escape') {
    shapePopover.hidden = true;
    shapeSizeModal.hidden = true;
    closeTextureCrop();
    exportMenu.hidden = true;
    exportButton.setAttribute('aria-expanded', 'false');
    modal.hidden = true;
    setupModal.hidden = true;
    clearSelection();
    return;
  }
  if (!isTyping && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
    event.preventDefault();
    copySelectedPrimitive();
    return;
  }
  if (!isTyping && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
    event.preventDefault();
    pastePrimitive();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    if (event.shiftKey) redo(); else undo();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
    event.preventDefault();
    redo();
    return;
  }
  if (isTyping) return;
  const modalOpen = !shapeSizeModal.hidden || !textureCropModal.hidden || !modal.hidden || !setupModal.hidden;
  if (!isButtonFocused && !modalOpen && event.code === 'Space' && textureStampPending) {
    event.preventDefault();
    if (!event.repeat) rotateStamp();
    return;
  }
  const key = event.key.toLowerCase();
  if (key === 'v') setTool('select');
  if (key === 'b') setTool('add');
  if (key === 'e') setTool('erase');
  if (key === 'p') setTool('paint');
  if (key === 'i') setTool('eyedropper');
  if (key === 't') {
    setTool('paint');
    (document.querySelector('#textureInput') as HTMLInputElement).click();
  }
  if (key === 'f') frameModel();
});

function initializeProject(): void {
  history = [serializeProject()];
  historyIndex = 0;
  updateHistoryButtons();
  updateStats();
  projectDirty = false;
}

initializeProject();
document.querySelector<HTMLButtonElement>('[data-shape="box"]')?.classList.add('selected');
setCurrentTexture(null);
renderTextureLibrary();
setTool('add');
if (!canvasConfigured) openCanvasSetup(false);
engine.runRenderLoop(() => scene.render());
window.addEventListener('resize', () => engine.resize());
