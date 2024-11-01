const fs = require('fs');
const { exec } = require('child_process');

const argv = require('yargs').argv;
const Mw = require('nodemw');
const chalk = require('chalk');
const prompts = require('prompts');
require('json5/lib/register.js');

const config = require('./config.json5');
const { unique } = require('./misc/utils.js');
const getUrl = require('./misc/utils.js').getUrl;

/*
  node deploy --test
  npm run deploy --test
 */
const test = Boolean(argv.test || process.env.npm_config_test);

const noI18n = Boolean(argv.noi18n || process.env.npm_config_noi18n);
const noConfigs = Boolean(argv.noconfigs || process.env.npm_config_noconfigs);
const i18nOnly = Boolean(argv.i18nonly || process.env.npm_config_i18nonly);
const configsOnly = Boolean(argv.configsonly || process.env.npm_config_configsonly);
const debug = Boolean(argv.debug || process.env.npm_config_debug);
const dryRun = Boolean(argv['dry-run'] || process.env.npm_config_dry_run);

const warning = (text) => {
  console.log(chalk.yellowBright(text));
};
const error = (text) => {
  throw chalk.red(text);
};
const success = (text) => {
  console.log(chalk.green(text));
};
const code = chalk.inverse;
const keyword = chalk.cyan;
const important = chalk.greenBright;

if (!config) {
  error(`Config is missing in ${keyword(config.json5)}`);
}

if (!config.main) {
  error(`Data related to the main build (in the "main" property) is missing in ${keyword(config.json5)}`);
}

if (!config.main.rootPath) {
  error(`${keyword('rootPath')} is missing in ${keyword(config.json5)}`);
}

const pathPrefix = config.main.rootPath + '/';

const assets = config.main.assets?.[test ? 'test' : 'default'];
if (!assets || !Array.isArray(assets) || !assets.length) {
  error(`File list is not found in ${keyword('config.json5')}`);
}

const configAssets = config.configs.flatMap((configForConfig) => {
  const configForMode = configForConfig[test ? 'test' : 'default'];
  if (!configForMode) {
    return [];
  }
  return [{
    server: configForConfig.server,
    source: `convenientDiscussions-config/${configForMode.source}`,
    target: configForMode.target,
  }].concat(
    configForMode.target2 ?
      {
        server: configForConfig.server,
        source: `convenientDiscussions-config/${configForMode.source}`,
        target: configForMode.target2,
      } :
      [],
    configForMode.editGadgetsDefinition ?
      {
        server: configForConfig.server,
        target: 'MediaWiki:Gadgets-definition',
        modules: configForMode.modules,
      } :
      []
  );
});

let version;
if (process.env.CI) {
  // HTTP proxy to use with the http-proxy-to-socks module, while the SOCKS proxy is created by the
  // `ssh -D [port]` command as part of the SSH tunnel to Toolforge.
  config.proxy = 'http://localhost:8080';

  const eventJson = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));

  // Will be undefined if the event is workflow_dispatch.
  version = eventJson.release?.tag_name;
}

const clients = {
  [config.main.server]: new Mw({
    protocol: config.protocol,
    server: config.main.server,
    path: config.scriptPath,
    proxy: config.proxy,
    debug,
  }),
  ...config.configs.reduce((obj, configForConfig) => {
    obj[configForConfig.server] = new Mw({
      protocol: configForConfig.protocol || config.protocol,
      server: configForConfig.server,
      path: configForConfig.scriptPath || config.scriptPath,
      proxy: config.proxy,
      debug,
    });
    return obj;
  }, {}),
};

let branch;
let commits;
let newCommitsCount;
let newCommitsSubjects;
let edits;
let credentials;
let credentialsResponse;
let servers;

if (configsOnly) {
  prepareEdits();
} else {
  exec(
    'git rev-parse --abbrev-ref HEAD && git log -n 1000 --pretty=format:"%h%n%s%nrefs: %D%n" --abbrev=8',
    parseCmdOutput
  );
}

function parseCmdOutput(err, stdout, stderr) {
  if (stdout === '') {
    error('parseCmdOutput(): This does not look like a git repo');
  }

  if (stderr) {
    error(stderr);
  }

  branch = stdout.slice(0, stdout.indexOf('\n'));
  stdout = stdout.slice(stdout.indexOf('\n') + 1);
  commits = stdout
    .split('\n\n')
    .map((line) => {
      const [, hash, subject, refs] = line.match(/^(.+)\n(.+)\n(.+)/);
      const [, tag] = refs.match(/tag: ([^,]+)/) || [null, null];
      return { hash, subject, tag };
    });

  requestComments();
}

function requestComments() {
  clients[config.main.server].api.call(
    {
      action: 'query',
      titles: pathPrefix + assets[0],
      prop: 'revisions',
      rvprop: ['comment'],
      rvlimit: 50,
      formatversion: 2,
    },
    (e, info) => {
      if (e) {
        error(e);
      }
      const revisions = info?.pages?.[0]?.revisions || [];
      if (revisions.length || info?.pages?.[0]?.missing) {
        getLastDeployedCommit(revisions);
      } else {
        console.log('Couldn\'t load the revisions data');
      }
    }
  );
}

function getLastDeployedCommit(revisions) {
  let lastDeployedCommit;
  let lastDeployedVersion;
  revisions.some((revision) => {
    [, lastDeployedCommit] = revision.comment.match(/[uU]pdate to ([0-9a-f]{8})(?= @ )/) || [];
    [, lastDeployedVersion] = revision.comment.match(/[uU]pdate to (v\d+\.\d+\.\d+\b)/) || [];
    return lastDeployedCommit || lastDeployedVersion;
  });
  if (lastDeployedCommit || lastDeployedVersion) {
    newCommitsCount = commits.findIndex((commit) => (
      commit.hash === lastDeployedCommit ||
      commit.tag === lastDeployedVersion
    ));
    if (newCommitsCount === -1) {
      newCommitsCount = 0;
    }
    newCommitsSubjects = commits
      .slice(0, newCommitsCount)
      .map((commit) => commit.subject)
      .filter((commit) => (
        !/^(Merge branch|Merge pull request|Localisation updates|deploy:|build:|configs?:|tests?:|jsdoc:|chore:|docs:|i18n:)/.test(commit)
      ));
    newCommitsCount = newCommitsSubjects.length;
  }

  prepareEdits();
}

function cutContent(content) {
  return content.slice(0, 300) + (content.length > 300 ? '...' : '');
}

function getMainEdits() {
  return configsOnly ?
    [] :
    assets
      .flatMap((file) => {
        if (noI18n && file.endsWith('i18n/') || i18nOnly && !file.endsWith('i18n/')) {
          return [];
        }
        if (file.endsWith('/')) {
          return fs.readdirSync(`./dist/${file}`).map((fileInDir) => file + fileInDir);
        }
        return file;
      })
      .map((file, i) => {
        let content;
        try {
          content = fs.readFileSync(`./dist/${file}`, 'utf8');
        } catch (e) {
          error(`Asset is not found: ${keyword(file)}`);
        }

        if (!file.includes('i18n/')) {
          const [tildesMatch] = content.match(/~~~~.{0,100}/) || [];
          const [substMatch] = content.match(/\{\{(safe)?subst:.{0,100}/) || [];
          const [nowikiMatch] = (
            content
              // Ignore the "// </nowiki>" piece, added from the both sides of the build.
              .replace(/\/(?:\*!?|\/) <\/nowiki>/g, '')
              .match(/<\/nowiki>.{0,100}/) ||
            []
          );
          if (tildesMatch || substMatch) {
            const snippet = code(tildesMatch || substMatch);
            if (nowikiMatch) {
              error(`${keyword(file)} contains illegal strings (tilde sequences or template substitutions) that may break the code when saving to the wiki:\n${snippet}\nWe also can't use "${code('// <nowiki>')}" in the beginning of the file, because there are "${code('</nowiki')}" strings in the code that would limit the scope of the nowiki tag.\n`);
            } else {
              warning(`Note that ${keyword(file)} contains illegal strings (tilde sequences or template substitutions) that may break the code when saving to the wiki:\n${snippet}\n\nThese strings will be neutralized by using "${code('// <nowiki>')}" in the beginning of the file this time though.\n`);
            }
          }
          if (nowikiMatch) {
            warning(`Note that ${keyword(file)} contains the "${code('</nowiki')}" string that will limit the scope of the nowiki tag that we put in the beginning of the file:\n${code(nowikiMatch)}\n`);
          }
        }

        const pluralize = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

        const commitString = `${commits[0].hash} @ ${branch}`;
        let summary = process.env.CI ?
          `Automatically update to ${version || commitString}` :
          `Update to ${commitString}`;
        if (i === 0 && newCommitsCount) {
          summary += `. ${pluralize(newCommitsCount, 'commit')}: ${newCommitsSubjects.join('. ')}`;
        }

        return {
          server: config.main.server,
          title: pathPrefix + file,
          url: getUrl(config.main.server, pathPrefix + file),
          content,
          contentSnippet: cutContent(content),
          summary,
        };
      });
}

async function getConfigsEdits() {
  if (noConfigs || i18nOnly) {
    return [];
  }
  const assetsWithGadgetsDefinition = configAssets
    .filter((asset) => asset.target === 'MediaWiki:Gadgets-definition');
  (await Promise.all(
    assetsWithGadgetsDefinition.map((asset) => (
      new Promise((resolve, reject) => {
        clients[asset.server].getArticle(asset.target, (err, data) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(data);
        });
      })
    ))
  )).forEach((content, i) => {
    const asset = assetsWithGadgetsDefinition[i];
    const modulesString = asset.modules.join(', ');

    // Make sure we don't break anything in MediaWiki:Gadgets-definition.
    const illegalMatch = modulesString.match(/[^a-z., -]/ig);
    if (illegalMatch) {
      const matchesString = illegalMatch.map((char) => code(char)).join(' ');
      error(`Modules string for ${keyword(asset.target)} contains illegal characters: ${matchesString}`);
    }

    asset.content = content.replace(
      /^(\* *convenientDiscussions *\[.*dependencies *= *)[^|\]]*?( *[|\]])/m,
      (s, before, after) => before + modulesString + after
    );
  });
  return configAssets.map((asset) => {
    const content = asset.content || fs.readFileSync(`./dist/${asset.source}`, 'utf8');
    return {
      server: asset.server,
      title: asset.target,
      url: getUrl(asset.server, asset.target),
      content,
      contentSnippet: cutContent(content),
      summary: asset.target === 'MediaWiki:Gadgets-definition' ?
        'Automatically update Convenient Discussions dependencies' :
        'Automatically update',
    };
  });
}

function createEditOverview(edit) {
  const byteLength = (text) => (new TextEncoder().encode(text)).length;
  return (
    `${keyword('URL:')} ${edit.url}\n` +
    `${keyword('Edit summary:')} ${edit.summary}\n` +
    `${keyword(`Content (${important(byteLength(edit.content).toLocaleString() + ' bytes')}):`)} ${code(edit.contentSnippet)}\n`
  );
}

async function prepareEdits() {
  edits = getMainEdits().concat(await getConfigsEdits());
  const overview = edits.map(createEditOverview).join('\n');
  console.log(`Gonna make these edits:\n\n${overview}`);

  if (dryRun) return;

  if (process.env.CI) {
    logInToServers();
  } else {
    const { confirm } = await prompts({
      type: 'confirm',
      name: 'confirm',
      message: 'Proceed?',
    });

    if (confirm) {
      logInToServers();
    }
  }
}

async function logInToServers() {
  servers = edits.map((edit) => edit.server).filter(unique);
  loginToNextServer();
}

function loginToNextServer() {
  const server = servers.shift();
  if (server) {
    logIn(server);
  } else {
    success('The files have been successfully deployed');
  }
}

async function logIn(server) {
  const callback = (err) => {
    if (err) {
      error(err);
    }
    deploy(server);
  }

  if (process.env.CI) {
    clients[server].logIn(process.env.USERNAME, process.env.PASSWORD, callback);
  } else {
    credentials ||= fs.existsSync('./credentials.json5') ? require('./credentials.json5') : {};
    if (credentials.username && credentials.password) {
      clients[server].logIn(credentials.username, credentials.password, callback);
    } else {
      if (!credentialsResponse) {
        console.log(`User name and/or password were not found in ${keyword('credentials.json5')}`);
        credentialsResponse = await prompts([
          {
            type: 'text',
            name: 'username',
            message: 'Wikimedia user name',
            validate: (value) => Boolean(value),
          },
          {
            type: 'invisible',
            name: 'password',
            message: 'Password',
            validate: (value) => Boolean(value),
          },
        ]);
      }

      // Ctrl+C leaves the password unspecified.
      if (credentialsResponse.password) {
        clients[server].logIn(credentialsResponse.username, credentialsResponse.password, callback);
      }
    }
  }
}

function deploy(server) {
  editNext(edits.filter((edit) => edit.server === server));
}

function editNext(serverEdits) {
  const edit = serverEdits.shift();
  if (edit) {
    clients[edit.server].edit(edit.title, edit.content, edit.summary, (e, info) => {
      if (e) {
        error(e);
      }
      if (info && info.result === 'Success') {
        if (info.nochange === undefined) {
          success(`Successfully edited ${edit.url} (edit timestamp: ${new Date(info.newtimestamp).toUTCString()})`);
        } else {
          success(`No changes in ${edit.url}`);
        }
        editNext(serverEdits);
      } else {
        throw [chalk.red('Unknown error'), info];
      }
    });
  } else {
    loginToNextServer();
  }
}
