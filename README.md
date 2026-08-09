# Asset Shelf

A private, local-first visual library for inspecting 3D assets. It supports:

- `.blend` source files with matching `.gltf`, `.glb`, `.obj`/`.mtl`, or `.fbx` exports
- folders that contain exported `.gltf`, `.glb`, `.obj`, or `.fbx` files without Blender source files
- orbit, zoom, pan, reset, fullscreen, and optional auto-spin controls
- grid/list browsing, search, collection and health filters, favorites, and asset details
- local thumbnail previews, basic mesh/material/triangle statistics, and drag-and-drop folders
- an installable offline app shell; selected files stay on the device and are never uploaded
- optional local `.blend` → `.glb` preview generation when Blender is installed

Blender files cannot be rendered directly in a browser, so the viewer looks for a browser-readable export with the same filename. glTF/GLB is preferred, then OBJ, then FBX.

## Run locally

Install Node.js, then run:

```bash
npm install
npm start
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173). You can choose or drop any asset folder from the **Choose asset folder** button.

To let the local server scan a folder automatically instead, set `ASSET_ROOT`:

```bash
ASSET_ROOT="/path/to/your/assets" npm start
```

To enable automatic `.blend` previews, install Blender and either add it to your PATH or set its executable explicitly:

```bash
BLENDER_BIN="/Applications/Blender.app/Contents/MacOS/Blender" npm start
```

The **Generate preview** action writes a cached GLB inside a hidden `.asset-viewer-cache` folder next to the source file. The original `.blend` is never modified.

On macOS, **Open Space Pack Viewer.command** starts the server and opens the viewer.

## Deploy

The app is a browser client under `public/`, with an optional Node server for local auto-scanning and Blender conversion. It can be deployed to any host that supports the Node entrypoint. For Vercel:

```bash
vercel --prod
```

The live app does not need your asset files in the repository. Open the live URL, choose or drop a downloaded folder, and the browser builds the library locally. The live deployment cannot run Blender or access files on your computer, so automatic conversion is available only through the local Node server.

## Controls

- Drag with the left mouse button to orbit
- Scroll to zoom
- Right-drag or two-finger drag to pan
- **Reset view** returns to the starting camera
- **Auto spin** rotates the asset
- **Details** opens inspection stats and favorite controls
- **↑ / ↓** browses assets; **Space** toggles auto-spin; **R** resets the camera

There are no edit, transform, material, export, or save controls. Favorites and interface preferences are stored only in this browser.
