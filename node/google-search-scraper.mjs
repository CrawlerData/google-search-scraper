#!/usr/bin/env node
// Google Search scraper: Google SERP results to JSON and CSV.
// Organic results, ads, People Also Ask, related searches and SERP feature flags.
// Uses the CrawlerData API (https://crawlerdata.com). Node 18+, no packages. Set CRAWLERDATA_API_KEY first.
//
//   node google-search-scraper.mjs "best crm software"
//   node google-search-scraper.mjs --input ../examples/keywords.txt --country gb --device mobile
//   node google-search-scraper.mjs "project management software" --pages 2 --output-dir serp
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { CrawlerData, CrawlerDataError } from './crawlerdata.mjs';

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    input: { type: 'string', short: 'i' },
    country: { type: 'string', short: 'c', default: 'us' },
    language: { type: 'string', short: 'l', default: 'en' },
    device: { type: 'string', short: 'd', default: 'desktop' },
    pages: { type: 'string', short: 'p', default: '1' },
    'output-dir': { type: 'string', short: 'o', default: 'output' },
    help: { type: 'boolean', short: 'h' },
  },
});

if (opts.help) {
  console.log(`Usage: node google-search-scraper.mjs [query ...] [options]
  -i, --input FILE       text file with one query per line
  -c, --country CC       2-letter country code (default: us)
  -l, --language LL      2-letter language code (default: en)
  -d, --device D         desktop or mobile (default: desktop)
  -p, --pages N          result pages per query, 1-10, 1 credit each (default: 1)
  -o, --output-dir DIR   output folder (default: output)`);
  process.exit(0);
}

const queries = [...positionals];
if (opts.input) {
  queries.push(...readFileSync(opts.input, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')));
}
const pages = Number(opts.pages);
if (!queries.length || !(pages >= 1 && pages <= 10) || !['desktop', 'mobile'].includes(opts.device)) {
  console.error('Give at least one query (or --input FILE), --pages 1-10 and --device desktop|mobile. See --help.');
  process.exit(1);
}

const domain = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};
const csvCell = (v) => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (fields, rows) => [fields.join(','), ...rows.map((r) => fields.map((f) => csvCell(r[f])).join(','))].join('\n') + '\n';

const ORGANIC = ['query', 'country', 'device', 'page', 'position', 'rank', 'title', 'link', 'domain', 'displayed_link', 'snippet'];
const ADS = ['query', 'country', 'device', 'page', 'position', 'title', 'link', 'domain', 'displayed_link', 'snippet'];
const FEATURES = ['query', 'country', 'device', 'page', 'total_results', 'organic_count', 'ads_count', 'has_ai_overview',
  'ai_overview_sources', 'people_also_ask_count', 'local_pack_count', 'top_stories_count', 'has_knowledge_panel',
  'related_searches_count', 'people_also_ask', 'related_searches'];

let client;
try {
  client = new CrawlerData();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const { country, language, device } = opts;
const raw = [], organic = [], ads = [], features = [];
for (const query of queries) {
  let rank = 0;
  const seen = new Set();
  for (let page = 1; page <= pages; page++) {
    let r;
    try {
      r = await client.live('google-search', { query, country, language, device, page });
    } catch (err) {
      if (err instanceof CrawlerDataError && [401, 402].includes(err.status)) {
        console.error(err.message);
        process.exit(1);
      }
      console.error(`[skip] "${query}" page ${page}: ${err.message}`);
      break;
    }
    raw.push(r);
    const results = r.organic_results ?? [];
    let dupes = 0;
    for (const o of results) {
      // Later pages can repeat results already seen on earlier pages: count each URL once.
      if (seen.has(o.link)) { dupes++; continue; }
      seen.add(o.link);
      organic.push({ query, country, device, page, rank: ++rank, ...o, domain: domain(o.link) });
    }
    for (const a of r.ads ?? []) ads.push({ query, country, device, page, ...a, domain: domain(a.link) });
    const paa = r.people_also_ask ?? [];
    const related = r.related_searches ?? [];
    const f = {
      query, country, device, page,
      total_results: r.search_information?.total_results,
      organic_count: results.length,
      ads_count: (r.ads ?? []).length,
      has_ai_overview: Boolean(r.ai_overview),
      ai_overview_sources: r.ai_overview?.sources?.length ?? 0,
      people_also_ask_count: paa.length,
      local_pack_count: (r.local_pack ?? []).length,
      top_stories_count: (r.top_stories ?? []).length,
      has_knowledge_panel: Boolean(r.knowledge_panel),
      related_searches_count: related.length,
      people_also_ask: paa.map((q) => q.question).join(' | '),
      related_searches: related.map((q) => q.query).join(' | '),
    };
    features.push(f);
    console.log(`"${query}" p${page} (${country}, ${device}): ${f.organic_count} organic, ${f.ads_count} ads, ` +
      `AI overview: ${f.has_ai_overview ? 'yes' : 'no'}, PAA: ${f.people_also_ask_count}, related: ${f.related_searches_count}` +
      (dupes ? `, ${dupes} repeated from earlier pages skipped` : ''));
    if (!results.length) break;
  }
}

const dir = opts['output-dir'];
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'results.json'), JSON.stringify(raw, null, 2));
writeFileSync(join(dir, 'organic.csv'), toCsv(ORGANIC, organic));
writeFileSync(join(dir, 'ads.csv'), toCsv(ADS, ads));
writeFileSync(join(dir, 'serp_features.csv'), toCsv(FEATURES, features));
console.log(`Wrote results.json, organic.csv (${organic.length} rows), ads.csv (${ads.length} rows) and ` +
  `serp_features.csv to ${dir}/. Credits used: ${client.creditsUsed}`);
