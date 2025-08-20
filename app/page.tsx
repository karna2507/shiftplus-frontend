"use client";

import { useEffect, useMemo, useState } from "react";

/* ---------------- Types ---------------- */
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
};

/* ---------------- Component ---------------- */
export default function Home() {
  /* State */
  const [stories, setStories] = useState<Story[]>([]);
  const [lang, setLang] = useState<"EN" | "AR">("EN");
  const [translate, setTranslate] = useState<boolean>(false); // UI-only toggle (no backend wire if your key is off)
  const [category, setCategory] = useState<string>("All");
  const [index, setIndex] = useState(0);
  const [imgOk, setImgOk] = useState(true);
  const [dataSrc, setDataSrc] = useState<"live" | "live-rss" | "demo" | "error" | "catch" | "unknown">("unknown");

  /* Restore preferences from localStorage once on mount */
  useEffect(() => {
    try {
      const savedLang = (localStorage.getItem("shift_lang") as "EN" | "AR") || "EN";
      const savedTrans = localStorage.getItem("shift_translate");
      setLang(savedLang);
      setTranslate(savedTrans === "1");
    } catch {}
  }, []);

  /* Persist preferences when they change */
  useEffect(() => {
    try {
      localStorage.setItem("shift_lang", lang);
      localStorage.setItem("shift_translate", translate ? "1" : "0");
    } catch {}
  }, [lang, translate]);

  /* Load stories (DEFENSIVE) */
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/stories?ts=${Date.now()}`, { cache: "no-store" });

        const hdr = (res.headers.get("x-shift-data") ||
          res.headers.get("X-Shift-Data") ||
          "unknown") as "live" | "live-rss" | "demo" | "error" | "catch" | "unknown";

        let data: Story[] = [];
        if (res.ok) {
          const text = await res.text();
          try {
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed)) data = parsed;
            else console.error("stories API did not return an array:", parsed);
          } catch (e) {
            console.error("JSON parse failed for /api/stories:", (e as Error).message);
          }
        } else {
          console.error("HTTP error from /api/stories:", res.status, res.statusText);
        }

        setStories(Array.isArray(data) ? data : []);
        setDataSrc(hdr);
      } catch (e: any) {
        console.error("Network fetch failed:", e?.message || e);
        setStories([]);
        setDataSrc("error");
      }
    })();
  }, []);

  /* Derived */
  const isEN = lang === "EN";
  const allCats = useMemo(
    () => ["All", ...Array.from(new Set(stories.map((s) => s.category)))],
    [stories]
  );
  const filtered = category === "All" ? stories : stories.filter((s) => s.category === category);
  const story = filtered[index] || null;

  /* Reset index when list changes */
  useEffect(() => {
    setIndex(0);
  }, [category, stories.length]);

  /* Reset image fallback when story changes */
  useEffect(() => {
    setImgOk(true);
  }, [story?.imageUrl, index]);

  /* Helpers */
  function timeAgo(iso: string) {
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return isEN ? "just now" : "الآن";
    const diffSec = Math.max(1, Math.floor((Date.now() - t) / 1000));
    if (isEN) {
      if (diffSec < 60) return `${diffSec} sec ago`;
      if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min ago`;
      if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} hr ago`;
      return `${Math.floor(diffSec / 86400)} d ago`;
    } else {
      if (diffSec < 60) return `قبل ${diffSec} ثانية`;
      const m = Math.floor(diffSec / 60);
      if (diffSec < 3600) return `قبل ${m} دقيقة`;
      const h = Math.floor(diffSec / 3600);
      if (diffSec < 86400) return `قبل ${h} ساعة`;
      const d = Math.floor(diffSec / 86400);
      return `قبل ${d} يوم`;
    }
  }

  const nextStory = () =>
    filtered.length > 0 && setIndex((i) => Math.min(i + 1, filtered.length - 1));
  const prevStory = () =>
    filtered.length > 0 && setIndex((i) => Math.max(i - 1, 0));

  /* Styles */
  const chipBase: React.CSSProperties = {
    padding: "6px 12px",
    borderRadius: 9999,
    border: "1px solid #e5e7eb",
    background: "white",
    color: "#0C2233",
    fontWeight: 700,
    cursor: "pointer",
  };

  // Import Arabic font
  const fontsImport = `
    @import url('https://fonts.googleapis.com/css2?family=El+Messiri:wght@400;600;700&display=swap');
  `;

  const arabicStyle: React.CSSProperties = {
    fontFamily: `"El Messiri", sans-serif`,
    fontSize: 20,
    lineHeight: 1.02,
    color: "#0C2233",
    whiteSpace: "nowrap",
  };

  /* Logo block:
     - "Shift" big, bold
     - A vertical mini-stack to the right with "+" on top and "NEWS" beneath it
     - Arabic "شيفت" tucked under the left of "Shift"
  */
  const LogoBlock = () => (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, marginTop: 10 }}>
      {/* Left: English word */}
      <div style={{ position: "relative", lineHeight: 1.05, display: "inline-block" }}>
        <div style={{ fontSize: 48, fontWeight: 900, color: "#0C2233", display: "inline-block" }}>
          <span style={{ position: "relative", display: "inline-block", paddingRight: 0 }}>
            Shift
          </span>
        </div>

        {/* Arabic tucked to bottom-left */}
        <div
          style={{
            position: "absolute",
            left: 2,
            bottom: -12,
            fontWeight: 700,
            ...arabicStyle,
          }}
        >
          شيفت
        </div>
      </div>

      {/* Right: vertical stack for + and NEWS */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          lineHeight: 1,
          marginLeft: 2, // nudge closer to the "t"
          transform: "translateY(-6px)", // tuck slightly upward
        }}
      >
        <div
          style={{
            fontSize: 34,
            fontWeight: 900,
            color: "#16a34a", // green to avoid medical red look
            marginBottom: -2,
          }}
        >
          +
        </div>
        <div
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: 1,
            color: "#0C2233",
          }}
        >
          NEWS
        </div>
      </div>
    </div>
  );

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "white",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center", // vertical centering
        padding: 20,
      }}
    >
      <style>{fontsImport}</style>

      {/* LOGO */}
      <LogoBlock />

      {/* LANGUAGE + TRANSLATE PILLS (UI only) */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, flexWrap: "wrap", justifyContent: "center" }}>
        <div
          style={{
            display: "inline-flex",
            border: "1px solid #e5e7eb",
            borderRadius: 9999,
            overflow: "hidden",
          }}
        >
          <button
            onClick={() => setLang("EN")}
            style={{
              padding: "6px 10px",
              fontSize: 14,
              fontWeight: isEN ? 800 : 600,
              background: isEN ? "#f3f4f6" : "white",
              borderRight: "1px solid #e5e7eb",
              cursor: "pointer",
            }}
          >
            EN
          </button>
          <button
            onClick={() => setLang("AR")}
            style={{
              padding: "6px 10px",
              fontSize: 14,
              fontWeight: !isEN ? 800 : 600,
              background: !isEN ? "#f3f4f6" : "white",
              cursor: "pointer",
            }}
          >
            العربية
          </button>
        </div>

        {/* Translate pill (UI only for now) */}
        <button
          onClick={() => setTranslate((v) => !v)}
          aria-pressed={translate}
          title={isEN ? "Auto-translate cross-language stories (UI only)" : "ترجمة تلقائية (واجهة فقط)"}
          style={{
            ...chipBase,
            padding: "6px 10px",
            background: translate ? "#0C2233" : "white",
            color: translate ? "#ffffff" : "#0C2233",
          }}
        >
          ⟲ {isEN ? (translate ? "Translate: ON" : "Translate: OFF") : translate ? "الترجمة: مفعّلة" : "الترجمة: غير مفعّلة"}
        </button>
      </div>

      {/* LIVE/DEMO indicator */}
      <div style={{ marginTop: 8, fontSize: 11, color: "#6b7280" }}>
        {dataSrc === "live" && "Live (NewsAPI)"}
        {dataSrc === "live-rss" && "Live (RSS)"}
        {dataSrc === "demo" && "Demo data"}
        {dataSrc === "error" && "Error loading data"}
        {dataSrc === "catch" && "Server error"}
        {dataSrc === "unknown" && ""}
        {` ${"·"} ${isEN ? "Translate (UI):" : "الترجمة (واجهة):"} ${translate ? (isEN ? "On" : "مفعّلة") : (isEN ? "Off" : "غير مفعّلة")}`}
      </div>

      {/* Category chips */}
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          justifyContent: "center",
          marginTop: 14,
          marginBottom: 12,
        }}
      >
        {allCats.map((cat) => {
          const active = cat === category;
          return (
            <button
              key={cat}
              onClick={() => {
                setCategory(cat);
                setIndex(0);
              }}
              style={{
                ...chipBase,
                background: active ? "#0C2233" : "white",
                color: active ? "#ffffff" : "#0C2233",
              }}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* Pager status */}
      <div style={{ marginBottom: 8, fontSize: 12, color: "#6b7280" }}>
        {filtered.length > 0 ? `${index + 1} / ${filtered.length}` : ""}
      </div>

      {/* Card */}
      {story ? (
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            padding: 0,
            width: "100%",
            maxWidth: 540,
            boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
            overflow: "hidden",
            background: "white",
          }}
        >
          {/* Image */}
          <div style={{ width: "100%", height: 220, overflow: "hidden", background: "#EEF2F7" }}>
            {imgOk && story.imageUrl ? (
              <img
                src={story.imageUrl}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                onError={() => setImgOk(false)}
              />
            ) : (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#94A3B8",
                  fontWeight: 800,
                }}
              >
                Shift+
              </div>
            )}
          </div>

          <div
            style={{
              padding: 20,
              direction: isEN ? "ltr" : "rtl",
              textAlign: isEN ? "left" : "right",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto auto",
                gap: 10,
                alignItems: "center",
                marginBottom: 8,
                fontSize: 12,
                color: "#6b7280",
              }}
            >
              <span style={{ textTransform: "uppercase" }}>{story.category}</span>
              <span>{story.sourceName}</span>
              <span>{timeAgo(story.publishedAt)}</span>
            </div>

            <h2 style={{ fontSize: 20, fontWeight: 900, margin: "0 0 10px", color: "#0C2233" }}>
              {isEN ? story.titleEN : story.titleAR}
            </h2>

            <p style={{ fontSize: 16, color: "#374151", lineHeight: 1.5, marginBottom: 12 }}>
              {isEN ? story.summaryEN : story.summaryAR}
            </p>

            <a
              href={story.sourceUrl}
              target="_blank"
              rel="noreferrer"
              style={{ color: "#0C2233", fontWeight: 700, textDecoration: "underline" }}
            >
              {isEN ? "Read Original" : "اقرأ المصدر"}
            </a>
          </div>
        </div>
      ) : (
        <div style={{ color: "#6b7280" }}>
          {isEN ? "No stories in this category yet." : "لا توجد أخبار في هذه الفئة الآن."}
        </div>
      )}

      {/* Nav */}
      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <button
          onClick={prevStory}
          disabled={index <= 0}
          style={{
            padding: "8px 14px",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            cursor: index <= 0 ? "not-allowed" : "pointer",
            opacity: index <= 0 ? 0.5 : 1,
            fontWeight: 700,
          }}
        >
          {isEN ? "◀ Prev" : "السابق ◀"}
        </button>
        <button
          onClick={nextStory}
          disabled={index >= filtered.length - 1}
          style={{
            padding: "8px 14px",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            cursor: index >= filtered.length - 1 ? "not-allowed" : "pointer",
            opacity: index >= filtered.length - 1 ? 0.5 : 1,
            fontWeight: 700,
          }}
        >
          {isEN ? "Next ▶" : "التالي ▶"}
        </button>
      </div>
    </main>
  );
}
