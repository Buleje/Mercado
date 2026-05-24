/**
 * lib/auth/totp-step-up.ts
 *
 * Helper para "step-up TOTP" en endpoints destructivos del superadmin.
 *
 * Patrón de uso (handler):
 *   const body = await req.json().catch(() => ({}));
 *   const totpFail = await requireTotpStepUp(session.username, body);
 *   if (totpFail) return totpFail;  // 412 totp_required / 401 totp_invalid
 *   // ...resto del handler
 *
 * Por qué step-up:
 *  - Una sesión robada (cookie + CSRF de XSS) puede ejecutar mutaciones
 *    nucleares sin segundo factor.
 *  - Step-up obliga a tener el dispositivo TOTP encima en el momento de
 *    la operación, no solo cuando se hizo login hace 30 min.
 *
 * Operaciones cubiertas (post-sesión 2026-05-24):
 *  - DELETE /api/superadmin/tenants/[slug]/delete
 *  - DELETE /api/superadmin/tenants/[slug]/purge
 *  - POST   /api/superadmin/tenants/[slug]/reset-password
 *
 * Operación ya cubierta inline (no usa este helper):
 *  - DELETE /api/superadmin/purge (factory reset plataforma)
 *
 * Audit ref: post-sesión 2026-05-24 — security agent detectó missing TOTP.
 */

import "server-only";
import { NextResponse } from "next/server";
import { SuperadminTotpDB } from "@/lib/db/admin-totp.db";
import { verifyTotpCode } from "@/lib/auth/totp";
import { logger } from "@/lib/logger";

const TOTP_CODE_RE = /^\d{6}$/;

/**
 * Verifica que el superadmin tenga TOTP enrolado y haya enviado un
 * código válido en el body.
 *
 * @param username - El username del superadmin (de getPlatformSession)
 * @param body - El body parseado del request (debe contener `totpCode` string)
 * @returns null si pasa la validación, NextResponse 412/401 si falla
 */
export async function requireTotpStepUp(
  username: string,
  body: unknown,
): Promise<NextResponse | null> {
  // 1. Validar shape del body
  const bodyObj = (body ?? {}) as Record<string, unknown>;
  const totpCode = typeof bodyObj.totpCode === "string" ? bodyObj.totpCode : "";

  if (!TOTP_CODE_RE.test(totpCode)) {
    return NextResponse.json(
      {
        error: "totp_required",
        message:
          "Esta operación requiere código TOTP de 6 dígitos. Enviá `totpCode` en el body.",
      },
      { status: 412 },
    );
  }

  // 2. Verificar que el superadmin tenga TOTP enrolado
  const totpRow = await SuperadminTotpDB.getByUsername(username);
  if (!totpRow?.totpSecret || !totpRow.totpEnabledAt) {
    return NextResponse.json(
      {
        error: "totp_not_enrolled",
        message:
          "Esta operación requiere 2FA. Habilitá TOTP en /superadmin/security antes de continuar.",
      },
      { status: 412 },
    );
  }

  // 3. Validar el código (window ±1 contemplada en verifyTotpCode)
  const valid = verifyTotpCode(totpRow.totpSecret, totpCode);
  if (!valid) {
    logger.warn("[totp-step-up] código inválido", { username });
    return NextResponse.json(
      {
        error: "totp_invalid",
        message: "Código TOTP inválido o expirado. Generá uno nuevo en tu app.",
      },
      { status: 401 },
    );
  }

  return null;
}
