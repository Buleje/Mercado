import { NextResponse } from "next/server";
import { generateOpenAPIDoc } from "@/lib/openapi/generator";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    const doc = generateOpenAPIDoc();
    return NextResponse.json(doc, {
      headers: { "Content-Type": "application/json" },
    });

  } catch (e) {
    logger.error("[get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
