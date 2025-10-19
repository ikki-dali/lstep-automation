# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**LSTEP CSV自動エクスポートツール** - An automation tool that exports CSV data from LSTEP (LINE Step marketing platform) and uploads it to Google Sheets.

This is a critical business automation tool that replaced an unstable Chrome extension. The primary goal is **stability** (target: 85%+ success rate) with robust error handling and debugging capabilities.

## Common Commands

### Development & Testing
```bash
# Install dependencies
npm install

# Run the automation (production)
npm start

# Development mode (browser visible for debugging)
npm run dev

# Initial setup - saves login session
npm run setup

# Test Google Sheets connection
npm run test:sheets

# Validate configuration files
npm run validate
```

### Logs & Debugging
```bash
# View recent logs
npm run logs

# Watch logs in real-time
npm run logs:watch

# View only errors
npm run logs:errors

# Clean old logs (30+ days)
npm run clean-logs
```

### Code Quality
```bash
# Run tests
npm test

# Format code
npm run format
```

## Architecture

### Core Flow
1. **Browser Automation** (`src/lstep-automation.js`) - Puppeteer-based automation
2. **CSV Download** - Navigate LSTEP UI → Select preset → Download CSV
3. **CSV Parsing** (`src/csv-parser.js`) - Shift_JIS encoding → UTF-8 → 2D array
4. **Google Sheets Upload** (`src/sheets.js`) - Clear existing data → Upload new data

### Key Modules

**src/index.js** - Main orchestration
- Loads settings from `config/settings.json`
- Processes multiple clients sequentially
- Implements retry logic (default: 3 attempts)
- Aggregates results and reports success/failure

**src/lstep-automation.js** - LSTEP-specific automation
- Handles login flow with manual reCAPTCHA support
- Waits for user login when session expires
- Navigates through LSTEP's multi-page UI
- Downloads CSV files to `downloads/` directory
- **Critical**: Uses Chrome's user data directory (`.browser-data/`) to persist cookies

**src/browser.js** - Reusable browser automation class
- `BrowserAutomation` class with helper methods
- Multi-selector strategy for resilient element finding
- `safeClick()` - scrolls element into view before clicking
- `waitForDownload()` - uses CDP to detect download completion
- Automatic screenshot capture on errors

**src/csv-parser.js** - CSV processing
- **Important**: LSTEP exports use Shift_JIS encoding (common in Japanese systems)
- Uses `iconv-lite` for encoding conversion
- Validation functions for data integrity
- Handles malformed CSVs gracefully

**src/sheets.js** - Google Sheets API integration
- Supports both environment variable (`GOOGLE_CREDENTIALS`) and file-based credentials
- Clears existing data before upload to avoid duplicates
- Error codes: 404 (sheet not found), 403 (permission denied)

### Configuration

**config/settings.json** - Main configuration
```json
{
  "clients": [
    {
      "name": "Client display name",
      "exporterUrl": "https://manager.linestep.net/line/exporter/XXXXX/list",
      "presetName": "Exact preset name (case-sensitive)",
      "sheetId": "Google Sheets ID from URL",
      "sheetName": "Sheet tab name"
    }
  ],
  "options": {
    "timeout": 60000,          // Per-operation timeout (ms)
    "retryCount": 3,           // Number of retry attempts
    "retryDelay": 5000,        // Delay between retries (ms)
    "headless": true,          // false for debugging
    "screenshotOnError": true,
    "stopOnError": false,      // Continue to next client on error
    "cleanupDownloads": true   // Delete CSV after upload
  }
}
```

**config/credentials.json** - Google Service Account credentials
- JSON key file downloaded from Google Cloud Console
- Must have edit permissions on target spreadsheets
- NOT tracked in git (in .gitignore)

### Session Management

**Cookie Persistence**:
- Browser session data stored in `.browser-data/` directory
- Persists LSTEP login state across runs (typically 30 days)
- When session expires, automation pauses and prompts user to login manually
- User must complete reCAPTCHA verification manually

**Login Detection**:
- Checks page title for "ログイン" (Login)
- Waits up to 3 minutes for user to complete login
- Automatically continues after successful login

## Critical Implementation Details

### LSTEP UI Navigation Challenges
1. **Multi-page flow**: Exporter URL may redirect to friend list → Must click "CSV操作" → "CSVエクスポートリスト"
2. **Preset selection**: Uses text matching on table rows, then finds associated button
3. **Download timing**: Polls `downloads/` directory, ignores `.crdownload` files
4. **Page stability**: Uses 5-second waits and `document.readyState` checks before interacting

### Error Handling Strategy
- All errors trigger screenshot capture to `logs/` directory
- Retry logic: 3 attempts with 5-second delays
- Error classification: Network timeouts, element not found, API errors
- Screenshots named: `{operation}-error_{timestamp}.png`

### Known Limitations
1. **UI Dependency**: Breaks if LSTEP changes their HTML structure
2. **reCAPTCHA**: Cannot be automated - requires human interaction
3. **Single-threaded**: Processes clients sequentially, not in parallel
4. **macOS-focused**: Hardcoded Chrome path for macOS (line 120 in lstep-automation.js)

## Environment Variables

Required for GitHub Actions:
- `GOOGLE_CREDENTIALS` - JSON service account key (entire file as string)
- `LSTEP_EMAIL` - LSTEP account email
- `LSTEP_PASSWORD` - LSTEP account password

Local development typically uses file-based credentials instead.

## Debugging Guide

### When automation fails:

1. **Check screenshots**: `logs/` folder contains full-page screenshots at failure point
2. **Run with visible browser**: Set `headless: false` in settings.json
3. **Check logs**: Use `npm run logs` to see detailed execution logs
4. **Verify preset name**: Must match EXACTLY (case-sensitive, including spaces)
5. **Check session**: Run `npm run setup` to re-authenticate

### Common failure modes:
- **"プリセットが見つかりません"**: Preset name mismatch or UI changed
- **Download timeout**: Network issues or LSTEP server slow
- **Google Sheets 403**: Service account lacks edit permission
- **Google Sheets 404**: Invalid sheet ID or sheet name

## GitHub Actions Workflow

Located at `.github/workflows/lstep-export.yml`:
- Runs hourly on the hour (UTC)
- Manual trigger available via "workflow_dispatch"
- Uses secrets for credentials
- Runs on `ubuntu-latest`

## File Structure Notes

```
src/
├── index.js              # Main entry point - orchestrates entire flow
├── lstep-automation.js   # LSTEP-specific browser automation
├── browser.js            # Generic browser automation class
├── csv-parser.js         # Shift_JIS CSV parsing utilities
└── sheets.js             # Google Sheets API wrapper

config/
├── settings.json         # Client configurations (gitignored)
├── settings.example.json # Template with documentation
└── credentials.json      # Google service account key (gitignored)

.browser-data/            # Puppeteer user data (cookies, cache)
downloads/                # Temporary CSV storage
logs/                     # Execution logs and error screenshots
```

## Testing Approach

No formal test suite currently exists. Manual testing procedure:
1. Run `npm run setup` for fresh login
2. Run `npm start` with single client
3. Verify CSV download in `downloads/`
4. Verify Google Sheets update
5. Test error scenarios (invalid preset, network disconnect)
6. Run 10 consecutive executions to verify ≥80% success rate

## Important Maintenance Notes

- **Monthly UI check recommended**: LSTEP may change UI structure
- **Session renewal**: Cookies expire approximately every 30 days
- **Log cleanup**: Use `npm run clean-logs` to prevent disk bloat
- **Google API quotas**: Monitor for rate limit errors (rare with current usage)
- **Chrome version**: Puppeteer bundles Chromium, but can use system Chrome

## When Modifying This Code

1. **Preserve error handling**: Screenshots and detailed logs are critical for debugging production failures
2. **Test with headless: false first**: Verify UI interactions before deploying
3. **Maintain retry logic**: Transient errors are common with web automation
4. **Keep encoding handling**: Shift_JIS conversion is essential for Japanese text
5. **Document preset names**: They must match exactly - include in comments if hardcoded
