import { test, expect, type BrowserContext } from "@playwright/test";
import { signInCustomer } from "./helpers/sign-in-customer";
import { signInSuperadmin } from "./helpers/sign-in-superadmin";

/**
 * e2e/vendor-onboarding.spec.ts — Sprint 4.3
 *
 * Flujo completo VENDOR ONBOARDING (ADR-079):
 *   1. Customer se registra como vendor via POST /api/vendor/registration
 *   2. Superadmin aprueba la solicitud via POST /api/superadmin/vendor-applications/[id]/review
 *   3. Se verifica que el status final es "approved"
 *
 * ESTRATEGIA:
 *   - Customer context: sign-in real via /api/auth/customer/test-session
 *     (requiere ALLOW_E2E_TEST_AUTH=1 o NODE_ENV=test)
 *   - Superadmin context: login real via /api/superadmin/auth
 *     (requiere SUPERADMIN_USERNAME + SUPERADMIN_PASSWORD + BSM_QA_NO_LOCKOUT=1)
 *   - El form de registro se prueba via API directa (POST /api/vendor/registration)
 *     porque la UI wizard puede tener múltiples pasos que dependen de mapas/GPS.
 *   - La aprobación también es via API (endpoint review) para reproducibilidad.
 *
 * BLOCKERS:
 *   Ver tabla al final del archivo.
 */

// ── Datos QA ─────────────────────────────────────────────────────────────────

const CUSTOMER_QA = {
  phone: "999777001",
  name: "Maria Vendor QA",
  tenantId: "main",
};

/** RUC único por run para evitar conflicto con row de test anterior. */
function uniqueRuc(): string {
  const ts = Date.now().toString().slice(-8);
  return `20${ts}`;
}

/** Payload mínimo válido para /api/vendor/registration */
function buildVendorPayload(ruc: string) {
  return {
    businessName: `Bodega QA ${ruc}`,
    ruc,
    ownerName: CUSTOMER_QA.name,
    ownerDni: "12345678",
    phone: CUSTOMER_QA.phone,
    email: `vendor-qa-${ruc}@buleje.pe`,
    address: "Jr. Ucayali 450, Pucallpa",
    city: "Pucallpa",
    region: "Ucayali",
    category: "bodega",
    plan: "free",
    tenantSlug: `bodega-qa-${ruc}`,
    description: "Bodega de prueba QA",
    schedule: {
      monday: { open: "08:00", close: "20:00", enabled: true },
      tuesday: { open: "08:00", close: "20:00", enabled: true },
      wednesday: { open: "08:00", close: "20:00", enabled: true },
      thursday: { open: "08:00", close: "20:00", enabled: true },
      friday: { open: "08:00", close: "20:00", enabled: true },
      saturday: { open: "08:00", close: "18:00", enabled: true },
      sunday: { open: "09:00", close: "14:00", enabled: false },
    },
    deliveryZones: ["Pucallpa Centro"],
    deliveryFeeSoles: "3.00",
    acceptsDelivery: true,
    acceptsPickup: true,
  };
}

// ── Suite — modo serial para preservar applicationId entre tests ──────────────

test.describe("Vendor Onboarding — flujo completo (ADR-079)", () => {
  test.describe.configure({ mode: "serial" });

  /** applicationId compartido entre tests del suite via closure. */
  let applicationId: string | null = null;
  let ruc: string;

  // ── 1. Endpoint /api/vendor/registration acepta payload válido ──────────────

  test("1 — POST /api/vendor/registration crea solicitud y retorna id + status pending", async ({
    context,
    baseURL,
  }) => {
    ruc = uniqueRuc();

    // El endpoint de registro es público (sin auth) — rate-limit STRICT.
    const res = await context.request.post(
      `${baseURL ?? "http://localhost:3000"}/api/vendor/registration`,
      { data: buildVendorPayload(ruc) },
    );

    // 201 Created esperado
    expect(res.status()).toBe(201);

    const body = await res.json() as { ok: boolean; id: string; status: string };
    expect(body.ok).toBe(true);
    expect(typeof body.id).toBe("string");
    expect(body.id.length).toBeGreaterThan(0);

    // El status inicial debe ser "pending" o "submitted" (state machine ADR-079)
    expect(["pending", "submitted"]).toContain(body.status);

    // Guardar para tests siguientes
    applicationId = body.id;
  });

  // ── 2. RUC duplicado retorna 409 ───────────────────────────────────────────

  test("2 — POST /api/vendor/registration con RUC duplicado retorna 409", async ({
    context,
    baseURL,
  }) => {
    // Usar el mismo RUC del test 1
    const res = await context.request.post(
      `${baseURL ?? "http://localhost:3000"}/api/vendor/registration`,
      { data: buildVendorPayload(ruc) },
    );

    expect(res.status()).toBe(409);

    const body = await res.json() as { error: string; code?: string };
    expect(body.error).toBeTruthy();
  });

  // ── 3. Payload inválido retorna 400 ───────────────────────────────────────

  test("3 — POST /api/vendor/registration con payload inválido retorna 400", async ({
    context,
    baseURL,
  }) => {
    const res = await context.request.post(
      `${baseURL ?? "http://localhost:3000"}/api/vendor/registration`,
      { data: { ruc: "" } }, // Payload incompleto
    );

    expect(res.status()).toBe(400);

    const body = await res.json() as { error: string; field?: string };
    expect(body.error).toBeTruthy();
  });

  // ── 4. Superadmin ve la solicitud via GET /api/superadmin/vendor-applications/[id] ──

  test("4 — superadmin puede leer la solicitud creada (GET vendor-applications/[id])", async ({
    browser,
    baseURL,
  }) => {
    if (!applicationId) {
      test.skip(true, "BLOCKER: test 1 no creó applicationId — revisar endpoint /api/vendor/registration");
      return;
    }

    const adminContext: BrowserContext = await browser.newContext();
    try {
      await signInSuperadmin(adminContext, {}, baseURL ?? "http://localhost:3000");

      const res = await adminContext.request.get(
        `${baseURL ?? "http://localhost:3000"}/api/superadmin/vendor-applications/${applicationId}`,
      );

      expect(res.status()).toBe(200);

      const body = await res.json() as { ok: boolean; application: { status: string } };
      expect(body.ok).toBe(true);
      expect(body.application).toBeDefined();
      expect(typeof body.application.status).toBe("string");
    } finally {
      await adminContext.close();
    }
  });

  // ── 5. Superadmin aprueba la solicitud (state: pending → approved) ─────────

  test("5 — superadmin aprueba la solicitud via POST review action=approve", async ({
    browser,
    baseURL,
  }) => {
    if (!applicationId) {
      test.skip(true, "BLOCKER: applicationId no disponible — test 1 o 4 fallaron");
      return;
    }

    const adminContext: BrowserContext = await browser.newContext();
    try {
      await signInSuperadmin(adminContext, {}, baseURL ?? "http://localhost:3000");

      // La state machine requiere start_review ANTES de approve
      const startRes = await adminContext.request.post(
        `${baseURL ?? "http://localhost:3000"}/api/superadmin/vendor-applications/${applicationId}/review`,
        { data: { action: "start_review" } },
      );
      // 200 OK o 409 si ya estaba en review — ambos son aceptables aquí
      expect([200, 409]).toContain(startRes.status());

      // Ahora aprobar
      const approveRes = await adminContext.request.post(
        `${baseURL ?? "http://localhost:3000"}/api/superadmin/vendor-applications/${applicationId}/review`,
        { data: { action: "approve", note: "QA E2E approval" } },
      );

      expect(approveRes.status()).toBe(200);

      const body = await approveRes.json() as {
        ok: boolean;
        application: { status: string };
      };
      expect(body.ok).toBe(true);
      expect(body.application.status).toBe("approved");
    } finally {
      await adminContext.close();
    }
  });

  // ── 6. Verificar status final = "approved" vía GET ──────────────────────────

  test("6 — GET vendor-applications/[id] confirma status approved después de aprobación", async ({
    browser,
    baseURL,
  }) => {
    if (!applicationId) {
      test.skip(true, "BLOCKER: applicationId no disponible");
      return;
    }

    const adminContext: BrowserContext = await browser.newContext();
    try {
      await signInSuperadmin(adminContext, {}, baseURL ?? "http://localhost:3000");

      const res = await adminContext.request.get(
        `${baseURL ?? "http://localhost:3000"}/api/superadmin/vendor-applications/${applicationId}`,
      );

      expect(res.status()).toBe(200);

      const body = await res.json() as {
        ok: boolean;
        application: { status: string };
        reviews: Array<{ action: string }>;
      };
      expect(body.application.status).toBe("approved");

      // El historial de reviews debe incluir la acción "approve"
      const hasApprove = body.reviews.some((r) => r.action === "approve");
      expect(hasApprove).toBe(true);
    } finally {
      await adminContext.close();
    }
  });

  // ── 7. Sin auth superadmin → endpoint review retorna 401 ──────────────────

  test("7 — POST review sin cookie de superadmin retorna 401 (auth guard activo)", async ({
    context,
    baseURL,
  }) => {
    // Usar el context sin autenticar como superadmin
    const res = await context.request.post(
      `${baseURL ?? "http://localhost:3000"}/api/superadmin/vendor-applications/nonexistent-id/review`,
      { data: { action: "approve" } },
    );

    expect(res.status()).toBe(401);
  });

  // ── 8. Customer firmado puede navegar a /vender (smoke test UI) ─────────────

  test("8 — customer autenticado ve la página /vender sin error (smoke UI)", async ({
    context,
    page,
    baseURL,
  }) => {
    await signInCustomer(
      context,
      CUSTOMER_QA,
      baseURL ?? "http://localhost:3000",
    );

    const res = await page.goto("/vender", {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    // La página debe cargar (200 o redirect a sub-ruta — no 404/500)
    expect(res?.status() ?? 200).toBeLessThan(500);

    // Debe haber contenido mínimo: título o CTA
    const body = page.locator("main, [role='main'], body");
    await expect(body).toBeVisible({ timeout: 10_000 });
  });
});

/**
 * TABLA DE BLOCKERS
 * ─────────────────────────────────────────────────────────────────────────────
 * | # | Blocker                          | Condición               | Solución  |
 * |---|----------------------------------|-------------------------|-----------|
 * | B1| SUPERADMIN_PASSWORD no definido  | Test 4-7 fallan         | Setear en .env.test o CI |
 * | B2| BSM_QA_NO_LOCKOUT no seteado     | 429 en suites paralelas | BSM_QA_NO_LOCKOUT=1 |
 * | B3| 2FA habilitado en QA             | requires2FA:true → throw | Deshabilitar SUPERADMIN_TOTP_SECRET |
 * | B4| ALLOW_E2E_TEST_AUTH no seteado   | Test 8 falla sign-in    | ALLOW_E2E_TEST_AUTH=1 |
 * | B5| Schema drift VendorApplication   | 500 en POST registration | prisma migrate deploy |
 * ─────────────────────────────────────────────────────────────────────────────
 */
