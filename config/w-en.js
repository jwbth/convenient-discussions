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
    'nextdiff': 'Next edit →',
  },

  contribsPage: 'Special:Contributions',

  substAliases: [
    'subst:'
  ],

  timezone: 'UTC',

  archivePaths: [
    {
      source: "Wikipedia:Administrators' noticeboard/Incidents",
      archive: "Wikipedia:Administrators' noticeboard/IncidentArchive",
    },
    {
      source: "Wikipedia:Administrators' noticeboard/Edit warring",
      archive: "Wikipedia:Administrators' noticeboard/3RRArchive",
    },
    /\/Archive/,
  ],

  /*pageWhitelist: [
    /^Wikipedia:/,
    /^Help:/,
    /^Template:Did you know nominations\//,
  ],*/

  spaceAfterIndentationChars: false,

  signatureEndingRegexp: / \(talk\)/,

  smallDivTemplates: [
    'smalldiv',
    'Div-small',
  ],

  unsignedTemplates: [
    'Unsigned',
    'Unsigned3',
    'Unsig',
    'Unsinged',
    'Signed',
    'Unsign',
    'UNSIGNED',
    'Uns',
    'Tidle',
    'Nosign',
    'Forgot to sign',
    'Without signature',
    'USU',
    'Unsigned comment',
    'Preceding unsigned comment',
    'Unisgned',
    'Unsigned IP',
    'Unsignedip',
    'Ipunsigned',
    'IPsign',
    'UnsignedIP',
    'USIP',
    'Unsigned ip',
    'Unsigned-ip',
    'Unsigned-Ip',
    'Unsigned-IP',
    'Uip',
    'IP unsigned',
  ],

  paragraphTemplates: [
    'pb',
    'Paragraph break',
    'Break!',
    'Paragraph',
    'Parabr',
    'Paragr',
    'Paragraphbreak',
    'Par break',
    'Parabreak',
    'Para break',
  ],

  outdentTemplates: [
    'outdent',
    'Noindent',
    'Unindent',
    'Outdentarrow',
    'Oda',
    'Od',
    'Out',
    'De-indent',
    'Deindent',
    'Outindent',
    'OD',
    'Reduceindent',
    'Dedent',
    'Break indent',
    'Rethread',
  ],

  clearTemplates: [
    'Clear',
    'Clr',
    '-',
    'CleanBr',
    'BrClear',
    'Breakafterimages',
    'Br',
    'Sectionbreak',
    'BR',
    'Clear all',
    'Clear both',
    'Clearboth',
    'CLEAR',
    'Absatz',
  ],

  quoteFormatting: ["{{tq|1=", "}}"],

  elementsToExcludeClasses: [
    'cd-moveMark',
    'unresolved',
    'resolved',
    'ambox',
    'NavFrame',
  ],

  templatesToExclude: [
    'Moved discussion from',
    'Discussion moved from',
    'Dmf',
    'Moved from',
    'Moved conversation from',
    'Movedfrom',
    'Mdf',
    'Moved discussion to',
    'Discussion at',
    'Discussion moved',
    'Discussion moved to',
    'Dmt',
    'Moved to',
    'Moved conversation',
    'Moved discussion',
    'Mdt',
    'Moved',
    'Discussion-moved',
    'DiscussionMoved',
    'Movedto',
    'Move to',
  ],

  closedDiscussionTemplates: [
    [
      'Closed',
      'Discussion closed'
    ],
    [],
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
    return '{{Moved discussion to|' + targetPageWikilink + '|' + signature + '}}\n';
  },

  getMoveTargetPageCode: function (targetPageWikilink, signature) {
    return '{{Moved discussion from|' + targetPageWikilink + '|' + signature + '}}\n';
  },
};

mw.hook('convenientDiscussions.pageReadyFirstTime').add(function () {
  if ($('.localcomments[style="font-size: 95%; white-space: nowrap;"]').length) {
    const $text = convenientDiscussions.util.wrap('User script <a href="//en.wikipedia.org/wiki/User:Gary/comments_in_local_time.js">comments_in_local_time.js</a> is executed earlier than Convenient Discussions, which prevents the latter from working correctly. Follow the instructions <a href="' + mw.util.getUrl(convenientDiscussions.config.scriptPageWikilink) + '#Compatibility">here</a> to make them compatible.');
    mw.notify($text, { autoHide: false });
  }
});
