import { NextResponse } from "next/server";
import { generateOpenAPIDoc } from "@/lib/openapi/generator";

export async function GET() {
  const doc = generateOpenAPIDoc();
  return NextResponse.json(doc, {
    headers: { "Content-Type": "application/json" },
  });
}
