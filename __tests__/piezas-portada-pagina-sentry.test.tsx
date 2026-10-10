/**
 * ADR-457 · `pagina-por-bloques` dentro del `<Enchufe>` REAL: qué va a Sentry.
 *
 * Una página despublicada o inexistente es un caso esperado (el dueño la sacó):
 * la portada vuelve a la normal y NO debería avisar a Sentry en cada visita.
 * Sentry queda para las fallas de verdad (una excepción al leer, un timeout).
 *
 * La pieza marca esos errores con `esperado = true` y el enchufe
 * (`lib/extensiones/Enchufe.tsx`, `esErrorEsperado`) los deja pasar al
 * fallback sin Sentry (01-10).
 */
import type { ReactElement, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/nextjs";

const H = vi.hoisted(() => ({ publicadaPorSlug: vi.fn() }));
vi.mock("@/lib/db/cms-pages.db", () => ({
  CmsPagesDB: { publicadaPorSlug: (...a: unknown[]) => H.publicadaPorSlug(...a) },
}));
vi.mock("@/components/cms/RenderBloques", () => ({ default: () => null }));
vi.mock("@/lib/extensiones/resolver", async () => {
  const { manifiesto } = await import("@/extensiones/pagina-por-bloques/manifest");
  const { portada } = await import("@/extensiones/pagina-por-bloques/servidor");
  return {
    resolverPiezas: async () => [
      {
        piezaId: manifiesto.id,
        enchufe: "tienda.portada",
        opciones: { paginaSlug: "inicio" },
        version: manifiesto.version,
        orden: 0,
        entrada: { manifiesto, portada },
      },
    ],
  };
});

import { Enchufe } from "@/lib/extensiones/Enchufe";
import { PaginaNoPublicadaError } from "@/extensiones/pagina-por-bloques/servidor";

const NORMAL = <section>portada normal</section>;

async function cuerpoDelEnchufe(): Promise<ReactNode> {
  const el = (await Enchufe({
    nombre: "tienda.portada",
    modo: "reemplaza",
    tenantId: "t1",
    slug: "tienda-1",
    fallback: NORMAL,
  })) as ReactElement<{ children: [ReactNode, ReactNode[]] }>;
  return el.props.children[0];
}

beforeEach(() => vi.clearAllMocks());

describe("pagina-por-bloques en el enchufe real", () => {
  it("la página despublicada se marca como esperada (no es una falla)", () => {
    expect(new PaginaNoPublicadaError("inicio").esperado).toBe(true);
  });

  it("despublicada → portada normal", async () => {
    H.publicadaPorSlug.mockResolvedValue(null);
    expect(await cuerpoDelEnchufe()).toBe(NORMAL);
  });

  it("despublicada → 0 avisos a Sentry", async () => {
    H.publicadaPorSlug.mockResolvedValue(null);
    await cuerpoDelEnchufe();
    expect(Sentry.captureException).toHaveBeenCalledTimes(0);
  });

  it("excepción de verdad al leer la página → portada normal y 1 aviso a Sentry", async () => {
    H.publicadaPorSlug.mockRejectedValue(new Error("se cayó la base"));
    expect(await cuerpoDelEnchufe()).toBe(NORMAL);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });
});
