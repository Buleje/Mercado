/**
 * ADR-457 · pieza `pagina-por-bloques`: reemplaza el cuerpo de la portada por
 * la página PUBLICADA del mismo negocio. El negocio sale del contexto (host o
 * sesión), nunca de las opciones; si la página no está, la pieza no corre y se
 * ve la portada normal.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({ publicadaPorSlug: vi.fn() }));
vi.mock("@/lib/db/cms-pages.db", () => ({
  CmsPagesDB: { publicadaPorSlug: (...a: unknown[]) => H.publicadaPorSlug(...a) },
}));
vi.mock("@/components/cms/RenderBloques", () => ({
  default: ({ bloques }: { bloques: { type: string }[] }) => (
    <p>{bloques.map((b) => b.type).join(",")}</p>
  ),
}));

import { opcionesPaginaPorBloques } from "@/extensiones/pagina-por-bloques/manifest";
import {
  PaginaNoPublicadaError,
  PaginaSinBloquesError,
  portada,
} from "@/extensiones/pagina-por-bloques/servidor";

const ctx = {
  tenantId: "negocio-de-la-visita",
  slug: "mi-tienda",
  enchufe: "tienda.portada" as const,
};
const bloque = (type: string, visible = true) => ({
  id: type,
  type,
  order: 0,
  visible,
  props: {},
  styles: null,
});
const pagina = (blocks: ReturnType<typeof bloque>[]) => ({
  id: "p1",
  slug: "inicio",
  title: "Inicio",
  description: null,
  metaTitle: null,
  metaDescription: null,
  ogImage: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  blocks,
});

beforeEach(() => vi.clearAllMocks());

describe("opciones", () => {
  it("prenderla sin llenar nada busca la página «inicio»", () => {
    expect(opcionesPaginaPorBloques.parse({})).toEqual({ paginaSlug: "inicio" });
  });

  it("el enlace tiene el formato del CMS y no deja colar un negocio", () => {
    expect(opcionesPaginaPorBloques.safeParse({ paginaSlug: "../admin" }).success).toBe(false);
    expect(opcionesPaginaPorBloques.safeParse({ paginaSlug: "Inicio" }).success).toBe(false);
    expect(
      opcionesPaginaPorBloques.safeParse({ paginaSlug: "inicio", tenantId: "otro" }).success,
    ).toBe(false);
  });
});

describe("cargar()", () => {
  it("lee del negocio del CONTEXTO con el enlace de las opciones", async () => {
    H.publicadaPorSlug.mockResolvedValue(pagina([bloque("hero"), bloque("cta")]));
    const datos = await portada.cargar!(ctx, { paginaSlug: "campana" });
    expect(H.publicadaPorSlug).toHaveBeenCalledWith("negocio-de-la-visita", "campana");
    expect(datos.blocks.map((b) => b.type)).toEqual(["hero", "cta"]);
  });

  it("sin página publicada → tira (el enchufe muestra la portada normal)", async () => {
    H.publicadaPorSlug.mockResolvedValue(null);
    await expect(portada.cargar!(ctx, { paginaSlug: "inicio" })).rejects.toBeInstanceOf(
      PaginaNoPublicadaError,
    );
  });

  it("el bloque de productos de demostración no entra; si no queda nada, tira", async () => {
    H.publicadaPorSlug.mockResolvedValue(pagina([bloque("products"), bloque("about")]));
    expect(
      (await portada.cargar!(ctx, { paginaSlug: "inicio" })).blocks.map((b) => b.type),
    ).toEqual(["about"]);
    H.publicadaPorSlug.mockResolvedValue(pagina([bloque("products"), bloque("hero", false)]));
    await expect(portada.cargar!(ctx, { paginaSlug: "inicio" })).rejects.toBeInstanceOf(
      PaginaSinBloquesError,
    );
  });
});

describe("Vista", () => {
  it("dibuja los bloques de la página dentro de su marca", () => {
    const Vista = portada.Vista as (p: Parameters<typeof portada.Vista>[0]) => React.ReactElement;
    const { container } = render(
      <Vista
        ctx={ctx}
        opciones={{ paginaSlug: "inicio" }}
        datos={pagina([bloque("hero"), bloque("faq")])}
      />,
    );
    expect(screen.getByText("hero,faq")).toBeTruthy();
    expect(
      container.querySelector('[data-pieza="pagina-por-bloques"][data-pagina="inicio"]'),
    ).toBeTruthy();
  });

  it("sin datos tira (y el borde vuelve a la portada normal)", () => {
    expect(() =>
      portada.Vista({ ctx, opciones: { paginaSlug: "inicio" }, datos: undefined }),
    ).toThrow();
  });
});
