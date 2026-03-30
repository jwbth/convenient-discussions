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

	// Skip if messages directory already exists
	if (existsSync(messagesDir)) {
		console.log('Messages directory already exists, skipping download.')

		return
	}

	console.log('Downloading language messages from Wikimedia...')

	const url =
		'https://gerrit.wikimedia.org/r/plugins/gitiles/mediawiki/core/+archive/HEAD/languages/messages.tar.gz'
	const tempFile = path.join(__dirname, 'languages.tar.gz')

	// Download the file
	await new Promise((resolve, reject) => {
		const options = {
			headers: {
				'User-Agent':
					'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
			},
		}

		https
			.get(url, options, (response) => {
				const statusCode = response.statusCode ?? 0
				if (statusCode !== 200) {
					reject(new Error(`Failed to download: ${statusCode}`))

					return
				}

				pipeline(response, createWriteStream(tempFile))
					.then(resolve)
					.catch(reject)
			})
			.on('error', reject)
	})

	console.log('Extracting messages...')

	// Create messages directory
	if (!existsSync(messagesDir)) {
		mkdirSync(messagesDir, { recursive: true })
	}

	// Extract directly to messages directory
	await extract({
		file: tempFile,
		cwd: messagesDir,
	})

	// Clean up temp file
	await unlink(tempFile)

	console.log('Messages extracted successfully!')
}

await downloadAndExtractMessages()

// https://gerrit.wikimedia.org/r/plugins/gitiles/mediawiki/core/+/HEAD/languages/messages → tgz
const messagesDir = path.join(__dirname, 'messages')
const outputFile = path.join(__dirname, 'data/languageFallbacks.mediawiki.json')
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
			// Single fallback: 'ru'
			value = [matchValue.replace(/'/g, '')]
		} else if (matchValue.includes(',')) {
			// Comma-separated string: 'skr, ur, en'. NEEDTOFIX: forgot quotes
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
console.log('languageFallbacks.mediawiki.json generated!')
