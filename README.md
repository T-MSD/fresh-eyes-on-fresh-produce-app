# Fresh Eyes on Fresh Produce — app

Frontend for the Sensei challenge, JunctionX Lisbon 2026. Shows shelf state and staff tasks from the
pipeline's predictions.

Stack: React 19, TypeScript, Vite, Tailwind CSS v4, oxlint.

## Setup

Requires [pnpm](https://pnpm.io). With Node's corepack: `corepack enable`.

```bash
pnpm install
pnpm dev          # http://localhost:5173
```

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Dev server with hot reload |
| `pnpm build` | Type-check and build to `dist/` |
| `pnpm preview` | Serve the production build |
| `pnpm lint` | Lint with oxlint |

The API lives in
[fresh-eyes-on-fresh-produce-pipeline](https://github.com/T-MSD/fresh-eyes-on-fresh-produce-pipeline).
