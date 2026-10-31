/**
 * ADR-457 · guardados en paralelo: la respuesta vieja de la matriz no pisa a la nueva y cada celda tiene su propio «guardando».
 */
import { render, screen, waitFor, act } from "@testing-library/react";
import { expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({ fetchSuperadmin: vi.fn() }));
vi.mock("@/hooks/use-enabled-specs", () => ({ broadcastSpecsChanged: vi.fn(), usePiezas: () => ({ piezas: [], negocio: null, isLoading: false }) }));
vi.mock("@/lib/superadmin/fetch-auth", () => ({ fetchSuperadmin: (...a: unknown[]) => H.fetchSuperadmin(...a) }));

import { PiezasPorNegocio } from "@/components/superadmin/piezas/PiezasPorNegocio";

const catalogo = [{ id: "uno", nombre: "Pieza uno", descripcion: "", version: "1.0.0", enchufes: ["panel.pestana"], rubros: [], requiere: [],
  opcionesSchema: { type: "object", properties: {} }, opcionesPorDefecto: {} }];
const fila = (tenantId: string, prendida: boolean) => ({ id: `f-${tenantId}`, tenantId, tenantSlug: tenantId, tenantNombre: tenantId, piezaId: "uno",
  enchufe: "panel.pestana", prendida, opciones: {}, version: "1.0.0", orden: 0, huerfana: false, desactualizada: false, opcionesValidas: true });
const negocios = [
  { id: "t1", slug: "t1", name: "Negocio A", industry: "bodega", plan: "pro" },
  { id: "t2", slug: "t2", name: "Negocio B", industry: "bodega", plan: "pro" },
];
function diferido<T>() { let r!: (v: T) => void; const p = new Promise<T>((res) => (r = res)); return { p, r }; }
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

it("el GET viejo de A que vuelve tarde NO deja a B apagado", async () => {
  const puts: ReturnType<typeof diferido<unknown>>[] = [];
  const gets: ReturnType<typeof diferido<unknown>>[] = [];
  let primero = true;
  H.fetchSuperadmin.mockImplementation((_u: string, init?: { method?: string }) => {
    if (init?.method === "PUT") { const d = diferido<unknown>(); puts.push(d); return d.p; }
    if (primero) { primero = false; return Promise.resolve(ok({ catalogo, matriz: [] })); }
    const d = diferido<unknown>(); gets.push(d); return d.p;
  });
  render(<PiezasPorNegocio negocios={negocios} />);
  const a = await screen.findByRole("switch", { name: /Negocio A/ });
  const b = screen.getByRole("switch", { name: /Negocio B/ });
  act(() => a.click());
  act(() => b.click()); // A sigue guardando; B no está deshabilitado
  expect(puts.length).toBe(2);
  // A termina primero y pide la matriz (en la base todavía no está B)
  await act(async () => { puts[0].r(ok({ ok: true })); });
  await waitFor(() => expect(gets.length).toBe(1));
  // B termina y pide la matriz (ya con A y B)
  await act(async () => { puts[1].r(ok({ ok: true })); });
  await waitFor(() => expect(gets.length).toBe(2));
  await act(async () => { gets[1].r(ok({ catalogo, matriz: [fila("t1", true), fila("t2", true)] })); });
  await waitFor(() => expect(screen.getByRole("switch", { name: /Negocio B/ })).toHaveAttribute("aria-checked", "true"));
  // El GET viejo de A vuelve último
  await act(async () => { gets[0].r(ok({ catalogo, matriz: [fila("t1", true)] })); });
  // La respuesta vieja se descarta: B sigue prendido, como lo tiene el servidor
  await act(async () => {});
  expect(screen.getByRole("switch", { name: /Negocio B/ })).toHaveAttribute("aria-checked", "true");
});

it("terminar A no le saca el «cargando» a B, que sigue en vuelo", async () => {
  const puts: ReturnType<typeof diferido<unknown>>[] = [];
  let primero = true;
  H.fetchSuperadmin.mockImplementation((_u: string, init?: { method?: string }) => {
    if (init?.method === "PUT") { const d = diferido<unknown>(); puts.push(d); return d.p; }
    if (primero) { primero = false; return Promise.resolve(ok({ catalogo, matriz: [] })); }
    return Promise.resolve(ok({ catalogo, matriz: [] }));
  });
  render(<PiezasPorNegocio negocios={negocios} />);
  const a = await screen.findByRole("switch", { name: /Negocio A/ });
  act(() => a.click());
  act(() => screen.getByRole("switch", { name: /Negocio B/ }).click());
  expect(screen.getByRole("switch", { name: /Negocio B/ })).toBeDisabled();
  await act(async () => { puts[0].r(ok({ ok: true })); });
  await waitFor(() => expect(screen.getByRole("switch", { name: /Negocio A/ })).not.toBeDisabled());
  expect(screen.getByRole("switch", { name: /Negocio B/ })).toBeDisabled();
  expect(puts.length).toBe(2);
  await act(async () => { puts[1].r(ok({ ok: true })); });
  await waitFor(() => expect(screen.getByRole("switch", { name: /Negocio B/ })).not.toBeDisabled());
});
