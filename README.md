# Agent2Ship SEO Audit (free)

A free Claude Code skill that audits your website's technical SEO **and** whether AI search (ChatGPT, Claude, Perplexity) can actually read it.

```
/a2s-seo-audit https://yoursite.com
```

It crawls your site, then Claude explains what's wrong in plain words, most important first, and how to fix it. It changes nothing unless you approve.

## Why I built it

I ran it on my own site. All 19 pages worked fine, but it found something I'd never have noticed: **Cloudflare was quietly blocking GPTBot and ClaudeBot**, even though my robots.txt allowed them. One setting later, they went from 403 to 200.

## What it checks

- **Indexing blockers:** 4xx/5xx pages, `noindex` on pages that should rank, Googlebot blocked
- **Titles and descriptions:** missing, duplicate, too long or too short
- **Canonicals and redirects:** wrong or missing canonicals, redirect chains (it follows them and audits the real page)
- **Duplicate sites:** whether `http://` and `www` / non-`www` versions redirect to one address
- **Links:** broken internal links and orphan pages nothing links to
- **Thin pages** and **empty client-rendered pages** (React apps whose HTML has no content)
- **Sitemap and robots.txt** problems
- **Schema:** invalid JSON-LD and page-specific schema wrongly placed on every page
- **AI crawlers:** whether GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot and others are blocked by robots.txt **or by your CDN firewall**

Results are saved to `seo-reports/audit-DATE.md` (readable) and `.json` (details).

## Install (1 minute)

1. Download this repo (green **Code** button → **Download ZIP**) and unzip it.
2. Copy the `.claude` folder into your project folder (merge it if you already have one).
3. Open Claude Code in your project (restart it if it was open) and run:

```
/a2s-seo-audit https://yoursite.com
```

**Needs:** Claude Code and Node.js 18+. No other installs.

You can also run the crawler on its own, without Claude:

```bash
node .claude/skills/a2s-free-seo-audit/scripts/crawl-audit.mjs --url https://yoursite.com --max 100
```

## Tips

- Audit the **live site** or a production preview, not `npm run dev`.
- A bot getting 403 in the report is a strong signal, not proof: CDNs check real bots by IP. Confirm in your CDN's bot settings.
- After fixing, run it again and request indexing for key pages in Google Search Console.

## Want the whole workflow?

This is one part of **[Agent2Ship](https://agent2ship.dev)**, a Claude Code kit with 15 specialist agents. With one command (`/a2s-start`) it goes from an idea to a live, SEO-ready website, or improves an existing one: Search Console opportunities, fact-checking every claim on your pages, writing and refreshing content, design, and deploying on free Cloudflare hosting.

## License

MIT. Use it, share it, change it.

Not affiliated with Anthropic, Google, OpenAI, Cloudflare or Perplexity.
