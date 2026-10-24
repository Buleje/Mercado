/**
 * ADR-458 · las piezas en la ficha de UN negocio y la página propia exclusiva en la tabla de todos.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({ fetchSuperadmin: vi.fn() }));
vi.mock("@/hooks/use-enabled-specs", () => ({ broadcastSpecsChanged: vi.fn() }));
vi.mock("@/lib/superadmin/fetch-auth", () => ({ fetchSuperadmin: (...a: unknown[]) => H.fetchSuperadmin(...a) }));
vi.mock("@/extensiones/registro.cliente", () => ({ PIEZAS_CLIENTE: {} }));

import { PiezasDelNegocio } from "@/components/superadmin/piezas/PiezasDelNegocio";
import { PiezasPorNegocio } from "@/components/superadmin/piezas/PiezasPorNegocio";
import { esDeOtroRubro, ofertaDelNegocio, pertenencia } from "@/components/superadmin/piezas/piezas-del-negocio";

const pieza = (id: string, enchufe: string, extra: Record<string, unknown> = {}) => ({
  id, nombre: `Pieza ${id}`, descripcion: "Hace algo.", version: "1.0.0", enchufes: [enchufe], rubros: [], requiere: [],
  opcionesSchema: { type: "object", properties: {} }, opcionesPorDefecto: {}, ...extra,
});
const fila = (tenantId: string, tenantNombre: string, piezaId: string, enchufe: string, extra: Record<string, unknown> = {}) => ({
  id: `${tenantId}-${piezaId}`, tenantId, tenantSlug: tenantId, tenantNombre, piezaId, enchufe, prendida: false, opciones: {},
  version: "1.0.0", orden: 0, huerfana: false, desactualizada: false, opcionesValidas: true, ...extra,
});
const t1 = { id: "t1", slug: "uno", name: "Negocio Uno", industry: "bodega", plan: "pro" };
const t2 = { id: "t2", slug: "dos", name: "Negocio Dos", industry: "madereria", plan: "pro" };

const responder = (catalogo: unknown[], matriz: unknown[], put?: unknown) =>
  H.fetchSuperadmin.mockImplementation(async (_u: string, init?: { method?: string }) =>
    init?.method === "PUT" && put
      ? put
      : { ok: true, status: 200, json: async () => ({ catalogo, matriz }) });

afterEach(() => H.fetchSuperadmin.mockReset());

describe("piezas-del-negocio (reglas)", () => {
  const pagina = pieza("pag", "tienda.pagina");
  it("una página propia es del negocio que ya la tiene; para los demás es «de otro»", () => {
    const m = [fila("t2", "Negocio Dos", "pag", "tienda.pagina")] as never[];
    expect(pertenencia(pagina as never, "tienda.pagina", "t2", m)).toEqual({ tipo: "propia" });
    expect(pertenencia(pagina as never, "tienda.pagina", "t1", m)).toEqual({ tipo: "de-otro", dueno: "Negocio Dos" });
    expect(pertenencia(pieza("x", "panel.pestana") as never, "panel.pestana", "t1", m)).toEqual({ tipo: "libre" });
  });
  it("la oferta de un negocio no incluye la página de otro y separa el otro rubro", () => {
    const cat = [pagina, pieza("a", "panel.pestana"), pieza("b", "panel.pestana", { rubros: ["madereria"] })] as never[];
    const m = [fila("t2", "Negocio Dos", "pag", "tienda.pagina")] as never[];
    const o = ofertaDelNegocio(cat, m, t1);
    expect(o.pagina).toBeNull();
    expect(o.paginasLibres).toEqual([]);
    expect(o.delRubro.map((x) => x.pieza.id)).toEqual(["a"]);
    expect(o.deOtroRubro.map((x) => x.pieza.id)).toEqual(["b"]);
    expect(esDeOtroRubro({ rubros: [] }, "bodega")).toBe(false);
  });
});

describe("PiezasDelNegocio (ficha)", () => {
  it("sin página propia dice que no tiene y no ofrece la de otro negocio", async () => {
    responder([pieza("pag", "tienda.pagina")], [fila("t2", "Negocio Dos", "pag", "tienda.pagina")]);
    render(<PiezasDelNegocio negocio={t1} />);
    expect(await screen.findByText("No tiene página propia.")).toBeInTheDocument();
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("con página propia muestra su estado y el interruptor manda el PUT", async () => {
    responder([pieza("pag", "tienda.pagina")], [fila("t1", "Negocio Uno", "pag", "tienda.pagina")]);
    render(<PiezasDelNegocio negocio={t1} />);
    const bloque = (await screen.findByText("Página propia", { selector: "p" })).closest("[data-bloque]") as HTMLElement;
    expect(within(bloque).getByText("Apagada")).toBeInTheDocument();
    await userEvent.click(within(bloque).getByRole("switch", { name: /Prender Pieza pag en Negocio Uno/ }));
    await waitFor(() => {
      const put = H.fetchSuperadmin.mock.calls.find((c) => c[1]?.method === "PUT");
      expect(JSON.parse(put![1].body)).toMatchObject({ tenantId: "t1", piezaId: "pag", enchufe: "tienda.pagina", prendida: true });
    });
  });

  it("con dos páginas libres lista las dos por nombre y prende la elegida tras confirmar", async () => {
    responder([pieza("a", "tienda.pagina"), pieza("b", "tienda.pagina")], []);
    render(<PiezasDelNegocio negocio={t1} />);
    await userEvent.click(await screen.findByRole("button", { name: /Prender «Pieza b»/ }));
    expect(screen.getByRole("button", { name: /Prender «Pieza a»/ })).toBeInTheDocument();
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Quedará amarrada a este negocio");
    expect(H.fetchSuperadmin.mock.calls.some((c) => c[1]?.method === "PUT")).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Sí, prender" }));
    await waitFor(() => {
      const put = H.fetchSuperadmin.mock.calls.find((c) => c[1]?.method === "PUT");
      expect(JSON.parse(put![1].body)).toMatchObject({ piezaId: "b", enchufe: "tienda.pagina", prendida: true });
    });
  });

  it("Liberar (sólo apagada) manda el DELETE y refresca", async () => {
    responder([pieza("pag", "tienda.pagina")], [fila("t1", "Negocio Uno", "pag", "tienda.pagina")], { ok: true, status: 200, json: async () => ({ ok: true }) });
    render(<PiezasDelNegocio negocio={t1} />);
    await userEvent.click(await screen.findByRole("button", { name: "Liberar" }));
    await userEvent.click(screen.getByRole("button", { name: "Sí, liberar" }));
    await waitFor(() => {
      const del = H.fetchSuperadmin.mock.calls.find((c) => c[1]?.method === "DELETE");
      expect(JSON.parse(del![1].body)).toEqual({ tenantId: "t1", piezaId: "pag", enchufe: "tienda.pagina" });
    });
    await waitFor(() => expect(H.fetchSuperadmin.mock.calls.filter((c) => !c[1]?.method).length).toBeGreaterThan(1));
  });

  it("con la página prendida no hay Liberar", async () => {
    responder([pieza("pag", "tienda.pagina")], [fila("t1", "Negocio Uno", "pag", "tienda.pagina", { prendida: true })]);
    render(<PiezasDelNegocio negocio={t1} />);
    await screen.findByText("Prendida");
    expect(screen.queryByRole("button", { name: "Liberar" })).toBeNull();
  });

  it("muestra en español el 409 de una página que ya es de otro negocio", async () => {
    responder([pieza("pag", "tienda.pagina")], [], {
      ok: false, status: 409,
      json: async () => ({ error: "pagina_de_otro_negocio", mensaje: "Esa página ya es de Negocio Dos." }),
    });
    render(<PiezasDelNegocio negocio={t1} />);
    await userEvent.click(await screen.findByRole("button", { name: /Prender «Pieza pag»/ }));
    await userEvent.click(screen.getByRole("button", { name: "Sí, prender" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Esa página ya es de Negocio Dos.");
  });

  it("las piezas de otro rubro salen aparte y siguen disponibles", async () => {
    responder([pieza("b", "panel.pestana", { rubros: ["madereria"] })], []);
    render(<PiezasDelNegocio negocio={t1} />);
    expect(await screen.findByText(/De otro rubro/)).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /Prender Pieza b/ })).toBeEnabled();
  });
});

describe("PiezasPorNegocio (todos) con página propia", () => {
  it("el interruptor sólo está en la fila de su dueño; en las demás dice «de <negocio>»", async () => {
    responder([pieza("pag", "tienda.pagina")], [fila("t2", "Negocio Dos", "pag", "tienda.pagina")]);
    render(<PiezasPorNegocio negocios={[t1, t2]} />);
    expect(await screen.findByRole("switch", { name: /Prender Pieza pag en Negocio Dos/ })).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: /Negocio Uno/ })).toBeNull();
    expect(screen.getByText("de Negocio Dos")).toBeInTheDocument();
  });
});
