# 🔍 Cartogomancy - Examples

## 📚 Real-World Examples

### 1. Analyze Inventorium (Current Project)
```bash
cartogomancy .. --output inventorium-uml.json
```

### 2. Analyze Just the Components Directory
```bash
cartogomancy ../src/components --output components-only.json
```

### 3. Analyze a Public GitHub Repo (React)
```bash
# Note: This clones the repo temporarily, analyzes it, then cleans up
cartogomancy https://github.com/facebook/react
```

### 4. Analyze Three.js Library
```bash
cartogomancy https://github.com/mrdoob/three.js --output three-uml.json
```

### 5. Analyze Your Own GitHub Project
```bash
cartogomancy https://github.com/yourusername/your-project
```

### 6. Custom Include/Exclude Patterns
```bash
# Only analyze source code, skip tests and config
cartogomancy . \
  --include "src,lib" \
  --exclude "test,__tests__,config,scripts,node_modules"
```

### 7. Analyze Multiple Related Projects
```bash
# Generate UML for each project in your workspace
cartogomancy ~/projects/frontend --output frontend-uml.json
cartogomancy ~/projects/backend --output backend-uml.json
cartogomancy ~/projects/shared --output shared-uml.json
```

## 🎮 Loading in SwarmDesk

### Method 1: Copy to Data Directory
```bash
# Generate UML
cartogomancy ~/my-project --output my-project-uml.json

# Copy to SwarmDesk data folder
cp my-project-uml.json ../public/data/

# Access in browser
open http://localhost:3000?uml=my-project-uml.json
```

### Method 2: Use URL Parameter
1. Start SwarmDesk server: `npm start` (from Inventorium root)
2. Place your UML file in `public/data/`
3. Navigate to: `http://localhost:3000?uml=your-file.json`

### Method 3: Press 'I' Key to Cycle Data Sources
1. Load SwarmDesk
2. Press `I` key to cycle through available UML data sources
3. Your newly generated files will appear in the cycle

## 🔧 Advanced Usage

### GitHub Private Repos (Future Enhancement)
```bash
# Not yet implemented, but planned:
# cartogomancy https://github.com/private/repo --token YOUR_TOKEN
```

### With Custom NPM Script
Add to your project's `package.json`:
```json
{
  "scripts": {
    "visualize": "cartogomancy . --output ../public/data/my-uml.json"
  }
}
```

Then run:
```bash
npm run visualize
```

### Automated CI/CD Integration
```yaml
# .github/workflows/visualize.yml
name: Generate 3D Visualization
on: [push]
jobs:
  visualize:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Generate UML
        run: |
          npm install -g @madnessengineering/cartogomancy
          cartogomancy . --output visualization.json
      - name: Upload artifact
        uses: actions/upload-artifact@v2
        with:
          name: code-visualization
          path: visualization.json
```

## 📊 Interpreting the Output

### Understanding the Metrics

**Lines of Code:**
- Small components: < 100 lines → Short buildings
- Medium components: 100-300 lines → Medium buildings
- Large components: > 300 lines → Tall buildings

**Complexity:**
- Low: < 10 (if/for/while) → Green/Cool colors
- Medium: 10-20 → Yellow/Warm colors
- High: > 20 → Red/Hot colors

**Git Metrics:**
- `commitCount`: How many times this file changed
- `daysAgo`: Recency of last change
- Frequent changes + recent = Active development area

### Building Colors in SwarmDesk

Press `F6` to cycle through visualization metrics:
- **Test Coverage**: Green (high) to Red (low)
- **Code Complexity**: Cool (simple) to Hot (complex)
- **Method Count**: Indicates file responsibility size

### Dependency Lines

Press `F8` to toggle dependency visualization:
- **Yellow lines**: Standard dependencies/imports
- **Orange lines**: Class inheritance (extends)
- **Cyan lines**: Interface implementations
- **Green lines**: Module imports

Press `F7` to toggle animated arrows showing data flow direction!

## 🎯 Use Case Scenarios

### Scenario 1: Exploring a New Codebase
```bash
# First time seeing a large React app
cartogomancy https://github.com/company/new-project

# Explore in 3D:
# 1. See package structure (tall vs short buildings)
# 2. Find main entry points (highly connected nodes)
# 3. Identify isolated modules (few dependencies)
```

### Scenario 2: Architecture Review
```bash
# Generate UML before refactoring
cartogomancy . --output before-refactor.json

# After refactoring
cartogomancy . --output after-refactor.json

# Compare visually in SwarmDesk
```

### Scenario 3: Onboarding New Developers
```bash
# Generate visualization
cartogomancy . --output team-codebase.json

# Share the 3D view:
# - New devs can literally "walk through" the code
# - See how components connect
# - Identify which areas are most complex
```

## 🐛 Troubleshooting

### Error: "Path does not exist"
```bash
# Make sure path is correct
ls /path/to/project  # Verify it exists

# Use absolute paths if relative paths aren't working
cartogomancy /absolute/path/to/project
```

### Error: "git command not found"
Git metrics will be skipped if Git isn't installed. Generator will still work but won't include commit history.

### Warning: "Could not read package.json"
Non-critical. The generator will use directory name as project name.

### GitHub Clone Timeout
```bash
# For large repos, git clone might timeout
# Try cloning manually first:
git clone --depth 1 https://github.com/large/repo temp-repo
cartogomancy temp-repo
```

## 🚀 Performance Tips

1. **Use `--exclude` aggressively**: Skip test files, generated code, vendor code
2. **Shallow clones for GitHub**: Automatically uses `--depth 1`
3. **Include only source dirs**: `--include "src"` is faster than analyzing everything
4. **Large repos**: Expect 5-10 seconds per 100 files

## 🎨 Customization Ideas

### Create Themed Outputs
```bash
# Frontend only
cartogomancy . --include "components,pages" --output frontend.json

# Backend only
cartogomancy . --include "api,services,models" --output backend.json

# Core utilities
cartogomancy . --include "utils,lib,helpers" --output core.json
```

### Compare Frameworks
```bash
# Visualize different framework patterns
cartogomancy https://github.com/react-project --output react-app.json
cartogomancy https://github.com/vue-project --output vue-app.json
cartogomancy https://github.com/angular-project --output angular-app.json
```

## 📝 Notes

- Output files can be 100KB-1MB for medium projects
- GitHub clones go to `.swarmdesk-temp/` and are auto-deleted
- Git metrics require the analyzed directory to be a git repository
- TypeScript support is basic (treats as JavaScript, no type extraction yet)

---

**🧙‍♂️ Happy Visualizing from the Mad Laboratory!**
