/* eslint-disable @typescript-eslint/no-unused-vars */
export const runtime = "nodejs";

import { NextResponse } from "next/server";

// ---------- Types ----------
type Lang = "EN" | "AR";

type RawItem = {
  title: string;
  summary: string;
  url: string;
  publishedAt: string; // ISO
  sourceName: string;
  lang: Lang;
  imageUrl?: string;
  category?: string;
};

type Story = {
  category: string;
  publishedAt: string; // ISO
  imageUrl?: string;
  // EN
  titleEN?: string;
  summaryEN?: string;
  urlEN?: string;
  sourceEN?: string;
  // AR
  titleAR?: string;
  summaryAR?: string;
  urlAR?: string;
  sourceAR?: string;
};

// ---------- Config ----------
const TRANSLATE_ALWAYS = false; // set true if you want server to always translate when key exists

// Representative feeds (expand later)
const FEEDS: Array<{ url: string; source: string; lang: Lang; category: string }> = [
  // English
  { url: "https://www.thenationalnews.com/rss",   source: "The National",     lang: "EN", category: "UAE" },
  { url: "https://www.arabianbusiness.com/feed",  source: "Arabian Business", lang: "EN", category: "Business" },
  // Arabic
  { url: "https://www.cnn.com/arabic/feed",       source: "CNN العربية",      lang: "AR", category: "World" },
  { url: "https://www.skynewsarabia.com/rss",     source: "Sky News عربية",   lang: "AR", category: "World" },
];

// ---------- Helpers ----------
function stripHtml(input?: string): string {
  if (!input) return "";
  // remove CDATA (no dotall flag; use [\s\S])
  const noCdata = input.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  // remove tags
  const noTags = noCdata.replace(/<\/?[^>]+>/g, " ");
  // collapse spaces
  return noTags.replace(/\s+/g, " ").trim();
}

function toIso(pub?: string): string {
  if (!pub) return new Date().toISOString();
  const t = new Date(pub);
  if (isNaN(t.getTime())) return new Date().toISOString();
  return t.toISOString();
}

function extractImage(_xml: string, itemBlock: string): string | undefined {
  const media = /<media:content[^>]*url="([^"]+)"/i.exec(itemBlock);
  if (media?.[1]) return media[1];
  const enc = /<enclosure[^>]*url="([^"]+)"/i.exec(itemBlock);
  if (enc?.[1]) return enc[1];
  const img = /<img[^>]*src="([^"]+)"/i.exec(itemBlock);
  return img?.[1];
}

async function fetchRSS(
  feedUrl: string,
  sourceName: string,
  lang: Lang,
  category: string
): Promise<RawItem[]> {
  try {
    const resp = await fetch(feedUrl, { cache: "no-store" });
    if (!resp.ok) return [];
    const xml = await resp.text();

    const items = xml.split(/<item>/i).slice(1);
    const results: RawItem[] = [];

    for (const rest of items) {
      const block = "<item>" + rest;
      const title = stripHtml((/<title>([\s\S]*?)<\/title>/i.exec(block) || [])[1] || "");
      const desc = stripHtml((/<description>([\s\S]*?)<\/description>/i.exec(block) || [])[1] || "");
      const link = stripHtml((/<link>([\s\S]*?)<\/link>/i.exec(block) || [])[1] || "");
      const pub = stripHtml((/<pubDate>([\s\S]*?)<\/pubDate>/i.exec(block) || [])[1] || "");
      const imageUrl = extractImage(xml, block);

      if (!title || !link) continue;

      results.push({
        title,
        summary: desc,
        url: link,
        publishedAt: toIso(pub),
        sourceName,
        lang,
        imageUrl,
        category,
      });
    }
    return results;
  } catch {
    return [];
  }
}

function mergeToStories(items: RawItem[]): Story[] {
  const out: Story[] = [];

  for (const it of items) {
    // naive merge: same/close time and overlapping titles
    const idx = out.findIndex((s) => {
      const tRef = new Date(s.publishedAt).getTime();
      const tCur = new Date(it.publishedAt).getTime();
      const close = Math.abs(tRef - tCur) < 2 * 3600 * 1000;
      const titleRef = (s.titleEN || s.titleAR || "").toLowerCase();
      const titleCur = it.title.toLowerCase();
      return close && (titleRef.includes(titleCur) || titleCur.includes(titleRef));
    });

    const base: Story = {
      category: it.category || "World",
      publishedAt: it.publishedAt,
      imageUrl: it.imageUrl,
    };

    if (idx === -1) {
      if (it.lang === "EN") {
        out.push({ ...base, titleEN: it.title, summaryEN: it.summary, urlEN: it.url, sourceEN: it.sourceName });
      } else {
        out.push({ ...base, titleAR: it.title, summaryAR: it.summary, urlAR: it.url, sourceAR: it.sourceName });
      }
    } else {
      const s = out[idx];
      if (new Date(it.publishedAt) > new Date(s.publishedAt)) s.publishedAt = it.publishedAt;
      if (!s.imageUrl && it.imageUrl) s.imageUrl = it.imageUrl;

      if (it.lang === "EN") {
        s.titleEN = s.titleEN || it.title;
        s.summaryEN = s.summaryEN || it.summary;
        s.urlEN = s.urlEN || it.url;
        s.sourceEN = s.sourceEN || it.sourceName;
      } else {
        s.titleAR = s.titleAR || it.title;
        s.summaryAR = s.summaryAR || it.summary;
        s.urlAR = s.urlAR || it.url;
        s.sourceAR = s.sourceAR || it.sourceName;
      }
    }
  }

  out.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  return out.slice(0, 40);
}

async function translatePair(
  _from: Lang,
  to: Lang,
  key: string,
  title: string,
  summary: string
): Promise<{ title: string; summary: string } | null> {
  try {
    const sys =
      to === "AR"
        ? "ترجم النص التالي إلى العربية الفصحى المبسطة للموجز الإخباري. لا تضف آراء. أعد الصياغة بإيجاز واضح."
        : "Translate the following into clear, concise English for a news brief. No opinions. Keep it crisp.";

    const prompt = `Title:\n${title}\n\nSummary:\n${summary}`.trim();

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
      }),
    });

    if (!resp.ok) return null;
    const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content || "";
    if (!content) return null;

    const lines = content.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const outTitle = lines[0] || title;
    const outSummary = lines.slice(1).join(" ") || summary;
    return { title: outTitle, summary: outSummary };
  } catch {
    return null;
  }
}

// ---------- Handler ----------
export async function GET(req: Request) {
  const headers = new Headers();

  // Query + env
  const { searchParams } = new URL(req.url);
  const translateParam = searchParams.get("translate"); // "1" to force translate
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

  // Single source of truth for translation switch
  const translateFlag = translateParam === "1" || (TRANSLATE_ALWAYS && !!OPENAI_API_KEY);
  headers.set("x-shift-trans", translateFlag ? (OPENAI_API_KEY ? "on" : "missing-key") : "off");

  // 1) Fetch all feeds
  const batches = await Promise.all(FEEDS.map((f) => fetchRSS(f.url, f.source, f.lang, f.category)));
  const rawItems = batches.flat();

  // 2) Merge to canonical stories
  let stories = mergeToStories(rawItems);

  // 3) Demo fallback if nothing
  if (stories.length === 0) {
    headers.set("x-shift-data", "demo");
    stories = [
      {
        category: "UAE",
        publishedAt: new Date().toISOString(),
        imageUrl: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?q=80&w=1200&auto=format&fit=crop",
        titleEN: "UAE Cabinet announces new traffic safety measures",
        summaryEN: "Authorities outlined late‑night heavy vehicle restrictions to ease congestion and improve safety.",
        urlEN: "https://example.com/uae-news",
        sourceEN: "Example",
      },
    ];
  } else {
    headers.set("x-shift-data", "live");
  }

  // 4) Optional translation pass (fill only missing sides)
  if (translateFlag && OPENAI_API_KEY && stories.length > 0) {
    let translatedCount = 0;

    // EN -> AR
    for (let i = 0; i < stories.length; i++) {
      const s = stories[i];
      if (s.titleEN && !s.titleAR) {
        const res = await translatePair("EN", "AR", OPENAI_API_KEY, s.titleEN, s.summaryEN || "");
        if (res) {
          s.titleAR = res.title;
          s.summaryAR = res.summary;
          s.urlAR = s.urlAR || s.urlEN || "";
          s.sourceAR = s.sourceAR || s.sourceEN || "";
          translatedCount++;
        }
      }
    }

    // AR -> EN
    for (let i = 0; i < stories.length; i++) {
      const s = stories[i];
      if (s.titleAR && !s.titleEN) {
        const res = await translatePair("AR", "EN", OPENAI_API_KEY, s.titleAR, s.summaryAR || "");
        if (res) {
          s.titleEN = res.title;
          s.summaryEN = res.summary;
          s.urlEN = s.urlEN || s.urlAR || "";
          s.sourceEN = s.sourceEN || s.sourceAR || "";
          translatedCount++;
        }
      }
    }

    headers.set("x-shift-trans-count", String(translatedCount));
  }

  return NextResponse.json(stories, { headers });
}
