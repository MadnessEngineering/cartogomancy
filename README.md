# 🔮 Cartogomancy

## *The Mystical Art of Code Map Divination*

[![npm version](https://badge.fury.io/js/%40madnessengineering%2Fcartogomancy.svg)](https://www.npmjs.com/package/@madnessengineering/cartogomancy)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node Version](https://img.shields.io/node/v/@madnessengineering/cartogomancy)](https://nodejs.org)

Point it at any JavaScript or TypeScript codebase. Get back a rich JSON structure that tells you exactly what's in there, how complex it is, who's been touching it, and where the bodies are buried. Feed that JSON to [SwarmDesk](https://madnessinteractive.cc/dashboard) and watch your code become a 3D city you can walk through.

> *"As above in the source tree, so below in the build artifacts"* — Ancient Developer Proverb

---

## Quick Start

```bash
npm install -g @madnessengineering/cartogomancy

cartogomancy                          # interactive TUI — point and click
cartogomancy .                        # analyze current directory
cartogomancy /path/to/project         # analyze local path
cartogomancy https://github.com/user/repo  # clone, analyze, clean up
cartogomancy . --upload               # analyze + push to SwarmDesk
```

---

## The Five Analyzers

Every file that passes through cartogomancy gets interrogated by five independent analyzers. Their findings are merged into each class/component entry in the output.

### 1. Git Analyzer
Pulls the full commit history for each file. Knows who touched it, when, how often, and whether they were fixing something broken.

Produces per file:
- `commitCount` — total commits
- `contributors[]` — `{ name, email, commitCount }` sorted by activity (most commits first)
- `lastCommit` — `{ date, author, email, message, hash, daysAgo }`
- `churnRate` — lines changed per day of the file's life
- `bugFixRatio` — fraction of commits that match bug-fix keywords (fix, patch, hotfix, repair…)
- `fileAge` — days since first commit
- `totalLinesChanged` — additions + deletions across all commits
- `isGitTracked` — false if git isn't present or file is untracked

Handles monorepos correctly: resolves paths relative to `git rev-parse --show-toplevel` so subdirectory projects don't confuse it. Results are cached per file — one `git log` call per file, then pure memory for subsequent lookups.

Skip it: `--no-git`

### 2. Complexity Analyzer
Real cyclomatic and cognitive complexity, not just line counts.

- **TypeScript:** Full AST traversal via the TS compiler API
- **JavaScript:** Regex-based with nesting depth tracking

Produces:
- `cyclomaticComplexity` — unique paths (if/for/while/switch/catch/ternary/&&/||)
- `cognitiveComplexity` — cyclomatic adjusted for nesting depth
- `nestingDepth` — maximum block depth reached
- `linesOfCode` — excluding comments and blanks
- `threatLevel` — `LOW` / `MEDIUM` / `HIGH` / `CRITICAL`
- `threatColor` — `green` / `yellow` / `orange` / `red`
- `suggestions[]` — specific refactoring hints when things get spicy

Threat thresholds:

| Level    | Cyclomatic | Cognitive |
|----------|-----------|-----------|
| LOW      | 0–5       | 0–5       |
| MEDIUM   | 6–10      | 6–10      |
| HIGH     | 11–20     | 11–15     |
| CRITICAL | 21+       | 16+       |

### 3. Import Analyzer
Maps what each file exports and what it imports, then cross-references the whole codebase to find dead code and hotspots.

Detects: ES6 imports/exports, CommonJS `require()`, default/named/re-exports, star imports.

Produces:
- `exports[]` — `{ name, type, line }` for everything this file exports
- `imports[]` — `{ name, type, from, isLocal }` for everything it pulls in
- `unusedExports[]` — exports nobody imports (dead code candidates)
- `mostImported[]` / `leastImported[]` — popularity ranking
- Statistics: totals for exports, imports, local vs external

Skip it: `--no-imports`

### 4. Coverage Analyzer
Parses Jest/Istanbul `coverage/coverage-summary.json` and attaches the numbers to each class.

Produces per file:
- `lineCoverage`, `branchCoverage`, `functionCoverage`, `statementCoverage`
- `overallCoverage` — average of all four
- `linesCovered` / `linesTotal`, `branchesCovered` / `branchesTotal`, etc.
- `hasTests` — boolean (looks for adjacent `.test.ts`, `.spec.js` etc.)
- `hasCoverage` — false if no coverage report was found

Custom coverage file: `--coverage-path path/to/coverage-summary.json`

### 5. Redundancy Analyzer
Compares every class against every other class to find suspiciously similar pairs. Uses Levenshtein distance on names and Jaccard index on method/field sets.

Produces:
- `similarClassGroups[]` — clusters of classes that overlap above threshold (default 70%)
- `duplicatePatterns[]` — exact method name matches across classes
- `refactoringOpportunities[]` — ranked suggestions for extraction

Name normalization strips `Base`, `Abstract`, `Mobile`, `Component`, `Container` prefixes before comparison so `BaseModal` and `Modal` read as variants of the same thing.

Skip it: `--no-redundancy`

---

## CLI Reference

```bash
cartogomancy [path|url] [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--output <file>` | `{name}-uml.json` | Output file path |
| `--include <csv>` | `src,lib,components,pages,utils,hooks,services` | Directories to scan |
| `--exclude <csv>` | `node_modules,dist,build,.git,coverage,test,__tests__` | Patterns to skip |
| `--upload` | off | Upload to SwarmDesk after analysis |
| `--no-git` | off | Skip git history analysis |
| `--no-imports` | off | Skip import/export mapping |
| `--no-redundancy` | off | Skip similarity detection |
| `--coverage-path <path>` | `coverage/coverage-summary.json` | Custom coverage file |
| `--help`, `-h` | — | Show help |

**Auth commands:**

```bash
cartogomancy login                   # OAuth Device Flow (opens browser)
cartogomancy login --api-key omni_…  # API key auth (no browser)
cartogomancy logout
cartogomancy whoami
cartogomancy upload <file.json>      # upload an existing UML file
```

**GitHub URLs** — detected by `http://`, `https://`, or `git@` prefix. Clones with `--depth 1` to a temp directory, analyzes, then deletes the clone. You never have to manage the checkout.

```bash
cartogomancy https://github.com/facebook/react --no-redundancy
```

**Monorepos** — use `--include` to tell it where your code actually lives:

```bash
cartogomancy . --include "client,server,shared,packages"
```

---

## Auth0 Device Flow Login

Cartogomancy uses OAuth 2.0 Device Flow against Auth0 to authenticate with the Madness Interactive API. Run `cartogomancy login` and you get:

1. A URL and a short code printed to your terminal
2. Your browser opens to the Auth0 authorization page
3. Enter the code, approve it
4. The CLI polls until it gets a token and stores it encrypted at `~/.config/@madnessengineering/`

Tokens auto-refresh — there's a 5-minute buffer before expiry that triggers a silent refresh. You stay logged in across sessions without doing anything.

If you have an API key (`omni_…` prefix), skip the browser entirely:

```bash
cartogomancy login --api-key omni_abc123
```

---

## SwarmDesk / Inventorium Integration

The JSON cartogomancy produces feeds three distinct surfaces inside Inventorium/SwarmDesk:

### 3D Code City
Each class becomes a building. Height maps to lines of code. Color maps to complexity threat level (green → yellow → orange → red). The package hierarchy becomes neighborhoods. Walk through your codebase in first person.

The `gitMetrics.churnRate` and `gitMetrics.fileAge` fields drive the **Activity Level** and **Staleness** color modes — switch modes to see which buildings are on fire vs which ones haven't been touched in six months.

### Health Panel
The aggregated `complexityAnalysis`, `gitAnalysis`, and `importAnalysis` blocks at the top of the JSON feed the project health dashboard — threat level distributions, top churn files, contributor activity, dead export counts.

### Diff Insights Tab
When you push a new UML file for a project that already has data, the API diffs the two versions and surfaces what changed: new files, deleted files, complexity regressions, contributor additions. This is the `action: "updated"` response path from the upload endpoint.

---

## Interactive TUI

Run with no arguments in a terminal:

```bash
cartogomancy
```

You get:

- An ASCII art banner (gradient colors, figlet — it's a whole thing)
- Smart project discovery: scans `~/lab`, `~/projects`, `~/dev` for directories that have a `package.json`
- Menu: pick a suggested project, browse for a local path, paste a GitHub URL, or exit
- Optional config wizard to override include/exclude patterns and output filename
- Live spinners with file-by-file progress
- Results table with complexity metrics
- ASCII city preview before you load it in 3D:

```
🏙️ City Preview (Building Heights):
  ████ ███ ██ █████ ██ █ ███ ████ ...
  (Taller = More Lines, Red = Complex, Green = Simple)
```

After analysis you're asked whether to upload to SwarmDesk, and whether to analyze another project. TUI mode requires a real TTY — it detects pipes and falls back to CLI mode automatically.

---

## Output Format — v7.0

Full shape of the generated JSON:

```json
{
  "version": "7.0",
  "generated": "2026-03-28T12:00:00.000Z",
  "project": {
    "name": "my-project",
    "description": "From package.json description or 'Codebase visualization'",
    "language": "JavaScript"
  },
  "packages": [
    {
      "id": "package_abc123",
      "name": "src/components",
      "path": "src/components",
      "classes": ["component_xyz789"]
    }
  ],
  "classes": [
    {
      "id": "component_xyz789",
      "name": "MyComponent",
      "type": "class",
      "subtype": "react_component",
      "package": "src/components",
      "filePath": "src/components/MyComponent.tsx",
      "methods": [
        {
          "name": "render",
          "visibility": "public",
          "type": "method",
          "isAsync": false,
          "isStatic": false,
          "parameters": [
            { "name": "props", "type": "MyProps", "optional": false }
          ],
          "returnType": "JSX.Element",
          "signature": "render(props: MyProps): JSX.Element"
        }
      ],
      "fields": [
        {
          "name": "state",
          "type": "MyState",
          "visibility": "private",
          "isStatic": false
        }
      ],
      "hooks": ["useState", "useEffect"],
      "dependencies": ["ApiClient", "useAuthStore"],
      "extends": ["Component"],
      "implements": ["Renderable"],
      "complexity": 8,
      "complexityMetrics": {
        "cyclomaticComplexity": 8,
        "cognitiveComplexity": 11,
        "nestingDepth": 4,
        "linesOfCode": 97,
        "methodCount": 3,
        "threatLevel": "MEDIUM",
        "threatColor": "yellow",
        "label": "MEDIUM",
        "suggestions": ["Consider extracting nested conditionals into named functions"]
      },
      "coverageMetrics": {
        "hasCoverage": true,
        "overallCoverage": 82.5,
        "hasTests": true,
        "lineCoverage": 88,
        "linesCovered": 85,
        "linesTotal": 97,
        "branchCoverage": 75,
        "branchesCovered": 12,
        "branchesTotal": 16,
        "functionCoverage": 100,
        "statementCoverage": 87
      },
      "metrics": {
        "lines": 97,
        "complexity": 8,
        "methodCount": 3,
        "coverage": 82.5
      },
      "gitMetrics": {
        "commitCount": 14,
        "contributors": [
          { "name": "Dan Edens", "email": "dan@madnessinteractive.cc", "commitCount": 11 },
          { "name": "Co-Conspirator", "email": "other@example.com", "commitCount": 3 }
        ],
        "lastCommit": {
          "date": "2026-03-27T18:42:00.000Z",
          "author": "Dan Edens",
          "email": "dan@madnessinteractive.cc",
          "message": "feat: add error boundary with retry logic",
          "hash": "a3bca8b",
          "daysAgo": 1
        },
        "churnRate": 2.3,
        "bugFixRatio": 0.21,
        "createdDate": "2025-10-14T09:00:00.000Z",
        "fileAge": 165,
        "totalLinesChanged": 380,
        "isGitTracked": true
      },
      "testMetrics": {
        "exists": true,
        "coverage": 82.5
      }
    }
  ],
  "complexityAnalysis": {
    "totalClasses": 47,
    "threatLevelDistribution": {
      "LOW": 28,
      "MEDIUM": 14,
      "HIGH": 4,
      "CRITICAL": 1
    },
    "averageMetrics": {
      "cyclomaticComplexity": 5.2,
      "cognitiveComplexity": 6.8,
      "nestingDepth": 2.4
    },
    "topComplexFiles": [
      {
        "name": "AuthFlowManager",
        "file": "src/auth/AuthFlowManager.ts",
        "cyclomaticComplexity": 34,
        "cognitiveComplexity": 41,
        "nestingDepth": 7,
        "linesOfCode": 312,
        "threatLevel": "CRITICAL"
      }
    ]
  },
  "gitAnalysis": {
    "totalFilesTracked": 47,
    "totalCommits": 312,
    "averageCommitsPerFile": 6.6,
    "uniqueContributors": 3,
    "contributorNames": ["Dan Edens", "Co-Conspirator", "dependabot[bot]"],
    "mostActiveFiles": [
      {
        "name": "AuthFlowManager",
        "file": "src/auth/AuthFlowManager.ts",
        "commits": 28,
        "contributors": 2,
        "lastCommitDaysAgo": 1,
        "churnRate": 4.7,
        "bugFixRatio": 0.35
      }
    ],
    "highChurnFiles": [...]
  },
  "importAnalysis": {
    "unusedExports": [
      { "name": "legacyHelper", "file": "src/utils/helpers.ts", "exportType": "named" }
    ],
    "statistics": {
      "totalExports": 184,
      "usedExports": 167,
      "unusedExports": 17,
      "totalImports": 423,
      "localImports": 289,
      "externalImports": 134,
      "mostImported": ["useAuthStore", "ApiClient", "formatDate"],
      "leastImported": ["legacyHelper", "debugPanel"]
    }
  },
  "redundancyAnalysis": {
    "similarClassGroups": [...],
    "duplicatePatterns": [...],
    "refactoringOpportunities": [...]
  }
}
```

**External stubs** — classes referenced in `extends`/`implements` that aren't defined in your codebase get auto-created as `{ subtype: "external", isExternal: true }` entries in an `external` package. This lets SwarmDesk render inheritance arrows to library classes without breaking the city layout.

---

## Monorepo / Non-Standard Structures

If you get `Found 0 source files`, your directories don't match the defaults. Fix it with `--include`:

```bash
# client/server monorepo
cartogomancy . --include "client,server,shared"

# Nx / Turborepo
cartogomancy . --include "apps,libs,packages"

# Scan absolutely everything (use with caution)
cartogomancy . --include "" --output everything.json
```

Default includes: `src, lib, components, pages, utils, hooks, services`
Default excludes: `node_modules, dist, build, .git, coverage, test, __tests__`

---

## CI/CD

```yaml
- name: Analyze codebase
  run: |
    npm install -g @madnessengineering/cartogomancy
    cartogomancy . --no-redundancy --output uml-data.json

- name: Upload to SwarmDesk
  env:
    CARTOGOMANCY_API_KEY: ${{ secrets.SWARMDESK_API_KEY }}
  run: cartogomancy upload uml-data.json
```

---

## Performance Notes

- Git analysis is the slowest part. `--no-git` cuts runtime dramatically on large repos.
- Git results are cached in memory per run — one `git log` per file, not per class.
- GitHub clones use `--depth 1` to avoid pulling full history.
- For very large codebases, `--no-redundancy` also helps — O(n²) class comparisons add up.

---

## History & Name

**Cartogomancy** = *cartography* (mapmaking) + *cartomancy* (divination by maps/cards).

Formerly `@madnessengineering/uml-generator` (command: `swarmdesk-uml`). Renamed January 2026 to give it an identity of its own. Functionality identical — just update the package name and command in your scripts.

---

## From the Mad Laboratory

Built and maintained at [Madness Interactive](https://madnessinteractive.cc) — where code meets creativity and your architecture becomes art you can walk through. The machine demands its glory.

See [EXAMPLES.md](./EXAMPLES.md) for more usage examples.
