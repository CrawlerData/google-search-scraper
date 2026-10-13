#!/usr/bin/env python3
"""Google Search scraper: Google SERP results to JSON and CSV.

Organic results, ads, People Also Ask, related searches and SERP feature flags (AI Overview, local
pack, top stories, knowledge panel) for one or many keywords, any country, desktop or mobile.

Uses the CrawlerData API (https://crawlerdata.com). Set CRAWLERDATA_API_KEY first.

    python google_search_scraper.py "best crm software"
    python google_search_scraper.py --input ../examples/keywords.txt --country gb --device mobile
    python google_search_scraper.py "project management tools" --pages 3 --output-dir serp
"""
import argparse
import csv
import json
import os
import sys
from urllib.parse import urlparse

from crawlerdata_client import CrawlerData, CrawlerDataError

ORGANIC_FIELDS = ["query", "country", "device", "page", "position", "rank", "title", "link", "domain",
                  "displayed_link", "snippet"]
ADS_FIELDS = ["query", "country", "device", "page", "position", "title", "link", "domain", "displayed_link",
              "snippet"]
FEATURE_FIELDS = ["query", "country", "device", "page", "total_results", "organic_count", "ads_count",
                  "has_ai_overview", "ai_overview_sources", "people_also_ask_count", "local_pack_count",
                  "top_stories_count", "has_knowledge_panel", "related_searches_count", "people_also_ask",
                  "related_searches"]


def domain(url):
    try:
        host = urlparse(url or "").netloc.lower()
    except ValueError:
        return ""
    return host[4:] if host.startswith("www.") else host


def features(query, args, page, r):
    paa = r.get("people_also_ask") or []
    related = r.get("related_searches") or []
    ai = r.get("ai_overview")
    return {
        "query": query, "country": args.country, "device": args.device, "page": page,
        "total_results": (r.get("search_information") or {}).get("total_results"),
        "organic_count": len(r.get("organic_results") or []),
        "ads_count": len(r.get("ads") or []),
        "has_ai_overview": bool(ai),
        "ai_overview_sources": len((ai or {}).get("sources") or []),
        "people_also_ask_count": len(paa),
        "local_pack_count": len(r.get("local_pack") or []),
        "top_stories_count": len(r.get("top_stories") or []),
        "has_knowledge_panel": bool(r.get("knowledge_panel")),
        "related_searches_count": len(related),
        "people_also_ask": " | ".join(q.get("question", "") for q in paa),
        "related_searches": " | ".join(q.get("query", "") for q in related),
    }


def write_csv(path, fields, rows):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def main():
    ap = argparse.ArgumentParser(description="Scrape Google Search results to JSON and CSV.")
    ap.add_argument("queries", nargs="*", help="search terms")
    ap.add_argument("-i", "--input", help="text file with one query per line")
    ap.add_argument("-c", "--country", default="us", help="2-letter country code (default: us)")
    ap.add_argument("-l", "--language", default="en", help="2-letter language code (default: en)")
    ap.add_argument("-d", "--device", choices=["desktop", "mobile"], default="desktop")
    ap.add_argument("-p", "--pages", type=int, default=1, help="result pages per query, 1-10 (1 credit each)")
    ap.add_argument("-o", "--output-dir", default="output", help="folder for results (default: output)")
    args = ap.parse_args()

    queries = list(args.queries)
    if args.input:
        with open(args.input, encoding="utf-8") as f:
            queries += [line.strip() for line in f if line.strip() and not line.startswith("#")]
    if not queries:
        ap.error("give at least one query or --input FILE")
    if not 1 <= args.pages <= 10:
        ap.error("--pages must be between 1 and 10")

    try:
        client = CrawlerData()
    except CrawlerDataError as exc:
        sys.exit(str(exc))

    os.makedirs(args.output_dir, exist_ok=True)
    raw, organic, ads, feats = [], [], [], []
    for query in queries:
        rank, seen = 0, set()
        for page in range(1, args.pages + 1):
            params = {"query": query, "country": args.country, "language": args.language,
                      "device": args.device, "page": page}
            try:
                r = client.live("google-search", params)
            except CrawlerDataError as exc:
                if exc.status in (401, 402):
                    sys.exit(str(exc))
                print(f"[skip] {query!r} page {page}: {exc}", file=sys.stderr)
                break
            raw.append(r)
            results = r.get("organic_results") or []
            dupes = 0
            for o in results:
                # Later pages can repeat results already seen on earlier pages: count each URL once.
                if o.get("link") in seen:
                    dupes += 1
                    continue
                seen.add(o.get("link"))
                rank += 1
                organic.append({"query": query, "country": args.country, "device": args.device, "page": page,
                                "rank": rank, **o, "domain": domain(o.get("link"))})
            for a in r.get("ads") or []:
                ads.append({"query": query, "country": args.country, "device": args.device, "page": page,
                            **a, "domain": domain(a.get("link"))})
            f = features(query, args, page, r)
            feats.append(f)
            print(f"{query!r} p{page} ({args.country}, {args.device}): {f['organic_count']} organic, "
                  f"{f['ads_count']} ads, AI overview: {'yes' if f['has_ai_overview'] else 'no'}, "
                  f"PAA: {f['people_also_ask_count']}, related: {f['related_searches_count']}"
                  + (f", {dupes} repeated from earlier pages skipped" if dupes else ""))
            if not results:
                break

    with open(os.path.join(args.output_dir, "results.json"), "w", encoding="utf-8") as f:
        json.dump(raw, f, indent=2, ensure_ascii=False)
    write_csv(os.path.join(args.output_dir, "organic.csv"), ORGANIC_FIELDS, organic)
    write_csv(os.path.join(args.output_dir, "ads.csv"), ADS_FIELDS, ads)
    write_csv(os.path.join(args.output_dir, "serp_features.csv"), FEATURE_FIELDS, feats)
    print(f"Wrote results.json, organic.csv ({len(organic)} rows), ads.csv ({len(ads)} rows) and "
          f"serp_features.csv to {args.output_dir}/. Credits used: {client.credits_used}")


if __name__ == "__main__":
    main()
