/**
 * 🔬 Mad Tinker — Possibility Engine
 *
 * NOT a critic. NOT an optimizer.
 *
 * When the redundancy analyzer finds N similar things, the conventional
 * response is "consolidate them into 1." The Mad Tinker asks instead:
 * what does having N prove about the design space — and what's the N+1th
 * configuration nobody has built yet?
 *
 * Algorithm:
 *   1. Cluster similarity pairs into groups (connected components)
 *   2. For each cluster: build text observations from class names, methods,
 *      file paths, and shared dependencies
 *   3. Map each observation onto 10 software design axes (sync/async,
 *      stateful/stateless, local/remote, push/pull, etc.)
 *   4. Find unexplored cells in the resulting morphological grid
 *   5. Score gaps by interestingness (wildness-weighted)
 *   6. Return a Possibility Report per cluster: the Mad Tinker's Pick is
 *      the highest-scoring unexplored cell with a synthesis question
 *      and a directive to BUILD rather than consolidate
 */

// ─── Design Axes ────────────────────────────────────────────────────────────
// Each axis has two poles and keyword lists. Keywords are tested as substrings
// of the lowercased observation text. Careful: no keyword should appear inside
// an opposing pole's keyword (e.g. "state" inside "stateless" → false ties).

const AXES = [
    {
        name: 'execution_model',
        label: 'Sync ↔ Async',
        poles: ['synchronous', 'asynchronous'],
        keywords: {
            synchronous:  ['blocking', 'sequential', 'synchronous', 'serial', 'in-line', 'immediate'],
            asynchronous: ['async', 'await', 'promise', 'callback', 'non-blocking', 'concurrent',
                           'deferred', 'event-driven', 'reactive', 'coroutine', 'asynchronous'],
        },
    },
    {
        name: 'state_model',
        label: 'Stateful ↔ Stateless',
        poles: ['stateful', 'stateless'],
        keywords: {
            stateful:  ['stateful', 'session', 'persistent', 'mutable', 'stored', 'retains',
                        'store', 'cache', 'registry', 'repository', 'manager', 'context'],
            stateless: ['stateless', 'pure', 'idempotent', 'functional', 'immutable',
                        'no state', 'no session', 'no server state'],
        },
    },
    {
        name: 'locality',
        label: 'Local ↔ Remote',
        poles: ['local', 'remote'],
        keywords: {
            local:  ['local', 'in-process', 'embedded', 'on-device', 'in-memory',
                     'loopback', 'localhost', 'file', 'fs', 'disk'],
            remote: ['remote', 'http', 'fetch', 'api', 'client', 'server', 'network',
                     'cloud', 'external', 'rpc', 'socket', 'websocket', 'provider'],
        },
    },
    {
        name: 'data_flow',
        label: 'Push ↔ Pull',
        poles: ['push', 'pull'],
        keywords: {
            push: ['push', 'emit', 'broadcast', 'publish', 'webhook', 'notify',
                   'dispatch', 'event', 'stream', 'subscribe', 'observer'],
            pull: ['pull', 'poll', 'fetch', 'lookup', 'query', 'request',
                   'demand', 'getter', 'read', 'load', 'retrieve'],
        },
    },
    {
        name: 'evaluation',
        label: 'Eager ↔ Lazy',
        poles: ['eager', 'lazy'],
        keywords: {
            eager: ['eager', 'preload', 'warmup', 'precompute', 'startup',
                    'bootstrap', 'init', 'prefetch', 'constructor'],
            lazy:  ['lazy', 'on-demand', 'deferred', 'just-in-time', 'proxy',
                    'memoize', 'compute-on-use'],
        },
    },
    {
        name: 'scope',
        label: 'Centralized ↔ Distributed',
        poles: ['centralized', 'distributed'],
        keywords: {
            centralized:  ['centralized', 'singleton', 'monolithic', 'hub',
                           'controller', 'orchestrator', 'coordinator', 'router'],
            distributed:  ['distributed', 'decentralized', 'mesh', 'peer',
                           'agent', 'swarm', 'worker', 'shard', 'replica'],
        },
    },
    {
        name: 'visibility',
        label: 'Explicit ↔ Implicit',
        poles: ['explicit', 'implicit'],
        keywords: {
            explicit: ['explicit', 'typed', 'schema', 'contract', 'interface',
                       'defined', 'declared', 'validator', 'schema'],
            implicit: ['implicit', 'dynamic', 'inferred', 'convention', 'magic',
                       'duck', 'any', 'generic', 'mixin'],
        },
    },
    {
        name: 'time_model',
        label: 'Real-time ↔ Batch',
        poles: ['real-time', 'batch'],
        keywords: {
            'real-time': ['real-time', 'live', 'instant', 'continuous', 'streaming',
                          'tick', 'realtime', 'interval', 'watch'],
            batch:       ['batch', 'scheduled', 'cron', 'periodic', 'bulk',
                          'aggregate', 'etl', 'queue', 'job'],
        },
    },
    {
        name: 'trust_model',
        label: 'Trusted ↔ Zero-trust',
        poles: ['trusted', 'zero-trust'],
        keywords: {
            trusted:      ['trusted', 'internal', 'privileged', 'admin', 'pre-verified'],
            'zero-trust': ['zero-trust', 'untrusted', 'verify', 'mutual', 'attest',
                           'challenge', 'auth', 'token', 'jwt', 'oauth'],
        },
    },
    {
        name: 'coupling',
        label: 'Tight ↔ Loose',
        poles: ['tight', 'loose'],
        keywords: {
            tight: ['tightly', 'hardcoded', 'extends', 'inherit', 'embedded', 'direct'],
            loose: ['loosely', 'decoupled', 'plugin', 'injectable', 'abstract',
                    'interface', 'adapter', 'middleware', 'hook', 'wrapper'],
        },
    },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Map a text observation onto each axis. Returns { axisName: pole | null }.
 * null means the observation doesn't lean either way on that axis.
 */
function profileObservation(text) {
    const t = text.toLowerCase();
    const profile = {};
    for (const axis of AXES) {
        const scores = {};
        for (const [pole, keywords] of Object.entries(axis.keywords)) {
            scores[pole] = keywords.filter(kw => t.includes(kw)).length;
        }
        const [p0, p1] = axis.poles;
        if (scores[p0] > scores[p1])      profile[axis.name] = p0;
        else if (scores[p1] > scores[p0]) profile[axis.name] = p1;
        else                              profile[axis.name] = null;
    }
    return profile;
}

/**
 * Return axes that have coverage across the observations.
 * Prefers axes where observations span both poles (real variation),
 * falls back to axes with any coverage.
 */
function activeAxes(profiles) {
    const bothPoles = [], onePole = [];
    for (const axis of AXES) {
        const values = profiles.map(p => p[axis.name]).filter(v => v !== null);
        const distinct = new Set(values);
        if (distinct.size >= 2)       bothPoles.push(axis);
        else if (distinct.size === 1) onePole.push(axis);
    }
    return [...bothPoles, ...onePole];
}

/**
 * Count how many axis values differ between a candidate cell and a profile.
 */
function hammingDistance(cell, profile) {
    let dist = 0;
    for (const [k, v] of Object.entries(cell)) {
        const pv = profile[k];
        if (pv !== null && pv !== v) dist++;
    }
    return dist;
}

/**
 * Score an unexplored cell for interestingness.
 * wildness 1-4 → favor adjacent; 8-10 → favor far-flung.
 */
function scoreGap(cell, profiles, wildness) {
    if (!profiles.length) return wildness;
    const distances = profiles.map(p => hammingDistance(cell, p));
    const minDist = Math.min(...distances);
    const avgDist = distances.reduce((a, b) => a + b, 0) / distances.length;
    const wf = wildness / 10;
    let score = avgDist * wf + minDist * (1 - wf);
    // Bonus: cells that engage more axes are more interesting
    score += Object.values(cell).filter(v => v !== null).length * 0.2;
    return Math.round(score * 1000) / 1000;
}

/**
 * Cartesian product of an array of arrays.
 */
function cartesian(arrays) {
    return arrays.reduce(
        (acc, arr) => acc.flatMap(a => arr.map(v => [...a, v])),
        [[]]
    );
}

/**
 * Build clusters (connected components) from a list of similarity pairs.
 * Each pair is { class1Id, class1Name, class2Id, class2Name, ... }.
 * Returns an array of clusters: [{ ids: Set, names: Map<id→name> }]
 */
function buildClusters(similarPairs) {
    const parent = new Map();

    function find(id) {
        if (!parent.has(id)) parent.set(id, id);
        if (parent.get(id) !== id) parent.set(id, find(parent.get(id)));
        return parent.get(id);
    }

    function union(a, b) {
        parent.set(find(a), find(b));
    }

    const nameMap = new Map();
    for (const pair of similarPairs) {
        nameMap.set(pair.class1Id, pair.class1Name);
        nameMap.set(pair.class2Id, pair.class2Name);
        union(pair.class1Id, pair.class2Id);
    }

    // Group by root
    const groups = new Map();
    for (const id of nameMap.keys()) {
        const root = find(id);
        if (!groups.has(root)) groups.set(root, new Set());
        groups.get(root).add(id);
    }

    // Only return clusters with 2+ members
    return Array.from(groups.values())
        .filter(ids => ids.size >= 2)
        .map(ids => ({
            ids,
            members: Array.from(ids).map(id => ({
                id,
                name: nameMap.get(id),
            })),
        }));
}

/**
 * Build a text observation for a class member using everything cartogomancy
 * already knows about it: name, file path, methods, fields, dependencies.
 */
function buildObservation(memberId, memberName, allClasses) {
    const cls = allClasses.find(c => c.id === memberId);
    if (!cls) return memberName;

    const parts = [memberName];
    if (cls.filePath) parts.push(`at ${cls.filePath}`);
    if (cls.methods?.length)
        parts.push(`methods: ${cls.methods.map(m => m.name).join(', ')}`);
    if (cls.fields?.length)
        parts.push(`fields: ${cls.fields.map(f => f.name).join(', ')}`);
    if (cls.dependencies?.length)
        parts.push(`deps: ${cls.dependencies.slice(0, 5).join(', ')}`);
    return parts.join(' — ');
}

// ─── Core Analysis ───────────────────────────────────────────────────────────

/**
 * Run Mad Tinker analysis on a single cluster.
 *
 * @param {Array}  members   - [{id, name}] cluster members
 * @param {Array}  allClasses - full class list from UML (for method/field data)
 * @param {number} wildness  - 1-10
 * @returns {Object} possibility report
 */
function analyzeCluster(members, allClasses, wildness = 5) {
    // Build rich text observations from class metadata
    const observations = members.map(m =>
        buildObservation(m.id, m.name, allClasses)
    );

    // Profile each observation against all axes
    const profiles = observations.map(profileObservation);

    // Find axes with coverage (capped at 4 — more axes = too many cells)
    const axes = activeAxes(profiles).slice(0, 4);

    if (!axes.length) {
        return {
            observations: observations.map(o => o.slice(0, 100)),
            note: 'Insufficient axis variation detected — observations may need richer metadata.',
            gaps: [],
            madTinkersPick: null,
        };
    }

    const axisNames  = axes.map(a => a.name);
    const axisLabels = Object.fromEntries(axes.map(a => [a.name, a.label]));
    const poleSets   = axes.map(a => a.poles);

    // All cells in the morphological grid
    const allCells = cartesian(poleSets).map(combo =>
        Object.fromEntries(axisNames.map((n, i) => [n, combo[i]]))
    );

    // A cell is "covered" if any profile matches it on every non-null axis
    const isCovered = cell => profiles.some(p =>
        axisNames.every(k => p[k] === null || p[k] === cell[k])
    );

    const gaps = allCells.filter(cell => !isCovered(cell));

    // Score and rank
    const ranked = gaps
        .map(cell => ({ cell, score: scoreGap(cell, profiles, wildness) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

    // Human-readable axis description for a cell
    const describeCell = cell =>
        Object.entries(cell)
            .map(([k, v]) => `${axisLabels[k]} → ${v}`)
            .join(', ');

    const formattedGaps = ranked.map(({ cell, score }) => {
        const desc = describeCell(cell);
        return {
            configuration: cell,
            description:   desc,
            score,
            question: (
                `What would a [${members.map(m => m.name).join(' / ')}]-style thing look like ` +
                `if it were [${desc}]? ` +
                `What problem could ONLY this configuration solve that none of the ` +
                `${members.length} existing ones can?`
            ),
        };
    });

    // Mad Tinker's Pick
    const pick = formattedGaps[0] ?? null;
    const reach =
        wildness >= 8 ? 'far-flung — edge of the map' :
        wildness <= 3 ? 'adjacent — close enough to build next sprint' :
                        'reachable but novel';

    const madTinkersPick = pick ? {
        configuration:  pick.configuration,
        description:    pick.description,
        whyInteresting: (
            `None of the ${members.length} similar patterns in this cluster occupy ` +
            `the [${pick.description}] cell. ` +
            `At wildness ${wildness}/10: ${reach}.`
        ),
        theQuestion:    pick.question,
        directive: (
            'Do NOT consolidate these. Do NOT pick the best one. ' +
            'Describe what a concrete implementation of this unexplored configuration ' +
            'would look like, what it makes possible that none of the existing ones can do, ' +
            'and what the first experiment to test it would be.'
        ),
    } : null;

    return {
        observations: observations.map(o => o.slice(0, 150)),
        axesDetected: axes.map(a => ({ key: a.name, label: a.label })),
        observationMap: members.map((m, i) => ({
            name:     m.name,
            detected: Object.fromEntries(
                Object.entries(profiles[i])
                    .filter(([k, v]) => v !== null && axisNames.includes(k))
            ),
        })),
        grid: {
            totalCells:      allCells.length,
            coveredCells:    allCells.length - gaps.length,
            unexploredCells: gaps.length,
        },
        topUnexploredCells: formattedGaps,
        madTinkersPick,
    };
}

// ─── Public API ──────────────────────────────────────────────────────────────

class MadTinker {
    constructor(options = {}) {
        this.wildness = Math.max(1, Math.min(10, options.wildness ?? 5));
        this.minClusterSize = options.minClusterSize ?? 2;
    }

    /**
     * Analyze a codebase's similarity clusters and return a possibilityAnalysis
     * section to attach to the UML output.
     *
     * @param {Object} redundancyAnalysis - output of RedundancyAnalyzer.analyzeCodebase()
     * @param {Array}  allClasses         - full class list from UML
     * @returns {Object} possibilityAnalysis
     */
    analyzeCodebase(redundancyAnalysis, allClasses) {
        const { topSimilarPairs = [] } = redundancyAnalysis;
        if (!topSimilarPairs.length) {
            return { clustersFound: 0, clusters: [], note: 'No similarity clusters found.' };
        }

        const clusters = buildClusters(topSimilarPairs)
            .filter(c => c.members.length >= this.minClusterSize);

        const reports = clusters.map(cluster => {
            const report = analyzeCluster(cluster.members, allClasses, this.wildness);
            return {
                clusterSize: cluster.members.length,
                members:     cluster.members.map(m => m.name),
                ...report,
            };
        });

        // Sort: clusters with a pick and higher-scoring gaps first
        reports.sort((a, b) => {
            const aScore = a.madTinkersPick ? (a.topUnexploredCells[0]?.score ?? 0) : -1;
            const bScore = b.madTinkersPick ? (b.topUnexploredCells[0]?.score ?? 0) : -1;
            return bScore - aScore;
        });

        return {
            wildness:      this.wildness,
            clustersFound: reports.length,
            clusters:      reports,
        };
    }
}

module.exports = MadTinker;
