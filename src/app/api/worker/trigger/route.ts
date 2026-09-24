import { NextResponse } from "next/server";

export const runtime = "nodejs";

const GITHUB_REPO = "KayProject/Binary";
const WORKFLOW_ID = "worker.yml";

export async function POST() {
  const token =
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN ||
    process.env.GITHUB_WORKFLOW_TOKEN;

  if (!token) {
    return NextResponse.json(
      { ok: false, error: "no github token configured for worker trigger" },
      { status: 200 }
    );
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${WORKFLOW_ID}/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "Binary-App",
        },
        body: JSON.stringify({ ref: "master" }),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      console.error("Worker trigger failed:", res.status, text);
      return NextResponse.json({ ok: false, status: res.status, error: text }, { status: 200 });
    }

    return NextResponse.json({ ok: true, dispatched: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Worker trigger error:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 200 });
  }
}
