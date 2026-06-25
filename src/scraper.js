/**
 * FIFA World Cup 2026 API — Bing Sports Scraper
 *
 * Fetches match data from Bing Sports Details, parses it,
 * enriches with YouTube highlights, and writes JSON API files.
 *
 * Usage:
 *   node src/scraper.js                # Fetch live, scrape, write
 *   node src/scraper.js --test         # Use saved page.html
 *   node src/scraper.js --yt           # + search YouTube for missing highlights
 *   node src/scraper.js --test --yt    # Test mode + YouTube search
 */

const fs = require('fs');
const path = require('path');
const {
  parsePage,
  categorizeMatches,
  buildYouTubeSearchUrl,
  extractFirstYouTubeVideoWithTitle,
} = require('./parser');

const API_DIR = path.join(__dirname, '..', 'api');
const BING_URL = 'https://www.bing.com/sportsdetails?q=fifa%20world%20cup%20live%20scores&sport=Soccer&scenario=League&TimezoneId=null&IANATimezoneId=null&ISOTimezoneKey=null&league=Soccer_InternationalWorldCup&intent=Generic&seasonyear=2026&segment=sports&isl2=true&fromhere=1065294240&form=ANNTA1&';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

// ──────────────────────────────────────────────
//  FETCH HELPERS
// ──────────────────────────────────────────────

async function fetchPage() {
  const response = await fetch(BING_URL, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  return await response.text();
}

function readSavedPage() {
  const p = path.join(__dirname, '..', 'page.html');
  if (!fs.existsSync(p)) {
    console.error('No page.html found. Run without --test to fetch live.');
    process.exit(1);
  }
  return fs.readFileSync(p, 'utf-8');
}

function ensureApiDir() {
  if (!fs.existsSync(API_DIR)) fs.mkdirSync(API_DIR, { recursive: true });
}

function writeJson(filename, data) {
  const fp = path.join(API_DIR, filename);
  fs.writeFileSync(fp, JSON.stringify(data, null, 2));
  console.log(`  ✓ ${filename} (${(Buffer.byteLength(JSON.stringify(data)) / 1024).toFixed(1)} KB)`);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ──────────────────────────────────────────────
//  YOUTUBE HIGHLIGHT ENRICHMENT
// ──────────────────────────────────────────────

/**
 * Search YouTube for matches that still have FIFA recap highlights.
 * Skips matches already converted to YouTube URLs (tracked via previous run).
 * Runs every cron cycle so any match still on FIFA gets another try.
 */
async function enrichWithYouTubeHighlights(matches, previousHighlights = new Map(), { concurrency = 2, delayMs = 1200 } = {}) {
  // Only target matches that still have FIFA.com highlights
  const fifaRecaps = matches.filter(m => {
    if (m.status !== 'finished') return false;
    if (!m.highlights || m.highlights.length === 0) return false;
    const url = m.highlights[0]?.url || '';
    // Skip if already has a YouTube URL (either restored or just-converted)
    if (url.includes('youtube.com') || url.includes('youtu.be')) return false;
    return url.includes('fifa.com');
  });

  if (fifaRecaps.length === 0) {
    console.log(`   ✓ No FIFA recaps left — all converted to YouTube`);
    return;
  }

  console.log(`   Converting ${fifaRecaps.length} FIFA recaps → YouTube...`);

  const queue = [...fifaRecaps];
  let converted = 0;
  let kept = 0;
  let errored = 0;

  async function worker() {
    while (queue.length > 0) {
      const match = queue.shift();
      const searchUrl = buildYouTubeSearchUrl(match);
      const teamStr = `${match.home_team?.name || '?'} vs ${match.away_team?.name || '?'}`;

      try {
        const response = await fetch(searchUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        });
        if (!response.ok) {
          console.log(`   ⚠ HTTP ${response.status}: ${teamStr}`);
          errored++;
          await sleep(delayMs);
          continue;
        }

        const html = await response.text();
        const result = extractFirstYouTubeVideoWithTitle(html, match.home_team?.name, match.away_team?.name);

        if (result) {
          match.highlights = [{
            label: 'Match highlights',
            url: `https://www.youtube.com/watch?v=${result.videoId}`,
            duration: null,
          }];
          console.log(`   ✓ ${teamStr} → youtu.be/${result.videoId}`);
          converted++;
        } else {
          console.log(`   − No YT match, keeping FIFA recap: ${teamStr}`);
          kept++;
        }
      } catch (err) {
        console.log(`   ✗ Error: ${teamStr} — ${err.message}`);
        errored++;
      }

      await sleep(delayMs);
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  console.log(`   YouTube: ${converted} converted, ${kept} kept FIFA, ${errored} errors`);
}

/**
 * Load previous match data and return a Map of matchId → YouTube highlights.
 * Matches still on FIFA recaps are omitted so they get retried.
 */
function loadPreviousHighlights() {
  const fp = path.join(API_DIR, 'matches.json');
  if (!fs.existsSync(fp)) return new Map();
  try {
    const existing = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    const map = new Map();
    for (const m of existing.matches || []) {
      const url = m.highlights?.[0]?.url || '';
      if (url.includes('youtube.com') || url.includes('youtu.be')) {
        map.set(m.id, m.highlights);
      }
    }
    if (map.size > 0) {
      console.log(`   ${map.size} matches previously converted to YouTube`);
    }
    return map;
  } catch {
    return new Map();
  }
}

// ──────────────────────────────────────────────
//  MAIN
// ──────────────────────────────────────────────

async function main() {
  const isTest = process.argv.includes('--test');
  const withYouTube = process.argv.includes('--yt');
  const startTime = Date.now();

  console.log(`🏆 FIFA World Cup 2026 API Scraper\n`);
  console.log(`Mode: ${isTest ? 'TEST (page.html)' : 'LIVE (fetch)'}`);
  if (withYouTube) console.log(`YouTube: ENABLED (converting FIFA recaps → YouTube)`);

  // Fetch HTML
  console.log(`\n📡 Fetching page...`);
  const html = isTest ? readSavedPage() : await fetchPage();
  console.log(`   ${(html.length / 1024).toFixed(1)} KB received`);

  // Parse
  console.log(`\n🔍 Parsing match data...`);
  const data = parsePage(html);
  console.log(`   ${data.matches.length} matches found`);

  // YouTube enrichment — restore previous YouTube URLs, convert remaining FIFA recaps
  if (withYouTube) {
    const previousHighlights = loadPreviousHighlights();
    // Re-apply previously converted YouTube URLs BEFORE searching
    let restored = 0;
    for (const match of data.matches) {
      if (previousHighlights.has(match.id)) {
        match.highlights = previousHighlights.get(match.id);
        restored++;
      }
    }
    if (restored > 0) console.log(`   Restored ${restored} previously-converted YouTube highlights`);

    console.log(`\n🎬 Searching YouTube for remaining FIFA recaps...`);
    await enrichWithYouTubeHighlights(data.matches, previousHighlights, { concurrency: 2, delayMs: 1200 });
  }

  // Categorize
  const categorized = categorizeMatches(data.matches);
  console.log(`\n📊 Summary:`);
  console.log(`   ${categorized.finished.length} finished`);
  console.log(`   ${categorized.live.length} live`);
  console.log(`   ${categorized.upcoming.length} upcoming`);

  // Write files
  console.log(`\n📁 Writing API files...`);
  ensureApiDir();

  writeJson('matches.json', { ...data, matches: data.matches });
  writeJson('tournament.json', { tournament: data.tournament, meta: data.meta });
  writeJson('finished.json', { tournament: data.tournament, matches: categorized.finished, meta: data.meta });
  writeJson('live.json', { tournament: data.tournament, matches: categorized.live, meta: data.meta });
  writeJson('upcoming.json', { tournament: data.tournament, matches: categorized.upcoming, meta: data.meta });

  const groups = groupMatchesByGroup(categorized.all);
  writeJson('groups.json', { tournament: data.tournament, groups, meta: data.meta });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✅ Done in ${elapsed}s\n`);
}

function groupMatchesByGroup(matches) {
  const groups = {};
  for (const match of matches) {
    const key = match.group || 'unknown';
    if (!groups[key]) {
      groups[key] = { name: key, stage: match.stage, matches: [] };
    }
    groups[key].matches.push(match);
  }
  return Object.values(groups);
}

main().catch(err => {
  console.error('\n❌ Scraper failed:', err.message);
  process.exit(1);
});
