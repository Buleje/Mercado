/**
 * __tests__/helpers/mocks.ts — mocks compartidos para tests.
 *
 * Centraliza los 3 patrones de mock que recurrentemente rompían la suite
 * (deuda TD: cada test los redefinía y se desincronizaban con la fuente):
 *
 *   1. mockDecimal(n)   — objeto tipo Prisma Decimal (la fuente llama
 *                         `.toNumber()`; mockearlo como number plano tira
 *                         "toNumber is not a function").
 *   2. csrfMock()       — todos los exports de `@/lib/csrf` mockeados a
 *                         "válido/pasa" (las rutas superadmin usan
 *                         validateSuperadminCsrf + csrfForbiddenResponse).
 *   3. nextCacheMock()  — exports de `next/cache` (revalidateTag, cacheLife,
 *                         cacheTag, …) que faltaban en mocks viejos.
 *
 * USO:
 *   import { mockDecimal, csrfMock, nextCacheMock } from "@/__tests__/helpers/mocks";
 *
 *   // En el cuerpo del test (datos):
 *   mockStoreFindFirst.mockResolvedValue({ commission: mockDecimal(5) });
 *
 *   // En factories de vi.mock (se llaman lazy, sobreviven el hoisting):
 *   vi.mock("@/lib/csrf", () => csrfMock());
 *   vi.mock("next/cache", () => nextCacheMock());
 *
 *   // Para overridear un caso (ej. CSRF inválido) en un test puntual:
 *   import { validateSuperadminCsrf } from "@/lib/csrf";
 *   vi.mocked(validateSuperadminCsrf).mockReturnValueOnce(false);
 */

import { vi } from "vitest";

/** Objeto tipo Prisma Decimal — soporta los métodos que usan las DB classes. */
export function mockDecimal(n: number) {
  return {
    toNumber: () => n,
    toString: () => String(n),
    toFixed: (digits = 2) => n.toFixed(digits),
    valueOf: () => n,
  };
}

/**
 * Mock completo de `@/lib/csrf` — todo "válido" por defecto. Usar dentro de
 * `vi.mock("@/lib/csrf", () => csrfMock())`. Para forzar un fallo en un test:
 * `vi.mocked(validateSuperadminCsrf).mockReturnValueOnce(false)`.
 */
export function csrfMock() {
  return {
    generateCsrfToken: vi.fn(() => "test-csrf-token"),
    ensureCsrfCookie: vi.fn(),
    validateCsrfToken: vi.fn(() => true),
    validateSuperadminCsrf: vi.fn(() => true),
    csrfForbiddenResponse: vi.fn(
      () => new Response(JSON.stringify({ error: "forbidden" }), { status: 403 }),
    ),
  };
}

/**
 * Mock de `next/cache` — no-ops para revalidación + cache directives.
 * `unstable_cache` devuelve la función tal cual (ejecuta sin cachear).
 */
export function nextCacheMock() {
  return {
    revalidateTag: vi.fn(),
    revalidatePath: vi.fn(),
    cacheLife: vi.fn(),
    cacheTag: vi.fn(),
    unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
  };
}
