# VK SPORT - Automated Match Data Pipeline

A hybrid-model automated match data pipeline for sports live streaming websites with GitHub Actions integration.

## 🚀 Features

- **Hybrid Model**: Fetches match metadata only, generates placeholder embed URLs for manual input
- **State Preservation**: Preserves existing `globalAds` configuration and manual embed URLs
- **Automated Updates**: GitHub Actions workflow runs daily at 5:00 AM UTC
- **Team Filtering**: Only includes matches with major teams from England, Spain, Italy, Germany, France, and Saudi Arabia
- **No Fallback Data**: Returns empty match list when no qualifying matches are found
- **Arabic Support**: Full RTL support with Arabic league and commentator mappings
- **Error Handling**: Graceful degradation without corrupting data files

## 📁 Project Structure

```
VK_SPORT/
├── data/
│   └── matches.json              # Match data and ad configuration
├── scripts/
│   └── update_matches.py         # Python pipeline script
├── .github/
│   └── workflows/
│       └── daily_matches.yml      # GitHub Actions workflow
├── js/
│   ├── app.js                    # Homepage logic
│   ├── player.js                 # Player page logic
│   └── ads-config.js             # Ad configuration
├── index.html                    # Main page
└── stream.html                   # Player page
```

## 🔧 Setup Instructions

### 1. Local Development

Install Python dependencies:
```bash
pip install requests
```

Run the update script manually:
```bash
python scripts/update_matches.py
```

### 2. GitHub Actions Setup

1. Push the project to GitHub
2. The workflow will automatically run daily at 5:00 AM UTC
3. Manual trigger available from GitHub Actions tab

### 3. Optional API Integration

Add API keys as GitHub repository secrets for enhanced data:

- **API_FOOTBALL_KEY** - For API-Football integration
  - Get your free API key from: https://api-football.com/
  - Endpoint: `https://v3.football.api-sports.io/fixtures?date=YYYY-MM-DD`
  - Header: `x-apisports-key: YOUR_API_KEY`
  - Fetches real fixtures data for today's matches

- **FOOTBALL_DATA_ORG_KEY** - For football-data.org integration

## 📊 Data Management

### Manual Embed URL Process

1. **Automatic Update**: The pipeline fetches match metadata with placeholder URLs
2. **Manual Input**: Site owner replaces `PASTE_YOUR_EMBED_URL_HERE` with actual embed URLs
3. **Preservation**: Future updates preserve your manual embed URLs

### Editing matches.json

The structure is designed for easy manual editing:

```json
{
  "globalAds": {
    "popunder_home": "your-ad-network-link",
    "popunder_player": "your-ad-network-link",
    "social_bar_script": "",
    "banner_728x90_script": "",
    "native_banner_script": ""
  },
  "matches": [
    {
      "id": "match-unique-id",
      "league": "الدوري الإنجليزي",
      "status": "LIVE",
      "time": "22:30 PM",
      "homeTeam": {
        "name": "Team Name",
        "logo": "https://team-logo-url"
      },
      "awayTeam": {
        "name": "Team Name", 
        "logo": "https://team-logo-url"
      },
      "channel": "beIN Sports 1",
      "commentator": "معلق المباراة",
      "servers": [
        {
          "id": "srv1",
          "name": "سيرفر رئيسي (1080p)",
          "quality": "1080p",
          "embedUrl": "YOUR_EMBED_URL_HERE"
        }
      ]
    }
  ]
}
```

## 🔄 Workflow Triggers

- **Scheduled**: Daily at 5:00 AM UTC
- **Manual**: Via GitHub Actions UI
- **Push**: When script or workflow files are modified

## ⚽ Team Filtering

The pipeline only includes matches featuring major teams from the following leagues:

### England (Premier League)
- Manchester City, Liverpool, Manchester United, Arsenal, Chelsea

### Spain (La Liga)  
- Real Madrid, Barcelona, Atletico Madrid, Sevilla, Athletic Club

### Italy (Serie A)
- Inter, Juventus, AC Milan, Napoli, Roma

### Germany (Bundesliga)
- Bayern Munich, Borussia Dortmund, Bayer Leverkusen, RB Leipzig, Eintracht Frankfurt

### France (Ligue 1)
- Paris Saint-Germain, Marseille, Lyon, Monaco, Lille

### Saudi Arabia (Saudi Pro League)
- Al-Hilal, Al-Nassr, Al-Ittihad, Al-Ahli, Al-Shabab

**Note**: If no matches featuring these teams are found for the current day, the matches array will be empty.
- **Push**: When script or workflow files are modified

## 🛡️ Safety Features

- **Data Preservation**: Never overwrites manual embed URLs
- **Fallback System**: Generates realistic sample data when APIs fail
- **Error Handling**: Graceful degradation without file corruption
- **UTF-8 Encoding**: Proper Arabic character support

## 📝 Customization

### League Mappings

Edit in `scripts/update_matches.py`:

```python
LEAGUE_MAPPINGS = {
    "Premier League": "الدوري الإنجليزي",
    "La Liga": "الدوري الإسباني",
    # Add your custom mappings
}
```

### Channel Assignments

Edit in `scripts/update_matches.py`:

```python
CHANNEL_MAPPINGS = {
    "Premier League": "beIN Sports 1",
    "La Liga": "beIN Sports 2",
    # Add your custom mappings
}
```

### Commentator Assignments

Edit in `scripts/update_matches.py`:

```python
COMMENTATOR_MAPPINGS = {
    "Premier League": "رؤوف خليف",
    "La Liga": "عصام الشوالي",
    # Add your custom mappings
}
```

## 🚨 Important Notes

- **No Video Scraping**: This pipeline does NOT scrape video URLs
- **Manual Input Required**: Embed URLs must be manually added before match time
- **Ad Preservation**: The `globalAds` section is never overwritten
- **URL Preservation**: Manual embed URLs survive automatic updates

## 📞 Support

For issues or questions about the pipeline configuration, refer to the inline documentation in `scripts/update_matches.py`.