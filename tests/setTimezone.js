/**
 * Set the timezone for your node.js process across all OSes.
 *
 * Source: https://github.com/capaj/set-tz (modified by Jack who built the house)
 *
 * @author Jiri Spac
 * @author Jack who built the house
 * @license MIT
 */

const execSync = require('child_process').execSync;
const os = require('os');

const ianaWin = require('windows-iana');
const chalk = require('chalk');

const warning = (text) => {
  console.warn(chalk.bgYellowBright(text));
};

const success = (text) => {
  console.log(chalk.bgGreenBright(text));
};

module.exports = (TZ) => {
  let winTz;
  let ianaTz;
  if (TZ !== 'UTC') {
    winTz = ianaWin.findWindows(TZ);
    ianaTz = ianaWin.findIana(TZ)[0];

    if (!winTz && !ianaTz) {
      throw new Error(`The timezone "${TZ}" does not exist. Please provide a valid Windows or IANA timezone.`);
    }
  }

  if (os.platform() === 'win32') {
    const previousTZ = execSync('tzutil /g').toString();
    execSync(`tzutil /s "${winTz || TZ}"`);
    warning(`\nThe system timezone has been changed. If the process is killed, run manually to restore it: tzutil /s "${previousTZ}"`);

    process.on('exit', () => {
      execSync(`tzutil /s "${previousTZ}"`);
      success(`\nThe system timezone has been restored.`);
    });
    process.on('SIGINT', function() {
      process.exit(2);
    });
  } else {
    process.env.TZ = ianaTz || TZ;
  }
}
