import {
	readdirSync,
	readFileSync,
	existsSync,
	mkdirSync,
	writeFileSync,
	createWriteStream,
} from 'node:fs'
import { rm } from 'node:fs/promises'
import https from 'node:https'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'

import { extract } from 'tar'

const __dirname = new URL('.', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')

/**
 * Download and extract language messages from Wikimedia.
 */
async function downloadAndExtractMessages() {
	const messagesDir = path.join(__dirname, 'messages')

	const url =
		'https://gerrit.wikimedia.org/r/plugins/gitiles/mediawiki/core/+archive/HEAD/languages/messages.tar.gz'
	const tempFile = path.join(__dirname, 'messages.tar.gz')

	if (existsSync(tempFile)) {
		console.log('Archive already exists, skipping download.')
	} else {
		console.log('Downloading language messages from Wikimedia...')

		// Download the file
		await new Promise((resolve, reject) => {
			const options = {
				headers: {
					'User-Agent':
						'Convenient Discussions language fallback collector/0.0 (https://commons.wikimedia.org/wiki/User:Jack_who_built_the_house/Convenient_Discussions; User:Jack who built the house)',
				},
			}

			https
				.get(url, options, (response) => {
					const statusCode = response.statusCode ?? 0
					if (statusCode !== 200) {
						const retryAfter = response.headers['retry-after']
						const retryMsg = retryAfter ? ` Retry-After: ${retryAfter}` : ''
						reject(
							new Error(
								`Failed to download: ${statusCode}${retryMsg}. If you always get this error, download messages.tar.gz manually from https://gerrit.wikimedia.org/r/plugins/gitiles/mediawiki/core/+archive/HEAD/languages/messages.tar.gz and put it into the directory with the script.`,
							),
						)

						return
					}

					pipeline(response, createWriteStream(tempFile)).then(resolve).catch(reject)
				})
				.on('error', reject)
		})
	}

	console.log('Extracting messages...')

	// Create messages directory
	mkdirSync(messagesDir, { recursive: true })

	// Extract directly to messages directory
	await extract({
		file: tempFile,
		cwd: messagesDir,
	})

	// Clean up temp file
	// await unlink(tempFile)
	// console.log('messages.tar.gz removed.')

	console.log('Messages extracted successfully!')
}

await downloadAndExtractMessages()

// https://gerrit.wikimedia.org/r/plugins/gitiles/mediawiki/core/+/HEAD/languages/messages → tgz
const messagesDir = path.join(__dirname, 'messages')
/** @type {Record<string, string[]>} */
const fallbacks = {}
/** @type {Record<string, string>} */
const defaultDateFormats = {}
/** @type {Record<string, Record<string, string>>} */
const dateFormatsByLang = {}
/** @type {Record<string, string>} */
const digitsByLang = {}

const fallbackRegex = /\$fallback\s*=\s*([^;]+);/
const defaultDateFormatRegex = /\$defaultDateFormat\s*=\s*'([^']+)';/
const dateFormatsRegex = /\$dateFormats\s*=\s*\[([^\]]*)\]/
const dateFormatEntryRegex = /'([^']+)'\s*=>\s*'([^']*)'/g
const digitTransformTableRegex = /\$digitTransformTable\s*=\s*(?:null|\[([^\]]*)\])/
const digitEntryRegex = /'(\d)'\s*=>\s*'([^']+)'/g

readdirSync(messagesDir).forEach((file) => {
	if (!file.startsWith('Messages') || !file.endsWith('.php')) return
	const code = file
		.replace(/^Messages/, '')
		.replace(/_/g, '-')
		.replace(/\.php$/, '')
		.toLowerCase()

	const content = readFileSync(path.join(messagesDir, file), 'utf8')
	const match = content.match(fallbackRegex)

	if (match) {
		const matchValue = match[1].trim()
		/** @type {string[]} */
		let value
		if (matchValue.startsWith('[')) {
			// Array fallback: [ 'skr', 'ur' ]
			value = matchValue
				.replace(/\[|\]|'|\s/g, '')
				.split(',')
				.filter(Boolean)
		} else if (matchValue.startsWith("'")) {
			// Single fallback: 'ru', or quoted comma-separated: 'zh-hans, zh-cn, zh'
			const unquoted = matchValue.replace(/'/g, '')
			value = unquoted.includes(',')
				? unquoted
						.split(',')
						.map((s) => s.trim())
						.filter(Boolean)
				: [unquoted]
		} else if (matchValue.includes(',')) {
			// Array: '["skr", "ur", "en"]'
			value = matchValue
				.replace(/'/g, '')
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean)
		} else {
			value = []
		}
		fallbacks[code] = value
	} else {
		fallbacks[code] = []
	}

	const defaultDateFormat = content.match(defaultDateFormatRegex)?.[1]
	if (defaultDateFormat) {
		defaultDateFormats[code] = defaultDateFormat
	}
	const dateFormatsMatch = content.match(dateFormatsRegex)
	if (dateFormatsMatch) {
		dateFormatsByLang[code] = Object.fromEntries(
			[...dateFormatsMatch[1].matchAll(dateFormatEntryRegex)].map(([, key, value]) => [key, value]),
		)
	}
	const digitTransformTableMatch = content.match(digitTransformTableRegex)
	if (digitTransformTableMatch) {
		// An empty, null, or identity table (English and languages opting out of their fallback's
		// digits) is kept as an empty string to stop the fallback chain.
		const tableDigits = [...(digitTransformTableMatch[1] ?? '').matchAll(digitEntryRegex)]
			.sort((a, b) => Number(a[1]) - Number(b[1]))
			.map((entry) => entry[2])
			.join('')
		digitsByLang[code] = tableDigits === '0123456789' ? '' : tableDigits
	}
})

writeFileSync(
	path.join(__dirname, '../data/language-fallbacks.json'),
	JSON.stringify(fallbacks, null, '\t') + '\n',
	'utf8',
)
console.log('language-fallbacks.json generated in data directory!')

// Mirrors LocalisationCache (`defaultDateFormat` and `dateFormats` items are inherited along the
// fallback chain, which ends with English) and Language::getDateFormatString() for the "default"
// date preference. WMF wikis have $wgAmericanDates = false, hence "dmy or mdy" → "dmy".
/** @type {Record<string, string>} */
const dateFormats = {}
Object.keys(fallbacks)
	.sort()
	.forEach((code) => {
		const chain = [code, ...fallbacks[code], 'en']
		const defaultDateFormat = defaultDateFormats[
			chain.find((lang) => lang in defaultDateFormats) ?? 'en'
		].replace('dmy or mdy', 'dmy')
		const formatKey = `${defaultDateFormat} both`
		const formatLang = chain.find(
			(lang) => lang in dateFormatsByLang && formatKey in dateFormatsByLang[lang],
		)
		if (!formatLang) {
			console.warn(`No date format found for ${code}.`)

			return
		}
		dateFormats[code] = dateFormatsByLang[formatLang][formatKey]
	})

writeFileSync(
	path.join(__dirname, '../data/date-formats.json'),
	JSON.stringify(dateFormats, null, '\t') + '\n',
	'utf8',
)
console.log('date-formats.json generated in data directory!')

// `digitTransformTable` isn't merged along the fallback chain: the first language defining it wins.
/** @type {Record<string, string>} */
const digits = {}
Object.keys(fallbacks)
	.sort()
	.forEach((code) => {
		const digitsLang = [code, ...fallbacks[code]].find((lang) => lang in digitsByLang)
		if (digitsLang && digitsByLang[digitsLang]) {
			digits[code] = digitsByLang[digitsLang]
		}
	})

writeFileSync(
	path.join(__dirname, '../data/digits.json'),
	JSON.stringify(digits, null, '\t') + '\n',
	'utf8',
)
console.log('digits.json generated in data directory!')

await rm(messagesDir, { recursive: true, force: true })
console.log('Messages directory removed. You may delete messages.tar.gz.')
