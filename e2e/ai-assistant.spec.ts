import { test, expect, APIRequestContext } from "@playwright/test";

// ─────────────────────────────────────────────────────────────────────────────
// Helper: login via API and return the session cookie string.
// ─────────────────────────────────────────────────────────────────────────────
async function adminLogin(request: APIRequestContext): Promise<string | null> {
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!password) return null;

  const res = await request.post("/api/auth/login", {
    data: { password },
  });
  if (!res.ok()) return null;

  const setCookie = res.headers()["set-cookie"] ?? "";
  const match = setCookie.match(/bsm-admin-sess=[^;]+/);
  return match ? match[0] : null;
}

test.describe("AI Assistant", () => {
  test("floating button is visible on admin panel", async ({ page, request }) => {
    const cookie = await adminLogin(request);
    test.skip(!cookie, "E2E_ADMIN_PASSWORD not set");

    await page.context().addCookies([{
      name: "bsm-admin-sess",
      value: cookie!.split("=")[1],
      domain: "localhost",
      path: "/",
    }]);

    await page.goto("/admin");
    // The floating AI assistant button should be visible
    const trigger = page.getByTitle("Asistente Ejecutivo IA");
    await expect(trigger).toBeVisible({ timeout: 10000 });
  });

  test("opens chat panel when clicking floating button", async ({ page, request }) => {
    const cookie = await adminLogin(request);
    test.skip(!cookie, "E2E_ADMIN_PASSWORD not set");

    await page.context().addCookies([{
      name: "bsm-admin-sess",
      value: cookie!.split("=")[1],
      domain: "localhost",
      path: "/",
    }]);

    await page.goto("/admin");
    const trigger = page.getByTitle("Asistente Ejecutivo IA");
    await trigger.click();

    // Chat panel should appear with header
    await expect(page.getByText("Asistente Ejecutivo")).toBeVisible({ timeout: 5000 });
    // Greeting message should be present
    await expect(page.getByText("Soy tu Asistente Ejecutivo IA")).toBeVisible();
  });

  test("quick actions are visible in initial state", async ({ page, request }) => {
    const cookie = await adminLogin(request);
    test.skip(!cookie, "E2E_ADMIN_PASSWORD not set");

    await page.context().addCookies([{
      name: "bsm-admin-sess",
      value: cookie!.split("=")[1],
      domain: "localhost",
      path: "/",
    }]);

    await page.goto("/admin");
    await page.getByTitle("Asistente Ejecutivo IA").click();

    // Quick action buttons should be visible
    await expect(page.getByText("Acciones rápidas")).toBeVisible();
    await expect(page.getByText("¿Qué debo hacer ahora?")).toBeVisible();
  });

  test("header buttons for TTS, history, and stats are present", async ({ page, request }) => {
    const cookie = await adminLogin(request);
    test.skip(!cookie, "E2E_ADMIN_PASSWORD not set");

    await page.context().addCookies([{
      name: "bsm-admin-sess",
      value: cookie!.split("=")[1],
      domain: "localhost",
      path: "/",
    }]);

    await page.goto("/admin");
    await page.getByTitle("Asistente Ejecutivo IA").click();

    // TTS toggle, history, stats, clear, expand, close buttons
    await expect(page.getByTitle("Activar voz")).toBeVisible();
    await expect(page.getByTitle("Historial de sesiones")).toBeVisible();
    await expect(page.getByTitle("Estadísticas")).toBeVisible();
    await expect(page.getByTitle("Limpiar historial")).toBeVisible();
    await expect(page.getByTitle("Expandir")).toBeVisible();
    await expect(page.getByTitle("Cerrar")).toBeVisible();
  });

  test("stats panel shows usage statistics", async ({ page, request }) => {
    const cookie = await adminLogin(request);
    test.skip(!cookie, "E2E_ADMIN_PASSWORD not set");

    await page.context().addCookies([{
      name: "bsm-admin-sess",
      value: cookie!.split("=")[1],
      domain: "localhost",
      path: "/",
    }]);

    await page.goto("/admin");
    await page.getByTitle("Asistente Ejecutivo IA").click();

    // Open stats panel
    await page.getByTitle("Estadísticas").click();
    await expect(page.getByText("Estadísticas de Uso")).toBeVisible();
    await expect(page.getByText("Consultas totales")).toBeVisible();
  });

  test("history panel shows session history", async ({ page, request }) => {
    const cookie = await adminLogin(request);
    test.skip(!cookie, "E2E_ADMIN_PASSWORD not set");

    await page.context().addCookies([{
      name: "bsm-admin-sess",
      value: cookie!.split("=")[1],
      domain: "localhost",
      path: "/",
    }]);

    await page.goto("/admin");
    await page.getByTitle("Asistente Ejecutivo IA").click();

    // Open history panel
    await page.getByTitle("Historial de sesiones").click();
    await expect(page.getByText("Sesiones Anteriores")).toBeVisible();
  });

  test("can close the chat panel", async ({ page, request }) => {
    const cookie = await adminLogin(request);
    test.skip(!cookie, "E2E_ADMIN_PASSWORD not set");

    await page.context().addCookies([{
      name: "bsm-admin-sess",
      value: cookie!.split("=")[1],
      domain: "localhost",
      path: "/",
    }]);

    await page.goto("/admin");
    await page.getByTitle("Asistente Ejecutivo IA").click();
    await expect(page.getByText("Asistente Ejecutivo")).toBeVisible();

    // Close it
    await page.getByTitle("Cerrar").click();
    // The floating button should reappear
    await expect(page.getByTitle("Asistente Ejecutivo IA")).toBeVisible();
  });

  test("expand and minimize chat panel", async ({ page, request }) => {
    const cookie = await adminLogin(request);
    test.skip(!cookie, "E2E_ADMIN_PASSWORD not set");

    await page.context().addCookies([{
      name: "bsm-admin-sess",
      value: cookie!.split("=")[1],
      domain: "localhost",
      path: "/",
    }]);

    await page.goto("/admin");
    await page.getByTitle("Asistente Ejecutivo IA").click();

    // Expand
    await page.getByTitle("Expandir").click();
    await expect(page.getByTitle("Reducir")).toBeVisible();

    // Minimize
    await page.getByTitle("Reducir").click();
    await expect(page.getByTitle("Expandir")).toBeVisible();
  });

  test("input field accepts text and send button activates", async ({ page, request }) => {
    const cookie = await adminLogin(request);
    test.skip(!cookie, "E2E_ADMIN_PASSWORD not set");

    await page.context().addCookies([{
      name: "bsm-admin-sess",
      value: cookie!.split("=")[1],
      domain: "localhost",
      path: "/",
    }]);

    await page.goto("/admin");
    await page.getByTitle("Asistente Ejecutivo IA").click();

    const textarea = page.getByPlaceholder("Pregunta al asistente…");
    await expect(textarea).toBeVisible();

    await textarea.fill("¿Cuántos productos hay?");
    // The send button should no longer be disabled
    const sendBtn = page.locator("button").filter({ has: page.locator("svg.lucide-send") });
    await expect(sendBtn).toBeEnabled();
  });
});
