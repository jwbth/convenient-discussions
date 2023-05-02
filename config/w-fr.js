export default {
	'messages': {
		'sun': 'dim.',
		'mon': 'lun.',
		'tue': 'mar.',
		'wed': 'mer.',
		'thu': 'jeu.',
		'fri': 'ven.',
		'sat': 'sam.',
		'sunday': 'dimanche',
		'monday': 'lundi',
		'tuesday': 'mardi',
		'wednesday': 'mercredi',
		'thursday': 'jeudi',
		'friday': 'vendredi',
		'saturday': 'samedi',
		'jan': 'janv.',
		'feb': 'fév.',
		'mar': 'mars',
		'apr': 'avr.',
		'may': 'mai',
		'jun': 'juin',
		'jul': 'juill.',
		'aug': 'août',
		'sep': 'sept.',
		'oct': 'oct.',
		'nov': 'nov.',
		'dec': 'déc.',
		'january': 'janvier',
		'february': 'février',
		'march': 'mars',
		'april': 'avril',
		'may_long': 'mai',
		'june': 'juin',
		'july': 'juillet',
		'august': 'août',
		'september': 'septembre',
		'october': 'octobre',
		'november': 'novembre',
		'december': 'décembre',
		'january-gen': 'janvier',
		'february-gen': 'février',
		'march-gen': 'mars',
		'april-gen': 'avril',
		'may-gen': 'mai',
		'june-gen': 'juin',
		'july-gen': 'juillet',
		'august-gen': 'août',
		'september-gen': 'septembre',
		'october-gen': 'octobre',
		'november-gen': 'novembre',
		'december-gen': 'décembre',
		'parentheses': '($1)',
		'parentheses-start': '(',
		'parentheses-end': ')',
		'word-separator': ' ',
		'comma-separator': ', ',
		'colon-separator': ' : ',
		'nextdiff': 'Modification suivante →',
		'timezone-utc': 'UTC',
		'pagetitle': '$1 — {{SITENAME}}',
		'discussiontools-topicsubscription-button-subscribe': 's’abonner',
		'discussiontools-topicsubscription-button-subscribe-tooltip': '{{GENDER:|}}Abonnez-vous pour recevoir les notifications sur les nouveaux commentaires.',
		'discussiontools-topicsubscription-button-unsubscribe': 'se désabonner',
		'discussiontools-topicsubscription-button-unsubscribe-tooltip': '{{GENDER:|}}Désabonnez-vous pour arrêter de recevoir les notifications pour de nouveaux commentaires.',
		'discussiontools-topicsubscription-notify-subscribed-title': 'Vous êtes abonné{{GENDER:||e}} !',
		'discussiontools-topicsubscription-notify-subscribed-body': '{{GENDER:|}}Vous recevrez des notifications sur les nouveaux commentaires sur ce sujet.',
		'discussiontools-topicsubscription-notify-unsubscribed-title': 'Vous êtes désabonné{{GENDER:||e}}.',
		'discussiontools-topicsubscription-notify-unsubscribed-body': '{{GENDER:|}}Vous ne recevrez plus de notifications sur les nouveaux commentaires sur ce sujet.',
		'discussiontools-newtopicssubscription-button-subscribe-label': 'S’abonner',
		'discussiontools-newtopicssubscription-button-subscribe-tooltip': 'Abonnez-vous pour recevoir des notifications lorsque de nouveaux sujets sont lancés sur cette page.',
		'discussiontools-newtopicssubscription-button-unsubscribe-label': 'Se désabonner',
		'discussiontools-newtopicssubscription-button-unsubscribe-tooltip': 'Désabonnez-vous pour ne plus recevoir de notifications lorsque de nouveaux sujets sont lancés sur cette page.',
		'discussiontools-newtopicssubscription-notify-subscribed-title': 'Vous êtes abonné{{GENDER:||e}} !',
		'discussiontools-newtopicssubscription-notify-subscribed-body': '{{GENDER:|}}Vous recevrez des notifications lorsque de nouveaux sujets seront lancés sur cette page.',
		'discussiontools-newtopicssubscription-notify-unsubscribed-title': 'Vous êtes désabonné{{GENDER:||e}}.',
		'discussiontools-newtopicssubscription-notify-unsubscribed-body': '{{GENDER:|}}Vous ne recevrez plus de notifications lorsque de nouveaux sujets sont lancés sur cette page.',
		'visualeditor-educationpopup-dismiss': 'C’est bon, allons-y'
	},
	'specialPageAliases': {
		'Contributions': 'Contributions',
		'Diff': 'Diff',
		'PermanentLink': 'Lien_permanent'
	},
	'timezone': 'Europe/Paris',
	'useGlobalPreferences': true,
	'unsignedTemplates': [
		'Non signé',
		'Cns',
		'Sans signature',
		'Non-signé',
		'Unsigned',
		'Non signe',
		'Nonsigné',
		'NS',
		'Non signé2',
		'Non signé 2',
		'Unsigned2'
	],
	'pairQuoteTemplates': [
		[
			'Début citation bloc',
			'Début de citation',
			'Citation début',
			'Début citation'
		],
		[
			'Fin citation bloc',
			'Fin de citation',
			'Fin citation'
		]
	],
	'outdentTemplates': [
		'retour indentation',
		'RI',
		'Retour chariot',
		'RI:',
		'Ri',
		'Outdent'
	],
	'clearTemplates': [
		'Clear'
	],
  elementsToExcludeClasses: [
    'NavFrame',
  ],
	'signatureEndingRegexp': / \(discuter\)/
};

let styles;
mw.hook('convenientDiscussions.beforeParse').add(function () {
  if (!styles) {
    styles = mw.util.addCSS('\
.sitedir-ltr #mw-content-text .cd-commentLevel:not(ol) > dd,\
.sitedir-ltr #mw-content-text .cd-commentLevel:not(ol) > li,\
.sitedir-rtl #mw-content-text .mw-content-ltr .cd-commentLevel:not(ol) > dd,\
.sitedir-rtl #mw-content-text .mw-content-ltr .cd-commentLevel:not(ol) > li {\
  padding-left: 1em;\
  padding-right: 0;\
  margin-left: 1em;\
  margin-right: 0;\
}\
\
.skin-vector #mw-content-text .cd-parsed dd,\
.skin-vector #mw-content-text .cd-parsed li,\
.skin-vector #mw-content-text .cd-parsed ol > li.cd-comment-part-last.cd-comment-part-last {\
  margin-bottom: 0.14285714em;\
}\
\
.cd-reformattedComments #mw-content-text .cd-comment-part-first {\
  margin-top: 0.75em;\
}\
\
#mw-content-text .cd-comment-part-first {\
  margin-top: 0.5em;\
}\
\
.ns-talk #mw-content-text#mw-content-text dl {\
  border-top: 0;\
  border-left: 0;\
  padding-top: 0;\
  padding-left: 0;\
  margin-left: 0;\
  background: none;\
}\
\
#mw-content-text#mw-content-text .cd-replyButtonWrapper {\
  margin-top: 0.5em;\
}\
');
  }
});
