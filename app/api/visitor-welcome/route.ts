import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { verifySessionToken, SESSION } from "@/lib/session";

// ─── Validation ───────────────────────────────────────────
const VisitorSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  devices: z
    .array(z.enum(["celular", "tablet", "computadora"]))
    .min(1)
    .max(3),
});

// POST /api/visitor-welcome — save first-time visitor response
export async function POST(req: NextRequest) {
  const rateLimited = applyRateLimit(req, "STRICT", "visitor-welcome");
  if (rateLimited) return rateLimited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const parsed = VisitorSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const tenantId = req.headers.get("x-tenant-id") ?? "main";
  const userAgent = req.headers.get("user-agent") ?? undefined;

  const record = await prisma.visitorWelcome.create({
    data: {
      name: parsed.data.name,
      devices: JSON.stringify(parsed.data.devices),
      userAgent,
      tenantId,
    },
  });

  return NextResponse.json({ success: true, id: record.id }, { status: 201 });
}

// GET /api/visitor-welcome — list responses (admin only)
export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION.COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = req.headers.get("x-tenant-id") ?? "main";
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? "50")));
  const skip = (page - 1) * limit;

  const [total, rows] = await Promise.all([
    prisma.visitorWelcome.count({ where: { tenantId } }),
    prisma.visitorWelcome.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
  ]);

  const data = rows.map((r) => {
    let devices: string[] = [];
    try { devices = JSON.parse(r.devices) as string[]; } catch { /* corrupted data */ }
    return { ...r, devices };
  });

  return NextResponse.json({ data, total, page, limit });
}
