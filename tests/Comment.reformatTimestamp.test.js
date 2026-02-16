import { enUS } from 'date-fns/locale'
import { vi, test, expect } from 'vitest'

import * as mock_i18n_en_json from '../i18n/en.json'
import * as mock_src_Comment from '../src/Comment'
import * as mock_src_commentManager from '../src/commentManager'
import * as mock_src_settings from '../src/settings'
import * as mock_src_shared_cd from '../src/shared/cd'
import { formatDateNative, initDayjs } from '../src/utils-date.js'
// TODO: use some interfaces for mocks and real objects alike?

// eslint-disable-next-line no-one-time-vars/no-one-time-vars
const en = mock_i18n_en_json.default
const Comment = mock_src_Comment.default
const commentManager = mock_src_commentManager.default
const settings = mock_src_settings.default

const cd = mock_src_shared_cd.default
cd.i18n.en.dateFnsLocale = enUS

mw.msg = (/** @type {string} */ name) => mw.messages.values[name] || en[name] || name
mw.config.set('wgContentLanguage', 'en')
mw.config.set('wgUserLanguage', 'en')
mw.messages.set({
	january: 'January',
	february: 'February',
	march: 'March',
	april: 'April',
	may_long: 'May',
	june: 'June',
	july: 'July',
	august: 'August',
	september: 'September',
	october: 'October',
	november: 'November',
	december: 'December',
})

Object.assign(cd.config, {
	defaultInsertButtons: [],
	defaultSignaturePrefix: ' ',
})
Object.assign(cd.g, {
	settingsOptionName: 'userjs-convenientDiscussions-settings',
	phpCharToUpper: {},
	userLanguage: 'en',
	uiDateFormat: 'H:i, j F Y',
	msInMin: 1000 * 60,
	timestampTools: {
		content: {
			dateFormat: 'H:i, j F Y',
			timezone: 'UTC',
		},
		user: {
			dateFormat: 'H:i, j F Y',
			timezone: 'UTC',
		},
	},
})
cd.mws = (/** @type {string} */ name) =>
	({
		'timezone-utc': 'UTC',
	})[name]
cd.i18n = { en: { ...en, dateFnsLocale: enUS } }
cd.s = (/** @type {string} */ name) => cd.i18n.en[name]
settings.save = async () => {}
cd.settings = settings

/** @type {{ [key: string]: { [key: string]: string } }} */
const messages = {
	en: {
		april: 'April',
		august: 'August',
		december: 'December',
		february: 'February',
		january: 'January',
		july: 'July',
		june: 'June',
		march: 'March',
		may_long: 'May',
		november: 'November',
		october: 'October',
		september: 'September',
	},
	de: {
		may_long: 'Mai',
	},
}

settings.init()

/**
 * Pad a string with spaces.
 *
 * @param {string} text
 * @param {number} length
 * @returns {string}
 */
function spacePad(text, length) {
	return text + ' '.repeat(Math.max(0, length - text.length))
}

/**
 * @typedef {`${number}-${number}-${number}T${number}:${number}:${number}.${number}Z`} Timestamp
 */

/**
 * Test {@link Comment#reformatTimestamp} with the values and settings provided.
 *
 * @param {object} params
 * @param {Timestamp} params.timestamp
 * @param {'default' | 'improved' | 'relative'} params.timestampFormat
 * @param {string|number} params.timezone
 * @param {boolean} params.useUiTime
 * @param {boolean} params.hideTimezone
 * @param {Timestamp} [params.nowTimestamp]
 * @param {string} [params.contentLanguage]
 * @param {object} params.expected
 * @param {string | undefined} params.expected.reformattedTimestamp
 * @param {string | undefined} params.expected.timestampTitle
 */
function testWithSettings({
	timestamp: date,
	timestampFormat,
	timezone,
	useUiTime,
	hideTimezone,
	nowTimestamp,
	contentLanguage,
	expected: { reformattedTimestamp, timestampTitle },
}) {
	// eslint-disable-next-line no-one-time-vars/no-one-time-vars
	const conditions =
		`${timestampFormat}, ${timezone}` +
		(useUiTime ? ', UI time' : '') +
		(hideTimezone ? ', hide timezone' : '')

	test(
		spacePad(conditions, 60) +
			' ' +
			(reformattedTimestamp ? `"${reformattedTimestamp}"` : String(reformattedTimestamp)),
		() => {
			/** @type {{ [x: string]: any }} */
			const comment = {
				timestampElement: document.createElement('span'),
				extraSignatures: [],
				timestampFormat,
				useUiTime,
				hideTimezone,
			}

			const adaptedReformatTimestamp = (/** @type {Timestamp} */ d) => {
				comment.date = new Date(d)
				comment.manager = commentManager
				comment.formatTimestamp = Comment.prototype.formatTimestamp.bind(comment)
				comment.updateTimestampElements = Comment.prototype.updateTimestampElements.bind(comment)
				comment.updateMainTimestampElement =
					Comment.prototype.updateMainTimestampElement.bind(comment)
				comment.updateExtraSignatureTimestamps =
					Comment.prototype.updateExtraSignatureTimestamps.bind(comment)
				Comment.prototype.reformatTimestamp.call(comment)

				return {
					reformattedTimestamp: comment.reformattedTimestamp,
					timestampTitle: comment.timestampTitle,
				}
			}

			const dateObj = new Date(date)
			cd.g.timestampTools.user.timezone = timezone || 'UTC'
			settings.set('timestampFormat', timestampFormat)
			settings.set('useUiTime', useUiTime)
			settings.set('hideTimezone', hideTimezone)
			commentManager.timestampsDefault = !(
				(settings.get('useUiTime') && 'UTC' !== cd.g.timestampTools.user.timezone) ||
				settings.get('timestampFormat') !== 'default' ||
				mw.config.get('wgContentLanguage') !== cd.g.userLanguage ||
				settings.get('hideTimezone')
			)

			if (contentLanguage) {
				mw.config.set('wgUserLanguage', contentLanguage)
				mw.messages.set(messages[contentLanguage])
			}
			comment.timestampElement.textContent = formatDateNative(dateObj, true, 'UTC')
			if (contentLanguage) {
				mw.config.set('wgUserLanguage', 'en')
				mw.messages.set(messages.en)
			}

			// eslint-disable-next-line no-one-time-vars/no-one-time-vars
			const originalDate = new Date()
			if (nowTimestamp) {
				vi.useFakeTimers()
				vi.setSystemTime(new Date(nowTimestamp))
			}
			try {
				expect(adaptedReformatTimestamp(date)).toEqual({
					reformattedTimestamp,
					timestampTitle,
				})
			} finally {
				if (nowTimestamp) {
					vi.useRealTimers()
				}
			}
		},
	)
}

initDayjs()

testWithSettings({
	timestamp: '2021-05-28T10:48:47.000Z',
	timestampFormat: 'default',
	timezone: 'Europe/Berlin',
	useUiTime: false,
	hideTimezone: false,
	expected: {
		reformattedTimestamp: undefined,
		timestampTitle: undefined,
	},
})
testWithSettings({
	timestamp: '2021-05-28T10:48:47.000Z',
	timestampFormat: 'default',
	timezone: 'Europe/Berlin',
	useUiTime: false,
	hideTimezone: true,
	expected: {
		reformattedTimestamp: '10:48, 28 May 2021',
		timestampTitle: '10:48, 28 May 2021 (UTC)',
	},
})
testWithSettings({
	timestamp: '2021-05-28T10:48:47.000Z',
	timestampFormat: 'default',
	timezone: 'Europe/Berlin',
	useUiTime: true,
	hideTimezone: false,
	expected: {
		reformattedTimestamp: '12:48, 28 May 2021 (UTC+2)',
		timestampTitle: '10:48, 28 May 2021 (UTC)',
	},
})
testWithSettings({
	timestamp: '2021-05-28T10:48:47.000Z',
	timestampFormat: 'default',
	timezone: 'Europe/Berlin',
	useUiTime: true,
	hideTimezone: true,
	expected: {
		reformattedTimestamp: '12:48, 28 May 2021',
		timestampTitle: '10:48, 28 May 2021 (UTC)',
	},
})

testWithSettings({
	timestamp: '2021-05-28T10:48:47.000Z',
	timestampFormat: 'improved',
	timezone: 'Europe/Berlin',
	useUiTime: false,
	hideTimezone: false,
	nowTimestamp: '2021-05-30T10:48:47.000Z',
	expected: {
		reformattedTimestamp: '28 May, 10:48 AM (UTC)',
		timestampTitle: '10:48, 28 May 2021 (UTC)',
	},
})
testWithSettings({
	timestamp: '2021-05-28T10:48:47.000Z',
	timestampFormat: 'improved',
	timezone: 'Europe/Berlin',
	useUiTime: false,
	hideTimezone: true,
	nowTimestamp: '2021-05-30T10:48:47.000Z',
	expected: {
		reformattedTimestamp: '28 May, 10:48 AM',
		timestampTitle: '10:48, 28 May 2021 (UTC)',
	},
})
testWithSettings({
	timestamp: '2021-05-28T10:48:47.000Z',
	timestampFormat: 'improved',
	timezone: 'Europe/Berlin',
	useUiTime: true,
	hideTimezone: false,
	nowTimestamp: '2021-05-30T10:48:47.000Z',
	expected: {
		reformattedTimestamp: '28 May, 12:48 PM (UTC+2)',
		timestampTitle: '10:48, 28 May 2021 (UTC)',
	},
})
testWithSettings({
	timestamp: '2021-05-28T10:48:47.000Z',
	timestampFormat: 'improved',
	timezone: 'Europe/Berlin',
	useUiTime: true,
	hideTimezone: true,
	nowTimestamp: '2021-05-30T10:48:47.000Z',
	expected: {
		reformattedTimestamp: '28 May, 12:48 PM',
		timestampTitle: '10:48, 28 May 2021 (UTC)',
	},
})
testWithSettings({
	timestamp: '2021-05-28T10:48:47.000Z',
	timestampFormat: 'improved',
	timezone: 'Europe/Berlin',
	useUiTime: true,
	hideTimezone: true,
	nowTimestamp: '2021-05-28T10:48:47.000Z',
	expected: {
		reformattedTimestamp: 'Today, 12:48 PM',
		timestampTitle: '10:48, 28 May 2021 (UTC)',
	},
})
testWithSettings({
	timestamp: '2021-05-28T10:48:47.000Z',
	timestampFormat: 'improved',
	timezone: 'Europe/Berlin',
	useUiTime: true,
	hideTimezone: true,
	nowTimestamp: '2021-05-28T22:48:47.000Z',
	expected: {
		reformattedTimestamp: 'Yesterday, 12:48 PM',
		timestampTitle: '10:48, 28 May 2021 (UTC)',
	},
})
testWithSettings({
	timestamp: '2020-05-28T10:48:47.000Z',
	timestampFormat: 'improved',
	timezone: 'Europe/Berlin',
	useUiTime: false,
	hideTimezone: false,
	expected: {
		reformattedTimestamp: '28 May 2020, 10:48 AM (UTC)',
		timestampTitle: '10:48, 28 May 2020 (UTC)',
	},
})

testWithSettings({
	timestamp: '2021-05-28T10:48:00.000Z',
	timestampFormat: 'relative',
	timezone: 'Europe/Berlin',
	useUiTime: false,
	hideTimezone: false,
	nowTimestamp: '2021-05-28T10:48:47.000Z',
	expected: {
		reformattedTimestamp: 'less than a minute ago',
		timestampTitle: '10:48, 28 May 2021 (UTC)',
	},
})
testWithSettings({
	timestamp: '2021-05-28T10:47:47.000Z',
	timestampFormat: 'relative',
	timezone: 'Europe/Berlin',
	useUiTime: false,
	hideTimezone: false,
	nowTimestamp: '2021-05-28T10:48:47.000Z',
	expected: {
		reformattedTimestamp: '1 minute ago',
		timestampTitle: '10:47, 28 May 2021 (UTC)',
	},
})
testWithSettings({
	timestamp: '2021-05-28T10:46:48.000Z',
	timestampFormat: 'relative',
	timezone: 'Europe/Berlin',
	useUiTime: false,
	hideTimezone: false,
	nowTimestamp: '2021-05-28T10:48:47.000Z',
	expected: {
		reformattedTimestamp: '1 minute ago',
		timestampTitle: '10:46, 28 May 2021 (UTC)',
	},
})
testWithSettings({
	timestamp: '2021-05-28T09:48:47.000Z',
	timestampFormat: 'relative',
	timezone: 'Europe/Berlin',
	useUiTime: false,
	hideTimezone: false,
	nowTimestamp: '2021-05-28T10:48:47.000Z',
	expected: {
		reformattedTimestamp: '1 hour ago',
		timestampTitle: '09:48, 28 May 2021 (UTC)',
	},
})
testWithSettings({
	timestamp: '2021-05-28T10:21:47.000Z',
	timestampFormat: 'relative',
	timezone: 'Europe/Berlin',
	useUiTime: false,
	hideTimezone: false,
	nowTimestamp: '2021-05-28T10:48:47.000Z',
	expected: {
		reformattedTimestamp: '27 minutes ago',
		timestampTitle: '10:21, 28 May 2021 (UTC)',
	},
})
testWithSettings({
	timestamp: '2021-05-28T10:00:00.000Z',
	timestampFormat: 'relative',
	timezone: 'Europe/Berlin',
	useUiTime: false,
	hideTimezone: false,
	nowTimestamp: '2021-05-28T10:48:47.000Z',
	expected: {
		reformattedTimestamp: '48 minutes ago',
		timestampTitle: '10:00, 28 May 2021 (UTC)',
	},
})
testWithSettings({
	timestamp: '2021-05-25T10:48:47.000Z',
	timestampFormat: 'relative',
	timezone: 'Europe/Berlin',
	useUiTime: false,
	hideTimezone: false,
	nowTimestamp: '2021-05-28T10:48:47.000Z',
	expected: {
		reformattedTimestamp: '3 days ago',
		timestampTitle: '10:48, 25 May 2021 (UTC)',
	},
})
testWithSettings({
	timestamp: '2020-05-28T10:48:47.000Z',
	timestampFormat: 'relative',
	timezone: 'Europe/Berlin',
	useUiTime: false,
	hideTimezone: false,
	nowTimestamp: '2021-05-28T10:48:47.000Z',
	expected: {
		reformattedTimestamp: '1 year ago',
		timestampTitle: '10:48, 28 May 2020 (UTC)',
	},
})
testWithSettings({
	timestamp: '2020-05-28T10:48:47.000Z',
	timestampFormat: 'relative',
	timezone: 'Europe/Berlin',
	useUiTime: true,
	hideTimezone: true,
	nowTimestamp: '2021-05-28T10:48:47.000Z',
	expected: {
		reformattedTimestamp: '1 year ago',
		timestampTitle: '12:48, 28 May 2020 (UTC+2)\n10:48, 28 May 2020 (UTC)',
	},
})

testWithSettings({
	timestamp: '2021-05-28T10:48:47.000Z',
	timestampFormat: 'default',
	timezone: 'America/Los_Angeles',
	useUiTime: true,
	hideTimezone: false,
	expected: {
		reformattedTimestamp: '03:48, 28 May 2021 (UTC-7)',
		timestampTitle: '10:48, 28 May 2021 (UTC)',
	},
})
testWithSettings({
	timestamp: '2021-05-28T10:48:47.000Z',
	timestampFormat: 'improved',
	timezone: 'America/Los_Angeles',
	useUiTime: true,
	hideTimezone: false,
	nowTimestamp: '2021-05-28T10:48:47.000Z',
	expected: {
		reformattedTimestamp: 'Today, 3:48 AM (UTC-7)',
		timestampTitle: '10:48, 28 May 2021 (UTC)',
	},
})
testWithSettings({
	timestamp: '2021-05-28T03:48:47.000Z',
	timestampFormat: 'improved',
	timezone: 'America/Los_Angeles',
	useUiTime: true,
	hideTimezone: false,
	nowTimestamp: '2021-05-28T10:48:47.000Z',
	expected: {
		reformattedTimestamp: 'Yesterday, 8:48 PM (UTC-7)',
		timestampTitle: '03:48, 28 May 2021 (UTC)',
	},
})

testWithSettings({
	timestamp: '2021-05-28T10:21:47.000Z',
	timestampFormat: 'relative',
	timezone: 'America/Los_Angeles',
	useUiTime: false,
	hideTimezone: false,
	nowTimestamp: '2021-05-28T10:48:47.000Z',
	expected: {
		reformattedTimestamp: '27 minutes ago',
		timestampTitle: '10:21, 28 May 2021 (UTC)',
	},
})

testWithSettings({
	timestamp: '2021-05-28T10:48:47.000Z',
	timestampFormat: 'default',
	timezone: 'UTC',
	useUiTime: false,
	hideTimezone: true,
	expected: {
		reformattedTimestamp: '10:48, 28 May 2021',
		timestampTitle: '10:48, 28 May 2021 (UTC)',
	},
})
testWithSettings({
	timestamp: '2021-05-28T10:48:47.000Z',
	timestampFormat: 'default',
	timezone: 'UTC',
	useUiTime: true,
	hideTimezone: true,
	expected: {
		reformattedTimestamp: '10:48, 28 May 2021',
		timestampTitle: '10:48, 28 May 2021 (UTC)',
	},
})

testWithSettings({
	timestamp: '2021-05-28T10:48:47.000Z',
	timestampFormat: 'improved',
	timezone: 'UTC',
	useUiTime: false,
	hideTimezone: false,
	nowTimestamp: '2021-05-30T10:48:47.000Z',
	expected: {
		reformattedTimestamp: '28 May, 10:48 AM (UTC)',
		timestampTitle: '10:48, 28 May 2021 (UTC)',
	},
})
testWithSettings({
	timestamp: '2021-05-28T10:48:47.000Z',
	timestampFormat: 'improved',
	timezone: 'UTC',
	useUiTime: true,
	hideTimezone: false,
	nowTimestamp: '2021-05-30T10:48:47.000Z',
	expected: {
		reformattedTimestamp: '28 May, 10:48 AM (UTC)',
		timestampTitle: '10:48, 28 May 2021 (UTC)',
	},
})

testWithSettings({
	timestamp: '2021-05-28T10:48:47.000Z',
	timestampFormat: 'default',
	timezone: 0,
	useUiTime: true,
	hideTimezone: true,
	expected: {
		reformattedTimestamp: '10:48, 28 May 2021',
		timestampTitle: '10:48, 28 May 2021 (UTC)',
	},
})

testWithSettings({
	timestamp: '2021-05-28T10:48:47.000Z',
	timestampFormat: 'improved',
	timezone: 0,
	useUiTime: true,
	hideTimezone: false,
	nowTimestamp: '2021-05-30T10:48:47.000Z',
	expected: {
		reformattedTimestamp: '28 May, 10:48 AM (UTC)',
		timestampTitle: '10:48, 28 May 2021 (UTC)',
	},
})

testWithSettings({
	timestamp: '2021-05-28T10:48:47.000Z',
	timestampFormat: 'default',
	timezone: 120,
	useUiTime: true,
	hideTimezone: false,
	expected: {
		reformattedTimestamp: '12:48, 28 May 2021 (UTC+2)',
		timestampTitle: '10:48, 28 May 2021 (UTC)',
	},
})

testWithSettings({
	timestamp: '2021-05-28T10:48:47.000Z',
	timestampFormat: 'improved',
	timezone: 120,
	useUiTime: true,
	hideTimezone: false,
	nowTimestamp: '2021-05-30T10:48:47.000Z',
	expected: {
		reformattedTimestamp: '28 May, 12:48 PM (UTC+2)',
		timestampTitle: '10:48, 28 May 2021 (UTC)',
	},
})

testWithSettings({
	timestamp: '2021-05-28T10:48:47.000Z',
	timestampFormat: 'default',
	timezone: -120,
	useUiTime: true,
	hideTimezone: false,
	expected: {
		reformattedTimestamp: '08:48, 28 May 2021 (UTC-2)',
		timestampTitle: '10:48, 28 May 2021 (UTC)',
	},
})

testWithSettings({
	timestamp: '2021-05-28T10:48:47.000Z',
	timestampFormat: 'improved',
	timezone: -120,
	useUiTime: true,
	hideTimezone: false,
	nowTimestamp: '2021-05-30T10:48:47.000Z',
	expected: {
		reformattedTimestamp: '28 May, 8:48 AM (UTC-2)',
		timestampTitle: '10:48, 28 May 2021 (UTC)',
	},
})

testWithSettings({
	timestamp: '2021-05-28T10:48:47.000Z',
	timestampFormat: 'default',
	timezone: 'Europe/Berlin',
	useUiTime: true,
	hideTimezone: false,
	contentLanguage: 'de',
	expected: {
		reformattedTimestamp: '12:48, 28 May 2021 (UTC+2)',
		timestampTitle: '10:48, 28 Mai 2021 (UTC)',
	},
})
