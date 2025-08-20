export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

export async function GET() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return NextResponse.json(
      { ok: false, reason: "missing OPENAI_API_KEY" },
      { status: 200 }
    );
  }
  try {
    const r = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    const text = await r.text();
    return NextResponse.json(
      { ok: r.ok, status: r.status, body: text.slice(0, 300) },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, reason: e?.message || "network-error" },
      { status: 200 }
    );
  }
}
