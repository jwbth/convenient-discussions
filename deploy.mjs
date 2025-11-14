import { exec } from 'node:child_process';
import fs from 'node:fs';

import chalk from 'chalk';
import Mw from 'nodemw';
// https://github.com/import-js/eslint-plugin-import/issues/1594
// eslint-disable-next-line import/no-named-as-default
import prompts from 'prompts';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import config from './config.mjs';
import { getUrl, unique } from './misc/utils.mjs';

const argv = /** @type {YargsNonAwaited} */ (yargs(hideBin(process.argv)).argv);

/*
  node deploy --test
  npm run deploy --test
 */
export const test = Boolean(argv.test || process.env.npm_config_test);

const noI18n = Boolean(argv.noi18n || process.env.npm_config_noi18n);
// eslint-disable-next-line no-one-time-vars/no-one-time-vars
const noConfigs = Boolean(argv.noconfigs || process.env.npm_config_noconfigs);
const i18nOnly = Boolean(argv.i18nonly || process.env.npm_config_i18nonly);
const configsOnly = Boolean(argv.configsonly || process.env.npm_config_configsonly);
const debug = Boolean(argv.debug || process.env.npm_config_debug);
// eslint-disable-next-line no-one-time-vars/no-one-time-vars
const dryRun = Boolean(argv['dry-run'] || process.env.npm_config_dry_run);

/**
 * @param {string} text
 */
const warning = (text) => {
  console.log(chalk.yellowBright(text));
};
/**
 * @param {string} text
 * @returns {Error}
 */
const error = (text) => new Error(chalk.red(text));
/**
 * @param {string} text
 */
const success = (text) => {
  console.log(chalk.green(text));
};
const code = chalk.inverse;
const keyword = chalk.cyan;
// eslint-disable-next-line no-one-time-vars/no-one-time-vars
const important = chalk.greenBright;

if (!('main' in config)) {
  throw error(`Data related to the main build (in the "main" property) is missing in ${keyword('config.js')}`);
}

if (!('rootPath' in config.main)) {
  throw error(`${keyword('rootPath')} is missing in ${keyword('config.js')}`);
}

const pathPrefix = config.main.rootPath + '/';

const assets = 'assets' in config.main ? config.main.assets[test ? 'test' : 'default'] : undefined;
if (!assets || !Array.isArray(assets) || !assets.length) {
  throw error(`File list is not found in ${keyword('config.js')}`);
}

/**
 * @typedef {object} Asset
 * @property {string} server
 * @property {string} [source]
 * @property {string} target
 * @property {string[]} [modules]
 * @property {string} [content]
 */

const configAssets = config.configs.flatMap((wikiConfig) => {
  const wikiConfigForMode = wikiConfig[test ? 'test' : 'default'];
  if (!wikiConfigForMode) {
    return [];
  }

  return /** @type {Asset[]} */ (wikiConfigForMode.targets.map((target) => ({
    server: wikiConfig.server,
    source: `convenientDiscussions-config/${wikiConfigForMode.source}`,
    target,
  }))).concat(
    wikiConfigForMode.editGadgetsDefinition
      ? [{
          server: wikiConfig.server,
          modules: wikiConfigForMode.modules,
          target: 'MediaWiki:Gadgets-definition',
        }]
      : [],
  );
});

/** @type {string} */
let version;
if (process.env.CI) {
  // HTTP proxy to use with the http-proxy-to-socks module, while the SOCKS proxy is created by the
  // `ssh -D [port]` command as part of the SSH tunnel to Toolforge.
  config.proxy = 'http://localhost:8080';

  // eslint-disable-next-line no-one-time-vars/no-one-time-vars
  const eventJson = JSON.parse(
    fs.readFileSync(/** @type {string} */ (process.env.GITHUB_EVENT_PATH), 'utf8')
  );

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
  ...config.configs.reduce((obj, wikiConfig) => {
    obj[wikiConfig.server] = new Mw({
      protocol: 'protocol' in wikiConfig ? wikiConfig.protocol : config.protocol,
      server: wikiConfig.server,
      path: 'scriptPath' in wikiConfig ? wikiConfig.scriptPath : config.scriptPath,
      proxy: config.proxy,
      debug,
    });

    return obj;
  }, /** @type {{ [x: string]: Mw }} */ ({})),
};

/**
 * @typedef {{
 *   hash: string;
 *   subject: string;
 *   tag?: string;
 * }} Commit
 */

/**
 * @typedef {{
 *   server: string;
 *   title: string;
 *   url: string;
 *   content: string;
 *   contentSnippet: string;
 *   summary: string;
 * }} Edit
 */

/**
 * @typedef {object} Credentials
 * @property {string} username
 * @property {string} password
 */

/** @type {string} */
let branch;
/** @type {Commit[]} */
let commits;
/** @type {number} */
let newCommitsCount;
/** @type {string[]} */
let newCommitsSubjects;
/** @type {Edit[]} */
let edits;
/** @type {Credentials | undefined} */
let credentials;
/** @type {Credentials | undefined} */
let credentialsResponse;
/** @type {string[]} */
let servers;

if (configsOnly) {
  prepareEdits();
} else {
  exec(
    'git rev-parse --abbrev-ref HEAD && git log -n 1000 --pretty=format:"%h%n%s%nrefs: %D%n" --abbrev=8',
    parseCmdOutput,
  );
}

/**
 * @type {(error: import('node:child_process').ExecException | null, stdout: string, stderr: string) => void}
 */
function parseCmdOutput(_err, stdout, stderr) {
  if (stdout === '') {
    throw error('parseCmdOutput(): This does not look like a git repo');
  }

  if (stderr) {
    throw error(stderr);
  }

  branch = stdout.slice(0, stdout.indexOf('\n'));
  stdout = stdout.slice(stdout.indexOf('\n') + 1);
  commits = stdout
    .split('\n\n')
    .map((line) => {
      const match = line.match(/^(.+)\n(.+)\n(.+)/);
      if (!match) {
        throw error(`Can't parse the output of a command`);
      }
      const [, hash, subject, refs] = match;

      return {
        hash,
        subject,
        tag: ((/tag: ([^,]+)/.exec(refs)) || [])[1],
      };
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
    (error, info) => {
      if (error) {
        throw error(error);
      }
      const revisions = info?.pages?.[0]?.revisions || [];
      if (revisions.length || info?.pages?.[0]?.missing) {
        getLastDeployedCommit(revisions);
      } else {
        console.log('Couldn\'t load the revisions data');
      }
    },
  );
}

/**
 *
 * @param {Revision<['comment']>[]} revisions
 */
function getLastDeployedCommit(revisions) {
  const lastDeployedCommitOrVersion = revisions
    .map(
      (revision) =>
        ((/[uU]pdate to (?:([0-9a-f]{8})(?= @ )|v\d+\.\d+\.\d+\b)/.exec(revision.comment)) || [])[1]
    )
    .find(Boolean);
  if (lastDeployedCommitOrVersion) {
    newCommitsCount = commits.findIndex((commit) =>
      commit.hash === lastDeployedCommitOrVersion ||
      commit.tag === lastDeployedCommitOrVersion
    );
    if (newCommitsCount === -1) {
      newCommitsCount = 0;
    }
    newCommitsSubjects = commits
      .slice(0, newCommitsCount)
      .map((commit) => commit.subject)
      .filter((commit) => (
        !/^(Merge branch|Merge pull request|Localisation updates|Bump |deploy:|build:|configs?:|tests?:|jsdoc:|chore:|docs:|i18n:)/.test(commit)
      ));
    newCommitsCount = newCommitsSubjects.length;
  }

  prepareEdits();
}

/**
 * Keep only the first 300 characters of content.
 *
 * @param {string} content
 * @param {number} [n]
 * @returns {string}
 */
function cutContent(content, n = 300) {
  return content.slice(0, n) + (content.length > n ? '...' : '');
}

function getMainEdits() {
  return configsOnly
    ? []
    : assets
        .flatMap((file) => {
          if ((noI18n && file.endsWith('i18n/')) || (i18nOnly && !file.endsWith('i18n/'))) {
            return [];
          }

          if (file.endsWith('/')) {
            return fs.readdirSync(`./dist/${file}`).map((fileInDir) => file + fileInDir);
          }

          return file;
        })
        .map((file, i) => {
          /** @type {string} */
          let content;
          try {
            content = fs.readFileSync(`./dist/${file}`, 'utf8');
          } catch {
            throw error(`Asset is not found: ${keyword(file)}`);
          }

          if (!file.includes('i18n/')) {
            const [tildesMatch] = content.match(/~~~~.{0,100}/) || [];
            const [substMatch] = content.match(/\{\{(safe)?subst:.{0,100}/) || [];
            const [nowikiMatch] =

              content
              // Ignore the "// </nowiki>" piece, added from the both sides of the build.
                .replace(/\/(?:\*!?|\/) <\/nowiki>/g, '')
                .match(/<\/nowiki>.{0,100}/) ||
                [];
            if (tildesMatch || substMatch) {
              const snippet = code(tildesMatch || substMatch);
              if (nowikiMatch) {
                throw error(`${keyword(file)} contains illegal strings (tilde sequences or template substitutions) that may break the code when saving to the wiki:\n${snippet}\nWe also can't use "${code('// <nowiki>')}" in the beginning of the file, because there are "${code('</nowiki')}" strings in the code that would limit the scope of the nowiki tag.\n`);
              } else {
                warning(`Note that ${keyword(file)} contains illegal strings (tilde sequences or template substitutions) that may break the code when saving to the wiki:\n${snippet}\n\nThese strings will be neutralized by using "${code('// <nowiki>')}" in the beginning of the file this time though.\n`);
              }
            }
            if (nowikiMatch) {
              warning(`Note that ${keyword(file)} contains the "${code('</nowiki')}" string that will limit the scope of the nowiki tag that we put in the beginning of the file:\n${code(nowikiMatch)}\n`);
            }
          }

          /**
           * @param {number} count
           * @param {string} word
           * @returns {string}
           */
          const pluralize = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

          const commitString = `${commits[0].hash} @ ${branch}`;
          let summary = process.env.CI
            ? `Automatically update to ${version || commitString}`
            : `Update to ${commitString}`;
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

  const assetsWithGadgetsDefinition = configAssets.filter(
    (asset) => asset.target === 'MediaWiki:Gadgets-definition',
  );
  /** @type {string[]} */
  const contentStrings = await Promise.all(
    assetsWithGadgetsDefinition.map((asset) => (
      new Promise((resolve, reject) => {
        clients[asset.server].getArticle(asset.target, (error, data) => {
          if (error) {
            reject(error);

            return;
          }
          resolve(data);
        });
      })
    )),
  );
  contentStrings.forEach((content, i) => {
    const asset = assetsWithGadgetsDefinition[i];
    const modulesString = /** @type {string[]} */ (asset.modules).join(', ');

    // Make sure we don't break anything in MediaWiki:Gadgets-definition.
    const illegalMatch = modulesString.match(/[^a-z., -]/ig);
    if (illegalMatch) {
      const matchesString = illegalMatch.map((char) => code(char)).join(' ');
      throw error(`Modules string for ${keyword(asset.target)} contains illegal characters: ${matchesString}`);
    }

    asset.content = content.replace(
      /^(\* *convenientDiscussions *\[.*dependencies *= *)[^|\]]*?( *[|\]])/m,
      /** @type {ReplaceCallback<3>} */
      (_s, before, after) => before + modulesString + after
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
      summary: asset.target === 'MediaWiki:Gadgets-definition'
        ? 'Automatically update Convenient Discussions dependencies'
        : 'Automatically update',
    };
  });
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

/**
 * @param {Edit} edit
 * @returns {string}
 */
function createEditOverview(edit) {
  const byteLength = (/** @type {string} */ text) => (new TextEncoder().encode(text)).length;

  return (
    `${keyword('URL:')} ${edit.url}\n` +
    `${keyword('Edit summary:')} ${edit.summary}\n` +
    `${keyword(`Content (${important(byteLength(edit.content).toLocaleString() + ' bytes')}):`)} ${code(edit.contentSnippet)}\n`
  );
}

function logInToServers() {
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

/**
 * @param {string} server
 */
async function logIn(server) {
  const callback = (error) => {
    if (error) {
      throw error(error);
    }
    deploy(server);
  };

  if (process.env.CI) {
    clients[server].logIn(
      /** @type {string} */ (process.env.USERNAME),
      /** @type {string} */ (process.env.PASSWORD),
      callback
    );
  } else {
    credentials ||= fs.existsSync('./credentials.json')
      // @ts-ignore
      // eslint-disable-next-line import/no-unresolved
      ? await import('./credentials.json')
      : undefined;
    if (credentials?.username && credentials.password) {
      clients[server].logIn(credentials.username, credentials.password, callback);
    } else {
      if (!credentialsResponse) {
        console.log(`User name and/or password were not found in ${keyword('credentials.json')}`);
        credentialsResponse = await prompts([
          {
            type: 'text',
            name: 'username',
            message: 'Wikimedia user name',
            validate: Boolean,
          },
          {
            type: 'invisible',
            name: 'password',
            message: 'Password',
            validate: Boolean,
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

/**
 * @param {string} server
 */
function deploy(server) {
  editNext(edits.filter((edit) => edit.server === server));
}

/**
 * @param {Edit[]} serverEdits
 */
function editNext(serverEdits) {
  const edit = serverEdits.shift();
  if (edit) {
    clients[edit.server].edit(edit.title, edit.content, edit.summary, (err, info) => {
      if (err) {
        throw error(err.message);
      }

      if (info && info.result === 'Success') {
        if ('nochange' in info) {
          success(`No changes in ${edit.url}`);
        } else {
          success(`Successfully edited ${edit.url} (edit timestamp: ${new Date(info.newtimestamp).toUTCString()})`);
        }
        editNext(serverEdits);
      } else {
        console.error(info);
        throw error('Unknown error');
      }
    });
  } else {
    loginToNextServer();
  }
}
