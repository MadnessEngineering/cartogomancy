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
 *   cartogomancy /path/to/repo
 *   cartogomancy https://github.com/user/repo
 *   cartogomancy . --output my-project.json
 *   cartogomancy /path/to/repo --include "src,lib" --exclude "test,dist"
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { parse: parseComments } = require('comment-parser');
const ts = require('typescript');

// Modular analyzers (ported from generateUML.js.deprecated)
const GitAnalyzer = require('./lib/analyzers/git-analyzer');
const ComplexityAnalyzer = require('./lib/analyzers/complexity-analyzer');
const ImportAnalyzer = require('./lib/analyzers/import-analyzer');
const RedundancyAnalyzer = require('./lib/analyzers/redundancy-analyzer');
const CoverageAnalyzer = require('./lib/analyzers/coverage-analyzer');
const AnalysisSummary = require('./lib/aggregators/analysis-summary');

// Configuration from command line
const args = process.argv.slice(2);

// Check for help flag
if (args.includes('--help') || args.includes('-h')) {
    console.log(`
🔍⚡ SWARMDESK UML GENERATOR

USAGE:
  cartogomancy                                   Launch interactive TUI mode
  cartogomancy [path]                            Analyze local directory
  cartogomancy [github-url]                      Clone and analyze GitHub repo
  cartogomancy [path] [options]                  Analyze with options

OPTIONS:
  --output <file>         Output JSON file path
  --upload                Upload to SwarmDesk account (requires login)
  --include <patterns>    Comma-separated directories to include
  --exclude <patterns>    Comma-separated patterns to exclude
  --no-git                Skip git history analysis (faster)
  --no-imports            Skip import/export dead code analysis
  --no-redundancy         Skip redundancy/similarity detection
  --no-mad-tinker         Skip possibility analysis (Mad Tinker)
  --wildness <1-10>       Mad Tinker wildness dial — 1=adjacent, 10=edge of map (default: 5)
  --coverage-path <path>  Path to coverage-summary.json
  --help, -h              Show this help message

COMMANDS:
  login                   Login to SwarmDesk account (Auth0 device flow)
  login <omni_key>        Login with an API key from dashboard
  login --api-key <key>   Login with an API key (alternate syntax)
  logout                  Logout from SwarmDesk
  whoami                  Show current login status
  upload <file.json>      Upload existing UML file to SwarmDesk

EXAMPLES:
  cartogomancy                                           # Interactive TUI
  cartogomancy .                                         # Analyze current dir
  cartogomancy . --upload                                # Analyze and upload
  cartogomancy https://github.com/user/repo              # Analyze GitHub repo
  cartogomancy . --output my-uml.json                    # Custom output
  cartogomancy login                                     # Login to account
  cartogomancy upload my-project.json                    # Upload existing file

🧙‍♂️ From the Mad Laboratory
`);
    process.exit(0);
}

// Check for new auth commands
if (args[0] === 'login') {
    const authManager = require('./lib/auth');
    const apiKeyIdx = args.indexOf('--api-key');
    const apiKeyArg = apiKeyIdx !== -1 ? args[apiKeyIdx + 1] : (args[1] && args[1].startsWith('omni_') ? args[1] : null);
    if (apiKeyArg) {
        if (!apiKeyArg.startsWith('omni_')) {
            const chalk = require('chalk');
            console.error(chalk.red('\n❌ Invalid API key format. Keys start with "omni_"\n'));
            console.log(chalk.gray('  Get your key from: https://madnessinteractive.cc/dashboard > Settings > API Keys\n'));
            process.exit(1);
        }
        authManager.setApiKey(apiKeyArg);
        process.exit(0);
    }
    authManager.login().then(success => {
        process.exit(success ? 0 : 1);
    });
    return;
}

if (args[0] === 'logout') {
    const authManager = require('./lib/auth');
    authManager.logout();
    process.exit(0);
}

if (args[0] === 'whoami') {
    const authManager = require('./lib/auth');
    const chalk = require('chalk');

    if (authManager.hasApiKey()) {
        console.log(chalk.green(`\n✅ Authenticated via API key`));
        console.log(chalk.gray(`   Key: omni_...${authManager.getApiKey().slice(-8)}\n`));
    } else if (authManager.isAuthenticated()) {
        const user = authManager.getCurrentUser();
        console.log(chalk.green(`\n✅ Logged in as: ${chalk.bold(user.email)}`));
        console.log(chalk.gray(`   Name: ${user.name}`));
        console.log(chalk.gray(`   ID: ${user.sub}\n`));
    } else {
        console.log(chalk.yellow('\n⚠️  Not logged in\n'));
        console.log(chalk.gray('   Run: cartogomancy login --api-key <key>\n'));
    }
    process.exit(0);
}

if (args[0] === 'upload') {
    const uploadManager = require('./lib/upload');
    const filePath = args[1];
    const chalk = require('chalk');

    if (!filePath) {
        console.error(chalk.red('\n❌ File path required\n'));
        console.log('Usage: cartogomancy upload <file.json>\n');
        process.exit(1);
    }

    uploadManager.uploadFile(filePath).then(success => {
        process.exit(success ? 0 : 1);
    });
    return;
}

let targetPath = args[0] || '.';
let outputFile = null;
let includePatterns = ['src', 'lib', 'components', 'pages', 'utils', 'hooks', 'services', 'server', 'client', 'shared', 'app', 'api'];
let excludePatterns = ['node_modules', 'dist', 'build', '.git', 'coverage', 'test', '__tests__'];

// Analyzer flags
let skipGit = args.includes('--no-git');
let skipImports = args.includes('--no-imports');
let skipRedundancy = args.includes('--no-redundancy');
let skipMadTinker = args.includes('--no-mad-tinker');
let wildness = 5;
let coveragePath = null;

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
    } else if (args[i] === '--coverage-path' && args[i + 1]) {
        coveragePath = args[i + 1];
        i++;
    } else if (args[i] === '--wildness' && args[i + 1]) {
        wildness = Math.max(1, Math.min(10, parseInt(args[i + 1], 10) || 5));
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

// Git metrics now handled by GitAnalyzer class (lib/analyzers/git-analyzer.js)

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
 * Enhanced: extracts parameter types, return types, visibility, async/static modifiers
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

    const result = { classes: [], interfaces: [], hooks: [] };

    function getVisibility(node) {
        if (!node.modifiers) return 'public';
        for (const mod of node.modifiers) {
            if (mod.kind === ts.SyntaxKind.PrivateKeyword) return 'private';
            if (mod.kind === ts.SyntaxKind.ProtectedKeyword) return 'protected';
        }
        return 'public';
    }

    function hasModifier(node, kind) {
        return node.modifiers ? node.modifiers.some(m => m.kind === kind) : false;
    }

    function getTypeText(typeNode) {
        if (!typeNode) return null;
        try { return typeNode.getText(sourceFile); } catch { return null; }
    }

    function extractMethodInfo(member) {
        const name = member.name ? member.name.getText(sourceFile) : '<anonymous>';
        const isAsync = hasModifier(member, ts.SyntaxKind.AsyncKeyword);
        const isStatic = hasModifier(member, ts.SyntaxKind.StaticKeyword);
        const visibility = getVisibility(member);

        // Extract parameters with types
        const parameters = (member.parameters || []).map(param => {
            const paramName = param.name ? param.name.getText(sourceFile) : '?';
            const paramType = getTypeText(param.type);
            const isOptional = !!param.questionToken;
            return { name: paramName, type: paramType, optional: isOptional };
        });

        // Extract return type
        const returnType = getTypeText(member.type);

        return {
            name,
            visibility,
            type: 'method',
            isAsync,
            isStatic,
            parameters,
            returnType,
            signature: `${isAsync ? 'async ' : ''}${isStatic ? 'static ' : ''}${name}(${parameters.map(p => p.type ? `${p.name}: ${p.type}` : p.name).join(', ')})${returnType ? `: ${returnType}` : ''}`
        };
    }

    function visit(node) {
        if (ts.isClassDeclaration(node) && node.name) {
            const className = node.name.getText(sourceFile);
            const classInfo = { name: className, extends: null, implements: [], methods: [], fields: [] };

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
                    classInfo.methods.push(extractMethodInfo(member));
                } else if (ts.isPropertyDeclaration(member) && member.name) {
                    classInfo.fields.push({
                        name: member.name.getText(sourceFile),
                        type: getTypeText(member.type),
                        visibility: getVisibility(member),
                        isStatic: hasModifier(member, ts.SyntaxKind.StaticKeyword)
                    });
                } else if (ts.isConstructorDeclaration(member)) {
                    classInfo.methods.push({
                        ...extractMethodInfo(member),
                        name: 'constructor',
                        type: 'constructor'
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

    // Extract React hooks (works for both TS and JS)
    const hookRegex = /\b(use[A-Z]\w*)\s*\(/g;
    let hookMatch;
    const hooksSet = new Set();
    while ((hookMatch = hookRegex.exec(content)) !== null) {
        hooksSet.add(hookMatch[1]);
    }
    result.hooks = Array.from(hooksSet);

    return result;
}

/**
 * 🔍 Analyze a single file (Enhanced with modular analyzers)
 * Uses: GitAnalyzer, ComplexityAnalyzer, ImportAnalyzer, CoverageAnalyzer
 */
function analyzeFile(filePath, projectRoot, analyzers = {}) {
    const content = fs.readFileSync(filePath, 'utf8');
    const relativePath = path.relative(projectRoot, filePath);
    const fileName = path.basename(filePath, path.extname(filePath));
    const ext = path.extname(filePath);
    const isTypeScript = ['.ts', '.tsx'].includes(ext);
    const packagePath = path.dirname(relativePath);

    // Parse with TypeScript compiler API (enhanced: richer methods, hooks, fields)
    const tsResults = parseWithTypeScript(filePath, content);

    // Extract imports (dependency names for city connections)
    const dependencies = [];
    const importRegex = /import\s+(?:{[^}]+}|[\w]+|\*\s+as\s+\w+)?\s*(?:,\s*{[^}]+})?\s*from\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
        const importPath = match[1];
        if (importPath.startsWith('.') || importPath.startsWith('/')) {
            const depName = path.basename(importPath, path.extname(importPath));
            if (!dependencies.includes(depName)) {
                dependencies.push(depName);
            }
        }
    }

    // Collect imports/exports for ImportAnalyzer
    if (analyzers.importAnalyzer) {
        analyzers.importAnalyzer.collectExports(filePath, content);
        analyzers.importAnalyzer.collectImports(filePath, content);
        analyzers.importAnalyzer.collectFileStats(filePath);
    }

    // Detect React component
    const isReactComponent = /export\s+(?:default\s+)?(?:function|const|class)\s+(\w+)/.test(content) &&
                            (content.includes('import React') || content.includes('from \'react\'') || content.includes('from "react"'));

    // Extract class/component info
    let name = fileName;
    let extendsClass = null;
    let implementsInterfaces = [];
    let methods = [];
    let fields = [];

    if (tsResults.classes.length > 0) {
        const mainClass = tsResults.classes[0];
        name = mainClass.name;
        extendsClass = mainClass.extends;
        implementsInterfaces = mainClass.implements || [];
        methods = mainClass.methods;
        fields = mainClass.fields || [];
    } else {
        const componentMatch = content.match(/export\s+(?:default\s+)?(?:function|const|class)\s+(\w+)/);
        name = componentMatch ? componentMatch[1] : fileName;

        const extendsMatch = content.match(/class\s+\w+\s+extends\s+(\w+)/);
        if (extendsMatch) extendsClass = extendsMatch[1];

        const implementsMatch = content.match(/class\s+\w+\s+implements\s+([\w,\s]+)/);
        if (implementsMatch) implementsInterfaces = implementsMatch[1].split(',').map(s => s.trim());

        // Enhanced regex method extraction with async detection
        const methodMatches = content.match(/(?:(?:async\s+)?function\s+\w+|(?:export\s+)?(?:async\s+)?(?:const|let)\s+\w+\s*=\s*(?:async\s+)?\([^)]*\)\s*=>|^\s*(?:async\s+)?\w+\s*\([^)]*\)\s*{)/gm) || [];
        methods = methodMatches.map((m, i) => {
            const isAsync = m.includes('async');
            const nameMatch = m.match(/(?:function|const|let)\s+(\w+)|^\s*(\w+)\s*\(/);
            return {
                name: nameMatch ? (nameMatch[1] || nameMatch[2]) : `method_${i}`,
                visibility: 'public',
                type: 'method',
                isAsync,
                isStatic: false,
                parameters: [],
                returnType: null,
                signature: m.trim().substring(0, 60)
            };
        });
    }

    // Use ComplexityAnalyzer for real metrics (replaces keyword counting)
    let complexityMetrics;
    if (analyzers.complexityAnalyzer) {
        const complexityResult = analyzers.complexityAnalyzer.analyzeFile(filePath, content, isTypeScript);
        complexityMetrics = {
            cyclomaticComplexity: complexityResult.cyclomaticComplexity,
            cognitiveComplexity: complexityResult.cognitiveComplexity,
            nestingDepth: complexityResult.nestingDepth,
            linesOfCode: complexityResult.linesOfCode,
            methodCount: methods.length,
            threatLevel: complexityResult.threatLevel,
            threatColor: complexityResult.threatColor,
            label: complexityResult.label,
            suggestions: complexityResult.suggestions
        };
    } else {
        const cyclomaticComplexity = (content.match(/\b(if|else|for|while|switch|case|catch)\b/g) || []).length;
        const lines = content.split('\n').length;
        complexityMetrics = {
            cyclomaticComplexity,
            cognitiveComplexity: cyclomaticComplexity,
            nestingDepth: 0,
            linesOfCode: lines,
            methodCount: methods.length,
            threatLevel: cyclomaticComplexity > 15 ? 'CRITICAL' : cyclomaticComplexity > 10 ? 'HIGH' : cyclomaticComplexity > 5 ? 'MEDIUM' : 'LOW',
            threatColor: cyclomaticComplexity > 15 ? 'red' : cyclomaticComplexity > 10 ? 'orange' : cyclomaticComplexity > 5 ? 'yellow' : 'green',
            label: cyclomaticComplexity > 15 ? 'CRITICAL' : cyclomaticComplexity > 10 ? 'HIGH' : cyclomaticComplexity > 5 ? 'MEDIUM' : 'LOW',
            suggestions: []
        };
    }

    // Use GitAnalyzer for full git metrics (replaces getGitMetrics)
    let gitMetrics;
    if (analyzers.gitAnalyzer) {
        gitMetrics = analyzers.gitAnalyzer.analyzeFile(relativePath);
    } else {
        gitMetrics = { commitCount: 0, lastCommit: null, isGitTracked: false };
    }

    // Use CoverageAnalyzer
    let coverageMetrics = { hasCoverage: false, overallCoverage: 0 };
    if (analyzers.coverageAnalyzer) {
        coverageMetrics = analyzers.coverageAnalyzer.analyzeFile(filePath);
    }

    const lines = complexityMetrics.linesOfCode || content.split('\n').length;

    return {
        id: `component_${Math.random().toString(36).substring(2, 9)}`,
        name,
        type: 'class',
        subtype: isReactComponent ? 'react_component' : 'utility',
        package: packagePath || 'root',
        filePath: relativePath,
        methods,
        fields,
        hooks: tsResults.hooks || [],
        dependencies,
        extends: extendsClass ? [extendsClass] : [],
        implements: implementsInterfaces,
        complexity: complexityMetrics.cyclomaticComplexity,
        complexityMetrics,
        coverageMetrics,
        metrics: {
            lines,
            complexity: complexityMetrics.cyclomaticComplexity,
            methodCount: methods.length,
            coverage: coverageMetrics.overallCoverage || 0
        },
        gitMetrics,
        testMetrics: {
            exists: fs.existsSync(filePath.replace(/\.(jsx?|tsx?)$/, '.test$&')),
            coverage: coverageMetrics.overallCoverage || 0
        }
    };
}

/**
 * 🏗️ Generate UML data structure (Enhanced with modular analyzers)
 */
function generateUML(projectPath, projectName) {
    console.log(`🔍 Analyzing project: ${projectPath}`);
    console.log(`📦 Include patterns: ${includePatterns.join(', ')}`);
    console.log(`🚫 Exclude patterns: ${excludePatterns.join(', ')}`);

    // Initialize analyzers
    const analyzers = {
        complexityAnalyzer: new ComplexityAnalyzer(),
        importAnalyzer: skipImports ? null : new ImportAnalyzer(),
        coverageAnalyzer: new CoverageAnalyzer({
            projectRoot: projectPath,
            coveragePath: coveragePath || 'coverage/coverage-summary.json'
        })
    };

    if (!skipGit) {
        console.log('📜 Git analysis enabled (use --no-git to skip)');
        analyzers.gitAnalyzer = new GitAnalyzer({ projectRoot: projectPath });
    }

    // Find all source files
    const files = findSourceFiles(projectPath, includePatterns, excludePatterns);
    console.log(`📄 Found ${files.length} source files`);

    // Analyze each file
    const classes = [];
    const packages = new Map();

    for (const filePath of files) {
        try {
            const classData = analyzeFile(filePath, projectPath, analyzers);
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
    const definedClasses = new Set(classes.map(c => c.name));
    const externalClasses = new Set();

    classes.forEach(classData => {
        if (classData.extends && classData.extends.length > 0) {
            classData.extends.forEach(parentClass => {
                if (!definedClasses.has(parentClass)) externalClasses.add(parentClass);
            });
        }
        if (classData.implements && classData.implements.length > 0) {
            classData.implements.forEach(interfaceName => {
                if (!definedClasses.has(interfaceName)) externalClasses.add(interfaceName);
            });
        }
    });

    if (externalClasses.size > 0) {
        console.log(`📦 Creating ${externalClasses.size} stub classes for external dependencies`);

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
                hooks: [],
                dependencies: [],
                extends: [],
                implements: [],
                complexity: 0,
                complexityMetrics: {
                    cyclomaticComplexity: 0,
                    cognitiveComplexity: 0,
                    nestingDepth: 0,
                    linesOfCode: 75,
                    methodCount: 0,
                    threatLevel: 'EXTERNAL',
                    threatColor: 'gray',
                    label: 'External Library',
                    suggestions: []
                },
                coverageMetrics: { hasCoverage: false, overallCoverage: 0 },
                metrics: { lines: 75, complexity: 0, methodCount: 0, coverage: 0 },
                isExternal: true
            };

            classes.push(stubClass);
            packages.get(externalPkgPath).classes.push(stubClass.id);
        });
    }

    // Get project metadata
    let projectDescription = 'Codebase visualization';
    let projectLanguage = 'JavaScript';

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

    // Build base UML structure
    let umlData = {
        version: '7.0',
        generated: new Date().toISOString(),
        project: {
            name: projectName,
            description: projectDescription,
            language: projectLanguage
        },
        packages: Array.from(packages.values()),
        classes
    };

    // Attach top-level analysis sections (consumed by SwarmDesk floating panels)
    console.log('\n📊 Generating analysis summaries...');
    const redundancyAnalyzer = skipRedundancy ? null : new RedundancyAnalyzer({
        similarityThreshold: 0.7,
        minMethodsForComparison: 2
    });

    umlData = AnalysisSummary.attachToUML(umlData, {
        importAnalyzer: analyzers.importAnalyzer,
        redundancyAnalyzer,
        projectRoot: projectPath,
        noMadTinker: skipMadTinker,
        wildness,
    });

    // Log git analyzer cache stats
    if (analyzers.gitAnalyzer) {
        const stats = analyzers.gitAnalyzer.getCacheStats();
        console.log(`📜 Git cache: ${stats.cacheSize} files, ${stats.hitRate}% hit rate`);
    }

    // Log analysis section status
    const sections = ['complexityAnalysis', 'gitAnalysis', 'importAnalysis', 'redundancyAnalysis', 'possibilityAnalysis'];
    sections.forEach(section => {
        const status = umlData[section] ? '✅' : '⬜';
        console.log(`${status} ${section}`);
    });

    return umlData;
}

/**
 * 🚀 Main execution
 */
async function main() {
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

        // Check for --upload flag
        if (args.includes('--upload')) {
            console.log('\n🚀 Uploading to SwarmDesk...\n');
            const uploadManager = require('./lib/upload');
            const success = await uploadManager.upload(umlData, projectName);

            if (!success) {
                const chalk = require('chalk');
                console.log(chalk.gray(`📁 Saved locally: ${outputFile}`));
                console.log(chalk.gray(`   Upload later with: cartogomancy upload ${outputFile}\n`));
            }
        } else {
            console.log('\n🎮 Load this file in SwarmDesk to visualize in 3D!');
            const chalk = require('chalk');
            console.log(chalk.gray('   Or upload to your account: cartogomancy . --upload\n'));
        }

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
        main().catch(error => {
            console.error(`Fatal error: ${error.message}`);
            process.exit(1);
        });
    }
}

module.exports = { generateUML, analyzeFile, findSourceFiles };
