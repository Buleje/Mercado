/**
 * Crecimiento › Mandar mensaje montado DENTRO de su hub (revisión 19-10).
 *
 * El hub abre su vista por defecto y escribe `?vista=campanas` en la URL al
 * montar; Mandar mensaje (`next/dynamic`) carga después. Si la pantalla leía
 * la URL por su cuenta, tomaba esa escritura por un enlace a la vista y le
 * abría «Automático» a toda bodega (el rubro esconde `campanas`). El hub lee
 * la vista pedida antes de escribir y se la pasa por prop.
 *
 * El `dynamic` de mentira monta la pantalla un render DESPUÉS del hub, como
 * en el navegador: sin eso la carrera no se reproduce.
 */
import { useEffect, useState, type ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SPEC_GATED_MODULE_IDS } from "@/hooks/use-enabled-specs";
import { idsDelPlan, idsDelRol, rubroDelPanel, type ContextoPermiso } from "@/lib/admin/permiso-vista";

const real = vi.hoisted(() => ({ MandarMensaje: null as null | ((p: Record<string, unknown>) => ReactNode) }));

vi.mock("next/dynamic", () => ({
  default: (cargar: () => Promise<unknown>) => {
    if (!String(cargar).includes("MandarMensaje")) return () => null;
    return function Diferido(props: Record<string, unknown>) {
      const [listo, setListo] = useState(false);
      useEffect(() => setListo(true), []);
      const Real = real.MandarMensaje!;
      return listo ? <Real {...props} /> : null;
    };
  },
}));

/** Main: bodega, enterprise, administrador, sin plantilla. */
const BODEGA: ContextoPermiso = {
  rol: idsDelRol("admin", null),
  plan: idsDelPlan("enterprise"),
  plantilla: null,
  rubro: rubroDelPanel("bodega"),
  especialidades: SPEC_GATED_MODULE_IDS,
  modoFacil: null,
};

vi.mock("@/hooks/use-vistas-permitidas", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/use-vistas-permitidas")>()),
  useContextoPermiso: () => BODEGA,
  useVistasPermitidas: <T,>(_modulo: string, items: readonly T[]) => [...items],
}));

vi.mock("@/components/admin/shared/AdminTabBar", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/csrf-client", () => ({ csrfHeaders: (h: Record<string, string> = {}) => h }));

import MandarMensaje from "@/components/admin/mandar-mensaje/MandarMensaje";
import CrecimientoHubModule from "@/components/admin/unified/CrecimientoHubModule";

real.MandarMensaje = MandarMensaje as never;

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } })));
});
afterEach(() => vi.unstubAllGlobals());

async function abrir(url: string) {
  window.history.replaceState(null, "", url);
  render(<CrecimientoHubModule />);
  await waitFor(() => expect(document.getElementById("mandar-mensaje-panel")).not.toBeNull());
}

describe("Mandar mensaje en su hub: la vista que escribe el hub no es un enlace", () => {
  it("/admin?tab=campanas en una bodega: sin «Automático», aunque la URL ya diga vista=campanas", async () => {
    // Recordado de otra sesión: tampoco abre un modo que no le toca.
    localStorage.setItem("admin-last-tab-mandar-mensaje", "automatico");
    await abrir("/admin?tab=campanas");
    expect(new URLSearchParams(window.location.search).get("vista")).toBe("campanas");
    expect(screen.queryByRole("tab", { name: "Automático" })).toBeNull();
    expect(new URLSearchParams(window.location.search).get("sub")).toBe("uno-por-uno");
  });

  it("el enlace explícito a la vista (?vista=campanas) abre «Automático» como abría Campañas", async () => {
    await abrir("/admin?tab=campanas&vista=campanas");
    expect(await screen.findByRole("tab", { name: "Automático" })).toBeTruthy();
  });
});
