/**
 * Feature Flags Management API
 *
 * GET  /api/settings/feature-flags          → list all flags for the tenant
 * PATCH /api/settings/feature-flags         → update one or more flags
 *   Body: { flag: FeatureFlag; enabled: boolean } | Array<...>
 */

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import {
  getFeatureFlags,
  setFeatureFlag,
  type FeatureFlag,
} from "@/lib/feature-flags";
import { z } from "zod";

const FlagUpdateSchema = z.object({
  flag: z.string(),
  enabled: z.boolean(),
});

const BatchSchema = z.union([FlagUpdateSchema, z.array(FlagUpdateSchema)]);

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const flags = await getFeatureFlags(auth.tenantId);
  return NextResponse.json({ flags });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = BatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const updates = Array.isArray(parsed.data) ? parsed.data : [parsed.data];

  for (const { flag, enabled } of updates) {
    await setFeatureFlag(auth.tenantId, flag as FeatureFlag, enabled);
  }

  const flags = await getFeatureFlags(auth.tenantId);
  return NextResponse.json({ flags });
}
