# Google Search Scraper (Python and Node.js)

Scrape Google Search results to JSON and CSV from the command line. For each keyword you get the organic results (position, title, link, domain, snippet), ads, People Also Ask questions, related searches, and flags for SERP features such as the AI Overview, local pack, top stories and knowledge panel — for any of 31 countries, on desktop or mobile, across up to 10 result pages. Python (one dependency, `requests`) and Node.js 18+ (no dependencies) versions are included.

> **Uses the CrawlerData API — you need an API key** (free trial credits available at https://app.crawlerdata.com/register). Each result page costs 1 credit.

## Features

- `organic.csv`: `query, country, device, page, position, rank, title, link, domain, displayed_link, snippet` (real destination links, not Google redirect URLs)
- `ads.csv`: text ads with title, link, domain and snippet
- `serp_features.csv`: one row per query and page with counts and flags: organic, ads, AI Overview (and its number of sources), People Also Ask, local pack, top stories, knowledge panel, related searches, plus the PAA questions and related searches as text
- `results.json`: the full API response for every page, including the AI Overview text and sources, local pack, top stories and knowledge panel
- Desktop or mobile, 31 countries, any language, 1-10 pages per keyword
- `rank` is the overall position across pages; URLs that Google repeats on a later page are counted once
- Retries rate limits and failed jobs (failed jobs are not charged)

## Quickstart (Python)

```bash
git clone https://github.com/CrawlerData/google-search-scraper.git
cd google-search-scraper/python
pip install -r requirements.txt

export CRAWLERDATA_API_KEY="your_api_key"        # PowerShell: $env:CRAWLERDATA_API_KEY="your_api_key"

python google_search_scraper.py "best crm software"
python google_search_scraper.py --input ../examples/keywords.txt --country gb --device mobile
python google_search_scraper.py "project management software" --pages 2 --output-dir serp
```

## Quickstart (Node.js 18+)

```bash
cd google-search-scraper/node
export CRAWLERDATA_API_KEY="your_api_key"

node google-search-scraper.mjs "best crm software"
node google-search-scraper.mjs --input ../examples/keywords.txt --device mobile --pages 2 -o serp
```

No `npm install` needed: the script uses Node's built-in `fetch`.

## Sample output

Real run on 13 October 2026 with [`examples/keywords.txt`](examples/keywords.txt):

```text
$ python google_search_scraper.py --input ../examples/keywords.txt
'best crm software' p1 (us, desktop): 9 organic, 0 ads, AI overview: yes, PAA: 4, related: 8
'how to make cold brew coffee' p1 (us, desktop): 7 organic, 0 ads, AI overview: yes, PAA: 4, related: 8
Wrote results.json, organic.csv (16 rows), ads.csv (0 rows) and serp_features.csv to output/. Credits used: 2
```

`organic.csv` ([sample](examples/sample-organic.csv)):

| query | rank | title | domain |
| --- | --- | --- | --- |
| best crm software | 1 | Choosing The Best CRM Software In 2026 | salesforce.com |
| best crm software | 2 | 27 of the Best CRM Software Companies to Know About for ... | solutionsreview.com |

`serp_features.csv` ([sample](examples/sample-serp-features.csv)):

```csv
query,country,device,page,total_results,organic_count,ads_count,has_ai_overview,ai_overview_sources,people_also_ask_count,local_pack_count,top_stories_count,has_knowledge_panel,related_searches_count,people_also_ask,related_searches
best crm software,us,desktop,1,95,9,0,True,7,4,0,0,False,8,Which CRM system is best? | What is the #1 CRM platform? | What is the fastest growing CRM? | Which CRM is best for beginners?,Best crm software free | Top 10 CRM software | ...
```

Node.js, two pages on mobile (same day):

```text
$ node google-search-scraper.mjs "project management software" --pages 2 --device mobile
"project management software" p1 (us, mobile): 8 organic, 0 ads, AI overview: yes, PAA: 4, related: 5
"project management software" p2 (us, mobile): 12 organic, 2 ads, AI overview: no, PAA: 0, related: 5
Wrote results.json, organic.csv (20 rows), ads.csv (2 rows) and serp_features.csv to output/. Credits used: 2
```

A full API response for one keyword is in [`examples/sample-result.json`](examples/sample-result.json).

## Cost per run

1 credit per keyword per page. 2 keywords × 1 page = 2 credits; 100 keywords × 3 pages = 300 credits. Desktop and mobile are separate requests. Packs run from $1.00 down to $0.30 per 1,000 credits ([pricing](https://crawlerdata.com/pricing)); failed jobs are free.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `queries` | | One or more keywords |
| `-i, --input FILE` | | One keyword per line (`#` lines skipped) |
| `-c, --country` | `us` | us, gb, ca, au, de, fr, nl, it, es, pt, be, at, ch, se, no, dk, fi, ie, pl, cz, il, ae, in, jp, kr, sg, mx, br, nz, za, tr |
| `-l, --language` | `en` | 2-letter language code |
| `-d, --device` | `desktop` | `desktop` or `mobile` |
| `-p, --pages N` | `1` | Result pages per keyword, 1-10 (1 credit each) |
| `-o, --output-dir` | `output` | Where the four files go |

## Notes on the data

- **Page 2+ can repeat earlier results.** In our tests Google's second page sometimes included a few URLs already on page 1. The scripts skip those when assigning `rank` and print how many were skipped; `results.json` keeps the raw pages.
- **Ads can also show up among organic results** on some pages (we saw this on a mobile page 2). If you need clean organic rankings, compare `organic.csv` domains with `ads.csv` for the same page.
- **Organic count per page varies** (7-12 in our tests) because AI Overviews, PAA boxes and other features take space.
- **Use plain keywords.** Advanced operator queries (such as `site:`) are not a reliable way to use this endpoint today.
- `total_results` is whatever Google reports and is not a reliable count.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `HTTP 401` | The API key is missing or wrong. Check `echo $CRAWLERDATA_API_KEY` (or `$env:CRAWLERDATA_API_KEY` in PowerShell) and create a key under API Access in the [dashboard](https://app.crawlerdata.com). |
| `HTTP 402` | You are out of credits. Buy a credit pack in the dashboard (from $1.00 down to $0.30 per 1,000 credits, see [pricing](https://crawlerdata.com/pricing)). |
| `HTTP 429` | Rate limit: 100 requests per minute and 20 per second per key. The client waits until `X-RateLimit-Reset` and retries automatically; for big batches, spread requests out. |
| Timeouts | Live requests return when Google has been fetched: a few seconds for search, 30 to 120 seconds for Google Shopping sellers. The client uses a 200 second timeout. |
| `job ... failed` | The HTTP call worked but the job did not (for example Google blocked that attempt). Failed jobs cost 0 credits and the client retries them twice before giving up. |

## Links

- [CrawlerData](https://crawlerdata.com)
- [Google Search API](https://crawlerdata.com/apis/google-search-api): parameters and a full example response
- [API docs](https://app.crawlerdata.com/docs)
- [SerpApi alternatives](https://crawlerdata.com/blog/serpapi-alternatives) and [Cheapest SERP API](https://crawlerdata.com/blog/cheapest-serp-api)

## More CrawlerData examples

| Repo | What it does |
| --- | --- |
| [google-shopping-scraper](https://github.com/CrawlerData/google-shopping-scraper) | Search Google Shopping, export products to CSV/JSON (Python + Node.js) |
| [google-shopping-sellers-scraper](https://github.com/CrawlerData/google-shopping-sellers-scraper) | Every seller and price for one product, as a comparison table |
| [google-shopping-price-tracker](https://github.com/CrawlerData/google-shopping-price-tracker) | Scheduled price history in SQLite, CSV export and an HTML chart |
| [competitor-price-monitoring](https://github.com/CrawlerData/competitor-price-monitoring) | Your catalog vs Google Shopping sellers, with undercut alerts |
| [map-violation-monitor](https://github.com/CrawlerData/map-violation-monitor) | Flag sellers below MAP with timestamped evidence |
| [google-search-scraper](https://github.com/CrawlerData/google-search-scraper) | Google SERP to JSON/CSV: organic, ads, People Also Ask, AI Overview (Python + Node.js) |
| [google-rank-tracker](https://github.com/CrawlerData/google-rank-tracker) | Daily keyword positions by country and device, with a change report |
| [google-local-business-leads](https://github.com/CrawlerData/google-local-business-leads) | Google Local results to a lead list CSV |
| [google-news-scraper](https://github.com/CrawlerData/google-news-scraper) | Brand and keyword news monitoring to CSV and JSON Feed |
| [google-search-mcp-server](https://github.com/CrawlerData/google-search-mcp-server) | Connect Claude, Cursor or n8n to the CrawlerData MCP server |
| [crawlerdata-examples](https://github.com/CrawlerData/crawlerdata-examples) | Python, Node.js and curl snippets for every endpoint |

## License

MIT. See [LICENSE](LICENSE). Google and Google Shopping are trademarks of Google LLC; this project is not affiliated with Google.
