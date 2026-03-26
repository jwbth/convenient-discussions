/**
 * Web worker entry point.
 *
 * Note that currently there may be difficulties in testing the web worker in the "single" mode with
 * custom config functions such as {@link module:defaultConfig.rejectNode} due to the (unfortunate)
 * use of `eval()` here and the fact that webpack renames some objects in some contexts resulting in
 * a lost tie between them.
 *
 * @module worker
 */

// This line allows references to MediaWiki types (the `mw` object; e.g. cd.g.isIPv6Address) to work
// in the worker context.
/// <reference types="types-mediawiki" />

// Import polyfills for a bunch of ES2022+ features
import '../shared/polyfills'

import './extendDomhandler'

import { isComment, isText } from 'domhandler'
import { parseDocument } from 'htmlparser2'

import { Debug } from '../loader/convenientDiscussions.debug'
import CdError from '../shared/CdError'
import CommentSkeleton from '../shared/CommentSkeleton'
import Parser from '../shared/Parser'

import CommentWorker from './CommentWorker'
import SectionWorker from './SectionWorker'
import cd from './cd'

let isFirstRun = true
/** @type {number | undefined} */
let alarmTimeout
/** @type {import('domhandler').Element | undefined} */
let rootElement

cd.debug = new Debug()
cd.debug.init()

/**
 * Send a "wake up" message to the window after the specified interval.
 *
 * @param {number} interval
 * @private
 */
function setAlarm(interval) {
	clearTimeout(alarmTimeout)
	alarmTimeout = setTimeout(() => {
		postMessage(/** @type {Message} */ ({ task: 'wakeUp' }))
	}, interval)
}

/**
 * Get all text nodes under the root element.
 *
 * @returns {import('domhandler').Text[]}
 * @private
 */
function getAllTextNodes() {
	const nodes = /** @type {import('domhandler').Text[]} */ ([])
	const rootElementTyped = /** @type {import('domhandler').Element} */ (rootElement)
	rootElementTyped.traverseSubtree((/** @type {import('domhandler').Node} */ node) => {
		if (isText(node)) {
			nodes.push(node)
		}

		// Remove DT reply button html comments as well to optimize.
		if (isComment(node) && node.data.startsWith('__DTREPLYBUTTONS__')) {
			node.remove()
		}

		return false
	})

	return nodes
}

/**
 * Remove all html comments added by DiscussionTools related to reply buttons.
 *
 * @private
 */
function removeDtButtonHtmlComments() {
	// See getAllTextNodes()
}

/**
 * Find comment signatures and section headings on the page.
 *
 * @param {Parser<import('domhandler').Node>} parser
 * @returns {import('../shared/Parser').Target<import('domhandler').Node>[]}
 * @private
 */
function findTargets(parser) {
	parser.init()
	parser.processAndRemoveDtMarkup()

	return /** @type {import('../shared/Parser').Target<import('domhandler').Node>[]} */ (
		parser.findHeadings()
	)
		.concat(parser.findSignatures())
		.sort((t1, t2) => (parser.context.follows(t1.element, t2.element) ? 1 : -1))
}

/**
 * Parse the comments and modify the related parts of the DOM.
 *
 * @param {Parser<import('domhandler').Node>} parser
 * @param {import('../shared/Parser').Target<import('domhandler').Node>[]} targets
 * @private
 */
function processComments(parser, targets) {
	targets
		.filter((target) => target.type === 'signature')
		.forEach((signature) => {
			try {
				cd.comments.push(parser.createComment(signature, targets, undefined))
			} catch (error) {
				if (!(error instanceof CdError)) {
					console.error(error)
				}
			}
		})
}

/**
 * Parse the sections and modify some parts of them.
 *
 * @param {Parser<import('domhandler').Node>} parser
 * @param {import('../shared/Parser').Target<import('domhandler').Node>[]} targets
 * @private
 */
function processSections(parser, targets) {
	targets
		.filter((target) => target.type === 'heading')
		.forEach((heading) => {
			try {
				cd.sections.push(parser.createSection(heading, targets, undefined))
			} catch (error) {
				if (!(error instanceof CdError)) {
					console.error(error)
				}
			}
		})
}

/**
 * Keep only those keys on an object whose names are not in the unsafe keys list.
 *
 * @param {AnyByKey} obj
 * @param {string[]} unsafeKeys
 * @private
 */
export function keepSafeKeys(obj, unsafeKeys) {
	// Use the same object, as creating a copy would kill the prototype.
	Object.keys(obj).forEach((key) => {
		if (unsafeKeys.includes(key)) {
			delete obj[key]
		}
	})
}

/**
 * Prepare comments and sections for transferring to the main process. Remove unnecessary content
 * and properties, hide dynamic content, add properties.
 *
 * @param {Parser<import('domhandler').Node>} parser
 * @private
 */
function prepareCommentsAndSections(parser) {
	CommentSkeleton.processOutdents(parser)
	CommentWorker.tweakComments(cd.comments)
	SectionWorker.tweakSections(cd.sections)
}

/**
 * Parse the page and send a message to the window.
 *
 * @private
 */
function parse() {
	cd.comments = []
	cd.sections = []

	Parser.init()
	/** @type {boolean | undefined} */
	let areThereOutdents
	const parser = new Parser({
		CommentClass: CommentWorker,
		SectionClass: SectionWorker,
		childElementsProp: 'childElements',
		/** @type {(el1: import('domhandler').Node, el2: import('domhandler').Node) => boolean} */
		follows: (el1, el2) => el1.follows(el2),
		getAllTextNodes,
		getElementByClassName: (el, className) =>
			/** @type {import('domhandler').Element} */ (el).getElementsByClassName(className, 1)[0] ||
			null,
		// eslint-disable-next-line object-shorthand
		rootElement: /** @type {NonNullable<typeof rootElement>} */ (rootElement),
		document,
		areThereOutdents: () => {
			if (areThereOutdents === undefined) {
				areThereOutdents = Boolean(
					/** @type {NonNullable<typeof rootElement>} */ (rootElement).getElementsByClassName(
						cd.config.outdentClass,
						1,
					).length,
				)
			}

			return areThereOutdents
		},
		/** @type {(elements: import('domhandler').Element[]) => void} */
		processAndRemoveDtElements: (elements) => {
			elements.forEach((el) => {
				el.remove()
			})
		},
		removeDtButtonHtmlComments,
	})

	const targets = findTargets(parser)

	cd.debug.startTimer('worker: process comments')
	processComments(parser, targets)
	cd.debug.stopTimer('worker: process comments')

	cd.debug.startTimer('worker: process sections')
	processSections(parser, targets)
	cd.debug.stopTimer('worker: process sections')

	cd.debug.startTimer('worker: prepare comments and sections')
	prepareCommentsAndSections(parser)
	cd.debug.stopTimer('worker: prepare comments and sections')
}

/**
 * Restore function from its code.
 *
 * @param {string | undefined} code
 * @returns {(() => any) | undefined}
 * @private
 */
function restoreFunc(code) {
	if (!code) {
		return
	}

	if (code) {
		if (!/^ *function\b/.test(code) && !/^.+=>/.test(code)) {
			code = `function ${code}`
		}
		if (/^ *function\b/.test(code)) {
			code = `(${code})`
		}
	}

	// FIXME: Any idea how to avoid using eval() here?
	return eval(code)
}

/**
 * Callback for messages from the window.
 *
 * @param {MessageEvent<MessageFromWindow>} event
 * @private
 */
function onMessageFromWindow(event) {
	const message = event.data

	if (isFirstRun) {
		console.debug(
			"Convenient Discussions' web worker has been successfully loaded. Click the link with the file name and line number to open the source code in your debug tool.",
		)
		isFirstRun = false
	}

	if (message.task === 'setAlarm') {
		setAlarm(message.interval)
	}

	if (message.task === 'removeAlarm') {
		clearTimeout(alarmTimeout)
	}

	if (message.task === 'parse') {
		const timerLabel = `worker: processing revision ${message.revisionId}`
		cd.debug.startTimer(timerLabel)

		cd.g = message.g
		cd.config = message.config

		// Restore functions that were stringified for transfer. We have to do this dance with testing
		// because of the issues with using `eval()` in the worker and Rollup renaming objects in some
		// contexts, which causes the function to lose its tie to the original function and thus not
		// work when called in the worker.
		cd.config.rejectNode = /** @type {(typeof cd)['config']['rejectNode']} */ (
			restoreFunc(cd.config.rejectNode?.toString())
		)
		cd.g.isIPv6Address = /** @type {(typeof mw)['util']['isIPv6Address']} */ (
			restoreFunc(cd.g.isIPv6Address?.toString())
		)
		cd.g.makeIsTemporaryUser = /** @type {(typeof cd)['g']['makeIsTemporaryUser']} */ (
			restoreFunc(cd.g.makeIsTemporaryUser.toString())
		)
		cd.g.isTemporaryUser = cd.g.makeIsTemporaryUser(cd.g.mwUtilsConfig)

		self.document = parseDocument(message.text, {
			withStartIndices: true,
			withEndIndices: true,
			decodeEntities: false,
		})
		rootElement = /** @type {import('domhandler').Element} */ (document.childNodes[0])

		parse()

		postMessage(
			/** @type {MessageFromWorkerParse} */ ({
				task: message.task,
				revisionId: message.revisionId,
				resolverId: message.resolverId,
				comments: cd.comments,
				sections: cd.sections,
			}),
		)

		cd.debug.stopTimer(timerLabel)
		cd.debug.logAndResetEverything()
	}
}

self.addEventListener('message', onMessageFromWindow)

/**
 * Dummy class for an export.
 */
class WebpackWorker extends Worker {
	/**
	 * Dummy constructor.
	 */
	constructor() {
		super('')
	}
}

export default WebpackWorker
