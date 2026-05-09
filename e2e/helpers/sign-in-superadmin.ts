import type { BrowserContext } from "@playwright/test";

/**
 * e2e/helpers/sign-in-superadmin.ts — Sprint 4.3
 *
 * Llama a POST /api/superadmin/auth con las credenciales de entorno para
 * obtener la cookie HttpOnly "buleje-platform-sess" ANTES de navegar.
 *
 * REQUISITOS de entorno para que funcione:
 *   - SUPERADMIN_USERNAME + SUPERADMIN_PASSWORD en .env.test (o CI secrets)
 *   - BSM_QA_NO_LOCKOUT=1 para evitar el lockout de 5 intentos en suites
 *     que corren en paralelo o con reintentos.
 *
 * NO existe un endpoint test-session para superadmin (a diferencia del
 * customer) porque el superadmin usa timingSafeEqual + lockout + 2FA.
 * La ruta real es la más segura para E2E: credenciales reales sin OTP.
 *
 * Si devuelve 401 el helper falla con mensaje accionable.
 * Si devuelve 429 (lockout) el helper sugiere setear BSM_QA_NO_LOCKOUT=1.
 */

export interface SuperadminQA {
  username?: string;
  password?: string;
}

export async function signInSuperadmin(
  context: BrowserContext,
  creds: SuperadminQA = {},
  baseURL = "http://localhost:3000",
): Promise<void> {
  const username = creds.username ?? process.env.SUPERADMIN_USERNAME ?? "platform";
  const password = creds.password ?? process.env.SUPERADMIN_PASSWORD ?? "";

  if (!password) {
    throw new Error(
      "[E2E] SUPERADMIN_PASSWORD no está definido. " +
        "Setear en .env.test o pasar como argumento al helper.",
    );
  }

  const res = await context.request.post(`${baseURL}/api/superadmin/auth`, {
    data: { username, password },
  });

  if (res.status() === 429) {
    throw new Error(
      "[E2E] Superadmin en lockout (429). " +
        "Setear BSM_QA_NO_LOCKOUT=1 en el entorno de QA para bypassear " +
        "el lockout de 5 intentos (solo dev/QA, nunca producción).",
    );
  }

  if (res.status() === 200) {
    // Si 2FA está habilitado el servidor devuelve requires2FA:true sin cookie.
    // Los tests del repo NO cubren 2FA en E2E — skip con BLOCKER si ocurre.
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (body.requires2FA) {
      throw new Error(
        "[E2E] BLOCKER: el superadmin tiene 2FA habilitado. " +
          "Los tests E2E requieren 2FA deshabilitado en el entorno de QA. " +
          "Deshabilitar SUPERADMIN_TOTP_SECRET en .env.test.",
      );
    }
    // ok:true → cookie ya está en el context
    return;
  }

  if (!res.ok()) {
    const body = await res.text().catch(() => "(sin cuerpo)");
    throw new Error(
      `[E2E] signInSuperadmin falló con status ${res.status()}: ${body}`,
    );
  }
}
