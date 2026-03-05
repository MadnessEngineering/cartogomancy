/**
 * 🧪 Coverage Analyzer - Parse Jest/Istanbul coverage reports
 *
 * Ported from generateUML.js.deprecated TestCoverageAnalyzer class.
 * Provides: line/branch/function/statement coverage per file
 * Unlocks: Coverage color mode in SwarmDesk (the DEFAULT color mode)
 *
 * Parses coverage-summary.json (standard Jest/Istanbul output).
 */

const fs = require('fs');
const path = require('path');

class CoverageAnalyzer {
    constructor(options = {}) {
        this.projectRoot = options.projectRoot || process.cwd();
        this.coveragePath = options.coveragePath || 'coverage/coverage-summary.json';
        this.coverageData = null;
        this.coverageLoaded = false;
    }

    loadCoverageData() {
        if (this.coverageLoaded) return this.coverageData;
        this.coverageLoaded = true;

        try {
            const coverageFilePath = path.join(this.projectRoot, this.coveragePath);
            if (!fs.existsSync(coverageFilePath)) {
                this.coverageData = null;
                return null;
            }

            this.coverageData = JSON.parse(fs.readFileSync(coverageFilePath, 'utf8'));
            console.log(`📊 Loaded coverage data from ${this.coveragePath}`);
            return this.coverageData;
        } catch (error) {
            console.warn(`⚠️  Failed to load coverage data: ${error.message}`);
            this.coverageData = null;
            return null;
        }
    }

    getCoverageForFile(filePath) {
        const coverageData = this.loadCoverageData();
        if (!coverageData) return null;

        const relativePath = path.relative(this.projectRoot, filePath);

        // Try multiple path formats
        for (const tryPath of [
            relativePath,
            relativePath.replace(/\\/g, '/'),
            relativePath.replace(/^\.\//, ''),
            filePath
        ]) {
            if (coverageData[tryPath]) {
                return this.extractMetrics(coverageData[tryPath]);
            }
        }

        return null;
    }

    extractMetrics(fileCoverage) {
        return {
            lineCoverage: fileCoverage.lines?.pct || 0,
            linesCovered: fileCoverage.lines?.covered || 0,
            linesTotal: fileCoverage.lines?.total || 0,
            branchCoverage: fileCoverage.branches?.pct || 0,
            branchesCovered: fileCoverage.branches?.covered || 0,
            branchesTotal: fileCoverage.branches?.total || 0,
            functionCoverage: fileCoverage.functions?.pct || 0,
            functionsCovered: fileCoverage.functions?.covered || 0,
            functionsTotal: fileCoverage.functions?.total || 0,
            statementCoverage: fileCoverage.statements?.pct || 0,
            statementsCovered: fileCoverage.statements?.covered || 0,
            statementsTotal: fileCoverage.statements?.total || 0,
            hasCoverage: true
        };
    }

    analyzeFile(filePath) {
        const coverage = this.getCoverageForFile(filePath);

        if (!coverage) {
            const testExists = this.findTestFile(filePath);
            return {
                hasCoverage: false,
                overallCoverage: 0,
                hasTests: testExists
            };
        }

        const overallCoverage = Math.round(
            (coverage.lineCoverage + coverage.branchCoverage +
             coverage.functionCoverage + coverage.statementCoverage) / 4
        );

        return {
            ...coverage,
            overallCoverage,
            hasTests: true
        };
    }

    findTestFile(filePath) {
        const dirname = path.dirname(filePath);
        const basename = path.basename(filePath, path.extname(filePath));
        const patterns = [
            `${basename}.test.js`, `${basename}.test.jsx`,
            `${basename}.test.ts`, `${basename}.test.tsx`,
            `${basename}.spec.js`, `${basename}.spec.jsx`
        ];

        return patterns.some(p => fs.existsSync(path.join(dirname, p)) ||
            fs.existsSync(path.join(dirname, '__tests__', p)));
    }

    calculateOverallStats() {
        const coverageData = this.loadCoverageData();
        if (!coverageData || !coverageData.total) {
            return { available: false };
        }

        const total = coverageData.total;
        return {
            available: true,
            overall: {
                lineCoverage: total.lines?.pct || 0,
                branchCoverage: total.branches?.pct || 0,
                functionCoverage: total.functions?.pct || 0,
                statementCoverage: total.statements?.pct || 0
            }
        };
    }
}

module.exports = CoverageAnalyzer;
