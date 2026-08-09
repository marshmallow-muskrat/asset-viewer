import http from 'node:http';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_ROOT = path.join(APP_ROOT, 'public');
const THREE_ROOT = path.join(APP_ROOT, 'node_modules', 'three');
const ASSET_ROOT = path.resolve(process.env.ASSET_ROOT || process.env.SPACE_PACKS_ROOT || path.join(APP_ROOT, 'assets'));
const PORT = Number(process.env.PORT || 4173);

const MIME_TYPES = {
  '.bin': 'application/octet-stream',
  '.css': 'text/css; charset=utf-8',
  '.fbx': 'application/octet-stream',
  '.gltf': 'model/gltf+json',
  '.glb': 'model/gltf-binary',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.mtl': 'text/plain; charset=utf-8',
  '.obj': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.webp': 'image/webp',
  '.hdr': 'application/octet-stream',
  '.ktx2': 'application/octet-stream',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const BLENDER_CACHE_FOLDER = '.asset-viewer-cache';

function isInside(targetPath, rootPath) {
  const target = path.resolve(targetPath);
  const root = path.resolve(rootPath);
  return target === root || target.startsWith(`${root}${path.sep}`);
}

function isFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function lowerPath(value) {
  return String(value || '').split(path.sep).join('/').toLowerCase();
}

function walkFiles(rootPath) {
  const files = [];

  if (!fs.existsSync(rootPath)) {
    return files;
  }

  const entries = fs.readdirSync(rootPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name.endsWith('.blend1')) {
      continue;
    }

    const entryPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(entryPath));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

function makeAssetUrl(filePath) {
  const relativePath = path.relative(ASSET_ROOT, filePath);
  return `/assets/${relativePath
    .split(path.sep)
    .map((part) => encodeURIComponent(part))
    .join('/')}`;
}

function findBlendRoot(blendPath) {
  const relativePath = path.relative(ASSET_ROOT, blendPath);
  const segments = relativePath.split(path.sep);
  const blendDirIndex = segments.findIndex((segment) => {
    const normalized = segment.toLowerCase();
    return normalized === 'blend' || normalized === 'blends';
  });

  if (blendDirIndex === -1) {
    return null;
  }

  const groupRoot = path.join(ASSET_ROOT, ...segments.slice(0, blendDirIndex));
  const blendRoot = path.join(groupRoot, segments[blendDirIndex]);
  const blendSubdirectory = segments.slice(blendDirIndex + 1, -1);

  return { groupRoot, blendRoot, blendSubdirectory };
}

function findExport(groupRoot, blendSubdirectory, baseName, exportDirectoryNames, extensions) {
  for (const directoryName of exportDirectoryNames) {
    const exportRoot = path.join(groupRoot, directoryName);
    if (!fs.existsSync(exportRoot)) {
      continue;
    }

    const candidates = [
      path.join(exportRoot, ...blendSubdirectory, `${baseName}${extensions[0]}`),
      path.join(exportRoot, `${baseName}${extensions[0]}`),
    ];

    for (const extension of extensions.slice(1)) {
      candidates.push(
        path.join(exportRoot, ...blendSubdirectory, `${baseName}${extension}`),
        path.join(exportRoot, `${baseName}${extension}`),
      );
    }

    const found = candidates.find(isFile);
    if (found) {
      return found;
    }
  }

  return null;
}

function findSiblingExport(directory, baseName, extensions) {
  return extensions
    .map((extension) => path.join(directory, `${baseName}${extension}`))
    .find(isFile) || null;
}

function getPackName(relativeBlendPath) {
  return relativeBlendPath.split(path.sep)[0];
}

function getSectionName(relativeBlendPath, blendInfo) {
  const groupRelative = path.relative(ASSET_ROOT, blendInfo.groupRoot);
  const groupSegments = groupRelative ? groupRelative.split(path.sep).slice(1) : [];

  if (groupSegments.length > 0) {
    return groupSegments.join(' / ');
  }

  if (blendInfo.blendSubdirectory.length > 0) {
    return blendInfo.blendSubdirectory.join(' / ');
  }

  return 'Core assets';
}

function getCachedPreviewPath(blendPath) {
  const baseName = path.basename(blendPath, path.extname(blendPath));
  return path.join(path.dirname(blendPath), BLENDER_CACHE_FOLDER, `${baseName}.glb`);
}

function getStandalonePreviewInfo(filePath, relativePath) {
  const extension = path.extname(filePath).toLowerCase();
  const baseName = path.basename(filePath, extension);
  const directory = path.dirname(filePath);
  const mtlPath = extension === '.obj' ? path.join(directory, `${baseName}.mtl`) : null;
  const previewKind = extension === '.fbx' ? 'fbx' : extension === '.obj' ? 'obj' : 'gltf';
  return {
    previewKind,
    previewLabel: previewKind === 'fbx' ? 'FBX' : previewKind === 'obj' ? 'OBJ' : 'glTF',
    previewPath: relativePath,
    previewUrl: makeAssetUrl(filePath),
    objUrl: extension === '.obj' ? makeAssetUrl(filePath) : null,
    mtlUrl: mtlPath && isFile(mtlPath) ? makeAssetUrl(mtlPath) : null,
    fbxUrl: extension === '.fbx' ? makeAssetUrl(filePath) : null,
    section: path.dirname(relativePath) || 'Root assets',
    blendPath: relativePath,
  };
}

function getPreviewInfo(blendPath, relativeBlendPath) {
  const blendInfo = findBlendRoot(blendPath);
  const baseName = path.basename(blendPath, path.extname(blendPath));

  if (!blendInfo) {
    const directory = path.dirname(blendPath);
    const gltfPath = findSiblingExport(directory, baseName, ['.gltf', '.glb']);
    const objPath = findSiblingExport(directory, baseName, ['.obj']);
    const mtlPath = objPath ? findSiblingExport(directory, path.basename(objPath, '.obj'), ['.mtl']) : null;
    const fbxPath = findSiblingExport(directory, baseName, ['.fbx']);
    const siblingPreview = gltfPath || objPath || fbxPath;
    if (siblingPreview) {
      const previewKind = gltfPath ? 'gltf' : objPath ? 'obj' : 'fbx';
      return {
        previewKind,
        previewLabel: previewKind === 'gltf' ? 'glTF' : previewKind.toUpperCase(),
        previewPath: path.relative(ASSET_ROOT, siblingPreview),
        previewUrl: makeAssetUrl(siblingPreview),
        objUrl: objPath ? makeAssetUrl(objPath) : null,
        mtlUrl: mtlPath ? makeAssetUrl(mtlPath) : null,
        fbxUrl: fbxPath ? makeAssetUrl(fbxPath) : null,
        section: path.dirname(relativeBlendPath) || 'Root assets',
        blendPath: relativeBlendPath,
        relatedPreviewPaths: [gltfPath, objPath, mtlPath, fbxPath].filter(isFile)
          .map((filePath) => path.relative(ASSET_ROOT, filePath)),
      };
    }
    return {
      previewKind: 'none',
      previewLabel: 'Blend only',
      section: 'Unknown folder',
      blendPath: relativeBlendPath,
      relatedPreviewPaths: [],
    };
  }

  const gltfPath = findExport(
    blendInfo.groupRoot,
    blendInfo.blendSubdirectory,
    baseName,
    ['glTF', 'GLTF', 'gltf'],
    ['.gltf', '.glb'],
  );
  const objPath = findExport(
    blendInfo.groupRoot,
    blendInfo.blendSubdirectory,
    baseName,
    ['OBJ', 'Obj', 'obj'],
    ['.obj'],
  );
  const mtlPath = findExport(
    blendInfo.groupRoot,
    blendInfo.blendSubdirectory,
    baseName,
    ['OBJ', 'Obj', 'obj'],
    ['.mtl'],
  );
  const fbxPath = findExport(
    blendInfo.groupRoot,
    blendInfo.blendSubdirectory,
    baseName,
    ['FBX', 'Fbx', 'fbx'],
    ['.fbx'],
  );
  const cachedPreviewPath = getCachedPreviewPath(blendPath);
  const relatedPreviewPaths = [gltfPath, objPath, mtlPath, fbxPath, cachedPreviewPath]
    .filter(isFile)
    .map((filePath) => path.relative(ASSET_ROOT, filePath));

  if (gltfPath) {
    return {
      previewKind: 'gltf',
      previewLabel: 'glTF',
      previewPath: path.relative(ASSET_ROOT, gltfPath),
      previewUrl: makeAssetUrl(gltfPath),
      objUrl: objPath ? makeAssetUrl(objPath) : null,
      mtlUrl: mtlPath ? makeAssetUrl(mtlPath) : null,
      fbxUrl: fbxPath ? makeAssetUrl(fbxPath) : null,
      section: getSectionName(relativeBlendPath, blendInfo),
      blendPath: relativeBlendPath,
      relatedPreviewPaths,
    };
  }

  if (objPath) {
    return {
      previewKind: 'obj',
      previewLabel: 'OBJ',
      previewPath: path.relative(ASSET_ROOT, objPath),
      previewUrl: makeAssetUrl(objPath),
      objUrl: makeAssetUrl(objPath),
      mtlUrl: mtlPath ? makeAssetUrl(mtlPath) : null,
      fbxUrl: fbxPath ? makeAssetUrl(fbxPath) : null,
      section: getSectionName(relativeBlendPath, blendInfo),
      blendPath: relativeBlendPath,
      relatedPreviewPaths,
    };
  }

  if (fbxPath) {
    return {
      previewKind: 'fbx',
      previewLabel: 'FBX',
      previewPath: path.relative(ASSET_ROOT, fbxPath),
      previewUrl: makeAssetUrl(fbxPath),
      objUrl: null,
      mtlUrl: null,
      fbxUrl: makeAssetUrl(fbxPath),
      section: getSectionName(relativeBlendPath, blendInfo),
      blendPath: relativeBlendPath,
      relatedPreviewPaths,
    };
  }

  if (isFile(cachedPreviewPath)) {
    return {
      previewKind: 'gltf',
      previewLabel: 'Generated GLB',
      previewPath: path.relative(ASSET_ROOT, cachedPreviewPath),
      previewUrl: makeAssetUrl(cachedPreviewPath),
      objUrl: null,
      mtlUrl: null,
      fbxUrl: null,
      section: getSectionName(relativeBlendPath, blendInfo),
      blendPath: relativeBlendPath,
      relatedPreviewPaths,
    };
  }

  return {
    previewKind: 'none',
    previewLabel: 'Blend only',
    section: getSectionName(relativeBlendPath, blendInfo),
    blendPath: relativeBlendPath,
    fbxUrl: null,
    relatedPreviewPaths,
  };
}

function buildAssetIndex() {
  const allFiles = walkFiles(ASSET_ROOT).sort((a, b) => a.localeCompare(b));
  const blendFiles = allFiles.filter((filePath) => path.extname(filePath).toLowerCase() === '.blend');

  const assets = blendFiles.map((blendPath) => {
    const relativeBlendPath = path.relative(ASSET_ROOT, blendPath);
    const previewInfo = getPreviewInfo(blendPath, relativeBlendPath);
    const stats = fs.statSync(blendPath);

    return {
      id: '',
      name: path.basename(blendPath, path.extname(blendPath)),
      pack: getPackName(relativeBlendPath),
      location: path.dirname(relativeBlendPath),
      sizeBytes: stats.size,
      ...previewInfo,
    };
  });

  const claimedPreviewPaths = new Set(
    assets
      .flatMap((asset) => asset.relatedPreviewPaths || [asset.previewPath])
      .filter(Boolean)
      .map((previewPath) => lowerPath(previewPath)),
  );
  const standalonePriority = { '.glb': 0, '.gltf': 1, '.obj': 2, '.fbx': 3 };
  const standaloneFiles = new Map();
  allFiles
    .filter((filePath) => Object.hasOwn(standalonePriority, path.extname(filePath).toLowerCase()))
    .forEach((filePath) => {
      const relativePath = path.relative(ASSET_ROOT, filePath);
      if (claimedPreviewPaths.has(lowerPath(relativePath))) {
        return;
      }
      const extension = path.extname(filePath).toLowerCase();
      const key = lowerPath(path.join(path.dirname(relativePath), path.basename(relativePath, extension)));
      const current = standaloneFiles.get(key);
      if (!current || standalonePriority[extension] < standalonePriority[current.extension]) {
        standaloneFiles.set(key, { filePath, relativePath, extension });
      }
    });

  standaloneFiles.forEach(({ filePath, relativePath }) => {
    const previewInfo = getStandalonePreviewInfo(filePath, relativePath);
    const stats = fs.statSync(filePath);
    assets.push({
      id: '',
      sourceKind: 'preview',
      name: path.basename(filePath, path.extname(filePath)),
      pack: getPackName(relativePath),
      location: path.dirname(relativePath),
      sizeBytes: stats.size,
      ...previewInfo,
    });
  });

  assets.sort((a, b) => {
    return `${a.pack}/${a.section}/${a.name}`.localeCompare(`${b.pack}/${b.section}/${b.name}`);
  });

  assets.forEach((asset, index) => {
    asset.id = String(index);
  });

  const packCounts = Object.fromEntries(
    [...new Set(assets.map((asset) => asset.pack))].map((pack) => [
      pack,
      assets.filter((asset) => asset.pack === pack).length,
    ]),
  );

  return {
    root: ASSET_ROOT,
    generatedAt: new Date().toISOString(),
    total: assets.length,
    packCounts,
    assets,
  };
}

let assetIndex = buildAssetIndex();

function sendJson(response, data, statusCode = 200) {
  const body = JSON.stringify(data);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  });
  response.end(body);
}

function getBlenderExecutable() {
  const candidates = [
    process.env.BLENDER_BIN,
    '/Applications/Blender.app/Contents/MacOS/Blender',
    '/Applications/Blender.app/Contents/MacOS/blender',
    '/usr/bin/blender',
    '/opt/homebrew/bin/blender',
    'blender',
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      if (path.isAbsolute(candidate)) {
        fs.accessSync(candidate, fs.constants.X_OK);
        return candidate;
      }
      const resolved = execFileSync(process.platform === 'win32' ? 'where' : 'which', [candidate], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim().split(/\r?\n/)[0];
      if (resolved) {
        return resolved;
      }
    } catch {
      // Try the next common installation path.
    }
  }
  return null;
}

function readRequestJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error('Request body too large'));
        request.destroy();
      }
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch {
        reject(new Error('Invalid JSON request'));
      }
    });
    request.on('error', reject);
  });
}

async function handleConvertRequest(request, response) {
  try {
    const body = await readRequestJson(request);
    const relativePath = typeof body.relativePath === 'string' ? body.relativePath : '';
    const blendPath = path.resolve(ASSET_ROOT, relativePath);
    if (!relativePath || !isInside(blendPath, ASSET_ROOT) || path.extname(blendPath).toLowerCase() !== '.blend' || !isFile(blendPath)) {
      sendJson(response, { error: 'Choose a .blend file inside the configured asset folder.' }, 400);
      return;
    }

    const cachedPreviewPath = getCachedPreviewPath(blendPath);
    if (isFile(cachedPreviewPath)) {
      sendJson(response, {
        ok: true,
        cached: true,
        previewPath: path.relative(ASSET_ROOT, cachedPreviewPath),
      });
      return;
    }

    const blenderExecutable = getBlenderExecutable();
    if (!blenderExecutable) {
      sendJson(response, {
        error: 'Blender was not found. Install Blender or set BLENDER_BIN before starting the local viewer.',
      }, 503);
      return;
    }

    fs.mkdirSync(path.dirname(cachedPreviewPath), { recursive: true });
    const pythonExpression = [
      'import bpy',
      `bpy.ops.export_scene.gltf(filepath=${JSON.stringify(cachedPreviewPath)}, export_format='GLB', export_apply=True)`,
    ].join('; ');
    const child = spawn(blenderExecutable, [
      '--background',
      blendPath,
      '--python-expr',
      pythonExpression,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-4000);
    });
    const timeout = setTimeout(() => child.kill('SIGTERM'), 5 * 60 * 1000);
    child.on('error', (error) => {
      clearTimeout(timeout);
      sendJson(response, { error: error.message }, 500);
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0 && isFile(cachedPreviewPath)) {
        sendJson(response, {
          ok: true,
          cached: false,
          previewPath: path.relative(ASSET_ROOT, cachedPreviewPath),
        });
        return;
      }
      sendJson(response, {
        error: 'Blender could not generate a GLB preview.' + (stderr ? ` ${stderr.trim().split('\n').slice(-1)[0]}` : ''),
      }, 500);
    });
  } catch (error) {
    sendJson(response, { error: error.message || 'Preview generation failed.' }, 400);
  }
}

function serveFile(response, filePath, options = {}) {
  if (!isFile(filePath)) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  const headers = {
    'Content-Type': MIME_TYPES[extension] || 'application/octet-stream',
    'Cache-Control': options.noCache ? 'no-store' : 'public, max-age=3600',
  };

  response.writeHead(200, headers);
  fs.createReadStream(filePath).pipe(response);
}

function serveAssetFile(response, pathname) {
  const encodedRelativePath = pathname.slice('/assets/'.length);
  let decodedRelativePath;

  try {
    decodedRelativePath = decodeURIComponent(encodedRelativePath);
  } catch {
    response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Bad asset path');
    return;
  }

  const assetPath = path.resolve(ASSET_ROOT, decodedRelativePath);
  if (!isInside(assetPath, ASSET_ROOT)) {
    response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Forbidden');
    return;
  }

  serveFile(response, assetPath);
}

function serveVendorFile(response, pathname) {
  let vendorPath = null;

  if (pathname === '/vendor/three.module.js') {
    vendorPath = path.join(THREE_ROOT, 'build', 'three.module.js');
  } else if (pathname.startsWith('/vendor/examples/jsm/')) {
    const relativeModulePath = pathname.slice('/vendor/examples/jsm/'.length);
    vendorPath = path.resolve(THREE_ROOT, 'examples', 'jsm', relativeModulePath);
    if (!isInside(vendorPath, path.join(THREE_ROOT, 'examples', 'jsm'))) {
      vendorPath = null;
    }
  } else if (pathname.startsWith('/vendor/')) {
    let relativeBuildPath;
    try {
      relativeBuildPath = decodeURIComponent(pathname.slice('/vendor/'.length));
    } catch {
      relativeBuildPath = null;
    }

    if (relativeBuildPath) {
      const buildRoot = path.join(THREE_ROOT, 'build');
      const candidatePath = path.resolve(buildRoot, relativeBuildPath);
      if (isInside(candidatePath, buildRoot)) {
        vendorPath = candidatePath;
      }
    }
  }

  if (!vendorPath) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  serveFile(response, vendorPath);
}

function handleRequest(request, response) {
  const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  const pathname = requestUrl.pathname;

  if (pathname === '/api/blender') {
    const executable = getBlenderExecutable();
    sendJson(response, { available: Boolean(executable) });
    return;
  }

  if (pathname === '/api/convert' && request.method === 'POST') {
    handleConvertRequest(request, response);
    return;
  }

  if (pathname === '/api/assets') {
    assetIndex = buildAssetIndex();
    sendJson(response, assetIndex);
    return;
  }

  if (pathname === '/api/health') {
    sendJson(response, { ok: true, total: assetIndex.total });
    return;
  }

  if (pathname.startsWith('/assets/')) {
    serveAssetFile(response, pathname);
    return;
  }

  if (pathname.startsWith('/vendor/')) {
    serveVendorFile(response, pathname);
    return;
  }

  const relativePublicPath = pathname === '/' ? 'index.html' : pathname.slice(1);
  const publicPath = path.resolve(PUBLIC_ROOT, relativePublicPath);
  if (!isInside(publicPath, PUBLIC_ROOT)) {
    response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Forbidden');
    return;
  }

  serveFile(response, publicPath, { noCache: true });
}

const server = http.createServer(handleRequest);

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Asset Shelf running at http://127.0.0.1:${PORT}`);
  console.log(`Watching asset folder: ${ASSET_ROOT}`);
  console.log(`Indexed ${assetIndex.total} assets.`);
});
