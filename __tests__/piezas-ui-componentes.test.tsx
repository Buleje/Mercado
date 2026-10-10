/**
 * ADR-457 · la pestaña «A medida» y la tabla de piezas del superadmin.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const H = vi.hoisted(() => ({ piezas: [] as unknown[], fetchSuperadmin: vi.fn() }));

vi.mock("@/hooks/use-enabled-specs", () => ({
  usePiezas: () => ({ piezas: H.piezas, negocio: null, isLoading: false }),
  broadcastSpecsChanged: vi.fn(),
  SPEC_GATED_MODULE_IDS: new Set(["a-medida"]),
}));
vi.mock("@/lib/superadmin/fetch-auth", () => ({ fetchSuperadmin: (...a: unknown[]) => H.fetchSuperadmin(...a) }));
vi.mock("@/components/admin/shared/AdminModuleHeader", () => ({ default: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock("@/extensiones/registro.cliente", async () => {
  const opciones = z.object({ saludo: z.string().default("hola") }).strict();
  const entrada = (id: string, titulo: string) => ({
    manifiesto: { id, nombre: titulo, descripcion: "", version: "1.0.0", enchufes: ["panel.pestana"], opciones },
    pestana: { titulo, icono: "FileSpreadsheet", Vista: ({ opciones: o }: { opciones: { saludo: string } }) => <p>{`${id}:${o.saludo}`}</p> },
  });
  return { PIEZAS_CLIENTE: { uno: entrada("uno", "Uno"), dos: entrada("dos", "Dos") } };
});

import ALaMedidaModule from "@/components/admin/a-medida/ALaMedidaModule";
import { PiezasPorNegocio } from "@/components/superadmin/piezas/PiezasPorNegocio";

const asignada = (piezaId: string, opciones: Record<string, unknown> = {}) => ({
  piezaId,
  enchufe: "panel.pestana",
  opciones,
  version: "1.0.0",
  orden: 0,
});

describe("ALaMedidaModule", () => {
  beforeEach(() => window.history.replaceState(null, "", "/admin?tab=a-medida"));

  it("con UNA pieza se ve ella sola, sin fila de botones", () => {
    H.piezas = [asignada("uno", { saludo: "buenas" })];
    render(<ALaMedidaModule />);
    expect(screen.getByText("uno:buenas")).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("con varias hay botones y `?pieza=` elige la que se ve", async () => {
    H.piezas = [asignada("uno"), asignada("dos")];
    window.history.replaceState(null, "", "/admin?tab=a-medida&pieza=dos");
    render(<ALaMedidaModule />);
    expect(screen.getByText("dos:hola")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Uno" }));
    expect(screen.getByText("uno:hola")).toBeInTheDocument();
    expect(window.location.search).toContain("pieza=uno");
  });

  it("una pieza con opciones inválidas se esconde en vez de romper la pestaña", () => {
    H.piezas = [asignada("uno", { saludo: 5 }), asignada("dos")];
    render(<ALaMedidaModule />);
    expect(screen.queryByText(/^uno:/)).toBeNull();
    expect(screen.getByText("dos:hola")).toBeInTheDocument();
  });

  it("un `?pieza=` que ya no existe cae en la primera", () => {
    H.piezas = [asignada("uno")];
    window.history.replaceState(null, "", "/admin?tab=a-medida&pieza=borrada");
    render(<ALaMedidaModule />);
    expect(screen.getByText("uno:hola")).toBeInTheDocument();
  });
});

describe("PiezasPorNegocio", () => {
  const catalogo = [
    {
      id: "uno",
      nombre: "Pieza uno",
      descripcion: "Hace algo",
      version: "2.0.0",
      enchufes: ["panel.pestana"],
      rubros: [],
      requiere: [],
      opcionesSchema: { type: "object", properties: { saludo: { type: "string", maxLength: 20, title: "Saludo" } } },
      opcionesPorDefecto: { saludo: "hola" },
    },
  ];
  const fila = (extra: Record<string, unknown> = {}) => ({
    id: "f1", tenantId: "t1", tenantSlug: "uno", tenantNombre: "Negocio Uno", piezaId: "uno", enchufe: "panel.pestana",
    prendida: false, opciones: { saludo: "hola" }, version: "2.0.0", orden: 0,
    huerfana: false, desactualizada: false, opcionesValidas: true, ...extra,
  });
  const negocios = [
    { id: "t1", slug: "uno", name: "Negocio Uno", industry: "bodega", plan: "pro" },
    { id: "t2", slug: "dos", name: "Negocio Dos", industry: "madereria", plan: "pro" },
  ];
  const responder = (matriz: unknown[]) =>
    H.fetchSuperadmin.mockImplementation(async (url: string, init?: { method?: string }) => {
      if (init?.method === "PUT") return { ok: true, status: 200, json: async () => ({ ok: true }) };
      return { ok: true, status: 200, json: async () => ({ catalogo, matriz }) };
    });

  afterEach(() => H.fetchSuperadmin.mockReset());

  it("prender una pieza sin fila manda PUT con las opciones por defecto del catálogo", async () => {
    responder([]);
    render(<PiezasPorNegocio negocios={negocios} />);
    const interruptor = await screen.findByRole("switch", { name: /Prender Pieza uno en Negocio Dos/ });
    await userEvent.click(interruptor);
    await waitFor(() => {
      const put = H.fetchSuperadmin.mock.calls.find((c) => c[1]?.method === "PUT");
      expect(put).toBeTruthy();
      expect(JSON.parse(put![1].body)).toEqual({
        tenantId: "t2", piezaId: "uno", enchufe: "panel.pestana", prendida: true, opciones: { saludo: "hola" },
      });
    });
  });

  it("muestra en su idioma la fila desactualizada y la de opciones inválidas", async () => {
    responder([fila({ desactualizada: true }), fila({ id: "f2", tenantId: "t2", tenantNombre: "Negocio Dos", opcionesValidas: false })]);
    render(<PiezasPorNegocio negocios={negocios} />);
    expect(await screen.findByText("Versión vieja")).toBeInTheDocument();
    expect(screen.getByText("Opciones inválidas")).toBeInTheDocument();
  });

  it("abre las opciones con el formulario generado y guarda lo editado sin cambiar si está prendida", async () => {
    responder([fila({ prendida: true })]);
    render(<PiezasPorNegocio negocios={negocios} />);
    await userEvent.click(await screen.findByRole("button", { name: "Opciones de Pieza uno en Negocio Uno" }));
    const dialogo = await screen.findByRole("dialog");
    const campo = within(dialogo).getByLabelText("Saludo");
    await userEvent.clear(campo);
    await userEvent.type(campo, "buenas");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Guardar opciones" }));
    await waitFor(() => {
      const put = H.fetchSuperadmin.mock.calls.find((c) => c[1]?.method === "PUT");
      expect(JSON.parse(put![1].body)).toMatchObject({ tenantId: "t1", prendida: true, opciones: { saludo: "buenas" } });
    });
  });

  it("si el servidor rechaza, el motivo se ve y el modal sigue abierto", async () => {
    H.fetchSuperadmin.mockImplementation(async (_u: string, init?: { method?: string }) =>
      init?.method === "PUT"
        ? { ok: false, status: 400, json: async () => ({ error: "opciones_invalidas", mensaje: "Las opciones no pasan." }) }
        : { ok: true, status: 200, json: async () => ({ catalogo, matriz: [fila({ prendida: true })] }) },
    );
    render(<PiezasPorNegocio negocios={negocios} />);
    await userEvent.click(await screen.findByRole("button", { name: "Opciones de Pieza uno en Negocio Uno" }));
    const dialogo = await screen.findByRole("dialog");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Guardar opciones" }));
    expect(await within(dialogo).findByText("Las opciones no pasan.")).toBeInTheDocument();
  });
});
