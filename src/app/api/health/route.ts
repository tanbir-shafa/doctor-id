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
  const start = Date.now();
  try {
    await dbConnect();
    const admin = mongoose.connection.db?.admin();
    if (!admin) throw new Error("Mongo admin handle unavailable");
    await admin.ping();
    return NextResponse.json({
      status: "ok",
      uptimeSeconds: Math.round(process.uptime()),
      mongoLatencyMs: Date.now() - start,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json(
      { status: "degraded", error: message, timestamp: new Date().toISOString() },
      { status: 503 },
    );
  }
}
