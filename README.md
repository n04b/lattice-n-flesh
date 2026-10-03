# Lattice-n-Flesh

**lattice-n-flesh** is a tiny browser tool for designing printable lattice structures. You draw a skeleton of bare edges, drop in volumes that "grow flesh" on the struts, and export the fused organic solid as STL.

No build step, no dependencies, no install: just HTML, CSS and plain JavaScript.

## Features

- **Edge-only modeling.** Draw struts with snapping to edge ends, midpoints, the grid and axes. Select, move, copy and undo. Import and export OBJ.
- **Polyhedra generator.** Platonic and Archimedean solids, prisms, geodesic spheres and domes, and a tesseract. Arrange them as a grid, ring, helix, tower, fractal, random cloud or octet truss.
- **Volume modifiers.** Box, sphere, cylinder, cone, torus, capsule and half-space, with CSG groups (union, subtract, intersect). Each modifier sets strut **thickness** and **blending** (how much neighbouring struts fuse into webs), with optional falloff toward the volume's edge.
- **Organic solid.** An implicit surface (variable-radius smooth union) meshed with surface nets in parallel Web Workers. The mesh is watertight, previewed in WebGL, and exported as binary STL in millimetres.

## Quick start

Open `index.html` in a browser. That's it.

1. **Lattice layer:** draw edges (`L`), or generate a structure in the side panel.
2. Press `Tab` to switch to the **Volumes layer** and place a sphere or box over part of the lattice.
3. Tune thickness, blending and falloff in the inspector. A draft body rebuilds as you edit.
4. Click **Build**, then **Export STL**.

| Input | Action |
|---|---|
| RMB drag / Alt+LMB | orbit |
| MMB / Shift+RMB | pan |
| Wheel | zoom to cursor |
| `V` `L` `M` `C` | select, edge, move, copy |
| `1` `2` `3` | work plane XZ, XY, YZ |
| `Shift` | lock to axis while drawing |
| `Tab` | switch lattice ↔ volumes |
| `⌘/Ctrl+Z`, `⌘/Ctrl+G` | undo, group volumes |

## Project layout

```
index.html        markup: toolbar, canvases, side panel
css/style.css     styles
js/               one global scope, loaded in order (no modules, works from file://)
  state.js        state, camera, history       render.js   2D drawing
  snap.js         snapping and picking         tools.js    tools, views
  generator.js    structure generator          polyhedra.js
  volumes.js      SDF primitives, thickness field
  mesher.js       surface-nets worker          body.js     build, WebGL, STL
  volume-ui.js    outliner and inspector       main.js     init
docs/             full description of every mechanic (in Russian)
```

## Docs

[`docs/`](docs/README.md) describes the data model, the snapping math, the generator, the thickness/blend field and the meshing pipeline in a language-agnostic way, so the project can be ported to a faster stack.
