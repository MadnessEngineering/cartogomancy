/**
 * 📜 Git Analyzer - Extract git history metrics for codebase evolution tracking
 *
 * Ported from generateUML.js.deprecated GitAnalyzer class.
 * Provides: commitCount, contributors[], churnRate, bugFixRatio, fileAge
 * Unlocks: Churn Rate, Staleness, and Activity Level color modes in SwarmDesk
 *
 * PERFORMANCE: Uses single batched git log command per file with aggressive caching.
 */

const { execSync } = require('child_process');

class GitAnalyzer {
    constructor(options = {}) {
        this.projectRoot = options.projectRoot || process.cwd();
        this.gitCache = new Map();
        this.isGitRepo = this.checkIfGitRepo();
        this.cacheHits = 0;
        this.cacheMisses = 0;
    }

    checkIfGitRepo() {
        try {
            // Find the actual git repo root (may differ from projectRoot in monorepos)
            this.gitRoot = execSync('git rev-parse --show-toplevel', {
                cwd: this.projectRoot,
                encoding: 'utf8'
            }).trim();
            return true;
        } catch (error) {
            this.gitRoot = this.projectRoot;
            return false;
        }
    }

    /**
     * Analyze complete git metrics for a file (with caching).
     * Single batched git log command extracts everything at once.
     */
    analyzeFile(filePath) {
        if (!this.isGitRepo) {
            return this.emptyMetrics();
        }

        if (this.gitCache.has(filePath)) {
            this.cacheHits++;
            return this.gitCache.get(filePath);
        }

        this.cacheMisses++;

        // Resolve to path relative to git root (handles monorepo subdirectories)
        const path = require('path');
        const absolutePath = path.resolve(this.projectRoot, filePath);
        const gitRelativePath = path.relative(this.gitRoot, absolutePath);

        try {
            const logResult = execSync(
                `git log --follow --numstat --format="COMMIT|%ai|%an|%s|%h" -- "${gitRelativePath}"`,
                { cwd: this.gitRoot, encoding: 'utf8', timeout: 5000 }
            );

            if (!logResult.trim()) {
                const empty = this.emptyMetrics();
                this.gitCache.set(filePath, empty);
                return empty;
            }

            const lines = logResult.trim().split('\n');
            const commits = [];
            let currentCommit = null;
            const contributorsSet = new Set();
            let totalAdded = 0;
            let totalDeleted = 0;
            let bugFixCount = 0;

            lines.forEach(line => {
                if (line.startsWith('COMMIT|')) {
                    if (currentCommit) commits.push(currentCommit);
                    const [_, date, author, message, hash] = line.split('|');
                    contributorsSet.add(author);

                    if (/\b(fix|bug|patch|hotfix|bugfix|repair|correct)\b/i.test(message)) {
                        bugFixCount++;
                    }

                    currentCommit = { date, author, message, hash };
                } else if (line.trim() && currentCommit) {
                    const [added, deleted] = line.trim().split(/\s+/);
                    if (added !== '-') totalAdded += parseInt(added) || 0;
                    if (deleted !== '-') totalDeleted += parseInt(deleted) || 0;
                }
            });

            if (currentCommit) commits.push(currentCommit);

            const commitCount = commits.length;
            const contributors = Array.from(contributorsSet);
            const lastCommit = commits[0] ? {
                date: new Date(commits[0].date),
                author: commits[0].author,
                message: commits[0].message,
                hash: commits[0].hash,
                daysAgo: Math.floor((Date.now() - new Date(commits[0].date).getTime()) / (1000 * 60 * 60 * 24))
            } : null;

            const createdDate = commits[commits.length - 1] ? new Date(commits[commits.length - 1].date) : null;
            const fileAge = createdDate ? Math.max(1, Math.floor((Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24))) : 0;

            const totalChanges = totalAdded + totalDeleted;
            const churnRate = fileAge > 0 ? Math.round((totalChanges / fileAge) * 100) / 100 : 0;
            const bugFixRatio = commitCount > 0 ? Math.round((bugFixCount / commitCount) * 100) / 100 : 0;

            const metrics = {
                commitCount,
                contributors,
                lastCommit,
                churnRate,
                bugFixRatio,
                createdDate,
                fileAge,
                totalLinesChanged: totalChanges,
                isGitTracked: true
            };

            this.gitCache.set(filePath, metrics);
            return metrics;

        } catch (error) {
            const errorMetrics = {
                ...this.emptyMetrics(),
                error: error.message
            };
            this.gitCache.set(filePath, errorMetrics);
            return errorMetrics;
        }
    }

    emptyMetrics() {
        return {
            commitCount: 0,
            contributors: [],
            lastCommit: null,
            churnRate: 0,
            bugFixRatio: 0,
            createdDate: null,
            fileAge: 0,
            totalLinesChanged: 0,
            isGitTracked: false
        };
    }

    getCacheStats() {
        return {
            cacheSize: this.gitCache.size,
            cacheHits: this.cacheHits,
            cacheMisses: this.cacheMisses,
            hitRate: this.cacheHits > 0 ? Math.round((this.cacheHits / (this.cacheHits + this.cacheMisses)) * 100) : 0
        };
    }

    clearCache() {
        this.gitCache.clear();
        this.cacheHits = 0;
        this.cacheMisses = 0;
    }
}

module.exports = GitAnalyzer;
