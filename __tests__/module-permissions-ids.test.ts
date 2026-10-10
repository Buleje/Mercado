/**
 * MODULE_PERMISSIONS → pestañas reales (plan «panel unificado», carril O1-K2).
 *
 * Por qué (medido 2026-10-09): MODULE_PERMISSIONS guarda nombres de pestaña de
 * un menú viejo («pos-caja», «catalogo-tienda»…) y el panel los compara con los
 * ids de hoy: el cajero veía 2 de sus 11 permisos y el almacenero 2 de 12, sin
 * que nada avisara. Este test exige que cada id llegue a una pestaña real, que
 * con la bandera apagada nadie vea nada distinto y que la traducción no le
 * conceda al cajero ni al almacenero pestañas de dueño.
 */
import { describe, expect, it } from "vitest";
import { ALL_TABS } from "@/app/admin/_lib/tab-data";
import { resolverDestino } from "@/lib/admin/destino-tab";
import {
  MODULE_PERMISSIONS,
  PERMISOS_DISTINTOS_DEL_LINK,
  ROL_CON_IDS_REALES,
  pestanasDelPermiso,
  tabsDelRol,
} from "@/lib/module-permissions";

const MENU: readonly string[] = ALL_TABS.map((t) => t.id);
const IDS_USADOS = [...new Set(Object.values(MODULE_PERMISSIONS).flat())];

/** Lo que hace HOY useAdminTabsDerived (allowedTabs antes del plan) y lo que llega al menú. */
function menuDeHoy(rol: string, guardadas: Record<string, string[]> | null): string[] {
  const porDefecto: Record<string, readonly string[]> = {
    admin: MENU,
    cajero: MODULE_PERMISSIONS.cajero,
    almacenero: MODULE_PERMISSIONS.almacenero,
  };
  const porRol: Record<string, readonly string[]> = { ...porDefecto, ...(guardadas ?? {}), admin: MENU };
  const base = porRol[rol] ?? porRol.admin;
  return MENU.filter((t) => base.includes(t));
}

function menuCon(lista: readonly string[] | null): string[] {
  return lista === null ? [...MENU] : MENU.filter((t) => lista.includes(t));
}

const ROLES = [
  "admin",
  "superadmin",
  "cajero",
  "almacenero",
  "manager",
  "owner",
  "tienda_owner",
  "analista",
  "proveedor",
  "delivery",
  "rol-desconocido",
];

/** Pestañas que un permiso viejo nunca le concede al cajero ni al almacenero. */
const DE_DUENO = ["config", "plata", "plan", "auditoria", "asistente-ia", "ai-command", "colas", "rendimiento"];

describe("MODULE_PERMISSIONS → pestañas reales (O1-K2)", () => {
  it("todo id de MODULE_PERMISSIONS llega a por lo menos una pestaña real del menú", () => {
    const rotos = IDS_USADOS.filter((id) => {
      const tabs = pestanasDelPermiso(id);
      return tabs.length === 0 || tabs.some((t) => !MENU.includes(t));
    });
    expect(rotos).toEqual([]);
  });

  it("la bandera nace apagada: se enciende sólo con el OK de Brandon (decisión 15)", () => {
    expect(ROL_CON_IDS_REALES).toBe(false);
  });

  it.each([
    ["sin listas guardadas", null],
    ["con una lista guardada para el cajero", { cajero: ["pos-caja", "pedidos"] }],
    ["con una lista guardada para el manager", { manager: ["pedidos", "inventario"] }],
    ["con una lista vacía para el almacenero", { almacenero: [] }],
  ] as const)("bandera apagada = el menú de hoy para cada rol (%s)", (_caso, guardadas) => {
    const g = guardadas as Record<string, string[]> | null;
    for (const rol of ROLES) {
      expect(menuCon(tabsDelRol(rol, g)), rol).toEqual(menuDeHoy(rol, g));
    }
  });

  it("hoy el cajero ve 2 de 11 y el almacenero 2 de 12 (lo que corrige la bandera)", () => {
    expect(menuCon(tabsDelRol("cajero", null))).toEqual(["clientes", "pedidos"]);
    expect(menuCon(tabsDelRol("almacenero", null))).toEqual(["compras", "rrhh"]);
  });

  it("bandera encendida: el cajero y el almacenero ven las pestañas reales de sus permisos", () => {
    expect(tabsDelRol("cajero", null, { idsReales: true })).toEqual([
      "vendor-dashboard",
      "ventas-caja",
      "pedidos",
      "clientes",
      "productos",
      "whatsapp-inbox",
      "tareas",
    ]);
    // Sin «clientes»: la lista de clientes es sólo del admin (GET /api/customers
    // → 403 al almacenero); su logística y devoluciones salen del pedido.
    expect(tabsDelRol("almacenero", null, { idsReales: true })).toEqual([
      "vendor-dashboard",
      "inventario",
      "compras",
      "pedidos",
      "productos",
      "tareas",
      "rrhh",
    ]);
  });

  it("bandera encendida: ningún permiso del cajero ni del almacenero concede pestañas de dueño", () => {
    for (const rol of ["cajero", "almacenero"] as const) {
      const tabs = tabsDelRol(rol, null, { idsReales: true }) ?? [];
      expect(tabs.filter((t) => DE_DUENO.includes(t)), rol).toEqual([]);
    }
  });

  it("bandera encendida: los roles sin lista propia siguen viendo todo (la bandera no los toca)", () => {
    for (const rol of ["admin", "superadmin", "manager", "owner", "tienda_owner", "analista", "proveedor", "delivery"]) {
      expect(tabsDelRol(rol, null, { idsReales: true }), rol).toBeNull();
    }
  });

  it("bandera encendida: una lista guardada con ids viejos también se traduce", () => {
    expect(tabsDelRol("cajero", { cajero: ["pos-caja", "pedidos", "pos-caja"] }, { idsReales: true })).toEqual([
      "ventas-caja",
      "pedidos",
    ]);
  });

  const linkImplementado = resolverDestino("pedidos") !== null;
  it.skipIf(!linkImplementado)(
    "el permiso y el link viejo terminan en la misma pestaña, salvo los «≠ link» (resolverDestino de O1-K1a)",
    () => {
      // Se compara la pestaña FINAL de los dos lados: cuando una pestaña se funda
      // en otra (olas 2-4), el permiso y el link siguen llegando al mismo lugar.
      const final = (tab: string) => resolverDestino(tab)?.tab ?? tab;
      const distintos: string[] = [];
      for (const id of IDS_USADOS) {
        const link = resolverDestino(id);
        if (!link) continue;
        if (!pestanasDelPermiso(id).map(final).includes(final(link.tab))) distintos.push(id);
      }
      expect(distintos.sort()).toEqual([...PERMISOS_DISTINTOS_DEL_LINK].sort());
    },
  );
});
