import { NextRequest, NextResponse } from "next/server";
import { getSessionPayload, SESSION, createSessionToken } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  // Retornamos 200 con role:null cuando no hay sesion para evitar ruido 401
  // en la consola del browser. El caller debe chequear d?.role truthy.
  const token = req.cookies.get(SESSION.COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ role: null, authenticated: false });
  const payload = await getSessionPayload(token);
  if (!payload) return NextResponse.json({ role: null, authenticated: false });
  return NextResponse.json({ ...payload, authenticated: true });
}

const UpdateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  phone: z.string().max(20).optional(),
});

export async function PATCH(req: NextRequest) {
  const token = req.cookies.get(SESSION.COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const payload = await getSessionPayload(token);
  if (!payload) return NextResponse.json({ error: "session expired" }, { status: 401 });

  const body = await req.json().catch((err) => { logger.warn("[auth/me] invalid JSON body", { error: String(err) }); return null; });
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const parsed = UpdateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ issues: parsed.error.issues }, { status: 400 });
  }

  const { name } = parsed.data;

  try {
    await prisma.adminUser.update({
      where: { tenantId_username: { tenantId: payload.tenantId, username: payload.username } },
      data: { ...(name !== undefined ? { name } : {}) },
    });

    // Refresh session token with updated name
    const newToken = await createSessionToken(payload.role, payload.username, payload.tenantId, name ?? payload.name ?? "");
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION.COOKIE_NAME, newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: SESSION.MAX_AGE,
      path: "/",
    });
    return response;
  } catch {
    return NextResponse.json({ error: "failed to update profile" }, { status: 500 });
  }
}
