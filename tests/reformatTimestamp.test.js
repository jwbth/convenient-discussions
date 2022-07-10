const getTimezoneOffset = require('date-fns-tz').getTimezoneOffset;

const Comment = require('../src/js/Comment').default;
const cd = require('../src/js/cd').default;
const en = require('../i18n/en.json');
const settings = require('../src/js/settings').default;
const g = require('../src/js/staticGlobals').default;
const { formatDateNative, initDayjs } = require('../src/js/timestamp');

cd.g = g;
cd.config = {
  defaultInsertButtons: [],
  defaultSignaturePrefix: ' ',
};
cd.g.SETTINGS_OPTION_NAME = 'userjs-convenientDiscussions-settings';
cd.g.PHP_CHAR_TO_UPPER = {};
cd.g.USER_LANGUAGE = 'en';
cd.g.UI_DATE_FORMAT = 'H:i, j F Y';
cd.mws = (name) => ({
  'timezone-utc': 'UTC',
}[name]);
cd.i18n = { en };
cd.s = (name) => cd.i18n.en[name];
cd.debug = {
  startTimer: () => {},
  stopTimer: () => {},
};
settings.save = async () => {};
cd.settings = settings;

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
};

window.mw = {
  config: {
    values: {
      wgContentLanguage: 'en',
      wgUserLanguage: 'en',
    },
    get: (name) => mw.config.values[name],
    set: (name, value) => {
      mw.config.values[name] = value;
    },
  },
  msg: (name) => messages[mw.config.get('wgUserLanguage')][name],
  user: {
    options: {
      get: () => ({}),
    },
  },
  loader: {
    getState: () => {},
  },
};

settings.init();

function spacePad(text, length) {
  return text + ' '.repeat(Math.max(0, length - text.length));
}

function testWithSettings(
  [date, timestampFormat, timezone, useUiTime, hideTimezone, nowDate, contentLanguage],
  expectedValue
) {
  const expectedText = expectedValue[0];
  const conditions = (
    `${timestampFormat}, ${timezone}` +
    (useUiTime ? ', UI time' : '') +
    (hideTimezone ? ', hide timezone' : '')
  );
  const label = (
    spacePad(conditions, 60) +
    ' ' +
    (expectedText ? `"${expectedText}"` : expectedText)
  );
  test(label, () => {
    const comment = {
      timestampElement: {},
      setDateUpdateTimer: () => {},
      extraSignatures: [],
    };

    const adaptedReformatTimestamp = (date) => {
      comment.date = new Date(date);
      comment.formatTimestamp = Comment.prototype.formatTimestamp;
      Comment.prototype.reformatTimestamp.call(comment);
      return [comment.reformattedTimestamp, comment.timestampTitle];
    }

    const dateObj = new Date(date);
    cd.g.UI_TIMEZONE = timezone || 'UTC';
    cd.g.UI_TIMEZONE_OFFSET = getTimezoneOffset(timezone, dateObj.getTime()) / cd.g.MS_IN_MIN;
    settings.set('timestampFormat', timestampFormat);
    settings.set('useUiTime', useUiTime);
    settings.set('hideTimezone', hideTimezone);
    cd.g.ARE_TIMESTAMPS_ALTERED = (
      (settings.get('useUiTime') && 'UTC' !== cd.g.UI_TIMEZONE) ||
      settings.get('timestampFormat') !== 'default' ||
      mw.config.get('wgContentLanguage') !== cd.g.USER_LANGUAGE ||
      settings.get('hideTimezone')
    );

    if (contentLanguage) {
      mw.config.set('wgUserLanguage', contentLanguage);
    }
    comment.timestampElement.textContent = formatDateNative(dateObj, true, 'UTC');
    if (contentLanguage) {
      mw.config.set('wgUserLanguage', 'en');
    }

    const originalDate = new Date();
    if (nowDate) {
      jest.useFakeTimers('modern');
      jest.setSystemTime(new Date(nowDate));
    }
    try {
      expect(adaptedReformatTimestamp(date)).toEqual(expectedValue);
    } finally {
      if (nowDate) {
        jest.setSystemTime(originalDate);
      }
    }
  });
}

initDayjs();

testWithSettings(
  ['2021-05-28T10:48:47.000Z', 'default', 'Europe/Berlin', false, false],
  [undefined, undefined]
);
testWithSettings(
  ['2021-05-28T10:48:47.000Z', 'default', 'Europe/Berlin', false, true],
  ['10:48, 28 May 2021', '10:48, 28 May 2021 (UTC)']
);
testWithSettings(
  ['2021-05-28T10:48:47.000Z', 'default', 'Europe/Berlin', true, false],
  ['12:48, 28 May 2021 (UTC+2)', '10:48, 28 May 2021 (UTC)']
);
testWithSettings(
  ['2021-05-28T10:48:47.000Z', 'default', 'Europe/Berlin', true, true],
  ['12:48, 28 May 2021', '10:48, 28 May 2021 (UTC)']
);

testWithSettings(
  ['2021-05-28T10:48:47.000Z', 'improved', 'Europe/Berlin', false, false, '2021-05-30T10:48:47.000Z'],
  ['28 May, 10:48 AM (UTC)', '10:48, 28 May 2021 (UTC)']
);
testWithSettings(
  ['2021-05-28T10:48:47.000Z', 'improved', 'Europe/Berlin', false, true, '2021-05-30T10:48:47.000Z'],
  ['28 May, 10:48 AM', '10:48, 28 May 2021 (UTC)']
);
testWithSettings(
  ['2021-05-28T10:48:47.000Z', 'improved', 'Europe/Berlin', true, false, '2021-05-30T10:48:47.000Z'],
  ['28 May, 12:48 PM (UTC+2)', '10:48, 28 May 2021 (UTC)']
);
testWithSettings(
  ['2021-05-28T10:48:47.000Z', 'improved', 'Europe/Berlin', true, true, '2021-05-30T10:48:47.000Z'],
  ['28 May, 12:48 PM', '10:48, 28 May 2021 (UTC)']
);
testWithSettings(
  ['2021-05-28T10:48:47.000Z', 'improved', 'Europe/Berlin', true, true, '2021-05-28T10:48:47.000Z'],
  ['Today, 12:48 PM', '10:48, 28 May 2021 (UTC)']
);
testWithSettings(
  ['2021-05-28T10:48:47.000Z', 'improved', 'Europe/Berlin', true, true, '2021-05-28T22:48:47.000Z'],
  ['Yesterday, 12:48 PM', '10:48, 28 May 2021 (UTC)']
);
testWithSettings(
  ['2020-05-28T10:48:47.000Z', 'improved', 'Europe/Berlin', false, false],
  ['28 May 2020, 10:48 AM (UTC)', '10:48, 28 May 2020 (UTC)']
);

testWithSettings(
  ['2021-05-28T10:48:00.000Z', 'relative', 'Europe/Berlin', false, false, '2021-05-28T10:48:47.000Z'],
  ['less than a minute ago', '10:48, 28 May 2021 (UTC)']
);
testWithSettings(
  ['2021-05-28T10:47:47.000Z', 'relative', 'Europe/Berlin', false, false, '2021-05-28T10:48:47.000Z'],
  ['1 minute ago', '10:47, 28 May 2021 (UTC)']
);
testWithSettings(
  ['2021-05-28T10:46:48.000Z', 'relative', 'Europe/Berlin', false, false, '2021-05-28T10:48:47.000Z'],
  ['1 minute ago', '10:46, 28 May 2021 (UTC)']
);
testWithSettings(
  ['2021-05-28T09:48:47.000Z', 'relative', 'Europe/Berlin', false, false, '2021-05-28T10:48:47.000Z'],
  ['1 hour ago', '09:48, 28 May 2021 (UTC)']
);
testWithSettings(
  ['2021-05-28T10:21:47.000Z', 'relative', 'Europe/Berlin', false, false, '2021-05-28T10:48:47.000Z'],
  ['27 minutes ago', '10:21, 28 May 2021 (UTC)']
);
testWithSettings(
  ['2021-05-28T10:00:00.000Z', 'relative', 'Europe/Berlin', false, false, '2021-05-28T10:48:47.000Z'],
  ['48 minutes ago', '10:00, 28 May 2021 (UTC)']
);
testWithSettings(
  ['2021-05-25T10:48:47.000Z', 'relative', 'Europe/Berlin', false, false, '2021-05-28T10:48:47.000Z'],
  ['3 days ago', '10:48, 25 May 2021 (UTC)']
);
testWithSettings(
  ['2020-05-28T10:48:47.000Z', 'relative', 'Europe/Berlin', false, false, '2021-05-28T10:48:47.000Z'],
  ['1 year ago', '10:48, 28 May 2020 (UTC)']
);
testWithSettings(
  ['2020-05-28T10:48:47.000Z', 'relative', 'Europe/Berlin', true, true, '2021-05-28T10:48:47.000Z'],
  ['1 year ago', '12:48, 28 May 2020 (UTC+2)\n10:48, 28 May 2020 (UTC)']
);

testWithSettings(
  ['2021-05-28T10:48:47.000Z', 'default', 'America/Los_Angeles', true, false],
  ['03:48, 28 May 2021 (UTC-7)', '10:48, 28 May 2021 (UTC)']
);

const currentYear = new Date().getFullYear();

testWithSettings(
  [`${currentYear}-05-28T10:48:47.000Z`, 'improved', 'America/Los_Angeles', true, false],
  ['28 May, 3:48 AM (UTC-7)', `10:48, 28 May ${currentYear} (UTC)`]
);
testWithSettings(
  [`${currentYear}-05-28T10:48:47.000Z`, 'improved', 'America/Los_Angeles', true, true],
  ['28 May, 3:48 AM', `10:48, 28 May ${currentYear} (UTC)`]
);
testWithSettings(
  ['2021-05-28T10:48:47.000Z', 'improved', 'America/Los_Angeles', true, false, '2021-05-28T10:48:47.000Z'],
  ['Today, 3:48 AM (UTC-7)', '10:48, 28 May 2021 (UTC)']
);
testWithSettings(
  ['2021-05-28T03:48:47.000Z', 'improved', 'America/Los_Angeles', true, false, '2021-05-28T10:48:47.000Z'],
  ['Yesterday, 8:48 PM (UTC-7)', '03:48, 28 May 2021 (UTC)']
);


testWithSettings(
  ['2021-05-28T10:21:47.000Z', 'relative', 'America/Los_Angeles', false, false, '2021-05-28T10:48:47.000Z'],
  ['27 minutes ago', '10:21, 28 May 2021 (UTC)']
);

testWithSettings(
  ['2021-05-28T10:48:47.000Z', 'default', 'UTC', false, true],
  ['10:48, 28 May 2021', '10:48, 28 May 2021 (UTC)']
);
testWithSettings(
  ['2021-05-28T10:48:47.000Z', 'default', 'UTC', true, true],
  ['10:48, 28 May 2021', '10:48, 28 May 2021 (UTC)']
);

testWithSettings(
  ['2021-05-28T10:48:47.000Z', 'improved', 'UTC', false, false, '2021-05-30T10:48:47.000Z'],
  ['28 May, 10:48 AM (UTC)', '10:48, 28 May 2021 (UTC)']
);
testWithSettings(
  ['2021-05-28T10:48:47.000Z', 'improved', 'UTC', true, false, '2021-05-30T10:48:47.000Z'],
  ['28 May, 10:48 AM (UTC)', '10:48, 28 May 2021 (UTC)']
);

testWithSettings(
  ['2021-05-28T10:48:47.000Z', 'default', 0, true, true],
  ['10:48, 28 May 2021', '10:48, 28 May 2021 (UTC)']
);

testWithSettings(
  ['2021-05-28T10:48:47.000Z', 'improved', 0, true, false, '2021-05-30T10:48:47.000Z'],
  ['28 May, 10:48 AM (UTC)', '10:48, 28 May 2021 (UTC)']
);

testWithSettings(
  ['2021-05-28T10:48:47.000Z', 'default', 120, true, false],
  ['12:48, 28 May 2021 (UTC+2)', '10:48, 28 May 2021 (UTC)']
);

testWithSettings(
  ['2021-05-28T10:48:47.000Z', 'improved', 120, true, false, '2021-05-30T10:48:47.000Z'],
  ['28 May, 12:48 PM (UTC+2)', '10:48, 28 May 2021 (UTC)']
);

testWithSettings(
  ['2021-05-28T10:48:47.000Z', 'default', -120, true, false],
  ['08:48, 28 May 2021 (UTC-2)', '10:48, 28 May 2021 (UTC)']
);

testWithSettings(
  ['2021-05-28T10:48:47.000Z', 'improved', -120, true, false, '2021-05-30T10:48:47.000Z'],
  ['28 May, 8:48 AM (UTC-2)', '10:48, 28 May 2021 (UTC)']
);

testWithSettings(
  ['2021-05-28T10:48:47.000Z', 'default', 'Europe/Berlin', true, false, null, 'de'],
  ['12:48, 28 May 2021 (UTC+2)', '10:48, 28 Mai 2021 (UTC)']
);
