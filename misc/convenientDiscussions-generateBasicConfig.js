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

    'parentheses', 'parentheses-start', 'parentheses-end', 'word-separator', 'comma-separator',
    'colon-separator', 'nextdiff',
  ];

  for (let i = 0; i < messageNames.length; i += 50) {
    const nextNames = messageNames.slice(i, i + 50);
    const messages = await api.getMessages(nextNames, {
      amlang: mw.config.get('wgContentLanguage'),
    });
    Object.assign(config.messages, messages);
  }

  const timezoneData = await api.getMessages(undefined, {
    amlang: mw.config.get('wgContentLanguage'),
    amincludelocal: 1,
    amfilter: 'timezone-',
  });
  delete timezoneData['timezone-local'];
  delete timezoneData['timezone-useoffset-placeholder'];
  Object.assign(config.messages, timezoneData);

  const siteInfoResp = await api.get({
    action: 'query',
    meta: 'siteinfo',
    siprop: ['specialpagealiases', 'general', 'extensions'],
  });
  siteInfoResp.query.specialpagealiases.some((alias) => {
    if (alias.realname === 'Contributions') {
      config.contribsPage = mw.config.get('wgFormattedNamespaces')[-1] + ':' + alias.aliases[0];
      return true;
    }
  });
  config.localTimezoneOffset = siteInfoResp.query.general.timeoffset;
  config.useGlobalPreferences = !!siteInfoResp.query.extensions.find(e => e.name === 'GlobalPreferences');

  const idsToProps = {
    Q5573785: 'unsigned',
    Q10825134: 'unsignedIp',
    Q21997241: 'paragraph',
    Q45130993: 'smallDiv',
    Q6582792: 'blockquotetop',
    Q6721200: 'blockquotebottom',
    Q6388481: 'movedFrom',
    Q11102202: 'movedTo',
    Q6537954: 'closed',
    Q12109489: 'closedEnd',
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
    titles: Object.keys(titles)
      .filter((prop) => prop !== 'smallDiv')
      .map((prop) => titles[prop][0].getPrefixedText()),
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

  config.unsignedTemplates = (
    (titles.unsigned || titles.unsignedIp) &&
    (titles.unsigned || [])
      .concat(titles.unsignedIp || [])
      .map((title) => title.getMainText())
  );
  config.paragraphTemplates = titles.paragraph
      ?.map((title) => {
        let titleText = title.getMainText();
        return titleText[0].toLowerCase() + titleText.slice(1);
      })
      .sort((title1, title2) => {
        if (title1 === 'pb') {
          return -1;
        } else if (title2 === 'pb') {
          return 1;
        } else {
          return 0;
        }
      });
  config.smallDivTemplate = titles.smallDiv?.[0].getMainText();
  config.templatesToExclude = (
    (titles.movedFrom || titles.movedTo) &&
    (titles.movedFrom || [])
      .concat(titles.movedTo || [])
      .map((title) => title.getMainText())
  );
  config.pairQuoteTemplates = (
    (titles.blockquotetop || titles.blockquotebottom) &&
    [
      (titles.blockquotetop || []).map((title) => title.getMainText()),
      (titles.blockquotebottom || []).map((title) => title.getMainText()),
    ]
  );
  config.closedDiscussionTemplates = (
    (titles.closed || titles.closedEnd) &&
    [
      (titles.closed || []).map((title) => title.getMainText()),
      (titles.closedEnd || []).map((title) => title.getMainText()),
    ]
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

function getCommonsScript(page) {
  return $.get(
    'https://commons.wikimedia.org/w/api.php?titles=' + encodeURIComponent(page) +
    '&origin=*&uselang=content&maxage=86400&smaxage=86400&format=json&formatversion=2' +
    '&action=query&prop=revisions&rvprop=content&rvlimit=1'
  ).then(function(apiResponse) {
    eval(apiResponse.query.pages[0].revisions[0].content);
  });
}

function getStrings() {
  const requests = [mw.config.get('wgUserLanguage'), mw.config.get('wgContentLanguage')]
    .filter(unique)
    .filter(function (lang) {
      return lang !== 'en';
    })
    .map(function (lang) {
      return getCommonsScript('User:Jack_who_built_the_house/convenientDiscussions-i18n/' + lang + '.js');
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
  getCommonsScript('User:Jack_who_built_the_house/convenientDiscussions.js')
    .catch(function (e) {
      console.warn('Couldn\\'t load Convenient Discussions.', e);
    });
}

}());

// </nowiki>
`;

  console.log(output);
});
