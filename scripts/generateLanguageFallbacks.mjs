import {
	readdirSync,
	readFileSync,
	existsSync,
	mkdirSync,
	writeFileSync,
	createWriteStream,
} from 'node:fs'
import { unlink } from 'node:fs/promises'
import https from 'node:https'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'

import { extract } from 'tar'

const __dirname = new URL('.', import.meta.url).pathname.replace(
	/^\/([A-Z]:)/,
	'$1',
)

/**
 * Download and extract language messages from Wikimedia.
 */
async function downloadAndExtractMessages() {
	const messagesDir = path.join(__dirname, 'messages')

	const url =
		'https://gerrit.wikimedia.org/r/plugins/gitiles/mediawiki/core/+archive/HEAD/languages/messages.tar.gz'
	const tempFile = path.join(__dirname, 'languages.tar.gz')

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
						reject(new Error(`Failed to download: ${statusCode}${retryMsg}`))

						return
					}

					pipeline(response, createWriteStream(tempFile))
						.then(resolve)
						.catch(reject)
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

	console.log('Messages extracted successfully!')
}

await downloadAndExtractMessages()

// https://gerrit.wikimedia.org/r/plugins/gitiles/mediawiki/core/+/HEAD/languages/messages → tgz
const messagesDir = path.join(__dirname, 'messages')
const outputFile = path.join(__dirname, '../data/languageFallbacks.json')
/** @type {Record<string, string[]>} */
const output = {}

const fallbackRegex = /\$fallback\s*=\s*([^;]+);/

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
		output[code] = value
	} else {
		output[code] = []
	}
})

if (!existsSync(path.join(__dirname, 'data'))) {
	mkdirSync(path.join(__dirname, 'data'))
}

writeFileSync(outputFile, JSON.stringify(output, null, 2), 'utf8')
console.log('languageFallbacks.json generated!')
