mw.loader.using(['mediawiki.ForeignApi', 'mediawiki.Title']).then(async () => {
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
    'colon-separator',
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
    siprop: ['specialpagealiases', 'general'],
  });
  siteInfoResp.query.specialpagealiases.some((alias) => {
    if (alias.realname === 'Contributions') {
      config.contribsPage = mw.config.get('wgFormattedNamespaces')[-1] + ':' + alias.aliases[0];
      return true;
    }
  });
  config.localTimezoneOffset = siteInfoResp.query.general.timeoffset;

  const idsToProps = {
    Q5573785: 'unsigned',
    Q10825134: 'unsignedIp',
    Q21997241: 'paragraph',
    Q45130993: 'smallDiv',
    Q6582792: 'blockquotetop',
    Q6721200: 'blockquotebottom',
    Q6388481: 'movedFrom',
    Q11102202: 'movedTo',
  };

  const foreignApi = new mw.ForeignApi('https://www.wikidata.org/w/api.php');
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
  redirectsResp.query.pages.forEach((page) => {
    if (!page.redirects) return;

    const prop = Object.keys(titles)
      .find((prop) => titles[prop][0].getPrefixedText() === page.title);

    // Should always be the case logically
    if (prop) {
      titles[prop].push(...page.redirects.map((redirect) => mw.Title.newFromText(redirect.title)));
    }
  });

  config.unsignedTemplates = (
    (titles.unsigned || titles.unsignedIp) &&
    (titles.unsigned || [])
      .concat(titles.unsignedIp || [])
      .map((title) => title.getMainText())
  );
  config.paragraphTemplates = (
    titles.paragraph &&
    titles.paragraph.map((title) => title.getMainText())
  );
  config.smallDivTemplate = titles.smallDiv && titles.smallDiv[0].getMainText();
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

  console.log(JSON.stringify(config, null, '\t'));
});
