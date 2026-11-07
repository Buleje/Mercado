/**
 * Contenido mudado con su origen (19-10, «juntar pestañas gemelas»).
 *
 * Marketplace › Reseñas pasó a Clientes › Opiniones (sección Moderar) y
 * Marketplace › Fidelidad a la ficha de Campañas › Puntos. Las dos vistas
 * llevan `origen: [<la suya>, "marketplace"]` para que quien tenía Marketplace
 * no las pierda (regla R2). Efecto: con la plantilla global, que oculta
 * Clientes y deja Marketplace, la pestaña Clientes se abre por Opiniones. Eso
 * vale sólo si el hub filtra sus vistas: sin `useVistasPermitidas`, un plan
 * Enterprise veía Mis clientes, Interesados, Mapa y Mensajes masivos, que su
 * plantilla escondía (revisión 19-10).
 *
 * Este test arma plan × rol × rubro con la plantilla global (la de
 * `reports/panel/visibilidad-antes.json`) y exige que donde la pestaña estaba
 * oculta ANTES de la mudanza (las mismas vistas sin «marketplace» en su
 * origen) hoy se abra sólo por Marketplace y sólo con lo que vino de ahí.
 *
 * Ejecutar: npx vitest run __tests__/permiso-origen-mudado.test.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SPEC_GATED_MODULE_IDS } from "@/hooks/use-enabled-specs";
import type { AdminTemplateOverrides } from "@/lib/admin-template";
import {
  estadoDelOrigen,
  idsDelPlan,
  idsDelRol,
  ocultaPorPlantilla,
  origenesDeVista,
  pestanaPermitida,
  rubroDelPanel,
  vistaPermitida,
  vistasVisibles,
  type ContextoPermiso,
} from "@/lib/admin/permiso-vista";
import { origenDeSeccion, vistasDelModulo } from "@/lib/admin/subvistas-modulos";
import type { PlanTier } from "@/lib/billing/plan-tiers";
import { PLANES, ROLES, RUTA_ANTES } from "../scripts/matriz-pestanas.mjs";

const RAIZ = join(__dirname, "..");
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), "utf8");
const antes = JSON.parse(leer(RUTA_ANTES)) as {
  dimensiones: { rubros: string[] };
  plantillas: Record<string, AdminTemplateOverrides>;
};

/** Plan × rol × rubro con la plantilla global, como filtra un hub por dentro. */
const CONTEXTOS: ReadonlyArray<{ donde: string; ctx: ContextoPermiso }> = (() => {
  const plantilla = ocultaPorPlantilla(antes.plantillas.global);
  const out: Array<{ donde: string; ctx: ContextoPermiso }> = [];
  for (const plan of PLANES as PlanTier[]) {
    for (const rol of ROLES) {
      for (const rubro of antes.dimensiones.rubros) {
        out.push({
          donde: `${plan}·${rol}·${rubro}`,
          ctx: {
            rol: idsDelRol(rol, null),
            plan: idsDelPlan(plan),
            plantilla,
            rubro: rubroDelPanel(rubro),
            especialidades: SPEC_GATED_MODULE_IDS,
            modoFacil: null,
          },
        });
      }
    }
  }
  return out;
})();

const MUDADAS = [
  { tab: "clientes", archivo: "components/admin/unified/CRMClientesModule.tsx", recibidas: ["resenas"] },
  { tab: "campanas", archivo: "components/admin/unified/CrecimientoHubModule.tsx", recibidas: ["puntos"] },
] as const;

const veMarketplace = (ctx: ContextoPermiso) => estadoDelOrigen(ctx, "marketplace") === "visible";

describe("contenido mudado de Marketplace: nadie gana el resto del hub", () => {
  for (const { tab, recibidas } of MUDADAS) {
    it(`${tab}: donde estaba oculta, se abre sólo por Marketplace y sólo con ${recibidas.join(", ")}`, () => {
      const vistas = vistasDelModulo(tab);
      // Las mismas vistas antes de la mudanza: sin «marketplace» en el origen.
      const vistasAntes = vistas.map((v) => ({ ...v, origen: v.origen?.filter((o) => o !== "marketplace") }));
      const errores: string[] = [];
      let abiertasPorLaMudanza = 0;
      for (const { donde, ctx } of CONTEXTOS) {
        const seVeiaAntes = vistasAntes.some((v) => vistaPermitida(ctx, origenesDeVista(tab, v)));
        if (seVeiaAntes || !pestanaPermitida(ctx, tab)) continue;
        abiertasPorLaMudanza++;
        if (!veMarketplace(ctx)) errores.push(`${donde}: se abre sin Marketplace`);
        const visibles = vistasVisibles(ctx, tab, vistas).map((v) => v.key);
        const deMas = visibles.filter((k) => !(recibidas as readonly string[]).includes(k));
        if (deMas.length > 0) errores.push(`${donde}: muestra ${deMas.join(", ")}`);
      }
      expect(errores.slice(0, 10), `${errores.length} contextos con vistas de más`).toEqual([]);
      // Sin ningún caso, el test no estaría mirando lo que la revisión encontró.
      if (tab === "clientes") expect(abiertasPorLaMudanza).toBeGreaterThan(0);
    });
  }

  for (const { tab, archivo } of MUDADAS) {
    it(`${tab}: el hub filtra sus vistas con el registro de la pestaña`, () => {
      const src = leer(archivo);
      const arg = src.match(/useVistasPermitidas\(\s*([^,\s]+)\s*,/)?.[1];
      expect(arg, `${archivo} no llama a useVistasPermitidas`).toBeTruthy();
      const modulo = arg!.startsWith('"') ? JSON.parse(arg!) : src.match(new RegExp(`const ${arg} = "([^"]+)"`))?.[1];
      expect(modulo).toBe(tab);
    });
  }

  it("Moderar conserva el candado de Marketplace: no lo gana quien sólo ve Opiniones", () => {
    const origen = origenDeSeccion("clientes", "resenas", "moderar");
    expect(origen).toEqual(["marketplace"]);
    let soloOpiniones = 0;
    // También sin plantilla (un negocio cuya plantilla muestra Clientes): ahí
    // está el plan Pro sin Marketplace y el cajero que la revisión encontró.
    const conYSinPlantilla = CONTEXTOS.flatMap(({ donde, ctx }) => [
      { donde: `${donde}·global`, ctx },
      { donde: `${donde}·sin plantilla`, ctx: { ...ctx, plantilla: null } },
    ]);
    for (const { donde, ctx } of conYSinPlantilla) {
      const veModerar = vistaPermitida(ctx, origen);
      expect(veModerar, donde).toBe(veMarketplace(ctx));
      if (!veModerar && pestanaPermitida(ctx, "clientes")) soloOpiniones++;
    }
    // Hay contextos (plan sin Marketplace, cajero) que ven Opiniones sin Moderar.
    expect(soloOpiniones).toBeGreaterThan(0);
  });
});
