# 🏆 FIFA World Cup 2026 API

**Free, live-updating JSON API for every match of the 2026 FIFA World Cup.**

Data is scraped from [Bing Sports](https://www.bing.com/sportsdetails) (powered by SportRadar) every 10 minutes via GitHub Actions and served as static JSON via GitHub Pages.

## 🚀 Quick Start

```js
fetch('https://h4ck0v3rflow.github.io/fifa-wc-2026-api/matches.json')
  .then(r => r.json())
  .then(data => console.log(data.matches.length, 'matches'));
```

## 📡 Endpoints

All endpoints are served from:

```
https://h4ck0v3rflow.github.io/fifa-wc-2026-api/
```

| Endpoint | Description |
|----------|-------------|
| [`/matches.json`](https://h4ck0v3rflow.github.io/fifa-wc-2026-api/matches.json) | All 104 matches across all stages |
| [`/finished.json`](https://h4ck0v3rflow.github.io/fifa-wc-2026-api/finished.json) | Completed matches with final scores |
| [`/live.json`](https://h4ck0v3rflow.github.io/fifa-wc-2026-api/live.json) | Currently live matches (if any) |
| [`/upcoming.json`](https://h4ck0v3rflow.github.io/fifa-wc-2026-api/upcoming.json) | Future scheduled fixtures |
| [`/groups.json`](https://h4ck0v3rflow.github.io/fifa-wc-2026-api/groups.json) | Matches grouped by group/stage |
| [`/tournament.json`](https://h4ck0v3rflow.github.io/fifa-wc-2026-api/tournament.json) | Tournament metadata |

## 📦 Data Model

```json
{
  "id": "66456904",
  "status": "finished",
  "label": "FT",
  "stage": "group",
  "group": "Group A",
  "date": "2026-06-11",
  "home_team": {
    "name": "Mexico",
    "flag_url": "https://www.bing.com/...",
    "id": "SportRadar_..._Team_4781"
  },
  "away_team": {
    "name": "South Africa",
    "flag_url": "https://www.bing.com/...",
    "id": "SportRadar_..._Team_4736"
  },
  "home_score": 2,
  "away_score": 0,
  "winner": "home",
  "venue_id": "SportRadar_..._Venue_1004",
  "highlights": [
    {
      "label": "Match recap",
      "url": "https://www.fifa.com/...",
      "duration": "02:13"
    }
  ]
}
```

### Status Types

| Status | Meaning |
|--------|---------|
| `scheduled` | Match hasn't started yet. `label` shows date/time |
| `live` | Match is in progress |
| `finished` | Match has ended. `label` is "FT" |

### Winner Values

| Winner | Meaning |
|--------|---------|
| `home` | Home team won |
| `away` | Away team won |
| `draw` | Match ended in a draw |
| `null` | Match hasn't been played yet |

## 🛠 Running Locally

```bash
git clone https://github.com/h4ck0v3rflow/fifa-wc-2026-api.git
cd fifa-wc-2026-api
npm install
npm run scrape
```

Output is written to the `api/` directory as JSON files.

### Testing with a saved page

```bash
# Fetch the page once:
curl -o page.html "https://www.bing.com/sportsdetails?..."
# Run the scraper in test mode:
npm run test
```

## 🔄 How It Works

1. **GitHub Actions** runs on a cron schedule (`*/10 12-23 * * *` during match hours)
2. **Scraper** fetches the Bing Sports page and parses match data with cheerio
3. **JSON files** are generated and deployed to the `gh-pages` branch
4. **GitHub Pages** serves them as a free, cached, CDN-backed API

## 📋 Match Coverage

- **48 teams**, 12 groups (A–L)
- **104 matches**: group stage → round of 32 → round of 16 → quarter-finals → semi-finals → third place → final
- **June 11 – July 19, 2026**
- Hosts: USA, Canada, Mexico

## 📝 Notes

- Knockout round matches show placeholder names (e.g., "2A", "W101") until teams are determined
- Time zone for kickoff times follows Bing Sports display (local venue time)
- Team IDs and venue IDs are SportRadar identifiers
- Flag images are served from Bing CDN

## ⚖️ License

MIT — do whatever you want with the data. The underlying data is from SportRadar via Bing Sports; check their terms for commercial use.

---

Built by [@h4ck0v3rflow](https://github.com/h4ck0v3rflow)
