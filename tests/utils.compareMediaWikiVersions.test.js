import { describe, test, expect, beforeEach } from 'vitest'

// Mock mw global before imports
const mwConfig = new Map()

globalThis.mw = {
	config: {
		set: (key, value) => mwConfig.set(key, value),
		get: (key) => mwConfig.get(key),
	},
}

import { utils } from '../src/loader/convenientDiscussions.utils.js'

describe('compareMediaWikiVersions', () => {
	beforeEach(() => {
		// Reset config between tests
		mwConfig.clear()
	})

	describe('compareMediaWikiVersions basic comparisons', () => {
		test('should compare equal standard versions', () => {
			const result = utils.compareMediaWikiVersions('1.35.6', '1.35.6')
			expect(result).toBe(0)
		})

		test('should return positive when first version is higher', () => {
			const result = utils.compareMediaWikiVersions('1.36.0', '1.35.0')
			expect(result).toBeGreaterThan(0)
		})

		test('should return negative when first version is lower', () => {
			const result = utils.compareMediaWikiVersions('1.34.0', '1.35.0')
			expect(result).toBeLessThan(0)
		})

		test('should compare different patch versions', () => {
			const result = utils.compareMediaWikiVersions('1.35.12', '1.35.6')
			expect(result).toBeGreaterThan(0)
		})

		test('should compare different minor versions', () => {
			const result = utils.compareMediaWikiVersions('1.36.0', '1.35.12')
			expect(result).toBeGreaterThan(0)
		})
	})

	describe('compareMediaWikiVersions with WMF versions', () => {
		test('should handle identical WMF versions', () => {
			const result = utils.compareMediaWikiVersions('1.46.0-wmf.24', '1.46.0-wmf.24')
			expect(result).toBe(0)
		})

		test('should compare different WMF patch numbers', () => {
			const result = utils.compareMediaWikiVersions('1.46.0-wmf.24', '1.46.0-wmf.12')
			expect(result).toBeGreaterThan(0)
		})

		test('should compare lower WMF version to higher WMF version', () => {
			const result = utils.compareMediaWikiVersions('1.46.0-wmf.12', '1.46.0-wmf.24')
			expect(result).toBeLessThan(0)
		})

		test('should handle WMF with different main versions', () => {
			const result = utils.compareMediaWikiVersions('1.47.0-wmf.1', '1.46.0-wmf.50')
			expect(result).toBeGreaterThan(0)
		})
	})

	describe('compareMediaWikiVersions release vs WMF', () => {
		test('should consider release version higher than WMF version with same main', () => {
			const result = utils.compareMediaWikiVersions('1.46.0', '1.46.0-wmf.24')
			expect(result).toBeGreaterThan(0)
		})

		test('should consider WMF version lower than release version with same main', () => {
			const result = utils.compareMediaWikiVersions('1.46.0-wmf.24', '1.46.0')
			expect(result).toBeLessThan(0)
		})

		test('should handle higher WMF vs lower release', () => {
			const result = utils.compareMediaWikiVersions('1.46.0-wmf.50', '1.45.0')
			expect(result).toBeGreaterThan(0)
		})
	})

	describe('compareMediaWikiVersions edge cases', () => {
		test('should handle versions with different number of parts', () => {
			const result = utils.compareMediaWikiVersions('1.35', '1.35.0')
			expect(result).toBe(0)
		})

		test('should handle three-part versions', () => {
			const result = utils.compareMediaWikiVersions('1.35.6.1', '1.35.6')
			expect(result).toBeGreaterThan(0)
		})

		test('should handle single digit major version', () => {
			const result = utils.compareMediaWikiVersions('2.0.0', '1.99.99')
			expect(result).toBeGreaterThan(0)
		})
	})
})

describe('isVersionEqualOrHigher', () => {
	beforeEach(() => {
		mwConfig.clear()
	})

	describe('basic functionality', () => {
		test('should return true when current equals required', () => {
			mwConfig.set('wgVersion', '1.35.12')
			const result = utils.isMwVersionEqualOrHigher('1.35.12')
			expect(result).toBe(true)
		})

		test('should return false when required version is higher than current', () => {
			mwConfig.set('wgVersion', '1.35.12')
			const result = utils.isMwVersionEqualOrHigher('1.35.13')
			expect(result).toBe(false)
		})

		test('should return true when current is higher than required', () => {
			mwConfig.set('wgVersion', '1.35.12')
			const result = utils.isMwVersionEqualOrHigher('1.35.6')
			expect(result).toBe(true)
		})

		test('should return false when required version is much higher than current', () => {
			mwConfig.set('wgVersion', '1.35.0')
			const result = utils.isMwVersionEqualOrHigher('1.46.0')
			expect(result).toBe(false)
		})
	})

	describe('user-provided examples', () => {
		test('user example 1: current 1.35.12 with required 1.35.6 should return true', () => {
			mwConfig.set('wgVersion', '1.35.12')
			const result = utils.isMwVersionEqualOrHigher('1.35.6')
			expect(result).toBe(true)
		})

		test('user example 2: current 1.46.0-wmf.12 with required 1.46.0-wmf.24 should return false', () => {
			mwConfig.set('wgVersion', '1.46.0-wmf.12')
			const result = utils.isMwVersionEqualOrHigher('1.46.0-wmf.24')
			expect(result).toBe(false)
		})

		test('user example 3: current 1.46.0-wmf.12 with required 1.45.0-wmf.24 should return true', () => {
			mwConfig.set('wgVersion', '1.46.0-wmf.12')
			const result = utils.isMwVersionEqualOrHigher('1.45.0-wmf.24')
			expect(result).toBe(true)
		})
	})

	describe('WMF version checks', () => {
		test('should handle identical WMF versions', () => {
			mwConfig.set('wgVersion', '1.46.0-wmf.24')
			const result = utils.isMwVersionEqualOrHigher('1.46.0-wmf.24')
			expect(result).toBe(true)
		})

		test('should return false when required WMF is higher than current', () => {
			mwConfig.set('wgVersion', '1.46.0-wmf.12')
			const result = utils.isMwVersionEqualOrHigher('1.46.0-wmf.25')
			expect(result).toBe(false)
		})
	})

	describe('partial version support', () => {
		test('should return true when current 1.36.15 is higher than required 1.36', () => {
			mwConfig.set('wgVersion', '1.36.15')
			const result = utils.isMwVersionEqualOrHigher('1.36')
			expect(result).toBe(true)
		})

		test('should return false when current 1.36.15 is lower than required 1.37', () => {
			mwConfig.set('wgVersion', '1.36.15')
			const result = utils.isMwVersionEqualOrHigher('1.37')
			expect(result).toBe(false)
		})

		test('should return true when current 1.36 equals required 1.36', () => {
			mwConfig.set('wgVersion', '1.36')
			const result = utils.isMwVersionEqualOrHigher('1.36')
			expect(result).toBe(true)
		})

		test('should return true when current 1.36.15 is higher than required 1', () => {
			mwConfig.set('wgVersion', '1.36.15')
			const result = utils.isMwVersionEqualOrHigher('1')
			expect(result).toBe(true)
		})

		test('should return false when current 1 is lower than required 2', () => {
			mwConfig.set('wgVersion', '1.36.15')
			const result = utils.isMwVersionEqualOrHigher('2')
			expect(result).toBe(false)
		})

		test('should return true when current 1.46.15 is higher than required 1.46', () => {
			mwConfig.set('wgVersion', '1.46.15')
			const result = utils.isMwVersionEqualOrHigher('1.46')
			expect(result).toBe(true)
		})

		test('should return true when current 2.0 is higher than required 1.46', () => {
			mwConfig.set('wgVersion', '2.0')
			const result = utils.isMwVersionEqualOrHigher('1.46')
			expect(result).toBe(true)
		})
	})

	describe('cross-major-version checks', () => {
		test('should return false when required version is much higher than current', () => {
			mwConfig.set('wgVersion', '1.35.0')
			const result = utils.isMwVersionEqualOrHigher('1.46.0')
			expect(result).toBe(false)
		})

		test('should return true when current version is much higher than required', () => {
			mwConfig.set('wgVersion', '1.46.0')
			const result = utils.isMwVersionEqualOrHigher('1.35.0')
			expect(result).toBe(true)
		})
	})
})
