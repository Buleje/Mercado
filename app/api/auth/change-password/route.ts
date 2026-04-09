import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getSessionPayload, SESSION } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { compare, hash } from "bcryptjs";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6).max(128),
});

export async function POST(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req, "AUTH", "auth:change-password");
  if (rateLimitResponse) return rateLimitResponse;

  const token = req.cookies.get(SESSION.COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const payload = await getSessionPayload(token);
  if (!payload) return NextResponse.json({ error: "session expired" }, { status: 401 });

  const body = await req.json();
  const parsed = ChangePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ issues: parsed.error.issues }, { status: 400 });
  }

  const { currentPassword, newPassword } = parsed.data;

  try {
    const user = await prisma.adminUser.findUnique({
      where: { tenantId_username: { tenantId: payload.tenantId, username: payload.username } },
      select: { passwordHash: true },
    });

    if (!user) {
      return NextResponse.json({ error: "user not found" }, { status: 404 });
    }

    // Verify current password
    const isValid = user.passwordHash.startsWith("$2")
      ? await compare(currentPassword, user.passwordHash)
      : currentPassword === user.passwordHash;

    if (!isValid) {
      return NextResponse.json({ error: "incorrect current password" }, { status: 403 });
    }

    // Hash and save new password
    const newHash = await hash(newPassword, 12);
    await prisma.adminUser.update({
      where: { tenantId_username: { tenantId: payload.tenantId, username: payload.username } },
      data: { passwordHash: newHash },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "failed to change password" }, { status: 500 });
  }
}
