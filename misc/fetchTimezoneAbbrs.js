// This file is not employed currently, as I (jwbth) currently don't see a way to get timezone
// translations (for example, https://de.wiktionary.org/wiki/Project_talk:Hauptseite/Archiv/2020
// uses "MEZ" which is a translated version of "CET"). Also, Convenient Discussions could be used on
// other wikis than WMF's, where other timezones could be used.

const fs = require('fs');

const fetch = require('node-fetch');
const JSON5 = require('json5');
const { unique } = require('./utils');

async function getZoneToAbbr() {
  const res = await fetch('https://raw.githubusercontent.com/moment/moment-timezone/develop/data/packed/latest.json');
  const body = await res.text();
  const momentTimezoneLatest = JSON.parse(body);
  const zoneToAbbr = {};
  momentTimezoneLatest.zones.forEach((zone) => {
    const tokens = zone.split('|');
    zoneToAbbr[tokens[0]] = tokens[1].split(' ');
  });
  return zoneToAbbr;
}

async function getUsedZones() {
  const res = await fetch('https://noc.wikimedia.org/conf/InitialiseSettings.php.txt');
  const body = await res.text();
  const startNeedle = "'wgLocaltimezone' => ";
  const startIndex = body.indexOf(startNeedle) + startNeedle.length;
  const endNeedle = "],";
  const length = body.slice(startIndex).indexOf(endNeedle) + 1;
  const json = body
    .substr(startIndex, length)
    .replace(/^.+=>/gm, '');
  const timezones = JSON5.parse(json).filter(unique);
  return timezones;
}

async function go() {
  const zoneToAbbr = await getZoneToAbbr();
  const timezones = await getUsedZones();
  const filteredZoneToAbbr = {};
  Object.keys(zoneToAbbr)
    .filter((key) => timezones.includes(key))
    .forEach((key) => {
      filteredZoneToAbbr[key] = zoneToAbbr[key];
    });
  const timezoneAbbrsText = JSON.stringify(filteredZoneToAbbr, null, '\t') + '\n';
  fs.mkdirSync('../data', { recursive: true });
  fs.writeFileSync('../data/timezoneAbbrs.json', timezoneAbbrsText);
  console.log(`Created data/timezoneAbbrs.json with content:\n\n${timezoneAbbrsText}\nLength: ${timezoneAbbrsText.length}`)
}

go();
