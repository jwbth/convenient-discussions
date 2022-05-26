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
    'nextdiff': 'Newer edit →',
  },
  specialPageAliases: {
    'Contributions': 'Contributions',
    'Diff': 'Diff',
  },
  timezone: 'UTC',
  useGlobalPreferences: true,
  archivePaths: [/\/Archive/],
  signatureEndingRegexp: / \(talk\)$/,
  tagName: 'convenient-discussions',
  unsignedTemplates: [
    'Unsigned',
    'Unsigned3',
    'Unsigned2',
    'Unsigned IP',
    'Unsigned-ip',
    'UnsignedIP',
  ],
  paragraphTemplates: [
    'pb',
    'Paragraph break',
  ],
  outdentTemplates: [
    'outdent',
    'Unindent',
    'Od',
    'OUTDENT',
  ],
  clearTemplates: [
    'Clear',
    'Br',
  ],
  quoteFormatting: ["{{tq|1=", "}}<br>"],
  elementsToExcludeClasses: [
    'NavHead',
  ],
  templatesToExclude: [
    'Moved',
  ],
  foreignElementInHeadlineClasses: [
    'adminMark',
  ],
  closedDiscussionTemplates: [
    [
      'Closed',
      'Discussion top',
      'Dt',
      'Archive top',
      'Hidden archive top',
      'Hat',
    ],
    [
      'Discussion bottom',
      'Archive bottom',
      'Hidden archive bottom',
      'Hab',
    ],
  ],
  closedDiscussionClasses: [
    'boilerplate',
    'NavFrame',
    'NavContent',
    'mw-collapsed',
  ],
  beforeAuthorLinkParse: function (authorLink) {
    // https://meta.wikimedia.org/wiki/MediaWiki:Gadget-markAdmins.js
    return authorLink.lastElementChild;
  },
  afterAuthorLinkParse: function (authorLink, adminMarkCandidate) {
    if (adminMarkCandidate?.classList.contains('adminMark')) {
      authorLink.appendChild(adminMarkCandidate);
    }
  }
};