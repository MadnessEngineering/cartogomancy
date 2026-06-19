# Cartogomancy — Project Notes

Node CLI that divines UML / code-city JSON from JS/TS codebases via AST analysis. `@madnessengineering/cartogomancy`. The cartographer that feeds **Inventorium**'s SwarmDesk 3D code cities (and Chronomancy version history).

- Entry: `cartogomancy.js` (+ `lib/`, `tui.js`). Run: `node cartogomancy.js <path> --output X-uml.json`, or `npm run generate` / `npm run tui`.
- Inventorium calls this via `npm run generate:uml` (→ `../cartogomancy/cartogomancy.js`); output `*-uml.json` lands in Inventorium `public/data/` for SwarmDesk to render.
- Output fields drive building height / width / color (complexity, methods, churn, coverage, staleness, activity) — keep the schema stable; SwarmDesk + Chronomancy read these fields. See Inventorium's SwarmDesk docs for the consumer side.
- See the global CLAUDE.md "Madness Project Map" for how cartogomancy fits the ecosystem.
