#!/usr/bin/env node
/**
 * 🔍⚡ SWARMDESK UML GENERATOR
 * Standalone UML generator for any codebase - visualize any repo in 3D!
 *
 * Features:
 * - Analyze local Git repositories
 * - Clone and analyze GitHub repositories
 * - Generate UML JSON for SwarmDesk 3D visualization
 * - Support for JavaScript/TypeScript/React codebases
 * - Git metrics and dependency analysis
 *
 * Usage:
 *   node uml-generator.js /path/to/repo
 *   node uml-generator.js https://github.com/user/repo
 *   node uml-generator.js . --output my-project.json
 *   node uml-generator.js /path/to/repo --include "src,lib" --exclude "test,dist"
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { parse: parseComments } = require('comment-parser');
const ts = require('typescript');

// Configuration from command line
const args = process.argv.slice(2);

// Check for help flag
if (args.includes('--help') || args.includes('-h')) {
    console.log(`
🔍⚡ SWARMDESK UML GENERATOR

USAGE:
  node uml-generator.js                          Launch interactive TUI mode
  node uml-generator.js [path]                   Analyze local directory
  node uml-generator.js [github-url]             Clone and analyze GitHub repo
  node uml-generator.js [path] [options]         Analyze with options

OPTIONS:
  --output <file>         Output JSON file path
  --include <patterns>    Comma-separated directories to include
  --exclude <patterns>    Comma-separated patterns to exclude
  --help, -h              Show this help message

EXAMPLES:
  node uml-generator.js                                  # Interactive TUI
  node uml-generator.js .                                # Analyze current dir
  node uml-generator.js /path/to/project                 # Analyze specific dir
  node uml-generator.js https://github.com/user/repo     # Analyze GitHub repo
  node uml-generator.js . --output my-uml.json           # Custom output
  node uml-generator.js . --include "src,lib"            # Custom patterns

🧙‍♂️ From the Mad Laboratory
`);
    process.exit(0);
}

let targetPath = args[0] || '.';
let outputFile = null;
let includePatterns = ['src', 'lib', 'components', 'pages', 'utils', 'hooks', 'services'];
let excludePatterns = ['node_modules', 'dist', 'build', '.git', 'coverage', 'test', '__tests__'];

// Parse command line arguments
for (let i = 1; i < args.length; i++) {
    if (args[i] === '--output' && args[i + 1]) {
        outputFile = args[i + 1];
        i++;
    } else if (args[i] === '--include' && args[i + 1]) {
        includePatterns = args[i + 1].split(',');
        i++;
    } else if (args[i] === '--exclude' && args[i + 1]) {
        excludePatterns = args[i + 1].split(',');
        i++;
    }
}

/**
 * 🌐 Check if input is a GitHub URL
 */
function isGitHubUrl(input) {
    return input.startsWith('http://') || input.startsWith('https://') || input.startsWith('git@');
}

/**
 * 📥 Clone GitHub repository to temp directory
 */
function cloneRepository(url) {
    console.log(`🔄 Cloning repository: ${url}`);
    const tempDir = path.join(process.cwd(), '.swarmdesk-temp', `repo-${Date.now()}`);

    try {
        fs.mkdirSync(tempDir, { recursive: true });
        execSync(`git clone --depth 1 ${url} ${tempDir}`, { stdio: 'inherit' });
        console.log(`✅ Cloned to: ${tempDir}`);
        return tempDir;
    } catch (error) {
        console.error(`❌ Failed to clone repository: ${error.message}`);
        throw error;
    }
}

/**
 * 🧹 Cleanup temporary directory
 */
function cleanupTemp(tempDir) {
    if (tempDir && tempDir.includes('.swarmdesk-temp')) {
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
            console.log(`🧹 Cleaned up temp directory`);
        } catch (error) {
            console.warn(`⚠️ Could not cleanup temp directory: ${error.message}`);
        }
    }
}

/**
 * 📊 Get Git metrics for a file
 */
function getGitMetrics(filePath, projectRoot) {
    try {
        const relativePath = path.relative(projectRoot, filePath);

        // Get commit count
        const commitCount = execSync(
            `git -C "${projectRoot}" log --oneline -- "${relativePath}" | wc -l`,
            { encoding: 'utf8' }
        ).trim();

        // Get last commit info
        const lastCommitInfo = execSync(
            `git -C "${projectRoot}" log -1 --format="%H|%an|%ae|%ai|%s" -- "${relativePath}"`,
            { encoding: 'utf8' }
        ).trim();

        if (lastCommitInfo) {
            const [hash, author, email, date, message] = lastCommitInfo.split('|');
            const commitDate = new Date(date);
            const daysAgo = Math.floor((Date.now() - commitDate.getTime()) / (1000 * 60 * 60 * 24));

            return {
                commitCount: parseInt(commitCount) || 0,
                lastCommit: {
                    hash: hash.substring(0, 7),
                    author,
                    email,
                    date: commitDate.toISOString(),
                    message: message || '',
                    daysAgo
                },
                isGitTracked: true
            };
        }
    } catch (error) {
        // File not in git or git not available
    }

    return {
        commitCount: 0,
        lastCommit: null,
        isGitTracked: false
    };
}

/**
 * 📁 Find all source files
 */
function findSourceFiles(dir, includes, excludes) {
    const files = [];

    function walk(currentDir) {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            const relativePath = path.relative(dir, fullPath);

            // Skip excluded patterns
            if (excludes.some(pattern => relativePath.includes(pattern))) {
                continue;
            }

            if (entry.isDirectory()) {
                walk(fullPath);
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name);
                if (['.js', '.jsx', '.ts', '.tsx', '.mjs'].includes(ext)) {
                    // Check if file is in included patterns
                    if (includes.length === 0 || includes.some(pattern => relativePath.startsWith(pattern))) {
                        files.push(fullPath);
                    }
                }
            }
        }
    }

    walk(dir);
    return files;
}

/**
 * 🔍 Parse TypeScript/JavaScript file using TS compiler API
 */
function parseWithTypeScript(filePath, content) {
    const ext = path.extname(filePath);
    const isTypeScript = ['.ts', '.tsx'].includes(ext);

    const sourceFile = ts.createSourceFile(
        filePath,
        content,
        ts.ScriptTarget.Latest,
        true
    );

    const result = { classes: [], interfaces: [] };

    function visit(node) {
        if (ts.isClassDeclaration(node) && node.name) {
            const className = node.name.getText(sourceFile);
            const classInfo = { name: className, extends: null, implements: [], methods: [] };

            if (node.heritageClauses) {
                for (const clause of node.heritageClauses) {
                    if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
                        classInfo.extends = clause.types[0].expression.getText(sourceFile);
                    } else if (clause.token === ts.SyntaxKind.ImplementsKeyword) {
                        classInfo.implements = clause.types.map(type =>
                            type.expression.getText(sourceFile)
                        );
                    }
                }
            }

            node.members.forEach(member => {
                if (ts.isMethodDeclaration(member) && member.name) {
                    classInfo.methods.push({
                        name: member.name.getText(sourceFile),
                        visibility: 'public',
                        type: 'method'
                    });
                }
            });

            result.classes.push(classInfo);
        }

        if (isTypeScript && ts.isInterfaceDeclaration(node) && node.name) {
            const interfaceName = node.name.getText(sourceFile);
            const ifaceInfo = { name: interfaceName, extends: [] };

            if (node.heritageClauses) {
                for (const clause of node.heritageClauses) {
                    if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
                        ifaceInfo.extends = clause.types.map(type =>
                            type.expression.getText(sourceFile)
                        );
                    }
                }
            }

            result.interfaces.push(ifaceInfo);
        }

        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return result;
}

/**
 * 🔍 Analyze a single file (Enhanced with TypeScript AST parsing)
 */
function analyzeFile(filePath, projectRoot) {
    const content = fs.readFileSync(filePath, 'utf8');
    const relativePath = path.relative(projectRoot, filePath);
    const fileName = path.basename(filePath, path.extname(filePath));
    const packagePath = path.dirname(relativePath);

    // Parse with TypeScript compiler API
    const tsResults = parseWithTypeScript(filePath, content);

    // Extract imports
    const dependencies = [];
    const importRegex = /import\s+(?:{[^}]+}|[\w]+|\*\s+as\s+\w+)?\s*(?:,\s*{[^}]+})?\s*from\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
        const importPath = match[1];
        // Only track local imports
        if (importPath.startsWith('.') || importPath.startsWith('/')) {
            const depName = path.basename(importPath, path.extname(importPath));
            if (!dependencies.includes(depName)) {
                dependencies.push(depName);
            }
        }
    }

    // Extract React component or class/function
    const isReactComponent = /export\s+(?:default\s+)?(?:function|const|class)\s+(\w+)/.test(content) &&
                            (content.includes('import React') || content.includes('from \'react\''));

    // Use TypeScript parser results if available, otherwise fallback to regex
    let name = fileName;
    let extendsClass = null;
    let implementsInterfaces = [];
    let methods = [];

    if (tsResults.classes.length > 0) {
        const mainClass = tsResults.classes[0];
        name = mainClass.name;
        extendsClass = mainClass.extends;
        implementsInterfaces = mainClass.implements || [];
        methods = mainClass.methods;
    } else {
        const componentMatch = content.match(/export\s+(?:default\s+)?(?:function|const|class)\s+(\w+)/);
        name = componentMatch ? componentMatch[1] : fileName;

        // Regex fallback for extends/implements
        const extendsMatch = content.match(/class\s+\w+\s+extends\s+(\w+)/);
        if (extendsMatch) extendsClass = extendsMatch[1];

        const implementsMatch = content.match(/class\s+\w+\s+implements\s+([\w,\s]+)/);
        if (implementsMatch) implementsInterfaces = implementsMatch[1].split(',').map(s => s.trim());

        const methodMatches = content.match(/(?:function\s+\w+|const\s+\w+\s*=\s*(?:async\s+)?\([^)]*\)\s*=>|^\s*\w+\s*\([^)]*\)\s*{)/gm) || [];
        methods = methodMatches.map((m, i) => ({
            name: m.trim().split(/[\s(]/)[1] || `method_${i}`,
            visibility: 'public',
            type: 'method'
        }));
    }

    // Calculate complexity (simple metric: conditionals + loops)
    const cyclomaticComplexity = (content.match(/\b(if|else|for|while|switch|case|catch)\b/g) || []).length;

    // Get git metrics
    const gitMetrics = getGitMetrics(filePath, projectRoot);

    // Get file stats
    const stats = fs.statSync(filePath);
    const lines = content.split('\n').length;

    return {
        id: `component_${Math.random().toString(36).substring(2, 9)}`,
        name,
        type: 'class',
        subtype: isReactComponent ? 'react_component' : 'utility',
        package: packagePath || 'root',
        filePath: relativePath,
        methods,
        fields: [],
        dependencies,
        extends: extendsClass ? [extendsClass] : [],
        implements: implementsInterfaces,
        complexity: cyclomaticComplexity, // Top-level for compatibility
        complexityMetrics: {
            cyclomaticComplexity,
            cognitiveComplexity: cyclomaticComplexity, // Simplified - would need proper calculation
            nestingDepth: 0, // Placeholder
            linesOfCode: lines,
            methodCount: methods.length,
            threatLevel: cyclomaticComplexity > 15 ? 'CRITICAL' : cyclomaticComplexity > 10 ? 'HIGH' : cyclomaticComplexity > 5 ? 'MODERATE' : 'LOW',
            threatColor: cyclomaticComplexity > 15 ? 'red' : cyclomaticComplexity > 10 ? 'orange' : cyclomaticComplexity > 5 ? 'yellow' : 'green',
            label: cyclomaticComplexity > 15 ? 'CRITICAL' : cyclomaticComplexity > 10 ? 'HIGH' : cyclomaticComplexity > 5 ? 'MODERATE' : 'LOW',
            suggestions: []
        },
        coverageMetrics: {
            hasCoverage: false,
            overallCoverage: 0
        },
        metrics: {
            lines,
            complexity: cyclomaticComplexity,
            methodCount: methods.length,
            coverage: 0
        },
        gitMetrics,
        testMetrics: {
            exists: fs.existsSync(filePath.replace(/\.(jsx?|tsx?)$/, '.test$1')),
            coverage: 0
        }
    };
}

/**
 * 🏗️ Generate UML data structure
 */
function generateUML(projectPath, projectName) {
    console.log(`🔍 Analyzing project: ${projectPath}`);
    console.log(`📦 Include patterns: ${includePatterns.join(', ')}`);
    console.log(`🚫 Exclude patterns: ${excludePatterns.join(', ')}`);

    // Find all source files
    const files = findSourceFiles(projectPath, includePatterns, excludePatterns);
    console.log(`📄 Found ${files.length} source files`);

    // Analyze each file
    const classes = [];
    const packages = new Map();

    for (const filePath of files) {
        try {
            const classData = analyzeFile(filePath, projectPath);
            classes.push(classData);

            // Group by package
            const pkgPath = classData.package;
            if (!packages.has(pkgPath)) {
                packages.set(pkgPath, {
                    id: `package_${Math.random().toString(36).substring(2, 9)}`,
                    name: pkgPath.split('/').pop() || 'root',
                    path: pkgPath,
                    classes: []
                });
            }
            packages.get(pkgPath).classes.push(classData.id);
        } catch (error) {
            console.warn(`⚠️ Error analyzing ${filePath}: ${error.message}`);
        }
    }

    // 🔗 CREATE STUB CLASSES FOR EXTERNAL DEPENDENCIES
    // Find all classes referenced in extends/implements but not defined in codebase
    const definedClasses = new Set(classes.map(c => c.name));
    const externalClasses = new Set();

    classes.forEach(classData => {
        // Check extends
        if (classData.extends && classData.extends.length > 0) {
            classData.extends.forEach(parentClass => {
                if (!definedClasses.has(parentClass)) {
                    externalClasses.add(parentClass);
                }
            });
        }

        // Check implements
        if (classData.implements && classData.implements.length > 0) {
            classData.implements.forEach(interfaceName => {
                if (!definedClasses.has(interfaceName)) {
                    externalClasses.add(interfaceName);
                }
            });
        }
    });

    // Create stub classes for external dependencies
    if (externalClasses.size > 0) {
        console.log(`📦 Creating ${externalClasses.size} stub classes for external dependencies`);

        // Create or get external package
        const externalPkgPath = 'external';
        if (!packages.has(externalPkgPath)) {
            packages.set(externalPkgPath, {
                id: 'package_external',
                name: 'External Libraries',
                path: externalPkgPath,
                classes: []
            });
        }

        externalClasses.forEach(className => {
            const stubClass = {
                id: `external_${className.replace(/\./g, '_').toLowerCase()}`,
                name: className,
                type: 'class',
                subtype: 'external',
                package: externalPkgPath,
                filePath: `external/${className}`,
                methods: [],
                fields: [],
                dependencies: [],
                extends: [],
                implements: [],
                complexity: 0,
                complexityMetrics: {
                    cyclomaticComplexity: 0,
                    cognitiveComplexity: 0,
                    nestingDepth: 0,
                    linesOfCode: 75, // Give external stubs modest height (75 lines = ~1.5 units)
                    methodCount: 0,
                    threatLevel: 'EXTERNAL',
                    threatColor: 'gray',
                    label: 'External Library',
                    suggestions: []
                },
                coverageMetrics: {
                    hasCoverage: false,
                    overallCoverage: 0
                },
                metrics: {
                    lines: 75,
                    complexity: 0,
                    methodCount: 0,
                    coverage: 0
                },
                isExternal: true
            };

            classes.push(stubClass);
            packages.get(externalPkgPath).classes.push(stubClass.id);
            console.log(`  ✅ Created stub for ${className}`);
        });
    }

    // Get project metadata
    let projectDescription = 'Codebase visualization';
    let projectLanguage = 'JavaScript';

    // Try to read package.json
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
        try {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            projectName = packageJson.name || projectName;
            projectDescription = packageJson.description || projectDescription;
        } catch (error) {
            console.warn(`⚠️ Could not read package.json: ${error.message}`);
        }
    }

    // Build UML structure
    return {
        version: '6.0',
        generated: new Date().toISOString(),
        project: {
            name: projectName,
            description: projectDescription,
            language: projectLanguage
        },
        packages: Array.from(packages.values()),
        classes
    };
}

/**
 * 🚀 Main execution
 */
function main() {
    console.log('🔍⚡ SWARMDESK UML GENERATOR');
    console.log('═══════════════════════════════\n');

    let workingPath = targetPath;
    let isTemp = false;

    try {
        // Handle GitHub URLs
        if (isGitHubUrl(targetPath)) {
            workingPath = cloneRepository(targetPath);
            isTemp = true;
        } else {
            // Resolve local path
            workingPath = path.resolve(targetPath);
            if (!fs.existsSync(workingPath)) {
                throw new Error(`Path does not exist: ${workingPath}`);
            }
        }

        // Extract project name
        const projectName = path.basename(workingPath);

        // Generate UML
        const umlData = generateUML(workingPath, projectName);

        // Determine output file
        if (!outputFile) {
            outputFile = path.join(process.cwd(), `${projectName}-uml.json`);
        }

        // Write output
        fs.writeFileSync(outputFile, JSON.stringify(umlData, null, 2));

        console.log('\n✨ UML Generation Complete!');
        console.log(`📊 Classes analyzed: ${umlData.classes.length}`);
        console.log(`📦 Packages: ${umlData.packages.length}`);
        console.log(`💾 Output file: ${outputFile}`);
        console.log('\n🎮 Load this file in SwarmDesk to visualize in 3D!');

    } catch (error) {
        console.error(`\n❌ Error: ${error.message}`);
        process.exit(1);
    } finally {
        // Cleanup temp directory if needed
        if (isTemp) {
            cleanupTemp(workingPath);
        }
    }
}

// Run if called directly
if (require.main === module) {
    // Check if running in interactive mode (no arguments) or CLI mode (with arguments)
    const hasCliArgs = process.argv.length > 2;

    if (!hasCliArgs && process.stdin.isTTY) {
        // No arguments and in a TTY → Launch TUI mode
        try {
            const tui = require('./tui.js');
            tui.main().catch(error => {
                console.error(`Fatal error: ${error.message}`);
                process.exit(1);
            });
        } catch (error) {
            console.error('TUI dependencies not installed. Run: npm install');
            console.error('Falling back to CLI mode. Use --help for usage.');
            process.exit(1);
        }
    } else {
        // Arguments provided → Use CLI mode (backwards compatible)
        main();
    }
}

module.exports = { generateUML, analyzeFile, findSourceFiles };
