// @vitest-environment jsdom
/**
 * «Entrar como esta tienda» / «Impersonar» (11-10): tras la suplantación, el
 * superadmin abre el panel de la tienda. El panel lee el negocio activo de
 * localStorage (menú, asistente de primeros pasos, vistas forestales) y quien lo
 * escribía (`app/t/[slug]/admin/page.tsx`) nunca se dibuja: entrando como Musa
 * el menú decía «Mi Bodega» y saltaba el asistente de la dueña.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({ limpiar: vi.fn(() => 0) }));
vi.mock("@/lib/tenant-cache", () => ({ clearAllTenantCache: m.limpiar }));
vi.mock("@/lib/csrf-client", () => ({ csrfHeaders: (h: Record<string, string> = {}) => h }));

import { abrirPanelDeTienda, suplantarTienda } from "@/components/superadmin/tenants/abrir-panel-tienda";
import { anotarVistaSuplantada, destinoSesionTerminada } from "@/lib/auth/suplantacion-vista";

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  m.limpiar.mockClear();
  vi.spyOn(window, "open").mockImplementation(() => null);
});

describe("abrirPanelDeTienda", () => {
  it("limpia el caché, marca el negocio activo y la suplantación, y abre /t/<slug>/admin", async () => {
    localStorage.setItem("active-tenant-slug", "main");
    await abrirPanelDeTienda("musa");

    expect(m.limpiar).toHaveBeenCalled();
    expect(localStorage.getItem("active-tenant-slug")).toBe("musa");
    expect(localStorage.getItem("superadmin-impersonate-tenant")).toBe("musa");
    expect(window.open).toHaveBeenCalledWith(expect.stringMatching(/^\/t\/musa\/admin\?_fresh=\d+$/), "_blank");
  });

  it("con el candado cerrado (423) no marca nada ni abre el panel", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 423 })));
    const alCandado = vi.fn();
    expect(await suplantarTienda("musa", alCandado)).toBe("candado");
    expect(alCandado).toHaveBeenCalledWith("musa");
    expect(localStorage.getItem("superadmin-impersonate-tenant")).toBeNull();
    expect(window.open).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("destinoSesionTerminada: adónde va el panel cuando la sesión se terminó", () => {
  it("sin vista de tienda → el login del panel", () => {
    expect(destinoSesionTerminada()).toBe("/admin/login");
    expect(destinoSesionTerminada("/t/musa/admin/login")).toBe("/t/musa/admin/login");
  });

  it("venció la vista de Musa → lista de tiendas del superadmin con el aviso, y la marca se consume", () => {
    const vence = Date.now() - 1000;
    anotarVistaSuplantada("musa", vence);
    expect(destinoSesionTerminada("/admin/login", vence + 2000)).toBe("/superadmin/tenants?vista-vencida=musa");
    expect(localStorage.getItem("superadmin-impersonate-tenant")).toBeNull();
    expect(destinoSesionTerminada()).toBe("/admin/login");
  });

  it("marca vieja (más de 6 h tras vencer: era otra sesión) → login, no superadmin", () => {
    const vence = Date.now() - 7 * 60 * 60 * 1000;
    anotarVistaSuplantada("musa", vence);
    expect(destinoSesionTerminada()).toBe("/admin/login");
  });
});
