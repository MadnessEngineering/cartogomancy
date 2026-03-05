/**
 * 🔍 Redundancy Analyzer - Detect similar code and refactoring opportunities
 *
 * Ported from generateUML.js.deprecated RedundancyAnalyzer class.
 * Provides: similarityScore, similarClassCount, refactoringPriority per class
 * Unlocks: Similar Classes panel, Duplicates panel, Refactoring panel in SwarmDesk
 *
 * Uses Levenshtein distance for names, Jaccard index for method/field sets,
 * plus structural and dependency comparisons.
 */

class RedundancyAnalyzer {
    constructor(options = {}) {
        this.similarityThreshold = options.similarityThreshold || 0.7;
        this.minMethodsForComparison = options.minMethodsForComparison || 2;
        this.similarityCache = new Map();
    }

    levenshteinDistance(str1, str2) {
        const len1 = str1.length;
        const len2 = str2.length;
        const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));

        for (let i = 0; i <= len1; i++) matrix[i][0] = i;
        for (let j = 0; j <= len2; j++) matrix[0][j] = j;

        for (let i = 1; i <= len1; i++) {
            for (let j = 1; j <= len2; j++) {
                const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j - 1] + cost
                );
            }
        }

        return matrix[len1][len2];
    }

    calculateJaccardSimilarity(setA, setB) {
        if (setA.length === 0 && setB.length === 0) return 1.0;
        if (setA.length === 0 || setB.length === 0) return 0.0;

        const set1 = new Set(setA);
        const set2 = new Set(setB);
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);

        return intersection.size / union.size;
    }

    areClassNamesSimilar(name1, name2) {
        if (name1 === name2) return false;

        const normalize = (name) => {
            return name
                .replace(/^(Base|Abstract|Enhanced|Mobile)/, '')
                .replace(/(Component|Container|Wrapper|Utils)$/, '')
                .toLowerCase();
        };

        const norm1 = normalize(name1);
        const norm2 = normalize(name2);
        const distance = this.levenshteinDistance(norm1, norm2);
        const maxLen = Math.max(norm1.length, norm2.length);

        return maxLen > 0 ? (1 - (distance / maxLen)) > 0.7 : false;
    }

    compareMethodSignatures(class1, class2) {
        if (!class1.methods || !class2.methods) return { matches: [], score: 0 };

        const matches = [];
        class1.methods.forEach(method1 => {
            class2.methods.forEach(method2 => {
                if (method1.name === method2.name) {
                    matches.push({ methodName: method1.name, signatureScore: 1.0, isExactMatch: true });
                }
            });
        });

        const avgScore = matches.length > 0
            ? matches.reduce((sum, m) => sum + m.signatureScore, 0) / matches.length
            : 0;

        return { matches, score: avgScore };
    }

    compareSharedDependencies(class1, class2) {
        const deps1 = class1.dependencies || [];
        const deps2 = class2.dependencies || [];

        if (deps1.length === 0 && deps2.length === 0) return { shared: [], score: 0 };

        const sharedDeps = deps1.filter(dep => deps2.includes(dep));
        return { shared: sharedDeps, score: this.calculateJaccardSimilarity(deps1, deps2) };
    }

    calculateRatioSimilarity(count1, count2) {
        if (count1 === 0 && count2 === 0) return 1.0;
        if (count1 === 0 || count2 === 0) return 0.0;
        return Math.min(count1, count2) / Math.max(count1, count2);
    }

    calculateOverallSimilarity(class1, class2) {
        if (class1.id === class2.id) return null;
        if (class1.type === 'interface' || class2.type === 'interface') return null;

        const methods1Count = class1.methods?.length || 0;
        const methods2Count = class2.methods?.length || 0;
        if (methods1Count < this.minMethodsForComparison && methods2Count < this.minMethodsForComparison) {
            return null;
        }

        const cacheKey = `${class1.id}:${class2.id}`;
        const reverseCacheKey = `${class2.id}:${class1.id}`;
        if (this.similarityCache.has(cacheKey)) return this.similarityCache.get(cacheKey);
        if (this.similarityCache.has(reverseCacheKey)) return this.similarityCache.get(reverseCacheKey);

        const namesSimilar = this.areClassNamesSimilar(class1.name, class2.name);

        const methodNames1 = (class1.methods || []).map(m => m.name);
        const methodNames2 = (class2.methods || []).map(m => m.name);
        const methodNameSimilarity = this.calculateJaccardSimilarity(methodNames1, methodNames2);

        const signatureComparison = this.compareMethodSignatures(class1, class2);

        const fieldNames1 = (class1.fields || []).map(f => f.name);
        const fieldNames2 = (class2.fields || []).map(f => f.name);
        const fieldNameSimilarity = this.calculateJaccardSimilarity(fieldNames1, fieldNames2);

        const dependencyComparison = this.compareSharedDependencies(class1, class2);

        const methodCountSimilarity = this.calculateRatioSimilarity(methods1Count, methods2Count);
        const fieldCountSimilarity = this.calculateRatioSimilarity(class1.fields?.length || 0, class2.fields?.length || 0);
        const structuralScore = methodCountSimilarity * 0.6 + fieldCountSimilarity * 0.4;

        const overallScore = (
            (namesSimilar ? 0.15 : 0) +
            methodNameSimilarity * 0.30 +
            signatureComparison.score * 0.25 +
            fieldNameSimilarity * 0.15 +
            structuralScore * 0.10 +
            dependencyComparison.score * 0.05
        );

        const result = {
            class1Id: class1.id,
            class1Name: class1.name,
            class2Id: class2.id,
            class2Name: class2.name,
            similarityScore: Math.round(overallScore * 100) / 100,
            namesSimilar,
            methodNameSimilarity: Math.round(methodNameSimilarity * 100) / 100,
            matchedMethods: signatureComparison.matches.map(m => m.methodName),
            fieldNameSimilarity: Math.round(fieldNameSimilarity * 100) / 100,
            matchedFields: fieldNames1.filter(f => fieldNames2.includes(f)),
            sharedDependencies: dependencyComparison.shared,
            structuralScore: Math.round(structuralScore * 100) / 100
        };

        this.similarityCache.set(cacheKey, result);
        return result;
    }

    findSimilarClasses(allClasses) {
        const similarPairs = [];
        const n = allClasses.length;

        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                const similarity = this.calculateOverallSimilarity(allClasses[i], allClasses[j]);
                if (similarity && similarity.similarityScore >= this.similarityThreshold) {
                    similarPairs.push(similarity);
                }
            }

            if (i % 50 === 0 && i > 0) {
                console.log(`   Redundancy scan: ${i}/${n} classes...`);
            }
        }

        similarPairs.sort((a, b) => b.similarityScore - a.similarityScore);
        return similarPairs;
    }

    generateRefactoringSuggestions(similarPairs, allClasses) {
        const suggestions = [];
        const classMap = new Map(allClasses.map(cls => [cls.id, cls]));

        similarPairs.forEach(pair => {
            const suggestion = {
                score: pair.similarityScore,
                classes: [pair.class1Name, pair.class2Name],
                recommendations: []
            };

            if (pair.similarityScore > 0.9) {
                suggestion.recommendations.push(`Consider merging ${pair.class1Name} and ${pair.class2Name} - they appear to be duplicates`);
            } else if (pair.similarityScore >= 0.7) {
                if (pair.matchedMethods.length > 3) {
                    suggestion.recommendations.push(`Create a base class for ${pair.class1Name} and ${pair.class2Name}`);
                }
                if (pair.matchedMethods.length > 0) {
                    suggestion.recommendations.push(`Extract common methods (${pair.matchedMethods.slice(0, 3).join(', ')}) into utility functions`);
                }
                if (pair.sharedDependencies.length > 2) {
                    suggestion.recommendations.push(`Both classes share dependencies: ${pair.sharedDependencies.slice(0, 3).join(', ')}`);
                }
            }

            if (suggestion.recommendations.length > 0) suggestions.push(suggestion);
        });

        return suggestions;
    }

    /**
     * Analyze entire codebase for redundancy. Returns top-level redundancyAnalysis object.
     */
    analyzeCodebase(allClasses) {
        const similarPairs = this.findSimilarClasses(allClasses);
        const suggestions = this.generateRefactoringSuggestions(similarPairs, allClasses);

        const classesWithDuplicates = new Set();
        similarPairs.forEach(pair => {
            classesWithDuplicates.add(pair.class1Id);
            classesWithDuplicates.add(pair.class2Id);
        });

        const refactoringScore = classesWithDuplicates.size > 0
            ? Math.round((classesWithDuplicates.size / allClasses.length) * 100)
            : 0;

        return {
            totalClassesAnalyzed: allClasses.length,
            similarPairsFound: similarPairs.length,
            classesAffected: classesWithDuplicates.size,
            refactoringScore,
            similarityThreshold: this.similarityThreshold,
            topSimilarPairs: similarPairs.slice(0, 20),
            suggestions: suggestions.slice(0, 10)
        };
    }

    /**
     * Annotate individual classes with their per-class redundancy data.
     */
    annotateClasses(allClasses, analysisResults) {
        const similarityMap = new Map();

        analysisResults.topSimilarPairs.forEach(pair => {
            if (!similarityMap.has(pair.class1Id)) similarityMap.set(pair.class1Id, []);
            similarityMap.get(pair.class1Id).push({
                className: pair.class2Name,
                similarityScore: pair.similarityScore,
                matchedMethods: pair.matchedMethods,
                sharedDependencies: pair.sharedDependencies
            });

            if (!similarityMap.has(pair.class2Id)) similarityMap.set(pair.class2Id, []);
            similarityMap.get(pair.class2Id).push({
                className: pair.class1Name,
                similarityScore: pair.similarityScore,
                matchedMethods: pair.matchedMethods,
                sharedDependencies: pair.sharedDependencies
            });
        });

        allClasses.forEach(cls => {
            const similarClasses = similarityMap.get(cls.id) || [];
            if (similarClasses.length > 0) {
                cls.redundancyAnalysis = {
                    hasSimilarClasses: true,
                    similarClassCount: similarClasses.length,
                    similarClasses,
                    refactoringPriority: Math.min(
                        Math.round(similarClasses.reduce((s, c) => s + c.similarityScore, 0) / similarClasses.length * similarClasses.length * 10),
                        100
                    )
                };
            }
        });
    }
}

module.exports = RedundancyAnalyzer;
