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
    'pagetitle': '$1 - Wikimedia Commons',
    'discussiontools-topicsubscription-button-subscribe': 'subscribe',
    'discussiontools-topicsubscription-button-subscribe-tooltip': '{{GENDER:|Subscribe}} to receive notifications about new comments.',
    'discussiontools-topicsubscription-button-unsubscribe': 'unsubscribe',
    'discussiontools-topicsubscription-button-unsubscribe-tooltip': '{{GENDER:|Unsubscribe}} to stop receiving notifications about new comments.',
    'discussiontools-topicsubscription-notify-subscribed-title': '{{GENDER:|You}} have subscribed!',
    'discussiontools-topicsubscription-notify-subscribed-body': '{{GENDER:|You}} will receive notifications about new comments in this topic.',
    'discussiontools-topicsubscription-notify-unsubscribed-title': '{{GENDER:|You}} have unsubscribed.',
    'discussiontools-topicsubscription-notify-unsubscribed-body': '{{GENDER:|You}} will no longer receive notifications about new comments in this topic.',
    'discussiontools-newtopicssubscription-button-subscribe-label': 'Subscribe',
    'discussiontools-newtopicssubscription-button-subscribe-tooltip': 'Subscribe to receive notifications when new topics are started on this page.',
    'discussiontools-newtopicssubscription-button-unsubscribe-label': 'Unsubscribe',
    'discussiontools-newtopicssubscription-button-unsubscribe-tooltip': 'Unsubscribe to stop receiving notifications when new topics are started on this page.',
    'discussiontools-newtopicssubscription-notify-subscribed-title': '{{GENDER:|You}} have subscribed!',
    'discussiontools-newtopicssubscription-notify-subscribed-body': '{{GENDER:|You}} will receive notifications when new topics are started on this page.',
    'discussiontools-newtopicssubscription-notify-unsubscribed-title': '{{GENDER:|You}} have unsubscribed.',
    'discussiontools-newtopicssubscription-notify-unsubscribed-body': '{{GENDER:|You}} will no longer receive notifications when new topics are started on this page.',
    'visualeditor-educationpopup-dismiss': 'Okay, got it',
  },
  specialPageAliases: {
    'Contributions': 'Contributions',
    'Diff': 'Diff',
    'PermanentLink': 'PermanentLink',
  },
  timezone: 'UTC',
  useGlobalPreferences: true,
  archivePaths: [
    {
      source: "Commons:Undeletion requests/Current requests",
      archive: "Commons:Undeletion requests/Archive",
    },
    /\/Archive/,
  ],
  signatureEndingRegexp: / \(talk\)$/,
  tagName: 'convenient-discussions',
  hookToFireWithAuthorWrappers: 'global.userlinks',
  unsignedTemplates: [
    'Unsigned',
    'Non firmato',
    'Non signé',
    'Sig',
    'Not signed',
    'Nun firmatu',
    'Unsigned2',
    'UnsignedIP',
    'Unsigned IP',
    'Unsigned-ip',
    'UnsignedIP2',
    'Unsignedip2',
  ],
  smallDivTemplates: [
    'smalldiv',
    'Small div',
  ],
  paragraphTemplates: [
    'pb',
    'Paragraph break',
  ],
  outdentTemplates: [
    'outdent',
    'Od',
    'Unindent',
    'Out',
    'Quito sangría',
    'Quitar sangría',
    'OD',
  ],
  clearTemplates: [
    'Clear',
    'Clr',
    '-',
  ],
  quoteFormatting: function (mentionSource, author, timestamp, dtId) {
    var pre = '';
    var post = '';
    if (mentionSource) {
      pre = '{{tqb|text=';
      if (author) {
        post += '|by=' + author;
      }
      if (timestamp) {
        post += '|ts=' + timestamp;
      }
      if (dtId) {
        post += '|id=' + dtId;
      }
      post += '}}';
    } else {
      pre = '{{tq|1='
      post += '}}<br>';
    }
    return [pre, post];
  },
  noSignatureClasses: [
    'collapsibleheader',
  ],
  excludeFromHeadlineClasses: [
    'adminMark',
  ],
  closedDiscussionTemplates: [
    [
      'Closed',
      'Closedh',
      'Discussion top',
      'Discussion-top',
      'Discussion top',
      'Archive top',
      'Atop',
      'DeletionHeader',
      'Delh',
      'Rfdh',
    ],
    [
      'End closed',
      'Closedf',
      'Ecs',
      'Discussion bottom',
      'Discussion-bottom',
      'Archive bottom',
      'Abot',
      'DeletionFooter',
    ],
  ],
  closedDiscussionClasses: [
    'boilerplate',
    'delh',
  ],
  beforeAuthorLinkParse: function (authorLink) {
    // https://commons.wikimedia.org/wiki/MediaWiki:Gadget-markAdmins.js
    return authorLink.lastElementChild;
  },
  afterAuthorLinkParse: function (authorLink, adminMarkCandidate) {
    if (adminMarkCandidate && adminMarkCandidate.classList.contains('adminMark')) {
      authorLink.appendChild(adminMarkCandidate);
    }
  },
};

if (Number(mw.user.options.get('gadget-ThreadedDiscussions')) === 1) {
  mw.notify(
    convenientDiscussions.api.wrapHtml('Convenient Discussions is incompatible with Threaded Discussions gadget you have enabled. Please disable Threaded Discussions in <a href="https://commons.wikimedia.org/wiki/Special:Preferences#mw-prefsection-gadgets" target="_blank">gadget preferences</a>.'),
    {
      type: 'warn',
      autoHide: false,
    }
  );
}
