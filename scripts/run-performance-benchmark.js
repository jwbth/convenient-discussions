#!/usr/bin/env node

/**
 * Script to run performance benchmarks for the autocomplete system.
 * This can be used to measure performance before and after changes.
 */

import { runAllBenchmarks, checkPerformanceThresholds } from '../tests/performance-benchmark.js';

async function main() {
	console.log('🚀 Starting Autocomplete Performance Benchmarks...\n');

	try {
		// Run all benchmarks
		await runAllBenchmarks();

		console.log('\n✅ Benchmarks completed successfully!');

		// Check if we have previous results to compare against
		const fs = await import('fs');
		const path = await import('path');

		const resultsFile = 'benchmark-results.json';
		if (fs.existsSync(resultsFile)) {
			const results = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
			const thresholdsPassed = checkPerformanceThresholds(results.results);

			if (!thresholdsPassed) {
				console.log('\n⚠️  Some performance thresholds were not met. Consider optimizing the code.');
				process.exit(1);
			} else {
				console.log('\n✅ All performance thresholds met!');
			}
		}

	} catch (error) {
		console.error('❌ Benchmark failed:', error);
		process.exit(1);
	}
}

// Handle command line arguments
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
	console.log(`
Usage: node scripts/run-performance-benchmark.js [options]

Options:
  --help, -h     Show this help message

This script runs performance benchmarks for the autocomplete system and
checks if the results meet predefined performance thresholds.

The results are saved to benchmark-results.json for future comparison.
`);
	process.exit(0);
}

main();