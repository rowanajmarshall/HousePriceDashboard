<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into the House Price Dashboard. The integration covers both server-side events (FastAPI Python SDK) and client-side events (posthog-js snippet), giving a full picture of how users interact with the map, area detail pages, compare tool, and AI chat assistant.

## Changes made

**New files:**
- `server/analytics.py` — shared `Posthog` client instance, initialised from env vars, registered with `atexit` for clean shutdown
- `.env` — `POSTHOG_PROJECT_TOKEN` and `POSTHOG_HOST` added

**Modified files:**
- `pyproject.toml` — added `posthog>=3.0` dependency (run `uv sync` to install)
- `server/config.py` — reads `POSTHOG_PROJECT_TOKEN` and `POSTHOG_HOST` from environment
- `server/main.py` — added `lifespan` context manager that flushes PostHog on shutdown
- `server/chat.py` — captures `chat_message_sent` (per `/api/chat` request) and `sql_query_executed` (per tool call); reads `X-PostHog-Distinct-Id` header for cross-domain identity correlation; captures exceptions via `capture_exception`
- `public/index.html` — posthog-js snippet added
- `public/area-page.html` — posthog-js snippet added
- `public/compare.html` — posthog-js snippet added
- `public/js/main.js` — `postcode_searched`, `tab_switched`, `year_filter_changed`, `share_url_copied`
- `public/js/area.js` — `area_page_viewed`, `chart_downloaded`, `embed_code_copied`
- `public/js/compare.js` — `comparison_viewed`, `area_added_to_comparison`

## Events

| Event | Description | File |
|---|---|---|
| `chat_message_sent` | User submits a message to the AI chat assistant. Captures `message_count`. | `server/chat.py` |
| `sql_query_executed` | AI assistant runs a SQL query. Captures `success` and `row_count`. | `server/chat.py` |
| `postcode_searched` | User submits a map search. Captures `search_type` (city/postcode) and `success`. | `public/js/main.js` |
| `tab_switched` | User switches between Price and Change view tabs. Captures `tab`. | `public/js/main.js` |
| `year_filter_changed` | User changes the year slider. Captures `year` and `property_type`. | `public/js/main.js` |
| `share_url_copied` | User copies the current map URL via the share button. | `public/js/main.js` |
| `area_page_viewed` | User lands on an area detail page (/area/CODE). Captures `postcode_district`. | `public/js/area.js` |
| `chart_downloaded` | User downloads a chart image. Captures `chart_type` and `postcode_district`. | `public/js/area.js` |
| `embed_code_copied` | User copies an iframe embed snippet. Captures `chart_type` and `postcode_district`. | `public/js/area.js` |
| `comparison_viewed` | User loads the comparison page. Captures `area_count`. | `public/js/compare.js` |
| `area_added_to_comparison` | User adds a district to an existing comparison. Captures `postcode_district` and `total_areas`. | `public/js/compare.js` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- **Dashboard — Analytics basics:** https://eu.posthog.com/project/153406/dashboard/604223
- **Key events over time** (area views, searches, chat): https://eu.posthog.com/project/153406/insights/JTpicPeW
- **Search success vs failure:** https://eu.posthog.com/project/153406/insights/FGh5fvIc
- **User journey funnel** (search → area → compare): https://eu.posthog.com/project/153406/insights/LZrRDcqf
- **Content engagement** (downloads, embeds, shares): https://eu.posthog.com/project/153406/insights/p1hF8xcO
- **AI chat usage** (messages sent, SQL queries run): https://eu.posthog.com/project/153406/insights/7wmFJgv8

**To activate the integration**, run `uv sync` to install the `posthog` Python package, then restart the server.

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/integration-fastapi/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
