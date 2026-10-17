/**
 * Extracción (ADR-455) — el aviso «plan sin permiso» con su arreglo en la línea.
 *
 * Medido el 29-09: 0 de 3 planes vivos unidos a su permiso; en Blas, el
 * 19-SEC/REG-PLT-2025-096 tiene un permiso con el mismo código. Lo que se prueba:
 *   - con gemelo, «Unir» hace las DOS escrituras de «Unirlos» del Plan de
 *     Manejo (PATCH del plan con `contratoId`, PATCH del permiso con `planId`)
 *     y avisa para que la vista vuelva a leer;
 *   - sin gemelo, «Elegir su permiso» ofrece los permisos libres (no el de otro plan);
 *   - el almacenero ve la Extracción pero no el botón (las rutas son de admin/dueño);
 *   - el aviso con botón no queda escondido en «N avisos más».
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import type { AvisoExtraccion } from "@/lib/forestal/loth-extraccion-tipos";

const H = vi.hoisted(() => ({
  rol: "admin" as string | null,
  toastOk: vi.fn(),
  toastWarn: vi.fn(),
}));

vi.mock("@/lib/client-cache-fetch", () => ({ cachedJson: async () => ({ role: H.rol }) }));
vi.mock("sonner", () => ({ toast: { success: (m: string) => H.toastOk(m), warning: (m: string) => H.toastWarn(m), error: vi.fn() } }));

import LothExtraccionAvisos from "@/components/admin/forestal/loth-extraccion-avisos";
import { ordenarAvisos } from "@/components/admin/forestal/loth-extraccion-shared";
import { permisosElegibles } from "@/components/admin/forestal/loth-extraccion-unir";
import { EVENTO_PLAN_PERMISO, avisarPlanPermisoCambio, puedeUnirPlanPermiso } from "@/components/admin/forestal/loth-plan-unir";
import { useLothExtraccion } from "@/components/admin/forestal/hooks/use-loth-extraccion";
import type { Contrato } from "@/lib/forestal/contratos";

const CODIGO = "19-SEC/REG-PLT-2025-096";
const PLAN = "cmuamvvnu00018tvz1owuk0h0";

const contrato = (id: string, codigo: string, planId: string | null = null, estado = "vigente"): Contrato =>
  ({ id, codigo, codigoNorm: codigo, planId, estado, titularNombre: "CCNN San Luis de Chinchiguani" }) as Contrato;

const avisoPermiso = (permisoSugerido: AvisoExtraccion["permisoSugerido"]): AvisoExtraccion => ({
  tipo: "plan_sin_permiso",
  nivel: "info",
  planId: PLAN,
  especie: null,
  texto: permisoSugerido
    ? `El plan no está unido a su permiso: el permiso ${permisoSugerido.codigo} tiene el mismo código.`
    : "El plan no está unido a ningún permiso: lo recibido en el CTP no se puede leer por permiso.",
  cifraM3: null,
  permisoSugerido,
});

function servidor(contratos: Contrato[], opciones: { planFalla?: boolean } = {}) {
  const llamadas: { url: string; method: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      llamadas.push({ url, method, body });
      if (url === "/api/admin/forestal/contratos" && method === "GET") return new Response(JSON.stringify({ contratos }), { status: 200 });
      if (url === "/api/admin/forestal/plan" && method === "PATCH") {
        if (opciones.planFalla) return new Response(JSON.stringify({ error: "contrato_ajeno", message: "Ese permiso no es de esta empresa." }), { status: 400 });
        return new Response(JSON.stringify({ plan: { id: body.id, contratoId: body.contratoId } }), { status: 200 });
      }
      if (url.startsWith("/api/admin/forestal/contratos/") && method === "PATCH") {
        const c = contratos.find((x) => url.endsWith(encodeURIComponent(x.id)));
        return new Response(JSON.stringify({ contrato: { ...c, ...body } }), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    }),
  );
  return llamadas;
}

let eventos = 0;
const contar = () => {
  eventos += 1;
};

beforeEach(() => {
  H.rol = "admin";
  H.toastOk.mockReset();
  H.toastWarn.mockReset();
  eventos = 0;
  window.addEventListener(EVENTO_PLAN_PERMISO, contar);
});

afterEach(() => {
  window.removeEventListener(EVENTO_PLAN_PERMISO, contar);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("«Unir» con el permiso del mismo código", () => {
  it("⭐ Blas: un clic une plan y permiso desde los dos lados, avisa a la vista y lo confirma", async () => {
    const llamadas = servidor([contrato("ctr_165b5048de1f37205cca0c", CODIGO)]);
    render(<LothExtraccionAvisos avisos={[avisoPermiso({ contratoId: "ctr_165b5048de1f37205cca0c", codigo: CODIGO })]} />);

    fireEvent.click(await screen.findByRole("button", { name: /^Unir$/ }));
    await waitFor(() => expect(H.toastOk).toHaveBeenCalledWith(`Plan unido al permiso ${CODIGO}.`));

    expect(llamadas.filter((l) => l.method === "PATCH")).toEqual([
      { url: "/api/admin/forestal/plan", method: "PATCH", body: { id: PLAN, contratoId: "ctr_165b5048de1f37205cca0c" } },
      { url: "/api/admin/forestal/contratos/ctr_165b5048de1f37205cca0c", method: "PATCH", body: { planId: PLAN } },
    ]);
    // Con gemelo no hace falta la lista: no se pide.
    expect(llamadas.some((l) => l.method === "GET")).toBe(false);
    expect(eventos).toBe(1);
  });

  it("si el plan no se pudo unir: lo dice en la línea, no avisa a la vista y el botón vuelve", async () => {
    servidor([contrato("ctr-096", CODIGO)], { planFalla: true });
    render(<LothExtraccionAvisos avisos={[avisoPermiso({ contratoId: "ctr-096", codigo: CODIGO })]} />);
    fireEvent.click(await screen.findByRole("button", { name: /^Unir$/ }));
    expect((await screen.findByRole("alert")).textContent).toBe("Ese permiso no es de esta empresa.");
    expect(eventos).toBe(0);
    expect(H.toastOk).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: /^Unir$/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("el almacenero ve el aviso pero no el botón (PATCH del plan y del permiso son de admin y dueño)", async () => {
    H.rol = "almacenero";
    servidor([]);
    render(<LothExtraccionAvisos avisos={[avisoPermiso({ contratoId: "ctr-096", codigo: CODIGO })]} />);
    await waitFor(() => expect(screen.getByText(/tiene el mismo código/)).toBeTruthy());
    // El rol llega por una promesa: se espera un tick antes de afirmar que no aparece.
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole("button", { name: /Unir|Elegir su permiso/ })).toBeNull();
    expect([puedeUnirPlanPermiso("admin"), puedeUnirPlanPermiso("owner"), puedeUnirPlanPermiso("manager")]).toEqual([true, true, true]);
    expect([puedeUnirPlanPermiso("almacenero"), puedeUnirPlanPermiso("cajero"), puedeUnirPlanPermiso(null)]).toEqual([false, false, false]);
  });
});

describe("«Elegir su permiso» cuando no hay gemelo", () => {
  it("ofrece los libres (y el que ya apunta a este plan), nunca el de otro plan; une con el elegido", async () => {
    const contratos = [
      contrato("c-020", "19-SEC/REG-PLT-2018-020"),
      contrato("c-otro", "19-SEC/REG-PLT-2021-017", "otro-plan"),
      contrato("c-032", "19-SEC/REG-PLT-2026-032", null, "cerrado"),
    ];
    const llamadas = servidor(contratos);
    render(<LothExtraccionAvisos avisos={[avisoPermiso(null)]} />);

    fireEvent.click(await screen.findByRole("button", { name: /Elegir su permiso/ }));
    const lista = (await screen.findByLabelText("Permiso para unir con este plan")) as HTMLSelectElement;
    const opciones = [...lista.options].map((o) => o.textContent);
    expect(opciones).toEqual([
      "Elige un permiso…",
      "19-SEC/REG-PLT-2018-020 · CCNN San Luis de Chinchiguani",
      "19-SEC/REG-PLT-2026-032 · CCNN San Luis de Chinchiguani (cerrado)",
    ]);
    const unir = screen.getByRole("button", { name: /^Unir$/ }) as HTMLButtonElement;
    expect(unir.disabled).toBe(true);

    fireEvent.change(lista, { target: { value: "c-020" } });
    fireEvent.click(unir);
    await waitFor(() => expect(H.toastOk).toHaveBeenCalledWith("Plan unido al permiso 19-SEC/REG-PLT-2018-020."));
    expect(llamadas.filter((l) => l.method === "PATCH").map((l) => [l.url, l.body])).toEqual([
      ["/api/admin/forestal/plan", { id: PLAN, contratoId: "c-020" }],
      ["/api/admin/forestal/contratos/c-020", { planId: PLAN }],
    ]);
    expect(eventos).toBe(1);
  });

  it("teclado: al abrir, el foco va a la lista; al cancelar, vuelve al botón (no cae al <body>)", async () => {
    servidor([contrato("c-020", "19-SEC/REG-PLT-2018-020")]);
    render(<LothExtraccionAvisos avisos={[avisoPermiso(null)]} />);
    fireEvent.click(await screen.findByRole("button", { name: /Elegir su permiso/ }));
    const lista = await screen.findByLabelText("Permiso para unir con este plan");
    expect(document.activeElement).toBe(lista);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: /Elegir su permiso/ })));
  });

  it("permisosElegibles: libres o de este plan, por código", () => {
    const r = permisosElegibles([contrato("b", "B"), contrato("x", "X", "otro"), contrato("a", "A", PLAN)], PLAN);
    expect(r.map((c) => c.id)).toEqual(["a", "b"]);
  });
});

describe("orden de los avisos", () => {
  it("dentro del mismo color, el que se arregla con un clic va primero (Blas «Todos»: era el 5.º de 6)", () => {
    const base = { planId: "p", especie: null, texto: "" };
    const avisos: AvisoExtraccion[] = [
      { ...base, tipo: "semilleros_sistema_vs_regente", nivel: "warning", cifraM3: 3.8824 },
      { ...base, tipo: "censo_libro_distinto", nivel: "warning", cifraM3: null },
      { ...base, tipo: "autorizado_sin_respaldo", nivel: "info", cifraM3: 320 },
      { ...base, tipo: "talados_sin_trozar", nivel: "info", cifraM3: 18.4231 },
      { ...avisoPermiso({ contratoId: "c", codigo: CODIGO }) },
      { ...avisoPermiso(null), planId: "p2" },
    ];
    expect(ordenarAvisos(avisos).map((a) => a.tipo)).toEqual([
      "semilleros_sistema_vs_regente",
      "censo_libro_distinto",
      "plan_sin_permiso",
      "plan_sin_permiso",
      "autorizado_sin_respaldo",
      "talados_sin_trozar",
    ]);
  });
});

describe("useLothExtraccion vuelve a leer al unir", () => {
  it("el evento de unir (acá o en Plan de Manejo) dispara una lectura nueva", async () => {
    const pedidos: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        pedidos.push(url);
        if (url.startsWith("/api/admin/forestal/loth/extraccion")) return new Response(JSON.stringify({ error: "x" }), { status: 500 });
        return new Response(JSON.stringify({ plans: [] }), { status: 200 });
      }),
    );
    renderHook(() => useLothExtraccion(0));
    await waitFor(() => expect(pedidos.filter((u) => u.includes("/loth/extraccion"))).toHaveLength(1));
    act(() => avisarPlanPermisoCambio());
    await waitFor(() => expect(pedidos.filter((u) => u.includes("/loth/extraccion"))).toHaveLength(2));
  });
});
