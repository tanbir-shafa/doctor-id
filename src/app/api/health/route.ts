import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { dbConnect } from "@/lib/db/mongoose";

/**
 * Health endpoint used by ECS task health checks + smoke tests.
 *
 * 200 → connected to Mongo and able to issue a ping.
 * 503 → Mongo is unreachable. ECS will recycle the task.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    await dbConnect();
    const admin = mongoose.connection.db?.admin();
    if (!admin) throw new Error("Mongo admin handle unavailable");
    await admin.ping();
    // Minimal body on purpose: this endpoint is unauthenticated, so we don't
    // hand anonymous callers infra detail (uptime, Mongo latency, error strings).
    // ECS only needs the 200/503 status code; failure detail goes to logs.
    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("[health] Mongo ping failed:", err);
    return NextResponse.json({ status: "degraded" }, { status: 503 });
  }
}
