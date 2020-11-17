export default {
  messages: {
    'sun': 'Sun',
    'mon': 'Mon',
    'tue': 'Tue',
    'wed': 'Wed',
    'thu': 'Thu',
    'fri': 'Fri',
    'sat': 'Sat',
    'sunday': 'Sunday',
    'monday': 'Monday',
    'tuesday': 'Tuesday',
    'wednesday': 'Wednesday',
    'thursday': 'Thursday',
    'friday': 'Friday',
    'saturday': 'Saturday',
    'jan': 'Jan',
    'feb': 'Feb',
    'mar': 'Mar',
    'apr': 'Apr',
    'may': 'May',
    'jun': 'Jun',
    'jul': 'Jul',
    'aug': 'Aug',
    'sep': 'Sep',
    'oct': 'Oct',
    'nov': 'Nov',
    'dec': 'Dec',
    'january': 'January',
    'february': 'February',
    'march': 'March',
    'april': 'April',
    'may_long': 'May',
    'june': 'June',
    'july': 'July',
    'august': 'August',
    'september': 'September',
    'october': 'October',
    'november': 'November',
    'december': 'December',
    'january-gen': 'January',
    'february-gen': 'February',
    'march-gen': 'March',
    'april-gen': 'April',
    'may-gen': 'May',
    'june-gen': 'June',
    'july-gen': 'July',
    'august-gen': 'August',
    'september-gen': 'September',
    'october-gen': 'October',
    'november-gen': 'November',
    'december-gen': 'December',
    'timezone-utc': 'UTC',
    'parentheses': '($1)',
    'parentheses-start': '(',
    'parentheses-end': ')',
    'word-separator': ' ',
    'comma-separator': ', ',
    'colon-separator': ': ',
  },

  contribsPage: 'Special:Contributions',

  localTimezoneOffset: 0,

  archivePaths: [
    /\/Archive/,
  ],

  spaceAfterIndentationChars: false,

  signatureEndingRegexp: / \(talk\)/,

  smallDivTemplates: [
    'smalldiv',
  ],

  paragraphTemplates: [
    'pb',
    'paragraph break',
    'parabr',
    'paragraph',
  ],

  elementsToExcludeClasses: [
    'unresolved',
    'resolved',
    'ambox',
    'NavFrame',
  ],

  templatesToExclude: [
    'moved discussion from', 'moved from', 'mdf',
    'moved discussion to', 'moved to', 'mdt',
  ],

  commentAntipatterns: [],

  customBadCommentBeginnings: [
    /^\{\{(?:-|clear|br|clr)\}\} *\n*/,
  ],

  keepInSectionEnding: [
    /\n+\{\{(?:-|clear)\}\}\s*$/,
    /\n+(?:<!--[^]*?-->\s*)+$/,
  ],

  customFloatingElementSelectors: [
    '.infobox',
    '.vertical-navbox',
  ],

  closedDiscussionClasses: [
    'archived',
    'boilerplate',
  ],

  customUnhighlightableElementClasses: [
    'infobox',
    'unresolved',
    'resolved',
  ],

  undoTexts: [
    'Undid revision',
    'Reverted edits',
  ],

  getMoveSourcePageCode: function (targetPageWikilink, signature) {
    return '{{Moved discussion to|' + targetPageWikilink + '|' + signature + '}}';
  },

  getMoveTargetPageCode: function (targetPageWikilink, signature) {
    return '{{Moved discussion from|' + targetPageWikilink + '|' + signature + '}}';
  },
};
