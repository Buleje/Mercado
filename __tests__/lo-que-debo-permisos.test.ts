import { describe, expect, it } from "vitest";
import { SIN_FILTRO, idsDelPlan, idsDelRol, vistaPermitida, type ContextoPermiso } from "@/lib/admin/permiso-vista";
import { ANIDADAS_POR_MODULO, origenDeSeccion } from "@/lib/admin/subvistas-modulos";
import type { PlanTier } from "@/lib/billing/plan-tiers";
import {
  SECCIONES_LO_QUE_DEBO,
  seccionesVisibles,
} from "@/components/admin/unified/finanzas/por-pagar/secciones-lo-que-debo";
import { PLANES, ROLES } from "../scripts/matriz-pestanas.mjs";

/**
 * Mi Plata › Lo que debo junta «Todo» (adelantos y cuentas a favor de otro) con
 * las secciones que eran Compras › Por pagar. El plan Básico entra a Mi Plata
 * por Activos y nunca tuvo Compras: no puede ver ni pagar cuentas de
 * proveedores, y `/api/payables` no tiene candado de plan (revisión 19-10).
 */
const ctxDe = (rol: string, plan: string): ContextoPermiso => ({
  ...SIN_FILTRO,
  rol: idsDelRol(rol, null),
  plan: idsDelPlan(plan as PlanTier),
});

describe("Lo que debo: cada sección con su permiso", () => {
  it("el dueño en Básico ve «Todo» y ninguna sección de proveedores", () => {
    expect(seccionesVisibles(ctxDe("admin", "basico"))).toEqual(["todo"]);
  });

  it("el dueño en Pro ve las cinco, Conciliación incluida", () => {
    expect(seccionesVisibles(ctxDe("admin", "pro"))).toEqual([...SECCIONES_LO_QUE_DEBO]);
  });

  it("la plantilla no corta secciones; el plan sí", () => {
    // Como en main (19-10): la plantilla esconde Compras, Comprobantes y Mi Plata.
    const plantilla = (id: string) => ["compras", "documentos", "plata"].includes(id);
    expect(seccionesVisibles({ ...ctxDe("admin", "enterprise"), plantilla })).toEqual([...SECCIONES_LO_QUE_DEBO]);
    expect(seccionesVisibles({ ...ctxDe("admin", "basico"), plantilla })).toEqual(["todo"]);
  });

  it("en toda combinación rol × plan, visible ⇔ el origen que declara su anidada", () => {
    const anidadas = (ANIDADAS_POR_MODULO.plata ?? []).filter((a) => a.vista === "por-pagar");
    // Las cinco secciones están declaradas en el registro (si no, origenDeSeccion caería al de la vista).
    expect(anidadas.map((a) => a.key).sort()).toEqual([...SECCIONES_LO_QUE_DEBO].sort());
    for (const rol of ROLES) {
      for (const plan of PLANES) {
        const ctx = ctxDe(rol, plan);
        const visibles = seccionesVisibles(ctx);
        for (const a of anidadas) {
          expect(visibles.includes(a.key as (typeof SECCIONES_LO_QUE_DEBO)[number]), `${rol}/${plan} › ${a.key}`).toBe(
            vistaPermitida(ctx, a.origen ?? []),
          );
        }
      }
    }
  });

  it("origenDeSeccion cae a la vista y después a la pestaña", () => {
    expect(origenDeSeccion("plata", "por-pagar", "conciliacion")).toEqual(["compras", "documentos", "plata"]);
    expect(origenDeSeccion("plata", "por-pagar", "no-existe")).toEqual(["plata", "activos", "compras", "documentos"]);
    expect(origenDeSeccion("no-existe", "x", "y")).toEqual(["no-existe"]);
  });
});
