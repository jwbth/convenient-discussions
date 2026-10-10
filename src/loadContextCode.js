import cd from './loader/cd'
import CdError from './shared/CdError'

/**
 * @template S
 * @typedef {object} LoadContextCodeResult
 * @property {S | undefined} source The located source. `undefined` when DiscussionTools reports the
 *   comment on this page but it can't be located.
 * @property {boolean} isInSectionContext Whether the context code is section code.
 * @property {boolean} needsDtApi Whether the comment can be replied to only through the
 *   DiscussionTools API.
 */

/**
 * Whether an error means the target isn't where the context code was expected to have it, so a
 * wider context should be tried.
 *
 * @param {unknown} error
 * @returns {boolean}
 */
function isNotFoundError(error) {
	return (
		error instanceof CdError &&
		['noSuchSection', 'locateSection', 'locateComment'].includes(error.getCode() || '')
	)
}

/**
 * Load the context code of a comment or section and locate it there: in the section code when the
 * section has a live section number, else (or when the section code doesn't have the target) in
 * the source page's code, else, when `locateUsingDt` is passed, where DiscussionTools says the
 * target is.
 *
 * @template S
 * @param {object} options
 * @param {Pick<import('./Section').default, 'liveSectionNumber' | 'requestCode'>} [options.section]
 *   Section whose code to try first.
 * @param {Pick<import('./Page').default, 'loadCode'>} options.sourcePage
 * @param {(sectionCode?: string) => S} options.locate Locate the target in the section code or,
 *   without it, in the loaded code of the source page.
 * @param {() => Promise<S | undefined>} [options.locateUsingDt] DiscussionTools fallback.
 * @returns {Promise<LoadContextCodeResult<S>>}
 * @throws {CdError|Error}
 */
export default async function loadContextCode({ section, sourcePage, locate, locateUsingDt }) {
	try {
		if (section?.liveSectionNumber !== undefined) {
			try {
				return {
					source: locate(await section.requestCode()),
					isInSectionContext: true,
					needsDtApi: false,
				}
			} catch (error) {
				// Likely an outdated section number: widen the search to the page code.
				if (!isNotFoundError(error)) {
					throw error
				}
			}
		}

		try {
			await sourcePage.loadCode()

			return { source: locate(), isInSectionContext: false, needsDtApi: false }
		} catch (error) {
			if (!locateUsingDt || !isNotFoundError(error)) {
				throw error
			}

			const source = await locateUsingDt()

			return { source, isInSectionContext: false, needsDtApi: !source }
		}
	} catch (error) {
		if (error instanceof CdError) {
			error.setMessage(cd.sParse('cf-error-getpagecode'))
		}
		throw error
	}
}
