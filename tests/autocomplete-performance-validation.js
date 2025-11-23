/**
 * Simple performance validation script for autocomplete system.
 * This validates that the performance optimizations are working correctly.
 */

const AutocompleteCache = require('../src/AutocompleteCache.js').default || require('../src/AutocompleteCache.js');
const AutocompletePerformanceMonitor = require('../src/AutocompletePerformanceMonitor.js').default || require('../src/AutocompletePerformanceMonitor.js');

// Mock global dependencies
global.performance = {
  now: () => Date.now(),
  memory: {
    usedJSHeapSize: Math.floor(Math.random() * 1_000_000) + 1_000_000,
  },
};

/**
 * Test the AutocompleteCache performance.
 */
async function testCachePerformance() {
  console.log('🧪 Testing AutocompleteCache performance...');

  const cache = new AutocompleteCache({
    maxSize: 100,
    ttl: 5000,
    maxMemory: 1024 * 1024, // 1MB
  });

  const startTime = performance.now();

  // Test cache operations
  for (let i = 0; i < 1000; i++) {
    const key = `test-${i % 50}`; // Create some overlap for cache hits
    const data = [`result-${i}`, `result-${i + 1}`, `result-${i + 2}`];

    // Set data
    cache.set(key, data);

    // Get data
    const retrieved = cache.get(key);
    if (!retrieved || retrieved.length !== 3) {
      throw new Error(`Cache operation failed for key ${key}`);
    }
  }

  const endTime = performance.now();
  const duration = endTime - startTime;
  const stats = cache.getStats();

  console.log(`  ✅ Cache operations completed in ${duration.toFixed(2)}ms`);
  console.log(`  📊 Cache stats: ${stats.hits} hits, ${stats.misses} misses, ${stats.hitRate.toFixed(1)}% hit rate`);
  console.log(`  💾 Memory usage: ${(stats.memoryUsage / 1024).toFixed(2)}KB`);

  // Validate performance thresholds
  if (duration > 1000) {
    throw new Error(`Cache operations too slow: ${duration}ms > 1000ms`);
  }

  if (stats.hitRate < 50) {
    throw new Error(`Cache hit rate too low: ${stats.hitRate}% < 50%`);
  }

  cache.destroy();
  console.log('  ✅ Cache performance test passed\n');
}

/**
 * Test the AutocompletePerformanceMonitor.
 */
async function testPerformanceMonitor() {
  console.log('🧪 Testing AutocompletePerformanceMonitor...');

  const monitor = new AutocompletePerformanceMonitor({
    enabled: true,
    maxMetrics: 100,
    reportInterval: 0, // Disable automatic reporting
  });

  // Simulate autocomplete operations
  for (let i = 0; i < 50; i++) {
    const operation = monitor.startOperation('getValues', 'mentions', `test-${i}`);

    // Simulate some work
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 10));

    operation.end(Math.floor(Math.random() * 10), Math.random() > 0.5);
  }

  const summary = monitor.generateSummary();

  console.log(`  ✅ Monitored ${summary.totalOperations} operations`);
  console.log(`  📊 Average response time: ${summary.averageResponseTime.toFixed(2)}ms`);
  console.log(`  📊 Cache hit rate: ${summary.cacheHitRate.toFixed(1)}%`);
  console.log(`  📊 95th percentile: ${summary.p95ResponseTime.toFixed(2)}ms`);

  // Validate monitoring functionality
  if (summary.totalOperations !== 50) {
    throw new Error(`Expected 50 operations, got ${summary.totalOperations}`);
  }

  if (summary.averageResponseTime < 0 || summary.averageResponseTime > 100) {
    throw new Error(`Unexpected average response time: ${summary.averageResponseTime}ms`);
  }

  monitor.destroy();
  console.log('  ✅ Performance monitor test passed\n');
}

/**
 * Test cache memory management.
 */
async function testCacheMemoryManagement() {
  console.log('🧪 Testing cache memory management...');

  const cache = new AutocompleteCache({
    maxSize: 10,
    maxMemory: 1024, // Very small memory limit
  });

  // Fill cache beyond limits
  for (let i = 0; i < 20; i++) {
    const data = Array.from({ length: 100 }, (_, j) => `item-${i}-${j}`);
    cache.set(`key-${i}`, data);
  }

  const stats = cache.getStats();

  console.log(`  📊 Cache size: ${stats.size} (max: ${stats.maxSize})`);
  console.log(`  📊 Evictions: ${stats.evictions}`);
  console.log(`  💾 Memory usage: ${stats.memoryUsage} bytes`);

  // Validate memory management
  if (stats.size > 10) {
    throw new Error(`Cache size exceeded limit: ${stats.size} > 10`);
  }

  if (stats.evictions === 0) {
    throw new Error('Expected cache evictions but got none');
  }

  cache.destroy();
  console.log('  ✅ Cache memory management test passed\n');
}

/**
 * Test cache TTL (Time To Live) functionality.
 */
async function testCacheTTL() {
  console.log('🧪 Testing cache TTL functionality...');

  const cache = new AutocompleteCache({
    maxSize: 100,
    ttl: 100, // Very short TTL for testing
  });

  // Set some data
  cache.set('test-key', ['data1', 'data2']);

  // Should be available immediately
  let data = cache.get('test-key');
  if (!data) {
    throw new Error('Data should be available immediately after setting');
  }

  // Wait for TTL to expire
  await new Promise((resolve) => setTimeout(resolve, 150));

  // Should be expired now
  data = cache.get('test-key');
  if (data) {
    throw new Error('Data should be expired after TTL');
  }

  cache.destroy();
  console.log('  ✅ Cache TTL test passed\n');
}

/**
 * Test cache prefetching functionality.
 */
async function testCachePrefetching() {
  console.log('🧪 Testing cache prefetching...');

  const cache = new AutocompleteCache({
    maxSize: 100,
    ttl: 5000,
  });

  let fetchCount = 0;
  const mockFetchFn = (key) => {
    fetchCount++;

    return [`result-for-${key}`];
  };

  // Prefetch some keys
  const keys = ['key1', 'key2', 'key3'];
  await cache.prefetch(keys, mockFetchFn);

  // Verify data was fetched and cached
  for (const key of keys) {
    const data = cache.get(key);
    if (!data || data[0] !== `result-for-${key}`) {
      throw new Error(`Prefetch failed for key ${key}`);
    }
  }

  console.log(`  ✅ Prefetched ${keys.length} keys with ${fetchCount} fetch calls`);

  // Test prefetch with existing keys (should not fetch again)
  fetchCount = 0;
  await cache.prefetch(keys, mockFetchFn);

  if (fetchCount > 0) {
    throw new Error(`Unexpected fetch calls for existing keys: ${fetchCount}`);
  }

  cache.destroy();
  console.log('  ✅ Cache prefetching test passed\n');
}

/**
 * Run all performance validation tests.
 */
async function runAllTests() {
  console.log('🚀 Starting Autocomplete Performance Validation\n');

  try {
    await testCachePerformance();
    await testPerformanceMonitor();
    await testCacheMemoryManagement();
    await testCacheTTL();
    await testCachePrefetching();

    console.log('✅ All performance validation tests passed!');
    console.log('\n📈 Performance optimizations are working correctly:');
    console.log('  • Advanced caching with LRU eviction');
    console.log('  • Memory management and limits');
    console.log('  • TTL-based cache expiration');
    console.log('  • Performance monitoring and metrics');
    console.log('  • Cache prefetching for common queries');
  } catch (error) {
    console.error('❌ Performance validation failed:', error.message);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().then(() => {
    console.log('\n🎉 Performance validation completed successfully!');
    process.exit(0);
  }).catch((error) => {
    console.error('💥 Performance validation failed:', error);
    process.exit(1);
  });
}

module.exports = { runAllTests };
