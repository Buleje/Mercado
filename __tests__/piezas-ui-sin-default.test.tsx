/**
 * ADR-457 · una pieza sin valores por defecto: prender desde el modal prende, y una fila con
 * opciones que ya no sirven no se apaga a ciegas con `{}` (el servidor lo rechaza).
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
const H = vi.hoisted(() => ({ fetchSuperadmin: vi.fn() }));
vi.mock("@/hooks/use-enabled-specs", () => ({ broadcastSpecsChanged: vi.fn() }));
vi.mock("@/lib/superadmin/fetch-auth", () => ({ fetchSuperadmin: (...a: unknown[]) => H.fetchSuperadmin(...a) }));
import { PiezasPorNegocio } from "@/components/superadmin/piezas/PiezasPorNegocio";

afterEach(() => H.fetchSuperadmin.mockReset());

const catalogo = [{ id: "uno", nombre: "Pieza uno", descripcion: "", version: "1.0.0", enchufes: ["panel.pestana"], rubros: [], requiere: [],
  opcionesSchema: { type: "object", properties: { clave: { type: "string", title: "Clave" } }, required: ["clave"] }, opcionesPorDefecto: null }];
const negocios = [{ id: "t1", slug: "t1", name: "Negocio A", industry: "bodega", plan: "pro" }];
const ok = (b: unknown) => ({ ok: true, status: 200, json: async () => b });

it("«Prender» abre las opciones y al guardar queda PRENDIDA", async () => {
  H.fetchSuperadmin.mockImplementation(async (_u: string, init?: { method?: string }) => init?.method === "PUT" ? ok({ ok: true }) : ok({ catalogo, matriz: [] }));
  render(<PiezasPorNegocio negocios={negocios} />);
  await userEvent.click(await screen.findByRole("switch", { name: /Prender Pieza uno/ }));
  const d = await screen.findByRole("dialog");
  await userEvent.type(within(d).getByLabelText("Clave"), "x");
  await userEvent.click(within(d).getByRole("button", { name: "Guardar opciones" }));
  await waitFor(() => {
    const put = H.fetchSuperadmin.mock.calls.find((c) => c[1]?.method === "PUT");
    expect(JSON.parse(put![1].body)).toMatchObject({ prendida: true, opciones: { clave: "x" } });
  });
});

it("«Apagar» una fila con opciones inválidas y sin default abre las opciones y apaga desde ahí (no manda `{}`)", async () => {
  const fila = { id: "f", tenantId: "t1", tenantSlug: "t1", tenantNombre: "A", piezaId: "uno", enchufe: "panel.pestana", prendida: true,
    opciones: { vieja: 1 }, version: "0.9.0", orden: 0, huerfana: false, desactualizada: true, opcionesValidas: false };
  H.fetchSuperadmin.mockImplementation(async (_u: string, init?: { method?: string }) => init?.method === "PUT" ? ok({ ok: true }) : ok({ catalogo, matriz: [fila] }));
  render(<PiezasPorNegocio negocios={negocios} />);
  await userEvent.click(await screen.findByRole("switch", { name: /Apagar Pieza uno/ }));
  expect(H.fetchSuperadmin.mock.calls.some((c) => c[1]?.method === "PUT")).toBe(false);
  const d = await screen.findByRole("dialog");
  await userEvent.type(within(d).getByLabelText("Clave"), "x");
  await userEvent.click(within(d).getByRole("button", { name: "Guardar opciones" }));
  await waitFor(() => {
    const put = H.fetchSuperadmin.mock.calls.find((c) => c[1]?.method === "PUT");
    expect(JSON.parse(put![1].body)).toMatchObject({ prendida: false, opciones: { clave: "x" } });
  });
});
