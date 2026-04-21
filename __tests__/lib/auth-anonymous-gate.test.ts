/**
 * anonymousGate() — helper que devuelve 204 si no hay cookie customer,
 * o null si sí hay (para que el caller siga con requireCustomer).
 *
 * Contrato bajo test:
 *   - Sin cookie buleje-customer-sess → NextResponse(null, { status: 204 })
 *   - Con cookie buleje-customer-sess (valor no vacío) → null
 *   - Cookie presente pero valor vacío → 204 (tratado como ausente)
 */

import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { anonymousGate } from "@/lib/auth/anonymous-gate";
import { CUSTOMER_SESSION } from "@/lib/auth/customer-session";

function makeReq(cookies: Record<string, string>): NextRequest {
  const url = new URL("http://localhost:3000/api/test");
  const headers = new Headers();
  const cookieHeader = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  if (cookieHeader) headers.set("cookie", cookieHeader);
  return new NextRequest(url, { headers });
}

describe("anonymousGate", () => {
  it("returns 204 response when no customer cookie is present", () => {
    const res = anonymousGate(makeReq({}));
    expect(res).not.toBeNull();
    expect(res?.status).toBe(204);
  });

  it("returns null when the customer cookie is present with a value", () => {
    const res = anonymousGate(
      makeReq({ [CUSTOMER_SESSION.COOKIE_NAME]: "signed-token-abc.xyz" }),
    );
    expect(res).toBeNull();
  });

  it("treats empty cookie value as anonymous (204)", () => {
    const res = anonymousGate(
      makeReq({ [CUSTOMER_SESSION.COOKIE_NAME]: "" }),
    );
    expect(res).not.toBeNull();
    expect(res?.status).toBe(204);
  });

  it("ignores other cookies (only checks the session cookie name)", () => {
    const res = anonymousGate(
      makeReq({ "other-cookie": "something", "active-tenant": "main" }),
    );
    expect(res).not.toBeNull();
    expect(res?.status).toBe(204);
  });
});
