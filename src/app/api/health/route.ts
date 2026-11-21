import { NextResponse } from "next/server";
import { dbState } from "@/lib/db";

export function GET() {
  return NextResponse.json({
    status: "ok",
    app: "tresorerie",
    db: dbState(),
    timestamp: new Date().toISOString(),
  });
}
