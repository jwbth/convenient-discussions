/**
 * Performance monitoring utility for autocomplete system.
 * Tracks response times, memory usage, and provides optimization recommendations.
 */

/**
 * @typedef {object} PerformanceMetric
 * @property {string} operation Operation name
 * @property {number} startTime Start timestamp
 * @property {number} endTime End timestamp
 * @property {number} duration Duration in milliseconds
 * @property {number} memoryBefore Memory usage before operation
 * @property {number} memoryAfter Memory usage after operation
 * @property {string} autocompleteType Type of autocomplete
 * @property {string} query Search query
 * @property {number} resultCount Number of results returned
 * @property {boolean} cacheHit Whether result came from cache
 */

/**
 * @typedef {object} TypePerformanceMetrics
 * @property {number} operationCount Number of operations for this type
 * @property {number} averageResponseTime Average response time in ms
 * @property {number} cacheHitRate Cache hit rate percentage
 * @property {number} totalResults Total number of results returned
 */

/**
 * @typedef {object} PerformanceSummary
 * @property {number} totalOperations Total number of operations
 * @property {number} averageResponseTime Average response time in ms
 * @property {number} medianResponseTime Median response time in ms
 * @property {number} p95ResponseTime 95th percentile response time in ms
 * @property {number} cacheHitRate Cache hit rate percentage
 * @property {number} totalMemoryUsage Total memory usage in bytes
 * @property {{ [key: string]: TypePerformanceMetrics }} byType Performance metrics by autocomplete type
 */

/**
 * Performance monitoring class for autocomplete operations.
 */
class AutocompletePerformanceMonitor {
	/**
	 * Create a performance monitor.
	 *
	 * @param {object} [options] Configuration options
	 * @param {boolean} [options.enabled] Whether monitoring is enabled
	 * @param {number} [options.maxMetrics] Maximum number of metrics to store
	 * @param {number} [options.reportInterval] Interval for automatic reporting (ms)
	 */
	constructor(options = {}) {
		this.enabled = options.enabled !== false
		this.maxMetrics = options.maxMetrics || 1000
		this.reportInterval = options.reportInterval || 60_000

		/** @type {PerformanceMetric[]} */
		this.metrics = []

		/** @type {Map<string, number>} */
		this.operationCounts = new Map()

		/** @type {Map<string, number>} */
		this.totalDurations = new Map()

		this.startTime = Date.now()

		// Set up automatic reporting
		if (this.enabled && this.reportInterval > 0) {
			this.reportTimer = setInterval(() => {
				this.generateReport()
			}, this.reportInterval)
		}
	}

	/**
	 * @typedef {object} Operation
	 * @property {(resultCount: number, cacheHit: boolean) => void} end
	 *
	 * @typedef {object} OperationContext
	 * @property {string} operation
	 * @property {import('./AutocompleteFactory').AutocompleteType} autocompleteType
	 * @property {string} query
	 * @property {number} startTime
	 * @property {number} memoryBefore
	 */

	/**
	 * Start monitoring an operation.
	 *
	 * @param {string} operation Operation name
	 * @param {import('./AutocompleteFactory').AutocompleteType} autocompleteType Type of autocomplete
	 * @param {string} query Search query
	 * @returns {Operation} Operation context for ending the measurement
	 */
	startOperation(operation, autocompleteType, query) {
		if (!this.enabled) {
			return { end: () => {} }
		}

		/** @type {OperationContext} */
		const context = {
			operation,
			autocompleteType,
			query,
			startTime: performance.now(),
			memoryBefore: this.getMemoryUsage(),
		}

		return {
			end: (resultCount, cacheHit) => {
				this.endOperation(context, resultCount, cacheHit)
			},
		}
	}

	/**
	 * End monitoring an operation.
	 *
	 * @param {OperationContext} context Operation context from startOperation
	 * @param {number} resultCount Number of results returned
	 * @param {boolean} cacheHit Whether result came from cache
	 */
	endOperation(context, resultCount, cacheHit) {
		if (!this.enabled) {
			return
		}

		const endTime = performance.now()
		const duration = endTime - context.startTime
		const memoryAfter = this.getMemoryUsage()

		/** @type {PerformanceMetric} */
		const metric = {
			operation: context.operation,
			startTime: context.startTime,
			endTime,
			duration,
			memoryBefore: context.memoryBefore,
			memoryAfter,
			autocompleteType: context.autocompleteType,
			query: context.query,
			resultCount,
			cacheHit,
		}

		this.addMetric(metric)
	}

	/**
	 * Add a performance metric.
	 *
	 * @param {PerformanceMetric} metric Performance metric to add
	 */
	addMetric(metric) {
		this.metrics.push(metric)

		// Update aggregated data
		const key = `${metric.autocompleteType}:${metric.operation}`
		this.operationCounts.set(key, (this.operationCounts.get(key) || 0) + 1)
		this.totalDurations.set(key, (this.totalDurations.get(key) || 0) + metric.duration)

		// Limit metrics array size
		if (this.metrics.length > this.maxMetrics) {
			this.metrics.shift()
		}
	}

	/**
	 * Get current memory usage.
	 *
	 * @returns {number} Memory usage in bytes
	 */
	getMemoryUsage() {
		// Browser environment with memory API
		if (typeof performance !== 'undefined' && 'memory' in performance) {
			/** @type {any} */
			const perfMemory = performance

			return perfMemory.memory.usedJSHeapSize
		}

		// Node.js environment
		if (typeof globalThis !== 'undefined' && 'process' in globalThis) {
			/** @type {any} */
			const nodeProcess = /** @type {any} */ (globalThis).process
			if (nodeProcess && typeof nodeProcess.memoryUsage === 'function') {
				return nodeProcess.memoryUsage().heapUsed
			}
		}

		return 0
	}

	/**
	 * Generate a performance summary.
	 *
	 * @returns {PerformanceSummary} Performance summary
	 */
	generateSummary() {
		if (this.metrics.length === 0) {
			return {
				totalOperations: 0,
				averageResponseTime: 0,
				medianResponseTime: 0,
				p95ResponseTime: 0,
				cacheHitRate: 0,
				totalMemoryUsage: 0,
				byType: {},
			}
		}

		const durations = this.metrics.map((m) => m.duration).sort((a, b) => a - b)
		const cacheHits = this.metrics.filter((m) => m.cacheHit).length
		const totalMemory = this.getMemoryUsage()

		// Calculate percentiles
		const median = this.getPercentile(durations, 50)
		const p95 = this.getPercentile(durations, 95)

		// Group by type
		/** @type {{ [key: string]: TypePerformanceMetrics }} */
		const byType = {}
		const typeGroups = this.groupBy(this.metrics, 'autocompleteType')

		for (const [type, typeMetrics] of Object.entries(typeGroups)) {
			const typeDurations = typeMetrics.map((m) => m.duration)
			const typeCacheHits = typeMetrics.filter((m) => m.cacheHit).length

			byType[type] = {
				operationCount: typeMetrics.length,
				averageResponseTime: typeDurations.reduce((a, b) => a + b, 0) / typeDurations.length,
				cacheHitRate: (typeCacheHits / typeMetrics.length) * 100,
				totalResults: typeMetrics.reduce((sum, m) => sum + m.resultCount, 0),
			}
		}

		return {
			totalOperations: this.metrics.length,
			averageResponseTime: durations.reduce((a, b) => a + b, 0) / durations.length,
			medianResponseTime: median,
			p95ResponseTime: p95,
			cacheHitRate: (cacheHits / this.metrics.length) * 100,
			totalMemoryUsage: totalMemory,
			byType,
		}
	}

	/**
	 * Calculate percentile of an array.
	 *
	 * @param {number[]} arr Sorted array of numbers
	 * @param {number} percentile Percentile to calculate (0-100)
	 * @returns {number} Percentile value
	 */
	getPercentile(arr, percentile) {
		if (arr.length === 0) return 0
		const index = Math.ceil((percentile / 100) * arr.length) - 1

		return arr[Math.max(0, Math.min(index, arr.length - 1))]
	}

	/**
	 * @template T
	 * @typedef {{ [key: string]: T[] }} GroupedObject
	 */

	/**
	 * Group array by property.
	 *
	 * @template T
	 * @param {T[]} array Array to group
	 * @param {string} property Property to group by
	 * @returns {GroupedObject<T>} Grouped object
	 */
	groupBy(array, property) {
		/** @type {GroupedObject<T>} */
		return array.reduce((groups, item) => {
			/** @type {string} */
			const key = /** @type {AnyByKey} */ (item)[property]
			if (!(key in groups)) {
				groups[key] = []
			}
			groups[key].push(item)

			return groups
		}, /** @type {GroupedObject<T>} */ ({}))
	}

	/**
	 * Generate a performance report.
	 *
	 * @returns {string} Formatted performance report
	 */
	generateReport() {
		const summary = this.generateSummary()
		const uptime = Date.now() - this.startTime

		let report = `
=== Autocomplete Performance Report ===
Uptime: ${Math.round(uptime / 1000)}s
Total Operations: ${summary.totalOperations}
Average Response Time: ${summary.averageResponseTime.toFixed(2)}ms
Median Response Time: ${summary.medianResponseTime.toFixed(2)}ms
95th Percentile: ${summary.p95ResponseTime.toFixed(2)}ms
Cache Hit Rate: ${summary.cacheHitRate.toFixed(1)}%
Memory Usage: ${this.formatBytes(summary.totalMemoryUsage)}

`

		report += `Performance by Type:
`
		for (const [type, metrics] of Object.entries(summary.byType)) {
			report += `  ${type}:
		Operations: ${metrics.operationCount}
		Avg Response: ${metrics.averageResponseTime.toFixed(2)}ms
		Cache Hit Rate: ${metrics.cacheHitRate.toFixed(1)}%
		Total Results: ${metrics.totalResults}
`
		}

		// Add performance warnings
		const warnings = this.getPerformanceWarnings(summary)
		if (warnings.length > 0) {
			report += `
Performance Warnings:
`
			warnings.forEach((warning) => {
				report += `  ⚠️  ${warning}\n`
			})
		}

		// Add optimization recommendations
		const recommendations = this.getOptimizationRecommendations(summary)
		if (recommendations.length > 0) {
			report += `
Optimization Recommendations:
`
			recommendations.forEach((rec) => {
				report += `  💡 ${rec}
`
			})
		}

		console.log(report)

		return report
	}

	/**
	 * Get performance warnings based on metrics.
	 *
	 * @param {PerformanceSummary} summary Performance summary
	 * @returns {string[]} Array of warning messages
	 */
	getPerformanceWarnings(summary) {
		const warnings = []

		if (summary.averageResponseTime > 500) {
			warnings.push(`High average response time: ${summary.averageResponseTime.toFixed(2)}ms`)
		}

		if (summary.p95ResponseTime > 1000) {
			warnings.push(`High 95th percentile response time: ${summary.p95ResponseTime.toFixed(2)}ms`)
		}

		if (summary.cacheHitRate < 50) {
			warnings.push(`Low cache hit rate: ${summary.cacheHitRate.toFixed(1)}%`)
		}

		if (summary.totalMemoryUsage > 50 * 1024 * 1024) {
			// 50MB
			warnings.push(`High memory usage: ${this.formatBytes(summary.totalMemoryUsage)}`)
		}

		// Check individual types
		for (const [type, metrics] of Object.entries(summary.byType)) {
			if (metrics.averageResponseTime > 300) {
				warnings.push(`${type} has high response time: ${metrics.averageResponseTime.toFixed(2)}ms`)
			}
			if (metrics.cacheHitRate < 30) {
				warnings.push(`${type} has low cache hit rate: ${metrics.cacheHitRate.toFixed(1)}%`)
			}
		}

		return warnings
	}

	/**
	 * Get optimization recommendations based on metrics.
	 *
	 * @param {PerformanceSummary} summary Performance summary
	 * @returns {string[]} Array of recommendation messages
	 */
	getOptimizationRecommendations(summary) {
		const recommendations = []

		if (summary.cacheHitRate < 70) {
			recommendations.push(
				'Consider increasing cache TTL or implementing prefetching for common queries',
			)
		}

		if (summary.averageResponseTime > 200) {
			recommendations.push(
				'Consider implementing request debouncing or increasing local search priority',
			)
		}

		if (summary.totalMemoryUsage > 20 * 1024 * 1024) {
			// 20MB
			recommendations.push(
				'Consider reducing cache size or implementing more aggressive cache eviction',
			)
		}

		// Type-specific recommendations
		for (const [type, metrics] of Object.entries(summary.byType)) {
			if (metrics.operationCount > 100 && metrics.cacheHitRate < 50) {
				recommendations.push(
					`${type}: Implement better caching strategy for frequently used queries`,
				)
			}
			if (metrics.averageResponseTime > 400) {
				recommendations.push(`${type}: Consider optimizing API requests or local search algorithms`)
			}
		}

		return recommendations
	}

	/**
	 * Format bytes into human-readable format.
	 *
	 * @param {number} bytes Number of bytes
	 * @returns {string} Formatted string
	 */
	formatBytes(bytes) {
		if (bytes === 0) return '0 B'
		const k = 1024
		const sizes = ['B', 'KB', 'MB', 'GB']
		const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k))

		return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
	}

	/**
	 * Get slow operations (above threshold).
	 *
	 * @param {number} [threshold] Threshold in milliseconds
	 * @returns {PerformanceMetric[]} Slow operations
	 */
	getSlowOperations(threshold = 500) {
		return this.metrics.filter((m) => m.duration > threshold)
	}

	/**
	 * Get operations with high memory usage.
	 *
	 * @param {number} [threshold] Threshold in bytes (1MB)
	 * @returns {PerformanceMetric[]} High memory operations
	 */
	getHighMemoryOperations(threshold = 1_048_576) {
		return this.metrics.filter((m) => m.memoryAfter - m.memoryBefore > threshold)
	}

	/**
	 * Clear all metrics.
	 */
	clear() {
		this.metrics = []
		this.operationCounts.clear()
		this.totalDurations.clear()
	}

	/**
	 * @typedef {object} MetricsData
	 * @property {PerformanceMetric[]} metrics
	 * @property {PerformanceSummary} summary
	 * @property {number} startTime
	 * @property {number} uptime
	 */

	/**
	 * Export metrics data.
	 *
	 * @returns {MetricsData} Exportable metrics data
	 */
	export() {
		return {
			metrics: this.metrics,
			summary: this.generateSummary(),
			startTime: this.startTime,
			uptime: Date.now() - this.startTime,
		}
	}

	/**
	 * Disable monitoring.
	 */
	disable() {
		this.enabled = false
		if (this.reportTimer) {
			clearInterval(this.reportTimer)
			this.reportTimer = undefined
		}
	}

	/**
	 * Enable monitoring.
	 */
	enable() {
		this.enabled = true
		if (this.reportInterval > 0 && !this.reportTimer) {
			this.reportTimer = setInterval(() => {
				this.generateReport()
			}, this.reportInterval)
		}
	}

	/**
	 * Destroy the monitor and clean up resources.
	 */
	destroy() {
		this.disable()
		this.clear()
	}
}

export default AutocompletePerformanceMonitor
