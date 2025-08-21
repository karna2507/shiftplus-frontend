// app/api/stories/route.ts
export const runtime = "nodejs";
const TRANSLATE_ALWAYS = true;

export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

/* =========================
   Types
========================= */
type Lang = "EN" | "AR";

type FeedItem = {
  lang: Lang;
  sourceName: string;
  title: string;
  description: string;
  url: string;
  image?: string;
  publishedAt: string; // ISO
  categoryGuess?: string;
  host?: string;
};

type Cluster = {
  items: FeedItem[];
};

type Story = {
  id: string;
  category: string;
  publishedAt: string;
  imageUrl?: string;

  titleEN: string;
  summaryEN: string;
  sourceEN?: string;
  urlEN?: string;
  translatedFromEN?: boolean;

  titleAR: string;
  summaryAR: string;
  sourceAR?: string;
  urlAR?: string;
  translatedFromAR?: boolean;
};

/* =========================
   Constants
========================= */
const DEFAULT_IMG =
  "https://images.unsplash.com/photo-1526401485004-2fda9f4c2a3d?q=80&w=1200&auto=format&fit=crop";

const CATEGORY_IMG: Record<string, string> = {
  UAE: "https://images.unsplash.com/photo-1526481280698-8fcc13fd5d1b?q=80&w=1200&auto=format&fit=crop",
  Business: "https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?q=80&w=1200&auto=format&fit=crop",
  Tech: "https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=1200&auto=format&fit=crop",
  Sports: "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?q=80&w=1200&auto=format&fit=crop",
  World: "https://images.unsplash.com/photo-1502920917128-1aa500764cbd?q=80&w=1200&auto=format&fit=crop",
  Lifestyle: "https://images.unsplash.com/photo-1498654200943-1088dd4438ae?q=80&w=1200&auto=format&fit=crop",
};

const NEWS_CATEGORIES = ["general", "business", "technology", "sports"] as const;

/* =========================
   Utilities
========================= */
const hasArabic = (s: string) => /[\u0600-\u06FF]/.test(s || "");

function decodeEntities(s = ""): string {
  const named = s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
  return named
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
}

function stripHtml(input?: string): string {
  if (!input) return "";
  // No dotAll flag; use [\s\S]
  const noCdata = input.replace(/<!\[CDATA\[(?:[\s\S]*?)\]\]>/g, (m: string) => m.slice(9, -3));
  const noTags = noCdata.replace(/<\/?[^>]+>/g, " ");
  return decodeEntities(noTags).replace(/\s+/g, " ").trim();
}

function summarize(text?: string, maxWords = 70): string {
  if (!text) return "";
  const words = text.split(/\s+/);
  return words.length <= maxWords ? text : words.slice(0, maxWords).join(" ") + "…";
}

function toISO(d?: string): string {
  if (!d) return new Date().toISOString();
  const t = Date.parse(d);
  return Number.isNaN(t) ? new Date().toISOString() : new Date(t).toISOString();
}

function categoryGuess(text: string, fallback = "UAE"): string {
  const t = (text || "").toLowerCase();
  if (/\bmarket|stock|finance|bank|deal|econom|adgm|difc|ksa pif|ipo\b/.test(t)) return "Business";
  if (/\bai|tech|5g|etisalat|du|chip|semiconductor|startup|app\b/.test(t)) return "Tech";
  if (/\bsport|league|cup|fifa|cricket|football|tennis|golf\b/.test(t)) return "Sports";
  if (/\blifestyle|travel|health|food|fashion|culture\b/.test(t)) return "Lifestyle";
  if (/uae|dubai|abu dhabi|sharjah|الإمارات|دبي|أبو ظبي|الشارقة/.test(t)) return "UAE";
  if (/\bsaudi|riyadh|ksa|السعودية|الرياض\b/.test(t)) return "UAE"; // show in Gulf bucket first
  return fallback;
}

function normalizeImage(url?: string, category = "UAE"): string {
  if (!url || !/^https?:\/\//i.test(url)) return CATEGORY_IMG[category] || DEFAULT_IMG;
  return url;
}

function hostOf(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function hostFamily(h: string): string {
  // Lightweight grouping (e.g., cnn arabic vs cnn international, bbc, reuters, etc.)
  if (h.includes("cnn")) return "cnn";
  if (h.includes("bbc")) return "bbc";
  if (h.includes("reuters")) return "reuters";
  if (h.includes("aljazeera")) return "aljazeera";
  if (h.includes("alarabiya")) return "alarabiya";
  if (h.includes("skynewsarabia")) return "skynewsarabia";
  if (h.includes("thenationalnews")) return "thenational";
  if (h.includes("khaleejtimes")) return "khaleejtimes";
  if (h.includes("gulfnews")) return "gulfnews";
  if (h.includes("arabnews")) return "arabnews";
  if (h.includes("wam.ae") || h.includes("wam")) return "wam";
  if (h.includes("spa.gov.sa")) return "spa";
  return h;
}

function tokens(s: string): Set<string> {
  return new Set(
    (s || "")
      .toLowerCase()
      .replace(/[^a-z\u0600-\u06FF0-9\s]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !["the", "and", "for", "with", "from", "this", "that"].includes(w))
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  a.forEach((x) => {
    if (b.has(x)) inter++;
  });
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/* =========================
   RSS Sources (AR + EN)
========================= */
const RSS_AR: { name: string; url: string }[] = [
  { name: "Al Arabiya", url: "https://www.alarabiya.net/.mrss/ar.xml" },
  { name: "Sky News Arabia", url: "https://www.skynewsarabia.com/web/rss" },
  { name: "CNN Arabic", url: "https://arabic.cnn.com/rss.xml" },
  { name: "BBC Arabic", url: "https://www.bbc.com/arabic/index.xml" },
  { name: "Asharq Al-Awsat", url: "https://aawsat.com/home/rss" },
  { name: "Okaz", url: "https://www.okaz.com.sa/rss" },
  { name: "Al Bayan", url: "https://www.albayan.ae/polopoly_fs/1.4612217.1655120696!/menu/standard/file/rss.xml" },
  { name: "Emarat Al Youm", url: "https://www.emaratalyoum.com/polopoly_fs/1.976?page=0&format=feed&type=rss" },
  { name: "SPA (Arabic)", url: "https://www.spa.gov.sa/_services/rssfeeds/rss.ar.xml" },
  { name: "WAM (Arabic)", url: "https://wam.ae/ar/-rss-feed" },
];

const RSS_EN: { name: string; url: string }[] = [
  { name: "The National", url: "https://www.thenationalnews.com/arc/outboundfeeds/rss/?outputType=xml" },
  { name: "Gulf News", url: "https://gulfnews.com/rss" },
  { name: "Khaleej Times", url: "https://www.khaleejtimes.com/rss" },
  { name: "Arab News", url: "https://www.arabnews.com/rss.xml" },
  { name: "Saudi Gazette", url: "https://saudigazette.com.sa/rss" },
  { name: "Reuters Middle East", url: "https://www.reuters.com/markets/middle-east/rss" },
  { name: "AP Middle East", url: "https://apnews.com/hub/middle-east?output=rss" },
  { name: "Bloomberg Middle East", url: "https://www.bloomberg.com/feeds/podcasts/brief?region=middle-east" }, // may vary
  { name: "BBC Middle East", url: "https://feeds.bbci.co.uk/news/world/middle_east/rss.xml" },
  { name: "Al Jazeera English", url: "https://www.aljazeera.com/xml/rss/all.xml" },
];

/* =========================
   RSS Fetching
========================= */
function parseRSSItems(xml: string): Array<{
  title: string;
  link: string;
  description: string;
  pubDate: string;
  image?: string;
}> {
  const items: string[] = Array.from(xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)).map((m) => m[1]);
  const tag = (b: string, t: string) =>
    b.match(new RegExp(`<${t}\\b[^>]*>([\\s\\S]*?)<\\/${t}>`, "i"))?.[1] ?? "";
  const attr = (b: string, t: string, a: string) =>
    b.match(new RegExp(`<${t}\\b([^>]*)\\/?>`, "i"))?.[1]?.match(new RegExp(`${a}="([^"]+)"`))?.[1] ?? "";

  return items.map((b) => {
    const title = stripHtml(tag(b, "title"));
    const link = stripHtml(tag(b, "link"));
    const descRaw = tag(b, "description") || tag(b, "content:encoded");
    const description = stripHtml(descRaw);
    const pubDate = stripHtml(tag(b, "pubDate") || tag(b, "updated") || tag(b, "dc:date"));
    let image =
      attr(b, "enclosure", "url") ||
      attr(b, "media:content", "url") ||
      attr(b, "media:thumbnail", "url") ||
      "";
    if (!image) {
      const m = (tag(b, "description") || "").match(/<img[^>]+src="([^"]+)"/i);
      if (m) image = m[1];
    }
    return { title, link, description, pubDate, image };
  });
}

async function fetchRSSList(list: { name: string; url: string }[], lang: Lang): Promise<FeedItem[]> {
  const out: FeedItem[] = [];
  for (const { name, url } of list) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) continue;
      const xml = await r.text();
      const items = parseRSSItems(xml);
      for (const it of items) {
        const urlStr = stripHtml(it.link);
        const title = stripHtml(it.title);
        const desc = stripHtml(it.description);
        const publishedAt = toISO(it.pubDate);
        const host = hostOf(urlStr);
        const category = categoryGuess(`${title} ${desc}`, "UAE");
        out.push({
          lang,
          sourceName: name,
          title,
          description: desc,
          url: urlStr,
          image: normalizeImage(it.image, category),
          publishedAt,
          categoryGuess: category,
          host,
        });
      }
    } catch {
      // ignore a single feed failure
    }
  }
  return out;
}

/* =========================
   NewsAPI (optional)
========================= */
async function fetchNewsAPI(key: string): Promise<FeedItem[]> {
  const base = "https://newsapi.org/v2/top-headlines";
  const urls = NEWS_CATEGORIES.map(
    (c) => `${base}?country=ae&category=${c}&pageSize=25&apiKey=${key}`
  );
  const out: FeedItem[] = [];
  for (const u of urls) {
    try {
      const r = await fetch(u, { cache: "no-store" });
      if (!r.ok) continue;
      const data = (await r.json()) as any;
      if (!Array.isArray(data?.articles)) continue;
      for (const a of data.articles) {
        const title = decodeEntities(a?.title ?? "").trim();
        const description = decodeEntities(a?.description ?? a?.content ?? "").trim();
        const url = (a?.url as string) || "";
        const image = a?.urlToImage as string | undefined;
        const publishedAt = toISO(a?.publishedAt as string | undefined);
        const category = categoryGuess(`${title} ${description}`, "UAE");
        out.push({
          lang: "EN",
          sourceName: (a?.source?.name as string) || "Unknown",
          title,
          description,
          url,
          image: normalizeImage(image, category),
          publishedAt,
          categoryGuess: category,
          host: hostOf(url),
        });
      }
    } catch {
      // ignore single request failure
    }
  }
  return out;
}

/* =========================
   Pairing & Clustering
========================= */
function canPair(a: FeedItem, b: FeedItem): boolean {
  // basic guards
  if (a.url === b.url) return true;
  // host family closeness helps (cnn vs cnn arabic, etc.)
  const famClose = hostFamily(a.host || "") === hostFamily(b.host || "");
  // time proximity within 12h
  const ta = new Date(a.publishedAt).getTime();
  const tb = new Date(b.publishedAt).getTime();
  const timeClose = Math.abs(ta - tb) <= 12 * 3600 * 1000;

  // title token overlap
  const ja = tokens(a.title);
  const jb = tokens(b.title);
  const sim = jaccard(ja, jb);

  return (famClose && timeClose && sim >= 0.35) || (timeClose && sim >= 0.6);
}

function clusterItems(items: FeedItem[]): Cluster[] {
  const clusters: Cluster[] = [];
  for (const it of items) {
    let placed = false;
    for (const c of clusters) {
      // try to match against any item already in cluster
      if (c.items.some((x) => canPair(x, it))) {
        c.items.push(it);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push({ items: [it] });
  }
  return clusters;
}

function pickBest(items: FeedItem[], lang: Lang): FeedItem | undefined {
  const pri: string[] =
    lang === "EN"
      ? ["reuters", "apnews", "bbc", "thenational", "khaleejtimes", "gulfnews", "arabnews", "aljazeera", "cnn"]
      : ["alarabiya", "skynewsarabia", "spa", "wam", "aawsat", "okaz", "cnn", "bbc", "aljazeera"];

  const sorted = [...items].sort((a, b) => {
    const fa = pri.indexOf(hostFamily(a.host || ""));
    const fb = pri.indexOf(hostFamily(b.host || ""));
    const ra = fa === -1 ? 999 : fa;
    const rb = fb === -1 ? 999 : fb;
    if (ra !== rb) return ra - rb;
    // newer first
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });
  return sorted[0];
}

function stableId(parts: string[]): string {
  const s = parts.join("¦");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return "s" + h.toString(36);
}

/* =========================
   Translation (optional)
========================= */
async function translateBatch(
  items: { idx: number; from: Lang; title: string; summary: string }[],
  to: Lang,
  OPENAI_API_KEY: string
): Promise<Array<{ title?: string; summary?: string }>> {
  if (items.length === 0) return [];

  const prompt = `
You are a professional news translator. Translate each item to ${to === "AR" ? "Modern Standard Arabic" : "English"} in a neutral, concise tone.
Keep names, numbers, currencies accurate. Return ONLY a JSON array in the same order:
[{"title":"...","summary":"..."}]

Items:
${items
  .map((x, i) => `${i + 1}. TITLE: ${x.title}\nSUMMARY: ${x.summary || x.title}`)
  .join("\n\n")}
`.trim();

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!r.ok) return [];

  const j = (await r.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text: string = j?.choices?.[0]?.message?.content ?? "[]";
  try {
    const match = text.match(/\[[\s\S]*\]/);
    return match ? (JSON.parse(match[0]) as Array<{ title?: string; summary?: string }>) : [];
  } catch {
    return [];
  }
}

/* =========================
   Route
========================= */
export async function GET(req: Request) {
  const headers: Record<string, string> = {};
  try {
    const url = new URL(req.url);
    const wantTranslate = TRANSLATE_ALWAYS && !!process.env.OPENAI_API_KEY;

    const NEWS_API_KEY = process.env.NEWS_API_KEY || "";
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

    // 1) Fetch AR + EN RSS (and NewsAPI EN if available)
    const [arRss, enRss, enNews] = await Promise.all([
      fetchRSSList(RSS_AR, "AR"),
      fetchRSSList(RSS_EN, "EN"),
      NEWS_API_KEY ? fetchNewsAPI(NEWS_API_KEY) : Promise.resolve([]),
    ]);

    // Merge raw items
    const raw: FeedItem[] = [...arRss, ...enRss, ...enNews];

    // 2) Cluster similar items (same event)
    const clusters = clusterItems(raw);

    // 3) Build canonical stories per cluster
    const stories: Story[] = [];
    for (const c of clusters) {
      const enItems = c.items.filter((x) => x.lang === "EN");
      const arItems = c.items.filter((x) => x.lang === "AR");

      const enBest = pickBest(enItems, "EN");
      const arBest = pickBest(arItems, "AR");

      // Decide category & image
      const base = enBest || arBest;
      if (!base) continue;

      const category = base.categoryGuess || categoryGuess(`${base.title} ${base.description}`, "UAE");
      const publishedAt = [enBest?.publishedAt, arBest?.publishedAt]
        .filter(Boolean)
        .sort()
        .reverse()[0] as string;

      const imageUrl = normalizeImage((enBest?.image || arBest?.image) ?? "", category);

      // Prepare story skeleton (we'll fill missing side below)
      const story: Story = {
        id: stableId([base.sourceName, base.title, base.publishedAt]),
        category,
        publishedAt,
        imageUrl,

        titleEN: enBest?.title || "",
        summaryEN: summarize(enBest?.description || "", 70),
        sourceEN: enBest?.sourceName || undefined,
        urlEN: enBest?.url || undefined,
        translatedFromEN: false,

        titleAR: arBest?.title || "",
        summaryAR: summarize(arBest?.description || "", 70),
        sourceAR: arBest?.sourceName || undefined,
        urlAR: arBest?.url || undefined,
        translatedFromAR: false,
      };

      stories.push(story);
    }

    // 4) Translation pass (only missing sides)
    let translatedCount = 0;
    if (translateFlag && OPENAI_API_KEY && stories.length > 0) {
      // EN -> AR when Arabic side missing
      const needAR = stories
        .map((s, idx) => ({ s, idx }))
        .filter(({ s }) => !s.titleAR || !hasArabic(s.titleAR))
        .slice(0, 20)
        .map(({ s, idx }) => ({
          idx,
          from: "EN" as Lang,
          title: s.titleEN || s.summaryEN,
          summary: s.summaryEN || s.titleEN,
        }));

      // AR -> EN when English side missing
      const needEN = stories
        .map((s, idx) => ({ s, idx }))
        .filter(({ s }) => !s.titleEN || hasArabic(s.titleEN))
        .slice(0, 20)
        .map(({ s, idx }) => ({
          idx,
          from: "AR" as Lang,
          title: s.titleAR || s.summaryAR,
          summary: s.summaryAR || s.titleAR,
        }));

      const trAR = await translateBatch(needAR, "AR", OPENAI_API_KEY);
      trAR.forEach((r: { title?: string; summary?: string }, i: number) => {
        const idx = needAR[i].idx;
        if (r?.title) stories[idx].titleAR = r.title;
        if (r?.summary) stories[idx].summaryAR = r.summary;
        stories[idx].translatedFromAR = true;
      });

      const trEN = await translateBatch(needEN, "EN", OPENAI_API_KEY);
      trEN.forEach((r: { title?: string; summary?: string }, i: number) => {
        const idx = needEN[i].idx;
        if (r?.title) stories[idx].titleEN = r.title;
        if (r?.summary) stories[idx].summaryEN = r.summary;
        stories[idx].translatedFromEN = true;
      });

      translatedCount = (trAR?.length || 0) + (trEN?.length || 0);
    }

    // 5) Sort newest and cap
    stories.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
    const capped = stories.slice(0, 180);

    // 6) Headers
    headers["x-shift-data"] = NEWS_API_KEY ? "live" : "live-rss";
    headers["x-shift-trans"] = translateFlag ? (OPENAI_API_KEY ? "on" : "missing-key") : "off";
    headers["x-shift-counts"] = `raw=${raw.length},clusters=${clusters.length},stories=${stories.length},translated=${translatedCount}`;

    // Fallback demo if somehow empty
    if (capped.length === 0) {
      headers["x-shift-data"] = "demo";
      const demo: Story[] = [
        {
          id: "demo1",
          category: "UAE",
          publishedAt: new Date().toISOString(),
          imageUrl: CATEGORY_IMG["UAE"],

          titleEN: "Demo: Dubai announces public transport upgrades",
          summaryEN: "RTA unveiled plans to expand metro and bus capacity to meet demand.",
          sourceEN: "Shift+",
          urlEN: "#",
          translatedFromEN: false,

          titleAR: "عرض تجريبي: دبي تعلن عن تحديثات في النقل العام",
          summaryAR: "خطة لتوسعة طاقة المترو والحافلات لتلبية الطلب المتزايد.",
          sourceAR: "شيفت+",
          urlAR: "#",
          translatedFromAR: false,
        },
      ];
      return NextResponse.json(demo, { headers, status: 200 });
    }

    return NextResponse.json(capped, { headers, status: 200 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown";
    const headersErr: Record<string, string> = {
      "x-shift-data": "catch",
      "x-shift-reason": msg,
    };
    return NextResponse.json<Story[]>([], { headers: headersErr, status: 200 });
  }
}
