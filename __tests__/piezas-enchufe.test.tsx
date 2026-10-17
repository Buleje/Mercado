/**
 * ADR-457 · `<Enchufe>` (servidor) y `<BordeDePieza>`: si una pieza falla,
 * tarda más de 2 s o tira al dibujarse, se ve la versión normal — nunca la
 * tarjeta roja de error, que en la tienda pública sería peor que nada.
 */
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/nextjs";

const H = vi.hoisted(() => ({ listarPrendidas: vi.fn() }));

vi.mock("@/lib/db/tenant-pieza.db", () => ({
  TenantPiezaDB: { listarPrendidas: (...a: unknown[]) => H.listarPrendidas(...a) },
}));
vi.mock("@/lib/db/tenants.db", () => ({ TenantsDB: { getBasicById: async () => null } }));
vi.mock("@/extensiones/registro.servidor", async () => {
  const { z } = await import("zod");
  const manifiesto = (id: string) => ({
    id,
    nombre: id,
    descripcion: id,
    version: "1.0.0",
    enchufes: ["tienda.portada"] as const,
    opciones: z.object({ titulo: z.string().default("Hola") }).strict(),
  });
  const Vista = ({ opciones, datos }: { opciones: { titulo: string }; datos: unknown }) => (
    <p>{`${opciones.titulo}:${String(datos)}`}</p>
  );
  return {
    PIEZAS_SERVIDOR: [
      { manifiesto: manifiesto("portada-buena"), portada: { modo: "reemplaza", cargar: async () => 7, Vista } },
      { manifiesto: manifiesto("portada-tira"), portada: { modo: "reemplaza", cargar: async () => { throw new Error("boom"); }, Vista } },
      { manifiesto: manifiesto("portada-lenta"), portada: { modo: "reemplaza", cargar: () => new Promise(() => {}), Vista } },
      { manifiesto: manifiesto("bloque-extra"), portada: { modo: "agrega", Vista } },
    ],
  };
});

import { Enchufe } from "@/lib/extensiones/Enchufe";
import { BordeDePieza } from "@/lib/extensiones/BordeDePieza";

const fila = (piezaId: string, orden = 0, opciones: Record<string, unknown> = {}) => ({
  id: piezaId,
  tenantId: "t1",
  piezaId,
  enchufe: "tienda.portada",
  prendida: true,
  opciones,
  version: "1.0.0",
  orden,
  actualizadoPor: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

const NORMAL = <section>portada normal</section>;
const props = { nombre: "tienda.portada" as const, tenantId: "t1", slug: "tienda-1", fallback: NORMAL };

/** Los hijos del fragmento que devuelve `<Enchufe>`: [cuerpo, extras[]]. */
function partes(el: ReactNode): { cuerpo: ReactNode; extras: ReactNode[] } {
  const hijos = (el as ReactElement<{ children: [ReactNode, ReactNode[]] }>).props.children;
  return { cuerpo: hijos[0], extras: (hijos[1] ?? []).filter(Boolean) };
}
const vistaDe = (borde: ReactNode) =>
  (borde as ReactElement<{ children: ReactElement<{ opciones: unknown; datos: unknown; ctx: unknown }> }>).props.children.props;

beforeEach(() => {
  vi.clearAllMocks();
  H.listarPrendidas.mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

describe("<Enchufe nombre=tienda.portada>", () => {
  it("sin piezas → la versión normal", async () => {
    const { cuerpo, extras } = partes(await Enchufe(props));
    expect(cuerpo).toBe(NORMAL);
    expect(extras).toEqual([]);
    expect(H.listarPrendidas).toHaveBeenCalledWith("t1", "tienda.portada");
  });

  it("una pieza que reemplaza: su vista dentro del borde, con ctx, opciones validadas y datos de cargar()", async () => {
    H.listarPrendidas.mockResolvedValue([fila("portada-buena", 0, { titulo: "Madera" })]);
    const { cuerpo } = partes(await Enchufe(props));
    expect(isValidElement(cuerpo) && cuerpo.type).toBe(BordeDePieza);
    expect((cuerpo as ReactElement<{ fallback: ReactNode }>).props.fallback).toBe(NORMAL);
    expect(vistaDe(cuerpo)).toMatchObject({
      ctx: { tenantId: "t1", slug: "tienda-1", enchufe: "tienda.portada" },
      opciones: { titulo: "Madera" },
      datos: 7,
    });
  });

  it("cargar() que tira → la normal, y la siguiente pieza «reemplaza» en orden toma el lugar", async () => {
    H.listarPrendidas.mockResolvedValue([fila("portada-tira", 0), fila("portada-buena", 1)]);
    const { cuerpo } = partes(await Enchufe(props));
    expect(vistaDe(cuerpo).datos).toBe(7);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it("cargar() que tarda más de 2 s → la versión normal", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    H.listarPrendidas.mockResolvedValue([fila("portada-lenta")]);
    const p = Enchufe(props);
    await vi.advanceTimersByTimeAsync(2001);
    expect(partes(await p).cuerpo).toBe(NORMAL);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it("opciones que no pasan el Zod de la pieza → no corre", async () => {
    H.listarPrendidas.mockResolvedValue([fila("portada-buena", 0, { tenantId: "otro" })]);
    expect(partes(await Enchufe(props)).cuerpo).toBe(NORMAL);
  });

  it("modo=agrega: sólo los bloques extra; modo=reemplaza: sólo el cuerpo", async () => {
    H.listarPrendidas.mockResolvedValue([fila("portada-buena"), fila("bloque-extra", 1)]);
    const agrega = partes(await Enchufe({ ...props, modo: "agrega" }));
    expect(agrega.cuerpo).toBeNull();
    expect(agrega.extras).toHaveLength(1);
    const reemplaza = partes(await Enchufe({ ...props, modo: "reemplaza" }));
    expect(vistaDe(reemplaza.cuerpo).datos).toBe(7);
    expect(reemplaza.extras).toEqual([]);
  });

  it("la tabla caída → la versión normal (y se avisa)", async () => {
    H.listarPrendidas.mockRejectedValue(new Error("db caída"));
    expect(partes(await Enchufe(props)).cuerpo).toBe(NORMAL);
    expect(Sentry.captureException).toHaveBeenCalled();
  });
});

describe("<BordeDePieza>", () => {
  const Rompe = (): ReactNode => {
    throw new Error("la pieza tiró al dibujarse");
  };

  it("si la vista tira, se ve el fallback — no la tarjeta roja", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <BordeDePieza piezaId="x" fallback={<p>versión normal</p>}>
        <Rompe />
      </BordeDePieza>,
    );
    expect(screen.getByText("versión normal")).toBeTruthy();
    expect(screen.queryByText(/Error en/)).toBeNull();
  });

  it("con fallback null tampoco aparece la tarjeta roja (no se muestra nada)", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { container } = render(
      <BordeDePieza piezaId="x">
        <Rompe />
      </BordeDePieza>,
    );
    expect(container.textContent).toBe("");
  });
});
