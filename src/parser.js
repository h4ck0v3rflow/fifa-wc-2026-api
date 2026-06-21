const cheerio = require('cheerio');

/**
 * Parse the Bing Sports HTML page and extract all match data.
 * @param {string} html - Raw HTML from Bing Sports Details page
 * @param {Date} referenceDate - The date to use for resolving "Today"/"Yesterday"/"Tomorrow"
 * @returns {object} - { tournament, matches, last_updated }
 */
function parsePage(html, referenceDate = new Date()) {
  const $ = cheerio.load(html);
  const matches = [];

  // --- Tournament metadata ---
  const tournament = extractTournament($);

  // Iterate through all match cards and extract data
  $('[match-card-id]').each((i, el) => {
    const $card = $(el);
    const match = parseMatch($, $card);
    if (!match) return;

    // Find the date for this match from the nearest date pivot
    const date = findClosestDate($, $card, referenceDate);
    if (date) {
      match.date_raw = date.rawDate;
      match.date = date.resolvedDate;
    }

    matches.push(match);
  });

  return {
    tournament,
    matches,
    meta: {
      total_matches: matches.length,
      last_updated: new Date().toISOString(),
      source: 'Bing Sports (SportRadar)',
      url: 'https://www.bing.com/sportsdetails?q=fifa%20world%20cup%20live%20scores&sport=Soccer&scenario=League&league=Soccer_InternationalWorldCup&seasonyear=2026&segment=sports',
    },
  };
}

/**
 * Parse a single match card element
 */
function parseMatch($, $card) {
  const matchCardId = $card.attr('match-card-id') || '';
  const gameId = extractGameId(matchCardId);
  if (!gameId) return null;

  // --- Group / Stage ---
  const group = $card.find('.bsp_mtc_tps span').first().text().trim() || null;

  // --- Teams ---
  const teams = [];
  $card.find('.bsp_team').each((j, teamEl) => {
    const $team = $(teamEl);
    const name = $team.find('.team-name-ellipsis').attr('title') ||
                 $team.find('.team-name-ellipsis').text().trim() || null;
    const flagUrl = $team.find('.cico img').attr('src') || null;
    teams.push({ name, flag_url: normalizeFlagUrl(flagUrl) });
  });

  const homeTeam = teams[0] || { name: null, flag_url: null };
  const awayTeam = teams[1] || { name: null, flag_url: null };

  // --- Scores ---
  const scores = [];
  $card.find('.bsp_team_scr').each((j, scoreEl) => {
    const s = $(scoreEl).text().trim();
    scores.push(s ? parseInt(s, 10) : null);
  });
  const homeScore = scores[0] ?? null;
  const awayScore = scores[1] ?? null;

  // --- Status ---
  const status = determineMatchStatus($, $card, homeScore, awayScore);

  // --- IDs from href or aria-label ---
  const $link = $card.find('a').first();
  const href = $link.attr('href') || '';
  const teamIds = extractTeamIds(href);
  const venueId = extractVenueId(href);

  // --- Highlights ---
  const highlights = extractHighlights($, $card);

  return {
    id: gameId,
    sportradar_id: matchCardId,
    status: status.type,       // "finished" | "live" | "scheduled"
    label: status.label,       // "FT", "4:00 PM", etc.
    stage: group ? determineStage(group) : null,
    group,
    home_team: {
      name: homeTeam.name,
      flag_url: homeTeam.flag_url,
      id: teamIds.home || null,
    },
    away_team: {
      name: awayTeam.name,
      flag_url: awayTeam.flag_url,
      id: teamIds.away || null,
    },
    home_score: homeScore,
    away_score: awayScore,
    winner: homeScore !== null && awayScore !== null
      ? (homeScore > awayScore ? 'home' : awayScore > homeScore ? 'away' : 'draw')
      : null,
    venue_id: venueId,
    highlights: highlights.length > 0 ? highlights : null,
    link: href ? `https://www.bing.com${href}` : null,
  };
}

/**
 * Determine match status from card content
 */
function determineMatchStatus($, $card, homeScore, awayScore) {
  // Check for "FT" in the status area
  const statusText = $card.find('.bsp_game_info').text().trim();

  if (statusText.includes('FT')) {
    return { type: 'finished', label: 'FT' };
  }

  // Check for live
  if (homeScore !== null || awayScore !== null) {
    const timeParts = $card.find('.bsp_game_time');
    const timeText = timeParts.map((i, el) => $(el).text().trim()).get().join(' ');
    if (timeText && !timeText.includes('FT')) {
      return { type: 'live', label: timeText };
    }
    return { type: 'finished', label: 'FT' };
  }

  // Upcoming: get the time from status section
  const timeTexts = [];
  $card.find('.bsp_game_time').each((i, el) => {
    const t = $(el).text().trim();
    if (t) timeTexts.push(t);
  });

  if (timeTexts.length > 0) {
    return { type: 'scheduled', label: timeTexts.join(' ') };
  }

  return { type: 'scheduled', label: null };
}

/**
 * Determine the stage of the tournament
 */
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

/**
 * Extract the numeric game ID from the SportRadar match-card-id
 */
function extractGameId(matchCardId) {
  const match = matchCardId.match(/Game_(\d+)/);
  return match ? match[1] : null;
}

/**
 * Extract team IDs from the link href
 */
function extractTeamIds(href) {
  const match = href.match(/team=([^&]+)/);
  const match2 = href.match(/team2=([^&]+)/);
  return {
    home: match ? match[1] : null,
    away: match2 ? match2[1] : null,
  };
}

/**
 * Extract venue ID from the link href
 * Format: venueid={"id":"SportRadar_Soccer_InternationalWorldCup_2026_Venue_1004"}:version-1
 */
function extractVenueId(href) {
  const match = href.match(/venueid=([^&]+)/);
  if (!match) return null;
  try {
    // Remove :version-1 suffix before parsing JSON
    const raw = decodeURIComponent(match[1]).replace(/:version-\d+$/, '');
    const parsed = JSON.parse(raw);
    return parsed.id || raw;
  } catch {
    return match[1]; // raw fallback
  }
}

/**
 * Extract highlight video links from the match card
 */
function extractHighlights($, $card) {
  const highlights = [];
  $card.find('.bsp_matchvideo').each((i, el) => {
    const $vid = $(el);
    const label = $vid.attr('title') || 'Match highlights';
    const $link = $vid.find('a');
    const href = $link.attr('rurl') || $link.attr('href') || null;
    const duration = $vid.find('.vt_text span').last().text().trim() || null;

    if (href) {
      highlights.push({
        label,
        url: href,
        duration,
      });
    }
  });
  return highlights;
}

/**
 * Normalize flag URL (prepend bing.com domain if relative)
 */
function normalizeFlagUrl(url) {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `https://www.bing.com${url}`;
}

/**
 * Find the closest previous date pivot for a match card
 * DOM structure: .bsp-schedule-date-pivot sibling → .bsp-l2-card-grp > .bsp_match_card > .b_mtcctnr
 */
function findClosestDate($, $card, referenceDate) {
  // Go up from the match card to the card group, then get the previous pivot
  const $cardGroup = $card.closest('.bsp-l2-card-grp');
  const $pivot = $cardGroup.length ? $cardGroup.prev('.bsp-schedule-date-pivot') : $();

  if ($pivot.length) {
    const rawDate = $pivot.text().trim();
    return { rawDate, resolvedDate: resolveDate(rawDate, referenceDate) };
  }

  return null;
}

/**
 * Resolve relative dates ("Today", "Yesterday", "Tomorrow") to ISO date strings
 */
function resolveDate(rawDate, referenceDate) {
  if (!rawDate) return null;
  const trimmed = rawDate.trim();

  // Normalize reference date to midnight
  const ref = new Date(referenceDate);
  ref.setHours(0, 0, 0, 0);

  if (trimmed.toLowerCase() === 'today') {
    return ref.toISOString().split('T')[0];
  }
  if (trimmed.toLowerCase() === 'yesterday') {
    const d = new Date(ref);
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }
  if (trimmed.toLowerCase() === 'tomorrow') {
    const d = new Date(ref);
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }

  // Parse absolute date: "Thu, Jun 11" or "Fri, Jul 19"
  // We know the year is 2026
  const parsed = parseAbsoluteDate(trimmed);
  if (parsed) return parsed;

  return null;
}

/**
 * Parse absolute date strings like "Thu, Jun 11" → "2026-06-11"
 */
function parseAbsoluteDate(raw) {
  const months = {
    jan: '01', feb: '02', mar: '03', apr: '04',
    may: '05', jun: '06', jul: '07', aug: '08',
    sep: '09', oct: '10', nov: '11', dec: '12',
  };

  // Strip day-of-week prefix: "Thu, Jun 11" → "Jun 11"
  const cleaned = raw.replace(/^[a-z]+,?\s*/i, '').trim();
  const parts = cleaned.split(/\s+/);
  if (parts.length < 2) return null;

  const month = months[parts[0]?.toLowerCase().substring(0, 3)];
  const day = parts[1]?.replace(/,/, '').padStart(2, '0');

  if (month && day) {
    return `2026-${month}-${day}`;
  }
  return null;
}

/**
 * Extract top-level tournament metadata
 */
function extractTournament($) {
  return {
    name: 'FIFA World Cup 2026',
    season: '2026',
    hosts: ['USA', 'Canada', 'Mexico'],
    format: '48 teams, 12 groups, round of 32 knockout',
    date_start: '2026-06-11',
    date_end: '2026-07-19',
    data_provider: 'SportRadar (via Bing Sports)',
  };
}

/**
 * Categorize matches into live, upcoming, and finished
 */
function categorizeMatches(matches) {
  const now = new Date();

  return {
    finished: matches.filter(m => m.status === 'finished'),
    live: matches.filter(m => m.status === 'live'),
    upcoming: matches.filter(m => m.status === 'scheduled'),
    all: matches,
  };
}

module.exports = { parsePage, categorizeMatches };
