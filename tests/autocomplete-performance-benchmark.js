/**
 * Performance benchmarking utility for autocomplete system.
 * This script can be run to measure and compare performance metrics.
 */

import AutocompleteManager from '../src/AutocompleteManager.js';
import CommentLinksAutocomplete from '../src/CommentLinksAutocomplete.js';
import MentionsAutocomplete from '../src/MentionsAutocomplete.js';
import TagsAutocomplete from '../src/TagsAutocomplete.js';
import TemplatesAutocomplete from '../src/TemplatesAutocomplete.js';
import WikilinksAutocomplete from '../src/WikilinksAutocomplete.js';

// Mock environment setup
global.mw = {
  util: {
    escapeRegExp: (str) => str.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`),
  },
};

global.OO = {
  ui: {
    MultilineTextInputWidget: class {},
  },
};

// Mock cd object
const mockCd = {
  g: {
    contentDirection: 'ltr',
    userNamespacesRegexp: /^User:/,
    colonNamespacesPrefixRegexp: /^:/,
    contribsPages: ['Special:Contributions'],
  },
  s: (key) => key,
  mws: (key) => ' ',
  config: {
    mentionCharacter: '@',
    mentionRequiresLeadingSpace: false,
  },
  getApi: () => ({
    get: () => Promise.resolve({
      query: { allusers: [] },
      pages: {},
    }),
  }),
};

// Performance measurement class
class PerformanceBenchmark {
  constructor() {
    this.results = {};
    this.iterations = 100;
  }

  /**
   * Run a benchmark test multiple times and collect statistics.
   *
   * @param {string} name Test name
   * @param {Function} testFn Test function to run
   * @param {number} [iterations] Number of iterations
   * @returns {Promise<object>} Performance statistics
   */
  async runBenchmark(name, testFn, iterations = this.iterations) {
    console.log(`Running benchmark: ${name} (${iterations} iterations)`);

    const times = [];
    const memoryUsages = [];

    // Warm up
    for (let i = 0; i < 5; i++) {
      await testFn();
    }

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    const initialMemory = this.getMemoryUsage();

    // Run actual benchmark
    for (let i = 0; i < iterations; i++) {
      const startTime = performance.now();
      const startMemory = this.getMemoryUsage();

      await testFn();

      const endTime = performance.now();
      const endMemory = this.getMemoryUsage();

      times.push(endTime - startTime);
      memoryUsages.push(endMemory - startMemory);
    }

    const finalMemory = this.getMemoryUsage();

    const stats = {
      name,
      iterations,
      times: {
        min: Math.min(...times),
        max: Math.max(...times),
        avg: times.reduce((a, b) => a + b, 0) / times.length,
        median: this.getMedian(times),
        p95: this.getPercentile(times, 95),
        p99: this.getPercentile(times, 99),
      },
      memory: {
        baseline: initialMemory,
        final: finalMemory,
        delta: finalMemory - initialMemory,
        avgPerIteration: memoryUsages.reduce((a, b) => a + b, 0) / memoryUsages.length,
      },
    };

    this.results[name] = stats;

    return stats;
  }

  /**
   * Get current memory usage.
   *
   * @returns {number} Memory usage in bytes
   */
  getMemoryUsage() {
    if (typeof performance !== 'undefined' && performance.memory) {
      return performance.memory.usedJSHeapSize;
    }
    if (typeof process !== 'undefined' && process.memoryUsage) {
      return process.memoryUsage().heapUsed;
    }

    return 0;
  }

  /**
   * Calculate median of an array.
   *
   * @param {number[]} arr Array of numbers
   * @returns {number} Median value
   */
  getMedian(arr) {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);

    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }

  /**
   * Calculate percentile of an array.
   *
   * @param {number[]} arr Array of numbers
   * @param {number} percentile Percentile to calculate (0-100)
   * @returns {number} Percentile value
   */
  getPercentile(arr, percentile) {
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;

    return sorted[Math.max(0, index)];
  }

  /**
   * Print benchmark results in a formatted table.
   */
  printResults() {
    console.log('\n=== Performance Benchmark Results ===\n');

    Object.values(this.results).forEach((stats) => {
      console.log(`${stats.name}:`);
      console.log(`  Response Times (ms):`);
      console.log(`    Min:    ${stats.times.min.toFixed(2)}`);
      console.log(`    Max:    ${stats.times.max.toFixed(2)}`);
      console.log(`    Avg:    ${stats.times.avg.toFixed(2)}`);
      console.log(`    Median: ${stats.times.median.toFixed(2)}`);
      console.log(`    P95:    ${stats.times.p95.toFixed(2)}`);
      console.log(`    P99:    ${stats.times.p99.toFixed(2)}`);
      console.log(`  Memory Usage:`);
      console.log(`    Delta:  ${this.formatBytes(stats.memory.delta)}`);
      console.log(`    Avg/Op: ${this.formatBytes(stats.memory.avgPerIteration)}`);
      console.log('');
    });
  }

  /**
   * Format bytes into human-readable format.
   *
   * @param {number} bytes Number of bytes
   * @returns {string} Formatted string
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));

    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  }

  /**
   * Save results to JSON file.
   *
   * @param {string} filename Output filename
   */
  saveResults(filename = 'benchmark-results.json') {
    const fs = require('node:fs');
    const data = {
      timestamp: new Date().toISOString(),
      results: this.results,
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
      },
    };

    fs.writeFileSync(filename, JSON.stringify(data, null, 2));
    console.log(`Results saved to ${filename}`);
  }
}

// Benchmark test functions
async function benchmarkMentionsAutocomplete() {
  const mentions = new MentionsAutocomplete();
  mentions.cache.test = ['testuser1', 'testuser2', 'testuser3'];

  const callback = () => {};
  await mentions.getValues('test', callback);
}

async function benchmarkWikilinksAutocomplete() {
  const wikilinks = new WikilinksAutocomplete();
  wikilinks.defaultEntries = ['Test page', 'Test article', 'Another test'];

  const callback = () => {};
  await wikilinks.getValues('test', callback);
}

async function benchmarkTemplatesAutocomplete() {
  const templates = new TemplatesAutocomplete();
  templates.defaultEntries = Array.from({ length: 100 }, (_, i) => `Template${i}`);

  const callback = () => {};
  await templates.getValues('temp', callback);
}

async function benchmarkTagsAutocomplete() {
  const tags = new TagsAutocomplete();

  const callback = () => {};
  await tags.getValues('div', callback);
}

async function benchmarkCommentLinksAutocomplete() {
  const commentLinks = new CommentLinksAutocomplete();
  const comments = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    getText: () => `Comment ${i} text`,
    getAuthor: () => ({ getName: () => `User${i}` }),
  }));
  commentLinks.data = { comments };

  const callback = () => {};
  await commentLinks.getValues('comment', callback);
}

async function benchmarkAutocompleteManager() {
  const mockInputs = [{
    $input: [{ addEventListener: () => {} }],
  }];

  const manager = new AutocompleteManager({
    types: ['mentions', 'wikilinks', 'templates', 'tags', 'commentLinks'],
    inputs: mockInputs,
  });

  // Simulate some operations
  const mentionsInstance = manager.autocompleteInstances.get('mentions');
  if (mentionsInstance) {
    mentionsInstance.cache.test = ['testuser1'];
    const callback = () => {};
    await mentionsInstance.getValues('test', callback);
  }

  manager.terminate();
}

async function benchmarkLargeDataset() {
  const mentions = new MentionsAutocomplete();
  mentions.defaultEntries = Array.from({ length: 1000 }, (_, i) => `User${i}`);

  const callback = () => {};
  await mentions.getValues('User1', callback);
}

async function benchmarkConcurrentRequests() {
  const mentions = new MentionsAutocomplete();
  mentions.cache.test = ['testuser1', 'testuser2'];

  const callback = () => {};
  const promises = Array.from({ length: 10 }, () =>
    mentions.getValues('test', callback)
  );

  await Promise.all(promises);
}

// Main benchmark runner
async function runAllBenchmarks() {
  const benchmark = new PerformanceBenchmark();

  console.log('Starting autocomplete performance benchmarks...\n');

  // Set up mocks
  global.cd = mockCd;

  try {
    await benchmark.runBenchmark('Mentions Autocomplete (Cached)', benchmarkMentionsAutocomplete);
    await benchmark.runBenchmark('Wikilinks Autocomplete (Local)', benchmarkWikilinksAutocomplete);
    await benchmark.runBenchmark('Templates Autocomplete (100 items)', benchmarkTemplatesAutocomplete);
    await benchmark.runBenchmark('Tags Autocomplete (Predefined)', benchmarkTagsAutocomplete);
    await benchmark.runBenchmark('Comment Links Autocomplete (50 comments)', benchmarkCommentLinksAutocomplete);
    await benchmark.runBenchmark('AutocompleteManager Integration', benchmarkAutocompleteManager);
    await benchmark.runBenchmark('Large Dataset (1000 users)', benchmarkLargeDataset);
    await benchmark.runBenchmark('Concurrent Requests (10x)', benchmarkConcurrentRequests);

    benchmark.printResults();
    benchmark.saveResults();
  } catch (error) {
    console.error('Benchmark failed:', error);
    process.exit(1);
  }
}

// Performance thresholds for regression testing
const PERFORMANCE_THRESHOLDS = {
  'Mentions Autocomplete (Cached)': { maxAvgTime: 50, maxMemoryDelta: 1024 * 1024 },
  'Wikilinks Autocomplete (Local)': { maxAvgTime: 100, maxMemoryDelta: 1024 * 1024 },
  'Templates Autocomplete (100 items)': { maxAvgTime: 200, maxMemoryDelta: 2 * 1024 * 1024 },
  'Tags Autocomplete (Predefined)': { maxAvgTime: 30, maxMemoryDelta: 512 * 1024 },
  'Comment Links Autocomplete (50 comments)': { maxAvgTime: 150, maxMemoryDelta: 1024 * 1024 },
  'AutocompleteManager Integration': { maxAvgTime: 100, maxMemoryDelta: 2 * 1024 * 1024 },
  'Large Dataset (1000 users)': { maxAvgTime: 500, maxMemoryDelta: 5 * 1024 * 1024 },
  'Concurrent Requests (10x)': { maxAvgTime: 200, maxMemoryDelta: 2 * 1024 * 1024 },
};

/**
 * Check if benchmark results meet performance thresholds.
 *
 * @param {object} results Benchmark results
 * @returns {boolean} Whether all thresholds are met
 */
function checkPerformanceThresholds(results) {
  let allPassed = true;

  console.log('\n=== Performance Threshold Check ===\n');

  Object.entries(PERFORMANCE_THRESHOLDS).forEach(([name, thresholds]) => {
    const result = results[name];
    if (!result) {
      console.log(`❌ ${name}: No results found`);
      allPassed = false;

      return;
    }

    const timePass = result.times.avg <= thresholds.maxAvgTime;
    const memoryPass = Math.abs(result.memory.delta) <= thresholds.maxMemoryDelta;

    console.log(`${timePass && memoryPass ? '✅' : '❌'} ${name}:`);
    console.log(`   Time: ${result.times.avg.toFixed(2)}ms (max: ${thresholds.maxAvgTime}ms) ${timePass ? '✅' : '❌'}`);
    console.log(`   Memory: ${benchmark.formatBytes(result.memory.delta)} (max: ${benchmark.formatBytes(thresholds.maxMemoryDelta)}) ${memoryPass ? '✅' : '❌'}`);

    if (!timePass || !memoryPass) {
      allPassed = false;
    }
  });

  console.log(`\nOverall: ${allPassed ? '✅ All thresholds met' : '❌ Some thresholds failed'}`);

  return allPassed;
}

// Export for use in tests
export { PERFORMANCE_THRESHOLDS, PerformanceBenchmark, checkPerformanceThresholds, runAllBenchmarks };

// Run benchmarks if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllBenchmarks().then(() => {
    console.log('Benchmarks completed successfully');
    process.exit(0);
  }).catch((error) => {
    console.error('Benchmarks failed:', error);
    process.exit(1);
  });
}
