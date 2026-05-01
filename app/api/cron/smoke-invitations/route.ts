import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * GET /api/cron/smoke-invitations
 *
 * Smoke test del flujo de EmployeeInvitation. Auth Bearer CRON_SECRET.
 * Corre 1×/sem (lunes 9:13 UTC). Idempotente.
 *
 * Pasos:
 *   1. Crea EmployeeInvitation directo en DB (skip endpoint admin).
 *   2. Simula GET /api/invitations/[token] — verifica row pending y not expired.
 *   3. Simula POST /accept — crea AdminUser + marca accepted en TX.
 *   4. Verifica que AdminUser quedó creado con role correcto.
 *   5. Cleanup — borra AdminUser + EmployeeInvitation creados.
 *
 * Reporte: { ok, steps[{name, ok, ms, error?}], totalMs }.
 */

const TENANT_ID = "main"; // tenant smoke
const ROLE = "cajero";
const TIMESTAMP = () => Date.now();

interface Step {
  name: string;
  ok: boolean;
  ms: number;
  error?: string;
}

interface InvRow {
  id: string;
  status: string;
  expiresAt: Date;
}

export async function GET(req: NextRequest) {
  // Auth Bearer.
  const authHeader = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const start = TIMESTAMP();
  const steps: Step[] = [];
  const runId = randomBytes(4).toString("hex");
  const inviteId = `einv_smoke_${runId}`;
  const token = `smoke_${randomBytes(20).toString("hex")}`;
  const username = `smoke_${runId}`;
  let adminUserId: string | null = null;
  let overallOk = true;

  const step = async (name: string, fn: () => Promise<void>) => {
    const t0 = TIMESTAMP();
    try {
      await fn();
      steps.push({ name, ok: true, ms: TIMESTAMP() - t0 });
    } catch (e: unknown) {
      overallOk = false;
      steps.push({
        name,
        ok: false,
        ms: TIMESTAMP() - t0,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  };

  await step("1.create-invitation", async () => {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "EmployeeInvitation" ("id","tenantId","phone","name","role","token","status","expiresAt","createdBy") VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,$8)`,
      inviteId, TENANT_ID, "+51999000000", "Smoke Test", ROLE, token,
      new Date(Date.now() + 24 * 3600_000), "smoke-cron",
    );
  });

  await step("2.fetch-token", async () => {
    const rows = await prisma.$queryRawUnsafe<InvRow[]>(
      `SELECT "id","status","expiresAt" FROM "EmployeeInvitation" WHERE "token"=$1 LIMIT 1`,
      token,
    );
    if (rows.length === 0) throw new Error("not found");
    if (rows[0].status !== "pending") throw new Error(`status=${rows[0].status}`);
    if (new Date(rows[0].expiresAt).getTime() < Date.now()) throw new Error("expired");
  });

  await step("3.accept-create-admin", async () => {
    const passwordHash = await hash("Smoke1234!", 10);
    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.adminUser.create({
        data: {
          tenantId: TENANT_ID,
          username,
          passwordHash,
          role: ROLE,
          name: "Smoke Test",
          active: true,
        },
        select: { id: true },
      });
      await tx.$executeRawUnsafe(
        `UPDATE "EmployeeInvitation" SET "status"='accepted', "acceptedAt"=NOW() WHERE "id"=$1`,
        inviteId,
      );
      return user;
    });
    adminUserId = created.id;
  });

  await step("4.verify-admin-user", async () => {
    if (!adminUserId) throw new Error("adminUserId null");
    const user = await prisma.adminUser.findUnique({
      where: { id: adminUserId },
      select: { role: true, active: true, tenantId: true },
    });
    if (!user) throw new Error("admin user not found");
    if (user.role !== ROLE) throw new Error(`role=${user.role}, expected ${ROLE}`);
    if (!user.active) throw new Error("not active");
    if (user.tenantId !== TENANT_ID) throw new Error("tenant mismatch");
  });

  // Cleanup siempre — incluso si pasos previos fallaron, intentamos limpiar.
  await step("5.cleanup", async () => {
    if (adminUserId) {
      await prisma.adminUser
        .delete({ where: { id: adminUserId } })
        .catch((err: unknown) => logger.warn("[smoke-invitations] cleanup admin failed", { error: String(err) }));
    }
    await prisma.$executeRawUnsafe(
      `DELETE FROM "EmployeeInvitation" WHERE "id"=$1`, inviteId,
    );
  });

  const totalMs = TIMESTAMP() - start;
  const payload = { ok: overallOk, runId, steps, totalMs };

  if (overallOk) {
    logger.info("[smoke-invitations] ok", payload);
  } else {
    logger.error("[smoke-invitations] FAILED", payload);
  }

  return NextResponse.json(payload, { status: overallOk ? 200 : 500 });
}
