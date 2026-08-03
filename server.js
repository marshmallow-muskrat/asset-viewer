import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_ROOT = path.join(APP_ROOT, 'public');
const THREE_ROOT = path.join(APP_ROOT, 'node_modules', 'three');
const ASSET_ROOT = path.resolve(process.env.SPACE_PACKS_ROOT || path.join(APP_ROOT, 'assets'));
const PORT = Number(process.env.PORT || 4173);

const MIME_TYPES = {
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
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const PACK_ORDER = [
  'Ultimate Spaceships - May 2021',
  'Ultimate Space Kit - March 2023',
  'Ultimate Monsters',
  'Ultimate Modular Sci-Fi - Feb 2021',
];

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

function getPackName(relativeBlendPath) {
  return relativeBlendPath.split(path.sep)[0];
}

function getSectionName(relativeBlendPath, blendInfo) {
  const packName = getPackName(relativeBlendPath);
  const groupRelative = path.relative(ASSET_ROOT, blendInfo.groupRoot);
  const groupSegments = groupRelative ? groupRelative.split(path.sep).slice(1) : [];

  if (groupSegments.length > 0) {
    return groupSegments.join(' / ');
  }

  if (blendInfo.blendSubdirectory.length > 0) {
    return blendInfo.blendSubdirectory.join(' / ');
  }

  if (packName.includes('Modular')) {
    return 'Modular pieces';
  }

  return 'Core assets';
}

function getPreviewInfo(blendPath, relativeBlendPath) {
  const blendInfo = findBlendRoot(blendPath);
  const baseName = path.basename(blendPath, path.extname(blendPath));

  if (!blendInfo) {
    return {
      previewKind: 'none',
      previewLabel: 'Blend only',
      section: 'Unknown folder',
      blendPath: relativeBlendPath,
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

  if (gltfPath) {
    return {
      previewKind: 'gltf',
      previewLabel: 'glTF',
      previewPath: path.relative(ASSET_ROOT, gltfPath),
      previewUrl: makeAssetUrl(gltfPath),
      objUrl: objPath ? makeAssetUrl(objPath) : null,
      mtlUrl: mtlPath ? makeAssetUrl(mtlPath) : null,
      section: getSectionName(relativeBlendPath, blendInfo),
      blendPath: relativeBlendPath,
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
      section: getSectionName(relativeBlendPath, blendInfo),
      blendPath: relativeBlendPath,
    };
  }

  return {
    previewKind: 'none',
    previewLabel: 'Blend only',
    section: getSectionName(relativeBlendPath, blendInfo),
    blendPath: relativeBlendPath,
  };
}

function buildAssetIndex() {
  const blendFiles = walkFiles(ASSET_ROOT)
    .filter((filePath) => path.extname(filePath).toLowerCase() === '.blend')
    .sort((a, b) => a.localeCompare(b));

  const assets = blendFiles.map((blendPath, index) => {
    const relativeBlendPath = path.relative(ASSET_ROOT, blendPath);
    const previewInfo = getPreviewInfo(blendPath, relativeBlendPath);
    const stats = fs.statSync(blendPath);

    return {
      id: String(index),
      name: path.basename(blendPath, path.extname(blendPath)),
      pack: getPackName(relativeBlendPath),
      location: path.dirname(relativeBlendPath),
      sizeBytes: stats.size,
      ...previewInfo,
    };
  });

  assets.sort((a, b) => {
    const aOrder = PACK_ORDER.indexOf(a.pack);
    const bOrder = PACK_ORDER.indexOf(b.pack);
    const packDifference = (aOrder === -1 ? 999 : aOrder) - (bOrder === -1 ? 999 : bOrder);
    if (packDifference !== 0) {
      return packDifference;
    }
    return `${a.section}/${a.name}`.localeCompare(`${b.section}/${b.name}`);
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
  console.log(`Space Pack Viewer running at http://127.0.0.1:${PORT}`);
  console.log(`Watching asset folder: ${ASSET_ROOT}`);
  console.log(`Indexed ${assetIndex.total} .blend files.`);
});
