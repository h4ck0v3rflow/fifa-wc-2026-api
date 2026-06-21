const cheerio = require('cheerio');
const path = require('path');
const fs = require('fs');

// Load team → flag code mapping
const FLAG_MAP = loadFlagMapping();

function loadFlagMapping() {
  try {
    const p = path.join(__dirname, '..', 'data', 'flags.json');
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return {};
  }
}

/**
 * Parse the Bing Sports HTML page and extract all match data.
 * @param {string} html - Raw HTML from Bing Sports Details page
 * @returns {object} - { tournament, matches, meta }
 */
function parsePage(html) {
  const $ = cheerio.load(html);
  const matches = [];

  // ── Step 1: Collect all date pivots in page order ──
  const datePivots = [];
  $('.bsp-schedule-date-pivot').each((i, el) => {
    const raw = $(el).text().trim();
    datePivots.push({ raw, element: el });
  });

  // ── Step 2: Resolve all dates via interpolation ──
  const resolvedDates = resolveAllDates(datePivots);

  // ── Step 3: Build card-group → resolved-date lookup ──
  const dateByCardGroup = new Map();
  datePivots.forEach((dp, idx) => {
    const $group = $(dp.element).next('.bsp-l2-card-grp');
    if ($group.length) {
      dateByCardGroup.set($group.get(0), {
        rawDate: dp.raw,
        resolvedDate: resolvedDates[idx],
      });
    }
  });

  // ── Step 4: Parse each match card ──
  $('[match-card-id]').each((i, el) => {
    const $card = $(el);
    const match = parseMatch($, $card);
    if (!match) return;

    // Find date from parent card group
    const $group = $card.closest('.bsp-l2-card-grp');
    if ($group.length) {
      const dateInfo = dateByCardGroup.get($group.get(0));
      if (dateInfo) {
        match.date_raw = dateInfo.rawDate;
        match.date = dateInfo.resolvedDate;
      }
    }

    // Apply flagcdn URLs
    applyFlagUrls(match);

    matches.push(match);
  });

  // ── Step 5: Build ISO datetime labels ──
  for (const match of matches) {
    buildDatetimeLabel(match);
  }

  return {
    tournament: {
      name: 'FIFA World Cup 2026',
      season: '2026',
      hosts: ['USA', 'Canada', 'Mexico'],
      format: '48 teams, 12 groups, round of 32 knockout',
      date_start: '2026-06-11',
      date_end: '2026-07-19',
      data_provider: 'SportRadar (via Bing Sports)',
    },
    matches,
    meta: {
      total_matches: matches.length,
      last_updated: new Date().toISOString(),
      source: 'Bing Sports (SportRadar)',
      url: 'https://www.bing.com/sportsdetails?q=fifa%20world%20cup%20live%20scores&sport=Soccer&scenario=League&league=Soccer_InternationalWorldCup&seasonyear=2026&segment=sports',
    },
  };
}

// ──────────────────────────────────────────────
//  DATE RESOLUTION WITH INTERPOLATION
// ──────────────────────────────────────────────

/**
 * Resolve all date labels by interpolating between absolute dates.
 * Strategy: parse absolute dates, then forward-fill and backward-fill
 * relative labels (Yesterday/Today/Tomorrow) from known anchors.
 */
function resolveAllDates(datePivots) {
  const n = datePivots.length;
  const dates = new Array(n).fill(null);

  // First pass: parse absolute dates
  for (let i = 0; i < n; i++) {
    dates[i] = parseAbsoluteDate(datePivots[i].raw);
  }

  // Forward fill: from each absolute date, walk forward filling nulls
  for (let i = 0; i < n; i++) {
    if (dates[i] !== null) {
      let base = parseDateString(dates[i]);
      for (let j = i + 1; j < n && dates[j] === null; j++) {
        base = addDays(base, 1);
        dates[j] = formatDateStr(base);
      }
    }
  }

  // Backward fill: from each absolute date, walk backward filling nulls
  for (let i = n - 1; i >= 0; i--) {
    if (dates[i] !== null) {
      let base = parseDateString(dates[i]);
      for (let j = i - 1; j >= 0 && dates[j] === null; j--) {
        base = addDays(base, -1);
        dates[j] = formatDateStr(base);
      }
    }
  }

  // Safety net for any still-null values
  for (let i = 0; i < n; i++) {
    if (dates[i] === null) {
      const prev = findPrevNonNull(dates, i);
      const next = findNextNonNull(dates, i);
      if (prev !== null && next !== null) {
        dates[i] = formatDateStr(addDays(parseDateString(dates[prev]), i - prev));
      } else if (prev !== null) {
        dates[i] = formatDateStr(addDays(parseDateString(dates[prev]), i - prev));
      } else if (next !== null) {
        dates[i] = formatDateStr(addDays(parseDateString(dates[next]), i - next));
      }
    }
  }

  return dates;
}

function findPrevNonNull(arr, idx) {
  for (let i = idx - 1; i >= 0; i--) if (arr[i] !== null) return i;
  return null;
}

function findNextNonNull(arr, idx) {
  for (let i = idx + 1; i < arr.length; i++) if (arr[i] !== null) return i;
  return null;
}

function parseDateString(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function formatDateStr(date) {
  return date.toISOString().split('T')[0];
}

/**
 * Parse absolute date strings like "Thu, Jun 11" → "2026-06-11"
 */
function parseAbsoluteDate(raw) {
  if (!raw) return null;
  const trimmed = raw.trim();
  const months = { jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06',
                   jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12' };
  const cleaned = trimmed.replace(/^[a-z]+,?\s*/i, '').trim();
  const parts = cleaned.split(/\s+/);
  if (parts.length < 2) return null;
  const month = months[parts[0]?.toLowerCase().substring(0, 3)];
  const day = parts[1]?.replace(/,/, '').padStart(2, '0');
  return (month && day) ? `2026-${month}-${day}` : null;
}

// ──────────────────────────────────────────────
//  DATETIME LABEL BUILDING
// ──────────────────────────────────────────────

/**
 * Build ISO 8601 datetime label and keep status_text for display.
 */
function buildDatetimeLabel(match) {
  const { status, date, time } = match;
  if (!date) return;

  if (status === 'finished') {
    // Finished: label = just the date (we don't know exact end time)
    match.label = date;
  } else if (status === 'scheduled' && time) {
    // Scheduled: combine date + time → "2026-06-21T16:00:00"
    const formatted = formatTimeToISO(time);
    if (formatted) {
      match.label = `${date}T${formatted}`;
    } else {
      match.label = date;
    }
  } else if (status === 'live') {
    match.label = date;
  }

  // Ensure label is never null
  if (!match.label) match.label = date;
}

/**
 * Convert "4:00 PM" → "16:00:00" or "12:00 AM" → "00:00:00"
 */
function formatTimeToISO(timeStr) {
  if (!timeStr) return null;
  const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return null;

  let h = parseInt(match[1], 10);
  const m = match[2];
  const ampm = match[3].toUpperCase();

  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;

  return `${String(h).padStart(2, '0')}:${m}:00`;
}

// ──────────────────────────────────────────────
//  FLAG URL MAPPING
// ──────────────────────────────────────────────

function applyFlagUrls(match) {
  for (const side of ['home_team', 'away_team']) {
    const team = match[side];
    if (!team || !team.name) continue;
    const code = FLAG_MAP[team.name];
    if (code) {
      team.flag_url = `https://flagcdn.com/w80/${code}.webp`;
    }
  }
}

// ──────────────────────────────────────────────
//  SINGLE MATCH PARSING
// ──────────────────────────────────────────────

function parseMatch($, $card) {
  const matchCardId = $card.attr('match-card-id') || '';
  const gameId = extractGameId(matchCardId);
  if (!gameId) return null;

  const group = $card.find('.bsp_mtc_tps span').first().text().trim() || null;

  // Teams
  const teams = [];
  $card.find('.bsp_team').each((j, teamEl) => {
    const $team = $(teamEl);
    const name = $team.find('.team-name-ellipsis').attr('title') ||
                 $team.find('.team-name-ellipsis').text().trim() || null;
    const flagUrl = $team.find('.cico img').attr('src') || null;
    teams.push({ name, flag_url: normalizeBingUrl(flagUrl) });
  });

  const homeTeam = teams[0] || { name: null, flag_url: null };
  const awayTeam = teams[1] || { name: null, flag_url: null };

  // Scores
  const scores = [];
  $card.find('.bsp_team_scr').each((j, scoreEl) => {
    const s = $(scoreEl).text().trim();
    scores.push(s ? parseInt(s, 10) : null);
  });
  const homeScore = scores[0] ?? null;
  const awayScore = scores[1] ?? null;

  // Status (pre-datetime — label/datetime are built later)
  const status = determineMatchStatus($, $card, homeScore, awayScore);

  // IDs from href
  const $link = $card.find('a').first();
  const href = $link.attr('href') || '';
  const venueId = extractVenueId(href);

  // Highlights from Bing
  const highlights = extractHighlights($, $card);

  return {
    id: gameId,
    sportradar_id: matchCardId,
    status: status.type,
    status_text: status.status_text,   // "FT" | "4:00 PM" | "Today 4:00 PM"
    time: status.time,                 // "4:00 PM" or null
    label: null,                       // filled later by buildDatetimeLabel()
    date: null,                        // filled later from card group
    date_raw: null,                    // filled later from card group
    stage: group ? determineStage(group) : null,
    group,
    home_team: {
      name: homeTeam.name,
      flag_url: homeTeam.flag_url,
      id: extractTeamId(href, 'team'),
    },
    away_team: {
      name: awayTeam.name,
      flag_url: awayTeam.flag_url,
      id: extractTeamId(href, 'team2'),
    },
    home_score: homeScore,
    away_score: awayScore,
    winner: (homeScore !== null && awayScore !== null)
      ? (homeScore > awayScore ? 'home' : awayScore > homeScore ? 'away' : 'draw')
      : null,
    venue_id: venueId,
    highlights: highlights.length > 0 ? highlights : null,
    link: href ? `https://www.bing.com${href}` : null,
  };
}

function determineMatchStatus($, $card, homeScore, awayScore) {
  const statusText = $card.find('.bsp_game_info').text().trim();

  if (statusText.includes('FT')) {
    return { type: 'finished', status_text: 'FT', time: null };
  }

  if (homeScore !== null || awayScore !== null) {
    // Has scores but no "FT" → possible live match
    const timeTexts = [];
    $card.find('.bsp_game_time').each((i, el) => {
      const t = $(el).text().trim();
      if (t) timeTexts.push(t);
    });
    const combined = timeTexts.join(' ');
    return {
      type: 'live',
      status_text: combined || 'Live',
      time: extractTimeOnly(combined),
    };
  }

  // Upcoming / scheduled
  const timeTexts = [];
  $card.find('.bsp_game_time').each((i, el) => {
    const t = $(el).text().trim();
    if (t) timeTexts.push(t);
  });

  if (timeTexts.length > 0) {
    const combined = timeTexts.join(' ');
    return {
      type: 'scheduled',
      status_text: combined,
      time: extractTimeOnly(combined),
    };
  }

  return { type: 'scheduled', status_text: null, time: null };
}

function extractTimeOnly(label) {
  if (!label) return null;
  const match = label.match(/\d{1,2}:\d{2}\s*(?:AM|PM)/i);
  return match ? match[0] : null;
}

function determineStage(groupText) {
  const lower = groupText.toLowerCase();
  if (lower.startsWith('group')) return 'group';
  if (lower.includes('round of 32') || lower.includes('ro32')) return 'round_of_32';
  if (lower.includes('round of 16') || lower.includes('ro16')) return 'round_of_16';
  if (lower.includes('quarter')) return 'quarter_final';
  if (lower.includes('semi')) return 'semi_final';
  if (lower.includes('third place') || lower.includes('3rd place')) return 'third_place';
  if (lower.includes('final')) return 'final';
  return null;
}

function extractGameId(matchCardId) {
  const m = matchCardId.match(/Game_(\d+)/);
  return m ? m[1] : null;
}

function extractTeamId(href, param) {
  const re = new RegExp(`${param}=([^&]+)`);
  const m = href.match(re);
  return m ? m[1] : null;
}

function extractVenueId(href) {
  const m = href.match(/venueid=([^&]+)/);
  if (!m) return null;
  try {
    const raw = decodeURIComponent(m[1]).replace(/:version-\d+$/, '');
    return JSON.parse(raw).id || raw;
  } catch {
    return m[1];
  }
}

function extractHighlights($, $card) {
  const highlights = [];
  $card.find('.bsp_matchvideo').each((i, el) => {
    const $vid = $(el);
    const label = $vid.attr('title') || 'Match highlights';
    const $link = $vid.find('a');
    const href = $link.attr('rurl') || $link.attr('href') || null;
    const duration = $vid.find('.vt_text span').last().text().trim() || null;
    if (href) highlights.push({ label, url: href, duration });
  });
  return highlights;
}

function normalizeBingUrl(url) {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `https://www.bing.com${url}`;
}

// ──────────────────────────────────────────────
//  POST-PROCESSING
// ──────────────────────────────────────────────

function categorizeMatches(matches) {
  return {
    finished: matches.filter(m => m.status === 'finished'),
    live: matches.filter(m => m.status === 'live'),
    upcoming: matches.filter(m => m.status === 'scheduled'),
    all: matches,
  };
}

// ──────────────────────────────────────────────
//  YOUTUBE SEARCH & TITLE MATCHING
// ──────────────────────────────────────────────

/**
 * Build YouTube search URL for finding match highlights.
 */
function buildYouTubeSearchUrl(match) {
  const home = match.home_team?.name || '';
  const away = match.away_team?.name || '';
  const query = `${home} vs ${away} Full Highlights FIFA World Cup 2026 tapmad FIFA26`;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

/**
 * Extract first video result from YouTube search page, with title verification.
 * @param {string} html - YouTube search page HTML
 * @param {string} team1 - First team name to match in title
 * @param {string} team2 - Second team name to match in title
 * @returns {{ videoId: string, title: string } | null}
 */
function extractFirstYouTubeVideoWithTitle(html, team1 = '', team2 = '') {
  const match = html.match(/ytInitialData\s*=\s*({.+?});\s*<\//);
  if (!match) {
    // Fallback: just grab first video ID from raw HTML
    const vidMatch = html.match(/\/watch\?v=([a-zA-Z0-9_-]{11})/);
    return vidMatch ? { videoId: vidMatch[1], title: null } : null;
  }

  try {
    const data = JSON.parse(match[1]);
    const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents
      ?.sectionListRenderer?.contents;

    if (!contents) return null;

    for (const section of contents) {
      const items = section?.itemSectionRenderer?.contents || [];
      for (const item of items) {
        const v = item?.videoRenderer;
        if (!v?.videoId) continue;

        // Extract title text from runs
        let title = '';
        const runs = v?.title?.runs;
        if (runs) {
          title = runs.map(r => r.text || '').join('');
        } else if (typeof v?.title?.simpleText === 'string') {
          title = v.title.simpleText;
        }

        const videoId = v.videoId;

        // Title match verification — fuzzy check
        if (team1 && team2) {
          const t1 = team1.toLowerCase();
          const t2 = team2.toLowerCase();
          const titleLower = title.toLowerCase();

          // Check if BOTH team names (or their first words) appear in the title
          const team1Parts = t1.split(/\s+/);
          const team2Parts = t2.split(/\s+/);
          const hasTeam1 = team1Parts.some(p => p.length > 2 && titleLower.includes(p));
          const hasTeam2 = team2Parts.some(p => p.length > 2 && titleLower.includes(p));

          if (!hasTeam1 || !hasTeam2) {
            continue; // skip this result, title doesn't match
          }
        }

        return { videoId, title };
      }
    }
  } catch {
    const vidMatch = html.match(/\/watch\?v=([a-zA-Z0-9_-]{11})/);
    return vidMatch ? { videoId: vidMatch[1], title: null } : null;
  }

  return null;
}

module.exports = {
  parsePage,
  categorizeMatches,
  buildYouTubeSearchUrl,
  extractFirstYouTubeVideoWithTitle,
};
