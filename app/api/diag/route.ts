import { NextResponse } from "next/server";

export async function GET() {
  const hasKey = !!process.env.NEWS_API_KEY;

  // very light ping to NewsAPI (no key exposed in response)
  let newsOk = false;
  let count = 0;
  let status = "skip";
  try {
    if (hasKey) {
      const url = `https://newsapi.org/v2/everything?q=UAE%20OR%20Dubai%20OR%20%22Abu%20Dhabi%22&language=en&from=${encodeURIComponent(
        new Date(Date.now() - 72 * 3600 * 1000).toISOString()
      )}&pageSize=5&apiKey=${process.env.NEWS_API_KEY}`;
      const r = await fetch(url);
      status = `${r.status}`;
      const j = await r.json();
      if (j?.articles?.length) {
        newsOk = true;
        count = j.articles.length;
      }
    }
  } catch {}

  return NextResponse.json({
    envKeyLoaded: hasKey,     // true/false
    newsApiReachable: newsOk, // true/false
    sampleCount: count,       // number of articles retrieved in test
    httpStatus: status,       // e.g. "200"
  });
}
