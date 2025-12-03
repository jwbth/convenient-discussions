// TODO: use some interfaces for mocks and real objects alike?

window.mw = {
	config: {
		/** @type {{ [key: string]: any }} */
		values: {
			wgContentLanguage: 'en',
			wgUserLanguage: 'en',
		},
		get: (/** @type {string} */ name) => mw.config.values[name],
		set: (/** @type {string} */ name, /** @type {string} */ value) => {
			mw.config.values[name] = value
		},
	},
	msg: (/** @type {string} */ name) => messages[mw.config.get('wgUserLanguage')][name],
	user: {
		options: {
			get: () => ({}),
		},
	},
	loader: {
		getState: () => {},
	},
}
const mw = window.mw

window.OO = require('oojs')

const getTimezoneOffset = require('date-fns-tz').getTimezoneOffset

window.$ = {}
require('../src/jqueryExtensions')

// eslint-disable-next-line no-one-time-vars/no-one-time-vars
const en = require('../i18n/en.json')
const Comment = require('../src/Comment').default
const settings = require('../src/settings').default
const cd = require('../src/shared/cd').default
const { formatDateNative, initDayjs } = require('../src/utils-window')

cd.config = {
	defaultInsertButtons: [],
	defaultSignaturePrefix: ' ',
}
cd.g = {
	settingsOptionName: 'userjs-convenientDiscussions-settings',
	phpCharToUpper: {},
	userLanguage: 'en',
	uiDateFormat: 'H:i, j F Y',
	msInMin: 1000 * 60,
}
cd.mws = (/** @type {string} */ name) =>
	({
		'timezone-utc': 'UTC',
	})[name]
cd.i18n = { en }
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
			(reformattedTimestamp ? `"${reformattedTimestamp}"` : reformattedTimestamp),
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
				comment.formatTimestamp = Comment.prototype.formatTimestamp
				comment.updateTimestampElements = Comment.prototype.updateTimestampElements
				comment.updateMainTimestampElement = Comment.prototype.updateMainTimestampElement
				comment.updateExtraSignatureTimestamps = Comment.prototype.updateExtraSignatureTimestamps
				Comment.prototype.reformatTimestamp.call(comment)

				return {
					reformattedTimestamp: comment.reformattedTimestamp,
					timestampTitle: comment.timestampTitle,
				}
			}

			const dateObj = new Date(date)
			cd.g.uiTimezone = timezone || 'UTC'
			cd.g.uiTimezoneOffset = getTimezoneOffset(String(timezone), dateObj.getTime()) / cd.g.msInMin
			settings.set('timestampFormat', timestampFormat)
			settings.set('useUiTime', useUiTime)
			settings.set('hideTimezone', hideTimezone)
			cd.g.areTimestampsDefault = !(
				(settings.get('useUiTime') && 'UTC' !== cd.g.uiTimezone) ||
				settings.get('timestampFormat') !== 'default' ||
				mw.config.get('wgContentLanguage') !== cd.g.userLanguage ||
				settings.get('hideTimezone')
			)

			if (contentLanguage) {
				mw.config.set('wgUserLanguage', contentLanguage)
			}
			comment.timestampElement.textContent = formatDateNative(dateObj, true, 'UTC')
			if (contentLanguage) {
				mw.config.set('wgUserLanguage', 'en')
			}

			// eslint-disable-next-line no-one-time-vars/no-one-time-vars
			const originalDate = new Date()
			if (nowTimestamp) {
				jest.useFakeTimers()
				jest.setSystemTime(new Date(nowTimestamp))
			}
			try {
				expect(adaptedReformatTimestamp(date)).toEqual({
					reformattedTimestamp,
					timestampTitle,
				})
			} finally {
				if (nowTimestamp) {
					jest.setSystemTime(originalDate)
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
