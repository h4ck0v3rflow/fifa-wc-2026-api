/**
 * FIFA World Cup 2026 API — Bing Sports Scraper
 *
 * Fetches match data from Bing Sports Details, parses it,
 * and writes structured JSON files to the api/ directory.
 *
 * Usage: node src/scraper.js [--test]
 *   --test    Use saved page.html instead of fetching live
 */

const fs = require('fs');
const path = require('path');
const { parsePage, categorizeMatches } = require('./parser');

const API_DIR = path.join(__dirname, '..', 'api');
const BING_URL = 'https://www.bing.com/sportsdetails?q=fifa%20world%20cup%20live%20scores&sport=Soccer&scenario=League&TimezoneId=null&IANATimezoneId=null&ISOTimezoneKey=null&league=Soccer_InternationalWorldCup&intent=Generic&seasonyear=2026&segment=sports&isl2=true&fromhere=1065294240&form=ANNTA1&';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

async function fetchPage() {
  const response = await fetch(BING_URL, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return await response.text();
}

function readSavedPage() {
  const savedPath = path.join(__dirname, '..', 'page.html');
  if (!fs.existsSync(savedPath)) {
    console.error('No page.html found. Run without --test to fetch live.');
    process.exit(1);
  }
  return fs.readFileSync(savedPath, 'utf-8');
}

function ensureApiDir() {
  if (!fs.existsSync(API_DIR)) {
    fs.mkdirSync(API_DIR, { recursive: true });
  }
}

function writeJson(filename, data) {
  const filePath = path.join(API_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`  ✓ ${filename} (${(Buffer.byteLength(JSON.stringify(data)) / 1024).toFixed(1)} KB)`);
}

async function main() {
  const isTest = process.argv.includes('--test');
  const startTime = Date.now();

  console.log(`🏆 FIFA World Cup 2026 API Scraper\n`);
  console.log(`Mode: ${isTest ? 'TEST (page.html)' : 'LIVE (fetch)'}`);

  // Fetch HTML
  console.log(`\n📡 Fetching page...`);
  const html = isTest ? readSavedPage() : await fetchPage();
  console.log(`   ${(html.length / 1024).toFixed(1)} KB received`);

  // Parse
  console.log(`\n🔍 Parsing match data...`);
  const data = parsePage(html, new Date());
  console.log(`   ${data.matches.length} matches found`);

  // Categorize
  const categorized = categorizeMatches(data.matches);
  console.log(`   ${categorized.finished.length} finished`);
  console.log(`   ${categorized.live.length} live`);
  console.log(`   ${categorized.upcoming.length} upcoming`);

  // Write output files
  console.log(`\n📁 Writing API files...`);
  ensureApiDir();

  writeJson('matches.json', {
    ...data,
    matches: data.matches,
  });

  writeJson('tournament.json', {
    tournament: data.tournament,
    meta: data.meta,
  });

  writeJson('finished.json', {
    tournament: data.tournament,
    matches: categorized.finished,
    meta: data.meta,
  });

  writeJson('live.json', {
    tournament: data.tournament,
    matches: categorized.live,
    meta: data.meta,
  });

  writeJson('upcoming.json', {
    tournament: data.tournament,
    matches: categorized.upcoming,
    meta: data.meta,
  });

  // Write groups.json - group matches together
  const groups = groupMatchesByGroup(categorized.all);
  writeJson('groups.json', {
    tournament: data.tournament,
    groups,
    meta: data.meta,
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✅ Done in ${elapsed}s\n`);
}

/**
 * Group matches by their group/stage
 */
function groupMatchesByGroup(matches) {
  const groups = {};
  for (const match of matches) {
    const key = match.group || 'unknown';
    if (!groups[key]) {
      groups[key] = {
        name: key,
        stage: match.stage,
        matches: [],
      };
    }
    groups[key].matches.push(match);
  }
  return Object.values(groups);
}

main().catch(err => {
  console.error('\n❌ Scraper failed:', err.message);
  process.exit(1);
});
