# 🏆 FIFA World Cup 2026 API

**Free, live-updating JSON API for every match of the 2026 FIFA World Cup.**

Data is scraped from [Bing Sports](https://www.bing.com/sportsdetails) (powered by SportRadar) every **5 minutes** via a cron runner and served as static JSON via GitHub Pages. All finished matches have **YouTube highlight videos** (auto-discovered via search).

## 🚀 Quick Start

```js
fetch('https://h4ck0v3rflow.github.io/fifa-wc-2026-api/matches.json')
  .then(r => r.json())
  .then(data => console.log(data.matches.length, 'matches'));
```

## 📡 Endpoints

All endpoints are served at:

```
https://h4ck0v3rflow.github.io/fifa-wc-2026-api/
```

| Endpoint | Description |
|----------|-------------|
| [`/matches.json`](https://h4ck0v3rflow.github.io/fifa-wc-2026-api/matches.json) | All 104 matches across all stages |
| [`/finished.json`](https://h4ck0v3rflow.github.io/fifa-wc-2026-api/finished.json) | Completed matches with final scores + YouTube highlights |
| [`/live.json`](https://h4ck0v3rflow.github.io/fifa-wc-2026-api/live.json) | Currently live matches (if any) |
| [`/upcoming.json`](https://h4ck0v3rflow.github.io/fifa-wc-2026-api/upcoming.json) | Future scheduled fixtures with kickoff times |
| [`/groups.json`](https://h4ck0v3rflow.github.io/fifa-wc-2026-api/groups.json) | Matches grouped by group/stage |
| [`/tournament.json`](https://h4ck0v3rflow.github.io/fifa-wc-2026-api/tournament.json) | Tournament metadata |

## 📦 Data Model

```json
{
  "id": "66456904",
  "status": "finished",
  "status_text": "FT",
  "label": "2026-06-11",
  "date": "2026-06-11",
  "stage": "group",
  "group": "Group A",
  "time": null,
  "home_team": {
    "name": "Mexico",
    "flag_url": "https://flagcdn.com/w80/mx.webp",
    "id": "SportRadar_..._Team_4781"
  },
  "away_team": {
    "name": "South Africa",
    "flag_url": "https://flagcdn.com/w80/za.webp",
    "id": "SportRadar_..._Team_4736"
  },
  "home_score": 2,
  "away_score": 0,
  "winner": "home",
  "venue_id": "SportRadar_..._Venue_1004",
  "highlights": [
    {
      "label": "Match highlights",
      "url": "https://www.youtube.com/watch?v=Gg9bkcHBurg",
      "duration": null
    }
  ]
}
```

### Key fields

| Field | Description |
|-------|-------------|
| `status` | `finished` \| `live` \| `scheduled` |
| `status_text` | Human-readable status: `"FT"`, `"4:00 PM"`, etc. |
| `label` | ISO 8601 datetime: `"2026-06-11"` (finished) or `"2026-06-21T16:00:00"` (scheduled) |
| `time` | Extracted kickoff time: `"4:00 PM"` (null for finished) |
| `winner` | `"home"` \| `"away"` \| `"draw"` \| `null` (null for scheduled) |
| `highlights` | YouTube highlight URLs (auto-found via search, title-verified) |
| `flag_url` | Served from [flagcdn.com](https://flagcdn.com) |

### Scheduled match example

```json
{
  "status": "scheduled",
  "status_text": "Today 4:00 PM",
  "time": "4:00 PM",
  "label": "2026-06-21T16:00:00",
  "date": "2026-06-21",
  "home_score": null,
  "away_score": null,
  "winner": null
}
```

## 🛠 Running Locally

```bash
git clone https://github.com/h4ck0v3rflow/fifa-wc-2026-api.git
cd fifa-wc-2026-api
npm install
node src/scraper.js           # scrape only
node src/scraper.js --yt      # scrape + YouTube highlight search
```

Output is written to `api/` directory as JSON files.

### With the runner (auto-commit + deploy)

```bash
node runner.js
```

This runs the full cycle: scrape → YouTube conversion → commit to master → deploy to gh-pages.

## 🔄 How It Works

1. **Cron runner** (via the hosting server) runs every 5 minutes
2. **Scraper** fetches Bing Sports and parses match data with cheerio
3. **YouTube enrichment** converts FIFA recap links → YouTube highlights (title-verified)
4. **JSON files** are committed to `master` and deployed to `gh-pages`
5. **GitHub Pages** serves them as a free, CDN-backed API

### YouTube highlight discovery

For every finished match, the scraper:
1. Searches YouTube: `"{Team1} vs {Team2} Full Highlights FIFA World Cup 2026"`
2. Verifies the first result's title contains both team names
3. Replaces FIFA.com recap links → direct YouTube URLs
4. Previously converted matches are cached to avoid re-fetching

### Date resolution

Date labels like "Yesterday", "Today", "Tomorrow" are resolved via **interpolation between absolute dates** on the page (not the system clock). This means the dates are always correct regardless of timezone.

### Flags

Team flags use [flagcdn.com](https://flagcdn.com) with ISO 3166-1 alpha-2 codes instead of Bing CDN.

## 📋 Match Coverage

- **48 teams**, 12 groups (A–L)
- **104 matches**: group stage → round of 32 → round of 16 → quarter-finals → semi-finals → third place → final
- **June 11 – July 19, 2026**
- Hosts: USA, Canada, Mexico

## 📝 Notes

- Knockout round matches show placeholder names (e.g., "2A", "W101") until teams are determined
- Kickoff times are in local venue time (no timezone offset included)
- Team IDs and venue IDs are SportRadar identifiers
- 1 match (Australia vs Turkiye) still has FIFA recap — no matching YouTube video found

## 🐧 Linux Compatibility

The runner works on Linux. All git operations use `git -C <dir>` syntax and temp repos — no branch switching or working tree manipulation. Node.js `path.join()` handles path separators cross-platform.

```bash
# Example crontab — every 5 minutes
*/5 * * * * cd /path/to/fifa-scraper && node runner.js
```

## ⚖️ License

MIT — do whatever you want with the data. The underlying data is from SportRadar via Bing Sports; check their terms for commercial use.

---

Built by [@h4ck0v3rflow](https://github.com/h4ck0v3rflow)
