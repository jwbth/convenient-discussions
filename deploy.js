const fs = require('fs');
const { exec } = require('child_process');

const argv = require('yargs').argv;
const Mw = require('nodemw');
const chalk = require('chalk');
const prompts = require('prompts');
require('json5/lib/register.js');

const config = require('./config.json5');
const getUrl = require('./misc/util.js').getUrl;

/*
  node deploy --dev
  npm run deploy --dev
 */
const dev = argv.dev || process.env.npm_config_dev;
const noi18n = argv.noi18n || process.env.npm_config_noi18n;
const i18nonly = argv.i18nonly || process.env.npm_config_i18nonly;
const debug = argv.debug || process.env.npm_config_debug;

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

if (!config?.rootPath) {
  error(`${keyword('rootPath')} is missing in ${keyword(config.json5)}.`);
}

if (config.rootPath[config.rootPath.length - 1] !== '/') {
  error(`${keyword('rootPath')} should end with "${code('/')}".`);
}

const distFiles = config?.distFiles?.[dev ? 'dev' : 'default'];
if (!distFiles || !Array.isArray(distFiles) || !distFiles.length) {
  error(`File list not found in ${keyword('config.json5')}.`);
}

const mainFile = distFiles[0];

const files = [];
distFiles.forEach((file) => {
  if (noi18n && file.endsWith('i18n/') || i18nonly && !file.endsWith('i18n/')) return;
  if (file.endsWith('/')) {
    files.push(...fs.readdirSync(`./dist/${file}`).map((fileInDir) => file + fileInDir));
  } else {
    files.push(file);
  }
});

let version;
if (process.env.CI) {
  // HTTP proxy to use with the http-proxy-to-socks module, while the SOCKS proxy is created by the
  // `ssh -D [port]` command as part of the SSH tunnel to Toolforge.
  config.proxy = 'http://localhost:8080';

  const eventJson = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH));

  // Will be undefined if the event is workflow_dispatch.
  version = eventJson.release?.tag_name;
  version = version && 'v' + version;
}

const client = new Mw({
  protocol: config.protocol,
  server: config.server,
  path: config.scriptPath,
  proxy: config.proxy,
  debug,
});

let branch;
let commits;
let newCommitsCount;
let newCommitsSubjects;
let edits = [];

exec('git rev-parse --abbrev-ref HEAD && git log --pretty=format:"%h %s"', parseCmdOutput);

function parseCmdOutput(err, stdout, stderr) {
  if (stdout === '') {
    error('parseCmdOutput(): This does not look like a git repo.');
  }

  if (stderr) {
    error(stderr);
  }

  const lines = stdout.split('\n');
  branch = lines[0];
  commits = lines.slice(1).map((line) => {
    const [, hash, subject] = line.match(/^([0-9a-f]{7}) (.+)/);
    return { hash, subject };
  });

  requestComments();
}

function requestComments() {
  client.api.call(
    {
      action: 'query',
      titles: config.rootPath + mainFile,
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
        console.log('Couldn\'t load the revisions data.');
      }
    }
  );
}

function getLastDeployedCommit(revisions) {
  let lastDeployedCommit;
  revisions.some((revision) => {
    [lastDeployedCommit] = revision.comment.match(/\b[0-9a-f]{7}(?= @)/) || [];
    return lastDeployedCommit;
  });
  if (lastDeployedCommit) {
    newCommitsCount = commits.findIndex((commit) => commit.hash === lastDeployedCommit);
    if (newCommitsCount === -1) {
      newCommitsCount = 0;
    }
    newCommitsSubjects = commits
      .slice(0, newCommitsCount)
      .map((commit) => commit.subject);
  }

  prepareEdits();
}

async function prepareEdits() {
  files.forEach((file, i) => {
    let content;
    content = fs.readFileSync(`./dist/${file}`).toString();

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
      summary += `. ${pluralize(newCommitsCount, 'new commit')}: ${newCommitsSubjects.join('. ')}`;
    }

    edits.push({
      title: config.rootPath + file,
      url: getUrl(config.rootPath + file),
      content,
      contentSnippet: content.slice(0, 300) + (content.length > 300 ? '...' : ''),
      summary,
    });
  });

  const byteLength = (text) => (new TextEncoder().encode(text)).length;

  const overview = edits
    .map((edit) => (
      `${keyword('Page:')} ${edit.title}\n` +
      `${keyword('URL:')} ${edit.url}\n` +
      `${keyword('Edit summary:')} ${edit.summary}\n` +
      `${keyword(`Content (${important(byteLength(edit.content).toLocaleString() + ' bytes')}):`)} ${code(edit.contentSnippet)}\n`
    ))
    .join('\n');
  console.log(`Gonna make these edits:\n\n${overview}`);

  if (process.env.CI) {
    logIn();
  } else {
    const { confirm } = await prompts({
      type: 'confirm',
      name: 'confirm',
      message: 'Proceed?',
    });

    if (confirm) {
      logIn();
    }
  }
}

async function logIn() {
  const callback = (err) => {
    if (err) {
      error(err);
    }
    deploy();
  }

  if (process.env.CI) {
    client.logIn(process.env.USERNAME, process.env.PASSWORD, callback);
  } else {
    const credentials = fs.existsSync('./credentials.json5') ? require('./credentials.json5') : {};
    if (credentials.username && credentials.password) {
      client.logIn(credentials.username, credentials.password, callback);
    } else {
      console.log(`User name and/or password were not found in ${keyword('credentials.json5')}.`);
      const response = await prompts([
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

      // Ctrl+C leaves the password unspecified.
      if (response.password) {
        client.logIn(response.username, response.password, callback);
      }
    }
  }
}

function deploy() {
  editNext();
}

function editNext() {
  const edit = edits.shift();
  if (edit) {
    client.edit(edit.title, edit.content, edit.summary, (e, info) => {
      if (e) {
        error(e);
      }
      if (info && info.result === 'Success') {
        if (info.nochange === undefined) {
          success(`Successfully edited ${important(edit.title)}. Edit timestamp: ${new Date(info.newtimestamp).toUTCString()}.`);
        } else {
          success(`No changes in ${important(edit.title)}.`);
        }
        editNext();
      } else {
        throw [chalk.red('Unknown error'), info];
      }
    });
  } else {
    success('The files have been successfully deployed.');
  }
}
