const Comment = require('../src/js/Comment').default;
const cd = require('../src/js/cd').default;
const en = require('../i18n/en.json');
const { formatDateNative, initDayjs } = require('../src/js/timestamp');

cd.settings = {};

cd.g = {};
cd.g.USER_LANGUAGE = 'en';
cd.g.USER_DATE_FORMAT = 'H:i, j F Y';
cd.mws = () => {
  return 'UTC';
};
cd.i18n = { en };
cd.s = (name) => cd.i18n.en[name];
cd.debug = {
  startTimer: () => {},
  stopTimer: () => {},
};

const messages = {
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
};

window.mw = {
  config: {
    get: () => 'en',
  },
  msg: (name) => messages[name],
};

const comment = {
  timestampElement: {},
  setDateUpdateTimer: () => {},
};
const adaptedReformatTimestamp = (date) => {
  comment.date = new Date(date);
  Comment.prototype.reformatTimestamp.call(comment);
  return [comment.reformattedTimestamp, comment.timestampTitle];
}

const testWithSettings = ([date, timestampFormat, useLocalTime, hideTimezone, nowDate], expectedValue) => {
  const expectedText = expectedValue[0];
  const ending = expectedText ? `"${expectedText}"` : expectedText;
  test(`reformatTimestamp, format "${timestampFormat}"${useLocalTime ? ', local time' : ''}${hideTimezone ? ', hide timezone' : ''}: ${ending}`, () => {
    cd.settings.timestampFormat = timestampFormat;
    cd.settings.useLocalTime = useLocalTime;
    cd.settings.hideTimezone = hideTimezone;
    comment.timestampElement.textContent = formatDateNative(new Date(date), 'UTC') + ' (UTC)';

    if (nowDate) {
      jest.useFakeTimers('modern');
      jest.setSystemTime(new Date(nowDate));
    }
    expect(adaptedReformatTimestamp(date)).toEqual(expectedValue);
    if (nowDate) {
      jest.setSystemTime(Date.now());
    }
  });
};

initDayjs();

test('Timezone set to Europe/Berlin', () => {
  expect(new Date().getTimezoneOffset()).toBe(-120);
});

testWithSettings(
  ['2021-05-28T10:48:47.000Z', 'default', false, false],
  [undefined, undefined]
);
testWithSettings(
  ['2021-05-28T10:48:47.000Z', 'default', false, true],
  ['10:48, 28 May 2021', '10:48, 28 May 2021 (UTC)']
);
testWithSettings(
  ['2021-05-28T10:48:47.000Z', 'default', true, false],
  ['12:48, 28 May 2021 (UTC+2)', '10:48, 28 May 2021 (UTC)']
);
testWithSettings(
  ['2021-05-28T10:48:47.000Z', 'default', true, true],
  ['12:48, 28 May 2021', '10:48, 28 May 2021 (UTC)']
);

testWithSettings(
  ['2021-05-28T10:48:47.000Z', 'improved', false, false],
  ['28 May, 10:48 AM (UTC)', '10:48, 28 May 2021 (UTC)']
);
testWithSettings(
  ['2021-05-28T10:48:47.000Z', 'improved', false, true],
  ['28 May, 10:48 AM', '10:48, 28 May 2021 (UTC)']
);
testWithSettings(
  ['2021-05-28T10:48:47.000Z', 'improved', true, false],
  ['28 May, 12:48 PM (UTC+2)', '10:48, 28 May 2021 (UTC)']
);
testWithSettings(
  ['2021-05-28T10:48:47.000Z', 'improved', true, true],
  ['28 May, 12:48 PM', '10:48, 28 May 2021 (UTC)']
);

testWithSettings(
  ['2021-05-28T10:48:47.000Z', 'improved', true, true, '2021-05-28T10:48:47.000Z'],
  ['Today, 12:48 PM', '10:48, 28 May 2021 (UTC)']
);
testWithSettings(
  ['2020-05-28T10:48:47.000Z', 'improved', false, false],
  ['28 May 2020, 10:48 AM (UTC)', '10:48, 28 May 2020 (UTC)']
);

testWithSettings(
  ['2021-05-28T10:48:00.000Z', 'relative', false, false, '2021-05-28T10:48:47.000Z'],
  ['a few seconds ago', '10:48, 28 May 2021 (UTC)']
);
testWithSettings(
  ['2021-05-28T10:47:47.000Z', 'relative', false, false, '2021-05-28T10:48:47.000Z'],
  ['a minute ago', '10:47, 28 May 2021 (UTC)']
);
testWithSettings(
  ['2021-05-28T10:46:48.000Z', 'relative', false, false, '2021-05-28T10:48:47.000Z'],
  ['a minute ago', '10:46, 28 May 2021 (UTC)']
);
testWithSettings(
  ['2021-05-28T09:48:47.000Z', 'relative', false, false, '2021-05-28T10:48:47.000Z'],
  ['an hour ago', '09:48, 28 May 2021 (UTC)']
);
testWithSettings(
  ['2021-05-28T10:21:47.000Z', 'relative', false, false, '2021-05-28T10:48:47.000Z'],
  ['27 minutes ago', '10:21, 28 May 2021 (UTC)']
);
testWithSettings(
  ['2021-05-28T10:00:00.000Z', 'relative', false, false, '2021-05-28T10:48:47.000Z'],
  ['48 minutes ago', '10:00, 28 May 2021 (UTC)']
);
testWithSettings(
  ['2021-05-25T10:48:47.000Z', 'relative', false, false, '2021-05-28T10:48:47.000Z'],
  ['3 days ago', '10:48, 25 May 2021 (UTC)']
);
testWithSettings(
  ['2020-05-28T10:48:47.000Z', 'relative', false, false, '2021-05-28T10:48:47.000Z'],
  ['a year ago', '10:48, 28 May 2020 (UTC)']
);
testWithSettings(
  ['2020-05-28T10:48:47.000Z', 'relative', true, true, '2021-05-28T10:48:47.000Z'],
  ['a year ago', '12:48, 28 May 2020 (UTC+2)\n10:48, 28 May 2020 (UTC)']
);
