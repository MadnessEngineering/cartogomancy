/**
 * 📊 Complexity Analyzer - AST-based code complexity metrics
 *
 * Ported from generateUML.js.deprecated ComplexityAnalyzer class.
 * Provides: proper cognitiveComplexity, nestingDepth, threat levels, refactoring suggestions
 * Replaces: the hardcoded zeros and simple keyword counting in cartogomancy.js
 *
 * Uses TypeScript AST for .ts/.tsx files, regex patterns for .js/.jsx files.
 */

const ts = require('typescript');

class ComplexityAnalyzer {
    constructor() {
        this.THREAT_LEVELS = {
            LOW: { cyclomatic: [0, 5], cognitive: [0, 5], color: 'green', label: 'LOW' },
            MEDIUM: { cyclomatic: [6, 10], cognitive: [6, 10], color: 'yellow', label: 'MEDIUM' },
            HIGH: { cyclomatic: [11, 20], cognitive: [11, 15], color: 'orange', label: 'HIGH' },
            CRITICAL: { cyclomatic: [21, Infinity], cognitive: [16, Infinity], color: 'red', label: 'CRITICAL' }
        };
        this.complexityCache = new Map();
    }

    /**
     * AST-based complexity analysis for TypeScript/JavaScript
     */
    analyzeTypeScriptComplexity(content, sourceFile) {
        let cyclomaticComplexity = 1;
        let cognitiveComplexity = 0;
        let maxNestingDepth = 0;

        const visit = (node, depth = 0, nestingLevel = 0) => {
            maxNestingDepth = Math.max(maxNestingDepth, nestingLevel);

            if (ts.isIfStatement(node)) {
                cyclomaticComplexity++;
                cognitiveComplexity += 1 + nestingLevel;
            } else if (ts.isConditionalExpression(node)) {
                cyclomaticComplexity++;
                cognitiveComplexity += 1 + nestingLevel;
            } else if (ts.isForStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node)) {
                cyclomaticComplexity++;
                cognitiveComplexity += 1 + nestingLevel;
                nestingLevel++;
            } else if (ts.isWhileStatement(node) || ts.isDoStatement(node)) {
                cyclomaticComplexity++;
                cognitiveComplexity += 1 + nestingLevel;
                nestingLevel++;
            } else if (ts.isSwitchStatement(node)) {
                cyclomaticComplexity++;
                cognitiveComplexity += 1 + nestingLevel;
                nestingLevel++;
            } else if (ts.isCaseClause(node)) {
                cyclomaticComplexity++;
            } else if (ts.isCatchClause(node)) {
                cyclomaticComplexity++;
                cognitiveComplexity += 1 + nestingLevel;
                nestingLevel++;
            } else if (ts.isBinaryExpression(node)) {
                if (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
                    node.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
                    cyclomaticComplexity++;
                }
            }

            if (ts.isBlock(node)) {
                nestingLevel++;
            }

            ts.forEachChild(node, (child) => visit(child, depth + 1, nestingLevel));
        };

        visit(sourceFile);

        return { cyclomaticComplexity, cognitiveComplexity, nestingDepth: maxNestingDepth };
    }

    /**
     * Regex-based complexity analysis fallback for plain JavaScript
     */
    analyzeJavaScriptComplexity(content) {
        let cyclomaticComplexity = 1;
        let cognitiveComplexity = 0;

        const patterns = {
            if: /\bif\s*\(/g,
            elseif: /\belse\s+if\s*\(/g,
            for: /\bfor\s*\(/g,
            while: /\bwhile\s*\(/g,
            case: /\bcase\s+/g,
            catch: /\bcatch\s*\(/g,
            ternary: /\?[^:]+:/g,
            andOr: /&&|\|\|/g
        };

        for (const [key, regex] of Object.entries(patterns)) {
            const matches = content.match(regex);
            if (matches) {
                cyclomaticComplexity += matches.length;
                if (key === 'if' || key === 'for' || key === 'while') {
                    cognitiveComplexity += matches.length;
                }
            }
        }

        const nestingDepth = this.calculateNestingDepth(content);
        cognitiveComplexity += Math.max(0, nestingDepth - 1) * 2;

        return { cyclomaticComplexity, cognitiveComplexity, nestingDepth };
    }

    calculateNestingDepth(content) {
        let maxDepth = 0;
        let currentDepth = 0;

        const cleanContent = content
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/\/\/.*/g, '')
            .replace(/(['"`])(?:(?=(\\?))\2.)*?\1/g, '');

        for (let char of cleanContent) {
            if (char === '{') {
                currentDepth++;
                maxDepth = Math.max(maxDepth, currentDepth);
            } else if (char === '}') {
                currentDepth--;
            }
        }

        return maxDepth;
    }

    countLinesOfCode(content) {
        const lines = content.split('\n');
        let loc = 0;
        let inBlockComment = false;

        for (let line of lines) {
            const trimmed = line.trim();
            if (trimmed === '') continue;
            if (trimmed.startsWith('/*')) inBlockComment = true;
            if (inBlockComment) {
                if (trimmed.endsWith('*/') || trimmed.includes('*/')) inBlockComment = false;
                continue;
            }
            if (trimmed.startsWith('//')) continue;
            loc++;
        }

        return loc;
    }

    determineThreatLevel(metrics) {
        const { cyclomaticComplexity, cognitiveComplexity } = metrics;
        let threatLevel = 'LOW';

        for (const [level, thresholds] of Object.entries(this.THREAT_LEVELS)) {
            const [cycloMin, cycloMax] = thresholds.cyclomatic;
            const [cogMin, cogMax] = thresholds.cognitive;

            if ((cyclomaticComplexity >= cycloMin && cyclomaticComplexity <= cycloMax) ||
                (cognitiveComplexity >= cogMin && cognitiveComplexity <= cogMax)) {
                threatLevel = level;
            }
        }

        return {
            threatLevel,
            threatColor: this.THREAT_LEVELS[threatLevel].color,
            label: this.THREAT_LEVELS[threatLevel].label
        };
    }

    generateSuggestions(metrics) {
        const suggestions = [];
        const { cyclomaticComplexity, cognitiveComplexity, nestingDepth, linesOfCode } = metrics;

        if (cyclomaticComplexity > 20) {
            suggestions.push('Break down into smaller methods or components');
        } else if (cyclomaticComplexity > 10) {
            suggestions.push('Consider extracting some logic into helper functions');
        }

        if (nestingDepth > 4) {
            suggestions.push('Reduce nesting depth using early returns or guard clauses');
        } else if (nestingDepth > 3) {
            suggestions.push('Consider flattening nested conditionals');
        }

        if (cognitiveComplexity > 15) {
            suggestions.push('Simplify logic to improve readability');
        }

        if (linesOfCode > 300) {
            suggestions.push('Consider splitting into multiple smaller files');
        } else if (linesOfCode > 150) {
            suggestions.push('File is getting large - consider refactoring');
        }

        if (suggestions.length === 0) {
            suggestions.push('Code complexity is within acceptable limits');
        }

        return suggestions;
    }

    /**
     * Main entry point: analyze a file and return full complexity metrics.
     */
    analyzeFile(filePath, content, isTypeScript) {
        if (this.complexityCache.has(filePath)) {
            return this.complexityCache.get(filePath);
        }

        let metrics;

        if (isTypeScript) {
            try {
                const sourceFile = ts.createSourceFile(
                    filePath, content, ts.ScriptTarget.Latest, true
                );
                metrics = this.analyzeTypeScriptComplexity(content, sourceFile);
            } catch (error) {
                metrics = this.analyzeJavaScriptComplexity(content);
            }
        } else {
            metrics = this.analyzeJavaScriptComplexity(content);
        }

        const linesOfCode = this.countLinesOfCode(content);
        const threat = this.determineThreatLevel(metrics);

        const result = {
            cyclomaticComplexity: metrics.cyclomaticComplexity,
            cognitiveComplexity: metrics.cognitiveComplexity,
            nestingDepth: metrics.nestingDepth,
            linesOfCode,
            ...threat,
            suggestions: this.generateSuggestions({ ...metrics, linesOfCode })
        };

        this.complexityCache.set(filePath, result);
        return result;
    }
}

module.exports = ComplexityAnalyzer;
