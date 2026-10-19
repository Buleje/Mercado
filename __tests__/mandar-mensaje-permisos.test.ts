/**
 * Crecimiento › Mandar mensaje (19-10): Campañas y Clientes › Mensajes masivos
 * en una vista con dos modos. Plan × rol × rubro, con la plantilla global y sin
 * plantilla, exige que nadie gane ni pierda nada con la mudanza (regla R2):
 *
 *  · «Uno por uno» lo ve quien veía Clientes › Mensajes masivos (origen
 *    `clientes`), y nadie más.
 *  · «Automático» lo ve quien veía Crecimiento › Campañas (origen `campanas`).
 *  · La vista la abre quien tenía cualquiera de las dos; quien no tenía
 *    ninguna no la gana.
 *  · El enlace viejo (`?sub=uno-por-uno`) abre su modo aunque la plantilla
 *    esconda Clientes, pero nunca saltea plan ni rol.
 *
 * Ejecutar: npx vitest run __tests__/mandar-mensaje-permisos.test.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SPEC_GATED_MODULE_IDS } from "@/hooks/use-enabled-specs";
import type { AdminTemplateOverrides } from "@/lib/admin-template";
import {
  idsDelPlan,
  idsDelRol,
  ocultaPorPlantilla,
  origenesDeVista,
  rubroDelPanel,
  vistaPermitida,
  type ContextoPermiso,
} from "@/lib/admin/permiso-vista";
import { origenDeSeccion, vistasDelModulo } from "@/lib/admin/subvistas-modulos";
import type { PlanTier } from "@/lib/billing/plan-tiers";
import { modosPermitidos } from "@/components/admin/mandar-mensaje/use-modos-mandar-mensaje";
import { PLANES, ROLES, RUTA_ANTES } from "../scripts/matriz-pestanas.mjs";

const antes = JSON.parse(readFileSync(join(__dirname, "..", RUTA_ANTES), "utf8")) as {
  dimensiones: { rubros: string[] };
  plantillas: Record<string, AdminTemplateOverrides>;
};

const CONTEXTOS: ReadonlyArray<{ donde: string; ctx: ContextoPermiso }> = (() => {
  const global = ocultaPorPlantilla(antes.plantillas.global);
  const out: Array<{ donde: string; ctx: ContextoPermiso }> = [];
  for (const plan of PLANES as PlanTier[]) {
    for (const rol of ROLES) {
      for (const rubro of antes.dimensiones.rubros) {
        const base = { rol: idsDelRol(rol, null), plan: idsDelPlan(plan), rubro: rubroDelPanel(rubro), especialidades: SPEC_GATED_MODULE_IDS, modoFacil: null };
        out.push({ donde: `${plan}·${rol}·${rubro}·global`, ctx: { ...base, plantilla: global } });
        out.push({ donde: `${plan}·${rol}·${rubro}·sin plantilla`, ctx: { ...base, plantilla: null } });
      }
    }
  }
  return out;
})();

/** Lo que veía antes del 19-10: las dos vistas tenían el origen de su pestaña. */
const veiaMasivos = (ctx: ContextoPermiso) => vistaPermitida(ctx, ["clientes"]);
const veiaCampanas = (ctx: ContextoPermiso) => vistaPermitida(ctx, ["campanas"]);
const vista = vistasDelModulo("campanas").find((v) => v.key === "campanas")!;

describe("Mandar mensaje: cada modo con el permiso de donde vino", () => {
  it("los modos traen el origen de su pantalla vieja", () => {
    expect(origenDeSeccion("campanas", "campanas", "uno-por-uno")).toEqual(["clientes"]);
    expect(origenDeSeccion("campanas", "campanas", "automatico")).toEqual(["campanas"]);
    expect(vistasDelModulo("clientes").some((v) => v.key === "mensajes")).toBe(false);
  });

  it("nadie gana ni pierde un modo (plan × rol × rubro, con y sin plantilla)", () => {
    const errores: string[] = [];
    let soloUno = 0;
    let soloAuto = 0;
    for (const { donde, ctx } of CONTEXTOS) {
      const antesUno = veiaMasivos(ctx);
      const antesAuto = veiaCampanas(ctx);
      const abreVista = vistaPermitida(ctx, origenesDeVista("campanas", vista));
      if (abreVista !== (antesUno || antesAuto)) errores.push(`${donde}: la vista ${abreVista ? "se abre sin" : "no se abre con"} permiso viejo`);
      if (!abreVista) continue;
      const modos = modosPermitidos(ctx, null);
      if (modos.includes("uno-por-uno") !== antesUno) errores.push(`${donde}: uno por uno ${antesUno ? "perdido" : "ganado"}`);
      if (modos.includes("automatico") !== antesAuto) errores.push(`${donde}: automático ${antesAuto ? "perdido" : "ganado"}`);
      if (antesUno && !antesAuto) soloUno++;
      if (antesAuto && !antesUno) soloAuto++;
    }
    expect(errores.slice(0, 10), `${errores.length} contextos`).toEqual([]);
    // Si no hubiera ningún caso de un solo modo, el test no estaría mirando el filtro.
    expect(soloUno + soloAuto).toBeGreaterThan(0);
  });

  it("el enlace viejo abre «Uno por uno» aunque la plantilla esconda Clientes, nunca sin plan ni rol", () => {
    for (const { donde, ctx } of CONTEXTOS) {
      const conElEnlace = modosPermitidos(ctx, "uno-por-uno").includes("uno-por-uno");
      const candados = vistaPermitida({ ...ctx, plantilla: null, rubro: null, modoFacil: null }, ["clientes"]);
      if (!veiaMasivos(ctx) && veiaCampanas(ctx)) {
        expect(conElEnlace, donde).toBe(candados);
      }
    }
  });

  it("bodega · enterprise (Pro) · administrador sin enlace: tiene «Uno por uno» y «Automático» (Campañas para el plan Pro, 19-10)", () => {
    const bodega = CONTEXTOS.find((c) => c.donde === "enterprise·admin·bodega·sin plantilla");
    expect(bodega, "falta el contexto de main").toBeDefined();
    expect(modosPermitidos(bodega!.ctx, null, null)).toEqual(["uno-por-uno", "automatico"]);
  });

  it("bodega · pro (Starter) · administrador: sin Campañas ni «Automático» (el plan manda)", () => {
    const starter = CONTEXTOS.find((c) => c.donde === "pro·admin·bodega·sin plantilla");
    expect(starter, "falta el contexto Starter").toBeDefined();
    expect(vistaPermitida(starter!.ctx, ["campanas"])).toBe(false);
    expect(modosPermitidos(starter!.ctx, null, null)).not.toContain("automatico");
    const basico = CONTEXTOS.find((c) => c.donde === "basico·admin·bodega·sin plantilla");
    expect(basico && vistaPermitida(basico.ctx, ["campanas"])).toBe(false);
  });

  it("maderería · enterprise · administrador: el rubro sigue sin Campañas", () => {
    const m = CONTEXTOS.find((c) => c.donde === "enterprise·admin·maderera·sin plantilla" || c.donde === "enterprise·admin·madereria·sin plantilla");
    expect(m, "falta el contexto de maderería").toBeDefined();
    expect(vistaPermitida(m!.ctx, ["campanas"])).toBe(false);
  });

  // Sólo con un enlace EXPLÍCITO a la vista: la `?vista=` que escribe el hub al
  // montar no llega acá (CrecimientoHubModule la lee antes; ver
  // mandar-mensaje-hub-vista-escrita.test.tsx).
  it("el enlace explícito a la vista sin modo abre «Automático» como abría Campañas, sin saltear plan ni rol", () => {
    let destrabados = 0;
    for (const { donde, ctx } of CONTEXTOS) {
      if (!vistaPermitida(ctx, origenesDeVista("campanas", vista))) continue;
      const modos = modosPermitidos(ctx, null, "campanas");
      const candados = vistaPermitida({ ...ctx, plantilla: null, rubro: null, modoFacil: null }, ["campanas"]);
      expect(modos.includes("automatico"), donde).toBe(veiaCampanas(ctx) || candados);
      // Pedir la vista nunca destraba «Uno por uno»: ese modo lo pide su propio enlace.
      expect(modos.includes("uno-por-uno"), donde).toBe(veiaMasivos(ctx));
      if (!veiaCampanas(ctx) && candados) destrabados++;
    }
    expect(destrabados).toBeGreaterThan(0);
  });

  it("sin ningún modo que pase (llegó por URL), van los dos", () => {
    const nadie: ContextoPermiso = { ...CONTEXTOS[0].ctx, rol: new Set<string>(), plan: new Set<string>() };
    expect(modosPermitidos(nadie, null)).toEqual(["uno-por-uno", "automatico"]);
  });
});
