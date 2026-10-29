#!/usr/bin/env node
// crawl-audit.mjs — Agent2Ship SEO Audit (free) — zero-dependency technical SEO + GEO crawler. Full kit: https://agent2ship.dev
// Usage:
//   node crawl-audit.mjs --url https://example.com [--max 50] [--out seo-reports] [--single]
// Works against production URLs or a local dev/preview server (http://localhost:4321).

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = parseArgs(process.argv.slice(2));
if (!args.url) {
  console.error("Usage: node crawl-audit.mjs --url https://example.com [--max 50] [--out seo-reports] [--single]");
  process.exit(1);
}
const START = new URL(args.url);
const ORIGIN = START.origin;
const MAX = Number(args.max || 50);
const OUT = args.out || "seo-reports";
const UA = "Mozilla/5.0 (compatible; Agent2Ship-SEO-Audit/1.0)";

const AI_BOTS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "Claude-User", "PerplexityBot", "Google-Extended"];

function parseArgs(a) {
  const o = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith("--")) {
      const k = a[i].slice(2);
      const v = a[i + 1] && !a[i + 1].startsWith("--") ? a[++i] : true;
      o[k] = v;
    }
  }
  return o;
}

async function get(url) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "manual" });
    const ms = Date.now() - t0;
    if (res.status >= 300 && res.status < 400) {
      return { url, status: res.status, location: res.headers.get("location"), ms, body: "", headers: res.headers };
    }
    const body = await res.text();
    return { url, status: res.status, ms, body, headers: res.headers };
  } catch (e) {
    return { url, status: 0, error: String(e.message || e), ms: Date.now() - t0, body: "" };
  }
}

function norm(u) {
  try {
    const x = new URL(u, ORIGIN);
    x.hash = "";
    return x.href;
  } catch { return null; }
}

const decode = (s) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").trim();
const attr = (tag, name) => {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? decode(m[2] ?? m[3] ?? m[4] ?? "") : null;
};
function metaContent(html, key, val) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    if ((attr(tag, key) || "").toLowerCase() === val.toLowerCase()) return attr(tag, "content");
  }
  return null;
}
function linkHref(html, rel) {
  for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
    if ((attr(tag, "rel") || "").toLowerCase().split(/\s+/).includes(rel)) return attr(tag, "href");
  }
  return null;
}

function analyze(page) {
  const html = page.body || "";
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
  const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => decode(m[1].replace(/<[^>]+>/g, "")));
  const h2Count = (html.match(/<h2\b/gi) || []).length;
  const bodyHtml = (html.match(/<body[^>]*>([\s\S]*)<\/body>/i) || [, html])[1];
  const text = bodyHtml.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<noscript[\s\S]*?<\/noscript>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const words = decode(text).split(" ").filter(Boolean).length;
  const imgs = html.match(/<img\b[^>]*>/gi) || [];
  const imgsNoAlt = imgs.filter((t) => attr(t, "alt") === null).length;
  const jsonLd = [...html.matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const schemaTypes = [];
  let schemaErrors = 0;
  for (const m of jsonLd) {
    try {
      const data = JSON.parse(m[1]);
      const walk = (n) => {
        if (Array.isArray(n)) return n.forEach(walk);
        if (n && typeof n === "object") {
          if (n["@type"]) schemaTypes.push(...[].concat(n["@type"]));
          if (n["@graph"]) walk(n["@graph"]);
        }
      };
      walk(data);
    } catch { schemaErrors++; }
  }
  const links = [];
  for (const tag of html.match(/<a\b[^>]*>/gi) || []) {
    const href = attr(tag, "href");
    if (!href || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) continue;
    const n = norm(new URL(href, page.url).href);
    if (n) links.push(n);
  }
  const internal = [...new Set(links.filter((l) => l.startsWith(ORIGIN)))];
  const robotsMeta = (metaContent(html, "name", "robots") || "").toLowerCase();
  const xRobots = (page.headers?.get?.("x-robots-tag") || "").toLowerCase();
  const csrShell = words < 60 && /<div[^>]+id=["'](root|app|__next)["'][^>]*>\s*<\/div>/i.test(html);
  return {
    url: page.url, status: page.status, ms: page.ms, location: page.location || null,
    title: title ? decode(title.replace(/<[^>]+>/g, "")) : null,
    description: metaContent(html, "name", "description"),
    canonical: linkHref(html, "canonical"),
    lang: attr((html.match(/<html\b[^>]*>/i) || [""])[0], "lang"),
    viewport: !!metaContent(html, "name", "viewport"),
    noindex: robotsMeta.includes("noindex") || xRobots.includes("noindex"),
    h1s, h2Count, words, imgCount: imgs.length, imgsNoAlt,
    ogTitle: metaContent(html, "property", "og:title"),
    ogImage: metaContent(html, "property", "og:image"),
    twitterCard: metaContent(html, "name", "twitter:card"),
    schemaTypes: [...new Set(schemaTypes)], schemaErrors,
    internalLinks: internal, csrShell,
  };
}

function parseRobots(txt) {
  const groups = [];
  let cur = null;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const [k, ...rest] = line.split(":");
    const key = k.trim().toLowerCase();
    const val = rest.join(":").trim();
    if (key === "user-agent") {
      if (!cur || cur.rules.length) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
    } else if (cur && (key === "disallow" || key === "allow")) cur.rules.push({ key, val });
  }
  const sitemaps = [...txt.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]);
  const blocksRoot = (agent) => {
    const g = groups.find((g) => g.agents.includes(agent.toLowerCase())) || groups.find((g) => g.agents.includes("*"));
    if (!g) return false;
    return g.rules.some((r) => r.key === "disallow" && r.val === "/") && !g.rules.some((r) => r.key === "allow" && r.val === "/");
  };
  return { sitemaps, blocksRoot };
}

async function sitemapUrls(url, depth = 0) {
  if (depth > 2) return [];
  const r = await get(url);
  if (r.status !== 200) return [];
  const locs = [...r.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => decode(m[1]));
  if (/<sitemapindex/i.test(r.body)) {
    const all = [];
    for (const l of locs) all.push(...(await sitemapUrls(l, depth + 1)));
    return all;
  }
  return locs;
}

async function main() {
  console.log(`Auditing ${ORIGIN} (max ${MAX} pages)...`);
  const site = { origin: ORIGIN, checkedAt: new Date().toISOString() };

  const robots = await get(`${ORIGIN}/robots.txt`);
  site.robotsTxt = robots.status === 200;
  let robotsInfo = { sitemaps: [], blocksRoot: () => false };
  if (site.robotsTxt) robotsInfo = parseRobots(robots.body);
  site.aiBots = Object.fromEntries(AI_BOTS.map((b) => [b, robotsInfo.blocksRoot(b) ? "blocked" : "allowed"]));
  site.googlebotBlocked = robotsInfo.blocksRoot("Googlebot");

  const llms = await get(`${ORIGIN}/llms.txt`);
  site.llmsTxt = llms.status === 200 && !/<html/i.test(llms.body);

  let sitemapList = [];
  const candidates = [...robotsInfo.sitemaps, `${ORIGIN}/sitemap.xml`, `${ORIGIN}/sitemap-index.xml`, `${ORIGIN}/sitemap_index.xml`];
  for (const c of candidates) {
    sitemapList = await sitemapUrls(c);
    if (sitemapList.length) { site.sitemap = c; break; }
  }
  site.sitemapCount = sitemapList.length;

  const queue = args.single ? [START.href] : [START.href, ...sitemapList.map(norm).filter(Boolean)];
  const seen = new Set();
  const pages = [];
  const redirectMap = new Map();
  while (queue.length && pages.length < MAX) {
    const u = norm(queue.shift());
    if (!u || seen.has(u) || !u.startsWith(ORIGIN)) continue;
    if (/\.(jpg|jpeg|png|gif|webp|svg|pdf|zip|xml|txt|css|js|ico|mp4)(\?|$)/i.test(u)) continue;
    seen.add(u);
    const r = await get(u);
    const p = analyze(r);
    pages.push(p);
    process.stdout.write(`  [${p.status}] ${u}${p.location ? " -> " + p.location : ""}\n`);
    if (p.location) {
      const target = norm(new URL(p.location, u).href);
      if (target) {
        redirectMap.set(u, target);
        if (target.startsWith(ORIGIN) && !seen.has(target)) queue.unshift(target); // follow redirects so the real page is audited
      }
    }
    if (!args.single) for (const l of p.internalLinks) if (!seen.has(l)) queue.push(l);
  }

  // Site-level checks
  const statusOf = new Map(pages.map((p) => [p.url, p.status]));
  const inlinks = new Map();
  const resolve = (l) => { let x = l, hops = 0; while (redirectMap.has(x) && hops++ < 5) x = redirectMap.get(x); return x; };
  for (const p of pages) for (const l of new Set(p.internalLinks.map(resolve))) if (l !== p.url) inlinks.set(l, (inlinks.get(l) || 0) + 1);
  const dup = (key) => {
    const m = new Map();
    for (const p of pages) if (p.status === 200 && p[key]) m.set(p[key], [...(m.get(p[key]) || []), p.url]);
    return [...m.entries()].filter(([, v]) => v.length > 1);
  };

  // AI crawler firewall check: robots.txt can say "allowed" while the CDN/WAF returns 403.
  // We send the bot's name in the User-Agent. This is a signal, not proof: CDNs verify real bots by IP,
  // so a spoofed UA can be treated differently from the real crawler.
  site.aiBotHttp = {};
  if (!args["skip-bot-check"]) {
    for (const bot of AI_BOTS.filter((b) => b !== "Google-Extended")) {
      try {
        const res = await fetch(ORIGIN + "/", { headers: { "User-Agent": `Mozilla/5.0 (compatible; ${bot}/1.0)` }, redirect: "manual" });
        site.aiBotHttp[bot] = res.status;
      } catch { site.aiBotHttp[bot] = 0; }
    }
  }

  // Duplicate host/protocol versions: http:// and www/non-www should 301 to the canonical origin.
  site.hostVariants = {};
  const host = new URL(ORIGIN).host;
  const altHost = host.startsWith("www.") ? host.slice(4) : `www.${host}`;
  const variants = [`http://${host}/`, `https://${altHost}/`, `http://${altHost}/`].filter((v) => !v.startsWith(ORIGIN + "/"));
  for (const v of variants) {
    try {
      const res = await fetch(v, { headers: { "User-Agent": UA }, redirect: "manual" });
      site.hostVariants[v] = { status: res.status, location: res.headers.get("location") };
    } catch (e) { site.hostVariants[v] = { status: 0, error: "unreachable" }; }
  }

  const issues = [];
  const add = (severity, page, msg) => issues.push({ severity, page, msg });
  for (const [v, r] of Object.entries(site.hostVariants)) {
    if (r.status === 200) add("high", v, `Duplicate version of the site: ${v} returns 200 instead of a 301 to ${ORIGIN}/ (fix with a redirect at the host/CDN)`);
    else if (r.status >= 300 && r.status < 400 && r.location && !r.location.startsWith(ORIGIN)) add("medium", v, `${v} redirects to ${r.location}, not to the canonical origin ${ORIGIN}`);
    else if (r.status === 302 || r.status === 307) add("low", v, `${v} uses a temporary ${r.status} redirect; use 301/308`);
  }
  for (const [bot, st] of Object.entries(site.aiBotHttp)) {
    if (site.aiBots[bot] === "allowed" && (st === 403 || st === 429 || st === 503)) {
      const training = ["GPTBot", "ClaudeBot"].includes(bot);
      add(training ? "low" : "high", "/", `robots.txt allows ${bot}, but the server/CDN returned ${st} to a request with its user-agent — a firewall or "block AI bots" setting may be blocking it${training ? " (training crawler — fine if intentional)" : " (AI search crawler — hurts GEO)"}. Verify in your CDN settings.`);
    }
  }
  if (!site.robotsTxt) add("medium", "/robots.txt", "robots.txt missing");
  if (site.googlebotBlocked) add("critical", "/robots.txt", "Googlebot is blocked from the whole site");
  if (!site.sitemap) add("high", "/sitemap.xml", "No XML sitemap found (checked robots.txt, /sitemap.xml, /sitemap-index.xml)");
  const TRAINING_BOTS = ["GPTBot", "ClaudeBot", "Google-Extended"]; // model-training crawlers: blocking is a business choice
  for (const [bot, s] of Object.entries(site.aiBots)) {
    if (s !== "blocked") continue;
    if (TRAINING_BOTS.includes(bot)) add("low", "/robots.txt", `${bot} (AI training crawler) is blocked — fine if intentional; doesn't block AI search citations`);
    else add("high", "/robots.txt", `${bot} (AI search/answer crawler) is blocked — your pages can't be fetched or cited in AI answers (GEO)`);
  }
  if (!site.llmsTxt) add("low", "/llms.txt", "No llms.txt (optional; Google Search does not use it, other AI tools may — low priority)");

  for (const p of pages) {
    if (p.status === 0) { add("critical", p.url, "Request failed"); continue; }
    if (p.status >= 400) { add("critical", p.url, `HTTP ${p.status}`); continue; }
    if (p.status >= 300) { add("medium", p.url, `Redirect ${p.status} → ${p.location} (link to the final URL instead)`); continue; }
    if (p.csrShell) add("critical", p.url, "Looks like a client-side-rendered shell (almost no HTML text). Search/AI crawlers may see an empty page — prerender or SSR this route");
    if (p.noindex) add("high", p.url, "Page is noindex");
    if (!p.title) add("high", p.url, "Missing <title>");
    else if (p.title.length > 60) add("low", p.url, `Title is ${p.title.length} chars (may truncate >~60)`);
    else if (p.title.length < 20) add("medium", p.url, `Title is very short (${p.title.length} chars)`);
    if (!p.description) add("medium", p.url, "Missing meta description");
    else if (p.description.length > 160) add("low", p.url, `Meta description ${p.description.length} chars (>160)`);
    if (!p.canonical) add("medium", p.url, "Missing canonical tag");
    else if (norm(p.canonical) !== p.url && norm(p.canonical)?.replace(/\/$/, "") !== p.url.replace(/\/$/, "")) add("low", p.url, `Canonical points elsewhere: ${p.canonical}`);
    if (p.h1s.length === 0) add("high", p.url, "No H1");
    if (p.h1s.length > 1) add("low", p.url, `${p.h1s.length} H1 tags`);
    const utilityPage = /\/(privacy|terms|contact|about|cookie|cookies|legal|disclaimer|404)(\/|$|\.)/i.test(new URL(p.url).pathname);
    if (!p.csrShell && !utilityPage && p.words < 250) add("medium", p.url, `Thin content (~${p.words} words)`);
    if (p.imgsNoAlt) add("low", p.url, `${p.imgsNoAlt}/${p.imgCount} images missing alt`);
    if (!p.ogTitle || !p.ogImage) add("low", p.url, "Missing og:title or og:image (social + some AI previews)");
    if (!p.lang) add("low", p.url, "<html> has no lang attribute");
    if (!p.viewport) add("high", p.url, "No viewport meta (mobile)");
    if (p.schemaErrors) add("high", p.url, `${p.schemaErrors} JSON-LD block(s) fail to parse`);
    if (!p.schemaTypes.length) add("medium", p.url, "No structured data (JSON-LD)");
    if (p.ms > 1500) add("medium", p.url, `Slow server response (${p.ms} ms)`);
    for (const l of p.internalLinks) {
      const s = statusOf.get(l);
      if (s && s >= 400) add("high", p.url, `Broken internal link → ${l} (${s})`);
    }
    if (p.url !== norm(START.href) && !inlinks.get(p.url)) add("medium", p.url, "Orphan page (no internal links point to it from crawled pages)");
  }
  const okPages = pages.filter((p) => p.status === 200);
  const PAGE_SPECIFIC = ["WebApplication", "SoftwareApplication", "Product", "Article", "BlogPosting", "FAQPage", "HowTo", "Recipe", "Event"];
  const typeCount = {};
  for (const p of okPages) for (const t of p.schemaTypes) typeCount[t] = (typeCount[t] || 0) + 1;
  for (const [t, n] of Object.entries(typeCount)) {
    if (PAGE_SPECIFIC.includes(t) && okPages.length >= 4 && n / okPages.length > 0.6) add("medium", "sitewide", `${t} structured data appears on ${n}/${okPages.length} pages — it should only be on the pages it describes (likely injected by the shared layout)`);
  }
  if (typeCount.FAQPage) add("low", "sitewide", "FAQPage markup found: Google no longer shows FAQ rich results (May 2026). Harmless, but don't expect a rich result from it");
  for (const [t, urls] of dup("title")) add("medium", urls.join(", "), `Duplicate title: "${t}"`);
  for (const [d, urls] of dup("description")) add("low", urls.join(", "), `Duplicate meta description: "${d.slice(0, 60)}..."`);
  if (site.sitemap && sitemapList.length) {
    const inSitemap = new Set(sitemapList.map(norm));
    for (const p of pages) if (p.status === 200 && !p.noindex && !inSitemap.has(p.url)) add("low", p.url, "Indexable page not in sitemap");
  }

  const order = { critical: 0, high: 1, medium: 2, low: 3 };
  issues.sort((a, b) => order[a.severity] - order[b.severity]);

  mkdirSync(OUT, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const json = { site, pages: pages.map(({ internalLinks, ...p }) => ({ ...p, internalLinkCount: internalLinks.length, inlinks: inlinks.get(p.url) || 0 })), issues };
  const jsonPath = join(OUT, `audit-${stamp}.json`);
  writeFileSync(jsonPath, JSON.stringify(json, null, 2));

  const count = (s) => issues.filter((i) => i.severity === s).length;
  let md = `# SEO/GEO audit — ${ORIGIN}\n\nDate: ${stamp} · Pages crawled: ${pages.length} · Sitemap URLs: ${site.sitemapCount}\n\n`;
  md += `**Issues:** ${count("critical")} critical · ${count("high")} high · ${count("medium")} medium · ${count("low")} low\n\n`;
  md += `## Site\n\n- robots.txt: ${site.robotsTxt ? "yes" : "NO"}\n- Sitemap: ${site.sitemap || "NOT FOUND"}\n- llms.txt: ${site.llmsTxt ? "yes" : "no"}\n- AI crawlers (robots.txt): ${Object.entries(site.aiBots).map(([b, s]) => `${b}=${s}`).join(", ")}\n- AI crawlers (HTTP status with bot UA): ${Object.entries(site.aiBotHttp).map(([b, s]) => `${b}=${s}`).join(", ") || "skipped"}\n- Host/protocol variants: ${Object.entries(site.hostVariants).map(([v, r]) => `${v} → ${r.status}${r.location ? " " + r.location : ""}`).join(" · ") || "none"}\n\n`;
  md += `## Issues\n\n| Severity | Page | Issue |\n|---|---|---|\n`;
  for (const i of issues) md += `| ${i.severity} | ${i.page.replace(ORIGIN, "") || "/"} | ${i.msg.replace(/\|/g, "/")} |\n`;
  md += `\n## Pages\n\n| URL | Status | Words | Title len | Desc | H1 | Schema | Inlinks |\n|---|---|---|---|---|---|---|---|\n`;
  for (const p of json.pages) md += `| ${p.url.replace(ORIGIN, "") || "/"} | ${p.status} | ${p.words} | ${p.title?.length ?? "-"} | ${p.description ? "yes" : "no"} | ${p.h1s.length} | ${p.schemaTypes.join(" ") || "-"} | ${p.inlinks} |\n`;
  const mdPath = join(OUT, `audit-${stamp}.md`);
  writeFileSync(mdPath, md);
  console.log(`\nDone. ${issues.length} issues.\n  ${mdPath}\n  ${jsonPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
