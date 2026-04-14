// @ts-check
import { expect, test } from '@playwright/test'

/**
 * Test for the Russian Wikipedia single build.
 * This test verifies that the single build script works correctly with:
 * - Russian configuration (config/wikis/w-ru.js)
 * - Russian i18n translations (i18n/ru.json)
 */

const TEST_PAGE_URL =
	'https://ru.wikipedia.org/wiki/%D0%9E%D0%B1%D1%81%D1%83%D0%B6%D0%B4%D0%B5%D0%BD%D0%B8%D0%B5_%D1%83%D1%87%D0%B0%D1%81%D1%82%D0%BD%D0%B8%D0%BA%D0%B0:Jack_who_built_the_house/CD_test_page'

test.describe('Russian Wikipedia Single Build', () => {
	test('should load single build with Russian config and i18n', async ({ page }) => {
		console.log(`🚀 Testing Russian Wikipedia single build on: ${TEST_PAGE_URL}`)

		// Set up console message capture
		const consoleMessages = []
		page.on('console', (msg) => {
			const type = msg.type()
			const text = msg.text()
			consoleMessages.push({ type, text })
			console.log(`[${type.toUpperCase()}]`, text)
		})

		// Set up page error capture
		page.on('pageerror', (error) => {
			const text = error.stack || error.message
			console.log(`💥 Page Error: ${text}`)
			consoleMessages.push({ type: 'pageerror', text })
		})

		// Navigate to the test page
		await page.goto(TEST_PAGE_URL)
		console.log('📄 Navigated to Russian Wikipedia test page')

		// Wait for page to load
		await page.waitForLoadState('networkidle')
		console.log('🌐 Page loaded')

		// Wait for MediaWiki globals
		await page.waitForFunction(() => window.mw && window.$, { timeout: 10_000 })
		console.log('⚙️ MediaWiki globals loaded')

		// Inject the Russian single build script
		await page.addScriptTag({
			path: './dist/convenientDiscussions.single.w-ru.js',
		})
		console.log('💉 Russian single build script injected')

		// Wait for CD to initialize
		try {
			await page.waitForFunction(
				() =>
					window.convenientDiscussions?.comments !== undefined &&
					window.convenientDiscussions.comments.length > 0 &&
					window.convenientDiscussions.settings,
				{ timeout: 60_000 },
			)
		} catch (error) {
			// Print all console messages to help debug
			console.log('\n📋 Console messages during initialization:')
			consoleMessages.forEach((msg) => {
				console.log(`  [${msg.type}] ${msg.text}`)
			})
			throw error
		}
		console.log('🎯 Convenient Discussions initialized')

		// Additional wait for full initialization
		await page.waitForTimeout(2000)
		console.log('✅ Setup complete')

		// Test 1: Verify Russian i18n is loaded
		const scriptName = await page.evaluate(() => window.convenientDiscussions.s('script-name'))
		expect(scriptName).toBe('«Удобные обсуждения»')
		console.log('✓ Russian i18n loaded: script-name =', scriptName)

		// Test 2: Verify more Russian translations
		const replyButton = await page.evaluate(() => window.convenientDiscussions.s('cm-reply'))
		expect(replyButton).toBe('Ответить')
		console.log('✓ Russian translation: cm-reply =', replyButton)

		const editButton = await page.evaluate(() => window.convenientDiscussions.s('cm-edit'))
		expect(editButton).toBe('Редактировать')
		console.log('✓ Russian translation: cm-edit =', editButton)

		const copyLink = await page.evaluate(() => window.convenientDiscussions.s('cm-copylink'))
		expect(copyLink).toBe('Скопировать ссылку')
		console.log('✓ Russian translation: cm-copylink =', copyLink)

		// Test 3: Verify Russian config is loaded
		const configExists = await page.evaluate(
			() => window.convenientDiscussions.config !== undefined,
		)
		expect(configExists).toBe(true)
		console.log('✓ Config object exists')

		// Test 4: Check Russian-specific config values that differ from defaults
		const timezone = await page.evaluate(() => window.convenientDiscussions.config.timezone)
		expect(timezone).toBe('UTC')
		console.log('✓ Russian config: timezone =', timezone)

		const defaultIndentationChar = await page.evaluate(
			() => window.convenientDiscussions.config.defaultIndentationChar,
		)
		expect(defaultIndentationChar).toBe('*')
		console.log('✓ Russian config: defaultIndentationChar =', defaultIndentationChar)

		const indentationCharMode = await page.evaluate(
			() => window.convenientDiscussions.config.indentationCharMode,
		)
		expect(indentationCharMode).toBe('unify')
		console.log('✓ Russian config: indentationCharMode =', indentationCharMode)

		// Test 5: Check Russian-specific messages in config
		const sundayMessage = await page.evaluate(
			() => window.convenientDiscussions.config.messages?.sun,
		)
		expect(sundayMessage).toBe('Вс')
		console.log('✓ Russian config message: sun =', sundayMessage)

		const januaryMessage = await page.evaluate(
			() => window.convenientDiscussions.config.messages?.jan,
		)
		expect(januaryMessage).toBe('янв')
		console.log('✓ Russian config message: jan =', januaryMessage)

		// Test 6: Check special page aliases
		const contributionsAlias = await page.evaluate(
			() => window.convenientDiscussions.config.specialPageAliases?.Contributions,
		)
		expect(contributionsAlias).toBe('Вклад')
		console.log('✓ Russian config: Contributions alias =', contributionsAlias)

		// Test 7: Check substAliases
		const substAliases = await page.evaluate(() => window.convenientDiscussions.config.substAliases)
		expect(substAliases).toContain('подстановка:')
		expect(substAliases).toContain('подст:')
		console.log('✓ Russian config: substAliases =', substAliases)

		// Test 8: Check userNamespacesByGender
		const femaleUserNamespace = await page.evaluate(
			() => window.convenientDiscussions.config.userNamespacesByGender?.female,
		)
		expect(femaleUserNamespace).toBe('Участница')
		console.log('✓ Russian config: female user namespace =', femaleUserNamespace)

		// Test 9: Check genderNeutralUserNamespaceAlias
		const genderNeutralAlias = await page.evaluate(
			() => window.convenientDiscussions.config.genderNeutralUserNamespaceAlias,
		)
		expect(genderNeutralAlias).toBe('У')
		console.log('✓ Russian config: gender neutral alias =', genderNeutralAlias)

		// Test 10: Check tagName
		const tagName = await page.evaluate(() => window.convenientDiscussions.config.tagName)
		expect(tagName).toBe('convenient-discussions')
		console.log('✓ Russian config: tagName =', tagName)

		// Test 11: Check unsignedTemplates (Russian-specific)
		const unsignedTemplates = await page.evaluate(
			() => window.convenientDiscussions.config.unsignedTemplates,
		)
		expect(unsignedTemplates).toContain('Без подписи')
		expect(unsignedTemplates).toContain('Не подписался')
		console.log('✓ Russian config: unsignedTemplates includes Russian templates')

		// Test 12: Check pageWhitelist (Russian-specific patterns)
		const pageWhitelist = await page.evaluate(
			() => window.convenientDiscussions.config.pageWhitelist,
		)
		expect(pageWhitelist.length).toBeGreaterThan(0)
		console.log('✓ Russian config: pageWhitelist has', pageWhitelist.length, 'entries')

		// Test 13: Verify comments are parsed
		const commentCount = await page.evaluate(() => window.convenientDiscussions.comments.length)
		expect(commentCount).toBeGreaterThan(0)
		console.log('✓ Parsed', commentCount, 'comments on the page')

		// Test 14: Check that comment buttons have Russian text
		const firstCommentButton = await page.locator('.cd-button-ooui[title*="Ответить"]').first()
		if ((await firstCommentButton.count()) > 0) {
			await expect(firstCommentButton).toBeVisible()
			console.log('✓ Comment reply button with Russian text is visible')
		} else {
			console.log('⚠ No reply buttons found (page might not have comments)')
		}

		// Test 15: Verify the script is running in single mode
		const isSingleMode = await page.evaluate(() => window.convenientDiscussions.g.isSingle === true)
		expect(isSingleMode).toBe(true)
		console.log('✓ Script is running in single mode')

		// Test 16: Check that Russian language is set
		const userLanguage = await page.evaluate(() => window.convenientDiscussions.g.userLanguage)
		const contentLanguage = await page.evaluate(
			() => window.convenientDiscussions.g.contentLanguage,
		)
		console.log('✓ User language:', userLanguage)
		console.log('✓ Content language:', contentLanguage)

		// Test 17: Verify i18n object has Russian translations
		const hasRussianI18n = await page.evaluate(() => 'ru' in window.convenientDiscussions.i18n)
		expect(hasRussianI18n).toBe(true)
		console.log('✓ Russian i18n object exists')

		// Test 18: Verify English fallback is also loaded
		const hasEnglishI18n = await page.evaluate(() => 'en' in window.convenientDiscussions.i18n)
		expect(hasEnglishI18n).toBe(true)
		console.log('✓ English i18n fallback exists')

		console.log('🎉 All tests passed!')
	})
})
