#!/usr/bin/env node

/**
 * Real Helios Engine Integration for Demo Backend
 *
 * Provides Node.js interface to the actual Helios CLI binary
 * Showcases real VST operations with <70μs commit performance
 */

const HeliosCliWrapper = require('./helios-cli-wrapper');
const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');

class RealHeliosEngine extends EventEmitter {
    constructor(options = {}) {
        super();
        this.heliosWrapper = new HeliosCliWrapper();
        this.maxUniverses = options.maxUniverses || 10000;
        this.performanceTracking = options.performanceTracking || true;
        this.realTimeMetrics = options.realTimeMetrics || true;

        this.universes = new Map();
        this.metrics = {
            totalCommits: 0,
            totalRestores: 0,
            totalDiffs: 0,
            totalMaterializes: 0,
            averageCommitTime: 0,
            totalOperations: 0,
            engineStartTime: Date.now()
        };

        // Initialize the Helios CLI wrapper
        this.initialize();
    }

    async initialize() {
        try {
            await this.heliosWrapper.initialize();
            console.log('✅ Real Helios Engine initialized successfully');
        } catch (error) {
            console.error('❌ Real Helios Engine initialization failed:', error.message);
            throw error;
        }
    }

    /**
     * Get engine status
     */
    getStatus() {
        return {
            initialized: this.heliosWrapper.initialized,
            totalUniverses: this.universes.size,
            maxUniverses: this.maxUniverses,
            performance: this.performanceTracking,
            realTimeMetrics: this.realTimeMetrics,
            uptime: Date.now() - this.metrics.engineStartTime,
            engineType: 'RealHelios'
        };
    }

    /**
     * Get engine version from real Helios CLI
     */
    async getVersion() {
        try {
            const versionInfo = await this.heliosWrapper.getVersion();
            return versionInfo.version;
        } catch (error) {
            return 'Real Helios Engine v1.0.0 (CLI unavailable)';
        }
    }

    /**
     * Get comprehensive engine metrics
     */
    async getMetrics() {
        const baseMetrics = {
            ...this.metrics,
            universes: {
                total: this.universes.size,
                active: Array.from(this.universes.values()).filter(u => u.active).length,
                inactive: Array.from(this.universes.values()).filter(u => !u.active).length
            },
            performance: {
                averageCommitTime: this.metrics.averageCommitTime,
                totalOperations: this.metrics.totalOperations,
                operationsPerSecond: this.metrics.totalOperations / ((Date.now() - this.metrics.engineStartTime) / 1000)
            }
        };

        // Get real Helios engine stats if available
        try {
            const heliosStats = await this.heliosWrapper.getStats();
            baseMetrics.realHeliosStats = heliosStats.stats;
        } catch (error) {
            baseMetrics.realHeliosStats = { error: 'Stats unavailable' };
        }

        return baseMetrics;
    }

    /**
     * Create a demo universe with real VST operations
     */
    async createUniverse(config = {}) {
        const universeId = uuidv4();
        const universe = new DemoUniverse(universeId, this.heliosWrapper, config, this);

        await universe.initialize();
        this.universes.set(universeId, universe);

        return universe;
    }

    /**
     * Get specific universe
     */
    getUniverse(universeId) {
        return this.universes.get(universeId);
    }

    /**
     * Perform operation on universe
     */
    async performOperation(universeId, operation, params) {
        const universe = this.universes.get(universeId);
        if (!universe) {
            throw new Error(`Universe ${universeId} not found`);
        }

        const startTime = process.hrtime.bigint();
        let result;

        switch (operation) {
            case 'commit':
                result = await universe.commit(params.message);
                this.metrics.totalCommits++;
                break;
            case 'restore':
                result = await universe.restore(params.snapshotId);
                this.metrics.totalRestores++;
                break;
            case 'diff':
                result = await universe.diff(params.fromSnapshot, params.toSnapshot);
                this.metrics.totalDiffs++;
                break;
            case 'materialize':
                result = await universe.materialize(params.snapshotId, params.outputDir);
                this.metrics.totalMaterializes++;
                break;
            default:
                throw new Error(`Unknown operation: ${operation}`);
        }

        const endTime = process.hrtime.bigint();
        const operationTime = Number(endTime - startTime) / 1000000; // milliseconds

        // Update metrics
        this.metrics.totalOperations++;
        if (operation === 'commit') {
            this.metrics.averageCommitTime = (this.metrics.averageCommitTime + operationTime) / 2;
        }

        return {
            ...result,
            operationTime,
            universeId
        };
    }

    /**
     * Shutdown engine gracefully
     */
    shutdown() {
        console.log('🔧 Shutting down Real Helios Engine');
        this.universes.clear();
    }
}

/**
 * Demo Universe class that wraps real Helios operations
 */
class DemoUniverse {
    constructor(id, heliosWrapper, config = {}, engine = null) {
        this.id = id;
        this.heliosWrapper = heliosWrapper;
        this.config = config;
        this.engine = engine; // Reference to main engine for event emission
        this.active = true;
        this.snapshots = [];
        this.createdAt = Date.now();
        this.lastOperation = null;
    }

    async initialize() {
        // Create a demo file to get started
        await this.heliosWrapper.createDemoFile(`universe-${this.id}.txt`, `Demo universe ${this.id} created at ${new Date().toISOString()}`);

        // Initial commit
        const initialCommit = await this.heliosWrapper.commit(`Initial commit for universe ${this.id}`);
        this.snapshots.push(initialCommit.snapshotId);
        this.lastOperation = 'initialize';
    }

    async commit(message) {
        const result = await this.heliosWrapper.commit(message || `Commit in universe ${this.id}`);
        this.snapshots.push(result.snapshotId);
        this.lastOperation = 'commit';

        // Emit event for performance tracking
        this.engine.emit('stateCreated', {
            commitTime: result.metrics.commitTime,
            snapshotId: result.snapshotId,
            universeId: this.id
        });

        return result;
    }

    async restore(snapshotId) {
        const result = await this.heliosWrapper.restore(snapshotId);
        this.lastOperation = 'restore';

        // Emit event for performance tracking
        if (this.engine) {
            this.engine.emit('stateRestored', {
                restoreTime: result.metrics.restoreTime,
                snapshotId: snapshotId,
                universeId: this.id
            });
        }

        return result;
    }

    async diff(fromSnapshot, toSnapshot) {
        const result = await this.heliosWrapper.diff(fromSnapshot, toSnapshot);
        this.lastOperation = 'diff';

        // Emit event for performance tracking
        if (this.engine) {
            this.engine.emit('diffCalculated', {
                diffTime: result.diffStats.executionTime,
                fromSnapshot: fromSnapshot,
                toSnapshot: toSnapshot,
                universeId: this.id
            });
        }

        return result;
    }

    async materialize(snapshotId, outputDir) {
        const result = await this.heliosWrapper.materialize(snapshotId, outputDir);
        this.lastOperation = 'materialize';
        return result;
    }

    getMetadata() {
        return {
            id: this.id,
            active: this.active,
            snapshots: this.snapshots,
            createdAt: this.createdAt,
            lastOperation: this.lastOperation,
            config: this.config
        };
    }

    serialize() {
        return {
            ...this.getMetadata(),
            snapshotCount: this.snapshots.length,
            age: Date.now() - this.createdAt,
            lastSnapshot: this.snapshots[this.snapshots.length - 1] || null
        };
    }
}

module.exports = RealHeliosEngine;