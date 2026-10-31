/**
 * Administración (`?tab=administracion`, ADR-501) recibe Tareas y Notas, que
 * vivían en Equipo desde la ola 2 del panel unificado (Brandon, 18-10). Cada
 * una se ofrece sólo a quien antes veía la pestaña `tareas` (regla R2: el
 * origen, nunca el destino). Notas vivía dentro de esa misma pestaña y `notas`
 * nunca fue una pestaña de la barra, así que su origen también es `tareas`.
 *
 * Sin el `origen` en `lib/admin/subvistas-modulos.ts`, Tareas y Notas heredan
 * el permiso de Administración: se le regalan a cualquiera que la vea.
 *
 * Reemplaza a `equipo-vistas-origen.test.ts` (las mismas reglas, en su casa nueva).
 *
 * Ejecutar: npx vitest run __tests__/administracion-vistas-origen.test.ts
 */
import { describe, expect, it } from "vitest";
import {
  SIN_FILTRO,
  estadoDePestana,
  idsDelPlan,
  origenesDeVista,
  vistasPropias,
  vistasVisibles,
  type ContextoPermiso,
} from "@/lib/admin/permiso-vista";
import { VISTAS_POR_MODULO, vistasDelModulo } from "@/lib/admin/subvistas-modulos";
import { TAB_MIGRATION, VISTA_MIGRATION } from "@/app/admin/_lib/tab-migration";

/** Las vistas que monta `AdministracionModule` (su `TABS`). */
const DEL_MODULO = ["hoy", "calendario", "actividades", "tareas", "notas", "conectar"];

const registro = () => vistasDelModulo("administracion");
/** Lo mismo que hace `useVistasPermitidas`: la vista sin registrar hereda el permiso del módulo. */
const delModulo = () => {
  const porClave = new Map(registro().map((v) => [v.key, v] as const));
  return DEL_MODULO.map((key) => ({ key, origen: origenesDeVista("administracion", porClave.get(key) ?? {}) }));
};
const claves = (ctx: ContextoPermiso) => vistasVisibles(ctx, "administracion", delModulo()).map((v) => v.key);
const conRol = (...ids: string[]): ContextoPermiso => ({ ...SIN_FILTRO, rol: new Set(ids) });

describe("Administración › Tareas y Notas — permiso por origen (R2)", () => {
  it("el registro trae Tareas y Notas con origen en la pestaña tareas", () => {
    const porClave = new Map(registro().map((v) => [v.key, v] as const));
    expect(porClave.get("tareas")?.origen).toEqual(["tareas"]);
    // `notas` también: es su tab alias (`?tab=notas` → Administración › Notas)
    // y la vista adonde lleva un alias tiene que nombrarlo.
    expect(porClave.get("notas")?.origen).toEqual(["tareas", "notas"]);
  });

  it("un rol que ve Administración pero no Tareas no ve Tareas ni Notas", () => {
    const ve = claves(conRol("administracion"));
    expect(ve).toEqual(expect.arrayContaining(["hoy", "calendario", "actividades", "conectar"]));
    expect(ve).not.toContain("tareas");
    expect(ve).not.toContain("notas");
  });

  it("un rol con las dos pestañas ve Tareas y Notas dentro de Administración", () => {
    expect(claves(conRol("administracion", "tareas"))).toEqual(expect.arrayContaining(["hoy", "tareas", "notas"]));
  });

  it("un rol con Tareas y sin Administración la ve en la barra, sólo con esas dos vistas", () => {
    expect(estadoDePestana(conRol("tareas"), "administracion")).toBe("visible");
    expect(claves(conRol("tareas")).sort()).toEqual(["notas", "tareas"]);
  });

  it("el plan Básico ve Administración entera (tenía Tareas como pestaña)", () => {
    const ctx: ContextoPermiso = { ...SIN_FILTRO, plan: idsDelPlan("basico") };
    expect(claves(ctx)).toEqual(expect.arrayContaining(["hoy", "calendario", "tareas", "notas"]));
  });

  it("mientras el rol no se confirma, Administración sólo ofrece lo suyo", () => {
    const propias = vistasPropias("administracion", delModulo()).map((v) => v.key);
    expect(propias).toContain("hoy");
    expect(propias).not.toContain("tareas");
    expect(propias).not.toContain("notas");
  });

  it("Equipo ya no registra Tareas ni Notas", () => {
    const deEquipo = vistasDelModulo("rrhh").map((v) => v.key);
    expect(deEquipo).not.toContain("tareas");
    expect(deEquipo).not.toContain("notas");
  });

  it("los enlaces viejos llegan a Administración", () => {
    expect(TAB_MIGRATION.tareas).toEqual({ tab: "administracion", vista: "tareas" });
    expect(TAB_MIGRATION.notas).toEqual({ tab: "administracion", vista: "notas" });
    expect(VISTA_MIGRATION["rrhh:tareas"]).toEqual({ tab: "administracion", vista: "tareas" });
    expect(VISTA_MIGRATION["rrhh:notas"]).toEqual({ tab: "administracion", vista: "notas" });
  });

  it("el buscador no ofrece Tareas dos veces: la pestaña vieja no registra vistas", () => {
    // GlobalSearch arma sus destinos con VISTAS_POR_MODULO entero.
    expect(Object.hasOwn(VISTAS_POR_MODULO, "tareas")).toBe(false);
  });
});
