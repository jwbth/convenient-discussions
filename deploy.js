import { exec } from 'node:child_process'
import fs from 'node:fs'
import { promisify } from 'node:util'

import chalk from 'chalk'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { Mwn } from 'mwn'
import { sleep } from 'mwn/build/utils.js'
// https://github.com/import-js/eslint-plugin-import/issues/1594
// eslint-disable-next-line import/no-named-as-default
import prompts from 'prompts'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import config from './config.js'
import { getUrl, unique } from './misc/utils.js'

const execAsync = promisify(exec)

const argv = /** @type {YargsNonAwaited} */ (yargs(hideBin(process.argv)).argv)

/*
	node deploy.js --staging
	npm run deploy -- --staging
 */
export const staging = Boolean(argv.staging || process.env.npm_config_staging)

const noI18n = Boolean(argv.noi18n || process.env.npm_config_noi18n)
// eslint-disable-next-line no-one-time-vars/no-one-time-vars
const noConfigs = Boolean(argv.noconfigs || process.env.npm_config_noconfigs)
const i18nOnly = Boolean(argv.i18nonly || process.env.npm_config_i18nonly)
const configsOnly = Boolean(argv.configsonly || process.env.npm_config_configsonly)
const debug = Boolean(argv.debug || process.env.npm_config_debug)
// eslint-disable-next-line no-one-time-vars/no-one-time-vars
const dryRun = Boolean(argv['dry-run'] || process.env.npm_config_dry_run)

/**
 * Print a warning message.
 *
 * @param {string} text
 */
const warning = (text) => {
	console.log(chalk.yellowBright(text))
}

/**
 * Create an error with formatted message.
 *
 * @param {string} text
 * @returns {Error}
 */
const error = (text) => new Error(chalk.red(text))

/**
 * Print a success message.
 *
 * @param {string} text
 */
const success = (text) => {
	console.log(chalk.green(text))
}
const code = chalk.inverse
const keyword = chalk.cyan
// eslint-disable-next-line no-one-time-vars/no-one-time-vars
const important = chalk.greenBright

if (!('main' in config)) {
	throw error(
		`Data related to the main build (in the "main" property) is missing in ${keyword('config.js')}`,
	)
}

if (!('rootPath' in config.main)) {
	throw error(`${keyword('rootPath')} is missing in ${keyword('config.js')}`)
}

const pathPrefix = config.main.rootPath + '/'

const assets =
	'assets' in config.main ? config.main.assets[staging ? 'staging' : 'default'] : undefined
if (!assets || !Array.isArray(assets) || !assets.length) {
	throw error(`File list is not found in ${keyword('config.js')}`)
}

/**
 * @typedef {object} Asset
 * @property {string} server
 * @property {string} [source]
 * @property {string} target
 * @property {string[]} [modules]
 * @property {string} [content]
 */

const configAssets = config.configs.flatMap((wikiConfig) => {
	const wikiConfigForMode = wikiConfig[staging ? 'staging' : 'default']
	if (!wikiConfigForMode) {
		return []
	}

	return /** @type {Asset[]} */ (
		wikiConfigForMode.targets.map((target) => ({
			server: wikiConfig.server,
			source: `convenientDiscussions-config/${wikiConfigForMode.source}`,
			target,
		}))
	).concat(
		wikiConfigForMode.editGadgetsDefinition
			? [
					{
						server: wikiConfig.server,
						modules: wikiConfigForMode.modules,
						target: 'MediaWiki:Gadgets-definition',
					},
				]
			: [],
	)
})

/** @type {string} */
let version
if (process.env.CI) {
	// HTTP proxy to use with the http-proxy-to-socks module, while the SOCKS proxy is created by the
	// `ssh -D [port]` command as part of the SSH tunnel to Toolforge.
	config.proxy = 'http://localhost:8080'

	// eslint-disable-next-line no-one-time-vars/no-one-time-vars
	const eventJson = JSON.parse(
		fs.readFileSync(/** @type {string} */ (process.env.GITHUB_EVENT_PATH), 'utf8'),
	)

	// Will be undefined if the event is workflow_dispatch.
	version = eventJson.release?.tag_name
}

const proxyAgent = config.proxy ? new HttpsProxyAgent(config.proxy) : undefined
const requestOptions = proxyAgent && {
	httpsAgent: proxyAgent,
	httpAgent: proxyAgent,
}
const userAgent =
	'Convenient Discussions deployer/0.0 (https://commons.wikimedia.org/wiki/User:Jack_who_built_the_house/Convenient_Discussions; User:Jack who built the house)'
const clients = {
	[config.main.server]: new Mwn({
		apiUrl: `${config.protocol}://${config.main.server}${config.scriptPath}/api.php`,
		silent: !debug,
		userAgent,
	}),
	...config.configs.reduce((obj, wikiConfig) => {
		const protocol =
			'protocol' in wikiConfig && wikiConfig.protocol ? wikiConfig.protocol : config.protocol
		const scriptPath =
			'scriptPath' in wikiConfig && wikiConfig.scriptPath
				? wikiConfig.scriptPath
				: config.scriptPath
		obj[wikiConfig.server] = new Mwn({
			apiUrl: `${protocol}://${wikiConfig.server}${scriptPath}/api.php`,
			silent: !debug,
			userAgent,
		})
		obj[wikiConfig.server].setRequestOptions(requestOptions || {})

		return obj
	}, /** @type {{ [x: string]: Mwn }} */ ({})),
}
clients[config.main.server].setRequestOptions(requestOptions || {})

/**
 * @typedef {{
 *   hash: string;
 *   subject: string;
 *   tag?: string;
 * }} Commit
 */

/**
 * @typedef {{
 *   server: string;
 *   title: string;
 *   url: string;
 *   content: string;
 *   contentSnippet: string;
 *   summary: string;
 * }} Edit
 */

/**
 * @typedef {object} Credentials
 * @property {string} username
 * @property {string} password
 */

try {
	await main()
} catch (err) {
	if (err instanceof Error) {
		console.error(err.message)
	} else {
		console.error(err)
	}
	throw err
}

/**
 * Main deployment function.
 */
async function main() {
	let branch = ''
	let commits = /** @type {Commit[]} */ ([])
	let newCommitsCount = 0
	let newCommitsSubjects = /** @type {string[]} */ ([])

	if (!configsOnly) {
		const { stdout, stderr } = await execAsync(
			'git rev-parse --abbrev-ref HEAD && git log -n 1000 --pretty=format:"%h%n%s%nrefs: %D%n" --abbrev=8',
		)

		if (stdout === '') {
			throw error('This does not look like a git repo')
		}

		if (stderr) {
			throw error(stderr)
		}

		;({ branch, commits } = parseGitOutput(stdout))
		;({ newCommitsCount, newCommitsSubjects } = await getLastDeployedCommit(commits))
	}

	const edits = getMainEdits(branch, commits, newCommitsCount, newCommitsSubjects).concat(
		await getConfigsEdits(),
	)

	const overview = edits.map(createEditOverview).join('\n')
	console.log(`Gonna make these edits:\n\n${overview}`)

	if (dryRun) return

	if (!process.env.CI) {
		const { confirm } = await prompts({
			type: 'confirm',
			name: 'confirm',
			message: 'Proceed?',
		})

		if (!confirm) return
	}

	const credentials = await getCredentials()
	const servers = edits.map((edit) => edit.server).filter(unique)

	for (const server of servers) {
		await logIn(server, credentials)
		await deployToServer(edits.filter((edit) => edit.server === server))
	}

	success('The files have been successfully deployed')
}

/**
 * Parse git output to get branch and commits.
 *
 * @param {string} stdout Git command output
 * @returns {{ branch: string; commits: Commit[] }}
 */
function parseGitOutput(stdout) {
	const branch = stdout.slice(0, stdout.indexOf('\n'))
	const commitsText = stdout.slice(stdout.indexOf('\n') + 1)
	const commits = commitsText.split('\n\n').map((line) => {
		const match = line.match(/^(.+)\n(.+)\n(.+)/)
		if (!match) {
			throw error(`Can't parse the output of a command`)
		}
		const [, hash, subject, refs] = match

		return {
			hash,
			subject,
			tag: (/tag: ([^,]+)/.exec(refs) || [])[1],
		}
	})

	return { branch, commits }
}

/**
 * Get the last deployed commit from revision history.
 *
 * @param {Commit[]} commits List of commits from git log
 * @returns {Promise<{ newCommitsCount: number; newCommitsSubjects: string[] }>}
 */
async function getLastDeployedCommit(commits) {
	if (!assets) {
		return { newCommitsCount: 0, newCommitsSubjects: [] }
	}

	const response = await clients[config.main.server].request({
		action: 'query',
		titles: pathPrefix + assets[0],
		prop: 'revisions',
		rvprop: ['comment'],
		rvlimit: 50,
		formatversion: 2,
	})

	if (!response.query) {
		console.log("Couldn't load the revisions data")

		return { newCommitsCount: 0, newCommitsSubjects: [] }
	}

	const revisions = response.query.pages[0].revisions || []
	if (!revisions.length && !response.query.pages[0].missing) {
		console.log("Couldn't load the revisions data")

		return { newCommitsCount: 0, newCommitsSubjects: [] }
	}

	const lastDeployedCommitOrVersion = revisions
		.map((/** @type {{ comment: string }} */ revision) => {
			const match =
				/[uU]pdate to (?:([0-9a-f]{8})(?= @ )|(v\d+\.\d+\.\d+)\b)/.exec(revision.comment) || []

			return match[1] || match[2]
		})
		.find(Boolean)

	if (!lastDeployedCommitOrVersion) {
		return { newCommitsCount: 0, newCommitsSubjects: [] }
	}

	let newCommitsCount = commits.findIndex(
		(commit) =>
			commit.hash === lastDeployedCommitOrVersion || commit.tag === lastDeployedCommitOrVersion,
	)
	if (newCommitsCount === -1) {
		newCommitsCount = 0
	}

	const newCommitsSubjects = commits
		.slice(0, newCommitsCount)
		.map((commit) => commit.subject)
		.filter(
			(commit) =>
				!/^(Merge branch|Merge pull request|Localisation updates|Bump |(revert: )?(deploy|ci|build|configs?|tests?|jsdoc|chore|docs|i18n|style|refactor)[(:])/.test(
					commit,
				),
		)

	return { newCommitsCount: newCommitsSubjects.length, newCommitsSubjects }
}

/**
 * Keep only the first 300 characters of content.
 *
 * @param {string} content Content to truncate
 * @param {number} [n] Maximum length (default: 300)
 * @returns {string}
 */
function cutContent(content, n = 300) {
	return content.slice(0, n) + (content.length > n ? '...' : '')
}

/**
 * Get edits for main files.
 *
 * @param {string} branch Current git branch name
 * @param {Commit[]} commits List of commits
 * @param {number} newCommitsCount Number of new commits since last deploy
 * @param {string[]} newCommitsSubjects Subjects of new commits
 * @returns {Edit[]}
 */
function getMainEdits(branch, commits, newCommitsCount, newCommitsSubjects) {
	if (configsOnly || !assets) {
		return []
	}

	return assets
		.flatMap((file) => {
			if ((noI18n && file.endsWith('i18n/')) || (i18nOnly && !file.endsWith('i18n/'))) {
				return []
			}

			if (file.endsWith('/')) {
				return fs.readdirSync(`./dist/${file}`).map((fileInDir) => file + fileInDir)
			}

			return file
		})
		.map((file, i) => {
			/** @type {string} */
			let content
			try {
				content = fs.readFileSync(`./dist/${file}`, 'utf8')
			} catch {
				throw error(`Asset is not found: ${keyword(file)}`)
			}

			if (!file.includes('i18n/')) {
				const [tildesMatch] = content.match(/~~~~.{0,100}/) || []
				const [substMatch] = content.match(/\{\{(safe)?subst:.{0,100}/) || []
				const [nowikiMatch] =
					content
						// Ignore the "// </nowiki>" piece, added from the both sides of the build.
						.replace(/\/(?:\*!?|\/) <\/nowiki>/g, '')
						.match(/<\/nowiki>.{0,100}/) || []
				if (tildesMatch || substMatch) {
					const snippet = code(tildesMatch || substMatch)
					if (nowikiMatch) {
						throw error(
							`${keyword(file)} contains illegal strings (tilde sequences or template substitutions) that may break the code when saving to the wiki:\n${snippet}\nWe also can't use "${code('// <nowiki>')}" in the beginning of the file, because there are "${code('</nowiki')}" strings in the code that would limit the scope of the nowiki tag.\n`,
						)
					} else {
						warning(
							`Note that ${keyword(file)} contains illegal strings (tilde sequences or template substitutions) that may break the code when saving to the wiki:\n${snippet}\n\nThese strings will be neutralized by using "${code('// <nowiki>')}" in the beginning of the file this time though.\n`,
						)
					}
				}
				if (nowikiMatch) {
					warning(
						`Note that ${keyword(file)} contains the "${code('</nowiki')}" string that will limit the scope of the nowiki tag that we put in the beginning of the file:\n${code(nowikiMatch)}\n`,
					)
				}
			}

			/**
			 * @param {number} count
			 * @param {string} word
			 * @returns {string}
			 */
			const pluralize = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`

			const commitString = `${commits[0].hash} @ ${branch}`
			let summary = process.env.CI
				? `Automatically update to ${version || commitString}`
				: `Update to ${commitString}`
			if (i === 0 && newCommitsCount) {
				summary += `. ${pluralize(newCommitsCount, 'commit')}: ${newCommitsSubjects.join('. ')}`
			}

			return {
				server: config.main.server,
				title: pathPrefix + file,
				url: getUrl(config.main.server, pathPrefix + file),
				content,
				contentSnippet: cutContent(content),
				summary,
			}
		})
}

/**
 * Get edits for config files.
 *
 * @returns {Promise<Edit[]>}
 */
async function getConfigsEdits() {
	if (noConfigs || i18nOnly) {
		return []
	}

	const assetsWithGadgetsDefinition = configAssets.filter(
		(asset) => asset.target === 'MediaWiki:Gadgets-definition',
	)

	const contentStrings = await Promise.all(
		assetsWithGadgetsDefinition.map(async (asset) => {
			const response = await clients[asset.server].read(asset.target)

			return response.revisions?.[0]?.content || ''
		}),
	)

	contentStrings.forEach((content, i) => {
		const asset = assetsWithGadgetsDefinition[i]
		const modulesString = /** @type {string[]} */ (asset.modules).join(', ')

		// Make sure we don't break anything in MediaWiki:Gadgets-definition.
		const illegalMatch = modulesString.match(/[^a-z0-9., -]/gi)
		if (illegalMatch) {
			const matchesString = illegalMatch.map((char) => code(char)).join(' ')
			throw error(
				`Modules string for ${keyword(asset.target)} contains illegal characters: ${matchesString}`,
			)
		}

		asset.content = content.replace(
			/^(\* *convenientDiscussions *\[.*dependencies *= *)[^|\]]*?( *[|\]])/m,
			/** @type {ReplaceCallback<3>} */
			(_s, before, after) => before + modulesString + after,
		)
	})

	return configAssets.map((asset) => {
		const source = asset.source || ''
		const content = asset.content || fs.readFileSync(`./dist/${source}`, 'utf8')

		return {
			server: asset.server,
			title: asset.target,
			url: getUrl(asset.server, asset.target),
			content,
			contentSnippet: cutContent(content),
			summary:
				asset.target === 'MediaWiki:Gadgets-definition'
					? 'Automatically update Convenient Discussions dependencies'
					: 'Automatically update',
		}
	})
}

/**
 * Create an overview string for an edit.
 *
 * @param {Edit} edit
 * @returns {string}
 */
function createEditOverview(edit) {
	const byteLength = (/** @type {string} */ text) => new TextEncoder().encode(text).length

	return (
		`${keyword('URL:')} ${edit.url}\n` +
		`${keyword('Edit summary:')} ${edit.summary}\n` +
		`${keyword(`Content (${important(byteLength(edit.content).toLocaleString() + ' bytes')}):`)} ${code(edit.contentSnippet)}\n`
	)
}

/**
 * Get credentials for login.
 *
 * @returns {Promise<Credentials>}
 */
async function getCredentials() {
	if (process.env.CI) {
		return {
			username: /** @type {string} */ (process.env.USERNAME),
			password: /** @type {string} */ (process.env.PASSWORD),
		}
	}

	let credentials = fs.existsSync('./credentials.json')
		? // @ts-ignore
			// eslint-disable-next-line import/no-unresolved
			await import('./credentials.json', { with: { type: 'json' } }).then((m) => m.default)
		: undefined

	if (credentials?.username && credentials.password) {
		return credentials
	}

	console.log(`User name and/or password were not found in ${keyword('credentials.json')}`)
	credentials = await prompts([
		{
			type: 'text',
			name: 'username',
			message: 'Wikimedia user name',
			validate: Boolean,
		},
		{
			type: 'invisible',
			name: 'password',
			message: 'Password',
			validate: Boolean,
		},
	])

	// Ctrl+C leaves the password unspecified.
	if (!credentials.password) {
		throw error('Password is required')
	}

	return credentials
}

/**
 * Login to a server.
 *
 * @param {string} server Server hostname
 * @param {Credentials} credentials Login credentials
 */
async function logIn(server, credentials) {
	await clients[server].login(credentials)
}

/**
 * Make edits for a specific server.
 *
 * @param {Edit[]} serverEdits Edits to make on the server
 */
async function deployToServer(serverEdits) {
	for (const edit of serverEdits) {
		const response = await clients[edit.server].save(edit.title, edit.content, edit.summary)

		// To avoid hitting the edit rate limit
		await sleep(2500)

		if (response.nochange) {
			success(`No changes in ${edit.url}`)
		} else {
			success(
				`Successfully edited ${edit.url} (edit timestamp: ${new Date(response.newtimestamp).toUTCString()})`,
			)
		}
	}
}
