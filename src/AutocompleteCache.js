/**
 * Advanced caching system for autocomplete with LRU eviction and memory management.
 */

import cd from './loader/cd';

/**
 * @typedef {object} CacheEntry
 * @property {any[]} data The cached data
 * @property {number} timestamp When the entry was created
 * @property {number} accessCount How many times this entry has been accessed
 * @property {number} lastAccessed When the entry was last accessed
 */

/**
 * @typedef {object} CacheStats
 * @property {number} hits Number of cache hits
 * @property {number} misses Number of cache misses
 * @property {number} evictions Number of entries evicted
 * @property {number} size Current cache size
 * @property {number} maxSize Maximum cache size
 * @property {number} hitRate Hit rate percentage
 */

/**
 * Advanced cache implementation with LRU eviction, TTL, and memory management.
 */
class AutocompleteCache {
	/**
	 * Create a new autocomplete cache.
	 *
	 * @param {object} [options] Cache configuration options
	 * @param {number} [options.maxSize] Maximum number of entries
	 * @param {number} [options.ttl] Time to live in milliseconds (5 minutes)
	 * @param {number} [options.maxMemory] Maximum memory usage in bytes (10MB)
	 * @param {boolean} [options.enableStats] Whether to collect statistics
	 */
	constructor(options = {}) {
		this.maxSize = options.maxSize || 1000;
		this.ttl = options.ttl || 5 * cd.g.msInMin;
		this.maxMemory = options.maxMemory || 10 * 1024 * 1024;  // 10MB
		this.enableStats = options.enableStats !== false;

		/** @type {Map<string, CacheEntry>} */
		this.cache = new Map();

		/** @type {CacheStats} */
		this.stats = {
			hits: 0,
			misses: 0,
			evictions: 0,
			size: 0,
			maxSize: this.maxSize,
			hitRate: 0,
		};

		// Periodic cleanup
		/** @type {number | undefined} */
		this.cleanupInterval = setInterval(() => {
			this.cleanup();
		}, cd.g.msInMin);
	}

	/**
	 * Get an item from the cache.
	 *
	 * @param {string} key Cache key
	 * @returns {any[] | undefined} Cached data or null if not found
	 */
	get(key) {
		const entry = this.cache.get(key);

		if (!entry) {
			if (this.enableStats) {
				this.stats.misses++;
				this.updateHitRate();
			}

			return;
		}

		// Check if entry has expired
		if (this.isExpired(entry)) {
			this.cache.delete(key);
			if (this.enableStats) {
				this.stats.misses++;
				this.stats.size--;
				this.updateHitRate();
			}

			return;
		}

		// Update access information
		entry.accessCount++;
		entry.lastAccessed = Date.now();

		if (this.enableStats) {
			this.stats.hits++;
			this.updateHitRate();
		}

		return entry.data;
	}

	/**
	 * Set an item in the cache.
	 *
	 * @param {string} key Cache key
	 * @param {any[]} data Data to cache
	 */
	set(key, data) {
		const now = Date.now();
		const entry = {
			data: [...data], // Create a copy to avoid mutations
			timestamp: now,
			accessCount: 1,
			lastAccessed: now,
		};

		// If key already exists, update it
		if (this.cache.has(key)) {
			this.cache.set(key, entry);

			return;
		}

		// Check if we need to evict entries
		if (this.cache.size >= this.maxSize) {
			this.evictLRU();
		}

		// Check memory usage
		if (this.getEstimatedMemoryUsage() > this.maxMemory) {
			this.evictByMemoryPressure();
		}

		this.cache.set(key, entry);
		if (this.enableStats) {
			this.stats.size++;
		}
	}

	/**
	 * Check if a cache entry has expired.
	 *
	 * @param {CacheEntry} entry Cache entry to check
	 * @returns {boolean} Whether the entry has expired
	 */
	isExpired(entry) {
		return Date.now() - entry.timestamp > this.ttl;
	}

	/**
	 * Evict the least recently used entry.
	 */
	evictLRU() {
		let oldestKey;
		let oldestTime = Infinity;

		for (const [key, entry] of this.cache) {
			if (entry.lastAccessed < oldestTime) {
				oldestTime = entry.lastAccessed;
				oldestKey = key;
			}
		}

		if (oldestKey) {
			this.cache.delete(oldestKey);
			if (this.enableStats) {
				this.stats.evictions++;
				this.stats.size--;
			}
		}
	}

	/**
	 * Evict entries to reduce memory pressure.
	 */
	evictByMemoryPressure() {
		// Sort entries by access frequency and recency
		const entries = Array.from(this.cache.entries()).sort((a, b) => {
			const [, entryA] = a;
			const [, entryB] = b;

			// Prefer keeping frequently accessed and recently accessed entries
			const scoreA = entryA.accessCount * 0.7 + (Date.now() - entryA.lastAccessed) * -0.3;
			const scoreB = entryB.accessCount * 0.7 + (Date.now() - entryB.lastAccessed) * -0.3;

			return scoreA - scoreB;
		});

		// Remove the least valuable entries (first 25%)
		const toRemove = Math.ceil(entries.length * 0.25);
		for (let i = 0; i < toRemove; i++) {
			const [key] = entries[i];
			this.cache.delete(key);
			if (this.enableStats) {
				this.stats.evictions++;
				this.stats.size--;
			}
		}
	}

	/**
	 * Clean up expired entries.
	 */
	cleanup() {
		const now = Date.now();
		const toDelete = [];

		for (const [key, entry] of this.cache) {
			if (now - entry.timestamp > this.ttl) {
				toDelete.push(key);
			}
		}

		toDelete.forEach((key) => {
			this.cache.delete(key);
			if (this.enableStats) {
				this.stats.size--;
			}
		});
	}

	/**
	 * Estimate memory usage of the cache.
	 *
	 * @returns {number} Estimated memory usage in bytes
	 */
	getEstimatedMemoryUsage() {
		let totalSize = 0;

		for (const [key, entry] of this.cache) {
			// Rough estimation: key size + data size + metadata
			totalSize += key.length * 2; // UTF-16 characters
			totalSize += this.estimateDataSize(entry.data);
			totalSize += 64; // Estimated metadata overhead
		}

		return totalSize;
	}

	/**
	 * Estimate the size of cached data.
	 *
	 * @param {any[]} data Data to estimate
	 * @returns {number} Estimated size in bytes
	 */
	estimateDataSize(data) {
		let size = 0;

		for (const item of data) {
			if (typeof item === 'string') {
				size += item.length * 2; // UTF-16
			} else if (typeof item === 'object' && item !== null) {
				// Rough estimation for objects
				size += JSON.stringify(item).length * 2;
			} else {
				size += 8; // Rough estimate for primitives
			}
		}

		return size;
	}

	/**
	 * Update hit rate statistics.
	 */
	updateHitRate() {
		const total = this.stats.hits + this.stats.misses;
		this.stats.hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;
	}

	/**
	 * Get cache statistics.
	 *
	 * @returns {CacheStats & { memoryUsage: number }} Current cache statistics
	 */
	getStats() {
		return {
			...this.stats,
			memoryUsage: this.getEstimatedMemoryUsage(),
		};
	}

	/**
	 * Clear all cache entries.
	 */
	clear() {
		this.cache.clear();
		if (this.enableStats) {
			this.stats.size = 0;
		}
	}

	/**
	 * Check if a key exists in the cache (without updating access stats).
	 *
	 * @param {string} key Cache key
	 * @returns {boolean} Whether the key exists and is not expired
	 */
	has(key) {
		const entry = this.cache.get(key);

		return entry !== undefined && !this.isExpired(entry);
	}

	/**
	 * Get the number of entries in the cache.
	 *
	 * @returns {number} Number of cache entries
	 */
	size() {
		return this.cache.size;
	}

	/**
	 * Destroy the cache and clean up resources.
	 */
	destroy() {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
			this.cleanupInterval = undefined;
		}
		this.clear();
	}

	/**
	 * Prefetch data for a list of keys.
	 *
	 * @param {string[]} keys Keys to prefetch
	 * @param {(key: string) => Promise<any[]>} fetchFn Function to fetch data for a key
	 * @returns {Promise<void>}
	 */
	async prefetch(keys, fetchFn) {
		const missingKeys = keys.filter((key) => !this.has(key));

		if (missingKeys.length === 0) {
			return;
		}

		// Fetch data for missing keys in parallel
		const promises = missingKeys.map(async (key) => {
			try {
				const data = await fetchFn(key);
				this.set(key, data);
			} catch (error) {
				// Silently ignore prefetch errors
				console.warn(`Prefetch failed for key ${key}:`, error);
			}
		});

		await Promise.all(promises);
	}

	/**
	 * Get cache entries sorted by access frequency.
	 *
	 * @param {number} [limit] Maximum number of entries to return
	 * @returns {Array<[string, CacheEntry]>} Sorted cache entries
	 */
	getTopEntries(limit = 10) {
		return Array.from(this.cache.entries())
			.sort((a, b) => b[1].accessCount - a[1].accessCount)
			.slice(0, limit);
	}

	/**
	 * @typedef {object} CacheData
	 * @property {TypeByStringKey<CacheEntry>} entries
	 * @property {CacheStats} stats
	 * @property {object} config
	 * @property {number} config.maxSize
	 * @property {number} config.ttl
	 * @property {number} config.maxMemory
	 */

	/**
	 * Export cache data for persistence.
	 *
	 * @returns {CacheData} Serializable cache data
	 */
	export() {
		/** @type {TypeByStringKey<CacheEntry>} */
		const entries = {};
		for (const [key, entry] of this.cache) {
			if (!this.isExpired(entry)) {
				entries[key] = {
					data: entry.data,
					timestamp: entry.timestamp,
					accessCount: entry.accessCount,
					lastAccessed: entry.lastAccessed,
				};
			}
		}

		const data = {
			entries,
			stats: this.stats,
			config: {
				maxSize: this.maxSize,
				ttl: this.ttl,
				maxMemory: this.maxMemory,
			},
		};

		return data;
	}

	/**
	 * Import cache data from persistence.
	 *
	 * @param {Partial<CacheData>} data Serialized cache data
	 */
	import(data) {
		this.clear();

		if (data.entries) {
			for (const [key, entry] of Object.entries(data.entries)) {
				if (!this.isExpired(entry)) {
					this.cache.set(key, entry);
				}
			}
		}

		if (data.stats) {
			this.stats = { ...this.stats, ...data.stats };
		}

		if (this.enableStats) {
			this.stats.size = this.cache.size;
		}
	}
}

export default AutocompleteCache;
