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
 */

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
  const res = await context.request.post(
    `${baseURL}/api/auth/customer/test-session`,
    {
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
}
