# Fresh Eyes on Fresh Produce — app

Frontend for the Sensei challenge, JunctionX Lisbon 2026. Shows shelf state and staff tasks from the
pipeline's predictions.

Stack: React 19, TypeScript, Vite, Tailwind CSS v4, oxlint.

## Setup

Requires [pnpm](https://pnpm.io). With Node's corepack: `corepack enable`.

```bash
cp .env.example .env   # VITE_API_URL, default http://localhost:8000
pnpm dev               # http://localhost:5173
```

The app reads everything from the API in
[fresh-eyes-on-fresh-produce-pipeline](https://github.com/T-MSD/fresh-eyes-on-fresh-produce-pipeline).
Start it with `CORS_ORIGINS=http://localhost:5173` and at least one completed run.

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Dev server with hot reload |
| `pnpm build` | Type-check and build to `dist/` |
| `pnpm preview` | Serve the production build |
| `pnpm lint` | Lint with oxlint |
| `pnpm test` | Verify clocks, API parsing, store derivation, domain types, storage and export |

## Data flow

```text
start   GET /hour-range                     → time slider bounds, Now = end
        GET /tasks                          → every Task of the run, with opened/closed Frames
        GET /cameras                        → every Camera and its Planogram Areas
Now     GET /cameras/{id}/frame?at=<Now>    → Frame + Area predictions, per Camera
        GET /images/{camera}/{filename}     → Frame image
area    GET /areas/{area_id}/stock          → stock today for the Area selected on the Camera page
done    POST /tasks/done                    → sent when that Task's 5 s undo window closes
```

Views are hash routes: `#tasks`, `#store` and `#camera/<camera>/<area>`. A Task opens the Camera
page with its Area selected. Tapping an Area tag on the Frame, or an Area card below it, selects
that Area.

`src/api.ts` is the only module that reads `VITE_API_URL` and parses responses. `src/store.ts`
derives Areas, counts and the Tasks open at Now from the Frames fetched for Now. Moving the slider
refetches Camera Frames after it settles; the previous state stays on screen meanwhile.

The Camera list comes from the run's dataset, so a new Planogram needs no app change. A Camera
without a Frame at Now still shows, with its Areas unavailable. A Camera that fails to load shows
as not loaded without blocking the rest.
Display times use `Europe/Lisbon` through `src/time.ts`.

## Verified labels

Labels are saved in browser storage. If saved labels are unreadable, **Back up and reset labels** preserves the original data under a backup key before clearing the active labels. Verification does not complete a Task.

Export downloads `dev-labels-export.json` in the organiser dev-label shape documented by the [pipeline data contract](https://github.com/T-MSD/fresh-eyes-on-fresh-produce-pipeline/blob/main/AGENTS.md#data-contract): Camera → Frame filename → Area ID → `planogram_compliant`, `stock_level`, `stock_value`. The contract fixture in `tests/dev-label-contract.json` follows that documented example. Tests check the exact fields and derive `stock_value` from Stock level. Backend import and label saving are not implemented yet; the export has been checked against the documented format rather than a live importer.

The domain tests require Node.js with native TypeScript support (Node 22.18 or newer).
