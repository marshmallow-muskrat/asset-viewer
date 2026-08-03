# 3D Asset Viewer

A small, view-only browser for inspecting 3D assets. It supports:

- `.blend` source files with matching `.gltf`, `.glb`, `.obj`/`.mtl`, or `.fbx` exports
- folders that contain exported `.gltf`, `.glb`, `.obj`, or `.fbx` files without Blender source files
- orbit, zoom, pan, reset, and optional auto-spin controls
- local folder loading in a deployed browser; selected files stay on the device and are never uploaded

Blender files cannot be rendered directly in a browser, so the viewer looks for a browser-readable export with the same filename. glTF/GLB is preferred, then OBJ, then FBX.

## Run locally

Install Node.js, then run:

```bash
npm install
npm start
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173). You can choose any asset folder from the **Choose asset folder** button.

To let the local server scan a folder automatically instead, set `SPACE_PACKS_ROOT`:

```bash
SPACE_PACKS_ROOT="/path/to/your/assets" npm start
```

On macOS, **Open Space Pack Viewer.command** starts the server and opens the viewer.

## Deploy

The app is a static browser client under `public/`, with an optional Node server for local auto-scanning. It can be deployed to any static host. For Vercel:

```bash
vercel --prod
```

The live app does not need your asset files in the repository. Open the live URL, choose a downloaded folder, and the browser builds the library locally.

## Controls

- Drag with the left mouse button to orbit
- Scroll to zoom
- Right-drag or two-finger drag to pan
- **Reset view** returns to the starting camera
- **Auto spin** rotates the asset

There are no edit, transform, material, export, or save controls.
