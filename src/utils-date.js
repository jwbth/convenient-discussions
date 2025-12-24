/**
 * Date and time utilities.
 *
 * @module utilsDate
 */

import { formatDistanceToNowStrict } from 'date-fns'
import { getTimezoneOffset } from 'date-fns-tz'
import dayjs from 'dayjs'
import dayJsTimezone from 'dayjs/plugin/timezone'
import dayJsUtc from 'dayjs/plugin/utc'

import cd from './loader/cd'
import settings from './settings'
import { dateTokenToMessageNames } from './shared/utils-timestamp'

/** @type {string | undefined} */
let utcString

/**
 * Generate a timezone postfix of a timestamp for an offset.
 *
 * @param {number} offset Offset in minutes.
 * @returns {string}
 */
export function generateTimezonePostfix(offset) {
	utcString ??= cd.mws('timezone-utc')
	let postfix = ` (${utcString}`

	if (offset !== 0) {
		// `offset` is not necessarily an integer
		postfix += (offset > 0 ? '+' : '-') + String(Math.abs(offset / 60))
	}
	postfix += ')'

	return postfix
}

/**
 * _For internal use._ Prepare `dayjs` object for further use (add plugins and a locale).
 */
export function initDayjs() {
	if (/** @type {any} */ (dayjs).utc) return

	const locale = cd.g.userLanguage in cd.i18n ? cd.i18n[cd.g.userLanguage].dayjsLocale : undefined
	if (locale) {
		dayjs.locale(locale)
	}

	dayjs.extend(dayJsUtc)
	dayjs.extend(dayJsTimezone)
}

/**
 * Convert a date to a string in the format set in the settings.
 *
 * @param {Date} date
 * @param {boolean} [addTimezone]
 * @returns {string}
 */
export function formatDate(date, addTimezone = false) {
	let timestamp
	const timestampFormat = settings.get('timestampFormat')
	if (timestampFormat === 'default') {
		timestamp = formatDateNative(date, addTimezone)
	} else if (timestampFormat === 'improved') {
		timestamp = formatDateImproved(date, addTimezone)
	} else {
		// if (timestampFormat === 'relative')
		timestamp = formatDateRelative(date)
	}

	return timestamp
}

/**
 * Convert a date to a string in the default timestamp format.
 *
 * @param {Date} date
 * @param {boolean} [addTimezone] Add the timezone postfix (for example, "(UTC+2)").
 * @param {string} [timezone] Use the specified time zone no matter user settings.
 * @returns {string}
 */
export function formatDateNative(date, addTimezone = false, timezone = undefined) {
	const timestampToolsUser = cd.g.timestampTools.user
	let timezoneOffset
	let year
	let monthIdx
	let day
	let hours
	let minutes
	let dayOfWeek
	if (
		settings.get('useUiTime') &&
		!['UTC', 0, undefined].includes(timestampToolsUser.timezone) &&
		!timezone
	) {
		if (timestampToolsUser.isSameAsLocalTimezone) {
			timezoneOffset = -date.getTimezoneOffset()
		} else {
			timezoneOffset =
				typeof timestampToolsUser.timezone === 'number'
					? timestampToolsUser.timezone
					: // Using date-fns-tz's getTimezoneOffset is way faster than using day.js's methods.
						getTimezoneOffset(/** @type {string} */ (timestampToolsUser.timezone), date.getTime()) /
						cd.g.msInMin
		}
		date = new Date(date.getTime() + timezoneOffset * cd.g.msInMin)
	} else if (!timezone || timezone === 'UTC') {
		timezoneOffset = 0
	} else {
		const dayjsDate = dayjs(date).tz(timezone)
		timezoneOffset = dayjsDate.utcOffset()
		year = dayjsDate.year()
		monthIdx = dayjsDate.month()
		day = dayjsDate.date()
		hours = dayjsDate.hour()
		minutes = dayjsDate.minute()
		dayOfWeek = dayjsDate.day()
	}
	year ??= date.getUTCFullYear()
	monthIdx ??= date.getUTCMonth()
	day ??= date.getUTCDate()
	hours ??= date.getUTCHours()
	minutes ??= date.getUTCMinutes()
	dayOfWeek ??= date.getUTCDay()

	let string = ''
	const format = timestampToolsUser.dateFormat
	for (let p = 0; p < format.length; p++) {
		let code = format[p]
		if ((code === 'x' && p < format.length - 1) || (code === 'xk' && p < format.length - 1)) {
			code += format[++p]
		}

		switch (code) {
			case 'xx':
				string += 'x'
				break
			case 'xg':
			case 'F':
			case 'M':
				string += dateTokenToMessageNames[code].map((token) => mw.msg(token))[monthIdx]
				break
			case 'd':
				string += String(day).padStart(2, '0')
				break
			case 'D':
			case 'l': {
				string += dateTokenToMessageNames[code].map((token) => mw.msg(token))[dayOfWeek]
				break
			}
			case 'j':
				string += String(day)
				break
			case 'n':
				string += String(monthIdx + 1)
				break
			case 'Y':
				string += String(year)
				break
			case 'xkY':
				string += String(year + 543)
				break
			case 'G':
				string += String(hours)
				break
			case 'H':
				string += String(hours).padStart(2, '0')
				break
			case 'i':
				string += String(minutes).padStart(2, '0')
				break
			case '\\':
				// Backslash escaping
				string += p < format.length - 1 ? format[++p] : '\\'
				break
			case '"':
				// Quoted literal
				if (p < format.length - 1) {
					const endQuote = format.indexOf('"', p + 1)
					if (endQuote === -1) {
						// No terminating quote, assume literal "
						string += '"'
					} else {
						string += format.substr(p + 1, endQuote - p - 1)
						p = endQuote
					}
				} else {
					// Quote at end of string, assume literal "
					string += '"'
				}
				break
			default:
				string += format[p]
		}
	}

	if (addTimezone) {
		string += generateTimezonePostfix(timezoneOffset)
	}

	return string
}

/**
 * Format a date in the "improved" format.
 *
 * @param {Date} date
 * @param {boolean} addTimezone
 * @returns {string}
 */
export function formatDateImproved(date, addTimezone = false) {
	const timestampToolsUser = cd.g.timestampTools.user
	let now = new Date()
	let dayjsDate = dayjs(date)
	let timezoneOffset
	if (settings.get('useUiTime') && !['UTC', 0, undefined].includes(timestampToolsUser.timezone)) {
		if (timestampToolsUser.isSameAsLocalTimezone) {
			timezoneOffset = -date.getTimezoneOffset()
		} else {
			timezoneOffset =
				typeof timestampToolsUser.timezone === 'number'
					? timestampToolsUser.timezone
					: // Using date-fns-tz's getTimezoneOffset is way faster than using day.js's methods.
						getTimezoneOffset(/** @type {string} */ (timestampToolsUser.timezone), now.getTime()) /
						cd.g.msInMin

			dayjsDate = dayjsDate.utcOffset(timezoneOffset)
		}
		now = new Date(now.getTime() + timezoneOffset * cd.g.msInMin)
	} else {
		timezoneOffset = 0
		dayjsDate = dayjsDate.utc()
	}

	const day = dayjsDate.date()
	const monthIdx = dayjsDate.month()
	const year = dayjsDate.year()

	// eslint-disable-next-line no-one-time-vars/no-one-time-vars
	const nowDay = now.getUTCDate()
	// eslint-disable-next-line no-one-time-vars/no-one-time-vars
	const nowMonthIdx = now.getUTCMonth()
	const nowYear = now.getUTCFullYear()

	const yesterday = new Date(now)
	yesterday.setDate(yesterday.getDate() - 1)
	// eslint-disable-next-line no-one-time-vars/no-one-time-vars
	const yesterdayDay = yesterday.getUTCDate()
	// eslint-disable-next-line no-one-time-vars/no-one-time-vars
	const yesterdayMonthIdx = yesterday.getUTCMonth()
	// eslint-disable-next-line no-one-time-vars/no-one-time-vars
	const yesterdayYear = yesterday.getUTCFullYear()

	let formattedDate
	if (day === nowDay && monthIdx === nowMonthIdx && year === nowYear) {
		formattedDate = dayjsDate.format(cd.s('comment-timestamp-today'))
	} else if (day === yesterdayDay && monthIdx === yesterdayMonthIdx && year === yesterdayYear) {
		formattedDate = dayjsDate.format(cd.s('comment-timestamp-yesterday'))
	} else if (year === nowYear) {
		formattedDate = dayjsDate.format(cd.s('comment-timestamp-currentyear'))
	} else {
		formattedDate = dayjsDate.format(cd.s('comment-timestamp-other'))
	}

	if (addTimezone) {
		formattedDate += generateTimezonePostfix(timezoneOffset)
	}

	return formattedDate
}

/**
 * Format a date in the "relative" format.
 *
 * @param {Date} date
 * @returns {string}
 */
export function formatDateRelative(date) {
	const now = Date.now()
	const ms = date.getTime()
	if (ms < now && ms > now - cd.g.msInMin) {
		return cd.s('comment-timestamp-lessthanminute')
	}

	// We have relative dates rounded down (1 hour 59 minutes rounded to 1 hour, not 2 hours), as is
	// the standard across the web, judging by Facebook, YouTube, Twitter, and also Google's guideline
	// on date formats: https://material.io/design/communication/data-formats.html. We also use
	// date-fns here as its locales always have strings with numbers ("1 day ago", not "a day ago"),
	// which, IMHO, are more likely to be perceived as "something in between 24 hours and 48 hours",
	// not "something around 24 hours" (jwbth).
	return formatDistanceToNowStrict(date, {
		addSuffix: true,
		roundingMethod: 'floor',
		locale: cd.i18n[cd.g.userLanguage].dateFnsLocale,
	})
}
