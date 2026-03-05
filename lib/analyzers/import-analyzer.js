/**
 * 🔍 Import Analyzer - Track exports/imports for dead code detection
 *
 * Ported from generateUML.js.deprecated ImportAnalyzer class.
 * Provides: exportCount, importedByCount, unusedExports, import statistics
 * Unlocks: Unused Exports panel, Popular Imports panel in SwarmDesk
 */

const fs = require('fs');
const path = require('path');

class ImportAnalyzer {
    constructor() {
        this.exports = new Map();
        this.imports = new Map();
        this.fileStats = new Map();
    }

    collectExports(filePath, content) {
        const exports = [];

        // export default ClassName
        let match;
        const defaultExportRegex = /export\s+default\s+(\w+)/g;
        while ((match = defaultExportRegex.exec(content)) !== null) {
            exports.push({ name: match[1], type: 'default', line: this.getLineNumber(content, match.index) });
        }

        // export const/function/class Name
        const namedExportRegex = /export\s+(?:const|let|var|function|class|async\s+function)\s+(\w+)/g;
        while ((match = namedExportRegex.exec(content)) !== null) {
            exports.push({ name: match[1], type: 'named', line: this.getLineNumber(content, match.index) });
        }

        // export { name1, name2 }
        const namedExportGroupRegex = /export\s+{\s*([^}]+)\s*}/g;
        while ((match = namedExportGroupRegex.exec(content)) !== null) {
            const names = match[1].split(',').map(n => {
                const parts = n.trim().split(/\s+as\s+/);
                return parts[parts.length - 1].trim();
            });
            names.forEach(name => {
                if (name) exports.push({ name, type: 'named', line: this.getLineNumber(content, match.index) });
            });
        }

        // export * from './module'
        const exportAllRegex = /export\s+\*\s+from\s+['"`]([^'"`]+)['"`]/g;
        while ((match = exportAllRegex.exec(content)) !== null) {
            exports.push({ name: '*', type: 're-export', from: match[1], line: this.getLineNumber(content, match.index) });
        }

        // export { name } from './module'
        const exportFromRegex = /export\s+{\s*([^}]+)\s*}\s+from\s+['"`]([^'"`]+)['"`]/g;
        while ((match = exportFromRegex.exec(content)) !== null) {
            const names = match[1].split(',').map(n => n.trim().split(/\s+as\s+/)[0].trim());
            names.forEach(name => {
                if (name) exports.push({ name, type: 're-export', from: match[2], line: this.getLineNumber(content, match.index) });
            });
        }

        this.exports.set(filePath, exports);
        return exports;
    }

    collectImports(filePath, content) {
        const imports = [];
        let match;

        // import Name from './module'
        const defaultImportRegex = /import\s+(\w+)\s+from\s+['"`]([^'"`]+)['"`]/g;
        while ((match = defaultImportRegex.exec(content)) !== null) {
            imports.push({ name: match[1], type: 'default', from: match[2], isLocal: this.isLocalImport(match[2]), line: this.getLineNumber(content, match.index) });
        }

        // import { name1, name2 } from './module'
        const namedImportRegex = /import\s+{\s*([^}]+)\s*}\s+from\s+['"`]([^'"`]+)['"`]/g;
        while ((match = namedImportRegex.exec(content)) !== null) {
            const names = match[1].split(',').map(n => n.trim().split(/\s+as\s+/)[0].trim());
            const fromModule = match[2];
            names.forEach(name => {
                if (name) imports.push({ name, type: 'named', from: fromModule, isLocal: this.isLocalImport(fromModule), line: this.getLineNumber(content, match.index) });
            });
        }

        // import * as Name from './module'
        const namespaceImportRegex = /import\s+\*\s+as\s+(\w+)\s+from\s+['"`]([^'"`]+)['"`]/g;
        while ((match = namespaceImportRegex.exec(content)) !== null) {
            imports.push({ name: match[1], type: 'namespace', from: match[2], isLocal: this.isLocalImport(match[2]), line: this.getLineNumber(content, match.index) });
        }

        // require() calls
        const requireRegex = /(?:const|let|var)\s+(?:{([^}]+)}|(\w+))\s*=\s*require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
        while ((match = requireRegex.exec(content)) !== null) {
            const fromModule = match[3];
            if (match[1]) {
                match[1].split(',').map(n => n.trim()).forEach(name => {
                    if (name) imports.push({ name, type: 'commonjs', from: fromModule, isLocal: this.isLocalImport(fromModule), line: this.getLineNumber(content, match.index) });
                });
            } else {
                imports.push({ name: match[2], type: 'commonjs', from: fromModule, isLocal: this.isLocalImport(fromModule), line: this.getLineNumber(content, match.index) });
            }
        }

        if (!this.imports.has(filePath)) {
            this.imports.set(filePath, []);
        }
        this.imports.get(filePath).push(...imports);
        return imports;
    }

    collectFileStats(filePath) {
        try {
            const stats = fs.statSync(filePath);
            this.fileStats.set(filePath, {
                lastModified: stats.mtime,
                size: stats.size,
                age: Math.floor((Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24))
            });
        } catch (error) {
            // ignore
        }
    }

    buildImportGraph(projectRoot) {
        const graph = new Map();

        this.exports.forEach((exports, filePath) => {
            exports.forEach(exp => {
                const key = `${filePath}::${exp.name}`;
                graph.set(key, {
                    filePath,
                    exportName: exp.name,
                    exportType: exp.type,
                    exportLine: exp.line,
                    importedBy: []
                });
            });
        });

        this.imports.forEach((imports, importingFile) => {
            imports.forEach(imp => {
                if (imp.isLocal) {
                    const resolvedPath = this.resolveImportPath(importingFile, imp.from, projectRoot);

                    if (resolvedPath && this.exports.has(resolvedPath)) {
                        const exports = this.exports.get(resolvedPath);

                        if (imp.type === 'namespace') {
                            exports.forEach(exp => {
                                const key = `${resolvedPath}::${exp.name}`;
                                if (graph.has(key)) {
                                    graph.get(key).importedBy.push({ file: importingFile, line: imp.line, type: 'namespace' });
                                }
                            });
                            return;
                        }

                        let matchingExport = imp.type === 'default'
                            ? exports.find(e => e.type === 'default')
                            : exports.find(e => e.name === imp.name);

                        if (matchingExport) {
                            const key = `${resolvedPath}::${matchingExport.name}`;
                            if (graph.has(key)) {
                                graph.get(key).importedBy.push({ file: importingFile, line: imp.line, importName: imp.name });
                            }
                        }
                    }
                }
            });
        });

        return graph;
    }

    findUnusedExports(importGraph) {
        const unused = [];

        importGraph.forEach((data, key) => {
            if (data.importedBy.length === 0 &&
                data.exportType !== 're-export' &&
                !(data.filePath.includes('index') && data.exportName === 'default')) {
                const fileStats = this.fileStats.get(data.filePath);
                unused.push({
                    file: data.filePath,
                    exportName: data.exportName,
                    exportType: data.exportType,
                    line: data.exportLine,
                    fileAge: fileStats?.age || 0,
                    fileSize: fileStats?.size || 0
                });
            }
        });

        return unused;
    }

    calculateImportStats(importGraph) {
        const stats = {
            totalExports: 0, usedExports: 0, unusedExports: 0,
            totalImports: 0, localImports: 0, externalImports: 0,
            mostImported: [], leastImported: []
        };

        importGraph.forEach((data) => {
            stats.totalExports++;
            if (data.importedBy.length > 0) stats.usedExports++;
            else stats.unusedExports++;
        });

        this.imports.forEach((imports) => {
            stats.totalImports += imports.length;
            stats.localImports += imports.filter(i => i.isLocal).length;
            stats.externalImports += imports.filter(i => !i.isLocal).length;
        });

        const importCounts = [];
        importGraph.forEach((data) => {
            if (data.importedBy.length > 0) {
                importCounts.push({ file: data.filePath, export: data.exportName, count: data.importedBy.length });
            }
        });
        importCounts.sort((a, b) => b.count - a.count);
        stats.mostImported = importCounts.slice(0, 10);
        stats.leastImported = importCounts.slice(-10).reverse();

        return stats;
    }

    /**
     * Per-class import/export metrics for annotation
     */
    getFileMetrics(filePath, importGraph) {
        const fileExports = this.exports.get(filePath) || [];
        let importedByCount = 0;
        let unusedExportCount = 0;
        const importedBy = new Set();

        fileExports.forEach(exp => {
            const key = `${filePath}::${exp.name}`;
            const data = importGraph.get(key);
            if (data) {
                if (data.importedBy.length > 0) {
                    importedByCount += data.importedBy.length;
                    data.importedBy.forEach(i => importedBy.add(i.file));
                } else if (data.exportType !== 're-export') {
                    unusedExportCount++;
                }
            }
        });

        return {
            exportCount: fileExports.length,
            importedByCount,
            importedBy: Array.from(importedBy),
            hasUnusedExports: unusedExportCount > 0,
            unusedExportCount
        };
    }

    resolveImportPath(importingFile, importPath, projectRoot) {
        try {
            const importingDir = path.dirname(importingFile);
            let resolvedPath = path.resolve(importingDir, importPath);
            const extensions = ['.js', '.jsx', '.ts', '.tsx'];

            if (fs.existsSync(resolvedPath)) return resolvedPath;
            for (const ext of extensions) {
                if (fs.existsSync(resolvedPath + ext)) return resolvedPath + ext;
            }
            for (const ext of extensions) {
                const indexPath = path.join(resolvedPath, `index${ext}`);
                if (fs.existsSync(indexPath)) return indexPath;
            }
            return null;
        } catch (error) {
            return null;
        }
    }

    isLocalImport(modulePath) {
        return modulePath.startsWith('./') || modulePath.startsWith('../');
    }

    getLineNumber(content, index) {
        return content.substring(0, index).split('\n').length;
    }
}

module.exports = ImportAnalyzer;
