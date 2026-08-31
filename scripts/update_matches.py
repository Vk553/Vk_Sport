#!/usr/bin/env python3
"""
Manual Match Status Updater
----------------------------
This script does NOT fetch anything from any external football API.
All match data (teams, logos, channel, servers, embed URLs) is entered
manually by the site owner in data/matches.json.

The ONLY thing this script does is recalculate the "status" field of
every match, every time it runs, based on the current date/time:

  - UPCOMING : now is before kickoff
  - LIVE     : from kickoff until 2 hours after kickoff
  - ENDED    : more than 2 hours after kickoff

It reads data/matches.json, updates "status" in place, and writes the
file back. Nothing else in the file is ever modified or deleted.

Required fields per match for this to work:
  "date": "2026-09-01"   (YYYY-MM-DD, the day of the match)
  "time": "10:30 PM"     (12-hour format with AM/PM)
"""

import json
import os
from datetime import datetime, timedelta, timezone

# Path to data/matches.json (relative to this script's location)
MATCHES_FILE_PATH = os.path.join(
    os.path.dirname(__file__),
    '..',
    'data',
    'matches.json'
)

# Iraq / Saudi Arabia timezone = UTC+3
LOCAL_TIMEZONE = timezone(timedelta(hours=3))

# A match is considered LIVE for this many hours after kickoff
LIVE_WINDOW_HOURS = 2


def load_matches_file():
    """Load data/matches.json. Returns the full dict, or None on failure."""

    if not os.path.exists(MATCHES_FILE_PATH):
        print(f"❌ File not found: {MATCHES_FILE_PATH}")
        return None

    try:
        with open(MATCHES_FILE_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        print(f"❌ matches.json has invalid JSON syntax: {e}")
        print("   Refusing to touch the file to avoid data loss.")
        return None
    except Exception as e:
        print(f"❌ Error reading matches.json: {e}")
        return None


def save_matches_file(data):
    """Write the full dict back to data/matches.json."""

    try:
        with open(MATCHES_FILE_PATH, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f"❌ Error saving matches.json: {e}")
        return False


def parse_kickoff_datetime(date_str, time_str):
    """
    Combine a "date" field (YYYY-MM-DD) and a "time" field
    (e.g. "10:30 PM") into a single timezone-aware datetime.

    Returns None if either field is missing or malformed.
    """

    if not date_str or not time_str:
        return None

    try:
        parsed_date = datetime.strptime(date_str.strip(), "%Y-%m-%d").date()
    except ValueError:
        print(f"⚠️  Could not parse date '{date_str}' (expected YYYY-MM-DD)")
        return None

    try:
        parsed_time = datetime.strptime(time_str.strip(), "%I:%M %p").time()
    except ValueError:
        print(f"⚠️  Could not parse time '{time_str}' (expected e.g. '10:30 PM')")
        return None

    return datetime.combine(parsed_date, parsed_time, tzinfo=LOCAL_TIMEZONE)


def compute_status(date_str, time_str, now_local):
    """
    Determine UPCOMING / LIVE / ENDED for a single match.
    Falls back to UPCOMING if the date/time can't be parsed,
    so a formatting mistake never accidentally hides a match.
    """

    kickoff = parse_kickoff_datetime(date_str, time_str)

    if kickoff is None:
        return "UPCOMING"

    seconds_since_kickoff = (now_local - kickoff).total_seconds()

    if seconds_since_kickoff < 0:
        return "UPCOMING"
    elif seconds_since_kickoff <= LIVE_WINDOW_HOURS * 3600:
        return "LIVE"
    else:
        return "ENDED"


def main():
    data = load_matches_file()

    if data is None:
        # Exit with an error code so the GitHub Actions step fails
        # loudly instead of silently doing nothing.
        raise SystemExit(1)

    matches = data.get("matches", [])

    if not matches:
        print("ℹ️  No matches found in matches.json — nothing to update.")
        return

    now_local = datetime.now(LOCAL_TIMEZONE)
    changed_count = 0

    for match in matches:
        old_status = match.get("status", "UPCOMING")

        new_status = compute_status(
            match.get("date", ""),
            match.get("time", ""),
            now_local
        )

        match["status"] = new_status

        home = match.get("homeTeam", {}).get("name", "?")
        away = match.get("awayTeam", {}).get("name", "?")

        if new_status != old_status:
            changed_count += 1
            print(f"🔄 {home} vs {away}: {old_status} → {new_status}")
        else:
            print(f"   {home} vs {away}: {new_status} (unchanged)")

    if save_matches_file(data):
        print(
            f"\n✅ Done. {changed_count} match(es) changed status "
            f"out of {len(matches)} total."
        )
    else:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
