console.log(`Collecting data for ${location.hostname}…`);

mw.loader.using([
  'mediawiki.util',
  'mediawiki.ForeignApi',
  'mediawiki.Title',
]).then(async () => {
  const config = {
    messages: {},
  };
  const api = new mw.Api();

  const messageNames = [
    'sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat',

    'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',

    'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',

    'january', 'february', 'march', 'april', 'may_long', 'june', 'july', 'august', 'september',
    'october', 'november', 'december',

    'january-gen', 'february-gen', 'march-gen', 'april-gen', 'may-gen', 'june-gen', 'july-gen',
    'august-gen', 'september-gen', 'october-gen', 'november-gen', 'december-gen',

    'timezone-utc', 'parentheses', 'parentheses-start', 'parentheses-end', 'word-separator',
    'comma-separator', 'colon-separator', 'nextdiff',
  ];

  for (let i = 0; i < messageNames.length; i += 50) {
    const nextNames = messageNames.slice(i, i + 50);
    const messages = await api.getMessages(nextNames, {
      amlang: mw.config.get('wgContentLanguage'),
    });
    Object.assign(config.messages, messages);
  }

  const siteInfoResp = await api.get({
    action: 'query',
    meta: 'siteinfo',
    siprop: ['specialpagealiases', 'general', 'extensions', 'magicwords'],
  });

  const contribsPageAliasesObj = siteInfoResp.query.specialpagealiases
    .find((obj) => obj.realname === 'Contributions');
  if (contribsPageAliasesObj) {
    config.contribsPage = (
      mw.config.get('wgFormattedNamespaces')[-1] +
      ':' +
      contribsPageAliasesObj.aliases[0]
    );
  }
  const substAliases = siteInfoResp.query.magicwords
    .find((obj) => obj.name === 'subst')
    ?.aliases
    .map((alias) => alias.toLowerCase())
    .filter((alias) => alias !== 'subst:');
  if (substAliases.length) {
    config.substAliases = substAliases;
  }

  config.timezone = siteInfoResp.query.general.timezone;

  config.useGlobalPreferences = siteInfoResp.query.extensions
    .some((ext) => ext.name === 'GlobalPreferences');

  const idsToProps = {
    Q5573785: 'unsigned',
    Q10684709: 'unsigned2',
    Q10825134: 'unsignedIp',
    Q13108180: 'unsignedIp2',
    Q21997241: 'paragraph',
    Q45130993: 'smallDiv',
    Q6582792: 'blockquotetop',
    Q6721200: 'blockquotebottom',
    Q6388481: 'movedFrom',
    Q11102202: 'movedTo',
    Q6537954: 'closed',
    Q12109489: 'closedEnd',
    Q11317035: 'discussionTop',
    Q6663585: 'discussionBottom',
    Q10809044: 'archiveTop',
    Q11000627: 'hiddenArchiveTop',
    Q13033802: 'hiddenArchiveBottom',
    Q6854033: 'afdTop',
    Q6671179: 'afdBottom',
    Q5841554: 'outdent',
    Q5411705: 'clear',
  };

  const foreignApi = new mw.ForeignApi('https://www.wikidata.org/w/api.php', {
    anonymous: true
  });
  const dbName = mw.config.get('wgDBname');
  const wikidataData = (await foreignApi.get({
    action: 'wbgetentities',
    ids: Object.keys(idsToProps),
    props: 'sitelinks',
    sitefilter: dbName,
  })).entities;

  const titles = {};
  Object.keys(idsToProps)
    .filter((id) => wikidataData[id].sitelinks[dbName])
    .forEach((id) => {
      titles[idsToProps[id]] = [mw.Title.newFromText(wikidataData[id].sitelinks[dbName].title)];
    });

  const redirectsResp = await api.get({
    action: 'query',
    titles: Object.keys(titles).map((prop) => titles[prop][0].getPrefixedText()),
    prop: 'redirects',
    rdlimit: 500,
    formatversion: 2,
  });

  if (redirectsResp.query?.pages) {
    redirectsResp.query.pages.forEach((page) => {
      if (!page.redirects) return;

      const prop = Object.keys(titles)
        .find((prop) => titles[prop][0].getPrefixedText() === page.title);

      // Should always be the case, logically
      if (prop) {
        const titlesToAdd = page.redirects.map((redirect) => mw.Title.newFromText(redirect.title));
        titles[prop].push(...titlesToAdd);
      }
    });
  }

  const getTitleText = (title) => title.getMainText();
  const toLowerCaseFirst = (s) => s.length ? s[0].toLowerCase() + s.slice(1) : '';

  config.unsignedTemplates = (
    (titles.unsigned || titles.unsigned2 || titles.unsignedIp || titles.unsignedIp2) &&
    (titles.unsigned || [])
      .concat(titles.unsigned2 || [], titles.unsignedIp || [], titles.unsignedIp2 || [])
      .map(getTitleText)
  );

  config.pairQuoteTemplates = (
    (titles.blockquotetop || titles.blockquotebottom) &&
    [
      (titles.blockquotetop || []).map(getTitleText),
      (titles.blockquotebottom || []).map(getTitleText),
    ]
  );

  config.smallDivTemplates = titles.smallDiv?.map(getTitleText);
  if (config.smallDivTemplates) {
    config.smallDivTemplates[0] = toLowerCaseFirst(config.smallDivTemplates[0]);
  }

  config.paragraphTemplates = titles.paragraph
    ?.map(getTitleText)
    .sort((title1, title2) => {
      if (title1 === 'Pb') {
        return -1;
      } else if (title2 === 'Pb') {
        return 1;
      } else {
        return 0;
      }
    });
  if (config.paragraphTemplates) {
    config.paragraphTemplates[0] = toLowerCaseFirst(config.paragraphTemplates[0]);
  }

  config.outdentTemplates = titles.outdent?.map(getTitleText);
  if (config.outdentTemplates) {
    config.outdentTemplates[0] = toLowerCaseFirst(config.outdentTemplates[0]);
  }

  config.clearTemplates = titles.clear?.map(getTitleText);

  config.templatesToExclude = (
    (titles.movedFrom || titles.movedTo) &&
    (titles.movedFrom || [])
      .concat(titles.movedTo || [])
      .map(getTitleText)
  );

  const closedTitles = [].concat(
    titles.closed || [],
    titles.discussionTop || [],
    titles.archiveTop || [],
    titles.hiddenArchiveTop || [],
    titles.afdTop || []
  );
  const closedEndTitles = [].concat(
    titles.closedEnd || [],
    titles.discussionBottom || [],
    titles.hiddenArchiveBottom || [],
    titles.afdBottom || []
  );

  config.closedDiscussionTemplates = (
    (closedTitles.length || closedEndTitles.length || undefined) &&
    [closedTitles.map(getTitleText), closedEndTitles.map(getTitleText),]
  );

  const signatureMessage = (await api.getMessages('Signature', {
    amlang: mw.config.get('wgContentLanguage'),
    amincludelocal: 1
  })).Signature;
  const parsedSignature = await api.parse(signatureMessage, { disablelimitreport: true });
  if (!parsedSignature.includes('{{')) {
    const $signature = $(parsedSignature);
    const [, signatureEnding] = $signature.text().trim().match(/.*\$\d+(.{2,})$/) || [];
    if (signatureEnding) {
      config.signatureEndingRegexp = new RegExp(mw.util.escapeRegExp(signatureEnding));
    }
  }

  let output = JSON.stringify(config, null, '\t');
  output = output
    .replace(/'/g, "\\'")
    .replace(/"/g, "'")
    .replace(
      /'signatureEndingRegexp': \{\}/,
      `'signatureEndingRegexp': ${config.signatureEndingRegexp}`
    );

  // When updating this code, update the code in buildConfigs.js as well.
  output = `/**
 * This configuration might get outdated as the script evolves, so it's best to keep it up to date
 * by checking for the generator script and documentation updates from time to time. See the
 * documentation at
 * https://commons.wikimedia.org/wiki/Special:MyLanguage/User:Jack_who_built_the_house/Convenient_Discussions#Configuring_for_a_wiki.
 */

// <nowiki>

(function () {

function unique(item, i, arr) {
  return arr.indexOf(item) === i;
}

function getStrings() {
  const requests = [mw.config.get('wgUserLanguage'), mw.config.get('wgContentLanguage')]
    .filter(unique)
    .filter(function (lang) {
      return lang !== 'en';
    })
    .map(function (lang) {
      return mw.loader.getScript('https://commons.wikimedia.org/w/index.php?title=User:Jack_who_built_the_house/convenientDiscussions-i18n/' + lang + '.js&action=raw&ctype=text/javascript');
    });

  // We assume it's OK to fall back to English if the translation is unavailable for any reason.
  return Promise.all(requests).catch(function () {});
}

window.convenientDiscussions = window.convenientDiscussions || {};
if (convenientDiscussions.config) return;


/* BEGINNING OF THE CONFIGURATION */

convenientDiscussions.config = ${output};

/* END OF THE CONFIGURATION */


if (!convenientDiscussions.isRunning) {
  convenientDiscussions.getStringsPromise = getStrings();
  mw.loader.getScript('https://commons.wikimedia.org/w/index.php?title=User:Jack_who_built_the_house/convenientDiscussions.js&action=raw&ctype=text/javascript')
    .catch(function (e) {
      console.warn('Couldn\\'t load Convenient Discussions.', e);
    });
}

}());

// </nowiki>
`;

  console.log(output);
});
