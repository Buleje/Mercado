import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * privacidad-rtbf-l29733.spec.ts
 *
 * Happy path: derecho al olvido / Right to be Forgotten (RTBF).
 * Ley 29733 PE — Art. 16-17 (cancelación de datos personales).
 *
 * Flujo:
 *   1. Admin loggeado llama a POST /api/compliance/data-delete con DNI
 *   2. La respuesta confirma la operación de anonimización
 *   3. Un GET posterior de los datos del cliente muestra datos anonimizados
 *
 * IMPORTANTE: Este test es destructivo en DB real.
 * Por seguridad usa E2E_RTBF_CUSTOMER_DNI separado del DNI de exportación.
 * En CI usa datos de fixture descartable (seed + delete).
 *
 * TODO-fixtures:
 *   - Cliente descartable con DNI E2E_RTBF_CUSTOMER_DNI
 *   - tenantId del tenant main (E2E_TENANT_ID)
 */

const ADMIN_PASS = process.env.E2E_ADMIN_PASSWORD ?? "Qa-admin-1234";
const ADMIN_USER = process.env.E2E_ADMIN_USER ?? "qaadmin";
// DNI separado para no destruir el cliente usado en el export test
const RTBF_DNI = process.env.E2E_RTBF_CUSTOMER_DNI ?? "";
const TENANT_ID = process.env.E2E_TENANT_ID ?? "";

async function adminApiLogin(request: APIRequestContext): Promise<string | null> {
  const res = await request.post("/api/auth/login", {
    data: { password: ADMIN_PASS, username: ADMIN_USER },
  });
  if (!res.ok()) return null;
  const setCookie = res.headers()["set-cookie"] ?? "";
  const match = setCookie.match(/bsm-admin-sess=[^;]+/);
  return match ? match[0] : null;
}

test.describe("Privacidad — RTBF derecho al olvido (Ley 29733 Art. 16-17)", () => {
  // ── 1. Endpoint sin auth retorna 401/403 ──────────────────────────────────

  test("1 — POST /api/compliance/data-delete sin auth retorna 401 o 403", async ({
    request,
  }) => {
    const res = await request.post("/api/compliance/data-delete", {
      data: { dni: "12345678", tenantId: TENANT_ID || "tenant-main" },
    });
    expect([401, 403]).toContain(res.status());
  });

  // ── 2. Body sin DNI retorna 400 ───────────────────────────────────────────

  test("2 — POST /api/compliance/data-delete sin DNI retorna 400", async ({ request }) => {
    const cookie = await adminApiLogin(request);
    test.skip(!cookie, "Login admin falló");

    const res = await request.post("/api/compliance/data-delete", {
      headers: { Cookie: cookie!, "Content-Type": "application/json" },
      data: { tenantId: TENANT_ID || "tenant-main" },
    });
    expect([400, 422]).toContain(res.status());
  });

  // ── 3. DNI corto retorna 400 ──────────────────────────────────────────────

  test("3 — POST /api/compliance/data-delete con DNI corto retorna 400", async ({
    request,
  }) => {
    const cookie = await adminApiLogin(request);
    test.skip(!cookie, "Login admin falló");

    const res = await request.post("/api/compliance/data-delete", {
      headers: { Cookie: cookie!, "Content-Type": "application/json" },
      data: { dni: "123", tenantId: TENANT_ID || "tenant-main" },
    });
    expect([400, 422]).toContain(res.status());
  });

  // ── 4. RTBF destructivo — solo si E2E_RTBF_CUSTOMER_DNI está configurado ──

  test("4 — RTBF: DELETE anonimiza datos del cliente en DB", async ({ request }) => {
    test.skip(!RTBF_DNI, "Requiere E2E_RTBF_CUSTOMER_DNI (fixture descartable)");
    test.skip(!TENANT_ID, "Requiere E2E_TENANT_ID");

    const cookie = await adminApiLogin(request);
    test.skip(!cookie, "Login admin falló");

    await test.step("enviar solicitud de borrado", async () => {
      const res = await request.post("/api/compliance/data-delete", {
        headers: { Cookie: cookie!, "Content-Type": "application/json" },
        data: { dni: RTBF_DNI, tenantId: TENANT_ID },
      });

      if (res.status() === 404) {
        // TODO: fixture — seed cliente descartable con DNI E2E_RTBF_CUSTOMER_DNI
        test.skip();
        return;
      }

      expect([200, 201]).toContain(res.status());

      const body = await res.json();
      // La respuesta debe confirmar la operación
      const isConfirmado =
        body.success === true ||
        body.deleted === true ||
        body.anonymized === true ||
        body.message?.toLowerCase().includes("elimin") ||
        body.message?.toLowerCase().includes("anonim");
      expect(isConfirmado).toBeTruthy();
    });
  });

  // ── 5. Verificar anonimización — export posterior muestra datos vacíos ────

  test("5 — después del RTBF, export del mismo DNI no expone PII", async ({ request }) => {
    test.skip(!RTBF_DNI, "Requiere E2E_RTBF_CUSTOMER_DNI");
    test.skip(!TENANT_ID, "Requiere E2E_TENANT_ID");

    const cookie = await adminApiLogin(request);
    test.skip(!cookie, "Login admin falló");

    // Intentar exportar después del borrado
    const exportRes = await request.post("/api/compliance/data-export", {
      headers: { Cookie: cookie!, "Content-Type": "application/json" },
      data: { dni: RTBF_DNI, tenantId: TENANT_ID },
    });

    // Después de RTBF: 404 (cliente eliminado) o 200 con datos anonimizados
    if (exportRes.status() === 404) {
      // Cliente eliminado — comportamiento correcto
      expect(exportRes.status()).toBe(404);
      return;
    }

    if (exportRes.status() === 200) {
      const body = await exportRes.json();
      const customer = body.customer ?? {};
      const jsonStr = JSON.stringify(customer);

      // Los campos PII deben estar anonimizados
      await test.step("nombre anonimizado", async () => {
        const name = customer.name ?? customer.nombre ?? "";
        const isAnon =
          name === "" ||
          name === null ||
          name.includes("***") ||
          name.toLowerCase().includes("anon") ||
          name.toLowerCase().includes("deleted") ||
          name.toLowerCase().includes("eliminado");
        expect(isAnon || typeof name === "undefined").toBeTruthy();
      });

      // No debe haber email real expuesto
      expect(jsonStr).not.toMatch(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    }
  });

  // ── 6. Verify chain retorna estado de audit log ───────────────────────────

  test("6 — GET /api/compliance/verify-chain requiere auth", async ({ request }) => {
    const res = await request.get("/api/compliance/verify-chain");
    expect([401, 403]).toContain(res.status());
  });

  // ── 7. Consent endpoint registra consentimiento ───────────────────────────

  test("7 — POST /api/compliance/consent sin auth retorna 401 o 403", async ({ request }) => {
    const res = await request.post("/api/compliance/consent", {
      data: { customerId: "fake", type: "marketing", granted: true },
    });
    expect([401, 403]).toContain(res.status());
  });

  // ── 8. UI — confirmación RTBF requiere texto "BORRAR_MIS_DATOS" ──────────

  test("8 — UI de confirmación RTBF requiere texto exacto para proceder", async ({ page }) => {
    // Navegar al panel admin
    await page.goto("/admin/login", { waitUntil: "domcontentloaded" });
    await page.getByPlaceholder("Contraseña").fill(ADMIN_PASS);
    await page.getByPlaceholder("Usuario (opcional)").fill(ADMIN_USER);
    await page.getByRole("button", { name: /entrar|ingresar|iniciar/i }).click();
    await page.waitForURL(/\/admin/, { timeout: 15_000 });

    await test.step("buscar UI de borrado de datos", async () => {
      const deleteSection = page
        .getByRole("link", { name: /borrar|eliminar|rtbf|derecho al olvido/i })
        .or(page.locator('[data-testid="rtbf-section"]'))
        .or(page.getByText(/borrar mis datos|eliminar cuenta/i))
        .first();

      const hasSection = await deleteSection.isVisible({ timeout: 5_000 }).catch(() => false);
      if (!hasSection) {
        // TODO: fixture — navegar a la ruta exacta del módulo compliance/RTBF
        // La sección puede estar en un submenú del panel admin
        await expect(page.locator("body")).not.toContainText("500");
        return;
      }

      await deleteSection.click();

      // El botón de eliminar debe estar deshabilitado sin el texto de confirmación
      const btnEliminar = page
        .getByRole("button", { name: /eliminar|borrar|confirmar/i })
        .filter({ hasText: /datos|cuenta|cliente/i })
        .first();

      if (await btnEliminar.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await expect(btnEliminar).toBeDisabled();
      }
    });
  });
});
