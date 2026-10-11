# AGENTS

React frontend for the Sensei "Fresh eyes on fresh produce" challenge (JunctionX Lisbon 2026). It shows store staff the state of every shelf area and what to do next. Data comes from the API in [fresh-eyes-on-fresh-produce-pipeline](https://github.com/T-MSD/fresh-eyes-on-fresh-produce-pipeline).

## How you answer

Lead with the answer. Be direct; no filler. Let the user ask for the reasons.

To explain a flow, a structure or a change, show it: a sketch, a tree, a diagram or the type signatures. Prose supports the picture.

## Essentials

- **Stack:** React 19, TypeScript 6, Vite 8, Tailwind CSS v4.
- **Package manager:** `pnpm`, pinned in `package.json` (`packageManager`). Never use `npm` or `yarn`; never commit a `package-lock.json`.
- **Dev server:** `pnpm dev` → http://localhost:5173
- **Build + typecheck:** `pnpm build`
- **Lint:** `pnpm lint` (oxlint). This repo uses the oxc toolchain; do not add eslint or prettier.
- **Env:** `.env` holds `VITE_API_URL`. Read it only through `import.meta.env`, in one module.

## Domain vocabulary

Use these exact terms in code, docs and replies.

| Term | Meaning |
|---|---|
| Camera | A ceiling camera, keyed by its id (e.g. `6215`). |
| Frame | One image from a camera, named `<unix_ts>.jpg`. |
| Planogram | Which product should occupy each area. |
| Area | One planogram slot, `area_id` = `<camera>_<n>`, drawn from four corner points (TL, TR, BR, BL) in image pixels. |
| Compliance | Whether the product shown is the one the planogram expects. |
| Stock level | `empty` / `half` / `full`. |
| Task | An action for staff derived from an area's state: restock, move product, top up. |
| Now | The time selected on the time slider. Each camera shows its latest frame at or before now. |

## Product rules

The UI/UX score breaks ties between teams. Design for a staff member on a phone, starting a shift.

1. **Task first.** The home view is the task list, sorted: empty → wrong product → half. Every task links to the camera view with its area highlighted.
2. **Two independent channels per area.** Fill colour = stock (green full, amber half, red empty). Outline = compliance (thick purple + ⚠ when wrong). An area can be full and wrong at the same time.
3. **Never colour alone.** Pair every colour with an icon or a label.
4. **Show uncertainty.** Low-confidence predictions use a dashed outline.
5. **Mobile first.** Every view works at phone width with no horizontal scroll.
6. **The time slider drives everything.** Moving it re-derives tasks, counts and area colours from the same data.

## API contract

The pipeline's [data contract](https://github.com/T-MSD/fresh-eyes-on-fresh-produce-pipeline/blob/main/AGENTS.md#data-contract) is the source of truth. Every endpoint reads the latest completed run; timestamps are ISO 8601 UTC.

| Endpoint | Returns |
|---|---|
| `GET /hour-range` | `{run_id, start, end}`; both `null` when the run has no predictions |
| `GET /tasks` | `{tasks: [{camera, area_id, product_id, product_name, kind, opened, closed}]}`, `kind` = `restock` / `move_product` / `top_up` |
| `POST /tasks/done` | `{area_id, kind, opened_filename}` → `204` |
| `GET /cameras` | `{cameras: [{camera, camera_name, areas: [{area_id, number, product_id, product_name, corners}]}]}` |
| `GET /cameras/{camera}/frame?at=` | `{camera, camera_name, filename, ts, width, height, areas: [{area_id, number, product_id, product_name, corners, prediction}]}` |
| `GET /images/{camera}/{filename}` | The Frame JPEG |

A `404` with no completed run means "no run yet", not an error. `prediction`, `width`/`height`, `camera_name`, detected product and confidences can be `null`. Parse every response in `src/api.ts`. Changing a shape is a breaking change: update both repos together.

## Non-negotiables

1. **Types first.** Design the types for API data, area state and tasks before the components.
2. **Design through the non-happy path first.** Name the loading, empty, error and partial-data states (no predictions yet, frame missing, area off the image edge) before the happy path.
3. **Parse at the boundary, trust inside.** API responses are parsed into typed domain values in one module before components see them. Never trust `.json()` with `as`.
4. **Make invalid states unrepresentable.** Stock level and task kind are unions, never free strings. No boolean flags that can contradict each other.
5. **No casts to escape the checker.** `as any`, `as unknown` and `as unknown as T` are banned. `as const` is fine.
6. **Comments: do not write them.** Exception: a short JSDoc on an exported function when the name and types do not tell the whole story. A stale comment is a bug.
7. **Check `package.json` before adding a dependency.** Add one only when nothing installed covers the need.
8. **Your library knowledge is outdated.** Vite 8, React 19, TypeScript 6 and Tailwind v4 changed APIs. Verify the current API (context7, official docs) before writing code against them.
9. **Names explain themselves.** A name that makes a reviewer ask "what does this do?" is wrong.

## Git

- **Conventional Commits**, e.g. `feat(camera-view): draw area polygons`, `fix(tasks): sort empty before wrong product`.
- **Branches** come from `main`: `feat/<short-description>`, `fix/...`, `chore/...`.
- **PR title** = the first commit message.
- **Never commit or push without explicit permission.** Never use `--no-verify`.
- **Never commit** `.env`, `node_modules/` or `dist/`.

## Docs

- **Never state counts** of files, components, cameras or areas in docs. They go stale. Name the things instead.
- **Sub-agents do not inherit this file.** Tell them to follow `AGENTS.md`.
