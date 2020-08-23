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

const warning = (text) => console.log(chalk.yellowBright(text));
const error = (text) => console.log(chalk.red(text));
const success = (text) => console.log(chalk.green(text));
const code = chalk.inverse;
const keyword = chalk.cyan;
const important = chalk.greenBright;

if (!config?.rootPath) {
  error(`${keyword('rootPath')} is missing in ${keyword(config.json5)}.`)
  return;
}

if (config.rootPath[config.rootPath.length - 1] !== '/') {
  error(`${keyword('rootPath')} should end with "${code('/')}".`);
  return;
}

const files = config?.distFiles?.[dev ? 'dev' : 'default'];
if (!files || !Array.isArray(files) || !files.length) {
  error(`File list not found in ${keyword('config.json5')}.`);
  return;
}

files.forEach((file, i) => {
  if (file.endsWith('/')) {
    files.splice(i, 1, ...fs.readdirSync(`./dist/${file}`).map((fileInDir) => file + fileInDir));
  }
});

const client = new Mw({
  protocol: config.protocol,
  server: config.server,
  path: config.scriptPath,
  debug: false,
});

let branch;
let commits;
let newCommitsCount;
let newCommitsSubjects;
let edits = [];

exec('git rev-parse --abbrev-ref HEAD && git log --pretty=format:"%h %s"', parseCmdOutput);

function parseCmdOutput(err, stdout, stderr) {
  if (stdout === '') {
    error('This does not look like a git repo.');
    return;
  }

  if (stderr) {
    error(stderr);
    return;
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
      titles: config.rootPath + files[0],
      prop: 'revisions',
      rvprop: ['comment'],
      rvlimit: 50,
      formatversion: 2,
    },
    (e, info) => {
      if (e) {
        error(e);
        return;
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
        return;
      } else {
        warning(`Note that ${keyword(file)} contains illegal strings (tilde sequences or template substitutions) that may break the code when saving to the wiki:\n${snippet}\n\nThese strings will be neutralized by using "${code('// <nowiki>')}" in the beginning of the file this time though.\n`);
      }
    }
    if (nowikiMatch) {
      warning(`Note that ${keyword(file)} contains the "${code('</nowiki')}" string that will limit the scope of the nowiki tag that we put in the beginning of the file:\n${code(nowikiMatch)}\n`);
    }

    const pluralize = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

    let summary = `Update to ${commits[0].hash} @ ${branch}`;
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
      return;
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
        return;
      }
      if (info && info.result === 'Success') {
        if (info.nochange === undefined) {
          success(`Successfully edited ${important(edit.title)}. Edit timestamp: ${new Date(info.newtimestamp).toUTCString()}.`);
        } else {
          success(`No changes in ${important(edit.title)}.`);
        }
        editNext();
      } else {
        error('Unknown error', info);
      }
    });
  } else {
    success('The files have been successfully deployed.');
  }
}
