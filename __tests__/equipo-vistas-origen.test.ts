/**
 * Equipo (`?tab=rrhh`) suma Tareas y Notas (plan «panel unificado», ola 2):
 * cada una se ofrece sólo a quien antes veía la pestaña `tareas` (regla R2: el
 * origen, nunca el destino). Notas vivía dentro de esa misma pestaña (el hub
 * viejo registraba `tareas: [tareas, notas]` sin origen) y `notas` nunca fue
 * una pestaña de la barra, así que su origen también es `tareas`.
 *
 * Sin el `origen` en `lib/admin/subvistas-modulos.ts`, Tareas y Notas heredan
 * el permiso de RRHH: se le regalan a cualquiera que vea Equipo.
 *
 * Ejecutar: npx vitest run __tests__/equipo-vistas-origen.test.ts
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

/** Las vistas que monta `RecursosHumanosHubModule` (su `TODAS_LAS_VISTAS`). */
const DEL_HUB = ["asistencia", "personal", "ganado", "contratos", "puestos", "tareas", "notas"];

const registro = () => vistasDelModulo("rrhh");
/** Lo mismo que hace `useVistasPermitidas`: la vista sin registrar hereda el permiso del hub. */
const delHub = () => {
  const porClave = new Map(registro().map((v) => [v.key, v] as const));
  return DEL_HUB.map((key) => ({ key, origen: origenesDeVista("rrhh", porClave.get(key) ?? {}) }));
};
const claves = (ctx: ContextoPermiso) => vistasVisibles(ctx, "rrhh", delHub()).map((v) => v.key);
const conRol = (...ids: string[]): ContextoPermiso => ({ ...SIN_FILTRO, rol: new Set(ids) });

describe("Equipo › Tareas y Notas — permiso por origen (R2)", () => {
  it("el registro de Equipo trae Tareas y Notas con origen en la pestaña tareas", () => {
    const porClave = new Map(registro().map((v) => [v.key, v] as const));
    expect(porClave.get("tareas")?.origen).toEqual(["tareas"]);
    // `notas` también: era su tab alias (`?tab=notas` → Equipo › Notas) y la
    // vista adonde lleva un alias tiene que nombrarlo (admin-subvistas-sincronizadas).
    // No regala nada: `notas` y `tareas` van juntas en el plan y ningún rol ni
    // la plantilla las separa.
    expect(porClave.get("notas")?.origen).toEqual(["tareas", "notas"]);
  });

  it("un rol que ve RRHH pero no Tareas no ve Tareas ni Notas", () => {
    const ve = claves(conRol("rrhh"));
    expect(ve).toContain("asistencia");
    expect(ve).not.toContain("tareas");
    expect(ve).not.toContain("notas");
  });

  it("un rol con las dos pestañas ve Tareas y Notas dentro de Equipo", () => {
    expect(claves(conRol("rrhh", "tareas"))).toEqual(expect.arrayContaining(["asistencia", "tareas", "notas"]));
  });

  it("un rol con Tareas y sin RRHH ve Equipo en la barra, sólo con esas dos vistas", () => {
    expect(estadoDePestana(conRol("tareas"), "rrhh")).toBe("visible");
    expect(claves(conRol("tareas")).sort()).toEqual(["notas", "tareas"]);
  });

  it("el plan Básico ve Equipo › Tareas y Notas (las tenía como pestaña)", () => {
    const ctx: ContextoPermiso = { ...SIN_FILTRO, plan: idsDelPlan("basico") };
    expect(claves(ctx)).toEqual(expect.arrayContaining(["tareas", "notas"]));
  });

  it("mientras el rol no se confirma, Equipo sólo ofrece lo suyo", () => {
    const propias = vistasPropias("rrhh", delHub()).map((v) => v.key);
    expect(propias).toContain("asistencia");
    expect(propias).not.toContain("tareas");
    expect(propias).not.toContain("notas");
  });

  it("el buscador no ofrece Tareas dos veces: la pestaña vieja ya no registra vistas", () => {
    // GlobalSearch arma sus destinos con VISTAS_POR_MODULO entero.
    expect(Object.hasOwn(VISTAS_POR_MODULO, "tareas")).toBe(false);
  });
});
