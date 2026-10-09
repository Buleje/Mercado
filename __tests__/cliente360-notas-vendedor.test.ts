/**
 * «Notas del vendedor» de la ficha 360 (revisión del 09-10).
 *
 *  1. El GET de /api/customers/[phone] no traía `privateNotes`: la nota salía
 *     vacía y al guardar pisaba la anterior.
 *  2. Lo editable se llenaba en un efecto de `customer`: marcar un aviso o
 *     guardar el tope (ambos hacen setCustomer) borraba la nota a medio
 *     escribir y devolvía las etiquetas recién puestas.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { NextRequest } from "next/server";

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/cache", () => ({ invalidate: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/audit/audit-context", () => ({
  runWithAuditContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));
vi.mock("@/lib/require-admin", () => ({
  requireAdmin: vi.fn(async () => ({ tenantId: "t-qa", userId: "u1", role: "admin" })),
}));
vi.mock("@/lib/jsondb", () => ({
  CustomersDB: {
    getByPhone: vi.fn(async () => ({ name: "Cliente QA", phone: "982519788", location: "", reference: "" })),
  },
  normalizePhone: (p: string) => p,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: { findFirst: vi.fn(async () => null) },
    customer: {
      findFirst: vi.fn(async () => ({ privateNotes: "Paga por Yape los viernes", observaciones: null, creditLimit: 0 })),
    },
  },
}));

import { GET } from "@/app/api/customers/[phone]/route";
import { useCliente360 } from "@/components/admin/cliente360/use-cliente-360";

const PHONE = "982519788";

function fetchFalso() {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "PATCH") return new Response("{}", { status: 200 });
    if (url.endsWith("/orders") || url.endsWith("/timeline")) return Response.json([]);
    return Response.json({
      name: "Cliente QA",
      phone: PHONE,
      creditLimit: 50,
      tags: JSON.stringify(["vip"]),
      observaciones: "Vive frente al mercado",
      privateNotes: "Yape",
    });
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("GET /api/customers/[phone]", () => {
  it("trae las notas del vendedor", async () => {
    const res = await GET(new NextRequest(`http://localhost/api/customers/${PHONE}`), {
      params: Promise.resolve({ phone: PHONE }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("privateNotes", "Paga por Yape los viernes");
  });
});

describe("useCliente360 — lo editable no se pisa", () => {
  it("llena nota, observaciones y etiquetas con lo del servidor", async () => {
    vi.stubGlobal("fetch", fetchFalso());
    const { result } = renderHook(() => useCliente360(PHONE));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.notes).toBe("Yape");
    expect(result.current.observaciones).toBe("Vive frente al mercado");
    expect(result.current.obsExpanded).toBe(true);
    expect(result.current.tags).toEqual(["vip"]);
    expect(result.current.creditLimitInput).toBe("50");
  });

  it("marcar un aviso (setCustomer) no borra la nota a medio escribir ni la etiqueta nueva", async () => {
    vi.stubGlobal("fetch", fetchFalso());
    const { result } = renderHook(() => useCliente360(PHONE));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.handleAddTag("mayorista"); });
    act(() => result.current.setNotes("x"));
    act(() => result.current.setCustomer(prev => (prev ? { ...prev, alertasWhatsapp: false } : prev)));

    expect(result.current.notes).toBe("x");
    expect(result.current.tags).toEqual(["vip", "mayorista"]);
    expect(result.current.customer?.tags).toBe(JSON.stringify(["vip", "mayorista"]));
  });

  it("guardar la nota la deja en el cliente, sin volver a la vieja", async () => {
    vi.stubGlobal("fetch", fetchFalso());
    const { result } = renderHook(() => useCliente360(PHONE));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setNotes("Fía hasta S/ 50"));
    await act(async () => { await result.current.handleSaveNotes(); });

    expect(result.current.customer?.privateNotes).toBe("Fía hasta S/ 50");
    expect(result.current.notes).toBe("Fía hasta S/ 50");
  });
});
