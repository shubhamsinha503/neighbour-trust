# Neighbour Trust App — Solving the Neighborhood Data Gap

*Working strategy doc — v1, 17 Aug 2026*

## The problem, precisely

A home buyer in India making a multi-crore purchase decision can inspect the flat, but almost never the neighborhood. School quality, crime, air quality, water reliability, power outage frequency, and future infrastructure (metro lines, industrial corridors, new highways) all materially affect long-term value and quality of life — and today buyers get this from a broker's word, a WhatsApp forward, or a walk around the block on a Sunday. None of that is data-driven, verifiable, or comparable across localities.

Note on "openaclaw": I'm reading this as "using AI agents/LLM tooling (Claude and similar) plus open data" rather than a specific named product — I couldn't find a tool by that exact name. If you meant something specific, tell me and I'll adjust.

## The real constraint: data exists, but it's scattered and uneven

This is not a "no data" problem, it's a "fragmented, inconsistent, and unevenly granular data" problem. What's actually available in India, category by category:

**Air quality** — genuinely good. CPCB real-time monitors are published on the [data.gov.in Real-Time AQI dataset](https://www.data.gov.in/catalog/real-time-air-quality-index), and [AQICN](https://aqicn.org/api/) offers a free-tier API with station-level data for most Indian metros. [IQAir](https://www.iqair.com/in-en/air-pollution-data-api) is a paid alternative with denser coverage. Weak point: tier-2/3 cities have far fewer monitoring stations, so locality-level AQI there is an estimate, not a measurement.

**Schools** — data exists but isn't a "quality score." [UDISE+](https://udise.net/) (Unified District Information System for Education) publishes school-level data — enrollment, infrastructure, teacher counts — via the government's Samagra Shiksha portal, mirrored on the [India Data Portal](https://ckandev.indiadataportal.com/dataset/udise/resource/457fddf1-982f-4c85-855d-5095578accc1). There's no ready-made "this school is good" metric — you'd construct a proxy score from pupil-teacher ratio, board pass rates, and infrastructure fields yourself.

**Crime** — the weakest link. NCRB publishes crime statistics, but at [district level, not locality/ward level](https://www.data.gov.in/dataset-group-name/Crime), and with a real reporting lag (often a year-plus). A few city police departments (Delhi, Bengaluru, Mumbai) publish FIR/incident dashboards, but formats aren't standardized and there's no unified API. Any "locality safety score" built purely from official data will be coarse — this is a place where the product has to be honest about confidence levels rather than presenting false precision, and where resident-reported data adds real value.

**Water** — patchy and state-by-state. There's no single "will this locality have water on Tuesdays" API. What exists: the [NITI Aayog Composite Water Management Index](https://www.data.gov.in/dataset-group-name/water-quality), Jal Jeevan Mission dashboards, and Central Ground Water Board groundwater-level data. Municipal supply schedules are usually PDFs or ward-office notices, not structured data — this needs local scraping/partnerships city by city.

**Power outages** — essentially unpublished in usable form. A [recent independent review of DISCOM outage reporting](https://blog.theleapjournal.org/2025/09/a-review-of-outage-reporting-by-indian.html) found most discoms don't publish granular, analyzable outage logs; researchers had to build their own datasets from raw discom feeds (see the [Delhi outage analysis project](https://github.com/TrustBridge-Foundation/AnalysingPowerOutage_Delhi_2024-25) as an example of what's involved). This is realistically a crowd-sourced-data category for the foreseeable future, not an API-pull category.

**Future infrastructure / builder credibility** — RERA project registrations are the key source (project timelines, builder track record, litigation status), but every state runs its own RERA portal with no unified API — this is a scraping/partnership problem, not a data-availability problem. Metro/highway/industrial-corridor plans come from state urban development authority master plans (e.g., DDA, BDA), published as PDFs and GIS shapefiles rather than APIs.

**Geospatial base layer** — good and free: OpenStreetMap (via the Overpass API) and Overture Maps give distances to hospitals, schools, transit, and amenities without needing Google's paid Places API.

## Why "just use an LLM" doesn't solve this alone

An LLM can't know a locality's AQI or crime rate from training — that data is either absent, outdated, or too granular to have been memorized. The role for Claude (or any agent framework) here isn't "ask the model for the answer," it's using agents as the **ingestion, reconciliation, and explanation layer** on top of real, sourced data:

- **Ingestion agents** that pull from each open API/portal on a schedule, normalize wildly different formats (PDF tables, shapefiles, JSON, scraped HTML) into one schema, and geocode everything to a common grid (e.g., H3 hexagons) so disparate sources can be joined by location.
- **Reconciliation agents** that flag when sources disagree, estimate confidence/freshness per data point, and explicitly mark "no data available" instead of guessing — this is the difference between a trustworthy product and a hallucinating one.
- **Retrieval-grounded Q&A** — a buyer asks "is this area prone to waterlogging?" and the agent answers from the ingested, cited dataset (RAG over structured + document data), not from the model's general knowledge. Every claim should carry a source and a "last updated" date.
- **Gap-filling via community input** — for crime and power (the categories with weak official data), the product needs a resident-reporting loop, and an agent's job is to reconcile crowd-sourced reports against whatever sparse official data exists, weighting for reporter credibility over time. This is also where the "Neighbour Trust" name earns its keep — trust comes from real neighbours confirming or correcting the data, not just from an algorithm.

This is a good fit for Claude's [Agent SDK / MCP](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk) pattern: each data source (data.gov.in, AQICN, UDISE+, a state RERA portal, OSM) becomes its own MCP-style tool/connector, and an orchestrating agent decides which sources to pull, reconciles conflicts, and produces the buyer-facing report and answers.

## Proposed product shape

A **Neighbourhood Trust Score**, broken into the six categories above, each shown with its own subscore, its data sources, a freshness/confidence indicator, and (where relevant) a note that the number is a community-supplemented estimate rather than an official measurement. This is a deliberately different bet from what competitors already do — NoBroker's [Locality IQ](https://www.nobroker.in/locality-iq/) covers lifestyle, price trends, and general amenities but doesn't appear to expose sourced safety, school, or air-quality data with confidence levels; 99acres and Housing.com have similar "locality guide" content that's editorial rather than data-driven. The differentiation is being the one that shows its work — real sources, real dates, real confidence — rather than marketing copy.

## City selection: data-availability comparison

The question isn't "which cities have data" — some data exists everywhere — it's which cities let you ship *official*, locality-grain data on day one instead of leaning entirely on residents and news. Comparing the three markets under discussion (Bengaluru, Delhi NCT, and Gurugram) category by category:

| Category | Bengaluru | Delhi (NCT) | Gurugram |
|---|---|---|---|
| Air quality | Moderate — KSPCB has been expanding automated stations, but coverage is thinner than Delhi's | **Best in India** — roughly 40 CPCB/DPCC stations in the city alone, plus [CAQM adding 46 more across NCR](https://www.newsonair.gov.in/caqm-to-install-46-new-air-quality-monitoring-stations-in-delhi-ncr) | Good — falls under the same CAQM/NCR monitoring regime as Delhi, inherits regional station density |
| Crime/safety | **Best lead found** — Bengaluru City Police already publishes structured datasets through the [OpenCity civic-data portal](https://data.opencity.in/dataset?organization=bengaluru-city-police), a rare case of India crime data that's actually downloadable rather than locked in PDFs | Delhi Police runs an internal predictive crime-mapping system (CMAPS) but it isn't public; buyers are left with the same coarse NCRB/news picture as everywhere else | No distinct open source found; same NCRB/news baseline as most of India |
| Water | Good — BWSSB is a relatively digitized utility and Bengaluru has an active civic-tech scene (OpenCity itself is Bengaluru-rooted) that makes partnerships more plausible | Weaker on structured data, but Delhi Jal Board supply issues are constantly and specifically covered in local press — strong feed for the news-monitoring agent | Similar to Delhi — GMDA's chronic, well-documented "water woes" and waterlogging coverage make it a strong news-agent market even without a clean official feed |
| Power | No official-data lead found for BESCOM | **Existing head start** — independent researchers have already built and published cleaned outage datasets for [Delhi's three DISCOMs](https://blog.theleapjournal.org/2025/09/a-review-of-outage-reporting-by-indian.html), a real methodology to build from rather than starting cold | DHBVN has a public [power outage/theft portal page](https://www.dhbvn.org.in/web/portal/power-outage) worth investigating directly — unverified but a lead nothing else offers |
| Infrastructure/RERA | K-RERA — standard state portal, scrape-only | Delhi RERA — standard state portal, scrape-only | HRERA — standard state portal, scrape-only, but frequently referenced in buyer guides, suggesting healthy registration compliance in this market |
| Schools | UDISE+ — national dataset, roughly equal baseline everywhere; not a differentiator between these cities | | |

One structural point matters more than any single row above: **"Delhi NCR" is not one regulatory jurisdiction.** Delhi (NCT), Gurugram (Haryana), and Noida/Ghaziabad (UP) each have entirely separate police forces, DISCOMs, water utilities, and RERAs. Treating "Delhi NCR" as a single launch city means building and maintaining two or three complete sets of agents, not one — that cost is invisible until you actually start wiring up the scrapers.

Given that, the stronger pairing for an MVP is **Bengaluru + Gurugram**, not Bengaluru + all of Delhi NCR:

- Bengaluru brings the single best official crime-data lead in the country, a digitized water utility, and a large base of exactly the affluent, data-literate tech-sector buyers this product is built for.
- Gurugram matches that same buyer persona — dense corporate and tech employment, high-value real estate — while inheriting Delhi-NCR's strong regional air-quality network, sitting on an unverified-but-promising DHBVN outage-data lead, and offering by far the most news-covered, shareable water/waterlogging story of any market considered, which plays directly to the news-monitoring agent design.
- It keeps the MVP to two full regulatory stacks (Karnataka, Haryana) instead of three or four. Delhi NCT itself is a legitimate third city to add later — its AQI density and the existing DISCOM outage research are real advantages — but it adds a third full stack for a value-add Gurugram substantially already covers on the NCR side.

## Realistic MVP sequencing

1. **Launch in Bengaluru and Gurugram** and ship AQI (live), schools (UDISE-derived proxy score), OSM-based amenity/transit access, and RERA project data (scraped, K-RERA and HRERA respectively) for those two cities only. Be explicit that crime and power are "community-sourced, limited data" from day one rather than pretending otherwise — though Bengaluru's OpenCity-hosted crime datasets and Gurugram's DHBVN outage page are worth a hands-on evaluation before writing that off entirely.
2. **Add resident reporting** for crime perception and power-outage frequency, with basic anti-abuse/credibility weighting — this is the category where you can't wait for good official data to arrive.
3. **Layer in the agent-based Q&A** once the base dataset is trustworthy enough to ground answers in — this is a multiplier on top of good data, not a substitute for it.
4. **Consider a B2B angle** — home-loan lenders and real estate portals also want this data; licensing the trust-score API could be a faster path to revenue than direct-to-consumer.

## Agent specification, per category

One agent per data category, each wrapped as its own MCP-style tool so an orchestrator can call whichever ones a given query needs. Every agent returns the same envelope regardless of category — `source_name`, `source_url`, `fetched_at`, `data_vintage` (how old the underlying data actually is, not when it was fetched), `geocode` (H3 cell or lat/long), and `confidence` (High / Medium / Low / Community-estimated) — so the orchestrator and the UI can treat all six uniformly.

**Schools agent**
Sources: UDISE+ school-level records (enrollment, pupil-teacher ratio, infrastructure fields) via the India Data Portal mirror; state board pass-rate publications (CBSE/state boards) where available; OSM for school locations and walking distance. Fetch schedule: annual full refresh (matches UDISE+'s own update cadence), quarterly check for newly registered schools. Output per school: `name, board, distance_km, pupil_teacher_ratio, infra_score, pass_rate_if_available`. Confidence: High only when both UDISE infra data and a board pass rate exist and are under 18 months old; Medium when only UDISE fields exist; Low when the score is extrapolated from district averages because no school-level record exists.

**Crime/safety agent**
Sources: NCRB annual reports (district-level only), city police FIR/incident dashboards where published (Delhi, Bengaluru, Mumbai currently have some form of this), resident-submitted incident reports. Fetch schedule: NCRB annual, police dashboards monthly where they exist, resident reports ingested continuously. Output: `official_crime_rate_district` (always labeled district-level, never presented as locality-specific), `resident_reports_90d_count`, `blended_safety_perception_score`. Confidence: capped at Medium even with full official data, because district-level numbers don't reflect locality variance; drops to "Community-estimated" wherever the score leans mainly on resident reports, which is most of the country outside a few metros. Resident reports get weighted by how long the reporter has been verified in that locality, not treated as equal-weight votes. A third source worth adding here: locality-tagged news coverage (see the News Monitoring Agent below) — it won't catch everyday crime, but it does surface named incidents (chain snatching, break-ins, assaults) tied to a specific street or colony that neither NCRB nor most police dashboards provide at that resolution.

**Air quality agent**
Sources: CPCB real-time monitors via data.gov.in, AQICN station API, optionally IQAir for denser paid coverage. Fetch schedule: hourly pulls, with rolling 24-hour, 7-day, and annual averages computed and cached. Output: `current_aqi, pm2_5, pm10, nearest_station_km, trend_30d`. Confidence: High when the nearest monitoring station is under ~5km; Low (and flagged as interpolated) beyond that — this matters a lot outside metro cores, where station density drops fast.

**Water agent**
Sources: NITI Aayog Composite Water Management Index and CGWB groundwater levels (state/district granularity), Jal Jeevan Mission dashboards, municipal supply schedules (scraped city by city, since these are rarely APIs), resident reports on actual supply frequency and tanker dependence. Fetch schedule: groundwater/index data quarterly, municipal schedules scraped weekly, resident input continuous. Output: `reported_supply_frequency, groundwater_trend, tanker_dependency_pct`. Confidence: Medium where a municipal schedule was successfully scraped and corroborated by residents; Community-estimated where it's resident-report-only, which will be most localities initially. Local news is a genuinely strong third source for water specifically — water crises, pipeline bursts, tanker-mafia stories, and contamination incidents get covered heavily by vernacular local press even when no official dashboard exists, often before residents think to report it themselves.

**News/media monitoring agent** *(shared source feeding the crime and water agents, not a standalone category)*
This is the most scalable way to get locality-grain signal in exactly the two categories where official India data is weakest. Two complementary approaches: the [GDELT Project](https://www.gdeltproject.org/) — a free, continuously-updated, geotagged global news-event database (the [DOC 2.0 API](https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/) for full-text article search, [GEO 2.0](https://blog.gdeltproject.org/gdelt-geo-2-0-api-debuts/) for geotagging) — for structured event detection at scale; and targeted keyword search over [NewsAPI](https://newsapi.org/s/india-news-api) / Google News RSS using `"<locality name>" + "<city>" + ("theft" OR "water crisis" OR "tanker" OR ...)` queries for the cases GDELT's event taxonomy doesn't cleanly categorize. An extraction agent then reads each candidate article, decides whether it actually describes a location-specific incident (vs. a city-wide policy story), pulls out the locality name, date, and incident type, geocodes it to the nearest H3 cell, and dedupes across outlets covering the same event.

Two caveats that need to be visible in the product, not just known internally: coverage is a function of media market size and what's "newsworthy," not of actual incident rate — a well-covered locality in a large city will look artificially worse than a similar but under-covered one, so this should never be blended into a single number without a coverage-normalization step, and ideally shown as "N incidents reported in local press over 12 months" rather than a rate. And most hyperlocal incident reporting in India runs in vernacular press (Hindi, Kannada, Marathi, Tamil, Telugu, Bengali, etc.), not English, so the search and extraction step needs multilingual coverage from day one or it will systematically miss non-metro, non-English-dominant markets — which is most of the country.

**Power agent**
Sources: DISCOM outage feeds — treat as best-effort, since the Leap Blog review found most discoms don't publish analyzable logs; independent outage-tracking datasets where they exist (the Delhi TrustBridge project is a model for what a city-specific build looks like); resident-submitted outage logs as the primary source in practice. Fetch schedule: resident reports near-real-time; official scraping monthly best-effort. Output: `avg_outage_hours_per_week_reported, official_data_available (bool)`. Confidence: almost always Community-estimated at launch — this should be stated plainly in the UI rather than implied to be measured.

**Infrastructure/future-growth agent**
Sources: state RERA portals (project registrations, builder track record, litigation flags) scraped per state since there's no unified API; urban development authority master plans (metro/highway/industrial-corridor GIS layers or PDFs); monitored news/government press releases for upcoming project announcements. Fetch schedule: RERA scrape weekly, master plans checked quarterly (they change rarely), news monitoring as a continuous digest. Output: `nearby_rera_projects[], upcoming_infra_within_5km[]` (each with project name, type, expected completion, source, confidence), `builder_track_record_score`. Confidence: High for registered RERA projects with a stated date; Low for anything sourced only from news/press-release monitoring until it shows up in an official plan.

**Orchestrator**
A single "locality report" agent sits above all six, callable with a location (address, pincode, or lat/long resolved to an H3 cell). It decides which sub-agents to call based on the query, merges their envelopes into one report keyed by that H3 cell, computes the weighted composite Neighbourhood Trust Score, and explicitly surfaces disagreements — e.g. "official water data says adequate supply, but 12 resident reports in the last 90 days describe tanker dependence" — rather than silently averaging them away. This reconciliation-and-disclosure behavior is the actual product differentiator, more than any single data source.

## Consumer psychology → UI design decisions

The first mockup was clean but generic. A second pass asked a sharper question: what actually makes a buyer trust a single number enough to act on it, and what makes them forward the report to a friend or family member who's also house-hunting? Five pieces of established research drove concrete design changes, not just visual polish:

**Prominence–Interpretation Theory (Fogg & the Stanford Web Credibility research)** — people only judge the credibility of a cue they actually notice; an accurate-but-buried cue does zero trust work. The source list (CPCB, NCRB, UDISE+, RERA, BWSSB) and the per-category confidence tags moved out of a footer legend into the main flow, directly under the score, because that's the design's actual credibility engine and it was previously invisible unless someone scrolled to the bottom.

**The pratfall effect (Aronson, 1966) and two-sided messaging (Hovland & Weiss)** — a source that visibly admits what it doesn't know is judged more trustworthy than one that's uniformly confident, but only once basic competence is already established. That's why the "we show what we don't know, too" banner sits below the verdict and score, not above it — it has to read as an honest admission from a source that's already demonstrated it knows what it's talking about, not as an opening disclaimer.

**Loss aversion (Kahneman & Tversky, prospect theory)** — people weigh a flagged risk roughly twice as heavily as an equivalent gain, and remember it better. Burying "power" as one equal-sized card among six understates how much it should matter to the buyer. Pulling out a single "Biggest watch-out" callout, prominently placed and visually distinct, matches how the information will actually get used and shared.

**Cialdini's social proof** — "184 verified residents" and "2.3K buyers viewed this month" are concrete numbers, not marketing adjectives, and they do real trust-building work specifically in the categories (safety, water, power) where official data is thinnest and residents are effectively substituting for it.

**Jonah Berger's STEPPS framework (*Contagious*)** — the mechanism most directly tied to "would a customer recommend this to another customer." Home buying in India is very often a family decision, which makes a shareable, WhatsApp-preview-shaped report card (score, verdict, three highlights, one watch-out, a neighbourtrust.app link) a real growth loop rather than a decorative feature: it carries practical value for the recipient and social currency for the sender, which is what Berger's research identifies as the actual drivers of word-of-mouth sharing, not the raw quality of the underlying content alone.

The updated mockup implements all five directly — verdict headline, biggest-watch-out card, honesty banner, social-proof strip, source strip, and the shareable card — plus a warmer visual treatment (a map-style hero header, a deliberate brand green instead of generic blue) since "appealing" and "credible" needed to both move together, not trade off against each other.

## Open questions worth deciding before building

- Which 2–3 cities to launch in, based on where you can get water/power data through partnerships (not just scraping) — this probably determines feasibility more than anything else.
- Whether crime/safety is presented as a hard number at all, given how coarse official data is, or reframed as a qualitative "resident-reported safety perception" to avoid implying false precision.
- Build-vs-partner for RERA data — several vendors already scrape and normalize RERA data commercially (worth pricing out vs. building the scraper yourselves).

---

Sources:
- [Real-Time Air Quality Index — data.gov.in](https://www.data.gov.in/catalog/real-time-air-quality-index)
- [AQICN Air Quality API](https://aqicn.org/api/)
- [IQAir Air Pollution Data API (India)](https://www.iqair.com/in-en/air-pollution-data-api)
- [UDISE+ / Understanding UDISE](https://udise.net/)
- [UDISE school data on India Data Portal](https://ckandev.indiadataportal.com/dataset/udise/resource/457fddf1-982f-4c85-855d-5095578accc1)
- [Crime Statistics — data.gov.in](https://www.data.gov.in/dataset-group-name/Crime%20Statistics)
- [NCRB dataset group — data.gov.in](https://www.data.gov.in/ministrydepartment/National%20Crime%20Records%20Bureau%20(NCRB))
- [Water Quality dataset group — data.gov.in](https://www.data.gov.in/dataset-group-name/water-quality)
- [A Review of Outage Reporting by Indian DISCOMs — The Leap Blog](https://blog.theleapjournal.org/2025/09/a-review-of-outage-reporting-by-indian.html)
- [Analysing Power Outage Delhi 2024–25 (GitHub)](https://github.com/TrustBridge-Foundation/AnalysingPowerOutage_Delhi_2024-25)
- [NoBroker Locality IQ](https://www.nobroker.in/locality-iq/)
- [Building agents with the Claude Agent SDK — Anthropic](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk)
