# Rules (mandatory)

1. Parse API responses at the boundary. Never cast `.json()` with `as`.
2. `as any` and `as unknown` are banned.
3. Every view works at phone width. Never encode state with colour alone.
4. API data shapes are shared with the pipeline repo. Change them in both repos together.
5. Never commit or push without explicit permission.
6. Use `pnpm` and the oxc toolchain. Do not add eslint or prettier.

@./AGENTS.md
