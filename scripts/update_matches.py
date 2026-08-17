#!/usr/bin/env python3
"""
Hybrid-Model Automated Match Data Pipeline
Fetches match metadata from sports APIs and generates placeholder embed URLs.
Preserves existing globalAds configuration and manual embed URLs.
"""

import json
import os
import sys
import requests
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Any
from urllib.parse import quote
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
MATCHES_FILE_PATH = os.path.join(
    os.path.dirname(__file__),
    '..',
    'data',
    'matches.json'
)

PLACEHOLDER_EMBED_URL = "PASTE_YOUR_EMBED_URL_HERE"
REQUEST_TIMEOUT = 30  # seconds

# Iraq / Saudi Arabia timezone = UTC+3
LOCAL_TIMEZONE = timezone(timedelta(hours=3))

# In-memory cache for team logo URLs
LOGO_CACHE = {}


def get_proxied_logo_url(raw_url: str) -> str:
    """
    Wrap an image URL with DuckDuckGo's external image proxy.

    The browser loads the image through DuckDuckGo instead of directly
    requesting the original image from the visitor's browser/server.
    """

    if not raw_url or not raw_url.strip():
        return ""

    return (
        "https://external-content.duckduckgo.com/iu/?u="
        + quote(raw_url, safe="")
    )


# Arabic league mappings
LEAGUE_MAPPINGS = {
    "Premier League": "الدوري الإنجليزي",
    "La Liga": "الدوري الإسباني",
    "Serie A": "الدوري الإيطالي",
    "Bundesliga": "الدوري الألماني",
    "Ligue 1": "الدوري الفرنسي",
    "UEFA Champions League": "دوري أبطال أوروبا",
    "UEFA Europa League": "الدوري الأوروبي",
    "Saudi Professional League": "الدوري السعودي",
    "Egyptian Premier League": "الدوري المصري",
}


# Channel mappings
CHANNEL_MAPPINGS = {
    "Premier League": "beIN SPORTS",
    "La Liga": "beIN SPORTS",
    "Serie A": "beIN SPORTS",
    "Bundesliga": "beIN SPORTS",
    "Ligue 1": "beIN SPORTS",
    "UEFA Champions League": "beIN SPORTS",
    "UEFA Europa League": "beIN SPORTS",
    "Saudi Professional League": "ثمانية / Thmanyah",
    "King's Cup": "ثمانية / Thmanyah",
    "Saudi Super Cup": "ثمانية / Thmanyah",
    "default": "beIN SPORTS"
}





# Allowed teams for match filtering
ALLOWED_TEAMS = {
    # England
    "Manchester City",
    "Liverpool",
    "Manchester United",
    "Arsenal",
    "Chelsea",

    # Spain
    "Real Madrid",
    "Barcelona",
    "Atletico Madrid",
    "Atlético Madrid",
    "Sevilla",
    "Athletic Bilbao",

    # Italy
    "Inter",
    "Inter Milan",
    "Juventus",
    "AC Milan",
    "Napoli",
    "Roma",

    # Germany
    "Bayern Munich",
    "Bayern München",
    "Borussia Dortmund",
    "Bayer Leverkusen",
    "RB Leipzig",
    "Eintracht Frankfurt",

    # France
    "Paris Saint-Germain",
    "PSG",
    "Marseille",
    "Lyon",
    "Monaco",
    "Lille",

    # Saudi Arabia
    "Al-Hilal",
    "Al Hilal",
    "Al-Nassr",
    "Al Nassr",
    "Al-Ittihad",
    "Al Ittihad",
    "Al-Ahli",
    "Al Ahli",
    "Al-Shabab",
    "Al Shabab"
}


# Team name variations
TEAM_VARIATIONS = {
    "Inter": [
        "Inter",
        "Inter Milan",
        "FC Internazionale Milano",
        "Internazionale"
    ],

    "Bayern Munich": [
        "Bayern Munich",
        "Bayern München",
        "FC Bayern München"
    ],

    "Paris Saint-Germain": [
        "Paris Saint-Germain",
        "PSG",
        "Paris SG"
    ],

    "Atletico Madrid": [
        "Atletico Madrid",
        "Atlético Madrid",
        "Club Atlético de Madrid"
    ],

    "Athletic Bilbao": [
        "Athletic Bilbao"
    ],

    "Al-Hilal": [
        "Al-Hilal",
        "Al Hilal"
    ],

    "Al-Nassr": [
        "Al-Nassr",
        "Al Nassr"
    ],

    "Al-Ittihad": [
        "Al-Ittihad",
        "Al Ittihad"
    ],

    "Al-Ahli": [
        "Al-Ahli",
        "Al Ahli"
    ],

    "Al-Shabab": [
        "Al-Shabab",
        "Al Shabab"
    ],

    "Arsenal": [
        "Arsenal",
        "Arsenal FC"
    ],

    "Juventus": [
        "Juventus",
        "Juventus FC"
    ],

    "Chelsea": [
        "Chelsea",
        "Chelsea FC"
    ],

    "Manchester United": [
        "Manchester United",
        "Manchester United FC"
    ],

    "Liverpool": [
        "Liverpool",
        "Liverpool FC"
    ],

    "Manchester City": [
        "Manchester City",
        "Manchester City FC"
    ],

    "Sevilla": [
        "Sevilla",
        "Sevilla FC"
    ],

    "Napoli": [
        "Napoli",
        "SSC Napoli"
    ],

    "Roma": [
        "Roma",
        "AS Roma"
    ],

    "Borussia Dortmund": [
        "Borussia Dortmund",
        "BVB Dortmund"
    ],

    "Bayer Leverkusen": [
        "Bayer Leverkusen",
        "Bayer 04 Leverkusen"
    ],

    "RB Leipzig": [
        "RB Leipzig",
        "RasenBallsport Leipzig"
    ],

    "Eintracht Frankfurt": [
        "Eintracht Frankfurt",
        "Eintracht Frankfurt e.V."
    ],

    "Marseille": [
        "Marseille",
        "Olympique de Marseille"
    ],

    "Lyon": [
        "Lyon",
        "Olympique Lyonnais"
    ],

    "Monaco": [
        "Monaco",
        "AS Monaco"
    ],

    "Lille": [
        "Lille",
        "LOSC Lille"
    ]
}


# Allowed suffixes
ALLOWED_SUFFIXES = [
    "FC",
    "Club",
    "CF",
    "AC",
    "SSC",
    "RCD",
    "UD",
    "Saudi"
]


# Disallowed suffixes
DISALLOWED_SUFFIXES = [
    "II",
    "III",
    "U23",
    "U21",
    "U19",
    "U18",
    "B",
    "Youth",
    "Academy",
    "Reserves"
]


class MatchDataPipeline:
    """Hybrid-model pipeline for fetching match metadata."""

    def __init__(self):
        self.existing_data = self._load_existing_data()

        self.existing_matches = {
            m['id']: m
            for m in self.existing_data.get('matches', [])
        }

    def _load_existing_data(self) -> Dict[str, Any]:
        """Load existing matches.json."""

        if os.path.exists(MATCHES_FILE_PATH):

            try:
                with open(
                    MATCHES_FILE_PATH,
                    'r',
                    encoding='utf-8'
                ) as f:
                    data = json.load(f)

                logger.info(
                    "Successfully loaded existing matches.json"
                )

                return data

            except Exception as e:

                logger.error(
                    f"Error loading existing data: {e}"
                )

                return {
                    "globalAds": {},
                    "matches": []
                }

        logger.warning(
            "matches.json not found, creating new file"
        )

        return {
            "globalAds": {},
            "matches": []
        }

    def _get_arabic_league_name(
        self,
        league_name: str
    ) -> str:
        """Convert English league name to Arabic."""

        return LEAGUE_MAPPINGS.get(
            league_name,
            league_name
        )

    def _get_channel_for_league(
        self,
        league_name: str
    ) -> str:
        """Get appropriate channel for a league."""

        if league_name in CHANNEL_MAPPINGS:
            return CHANNEL_MAPPINGS[league_name]

        league_lower = league_name.lower()

        # Saudi competitions
        if any(
            saudi_comp.lower() in league_lower
            for saudi_comp in [
                "saudi",
                "king's cup",
                "super cup"
            ]
        ):
            return "ثمانية / Thmanyah"

        # European competitions
        if any(
            euro_comp.lower() in league_lower
            for euro_comp in [
                "premier league",
                "la liga",
                "serie a",
                "bundesliga",
                "ligue 1",
                "champions league",
                "europa league"
            ]
        ):
            return "beIN SPORTS"

        return CHANNEL_MAPPINGS["default"]

    def _get_commentator_for_league(
        self,
        league_name: str
    ) -> str:
        """
        Commentator name is not provided by any football data API —
        it can only be known from the broadcasting channel's own
        announcements shortly before a match, which isn't a
        reliable automatable source. Rather than guess incorrectly
        per league, always return a neutral placeholder.
        """

        return "غير محدد"

    def _is_allowed_team(
        self,
        team_name: str
    ) -> bool:
        """Check if team name is allowed."""

        if not team_name:
            return False

        team_name_normalized = (
            team_name.lower().strip()
        )

        # Check disallowed suffixes first
        for disallowed in DISALLOWED_SUFFIXES:

            if (
                team_name_normalized.endswith(
                    " " + disallowed.lower()
                )
                or
                team_name_normalized.endswith(
                    "-" + disallowed.lower()
                )
            ):
                return False

        # Check team variations
        for canonical_name, variations in TEAM_VARIATIONS.items():

            for variation in variations:

                variation_normalized = (
                    variation.lower().strip()
                )

                # Exact match
                if team_name_normalized == variation_normalized:
                    return True

                # Match with allowed suffix
                if team_name_normalized.startswith(
                    variation_normalized + " "
                ):

                    remaining_part = (
                        team_name_normalized[
                            len(variation_normalized):
                        ].strip()
                    )

                    if remaining_part:

                        next_word = (
                            remaining_part.split()[0]
                        )

                        if next_word in [
                            s.lower()
                            for s in ALLOWED_SUFFIXES
                        ]:
                            return True

        # Direct ALLOWED_TEAMS check
        for allowed_team in ALLOWED_TEAMS:

            allowed_normalized = (
                allowed_team.lower().strip()
            )

            if team_name_normalized == allowed_normalized:
                return True

            if team_name_normalized.startswith(
                allowed_normalized + " "
            ):

                remaining_part = (
                    team_name_normalized[
                        len(allowed_normalized):
                    ].strip()
                )

                if remaining_part:

                    next_word = (
                        remaining_part.split()[0]
                    )

                    if next_word in [
                        s.lower()
                        for s in ALLOWED_SUFFIXES
                    ]:
                        return True

        return False

    def _generate_match_id(
        self,
        home_team: str,
        away_team: str,
        date_str: str
    ) -> str:
        """Generate clean URL-safe match ID."""

        clean_home = (
            home_team
            .lower()
            .replace(" ", "-")
            .replace("_", "-")
        )

        clean_home = "".join(
            c
            for c in clean_home
            if c.isalnum() or c == "-"
        )[:20]

        clean_away = (
            away_team
            .lower()
            .replace(" ", "-")
            .replace("_", "-")
        )

        clean_away = "".join(
            c
            for c in clean_away
            if c.isalnum() or c == "-"
        )[:20]

        clean_date = (
            date_str
            .replace("-", "")
            .replace("T", " ")
            .replace("+", " ")
            .replace("Z", " ")
            .split()[0][:8]
        )

        return (
            f"match-{clean_home}-"
            f"{clean_away}-"
            f"{clean_date}"
        )

    def _format_time(
        self,
        time_str: str
    ) -> str:
        """Format time string to HH:MM AM/PM."""

        try:

            if ":" in time_str:

                time_parts = time_str.split(":")

                hour = int(time_parts[0])
                minute = time_parts[1][:2]

                period = (
                    "PM"
                    if hour >= 12
                    else "AM"
                )

                hour_12 = hour % 12

                if hour_12 == 0:
                    hour_12 = 12

                return (
                    f"{hour_12:02d}:"
                    f"{minute} "
                    f"{period}"
                )

            return time_str

        except Exception as e:

            logger.warning(
                f"Error formatting time {time_str}: {e}"
            )

            return "12:00 PM"

    def _parse_api_datetime(
        self,
        datetime_str: str
    ) -> Optional[datetime]:
        """
        Parse API datetime correctly.

        API-Football returns fixture dates in UTC, normally like:

        2026-08-16T10:30:00+00:00

        or:

        2026-08-16T10:30:00Z

        The returned datetime is always timezone-aware.
        """

        if not datetime_str:
            return None

        try:

            normalized = datetime_str.strip()

            # Convert trailing Z to explicit UTC offset
            if normalized.endswith("Z"):
                normalized = (
                    normalized[:-1] + "+00:00"
                )

            parsed_datetime = datetime.fromisoformat(
                normalized
            )

            # If API somehow returns a naive datetime,
            # explicitly treat it as UTC.
            if parsed_datetime.tzinfo is None:
                parsed_datetime = parsed_datetime.replace(
                    tzinfo=timezone.utc
                )

            return parsed_datetime

        except Exception as e:

            logger.warning(
                f"Could not parse API datetime "
                f"'{datetime_str}': {e}"
            )

            return None

    def _format_time_from_datetime(
        self,
        datetime_str: str
    ) -> str:
        """
        Convert API UTC datetime to local UTC+3 time
        and format it as 12-hour AM/PM.
        """

        try:

            match_datetime = self._parse_api_datetime(
                datetime_str
            )

            if match_datetime is None:
                return "12:00 PM"

            # Convert UTC/API time to UTC+3
            local_datetime = match_datetime.astimezone(
                LOCAL_TIMEZONE
            )

            return local_datetime.strftime(
                "%I:%M %p"
            )

        except Exception as e:

            logger.warning(
                f"Error formatting time from datetime "
                f"{datetime_str}: {e}"
            )

            return "12:00 PM"

    def _get_team_logo(
        self,
        team_name: str,
        api_logo_url: str = None
    ) -> str:
        """
        Get team logo from the sports API and wrap it
        with DuckDuckGo's external image proxy.
        """

        if api_logo_url and api_logo_url.strip():

            if team_name in LOGO_CACHE:
                return LOGO_CACHE[team_name]

            proxied_url = get_proxied_logo_url(
                api_logo_url
            )

            LOGO_CACHE[team_name] = proxied_url

            logger.info(
                f"Logo assigned for {team_name}"
            )

            return proxied_url

        logger.warning(
            f"No API logo found for team: {team_name}"
        )

        return (
            "https://via.placeholder.com/"
            "128?text=Logo"
        )

    def _determine_match_status(
        self,
        match_date: str,
        match_time: str
    ) -> str:
        """
        Determine match status using the API datetime correctly.

        Rules:

        - UPCOMING = match has not started yet
        - LIVE = from kickoff until 2 hours after kickoff
        - ENDED = more than 2 hours after kickoff

        IMPORTANT:
        API datetime is treated as UTC and converted to
        UTC+3 before comparison.
        """

        try:

            now_local = datetime.now(
                LOCAL_TIMEZONE
            )

            match_datetime = (
                self._parse_api_datetime(match_date)
                if match_date
                else None
            )

            # Primary method:
            # use the full API datetime
            if match_datetime is not None:

                match_local = (
                    match_datetime.astimezone(
                        LOCAL_TIMEZONE
                    )
                )

            else:

                # Fallback for APIs that might provide
                # separate date/time fields.
                if not match_date:
                    return "UPCOMING"

                date_part = match_date.split("T")[0]

                if "-" in date_part:
                    parsed_date = datetime.strptime(
                        date_part,
                        "%Y-%m-%d"
                    ).date()

                else:
                    parsed_date = datetime.strptime(
                        date_part,
                        "%Y%m%d"
                    ).date()

                try:
                    parsed_time = datetime.strptime(
                        match_time[:5],
                        "%H:%M"
                    ).time()

                except Exception:
                    parsed_time = datetime.strptime(
                        "00:00",
                        "%H:%M"
                    ).time()

                match_local = datetime.combine(
                    parsed_date,
                    parsed_time,
                    tzinfo=LOCAL_TIMEZONE
                )

            # Calculate difference
            time_diff = (
                now_local - match_local
            ).total_seconds()

            # Match hasn't started yet
            if time_diff < 0:
                status = "UPCOMING"

            # Match started less than 2 hours ago
            elif time_diff <= 7200:
                status = "LIVE"

            # Match started more than 2 hours ago
            else:
                status = "ENDED"

            logger.info(
                f"Match status: "
                f"{match_local.strftime('%Y-%m-%d %H:%M:%S %Z')} "
                f"| Now: "
                f"{now_local.strftime('%Y-%m-%d %H:%M:%S %Z')} "
                f"| {status}"
            )

            return status

        except Exception as e:

            logger.warning(
                f"Error determining match status "
                f"for date={match_date}, "
                f"time={match_time}: {e}"
            )

            return "UPCOMING"

    def _preserve_manual_embed_url(
        self,
        existing_match: Dict,
        new_match_data: Dict
    ) -> Dict:
        """Preserve manual embed URL."""

        if existing_match:

            for server in existing_match.get(
                'servers',
                []
            ):

                embed_url = server.get(
                    'embedUrl',
                    ''
                )

                if (
                    embed_url
                    and
                    embed_url != PLACEHOLDER_EMBED_URL
                ):

                    for new_server in new_match_data[
                        'servers'
                    ]:

                        if (
                            new_server['id']
                            == server['id']
                        ):

                            new_server[
                                'embedUrl'
                            ] = embed_url

                            logger.info(
                                f"Preserved manual embed URL "
                                f"for {new_match_data['id']}"
                            )

                            break

        return new_match_data

    def _create_server_config(
        self,
        match_id: str,
        existing_match: Optional[Dict] = None
    ) -> List[Dict]:
        """Create server configuration."""

        servers = [
            {
                "id": "srv1",
                "name": "سيرفر رئيسي (1080p)",
                "quality": "1080p",
                "embedUrl": PLACEHOLDER_EMBED_URL
            },
            {
                "id": "srv2",
                "name": "سيرفر احتياطي (720p)",
                "quality": "720p HD",
                "embedUrl": PLACEHOLDER_EMBED_URL
            }
        ]

        # Preserve manual URLs
        if existing_match:

            for existing_server in existing_match.get(
                'servers',
                []
            ):

                existing_url = existing_server.get(
                    'embedUrl',
                    ''
                )

                if (
                    existing_url
                    and
                    existing_url != PLACEHOLDER_EMBED_URL
                ):

                    for server in servers:

                        if (
                            server['id']
                            == existing_server['id']
                        ):

                            server[
                                'embedUrl'
                            ] = existing_url

                            break

        return servers

    def fetch_matches_from_api_football(
        self
    ) -> Optional[List[Dict]]:
        """
        Fetch matches from API-Football.

        Endpoint intentionally unchanged.

        Returns:
            - a list (possibly empty) on a SUCCESSFUL API call
            - None if the key is missing or the request failed,
              so the caller can distinguish "genuinely no matches
              today" from "we couldn't reach the API" and avoid
              wiping matches.json in the latter case.
        """

        api_key = os.environ.get(
            "API_FOOTBALL_KEY"
        )

        if not api_key:

            logger.info(
                "API_FOOTBALL_KEY not set, "
                "skipping API-Football"
            )

            return None

        try:

            now = datetime.now()
            today = now.strftime(
                "%Y-%m-%d"
            )

            # ENDPOINT UNCHANGED
            url = (
                "https://v3.football.api-sports.io/"
                f"fixtures?date={today}"
            )

            headers = {
                "x-apisports-key": api_key
            }

            response = requests.get(
                url,
                headers=headers,
                timeout=REQUEST_TIMEOUT
            )

            response.raise_for_status()

            data = response.json()

            return self._process_api_football_data(
                data
            )

        except Exception as e:

            logger.error(
                f"Error fetching from API-Football: {e}"
            )

            return None

    def _process_api_football_data(
        self,
        data: Dict
    ) -> List[Dict]:
        """Process API-Football response data."""

        matches = []

        for fixture in data.get(
            'response',
            []
        ):

            try:

                league_name = fixture.get(
                    'league',
                    {}
                ).get(
                    'name',
                    'Unknown League'
                )

                home_team = fixture.get(
                    'teams',
                    {}
                ).get(
                    'home',
                    {}
                ).get(
                    'name',
                    'Home Team'
                )

                away_team = fixture.get(
                    'teams',
                    {}
                ).get(
                    'away',
                    {}
                ).get(
                    'name',
                    'Away Team'
                )

                # API-Football logo URLs
                home_team_logo = fixture.get(
                    'teams',
                    {}
                ).get(
                    'home',
                    {}
                ).get(
                    'logo',
                    ''
                )

                away_team_logo = fixture.get(
                    'teams',
                    {}
                ).get(
                    'away',
                    {}
                ).get(
                    'logo',
                    ''
                )

                # Filter
                if not (
                    self._is_allowed_team(
                        home_team
                    )
                    or
                    self._is_allowed_team(
                        away_team
                    )
                ):
                    continue

                # Full fixture datetime from API
                match_date = fixture.get(
                    'fixture',
                    {}
                ).get(
                    'date',
                    ''
                )

                match_time = fixture.get(
                    'fixture',
                    {}
                ).get(
                    'time',
                    '00:00'
                )

                match_id = self._generate_match_id(
                    home_team,
                    away_team,
                    match_date
                )

                existing_match = (
                    self.existing_matches.get(
                        match_id
                    )
                )

                # Convert UTC -> UTC+3
                formatted_time = (
                    self._format_time_from_datetime(
                        match_date
                    )
                    if "T" in match_date
                    else self._format_time(
                        match_time
                    )
                )

                match_status = (
                    self._determine_match_status(
                        match_date,
                        match_time
                    )
                )

                match_data = {
                    "id": match_id,

                    "league": (
                        self._get_arabic_league_name(
                            league_name
                        )
                    ),

                    "status": match_status,

                    "time": formatted_time,

                    "homeTeam": {
                        "name": home_team,
                        "logo": self._get_team_logo(
                            home_team,
                            home_team_logo
                        )
                    },

                    "awayTeam": {
                        "name": away_team,
                        "logo": self._get_team_logo(
                            away_team,
                            away_team_logo
                        )
                    },

                    "channel": (
                        self._get_channel_for_league(
                            league_name
                        )
                    ),

                    "commentator": (
                        self._get_commentator_for_league(
                            league_name
                        )
                    ),

                    "servers": (
                        self._create_server_config(
                            match_id,
                            existing_match
                        )
                    )
                }

                matches.append(
                    match_data
                )

            except Exception as e:

                logger.warning(
                    f"Error processing fixture: {e}"
                )

                continue

        return matches

    def fetch_matches_from_football_data_org(
        self
    ) -> Optional[List[Dict]]:
        """
        Fetch matches from football-data.org.

        Endpoint intentionally unchanged.

        Returns None (not []) when the key is missing or the
        request fails, so run() can tell a real failure apart
        from a genuinely empty result.
        """

        api_key = os.environ.get(
            "FOOTBALL_DATA_ORG_KEY"
        )

        if not api_key:

            logger.info(
                "FOOTBALL_DATA_ORG_KEY not set, "
                "skipping football-data.org"
            )

            return None

        try:

            now = datetime.now()

            today = now.strftime(
                "%Y-%m-%d"
            )

            # ENDPOINT UNCHANGED
            url = (
                "https://api.football-data.org/v4/"
                f"matches?dateFrom={today}"
                f"&dateTo={today}"
            )

            headers = {
                "X-Auth-Token": api_key
            }

            response = requests.get(
                url,
                headers=headers,
                timeout=REQUEST_TIMEOUT
            )

            response.raise_for_status()

            data = response.json()

            return (
                self._process_football_data_org_data(
                    data
                )
            )

        except Exception as e:

            logger.error(
                f"Error fetching from football-data.org: {e}"
            )

            return None

    def _process_football_data_org_data(
        self,
        data: Dict
    ) -> List[Dict]:
        """Process football-data.org response data."""

        matches = []

        for match in data.get(
            'matches',
            []
        ):

            try:

                league_name = match.get(
                    'competition',
                    {}
                ).get(
                    'name',
                    'Unknown League'
                )

                home_team = match.get(
                    'homeTeam',
                    {}
                ).get(
                    'name',
                    'Home Team'
                )

                away_team = match.get(
                    'awayTeam',
                    {}
                ).get(
                    'name',
                    'Away Team'
                )

                match_date = match.get(
                    'utcDate',
                    ''
                )

                match_time = (
                    match_date.split('T')[1][:5]
                    if 'T' in match_date
                    else '00:00'
                )

                home_team_crest = match.get(
                    'homeTeam',
                    {}
                ).get(
                    'crest',
                    ''
                )

                away_team_crest = match.get(
                    'awayTeam',
                    {}
                ).get(
                    'crest',
                    ''
                )

                # Filter
                if not (
                    self._is_allowed_team(
                        home_team
                    )
                    or
                    self._is_allowed_team(
                        away_team
                    )
                ):
                    continue

                match_id = self._generate_match_id(
                    home_team,
                    away_team,
                    match_date
                )

                existing_match = (
                    self.existing_matches.get(
                        match_id
                    )
                )

                # Convert UTC -> UTC+3
                formatted_time = (
                    self._format_time_from_datetime(
                        match_date
                    )
                    if "T" in match_date
                    else self._format_time(
                        match_time
                    )
                )

                match_status = (
                    self._determine_match_status(
                        match_date,
                        match_time
                    )
                )

                match_data = {
                    "id": match_id,

                    "league": (
                        self._get_arabic_league_name(
                            league_name
                        )
                    ),

                    "status": match_status,

                    "time": formatted_time,

                    "homeTeam": {
                        "name": home_team,
                        "logo": self._get_team_logo(
                            home_team,
                            home_team_crest
                        )
                    },

                    "awayTeam": {
                        "name": away_team,
                        "logo": self._get_team_logo(
                            away_team,
                            away_team_crest
                        )
                    },

                    "channel": (
                        self._get_channel_for_league(
                            league_name
                        )
                    ),

                    "commentator": (
                        self._get_commentator_for_league(
                            league_name
                        )
                    ),

                    "servers": (
                        self._create_server_config(
                            match_id,
                            existing_match
                        )
                    )
                }

                matches.append(
                    match_data
                )

            except Exception as e:

                logger.warning(
                    f"Error processing match: {e}"
                )

                continue

        return matches

    def run(self) -> bool:
        """Execute the match data pipeline."""

        logger.info(
            "Starting match data pipeline"
        )

        try:

            # API-Football first
            api_football_result = (
                self.fetch_matches_from_api_football()
            )

            # football-data.org fallback — only meaningful if
            # API-Football didn't even run (missing key / failed)
            football_data_org_result = None

            if api_football_result is None:

                football_data_org_result = (
                    self.fetch_matches_from_football_data_org()
                )

            if api_football_result is not None:

                matches = api_football_result

                logger.info(
                    f"Successfully fetched "
                    f"{len(matches)} matches "
                    f"from API-Football for allowed teams"
                )

            elif football_data_org_result is not None:

                matches = football_data_org_result

                logger.info(
                    f"Successfully fetched "
                    f"{len(matches)} matches "
                    f"from football-data.org for allowed teams"
                )

            else:

                # BOTH sources failed or have no key configured.
                # Do NOT overwrite matches.json with an empty list —
                # that would wipe every manually-curated embed URL
                # for today. Keep whatever is already in the file.
                matches = list(
                    self.existing_matches.values()
                )

                logger.warning(
                    "Both API-Football and football-data.org were "
                    "unavailable (missing key or request failed). "
                    "Preserving existing matches.json UNCHANGED "
                    "instead of overwriting it with an empty list."
                )

            # Final structure
            final_data = {
                "globalAds": (
                    self.existing_data.get(
                        "globalAds",
                        {}
                    )
                ),
                "matches": matches
            }

            # Ensure globalAds exists
            if (
                "globalAds" not in final_data
                or
                not final_data["globalAds"]
            ):

                final_data["globalAds"] = {
                    "popunder_home": "",
                    "popunder_player": "",
                    "social_bar_script": "",
                    "banner_728x90_script": "",
                    "native_banner_script": ""
                }

            # Write JSON
            self._write_matches_file(
                final_data
            )

            logger.info(
                "Match data pipeline "
                "completed successfully"
            )

            return True

        except Exception as e:

            logger.error(
                f"Error in match data pipeline: {e}"
            )

            return False

    def _write_matches_file(
        self,
        data: Dict[str, Any]
    ) -> None:
        """Write matches data to JSON."""

        try:

            os.makedirs(
                os.path.dirname(
                    MATCHES_FILE_PATH
                ),
                exist_ok=True
            )

            with open(
                MATCHES_FILE_PATH,
                'w',
                encoding='utf-8'
            ) as f:

                json.dump(
                    data,
                    f,
                    indent=2,
                    ensure_ascii=False
                )

            logger.info(
                f"Successfully wrote matches to "
                f"{MATCHES_FILE_PATH}"
            )

        except Exception as e:

            logger.error(
                f"Error writing matches file: {e}"
            )

            raise


def main():
    """Main entry point."""

    pipeline = MatchDataPipeline()

    success = pipeline.run()

    if success:

        logger.info(
            "✅ Match data update completed successfully"
        )

        sys.exit(0)

    else:

        logger.error(
            "❌ Match data update failed"
        )

        sys.exit(1)


if __name__ == "__main__":
    main()
