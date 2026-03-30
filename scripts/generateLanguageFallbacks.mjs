import {
	readdirSync,
	readFileSync,
	existsSync,
	mkdirSync,
	writeFileSync,
} from 'node:fs'
import path from 'node:path'

const messagesDir = path.join(__dirname, 'messages') // https://gerrit.wikimedia.org/r/plugins/gitiles/mediawiki/core/+/HEAD/languages/messages
const outputFile = path.join(__dirname, 'data/languageFallbacks.mediawiki.json')
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
		let value = match[1].trim()
		if (value.startsWith('[')) {
			// Array fallback: [ 'skr', 'ur' ]
			value = value
				.replace(/\[|\]|'|\s/g, '')
				.split(',')
				.filter(Boolean)
		} else if (value.startsWith("'")) {
			// Single fallback: 'ru'
			value = [value.replace(/'/g, '')]
		} else if (value.includes(',')) {
			// Comma-separated string: 'skr, ur, en'. NEEDTOFIX: forgot quotes
			value = value
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
