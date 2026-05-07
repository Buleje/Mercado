import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { tryAdmin } from "@/lib/require-admin";
import { createInvite, verifyInvite, acceptInvite } from "@/lib/invite";
import type { InviteRole } from "@/lib/invite";

// ─── POST /api/invite ─────────────────────────────────────────────────────────
// Create a new invitation link. Requires admin session.

export async function POST(req: NextRequest) {
  // SECURITY 2026-05-06: tenantId del JWT, no del header. Antes un admin de
  // tenant A podía generar un invite para tenant B forzando x-tenant-id=B.
  const session = await tryAdmin(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tenantId = session.tenantId;

  let body: { email?: unknown; role?: unknown };
  try {
    body = (await req.json()) as { email?: unknown; role?: unknown };
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const role: InviteRole = (["admin", "editor", "viewer"].includes(String(body.role))
    ? String(body.role)
    : "editor") as InviteRole;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Email inválido" }, { status: 400 });
  }

  try {
    const { token, expiresAt } = await createInvite(tenantId, email, role);
    const inviteUrl = `${req.nextUrl.origin}/invite?token=${token}`;
    return NextResponse.json({ ok: true, inviteUrl, expiresAt }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── GET /api/invite?token=xxx ────────────────────────────────────────────────
// Verify an invitation token (called from the acceptance page).

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  if (!token) {
    return NextResponse.json({ error: "Token requerido" }, { status: 400 });
  }

  const result = await verifyInvite(token);
  if (!result.valid) {
    return NextResponse.json({ valid: false, reason: result.reason }, { status: 404 });
  }

  const tenant = await prisma.tenant.findFirst({
    where: { slug: result.invite.tenantId },
    select: { name: true, slug: true },
  });

  return NextResponse.json({
    valid: true,
    email: result.invite.email,
    role: result.invite.role,
    tenantName: tenant?.name ?? result.invite.tenantId,
    tenantSlug: result.invite.tenantId,
    expiresAt: result.invite.expiresAt,
  });
}

// ─── PATCH /api/invite ────────────────────────────────────────────────────────
// Accept an invitation (called after the user logs in / registers).

export async function PATCH(req: NextRequest) {
  let body: { token?: unknown };
  try {
    body = (await req.json()) as { token?: unknown };
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token : "";
  if (!token) {
    return NextResponse.json({ error: "Token requerido" }, { status: 400 });
  }

  const accepted = await acceptInvite(token);
  if (!accepted) {
    return NextResponse.json({ error: "Invitación inválida o expirada" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
