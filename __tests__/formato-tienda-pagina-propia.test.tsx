/**
 * ADR-511 · «Formato de tu tienda» con página propia prendida (main, Musa):
 * el servidor dice cuál (misma regla que la tienda, tenant de la SESIÓN) y el
 * editor avisa arriba, con las opciones atenuadas pero elegibles.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextRequest, NextResponse } from "next/server";

const H = vi.hoisted(() => ({
  auth: null as null | { tenantId: string; role: string },
  resolverPiezas: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/require-admin", () => ({
  requireAdmin: (...a: unknown[]) => {
    H.requireAdmin(...a);
    return Promise.resolve(H.auth ?? NextResponse.json({ error: "No autorizado" }, { status: 401 }));
  },
}));
vi.mock("@/lib/extensiones/resolver", () => ({ resolverPiezas: (...a: unknown[]) => H.resolverPiezas(...a) }));
vi.mock("@/lib/db/settings.db", () => ({ SettingsDB: { get: async () => null } }));
vi.mock("@/lib/extensiones/tope", () => ({ reportarFalloPieza: vi.fn() }));
vi.mock("@/extensiones/registro.servidor", () => ({ PIEZAS_SERVIDOR: [], PLANTILLA_TIENDA: null }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { GET } from "@/app/api/admin/store-customizer/pagina-propia/route";
import { SeccionFormatoTienda } from "@/components/admin/store-customizer/SeccionFormatoTienda";

const MUSA = {
  piezaId: "pagina-musa",
  enchufe: "tienda.pagina",
  opciones: {},
  version: "1.0.0",
  orden: 0,
  entrada: { manifiesto: { id: "pagina-musa", nombre: "Musa — belleza profesional" }, pagina: async () => ({}) },
};

// Un tenant ajeno en el header no cambia nada: manda la sesión.
const pedir = () =>
  GET(new NextRequest("http://localhost/api/admin/store-customizer/pagina-propia", { headers: { "x-tenant-id": "otro-negocio" } }));

describe("GET /api/admin/store-customizer/pagina-propia", () => {
  beforeEach(() => {
    H.auth = { tenantId: "cuid-musa", role: "admin" };
    H.resolverPiezas.mockReset();
    H.requireAdmin.mockReset();
  });

  it("sin sesión → 401 y no lee piezas", async () => {
    H.auth = null;
    const r = await pedir();
    expect(r.status).toBe(401);
    expect(H.resolverPiezas).not.toHaveBeenCalled();
  });

  it("sólo dueño (mismo rol que guarda el formato)", async () => {
    H.resolverPiezas.mockResolvedValue([]);
    await pedir();
    expect(H.requireAdmin).toHaveBeenCalledWith(expect.anything(), ["admin"]);
  });

  it("con página propia prendida → id y nombre, leídos con el tenant de la sesión", async () => {
    H.resolverPiezas.mockResolvedValue([MUSA]);
    const r = await pedir();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ paginaPropia: { id: "pagina-musa", nombre: "Musa — belleza profesional" } });
    expect(H.resolverPiezas).toHaveBeenCalledWith("cuid-musa", "tienda.pagina");
    expect(r.headers.get("cache-control")).toContain("no-store");
  });

  it("sin propia, o una pieza sin código de página → null (misma regla que la tienda)", async () => {
    H.resolverPiezas.mockResolvedValue([]);
    expect(await (await pedir()).json()).toEqual({ paginaPropia: null });
    H.auth = { tenantId: "cuid-otro", role: "admin" };
    H.resolverPiezas.mockResolvedValue([{ ...MUSA, entrada: { manifiesto: MUSA.entrada.manifiesto } }]);
    expect(await (await pedir()).json()).toEqual({ paginaPropia: null });
  });
});

describe("SeccionFormatoTienda", () => {
  const conRespuesta = (paginaPropia: unknown) =>
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ paginaPropia }), { status: 200 })));
  afterEach(() => vi.unstubAllGlobals());

  it("con propia: avisa arriba con su nombre y las opciones siguen elegibles", async () => {
    conRespuesta({ id: "pagina-musa", nombre: "Musa — belleza profesional" });
    const onChange = vi.fn();
    render(<SeccionFormatoTienda valor={{ formato: "tienda" }} onChange={onChange} />);
    const aviso = await screen.findByTestId("formato-pagina-propia");
    expect(aviso.textContent).toContain("Tu tienda usa su página propia (Musa — belleza profesional). Este formato se usa si la apagas.");
    await userEvent.click(screen.getByRole("radio", { name: /Clásico/ }));
    expect(onChange).toHaveBeenCalledWith({ formato: "clasico" });
  });

  it("sin propia (o si la consulta falla): sin aviso, como antes", async () => {
    conRespuesta(null);
    render(<SeccionFormatoTienda valor={{ formato: "tienda" }} onChange={vi.fn()} />);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/admin/store-customizer/pagina-propia", expect.anything()));
    expect(screen.queryByTestId("formato-pagina-propia")).toBeNull();
  });
});
