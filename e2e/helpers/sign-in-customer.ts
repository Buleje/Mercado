import type { BrowserContext } from "@playwright/test";

/**
 * e2e/helpers/sign-in-customer.ts
 *
 * Llama a POST /api/auth/customer/test-session para obtener la cookie
 * HttpOnly real "buleje-customer-sess" ANTES de navegar. Elimina la race
 * condition que existía cuando se mockeaba GET /api/auth/customer/me:
 * el CustomerContext montaba antes de que page.route() interceptara.
 *
 * GATE: el endpoint solo responde si NODE_ENV=test o ALLOW_E2E_TEST_AUTH=1.
 * Si devuelve 404, falla con mensaje accionable.
 *
 * SUBDOMINIOS *.localhost: Node (apiRequestContext) NO resuelve `*.localhost`
 * (sí lo hace Chromium). Para tenants vendor servidos por subdominio
 * (ej. mi-pollo.localhost:3100) hacemos el POST contra 127.0.0.1 con el header
 * Host correcto, y luego inyectamos la cookie en el contexto para el host real
 * del browser (si no, quedaría en el dominio 127.0.0.1 y no viajaría).
 */

const CUSTOMER_COOKIE = "buleje-customer-sess";

export interface CustomerQA {
  phone: string;
  name: string;
  tenantId?: string;
  customerId?: string;
}

export async function signInCustomer(
  context: BrowserContext,
  customer: CustomerQA,
  baseURL = "http://localhost:3000",
): Promise<void> {
  const url = new URL(baseURL);
  const isStarLocalhost = url.hostname.endsWith(".localhost");
  // Node no resuelve *.localhost → pegamos a 127.0.0.1 con Host header.
  const requestBase = isStarLocalhost
    ? `${url.protocol}//127.0.0.1:${url.port || "80"}`
    : baseURL;
  const headers = isStarLocalhost ? { host: url.host } : undefined;

  const res = await context.request.post(
    `${requestBase}/api/auth/customer/test-session`,
    {
      headers,
      data: {
        phone: customer.phone,
        name: customer.name,
        tenantId: customer.tenantId ?? "main",
        ...(customer.customerId ? { customerId: customer.customerId } : {}),
      },
    },
  );

  if (res.status() === 404) {
    throw new Error(
      "[E2E] POST /api/auth/customer/test-session devolvió 404. " +
        "Setear ALLOW_E2E_TEST_AUTH=1 en el entorno Playwright " +
        "(archivo .env.test o variable CI). " +
        "El endpoint solo está disponible con NODE_ENV=test o esa flag.",
    );
  }

  if (!res.ok()) {
    const body = await res.text().catch(() => "(sin cuerpo)");
    throw new Error(
      `[E2E] test-session falló con status ${res.status()}: ${body}`,
    );
  }

  // En subdominio *.localhost la cookie quedó asociada a 127.0.0.1 (el host del
  // request). La re-inyectamos para el host real del browser para que viaje en
  // las navegaciones (page.goto a mi-pollo.localhost).
  if (isStarLocalhost) {
    const setCookie = res.headers()["set-cookie"] ?? "";
    const match = setCookie.match(new RegExp(`${CUSTOMER_COOKIE}=([^;]+)`));
    if (match) {
      await context.addCookies([
        {
          name: CUSTOMER_COOKIE,
          value: match[1],
          domain: url.hostname,
          path: "/",
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
    }
  }
}
