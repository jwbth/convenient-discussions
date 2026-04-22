import { describe, test, expect, beforeEach } from 'vitest'

import Page from '../src/Page'
import pageRegistry from '../src/pageRegistry'

describe('pageRegistry.getFromTemplateName', () => {
	beforeEach(() => {
		// Clear the registry before each test
		pageRegistry.items = {}

		// Set up minimal cd.g for Page constructor
		global.convenientDiscussions.g = {
			pageName: 'Test Page',
		}
	})

	test('should convert {{template}} to Template:Template', () => {
		const page = pageRegistry.getFromTemplateName('template')

		expect(page).toBeInstanceOf(Page)
		expect(page.name).toBe('Template:Template')
		expect(page.namespaceId).toBe(10)
	})

	test('should convert {{:template}} to Template (main namespace)', () => {
		const page = pageRegistry.getFromTemplateName(':template')

		expect(page).toBeInstanceOf(Page)
		expect(page.name).toBe('Template')
		expect(page.namespaceId).toBe(0)
	})

	test('should convert {{user:username/template}} to User:Username/template', () => {
		const page = pageRegistry.getFromTemplateName('user:username/template')

		expect(page).toBeInstanceOf(Page)
		expect(page.name).toBe('User:Username/template')
		expect(page.namespaceId).toBe(2)
	})

	test('should convert {{Some prefix that is not a namespace:Template}} to Template:Some prefix that is not a namespace:Template', () => {
		const page = pageRegistry.getFromTemplateName('Some prefix that is not a namespace:Template')

		expect(page).toBeInstanceOf(Page)
		expect(page.name).toBe('Template:Some prefix that is not a namespace:Template')
		expect(page.namespaceId).toBe(10)
	})

	test('should handle {{wikipedia:Manual of Style}} as explicit namespace', () => {
		const page = pageRegistry.getFromTemplateName('wikipedia:Manual of Style')

		expect(page).toBeInstanceOf(Page)
		expect(page.name).toBe('Wikipedia:Manual of Style')
		expect(page.namespaceId).toBe(4)
	})

	test('should handle {{:Main Page}} as main namespace with leading colon', () => {
		const page = pageRegistry.getFromTemplateName(':Main Page')

		expect(page).toBeInstanceOf(Page)
		expect(page.name).toBe('Main Page')
		expect(page.namespaceId).toBe(0)
	})

	test('should handle {{Template:Infobox}} explicitly', () => {
		const page = pageRegistry.getFromTemplateName('Template:Infobox')

		expect(page).toBeInstanceOf(Page)
		expect(page.name).toBe('Template:Infobox')
		expect(page.namespaceId).toBe(10)
	})

	test('should handle {{Help:Contents}} as explicit namespace', () => {
		const page = pageRegistry.getFromTemplateName('Help:Contents')

		expect(page).toBeInstanceOf(Page)
		expect(page.name).toBe('Help:Contents')
		expect(page.namespaceId).toBe(12)
	})

	test('should return same instance for duplicate calls (registry caching)', () => {
		const page1 = pageRegistry.getFromTemplateName('template')
		const page2 = pageRegistry.getFromTemplateName('template')

		expect(page1).toBe(page2)
	})

	test('should return undefined for invalid template names', () => {
		// Temporarily replace newFromText to return null
		const originalNewFromText = global.mw.Title.newFromText
		global.mw.Title.newFromText = () => null

		const page = pageRegistry.getFromTemplateName('')

		expect(page).toBeUndefined()

		// Restore
		global.mw.Title.newFromText = originalNewFromText
	})

	test('should handle case sensitivity correctly', () => {
		const page1 = pageRegistry.getFromTemplateName('MyTemplate')
		const page2 = pageRegistry.getFromTemplateName('myTemplate')

		// Both should normalize to the same page (first letter capitalized)
		expect(page1.name).toBe('Template:MyTemplate')
		expect(page2.name).toBe('Template:MyTemplate')
	})

	test('should handle templates with slashes (subpages)', () => {
		const page = pageRegistry.getFromTemplateName('Infobox/doc')

		expect(page).toBeInstanceOf(Page)
		expect(page.name).toBe('Template:Infobox/doc')
		expect(page.namespaceId).toBe(10)
	})

	test('should handle {{:user:username}} as main namespace reference to user page', () => {
		const page = pageRegistry.getFromTemplateName(':user:username')

		expect(page).toBeInstanceOf(Page)
		expect(page.name).toBe('User:Username')
		expect(page.namespaceId).toBe(2)
	})
})
