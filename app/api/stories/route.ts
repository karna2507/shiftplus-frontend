export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

/* ---------- Types ---------- */
type Story = {
  category: string;
  titleEN: string;
  summaryEN: string;
  titleAR: string;
  summaryAR: string;
  sourceUrl: string;
  sourceName: string;
  publishedAt: string;
  imageUrl?: string;
  translatedFrom?: "EN" | "AR"; // mark when we translate
};

/* ---------- Constants ---------- */
const DEFAULT_IMG =
  "https://images.unsplash.com/photo-1526401485004-2fda9f4c2a3d?q=80&w=1200&auto=format&fit=crop";

const CATEGORY_IMG: Record<string, string> = {
  UAE: "https://images.unsplash.com/photo-1526481280698-8fcc13fd5d1b?q=80&w=1200&auto=format&fit=crop",
  Business: "https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?q=80&w=1200&auto=format&fit=crop",
  Tech: "https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=1200&auto=format&fit=crop",
  Sports: "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?q=80&w=1200&auto=format&fit=crop",
  Lifestyle: "https://images.unsplash.com/photo-1498654200943-1088dd4438ae?q=80&w=1200&auto=format&fit=crop",
};

const NEWS_CATEGORIES = ["general", "business", "technology", "sports"] as const;

/* ---------- Helpers ---------- */
const hasArabic = (s: string) => /[\u0600-\u06FF]/.test(s || "");

function decodeEntities(s = "") {
  const named = s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
  return named
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}
function summarize(text?: string, maxWords = 70) {
  if (!text) return "";
  const words = text.split(/\s+/);
  return words.length <= maxWords ? text : words.slice(0, maxWords).join(" ") + "…";
}
function toISO(d?: string) {
  if (!d) return new Date().toISOString();
  const t = Date.parse(d);
  return Number.isNaN(t) ? new Date().toISOString() : new Date(t).toISOString();
}
function categoryGuess(text: string, fallback = "UAE") {
  const t = text.toLowerCase();
  if (/\bmarket|stock|finance|bank|deal|econom|adgm|difc\b/.test(t)) return "Business";
  if (/\bai|tech|5g|etisalat|du|chip|semiconductor\b/.test(t)) return "Tech";
  if (/\bsport|league|cup|fifa|cricket|football|tennis\b/.test(t)) return "Sports";
  if (/\blifestyle|travel|health|food|fashion\b/.test(t)) return "Lifestyle";
  if (/uae|dubai|abu dhabi|sharjah|الإمارات|دبي|أبو ظبي|الشارقة/.test(t)) return "UAE";
  return fallback;
}
function normalizeImage(url?: string, category = "UAE") {
  if (!url || !/^https?:\/\//i.test(url)) return CATEGORY_IMG[category] || DEFAULT_IMG;
  return url;
}
function mapArticleToStory(a: any, fallbackCategory = "UAE"): Story {
  const title = decodeEntities(a?.title ?? "").trim() || "(untitled)";
  const desc = decodeEntities(a?.description ?? a?.content ?? "").trim();
  const sourceName = a?.source?.name || "Unknown";
  const url = a?.url || "";
  const img = normalizeImage(a?.urlToImage);
  const publishedAt = toISO(a?.publishedAt);
  const summaryEN = summarize(desc, 70);
  const cat = categoryGuess(`${title} ${summaryEN}`, fallbackCategory);
  return {
    category: cat,
    titleEN: title,
    summaryEN,
    titleAR: title,
    summaryAR: summaryEN,
    sourceUrl: url,
    sourceName,
    publishedAt,
    imageUrl: img || CATEGORY_IMG[cat] || DEFAULT_IMG,
  };
}

/* ---------- RSS ---------- */
const RSS_SOURCES: { name: string; url: string }[] = [
  // Arabic first
  { name: "Al Bayan", url: "https://www.albayan.ae/polopoly_fs/1.4612217.1655120696!/menu/standard/file/rss.xml" },
  { name: "Al Khaleej", url: "https://www.alkhaleej.ae/rss.xml" },
  { name: "Emarat Al Youm", url: "https://www.emaratalyoum.com/polopoly_fs/1.976?page=0&format=feed&type=rss" },
  { name: "Al Ain News", url: "https://al-ain.com/rss" },
  { name: "Al Arabiya", url: "https://www.alarabiya.net/.mrss/ar.xml" },
  { name: "CNN Arabic", url: "https://arabic.cnn.com/rss.xml" },
  // English UAE/Gulf
  { name: "Khaleej Times", url: "https://www.khaleejtimes.com/rss" },
  { name: "Gulf News", url: "https://gulfnews.com/rss" },
  { name: "The National", url: "https://www.thenationalnews.com/arc/outboundfeeds/rss/?outputType=xml" },
  { name: "Arabian Business", url: "https://www.arabianbusiness.com/feed" },
  { name: "Zawya", url: "https://www.zawya.com/en/rss" },
  { name: "Emirates 24|7", url: "http://www.emirates247.com/cmlink/en/xml/1.301" },
  // Official EN
  { name: "WAM", url: "https://wam.ae/en/-rss-feed" },
];

function stripHtml(input?: string) {
  if (!input) return "";
  const noCdata = input.replace(/<!\[CDATA\[(?:[\s\S]*?)\]\]>/g, (m) => m.slice(9, -3));
  const noTags = noCdata.replace(/<\/?[^>]+>/g, " ");
  return decodeEntities(noTags).replace(/\s+/g, " ").trim();
}
function parseRSS(xml: string) {
  const items = Array.from(xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)).map((m) => m[1]);
  const tag = (b: string, t: string) => b.match(new RegExp(`<${t}\\b[^>]*>([\\s\\S]*?)<\\/${t}>`, "i"))?.[1] ?? "";
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
    return { title, link, description, publishedAt: toISO(pubDate), image };
  });
}
async function fetchRSS(): Promise<Story[]> {
  const out: Story[] = [];
  for (const { name, url } of RSS_SOURCES) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) continue;
      const xml = await r.text();
      const items = parseRSS(xml);
      for (const it of items) {
        const titleEN = it.title || "(untitled)";
        const summaryEN = summarize(it.description, 70);
        const category = categoryGuess(`${titleEN} ${summaryEN}`, "UAE");
        out.push({
          category,
          titleEN,
          summaryEN,
          titleAR: titleEN,
          summaryAR: summaryEN,
          sourceUrl: it.link,
          sourceName: name,
          publishedAt: it.publishedAt,
          imageUrl: normalizeImage(it.image, category),
        });
      }
    } catch {}
  }
  return out;
}

/* ---------- NewsAPI ---------- */
async function fetchTopHeadlines(key: string) {
  const base = "https://newsapi.org/v2/top-headlines";
  const urls = NEWS_CATEGORIES.map(
    (c) => `${base}?country=ae&category=${c}&pageSize=25&apiKey=${key}`
  );
  const out: Story[] = [];
  for (const u of urls) {
    try {
      const r = await fetch(u, { cache: "no-store" });
      if (!r.ok) continue;
      const data = await r.json();
      if (!Array.isArray(data?.articles)) continue;
      for (const a of data.articles) out.push(mapArticleToStory(a, "UAE"));
    } catch {}
  }
  return out;
}
async function fetchEverything(key: string) {
  const base = "https://newsapi.org/v2/everything";
  const fromISO = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString();
  const qEN = encodeURIComponent('UAE OR "United Arab Emirates" OR Dubai OR "Abu Dhabi" OR Sharjah');
  const qAR = encodeURIComponent('الإمارات OR دبي OR "أبو ظبي" OR الشارقة');
  const urls = [
    `${base}?q=${qEN}&language=en&from=${fromISO}&sortBy=publishedAt&pageSize=30&apiKey=${key}`,
    `${base}?q=${qAR}&language=ar&from=${fromISO}&sortBy=publishedAt&pageSize=30&apiKey=${key}`,
  ];
  const out: Story[] = [];
  for (const u of urls) {
    try {
      const r = await fetch(u, { cache: "no-store" });
      if (!r.ok) continue;
      const data = await r.json();
      if (!Array.isArray(data?.articles)) continue;
      for (const a of data.articles) out.push(mapArticleToStory(a, "UAE"));
    } catch {}
  }
  return out;
}

/* ---------- Translation ---------- */
// Replace your existing translateBatch(...) with this one
async function translateBatch(
  items: { idx: number; from: "EN" | "AR"; title: string; summary: string }[],
  to: "EN" | "AR",
  OPENAI_API_KEY: string
): Promise<Array<{ title?: string; summary?: string }>> {
  if (items.length === 0) return [];

  const prompt = `
You are a professional news translator. Translate each item to ${to === "AR" ? "Modern Standard Arabic" : "English"} in a neutral, concise tone.
Keep names, numbers, currencies accurate. Return ONLY a JSON array in the same order:
[{"title":"...","summary":"..."}]

Items:
${items
  .map(
    (x, i) =>
      `${i + 1}. TITLE: ${x.title}\nSUMMARY: ${x.summary || x.title}`
  )
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

  const j = await r.json();
  const text: string = j?.choices?.[0]?.message?.content ?? "[]";
  try {
    const match = text.match(/\[[\s\S]*\]/);
    return match ? JSON.parse(match[0]) : [];
  } catch {
    return [];
  }
}


/* ---------- Route ---------- */
export async function GET(req: Request) {
  const headers: Record<string, string> = {};
  try {
    const NEWS_API_KEY = process.env.NEWS_API_KEY || "";
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
    const url = new URL(req.url);

    // frontend passes ?translate=1|0; language is chosen on the client UI
    const translateFlag = url.searchParams.get("translate") === "1";

    // Fetch sources in parallel
    const [rss, newsTop, newsEverything] = await Promise.all([
      fetchRSS(),
      NEWS_API_KEY ? fetchTopHeadlines(NEWS_API_KEY) : Promise.resolve([]),
      NEWS_API_KEY ? fetchEverything(NEWS_API_KEY) : Promise.resolve([]),
    ]);

    // Merge + dedupe by URL
    let merged: Story[] = [...rss, ...newsTop, ...newsEverything];
    const seen = new Set<string>();
    merged = merged.filter((s) => s.sourceUrl && !seen.has(s.sourceUrl) && seen.add(s.sourceUrl));

    // Sort newest + cap
    merged.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
    merged = merged.slice(0, 120);

    // If translate=1 and key present → do small translation pass
    let translatedCount = 0;
    if (translateFlag && OPENAI_API_KEY && merged.length > 0) {
      // Prepare two batches:
      // EN->AR for stories that look English-only, and AR->EN for Arabic-only.
      const enOnly = merged
        .map((s, idx) => ({ s, idx }))
        .filter(({ s }) => !hasArabic(s.titleEN + " " + s.summaryEN))
        .slice(0, 15)
        .map(({ s, idx }) => ({ idx, from: "EN" as const, title: s.titleEN, summary: s.summaryEN }));
      const arOnly = merged
        .map((s, idx) => ({ s, idx }))
        .filter(({ s }) => hasArabic(s.titleEN + " " + s.summaryEN))
        .slice(0, 10)
        .map(({ s, idx }) => ({ idx, from: "AR" as const, title: s.titleEN, summary: s.summaryEN }));

      // Translate EN->AR
      const trAR = await translateBatch(enOnly, "AR", OPENAI_API_KEY);
      trAR.forEach((r: { title?: string; summary?: string }, i: number) => {
  const idx = enOnly[i].idx;
  if (r?.title) merged[idx].titleAR = r.title;
  if (r?.summary) merged[idx].summaryAR = r.summary;
  merged[idx].translatedFrom = "EN";
});
      // Translate AR->EN
      const trEN = await translateBatch(arOnly, "EN", OPENAI_API_KEY);
      trEN.forEach((r: { title?: string; summary?: string }, i: number) => {
  const idx = arOnly[i].idx;
  if (r?.title) merged[idx].titleEN = r.title;
  if (r?.summary) merged[idx].summaryEN = r.summary;
  merged[idx].translatedFrom = "AR";
});

      translatedCount = (trAR?.length || 0) + (trEN?.length || 0);
    }

    headers["x-shift-counts"] =
      `rss=${rss.length},newsapiTop=${newsTop.length},newsapiEverything=${newsEverything.length},merged=${merged.length},translated=${translatedCount}`;
    headers["x-shift-trans"] = translateFlag ? (OPENAI_API_KEY ? "on" : "missing-key") : "off";
    headers["x-shift-data"] = (newsTop.length + newsEverything.length) > 0 ? "live" : "live-rss";

    // Always return something (demo if empty)
    if (merged.length === 0) {
      headers["x-shift-data"] = "demo";
      const demo: Story[] = [
        {
          category: "UAE",
          titleEN: "Demo: Dubai announces public transport upgrades",
          summaryEN: "RTA unveiled plans to expand metro and bus capacity to meet demand.",
          titleAR: "عرض تجريبي: دبي تعلن عن تحديثات في النقل العام",
          summaryAR: "خطة لتوسعة طاقة المترو والحافلات لتلبية الطلب المتزايد.",
          sourceUrl: "#",
          sourceName: "Shift+",
          publishedAt: new Date().toISOString(),
          imageUrl: CATEGORY_IMG["UAE"] || DEFAULT_IMG,
        },
      ];
      return NextResponse.json(demo, { headers, status: 200 });
    }

    return NextResponse.json(merged, { headers, status: 200 });
  } catch (e: any) {
    const headers = {
      "x-shift-data": "catch",
      "x-shift-reason": e?.message || "unknown",
    };
    return NextResponse.json([], { headers, status: 200 });
  }
}
