/**
 * 📊 Analysis Summary Aggregator
 *
 * Generates top-level analysis sections from per-class data.
 * These top-level keys are what SwarmDesk's floating panels consume:
 * - complexityAnalysis (Complexity Overview, Critical Files panels)
 * - gitAnalysis (Git Activity, High Churn panels)
 * - importAnalysis (Unused Exports, Popular Imports panels)
 * - redundancyAnalysis (Similar Classes, Duplicates, Refactoring panels)
 *
 * See floating-panel-system.js lines 3159-3530 for exact schema consumed.
 */

class AnalysisSummary {
    /**
     * Generate complexityAnalysis top-level section.
     * Consumed by: generateComplexityOverviewContent(), generateCriticalFilesContent()
     */
    static generateComplexityAnalysis(classes) {
        const validClasses = classes.filter(c => !c.isExternal && c.complexityMetrics);

        if (validClasses.length === 0) {
            return null;
        }

        // Count threat level distribution
        const dist = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
        let totalCyclomatic = 0;
        let totalCognitive = 0;
        let totalNesting = 0;

        validClasses.forEach(cls => {
            const m = cls.complexityMetrics;
            const level = m.threatLevel || m.label || 'LOW';
            if (dist.hasOwnProperty(level)) dist[level]++;

            totalCyclomatic += m.cyclomaticComplexity || 0;
            totalCognitive += m.cognitiveComplexity || 0;
            totalNesting += m.nestingDepth || 0;
        });

        const count = validClasses.length;

        // Top complex files sorted by cyclomatic complexity
        const topComplexFiles = validClasses
            .map(cls => ({
                name: cls.name,
                file: cls.filePath,
                cyclomaticComplexity: cls.complexityMetrics.cyclomaticComplexity || 0,
                cognitiveComplexity: cls.complexityMetrics.cognitiveComplexity || 0,
                nestingDepth: cls.complexityMetrics.nestingDepth || 0,
                linesOfCode: cls.complexityMetrics.linesOfCode || cls.metrics?.lines || 0,
                threatLevel: cls.complexityMetrics.threatLevel || cls.complexityMetrics.label || 'LOW'
            }))
            .sort((a, b) => b.cyclomaticComplexity - a.cyclomaticComplexity)
            .slice(0, 20);

        return {
            totalClasses: count,
            threatLevelDistribution: dist,
            averageMetrics: {
                cyclomaticComplexity: totalCyclomatic / count,
                cognitiveComplexity: totalCognitive / count,
                nestingDepth: totalNesting / count
            },
            topComplexFiles
        };
    }

    /**
     * Generate gitAnalysis top-level section.
     * Consumed by: generateGitActivityContent(), generateHighChurnContent()
     */
    static generateGitAnalysis(classes) {
        const trackedClasses = classes.filter(c =>
            !c.isExternal && c.gitMetrics && c.gitMetrics.isGitTracked
        );

        if (trackedClasses.length === 0) {
            return null;
        }

        const totalCommits = trackedClasses.reduce((s, c) => s + (c.gitMetrics.commitCount || 0), 0);

        // Most active files (by commit count)
        const mostActiveFiles = trackedClasses
            .map(cls => ({
                name: cls.name,
                file: cls.filePath,
                commits: cls.gitMetrics.commitCount || 0,
                contributors: cls.gitMetrics.contributors?.length || 0,
                lastCommitDaysAgo: cls.gitMetrics.lastCommit?.daysAgo || 0,
                churnRate: cls.gitMetrics.churnRate || 0,
                bugFixRatio: cls.gitMetrics.bugFixRatio || 0
            }))
            .sort((a, b) => b.commits - a.commits)
            .slice(0, 20);

        // High churn files (by churn rate)
        const highChurnFiles = trackedClasses
            .filter(c => c.gitMetrics.churnRate > 0)
            .map(cls => ({
                name: cls.name,
                file: cls.filePath,
                churnRate: cls.gitMetrics.churnRate || 0,
                commits: cls.gitMetrics.commitCount || 0,
                bugFixRatio: cls.gitMetrics.bugFixRatio || 0,
                fileAge: cls.gitMetrics.fileAge || 0,
                lastCommitDaysAgo: cls.gitMetrics.lastCommit?.daysAgo || 0
            }))
            .sort((a, b) => b.churnRate - a.churnRate)
            .slice(0, 20);

        // Contributor summary
        const allContributors = new Set();
        trackedClasses.forEach(c => {
            (c.gitMetrics.contributors || []).forEach(name => allContributors.add(name));
        });

        return {
            totalFilesTracked: trackedClasses.length,
            totalCommits,
            averageCommitsPerFile: Math.round(totalCommits / trackedClasses.length),
            uniqueContributors: allContributors.size,
            contributorNames: Array.from(allContributors),
            mostActiveFiles,
            highChurnFiles
        };
    }

    /**
     * Generate importAnalysis top-level section.
     * Consumed by: generateUnusedExportsContent(), generatePopularImportsContent(), generateImportStatsContent()
     */
    static generateImportAnalysis(importAnalyzer, projectRoot) {
        if (!importAnalyzer) return null;

        const importGraph = importAnalyzer.buildImportGraph(projectRoot);
        const unusedExports = importAnalyzer.findUnusedExports(importGraph);
        const statistics = importAnalyzer.calculateImportStats(importGraph);

        return {
            unusedExports: unusedExports.map(e => ({
                ...e,
                // Convert absolute paths to relative for display
                file: e.file.includes(projectRoot) ? e.file.replace(projectRoot + '/', '') : e.file
            })),
            statistics
        };
    }

    /**
     * Attach all top-level analysis sections to UML output.
     */
    static attachToUML(umlData, options = {}) {
        const { importAnalyzer, redundancyAnalyzer, projectRoot } = options;

        // Complexity analysis (always available since we compute per-class)
        const complexityAnalysis = this.generateComplexityAnalysis(umlData.classes);
        if (complexityAnalysis) {
            umlData.complexityAnalysis = complexityAnalysis;
        }

        // Git analysis (available when git metrics are populated)
        const gitAnalysis = this.generateGitAnalysis(umlData.classes);
        if (gitAnalysis) {
            umlData.gitAnalysis = gitAnalysis;
        }

        // Import analysis (available when import analyzer was run)
        if (importAnalyzer && projectRoot) {
            const importAnalysis = this.generateImportAnalysis(importAnalyzer, projectRoot);
            if (importAnalysis) {
                umlData.importAnalysis = importAnalysis;
            }
        }

        // Redundancy analysis (available when redundancy analyzer was run)
        if (redundancyAnalyzer) {
            const nonExternalClasses = umlData.classes.filter(c => !c.isExternal);
            if (nonExternalClasses.length > 1) {
                console.log(`🔍 Running redundancy analysis on ${nonExternalClasses.length} classes...`);
                const redundancyAnalysis = redundancyAnalyzer.analyzeCodebase(nonExternalClasses);
                umlData.redundancyAnalysis = redundancyAnalysis;

                // Also annotate individual classes
                redundancyAnalyzer.annotateClasses(umlData.classes, redundancyAnalysis);
            }
        }

        return umlData;
    }
}

module.exports = AnalysisSummary;
