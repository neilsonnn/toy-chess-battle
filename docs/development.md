# Chess Sim

A standalone edition of the autonomous chess scene from [neilsonks.com/chess](https://neilsonks.com/chess/). An 8×8 board plays out on its own, with procedural 3D pieces and physics-driven captures. Press **Space**, **R**, or **Escape** to reset the simulation.

The simulator began in Unity and was later ported to Three.js for the web.

## Run locally

Use Node.js 22 or newer.

```sh
npm ci
npm run dev
```

## Build

```sh
npm run check
npm run build
```

Serve the contents of `dist/` on a static host. The build uses relative asset paths so it works in a nested player URL.
