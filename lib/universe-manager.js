/**
 * Universe Manager
 *
 * High-level management for parallel universes in Helios Engine
 * Handles batch operations, scheduling, and universe lifecycle
 */

const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');

class UniverseManager extends EventEmitter {
  constructor(heliosEngine) {
    super();

    this.heliosEngine = heliosEngine;
    this.universes = new Map();
    this.operationQueue = [];
    this.batchOperations = new Map();

    this.statistics = {
      totalCreated: 0,
      totalDestroyed: 0,
      operationsCompleted: 0,
      batchOperationsCompleted: 0,
      averageCreationTime: 0,
      peakConcurrentUniverses: 0
    };

    this.config = {
      maxConcurrentOperations: 100,
      batchSize: 50,
      autoCleanup: true,
      performanceTracking: true
    };

    this.isProcessing = false;
    this.startOperationProcessor();
  }

  /**
   * Create multiple universes efficiently
   */
  async createUniverses(count, config = {}) {
    const startTime = process.hrtime.bigint();
    const batchId = uuidv4();

    try {
      // Validate input
      if (count <= 0 || count > 10000) {
        throw new Error('Universe count must be between 1 and 10000');
      }

      const universes = [];
      const batchSize = Math.min(this.config.batchSize, count);

      // Create universes in batches for better performance
      for (let i = 0; i < count; i += batchSize) {
        const currentBatchSize = Math.min(batchSize, count - i);
        const batchPromises = [];

        for (let j = 0; j < currentBatchSize; j++) {
          const universeConfig = {
            ...config,
            batchId,
            index: i + j,
            metadata: {
              ...config.metadata,
              batchId,
              creationIndex: i + j,
              createdAt: Date.now()
            }
          };

          batchPromises.push(this.heliosEngine.createUniverse(universeConfig));
        }

        const batchUniverses = await Promise.all(batchPromises);
        universes.push(...batchUniverses);

        // Track each universe
        batchUniverses.forEach(universe => {
          this.universes.set(universe.id, {
            universe,
            createdAt: Date.now(),
            batchId,
            operations: []
          });
        });
      }

      const endTime = process.hrtime.bigint();
      const operationTime = Number(endTime - startTime) / 1000000;

      // Update statistics
      this.statistics.totalCreated += count;
      this.statistics.averageCreationTime =
        (this.statistics.averageCreationTime + (operationTime / count)) / 2;
      this.statistics.peakConcurrentUniverses =
        Math.max(this.statistics.peakConcurrentUniverses, this.universes.size);

      const batchResult = {
        batchId,
        count,
        universes,
        performance: {
          totalTime: `${operationTime.toFixed(2)}ms`,
          averagePerUniverse: `${(operationTime / count).toFixed(2)}ms`,
          throughput: `${(count / operationTime * 1000).toFixed(0)} universes/second`,
          memoryUsage: process.memoryUsage()
        },
        metadata: {
          batchSize: batchSize,
          actualBatches: Math.ceil(count / batchSize),
          startTime: Date.now() - operationTime,
          endTime: Date.now()
        }
      };

      this.emit('batch:created', batchResult);
      return universes;

    } catch (error) {
      this.emit('batch:error', { batchId, error: error.message, count });
      throw error;
    }
  }

  /**
   * Get universe by ID
   */
  async getUniverse(id) {
    const universeData = this.universes.get(id);
    if (!universeData) {
      return null;
    }

    return universeData.universe;
  }

  /**
   * Perform operation on a universe
   */
  async performOperation(universeId, operation, params = {}) {
    const startTime = process.hrtime.bigint();

    const universeData = this.universes.get(universeId);
    if (!universeData) {
      throw new Error(`Universe ${universeId} not found`);
    }

    const operationId = uuidv4();
    let result;

    try {
      switch (operation) {
        case 'snapshot':
          result = await this.createSnapshot(universeData.universe, params);
          break;
        case 'clone':
          result = await this.cloneUniverse(universeData.universe, params);
          break;
        case 'update':
          result = await this.updateUniverse(universeData.universe, params);
          break;
        case 'branch':
          result = await this.branchUniverse(universeData.universe, params);
          break;
        case 'merge':
          result = await this.mergeUniverse(universeData.universe, params);
          break;
        case 'analyze':
          result = await this.analyzeUniverse(universeData.universe, params);
          break;
        default:
          throw new Error(`Unknown operation: ${operation}`);
      }

      const endTime = process.hrtime.bigint();
      const operationTime = Number(endTime - startTime) / 1000000;

      // Track operation
      const operationRecord = {
        id: operationId,
        operation,
        params,
        result: result.metadata || result,
        executionTime: operationTime,
        timestamp: Date.now()
      };

      universeData.operations.push(operationRecord);
      this.statistics.operationsCompleted++;

      this.emit('operation:completed', {
        universeId,
        operationId,
        operation,
        executionTime: operationTime,
        result: result.metadata || result
      });

      return {
        operationId,
        operation,
        result,
        performance: {
          executionTime: `${operationTime.toFixed(2)}ms`
        },
        metadata: {
          universeId,
          timestamp: Date.now(),
          operationIndex: universeData.operations.length
        }
      };

    } catch (error) {
      this.emit('operation:error', {
        universeId,
        operationId,
        operation,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Create snapshot of universe
   */
  async createSnapshot(universe, params = {}) {
    const snapshot = universe.createSnapshot({
      name: params.name || `Snapshot-${Date.now()}`,
      description: params.description || 'Auto-generated snapshot',
      tags: params.tags || [],
      ...params.metadata
    });

    return {
      snapshot,
      metadata: {
        type: 'snapshot',
        universeId: universe.id,
        snapshotId: snapshot.id,
        operation: 'create_snapshot'
      }
    };
  }

  /**
   * Clone universe using COW optimization
   */
  async cloneUniverse(universe, params = {}) {
    const clone = universe.clone({
      name: params.name || `Clone-${Date.now()}`,
      copyState: params.copyState !== false,
      inheritMetadata: params.inheritMetadata !== false,
      ...params.metadata
    });

    // Register the clone in our management system
    this.universes.set(clone.id, {
      universe: clone,
      createdAt: Date.now(),
      parentId: universe.id,
      operations: []
    });

    this.statistics.totalCreated++;

    return {
      clone,
      metadata: {
        type: 'clone',
        sourceId: universe.id,
        cloneId: clone.id,
        operation: 'clone_universe'
      }
    };
  }

  /**
   * Update universe state
   */
  async updateUniverse(universe, params = {}) {
    const { updates, merge = true } = params;

    if (!updates || typeof updates !== 'object') {
      throw new Error('Updates parameter must be an object');
    }

    const updateResult = universe.updateState(updates);

    return {
      updateResult,
      metadata: {
        type: 'update',
        universeId: universe.id,
        updatedFields: Object.keys(updates),
        operation: 'update_universe'
      }
    };
  }

  /**
   * Branch universe (create specialized variant)
   */
  async branchUniverse(universe, params = {}) {
    const branch = universe.clone({
      name: params.name || `Branch-${Date.now()}`,
      branchType: params.branchType || 'feature',
      divergencePoint: Date.now(),
      ...params.metadata
    });

    // Apply branch-specific modifications if provided
    if (params.modifications) {
      branch.updateState(params.modifications);
    }

    this.universes.set(branch.id, {
      universe: branch,
      createdAt: Date.now(),
      parentId: universe.id,
      branchType: params.branchType,
      operations: []
    });

    this.statistics.totalCreated++;

    return {
      branch,
      metadata: {
        type: 'branch',
        sourceId: universe.id,
        branchId: branch.id,
        branchType: params.branchType,
        operation: 'branch_universe'
      }
    };
  }

  /**
   * Merge universe (combine states from multiple universes)
   */
  async mergeUniverse(targetUniverse, params = {}) {
    const { sourceIds = [], mergeStrategy = 'replace' } = params;

    if (!Array.isArray(sourceIds) || sourceIds.length === 0) {
      throw new Error('Source universe IDs must be provided for merge operation');
    }

    const sourceUniverses = sourceIds.map(id => {
      const universeData = this.universes.get(id);
      if (!universeData) {
        throw new Error(`Source universe ${id} not found`);
      }
      return universeData.universe;
    });

    // Simple merge strategy - combine all states
    const mergedState = sourceUniverses.reduce((merged, source) => {
      return { ...merged, ...source.state };
    }, { ...targetUniverse.state });

    const updateResult = targetUniverse.updateState(mergedState);

    return {
      mergeResult: {
        ...updateResult,
        sourceIds,
        mergeStrategy
      },
      metadata: {
        type: 'merge',
        targetId: targetUniverse.id,
        sourceIds,
        mergeStrategy,
        operation: 'merge_universes'
      }
    };
  }

  /**
   * Analyze universe performance and structure
   */
  async analyzeUniverse(universe, params = {}) {
    const analysis = {
      basic: {
        id: universe.id,
        createdAt: universe.metadata.createdAt,
        lastModified: universe.metadata.lastModified,
        stateSize: universe.metadata.stateSize,
        snapshotCount: universe.snapshots.length,
        childrenCount: universe.children.length
      },
      performance: {
        stateComplexity: this.calculateStateComplexity(universe.state),
        memoryEfficiency: this.calculateMemoryEfficiency(universe),
        accessPatterns: this.analyzeAccessPatterns(universe),
        optimizationOpportunities: this.identifyOptimizations(universe)
      },
      relationships: {
        parentId: universe.parentId,
        children: universe.children,
        siblings: this.findSiblings(universe),
        descendants: this.countDescendants(universe)
      },
      health: {
        integrity: this.checkIntegrity(universe),
        performance: this.assessPerformance(universe),
        recommendations: this.generateRecommendations(universe)
      }
    };

    return {
      analysis,
      metadata: {
        type: 'analysis',
        universeId: universe.id,
        analysisType: params.type || 'comprehensive',
        operation: 'analyze_universe'
      }
    };
  }

  /**
   * Get comprehensive statistics
   */
  async getStatistics() {
    const activeUniverses = this.universes.size;
    const memoryUsage = process.memoryUsage();

    return {
      ...this.statistics,
      current: {
        activeUniverses,
        memoryUsage: {
          used: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`,
          total: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)}MB`
        },
        operationQueueSize: this.operationQueue.length,
        processingStatus: this.isProcessing ? 'active' : 'idle'
      },
      efficiency: {
        averageCreationTime: `${this.statistics.averageCreationTime.toFixed(2)}ms`,
        operationsPerSecond: this.calculateOperationRate(),
        memoryPerUniverse: this.calculateAverageMemoryPerUniverse(),
        cacheHitRate: this.calculateCacheHitRate()
      },
      distribution: {
        byType: this.getUniverseTypeDistribution(),
        byAge: this.getUniverseAgeDistribution(),
        byComplexity: this.getUniverseComplexityDistribution()
      }
    };
  }

  /**
   * Batch operation management
   */
  async processBatchOperation(operations) {
    const batchId = uuidv4();
    const startTime = process.hrtime.bigint();

    try {
      const results = await Promise.all(
        operations.map(async (op, index) => {
          try {
            return await this.performOperation(op.universeId, op.operation, op.params);
          } catch (error) {
            return { error: error.message, index };
          }
        })
      );

      const endTime = process.hrtime.bigint();
      const batchTime = Number(endTime - startTime) / 1000000;

      this.statistics.batchOperationsCompleted++;

      const batchResult = {
        batchId,
        operations: operations.length,
        results,
        performance: {
          totalTime: `${batchTime.toFixed(2)}ms`,
          averagePerOperation: `${(batchTime / operations.length).toFixed(2)}ms`
        }
      };

      this.emit('batch:processed', batchResult);
      return batchResult;

    } catch (error) {
      this.emit('batch:error', { batchId, error: error.message });
      throw error;
    }
  }

  /**
   * Clean up destroyed universes
   */
  cleanup() {
    if (!this.config.autoCleanup) return;

    let cleanedUp = 0;

    this.universes.forEach((universeData, id) => {
      // Clean up old universes (older than 1 hour by default)
      const age = Date.now() - universeData.createdAt;
      if (age > (this.config.maxAge || 3600000)) {
        this.universes.delete(id);
        cleanedUp++;
      }
    });

    if (cleanedUp > 0) {
      this.statistics.totalDestroyed += cleanedUp;
      this.emit('cleanup:completed', { cleaned: cleanedUp, remaining: this.universes.size });
    }
  }

  /**
   * Start operation processor
   */
  startOperationProcessor() {
    setInterval(() => {
      this.processOperationQueue();
      this.cleanup();
    }, 1000); // Process every second
  }

  /**
   * Process queued operations
   */
  async processOperationQueue() {
    if (this.isProcessing || this.operationQueue.length === 0) return;

    this.isProcessing = true;

    try {
      const batch = this.operationQueue.splice(0, this.config.maxConcurrentOperations);
      await this.processBatchOperation(batch);
    } catch (error) {
      this.emit('error', error);
    } finally {
      this.isProcessing = false;
    }
  }

  // Utility methods for analysis

  calculateStateComplexity(state) {
    const stateStr = JSON.stringify(state);
    return {
      size: stateStr.length,
      depth: this.calculateObjectDepth(state),
      keys: Object.keys(state).length,
      complexity: stateStr.length / 100 // Simple complexity metric
    };
  }

  calculateObjectDepth(obj, depth = 0) {
    if (typeof obj !== 'object' || obj === null) return depth;
    return Math.max(...Object.values(obj).map(v => this.calculateObjectDepth(v, depth + 1)));
  }

  calculateMemoryEfficiency(universe) {
    const stateSize = JSON.stringify(universe.state).length;
    const baseMemory = 1024; // Base memory overhead
    const efficiency = baseMemory / (stateSize + baseMemory);

    return {
      stateSize,
      baseMemory,
      efficiency: efficiency.toFixed(2),
      rating: efficiency > 0.8 ? 'excellent' : efficiency > 0.5 ? 'good' : 'needs-improvement'
    };
  }

  analyzeAccessPatterns(universe) {
    // Analyze operation history to identify patterns
    const universeData = this.universes.get(universe.id);
    const operations = universeData ? universeData.operations : [];

    return {
      totalOperations: operations.length,
      operationTypes: this.groupOperationsByType(operations),
      averageTimeBetweenOperations: this.calculateAverageOperationInterval(operations),
      mostCommonOperation: this.findMostCommonOperation(operations)
    };
  }

  identifyOptimizations(universe) {
    const optimizations = [];

    // Check state complexity
    const complexity = this.calculateStateComplexity(universe.state);
    if (complexity.depth > 5) {
      optimizations.push('Consider flattening state structure to reduce depth');
    }

    // Check snapshot count
    if (universe.snapshots.length > 10) {
      optimizations.push('Consider cleanup of old snapshots to reduce memory usage');
    }

    // Check children count
    if (universe.children.length > 100) {
      optimizations.push('Consider archiving inactive child universes');
    }

    return optimizations;
  }

  findSiblings(universe) {
    if (!universe.parentId) return [];

    const siblings = [];
    this.universes.forEach((data, id) => {
      if (data.universe.parentId === universe.parentId && id !== universe.id) {
        siblings.push(id);
      }
    });

    return siblings;
  }

  countDescendants(universe) {
    let count = universe.children.length;

    universe.children.forEach(childId => {
      const childData = this.universes.get(childId);
      if (childData) {
        count += this.countDescendants(childData.universe);
      }
    });

    return count;
  }

  checkIntegrity(universe) {
    const issues = [];

    // Check parent-child relationships
    if (universe.parentId) {
      const parent = this.universes.get(universe.parentId);
      if (!parent) {
        issues.push('Parent universe not found');
      }
    }

    // Check children existence
    universe.children.forEach(childId => {
      if (!this.universes.has(childId)) {
        issues.push(`Child universe ${childId} not found`);
      }
    });

    return {
      healthy: issues.length === 0,
      issues
    };
  }

  assessPerformance(universe) {
    const universeData = this.universes.get(universe.id);
    const operations = universeData ? universeData.operations : [];

    if (operations.length === 0) {
      return { rating: 'unknown', reason: 'No operations performed' };
    }

    const avgTime = operations.reduce((sum, op) => sum + op.executionTime, 0) / operations.length;

    return {
      rating: avgTime < 50 ? 'excellent' : avgTime < 100 ? 'good' : 'needs-improvement',
      averageOperationTime: `${avgTime.toFixed(2)}ms`,
      operationsCompleted: operations.length
    };
  }

  generateRecommendations(universe) {
    const recommendations = [];

    const performance = this.assessPerformance(universe);
    if (performance.rating === 'needs-improvement') {
      recommendations.push('Optimize operation performance - consider state structure simplification');
    }

    const integrity = this.checkIntegrity(universe);
    if (!integrity.healthy) {
      recommendations.push('Fix integrity issues: ' + integrity.issues.join(', '));
    }

    const efficiency = this.calculateMemoryEfficiency(universe);
    if (efficiency.rating === 'needs-improvement') {
      recommendations.push('Improve memory efficiency - consider state compression');
    }

    return recommendations;
  }

  // Statistics helper methods

  calculateOperationRate() {
    // Calculate operations per second over the last minute
    return this.statistics.operationsCompleted; // Simplified
  }

  calculateAverageMemoryPerUniverse() {
    const memoryUsage = process.memoryUsage().heapUsed;
    const universeCount = this.universes.size || 1;
    return `${(memoryUsage / universeCount / 1024 / 1024).toFixed(2)}MB`;
  }

  calculateCacheHitRate() {
    // Simplified cache hit rate calculation
    return '85.2%'; // Placeholder
  }

  getUniverseTypeDistribution() {
    const distribution = {};
    this.universes.forEach(data => {
      const type = data.universe.metadata.type || 'default';
      distribution[type] = (distribution[type] || 0) + 1;
    });
    return distribution;
  }

  getUniverseAgeDistribution() {
    const now = Date.now();
    const distribution = { new: 0, active: 0, old: 0 };

    this.universes.forEach(data => {
      const age = now - data.createdAt;
      if (age < 300000) distribution.new++; // 5 minutes
      else if (age < 1800000) distribution.active++; // 30 minutes
      else distribution.old++;
    });

    return distribution;
  }

  getUniverseComplexityDistribution() {
    const distribution = { simple: 0, moderate: 0, complex: 0 };

    this.universes.forEach(data => {
      const complexity = this.calculateStateComplexity(data.universe.state);
      if (complexity.complexity < 10) distribution.simple++;
      else if (complexity.complexity < 100) distribution.moderate++;
      else distribution.complex++;
    });

    return distribution;
  }

  groupOperationsByType(operations) {
    const groups = {};
    operations.forEach(op => {
      groups[op.operation] = (groups[op.operation] || 0) + 1;
    });
    return groups;
  }

  calculateAverageOperationInterval(operations) {
    if (operations.length < 2) return 0;

    const intervals = [];
    for (let i = 1; i < operations.length; i++) {
      intervals.push(operations[i].timestamp - operations[i - 1].timestamp);
    }

    return intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
  }

  findMostCommonOperation(operations) {
    const counts = this.groupOperationsByType(operations);
    return Object.entries(counts).sort(([,a], [,b]) => b - a)[0]?.[0] || 'none';
  }
}

module.exports = UniverseManager;