# Fresh Eyes on Fresh Produce — app

Frontend for the Sensei challenge, JunctionX Lisbon 2026. Shows shelf state and staff tasks from the
pipeline's predictions.

Stack: React 19, TypeScript, Vite, Tailwind CSS v4, oxlint.

## Setup

Requires [pnpm](https://pnpm.io). With Node's corepack: `corepack enable`.

```bash
pnpm install
pnpm dev          # prepares local dataset, then serves http://localhost:5173
```

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Dev server with hot reload |
| `pnpm build` | Prepare dataset, type-check and build to `dist/` |
| `pnpm preview` | Serve the production build |
| `pnpm lint` | Lint with oxlint |
| `pnpm test` | Verify clocks, Frame selection, domain types, storage and export |

The API lives in
[fresh-eyes-on-fresh-produce-pipeline](https://github.com/T-MSD/fresh-eyes-on-fresh-produce-pipeline).

## Design preview dataset

`pnpm dev` and `pnpm build` prepare Frames and Planogram metadata from the supplied dataset. Generated `public/label-frames/` and `public/labelling-dataset.json` are ignored by Git. Keep the original dataset outside this repository.

The default source is `../new_dataset_hackathon_junctionx_10_oct_2026_v2`, with `planogram.json` and either `training/<camera>/<unix_ts>.jpg` or the organisers’ `Frutas e Legumes (train & test)/<camera>/<unix_ts>.jpg` directory. Set `DATASET_DIRECTORY` to use another location:

```bash
DATASET_DIRECTORY=/path/to/dataset pnpm dev
DATASET_DIRECTORY=/path/to/dataset pnpm build
```

The preview uses demo predictions. Tasks, Store, Camera views and verification all select the latest real Frame at or before Now using Unix timestamps. Display times use `Europe/Lisbon` through `src/time.ts`.

## Verified labels

Labels are saved in browser storage. If saved labels are unreadable, **Back up and reset labels** preserves the original data under a backup key before clearing the active labels. Verification does not complete a Task.

Export downloads `dev-labels-export.json` in the organiser dev-label shape documented by the [pipeline data contract](https://github.com/T-MSD/fresh-eyes-on-fresh-produce-pipeline/blob/main/AGENTS.md#data-contract): Camera → Frame filename → Area ID → `planogram_compliant`, `stock_level`, `stock_value`. The contract fixture in `tests/dev-label-contract.json` follows that documented example. Tests check the exact fields and derive `stock_value` from Stock level. Backend import and label saving are not implemented yet; the export has been checked against the documented format rather than a live importer.

The domain tests require Node.js with native TypeScript support (Node 22.18 or newer).
