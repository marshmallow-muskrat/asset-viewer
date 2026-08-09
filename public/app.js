import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

const ui = {
  assetList: document.querySelector('#assetList'),
  chooseFolder: document.querySelector('#chooseFolder'),
  chooseFolderEmpty: document.querySelector('#chooseFolderEmpty'),
  emptyState: document.querySelector('#emptyState'),
  emptyHeading: document.querySelector('#emptyState h2'),
  emptyDescription: document.querySelector('.empty-description'),
  folderInput: document.querySelector('#folderInput'),
  folderStatus: document.querySelector('#folderStatus'),
  folderStatusText: document.querySelector('#folderStatusText'),
  gridView: document.querySelector('#gridView'),
  healthFilter: document.querySelector('#healthFilter'),
  installApp: document.querySelector('#installApp'),
  listView: document.querySelector('#listView'),
  loadingState: document.querySelector('#loadingState'),
  loadingLabel: document.querySelector('#loadingLabel'),
  packFilter: document.querySelector('#packFilter'),
  previewBadge: document.querySelector('#previewBadge'),
  previewFormat: document.querySelector('#previewFormat'),
  refreshAssets: document.querySelector('#refreshAssets'),
  resetView: document.querySelector('#resetView'),
  resultsLabel: document.querySelector('#resultsLabel'),
  searchInput: document.querySelector('#searchInput'),
  selectedName: document.querySelector('#selectedName'),
  selectedPath: document.querySelector('#selectedPath'),
  selectedSection: document.querySelector('#selectedSection'),
  sourceLabel: document.querySelector('#sourceLabel'),
  spinToggle: document.querySelector('#spinToggle'),
  viewport: document.querySelector('#viewport'),
  viewportShell: document.querySelector('#viewportShell'),
  dropOverlay: document.querySelector('#dropOverlay'),
  detailsToggle: document.querySelector('#detailsToggle'),
  fullscreenToggle: document.querySelector('#fullscreenToggle'),
  inspectorPanel: document.querySelector('#inspectorPanel'),
  closeInspector: document.querySelector('#closeInspector'),
  inspectorPreview: document.querySelector('#inspectorPreview'),
  detailName: document.querySelector('#detailName'),
  detailLocation: document.querySelector('#detailLocation'),
  detailStatus: document.querySelector('#detailStatus'),
  detailFormat: document.querySelector('#detailFormat'),
  detailSize: document.querySelector('#detailSize'),
  detailMeshes: document.querySelector('#detailMeshes'),
  detailTriangles: document.querySelector('#detailTriangles'),
  detailMaterials: document.querySelector('#detailMaterials'),
  detailPath: document.querySelector('#detailPath'),
  detailNote: document.querySelector('#detailNote'),
  favoriteToggle: document.querySelector('#favoriteToggle'),
  copyPath: document.querySelector('#copyPath'),
  convertAsset: document.querySelector('#convertAsset'),
};

const state = {
  assets: [],
  filteredAssets: [],
  selectedId: null,
  selectedAsset: null,
  loadToken: 0,
  autoSpin: false,
  modelRadius: 1,
  sourceMode: 'none',
  uploadedFiles: new Map(),
  objectUrls: new Map(),
  uploadedFolderName: '',
  assetHealth: new Map(),
  favorites: new Set(),
  metrics: new Map(),
  thumbnails: new Map(),
  viewMode: 'grid',
  detailsOpen: false,
  blenderAvailable: false,
};

const PREFERENCES_KEY = 'asset-shelf:preferences';

function readPreferences() {
  try {
    const value = JSON.parse(window.localStorage.getItem(PREFERENCES_KEY) || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

const preferences = readPreferences();
state.favorites = new Set(Array.isArray(preferences.favorites) ? preferences.favorites : []);
state.viewMode = preferences.viewMode === 'list' ? 'list' : 'grid';
state.autoSpin = preferences.autoSpin === true;

function savePreferences(extra = {}) {
  try {
    window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify({
      ...preferences,
      ...extra,
      autoSpin: state.autoSpin,
      viewMode: state.viewMode,
      favorites: [...state.favorites],
    }));
  } catch {
    // Local preferences are an enhancement, not a requirement for viewing.
  }
}

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0a121d');

const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 1000);
camera.position.set(4.8, 3.1, 5.4);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
ui.viewport.appendChild(renderer.domElement);

let thumbnailRenderer = null;
let thumbnailScene = null;
let thumbnailCamera = null;

function ensureThumbnailRenderer() {
  if (thumbnailRenderer) {
    return true;
  }

  try {
    thumbnailRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    thumbnailRenderer.setPixelRatio(1);
    thumbnailRenderer.setSize(320, 180, false);
    thumbnailRenderer.outputColorSpace = THREE.SRGBColorSpace;
    thumbnailRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    thumbnailRenderer.toneMappingExposure = 1.2;
    thumbnailScene = new THREE.Scene();
    thumbnailScene.background = new THREE.Color('#252a30');
    thumbnailCamera = new THREE.PerspectiveCamera(35, 16 / 9, 0.01, 1000);
    thumbnailScene.add(new THREE.HemisphereLight(0xf2f5f7, 0x20252b, 2.1));
    const thumbnailKey = new THREE.DirectionalLight(0xffffff, 3.4);
    thumbnailKey.position.set(4, 7, 5);
    thumbnailScene.add(thumbnailKey);
    const thumbnailRim = new THREE.DirectionalLight(0xa8e6cf, 1.8);
    thumbnailRim.position.set(-4, 2, -4);
    thumbnailScene.add(thumbnailRim);
    return true;
  } catch {
    thumbnailRenderer = null;
    return false;
  }
}

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.enablePan = true;
controls.minDistance = 0.08;
controls.maxDistance = 100;
controls.autoRotateSpeed = 1.3;
controls.screenSpacePanning = true;

const modelGroup = new THREE.Group();
scene.add(modelGroup);

const stage = new THREE.Mesh(
  new THREE.CircleGeometry(5.5, 80),
  new THREE.MeshBasicMaterial({
    color: 0x142535,
    opacity: 0.42,
    transparent: true,
  }),
);
stage.rotation.x = -Math.PI / 2;
stage.position.y = -1.65;
scene.add(stage);

const stageGlow = new THREE.Mesh(
  new THREE.CircleGeometry(4.3, 80),
  new THREE.MeshBasicMaterial({
    color: 0x25425a,
    opacity: 0.15,
    transparent: true,
  }),
);
stageGlow.rotation.x = -Math.PI / 2;
stageGlow.position.y = -1.64;
scene.add(stageGlow);

const grid = new THREE.GridHelper(11, 22, 0x345064, 0x1d3141);
grid.position.y = -1.63;
grid.material.transparent = true;
grid.material.opacity = 0.23;
scene.add(grid);

const hemisphereLight = new THREE.HemisphereLight(0xb9e8ff, 0x111b27, 1.9);
scene.add(hemisphereLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
keyLight.position.set(4.5, 7, 5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
keyLight.shadow.camera.near = 0.1;
keyLight.shadow.camera.far = 30;
keyLight.shadow.bias = -0.0005;
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0x6d9dff, 2.2);
rimLight.position.set(-5, 3, -5);
scene.add(rimLight);

const fillLight = new THREE.PointLight(0x6de5ff, 1.3, 14);
fillLight.position.set(0, 2.5, 2.4);
scene.add(fillLight);

const gltfLoader = new GLTFLoader();
const objLoader = new OBJLoader();
const mtlLoader = new MTLLoader();
const fbxLoader = new FBXLoader();

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '—';
  }
  if (bytes < 1024 * 1024) {
    return Math.round(bytes / 1024) + ' KB';
  }
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function normalizePath(value) {
  return String(value || '')
    .replaceAll('\\', '/')
    .split('/')
    .filter((segment) => segment && segment !== '.')
    .join('/');
}

function lowerPath(value) {
  return normalizePath(value).toLowerCase();
}

function pathSegments(value) {
  const normalized = normalizePath(value);
  return normalized ? normalized.split('/') : [];
}

function pathBasename(value) {
  const segments = pathSegments(value);
  return segments[segments.length - 1] || '';
}

function pathDirname(value) {
  const segments = pathSegments(value);
  segments.pop();
  return segments.join('/');
}

function pathStem(value) {
  return pathBasename(value).replace(/\.[^.]+$/, '');
}

function pathExtension(value) {
  const match = pathBasename(value).match(/(\.[^.]+)$/);
  return match ? match[1].toLowerCase() : '';
}

function joinPathParts(...parts) {
  return normalizePath(parts.filter(Boolean).join('/'));
}

function getDisplayLocation(asset) {
  const location = asset.location || asset.section || '';
  return normalizePath(location).replaceAll('/', ' / ');
}

function getAssetSearchText(asset) {
  return [
    asset.name,
    asset.pack,
    asset.section,
    asset.location,
    asset.blendPath,
    asset.previewPath,
    asset.previewLabel,
    asset.previewKind,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function getAssetKey(asset) {
  return lowerPath([
    asset.source || 'asset',
    asset.blendPath || asset.previewPath || asset.name,
  ].join(':'));
}

function isFavorite(asset) {
  return Boolean(asset && state.favorites.has(getAssetKey(asset)));
}

function getAssetHealth(asset) {
  if (!asset) {
    return 'attention';
  }
  const key = getAssetKey(asset);
  if (state.assetHealth.has(key)) {
    return state.assetHealth.get(key);
  }
  return asset.previewKind === 'none' ? 'attention' : 'ready';
}

function setAssetHealth(asset, health) {
  if (asset) {
    state.assetHealth.set(getAssetKey(asset), health);
  }
}

function formatCount(value) {
  return Number.isFinite(value) ? value.toLocaleString() : '—';
}

function getModelMetrics(root) {
  let meshes = 0;
  let triangles = 0;
  const materials = new Set();
  let animations = 0;

  root.traverse?.((object) => {
    if (!object.isMesh) {
      return;
    }
    meshes += 1;
    const geometry = object.geometry;
    if (geometry?.index) {
      triangles += Math.floor(geometry.index.count / 3);
    } else if (geometry?.attributes?.position) {
      triangles += Math.floor(geometry.attributes.position.count / 3);
    }
    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
    objectMaterials.filter(Boolean).forEach((material) => materials.add(material));
  });

  animations = Array.isArray(root.animations) ? root.animations.length : 0;
  return { meshes, triangles, materials: materials.size, animations };
}

function captureThumbnail(root, asset) {
  if (!asset || state.thumbnails.has(getAssetKey(asset)) || !ensureThumbnailRenderer()) {
    return;
  }

  const clone = root.clone(true);
  const box = new THREE.Box3().setFromObject(clone);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z, 0.0001);
  clone.position.sub(center);
  clone.scale.multiplyScalar(2.55 / maxDimension);
  thumbnailScene.add(clone);

  const framedBox = new THREE.Box3().setFromObject(clone);
  const sphere = framedBox.getBoundingSphere(new THREE.Sphere());
  const distance = Math.max(sphere.radius * 3.25, 2.8);
  thumbnailCamera.position.set(distance * 1.05, distance * 0.62, distance * 1.18);
  thumbnailCamera.near = Math.max(0.01, sphere.radius / 100);
  thumbnailCamera.far = Math.max(100, sphere.radius * 100);
  thumbnailCamera.lookAt(0, 0, 0);
  thumbnailCamera.updateProjectionMatrix();
  thumbnailRenderer.render(thumbnailScene, thumbnailCamera);

  try {
    state.thumbnails.set(getAssetKey(asset), thumbnailRenderer.domElement.toDataURL('image/jpeg', 0.76));
  } catch {
    // A thumbnail is optional; the model remains fully viewable without one.
  }
  thumbnailScene.remove(clone);
  renderAssetList();
  updateInspector(asset);
}

function setEmptyState(heading, description) {
  ui.emptyHeading.textContent = heading;
  ui.emptyDescription.textContent = description;
}

function setLoading(isLoading, label = 'Loading preview…') {
  ui.loadingState.hidden = !isLoading;
  ui.loadingLabel.textContent = label;
}

function releaseObjectUrls() {
  state.objectUrls.forEach((url) => URL.revokeObjectURL(url));
  state.objectUrls.clear();
}

function clearModel() {
  while (modelGroup.children.length > 0) {
    const child = modelGroup.children[modelGroup.children.length - 1];
    modelGroup.remove(child);
    child.traverse?.((object) => {
      if (object.geometry) {
        object.geometry.dispose();
      }
      if (object.material) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => {
          if (material.map) {
            material.map.dispose();
          }
          material.dispose();
        });
      }
    });
  }
  modelGroup.rotation.set(0, 0, 0);
}

function setSurfaceDefaults(root) {
  root.traverse((object) => {
    if (!object.isMesh) {
      return;
    }

    object.castShadow = true;
    object.receiveShadow = true;

    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      if (!material) {
        return;
      }
      if (material.map) {
        material.map.colorSpace = THREE.SRGBColorSpace;
      }
      if ('roughness' in material && material.roughness > 0.95) {
        material.roughness = 0.82;
      }
    });
  });
}

function frameModel(root) {
  const initialBox = new THREE.Box3().setFromObject(root);
  const center = initialBox.getCenter(new THREE.Vector3());
  const size = initialBox.getSize(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z, 0.0001);

  root.position.sub(center);
  root.scale.setScalar(3.25 / maxDimension);

  const finalBox = new THREE.Box3().setFromObject(root);
  const sphere = finalBox.getBoundingSphere(new THREE.Sphere());
  state.modelRadius = Math.max(sphere.radius, 0.1);
  stage.position.y = -state.modelRadius * 0.98;
  stageGlow.position.y = stage.position.y + 0.01;
  grid.position.y = stage.position.y + 0.02;

  resetCamera();
}

function resetCamera() {
  const distance = Math.max(state.modelRadius * 2.2, 1.9);
  camera.position.set(distance * 1.05, distance * 0.66, distance * 1.22);
  camera.near = Math.max(0.01, state.modelRadius / 100);
  camera.far = Math.max(100, state.modelRadius * 100);
  camera.updateProjectionMatrix();
  controls.target.set(0, 0, 0);
  controls.update();
}

function getUploadedFileUrl(relativePath) {
  const key = lowerPath(relativePath);
  const entry = state.uploadedFiles.get(key);
  if (!entry) {
    return null;
  }

  if (!state.objectUrls.has(key)) {
    state.objectUrls.set(key, URL.createObjectURL(entry.file));
  }
  return state.objectUrls.get(key);
}

function getAssetFileUrl(asset, kind) {
  if (asset.source === 'upload') {
    return getUploadedFileUrl(asset[kind + 'Path']);
  }
  return asset[kind + 'Url'] || null;
}

function findRelatedUploadedPath(requestedUrl, asset) {
  let decodedUrl = requestedUrl;
  try {
    decodedUrl = decodeURIComponent(requestedUrl);
  } catch {
    // Keep the original URL when it contains malformed escape sequences.
  }

  const requestedName = pathBasename(decodedUrl.split('?')[0].split('#')[0]).toLowerCase();
  if (!requestedName) {
    return null;
  }

  const groupRoot = lowerPath(asset.groupRoot);
  const previewDirectory = lowerPath(pathDirname(asset.previewPath));
  const objDirectory = lowerPath(pathDirname(asset.objPath));
  const candidates = [];

  state.uploadedFiles.forEach((entry) => {
    const candidatePath = lowerPath(entry.path);
    if (pathBasename(candidatePath).toLowerCase() !== requestedName) {
      return;
    }

    let score = 0;
    if (groupRoot && candidatePath.startsWith(groupRoot + '/')) {
      score += 100;
    }
    if (previewDirectory && candidatePath.startsWith(previewDirectory + '/')) {
      score += 40;
    }
    if (objDirectory && candidatePath.startsWith(objDirectory + '/')) {
      score += 35;
    }
    if (candidatePath.includes('/textures/') || candidatePath.includes('/texture/')) {
      score += 10;
    }
    candidates.push({ path: entry.path, score });
  });

  candidates.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  return candidates[0]?.path || null;
}

function createUploadLoadingManager(asset) {
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((requestedUrl) => {
    const relatedPath = findRelatedUploadedPath(requestedUrl, asset);
    return relatedPath ? getUploadedFileUrl(relatedPath) : requestedUrl;
  });
  return manager;
}

function createAssetLoaders(asset) {
  if (asset.source !== 'upload') {
    return {
      gltf: gltfLoader,
      obj: objLoader,
      mtl: mtlLoader,
      fbx: fbxLoader,
    };
  }

  const manager = createUploadLoadingManager(asset);
  return {
    gltf: new GLTFLoader(manager),
    obj: new OBJLoader(manager),
    mtl: new MTLLoader(manager),
    fbx: new FBXLoader(manager),
  };
}

function onModelLoaded(root, asset, token, sourceLabel) {
  if (token !== state.loadToken) {
    return;
  }

  clearModel();
  setSurfaceDefaults(root);
  modelGroup.add(root);
  frameModel(root);
  state.metrics.set(getAssetKey(asset), getModelMetrics(root));
  setAssetHealth(asset, 'ready');
  ui.emptyState.hidden = true;
  ui.resetView.disabled = false;
  ui.spinToggle.disabled = false;
  ui.previewBadge.textContent = sourceLabel + ' preview';
  ui.previewFormat.textContent = sourceLabel;
  setLoading(false);
  updateInspector(asset);
  captureThumbnail(root, asset);
  renderAssetList();
}

function showLoadError(asset, token) {
  if (token !== state.loadToken) {
    return;
  }

  clearModel();
  setAssetHealth(asset, 'attention');
  setEmptyState(
    'Preview unavailable',
    asset.name + ' has a source file, but no browser-readable preview could be loaded.',
  );
  ui.emptyState.hidden = false;
  ui.resetView.disabled = true;
  ui.spinToggle.disabled = true;
  ui.previewBadge.textContent = 'No preview';
  ui.previewFormat.textContent = '—';
  setLoading(false);
  updateInspector(asset);
  renderAssetList();
}

function loadFbx(asset, token, loaders = createAssetLoaders(asset)) {
  const url = getAssetFileUrl(asset, 'fbx');
  if (token !== state.loadToken || !url) {
    showLoadError(asset, token);
    return;
  }

  setLoading(true, 'Loading FBX preview…');
  loaders.fbx.load(
    url,
    (object) => onModelLoaded(object, asset, token, 'FBX'),
    undefined,
    () => showLoadError(asset, token),
  );
}

function loadObject(asset, token, errorMessage = '', loaders = createAssetLoaders(asset)) {
  const objUrl = getAssetFileUrl(asset, 'obj');
  if (token !== state.loadToken || !objUrl) {
    if (getAssetFileUrl(asset, 'fbx')) {
      loadFbx(asset, token, loaders);
    } else {
      showLoadError(asset, token);
    }
    return;
  }

  setLoading(true, errorMessage ? 'Trying OBJ fallback…' : 'Loading OBJ preview…');
  const loadObj = () => {
    loaders.obj.load(
      objUrl,
      (object) => onModelLoaded(object, asset, token, 'OBJ'),
      undefined,
      () => {
        if (getAssetFileUrl(asset, 'fbx')) {
          loadFbx(asset, token, loaders);
        } else {
          showLoadError(asset, token);
        }
      },
    );
  };

  const mtlUrl = getAssetFileUrl(asset, 'mtl');
  if (!mtlUrl) {
    loadObj();
    return;
  }

  loaders.mtl.load(
    mtlUrl,
    (materials) => {
      materials.preload();
      loaders.obj.setMaterials(materials);
      loadObj();
    },
    undefined,
    loadObj,
  );
}

function loadGltf(asset, token) {
  const url = getAssetFileUrl(asset, 'preview');
  if (token !== state.loadToken || !url) {
    loadObject(asset, token, 'glTF unavailable');
    return;
  }

  const loaders = createAssetLoaders(asset);
  setLoading(true, 'Loading glTF preview…');
  loaders.gltf.load(
    url,
    (result) => onModelLoaded(result.scene, asset, token, 'glTF'),
    undefined,
    () => loadObject(asset, token, 'glTF unavailable', loaders),
  );
}

function loadAsset(asset) {
  state.selectedAsset = asset;
  state.selectedId = asset.id;
  savePreferences({ selectedKey: getAssetKey(asset) });
  state.loadToken += 1;
  const token = state.loadToken;

  ui.selectedName.textContent = asset.name;
  ui.selectedSection.textContent = asset.section || asset.pack || 'Uploaded assets';
  ui.selectedPath.textContent = asset.blendPath || asset.previewPath || 'No source path';
  ui.selectedPath.title = ui.selectedPath.textContent;
  ui.previewBadge.textContent = 'Loading…';
  ui.previewFormat.textContent = asset.previewKind === 'gltf'
    ? 'glTF'
    : asset.previewKind === 'obj'
      ? 'OBJ'
      : asset.previewKind === 'fbx'
        ? 'FBX'
        : '—';
  setEmptyState(
    'Select an asset to inspect it',
    'Drag to orbit around the model. There are no editing tools here—just a clean preview.',
  );
  ui.emptyState.hidden = true;
  setLoading(true);
  clearModel();
  ui.resetView.disabled = true;
  ui.spinToggle.disabled = true;
  updateInspector(asset);

  if (asset.previewKind === 'gltf' && getAssetFileUrl(asset, 'preview')) {
    loadGltf(asset, token);
  } else if (asset.previewKind === 'obj' && getAssetFileUrl(asset, 'obj')) {
    loadObject(asset, token);
  } else if (asset.previewKind === 'fbx' && getAssetFileUrl(asset, 'fbx')) {
    loadFbx(asset, token);
  } else {
    showLoadError(asset, token);
  }

  renderAssetList();
  requestAnimationFrame(() => focusAssetButton(state.selectedId));
}

function moveSelection(direction) {
  if (state.filteredAssets.length === 0) {
    return;
  }

  const currentIndex = state.filteredAssets.findIndex((asset) => asset.id === state.selectedId);
  const startingIndex = currentIndex === -1
    ? (direction > 0 ? 0 : state.filteredAssets.length - 1)
    : currentIndex + direction;
  const nextIndex = Math.max(0, Math.min(startingIndex, state.filteredAssets.length - 1));
  const nextAsset = state.filteredAssets[nextIndex];

  if (!nextAsset || nextAsset.id === state.selectedId) {
    return;
  }

  loadAsset(nextAsset);
  requestAnimationFrame(() => focusAssetButton(nextAsset.id, true));
}

function focusAssetButton(assetId, focus = false) {
  const assetButton = [...ui.assetList.querySelectorAll('.asset-item')]
    .find((button) => button.dataset.assetId === assetId);
  if (!assetButton) {
    return;
  }
  ui.assetList.scrollTop = Math.max(
    0,
    assetButton.offsetTop - (ui.assetList.clientHeight / 2) + (assetButton.offsetHeight / 2),
  );
  if (focus) {
    assetButton.focus({ preventScroll: true });
  }
}

function updateSpinButton() {
  controls.autoRotate = state.autoSpin;
  ui.spinToggle.setAttribute('aria-pressed', String(state.autoSpin));
  ui.spinToggle.classList.toggle('is-active', state.autoSpin);
}

function getHealthLabel(asset) {
  if (getAssetHealth(asset) === 'ready') {
    return 'Ready to view';
  }
  if (asset?.previewKind === 'none') {
    return 'Preview needed';
  }
  return 'Preview unavailable';
}

function updateInspector(asset = state.selectedAsset) {
  if (!asset) {
    ui.inspectorPreview.replaceChildren();
    ui.inspectorPreview.textContent = 'Choose an asset';
    ui.detailName.textContent = 'No asset selected';
    ui.detailLocation.textContent = 'Your library';
    ui.detailStatus.textContent = '—';
    ui.detailFormat.textContent = '—';
    ui.detailSize.textContent = '—';
    ui.detailMeshes.textContent = '—';
    ui.detailTriangles.textContent = '—';
    ui.detailMaterials.textContent = '—';
    ui.detailPath.textContent = 'No source path';
    ui.favoriteToggle.setAttribute('aria-pressed', 'false');
    ui.favoriteToggle.textContent = '☆';
    ui.copyPath.disabled = true;
    ui.convertAsset.hidden = true;
    return;
  }

  const assetKey = getAssetKey(asset);
  const thumbnail = state.thumbnails.get(assetKey);
  ui.inspectorPreview.replaceChildren();
  if (thumbnail) {
    const image = document.createElement('img');
    image.src = thumbnail;
    image.alt = asset.name + ' thumbnail';
    ui.inspectorPreview.appendChild(image);
  } else {
    ui.inspectorPreview.textContent = getFormatLabel(asset);
  }
  ui.detailName.textContent = asset.name;
  ui.detailLocation.textContent = asset.section || asset.pack || 'Uploaded assets';
  ui.detailStatus.textContent = getHealthLabel(asset);
  ui.detailFormat.textContent = getFormatLabel(asset);
  ui.detailSize.textContent = formatBytes(asset.sizeBytes);
  const metrics = state.metrics.get(assetKey);
  ui.detailMeshes.textContent = metrics ? formatCount(metrics.meshes) : 'Load to measure';
  ui.detailTriangles.textContent = metrics ? formatCount(metrics.triangles) : 'Load to measure';
  ui.detailMaterials.textContent = metrics ? formatCount(metrics.materials) : 'Load to measure';
  ui.detailPath.textContent = asset.blendPath || asset.previewPath || 'No source path';
  ui.favoriteToggle.setAttribute('aria-pressed', String(isFavorite(asset)));
  ui.favoriteToggle.textContent = isFavorite(asset) ? '★' : '☆';
  ui.favoriteToggle.setAttribute('aria-label', isFavorite(asset) ? 'Remove from favorites' : 'Add to favorites');
  ui.copyPath.disabled = !(asset.blendPath || asset.previewPath);
  ui.convertAsset.hidden = !(state.sourceMode === 'server' && asset.previewKind === 'none' && state.blenderAvailable);
  ui.detailNote.textContent = asset.previewKind === 'none'
    ? (state.blenderAvailable
      ? 'This source has no browser preview yet. Generate one locally when you are ready.'
      : 'This source has no browser preview. Install Blender locally to generate one automatically.')
    : 'View-only inspection. Your original files are never changed.';
}

function toggleFavorite(asset = state.selectedAsset) {
  if (!asset) {
    return;
  }
  const key = getAssetKey(asset);
  if (state.favorites.has(key)) {
    state.favorites.delete(key);
  } else {
    state.favorites.add(key);
  }
  savePreferences();
  updateInspector(asset);
  renderAssetList();
}

function getFormatLabel(asset) {
  if (asset.previewKind === 'gltf') {
    return 'GLTF';
  }
  if (asset.previewKind === 'obj') {
    return 'OBJ';
  }
  if (asset.previewKind === 'fbx') {
    return 'FBX';
  }
  return 'BLEND';
}

function makeAssetButton(asset) {
  const button = document.createElement('button');
  button.className = 'asset-item';
  button.type = 'button';
  button.dataset.assetId = asset.id;
  button.title = asset.name + ' · ' + formatBytes(asset.sizeBytes);
  if (asset.id === state.selectedId) {
    button.classList.add('active');
    button.setAttribute('aria-current', 'true');
  }

  const thumbnail = document.createElement('span');
  thumbnail.className = 'asset-thumb';
  thumbnail.textContent = getFormatLabel(asset);
  const thumbnailUrl = state.thumbnails.get(getAssetKey(asset));
  if (thumbnailUrl) {
    const image = document.createElement('img');
    image.src = thumbnailUrl;
    image.alt = '';
    thumbnail.replaceChildren(image);
  }

  const status = document.createElement('span');
  status.className = 'asset-status-dot ' + (getAssetHealth(asset) === 'ready' ? 'ready' : 'attention');
  status.title = getHealthLabel(asset);
  thumbnail.appendChild(status);

  const favorite = document.createElement('span');
  favorite.className = 'asset-favorite';
  favorite.textContent = isFavorite(asset) ? '★' : '☆';

  const copy = document.createElement('span');
  copy.className = 'asset-copy';

  const name = document.createElement('span');
  name.className = 'asset-name';
  name.textContent = asset.name;

  const location = document.createElement('span');
  location.className = 'asset-location';
  location.textContent = asset.section || getDisplayLocation(asset);

  const format = document.createElement('span');
  format.className = 'asset-format';
  format.textContent = getFormatLabel(asset);

  copy.append(name, location);
  button.classList.toggle('is-favorite', isFavorite(asset));
  button.append(thumbnail, favorite, copy, format);
  button.addEventListener('click', () => loadAsset(asset));
  return button;
}

function renderAssetList() {
  const query = ui.searchInput.value.trim().toLowerCase();
  const selectedPack = ui.packFilter.value;
  const selectedHealth = ui.healthFilter.value;
  state.filteredAssets = state.assets.filter((asset) => {
    const matchesPack = selectedPack === 'all' || asset.pack === selectedPack;
    const matchesQuery = !query || getAssetSearchText(asset).includes(query);
    const matchesHealth = selectedHealth === 'all'
      || (selectedHealth === 'favorites' && isFavorite(asset))
      || (selectedHealth === 'ready' && getAssetHealth(asset) === 'ready')
      || (selectedHealth === 'attention' && getAssetHealth(asset) === 'attention');
    return matchesPack && matchesQuery && matchesHealth;
  });

  ui.resultsLabel.textContent = state.assets.length === 0
    ? 'No assets loaded'
    : state.filteredAssets.length.toLocaleString() + ' of ' + state.assets.length.toLocaleString() + ' assets';
  ui.assetList.replaceChildren();
  ui.assetList.classList.toggle('is-list', state.viewMode === 'list');

  if (state.filteredAssets.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-list';
    empty.textContent = state.assets.length === 0
      ? 'Choose a folder containing .blend, glTF, GLB, OBJ, or FBX files.'
      : 'No matching assets. Try another name or collection.';
    ui.assetList.appendChild(empty);
    return;
  }

  const grouped = new Map();
  state.filteredAssets.forEach((asset) => {
    if (!grouped.has(asset.pack)) {
      grouped.set(asset.pack, []);
    }
    grouped.get(asset.pack).push(asset);
  });

  [...grouped.entries()].forEach(([pack, assets]) => {
    const groupLabel = document.createElement('div');
    groupLabel.className = 'asset-group-label';
    const groupName = document.createElement('span');
    groupName.textContent = pack;
    const groupCount = document.createElement('span');
    groupCount.className = 'asset-group-count';
    groupCount.textContent = assets.length;
    groupLabel.append(groupName, groupCount);
    ui.assetList.appendChild(groupLabel);

    assets.forEach((asset) => ui.assetList.appendChild(makeAssetButton(asset)));
  });
}

function getPackCounts(assets) {
  return Object.fromEntries(
    [...new Set(assets.map((asset) => asset.pack || 'Uploaded assets'))]
      .sort((a, b) => a.localeCompare(b))
      .map((pack) => [pack, assets.filter((asset) => asset.pack === pack).length]),
  );
}

function populatePackFilter(packCounts) {
  const currentValue = ui.packFilter.value;
  ui.packFilter.replaceChildren();
  const allOption = document.createElement('option');
  allOption.value = 'all';
  allOption.textContent = 'All collections';
  ui.packFilter.appendChild(allOption);

  Object.entries(packCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([pack, count]) => {
      const option = document.createElement('option');
      option.value = pack;
      option.textContent = pack + ' · ' + count;
      ui.packFilter.appendChild(option);
    });

  if ([...ui.packFilter.options].some((option) => option.value === currentValue)) {
    ui.packFilter.value = currentValue;
  }
}

function setFolderChrome(statusText, footerText, connected) {
  ui.folderStatusText.textContent = statusText;
  ui.sourceLabel.textContent = footerText;
  ui.folderStatus.classList.toggle('connected', connected);
}

function setNoLibraryState() {
  state.assets = [];
  state.filteredAssets = [];
  state.selectedId = null;
  state.selectedAsset = null;
  state.loadToken += 1;
  state.autoSpin = preferences.autoSpin === true;
  state.assetHealth.clear();
  state.metrics.clear();
  state.thumbnails.clear();
  clearModel();
  ui.emptyState.hidden = false;
  ui.resetView.disabled = true;
  ui.spinToggle.disabled = true;
  ui.selectedName.textContent = 'Choose an asset';
  ui.selectedSection.textContent = 'Your library';
  ui.selectedPath.textContent = 'No asset selected';
  ui.previewBadge.textContent = 'No preview loaded';
  ui.previewFormat.textContent = '—';
  setEmptyState(
    'See what is in your library',
    'Choose or drop a folder containing 3D assets. Asset Shelf builds a private visual catalog on this device.',
  );
  populatePackFilter({});
  renderAssetList();
  updateSpinButton();
  updateInspector();
}

function setLibrary(assets, options) {
  state.assets = assets;
  state.filteredAssets = [];
  state.selectedId = null;
  state.selectedAsset = null;
  state.loadToken += 1;
  state.assetHealth.clear();
  state.metrics.clear();
  state.thumbnails.clear();
  state.autoSpin = preferences.autoSpin === true;
  clearModel();
  ui.emptyState.hidden = false;
  ui.resetView.disabled = true;
  ui.spinToggle.disabled = true;
  populatePackFilter(getPackCounts(assets));
  setFolderChrome(options.statusText, options.footerText, true);
  renderAssetList();
  updateSpinButton();

  if (assets.length > 0) {
    loadAsset(options.preferredAsset || assets[0]);
  } else {
    setEmptyState(
      'No supported assets found',
      'Choose a folder containing .blend files and a matching glTF, GLB, OBJ, or FBX export.',
    );
  }
}

function findBlendInfo(relativePath) {
  const segments = pathSegments(relativePath);
  const blendDirectoryIndex = segments.findIndex((segment) => {
    const normalized = segment.toLowerCase();
    return normalized === 'blend' || normalized === 'blends';
  });

  if (blendDirectoryIndex === -1) {
    return null;
  }

  return {
    groupSegments: segments.slice(0, blendDirectoryIndex),
    blendSubdirectory: segments.slice(blendDirectoryIndex + 1, -1),
  };
}

function getPackName(relativePath, blendInfo) {
  return blendInfo?.groupSegments[0] || pathSegments(relativePath)[0] || 'Uploaded assets';
}

function getUploadSection(relativePath, blendInfo) {
  if (blendInfo?.groupSegments.length > 1) {
    return blendInfo.groupSegments.slice(1).join(' / ');
  }
  if (blendInfo?.blendSubdirectory.length > 0) {
    return blendInfo.blendSubdirectory.join(' / ');
  }

  const location = pathSegments(pathDirname(relativePath));
  return location.length > 1 ? location.slice(-2).join(' / ') : location[0] || 'Uploaded assets';
}

function findUploadFile(fileMap, candidatePath) {
  return fileMap.get(lowerPath(candidatePath))?.path || null;
}

function findRelatedUploadFile(fileMap, groupRoot, baseName, extensions, directoryNames = []) {
  const requestedStem = baseName.toLowerCase();
  const groupPrefix = lowerPath(groupRoot);
  const directorySet = new Set(directoryNames.map((name) => name.toLowerCase()));
  const candidates = [];

  fileMap.forEach((entry) => {
    const entryPath = entry.path;
    const entryLower = lowerPath(entryPath);
    if (pathStem(entryPath).toLowerCase() !== requestedStem) {
      return;
    }
    if (!extensions.includes(pathExtension(entryPath))) {
      return;
    }
    if (groupPrefix && !entryLower.startsWith(groupPrefix + '/')) {
      return;
    }

    const entrySegments = pathSegments(entryPath);
    let score = 0;
    if (directorySet.has(entrySegments[entrySegments.length - 2]?.toLowerCase())) {
      score += 50;
    }
    if (entryLower.includes('/textures/') || entryLower.includes('/texture/')) {
      score -= 10;
    }
    candidates.push({ path: entryPath, score });
  });

  candidates.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  return candidates[0]?.path || null;
}

function findUploadExport(fileMap, groupSegments, blendSubdirectory, baseName, directoryNames, extensions) {
  const groupRoot = groupSegments.join('/');
  const subdirectories = [blendSubdirectory, []];

  for (const directoryName of directoryNames) {
    for (const subdirectory of subdirectories) {
      for (const extension of extensions) {
        const candidatePath = joinPathParts(
          groupRoot,
          directoryName,
          subdirectory.join('/'),
          baseName + extension,
        );
        const found = findUploadFile(fileMap, candidatePath);
        if (found) {
          return found;
        }
      }
    }
  }

  return findRelatedUploadFile(fileMap, groupRoot, baseName, extensions, directoryNames);
}

function findSiblingUploadFile(fileMap, sourcePath, baseName, extensions) {
  const directory = pathDirname(sourcePath);
  for (const extension of extensions) {
    const found = findUploadFile(fileMap, joinPathParts(directory, baseName + extension));
    if (found) {
      return found;
    }
  }
  return findRelatedUploadFile(fileMap, directory, baseName, extensions);
}

function getPreviewInfo(fileMap, sourcePath, blendInfo) {
  const baseName = pathStem(sourcePath);
  const groupSegments = blendInfo?.groupSegments || pathSegments(pathDirname(sourcePath));
  const blendSubdirectory = blendInfo?.blendSubdirectory || [];
  const groupRoot = groupSegments.join('/');
  const gltfPath = blendInfo
    ? findUploadExport(fileMap, groupSegments, blendSubdirectory, baseName, ['glTF', 'GLTF', 'gltf'], ['.gltf', '.glb'])
    : findSiblingUploadFile(fileMap, sourcePath, baseName, ['.gltf', '.glb']);
  const objPath = blendInfo
    ? findUploadExport(fileMap, groupSegments, blendSubdirectory, baseName, ['OBJ', 'Obj', 'obj'], ['.obj'])
    : findSiblingUploadFile(fileMap, sourcePath, baseName, ['.obj']);
  const mtlPath = objPath
    ? findSiblingUploadFile(fileMap, objPath, pathStem(objPath), ['.mtl'])
    : null;
  const fbxPath = blendInfo
    ? findUploadExport(fileMap, groupSegments, blendSubdirectory, baseName, ['FBX', 'Fbx', 'fbx'], ['.fbx'])
    : findSiblingUploadFile(fileMap, sourcePath, baseName, ['.fbx']);

  if (gltfPath) {
    return { previewKind: 'gltf', previewPath: gltfPath, objPath, mtlPath, fbxPath, groupRoot };
  }
  if (objPath) {
    return { previewKind: 'obj', previewPath: null, objPath, mtlPath, fbxPath, groupRoot };
  }
  if (fbxPath) {
    return { previewKind: 'fbx', previewPath: null, objPath, mtlPath, fbxPath, groupRoot };
  }
  return { previewKind: 'none', previewPath: null, objPath: null, mtlPath: null, fbxPath: null, groupRoot };
}

function makeUploadAsset(fileMap, relativePath, sourceKind) {
  const blendInfo = sourceKind === 'blend' ? findBlendInfo(relativePath) : null;
  const previewInfo = getPreviewInfo(fileMap, relativePath, blendInfo);
  const pack = getPackName(relativePath, blendInfo);
  const sizeEntry = fileMap.get(lowerPath(relativePath));

  return {
    id: '',
    source: 'upload',
    sourceKind,
    name: pathStem(relativePath),
    pack,
    location: pathDirname(relativePath),
    sizeBytes: sizeEntry?.file.size || 0,
    section: getUploadSection(relativePath, blendInfo),
    blendPath: relativePath,
    ...previewInfo,
  };
}

function commonFirstDirectory(paths) {
  const firstSegments = paths
    .map((path) => {
      const segments = pathSegments(path);
      const markerIndex = segments.findIndex((segment) => {
        const lower = segment.toLowerCase();
        return lower === 'blend' || lower === 'blends';
      });
      return markerIndex === -1 ? segments.slice(0, -1) : segments.slice(0, markerIndex);
    })
    .filter((segments) => segments.length > 0)
    .map((segments) => segments[0]);

  if (firstSegments.length === 0 || !firstSegments.every((segment) => segment === firstSegments[0])) {
    return '';
  }
  return firstSegments[0];
}

function isLikelyContainerFolder(name) {
  return /\bassets?\b|\bdownloads?\b|\blibrary\b|\bmodels?\b|\bfolder\b|\broot\b/i.test(name)
    && !/^(ultimate|pack|kit|collection)\b/i.test(name);
}

function stripUploadRoot(relativePath, rootFolder) {
  if (!rootFolder) {
    return normalizePath(relativePath);
  }
  const segments = pathSegments(relativePath);
  if (segments[0] === rootFolder) {
    return segments.slice(1).join('/');
  }
  return segments.join('/');
}

function buildUploadedLibrary(fileList) {
  const files = [...fileList].filter((file) => {
    const name = file.name.toLowerCase();
    return !name.startsWith('.') && !name.endsWith('.blend1');
  });
  const rawPaths = files.map((file) => normalizePath(file.webkitRelativePath || file.name));
  const rawBlendPaths = rawPaths.filter((path) => pathExtension(path) === '.blend');
  const rawPreviewPaths = rawPaths.filter((path) => ['.gltf', '.glb', '.obj', '.fbx'].includes(pathExtension(path)));
  const structuralPaths = rawBlendPaths.length > 0 ? rawBlendPaths : rawPreviewPaths;
  const commonFolder = commonFirstDirectory(structuralPaths);
  const rootFolder = commonFolder && isLikelyContainerFolder(commonFolder) ? commonFolder : '';
  const fileMap = new Map();

  files.forEach((file, index) => {
    const relativePath = stripUploadRoot(rawPaths[index], rootFolder);
    if (relativePath) {
      fileMap.set(lowerPath(relativePath), { file, path: relativePath });
    }
  });

  const blendPaths = rawBlendPaths
    .map((path) => stripUploadRoot(path, rootFolder))
    .filter((path) => fileMap.has(lowerPath(path)));
  const previewPaths = rawPreviewPaths
    .map((path) => stripUploadRoot(path, rootFolder))
    .filter((path) => fileMap.has(lowerPath(path)));
  const sourcePaths = blendPaths.length > 0 ? blendPaths : previewPaths;
  const sourceKind = blendPaths.length > 0 ? 'blend' : 'preview';
  const assets = sourcePaths.map((path) => makeUploadAsset(fileMap, path, sourceKind));

  assets.sort((a, b) => {
    const left = a.pack + '/' + a.section + '/' + a.name;
    const right = b.pack + '/' + b.section + '/' + b.name;
    return left.localeCompare(right);
  });
  assets.forEach((asset, index) => {
    asset.id = 'upload-' + index;
  });

  return {
    assets,
    fileMap,
    folderName: fileList[0]?.webkitRelativePath?.split('/')[0] || 'Selected folder',
  };
}

async function loadAssetIndex() {
  if (state.sourceMode === 'upload') {
    chooseAssetFolder();
    return;
  }

  ui.refreshAssets.disabled = true;
  ui.resultsLabel.textContent = 'Scanning local folder…';
  try {
    const response = await fetch('/api/assets', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error('No local asset API');
    }
    const index = await response.json();
    if (!Array.isArray(index.assets) || index.assets.length === 0) {
      throw new Error('No local asset folder');
    }
    state.sourceMode = 'server';
    state.uploadedFiles.clear();
    releaseObjectUrls();
    const assets = (index.assets || []).map((asset) => ({ source: 'server', ...asset }));
    const preferredAsset = assets.find((asset) => getAssetKey(asset) === preferences.selectedKey)
      || assets.find((asset) => asset.name === 'Imperial')
      || assets[0];
    setLibrary(assets, {
      statusText: 'Local library connected',
      footerText: (index.total || assets.length) + ' preview assets',
      preferredAsset,
    });
    await loadBlenderStatus();
  } catch {
    state.sourceMode = 'none';
    state.uploadedFolderName = '';
    setFolderChrome('Choose a folder to begin', 'Folder stays local', false);
    setNoLibraryState();
  } finally {
    ui.refreshAssets.disabled = false;
  }
}

async function loadBlenderStatus() {
  if (state.sourceMode !== 'server') {
    state.blenderAvailable = false;
    updateInspector();
    return;
  }

  try {
    const response = await fetch('/api/blender', { cache: 'no-store' });
    const result = await response.json();
    state.blenderAvailable = Boolean(result.available);
  } catch {
    state.blenderAvailable = false;
  }
  updateInspector();
}

function loadUploadedFolder(fileList, explicitFolderName = '') {
  if (!fileList || fileList.length === 0) {
    return;
  }

  try {
    const library = buildUploadedLibrary(fileList);
    if (library.assets.length === 0) {
      throw new Error('No supported assets found');
    }

    state.sourceMode = 'upload';
    state.blenderAvailable = false;
    state.uploadedFolderName = explicitFolderName || library.folderName;
    savePreferences({ folderName: state.uploadedFolderName });
    state.uploadedFiles = library.fileMap;
    releaseObjectUrls();
    setLibrary(library.assets, {
      statusText: state.uploadedFolderName + ' · ' + library.assets.length + ' assets',
      footerText: 'Files stay in browser',
    });
    updateInspector();
  } catch (error) {
    console.warn(error);
    state.sourceMode = 'none';
    setFolderChrome('No supported assets found', 'Folder stays local', false);
    setNoLibraryState();
    setEmptyState(
      'No supported assets found',
      'Choose a folder containing .blend files and matching glTF, GLB, OBJ, or FBX exports.',
    );
  }
}

async function collectDirectoryFiles(directoryHandle, parentPath = '') {
  const files = [];
  for await (const entry of directoryHandle.values()) {
    const entryPath = joinPathParts(parentPath, entry.name);
    if (entry.name.startsWith('.')) {
      continue;
    }
    if (entry.kind === 'directory') {
      files.push(...await collectDirectoryFiles(entry, entryPath));
      continue;
    }
    const file = await entry.getFile();
    try {
      Object.defineProperty(file, 'webkitRelativePath', { value: entryPath });
    } catch {
      // The fallback path is still usable for a flat folder.
    }
    files.push(file);
  }
  return files;
}

async function chooseAssetFolder() {
  if (typeof window.showDirectoryPicker !== 'function') {
    ui.folderInput.click();
    return;
  }

  try {
    const directoryHandle = await window.showDirectoryPicker({ mode: 'read' });
    const files = await collectDirectoryFiles(directoryHandle, directoryHandle.name);
    loadUploadedFolder(files, directoryHandle.name);
  } catch (error) {
    if (error?.name !== 'AbortError') {
      console.warn(error);
    }
  }
}

function readDroppedDirectory(entry, parentPath = '') {
  return new Promise((resolve, reject) => {
    const reader = entry.createReader();
    const files = [];
    const readBatch = () => {
      reader.readEntries(async (entries) => {
        if (entries.length === 0) {
          resolve(files);
          return;
        }
        try {
          for (const child of entries) {
            const childPath = joinPathParts(parentPath, child.name);
            if (child.isDirectory) {
              files.push(...await readDroppedDirectory(child, childPath));
            } else {
              const file = await new Promise((fileResolve, fileReject) => child.file(fileResolve, fileReject));
              try {
                Object.defineProperty(file, 'webkitRelativePath', { value: childPath });
              } catch {
                // The file name remains available if the browser blocks this property.
              }
              files.push(file);
            }
          }
          readBatch();
        } catch (error) {
          reject(error);
        }
      }, reject);
    };
    readBatch();
  });
}

async function getDroppedFiles(dataTransfer) {
  const entries = [...(dataTransfer.items || [])]
    .map((item) => item.webkitGetAsEntry?.())
    .filter(Boolean);
  if (entries.length === 0) {
    return [...(dataTransfer.files || [])];
  }

  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory) {
      files.push(...await readDroppedDirectory(entry, entry.name));
    } else if (entry.isFile) {
      const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
      files.push(file);
    }
  }
  return files;
}

async function convertSelectedAsset() {
  const asset = state.selectedAsset;
  if (!asset || state.sourceMode !== 'server' || asset.previewKind !== 'none') {
    return;
  }

  ui.convertAsset.disabled = true;
  ui.convertAsset.textContent = 'Generating…';
  try {
    const response = await fetch('/api/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ relativePath: asset.blendPath }),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Preview generation failed');
    }
    await loadAssetIndex();
    const nextAsset = state.assets.find((candidate) => candidate.blendPath === asset.blendPath);
    if (nextAsset) {
      loadAsset(nextAsset);
    }
  } catch (error) {
    ui.detailNote.textContent = error.message || 'Preview generation failed.';
  } finally {
    ui.convertAsset.disabled = false;
    ui.convertAsset.textContent = 'Generate preview';
  }
}

function updateDetailsVisibility(open = !state.detailsOpen) {
  state.detailsOpen = Boolean(open);
  ui.inspectorPanel.hidden = !state.detailsOpen;
  ui.detailsToggle.setAttribute('aria-pressed', String(state.detailsOpen));
  if (state.detailsOpen) {
    updateInspector();
  }
}

function updateFullscreenLabel() {
  ui.fullscreenToggle.textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen';
}

function resizeRenderer() {
  const width = ui.viewport.clientWidth;
  const height = ui.viewport.clientHeight;
  if (!width || !height) {
    return;
  }
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

function renderLoop() {
  requestAnimationFrame(renderLoop);
  controls.autoRotate = state.autoSpin;
  controls.update();
  renderer.render(scene, camera);
}

ui.chooseFolder.addEventListener('click', chooseAssetFolder);
ui.chooseFolderEmpty.addEventListener('click', chooseAssetFolder);
ui.folderInput.addEventListener('change', (event) => {
  loadUploadedFolder(event.target.files);
  event.target.value = '';
});
ui.searchInput.addEventListener('input', renderAssetList);
ui.packFilter.addEventListener('change', renderAssetList);
ui.healthFilter.addEventListener('change', renderAssetList);
ui.gridView.addEventListener('click', () => {
  state.viewMode = 'grid';
  ui.gridView.classList.add('is-active');
  ui.listView.classList.remove('is-active');
  ui.gridView.setAttribute('aria-pressed', 'true');
  ui.listView.setAttribute('aria-pressed', 'false');
  savePreferences();
  renderAssetList();
});
ui.listView.addEventListener('click', () => {
  state.viewMode = 'list';
  ui.listView.classList.add('is-active');
  ui.gridView.classList.remove('is-active');
  ui.listView.setAttribute('aria-pressed', 'true');
  ui.gridView.setAttribute('aria-pressed', 'false');
  savePreferences();
  renderAssetList();
});
ui.refreshAssets.addEventListener('click', loadAssetIndex);
ui.detailsToggle.addEventListener('click', () => updateDetailsVisibility());
ui.closeInspector.addEventListener('click', () => updateDetailsVisibility(false));
ui.favoriteToggle.addEventListener('click', () => toggleFavorite());
ui.convertAsset.addEventListener('click', convertSelectedAsset);
ui.copyPath.addEventListener('click', async () => {
  const path = state.selectedAsset?.blendPath || state.selectedAsset?.previewPath;
  if (!path || !navigator.clipboard) {
    return;
  }
  await navigator.clipboard.writeText(path);
  const originalLabel = ui.copyPath.textContent;
  ui.copyPath.textContent = 'Copied';
  window.setTimeout(() => { ui.copyPath.textContent = originalLabel; }, 1100);
});
ui.fullscreenToggle.addEventListener('click', async () => {
  if (document.fullscreenElement) {
    await document.exitFullscreen?.();
  } else {
    await ui.viewportShell.requestFullscreen?.();
  }
  updateFullscreenLabel();
});
ui.resetView.addEventListener('click', () => {
  if (!state.selectedAsset) {
    return;
  }
  modelGroup.rotation.set(0, 0, 0);
  resetCamera();
});
ui.spinToggle.addEventListener('click', () => {
  if (!state.selectedAsset) {
    return;
  }
  state.autoSpin = !state.autoSpin;
  savePreferences();
  updateSpinButton();
});
let dragDepth = 0;
ui.viewportShell.addEventListener('dragenter', (event) => {
  event.preventDefault();
  dragDepth += 1;
  ui.dropOverlay.hidden = false;
});
ui.viewportShell.addEventListener('dragover', (event) => {
  event.preventDefault();
});
ui.viewportShell.addEventListener('dragleave', (event) => {
  event.preventDefault();
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) {
    ui.dropOverlay.hidden = true;
  }
});
ui.viewportShell.addEventListener('drop', async (event) => {
  event.preventDefault();
  dragDepth = 0;
  ui.dropOverlay.hidden = true;
  const files = await getDroppedFiles(event.dataTransfer);
  loadUploadedFolder(files);
});
window.addEventListener('fullscreenchange', updateFullscreenLabel);
window.addEventListener('resize', resizeRenderer);
window.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) {
    return;
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    moveSelection(event.key === 'ArrowDown' ? 1 : -1);
    return;
  }
  if (event.key.toLowerCase() === 'r') {
    ui.resetView.click();
  }
  if (event.code === 'Space') {
    event.preventDefault();
    ui.spinToggle.click();
  }
});

setNoLibraryState();
resizeRenderer();
ui.assetList.classList.toggle('is-list', state.viewMode === 'list');
ui.gridView.classList.toggle('is-active', state.viewMode === 'grid');
ui.listView.classList.toggle('is-active', state.viewMode === 'list');
ui.gridView.setAttribute('aria-pressed', String(state.viewMode === 'grid'));
ui.listView.setAttribute('aria-pressed', String(state.viewMode === 'list'));
updateDetailsVisibility(false);
updateSpinButton();
loadAssetIndex();
renderLoop();

let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  ui.installApp.hidden = false;
});
ui.installApp.addEventListener('click', async () => {
  if (!deferredInstallPrompt) {
    return;
  }
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  ui.installApp.hidden = true;
});
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {
    // The viewer remains usable when service workers are unavailable.
  });
}
