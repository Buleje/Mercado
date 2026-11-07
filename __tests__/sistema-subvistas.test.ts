/**
 * Configuración › Sistema (plan «panel unificado», ola 2): qué sub-vistas ve
 * cada quien según el ORIGEN de cada una (regla R2) y cómo llegan los ids viejos.
 *
 * Ejecutar: npx vitest run __tests__/sistema-subvistas.test.ts
 */
import { describe, expect, it } from "vitest";
import { SIN_FILTRO, idsDelPlan, type ContextoPermiso } from "@/lib/admin/permiso-vista";
import { subvistaDeIdViejo, subvistasVisibles } from "@/components/admin/sistema/subvistas-sistema";

const ids = (ctx: ContextoPermiso | null, conPreferencias: boolean) =>
  subvistasVisibles(ctx, conPreferencias).map((s) => s.id);

const conPlan = (tier: "basico" | "max"): ContextoPermiso => ({ ...SIN_FILTRO, plan: idsDelPlan(tier) });

describe("subvistasVisibles", () => {
  it("sin rol confirmado sólo ofrece lo que ya era de Configuración", () => {
    expect(ids(null, true)).toEqual(["preferencias"]);
    expect(ids(null, false)).toEqual([]);
  });

  it("el plan Max ve las siete, en orden", () => {
    expect(ids(conPlan("max"), true)).toEqual([
      "preferencias", "velocidad", "historial", "salud", "soporte", "actividad", "colas",
    ]);
  });

  it("el plan Básico ve sólo Preferencias en Configuración (rendimiento, auditoría y colas son Max)", () => {
    expect(ids(conPlan("basico"), true)).toEqual(["preferencias"]);
  });

  it("en el hub suelto, si no pasa ninguna, van todas (como antes: el candado está en la API)", () => {
    expect(ids(conPlan("basico"), false)).toEqual([
      "velocidad", "historial", "salud", "soporte", "actividad", "colas",
    ]);
  });

  it("la plantilla que oculta auditoría la saca aunque el plan la tenga", () => {
    const ctx: ContextoPermiso = { ...conPlan("max"), plantilla: (id) => id === "auditoria" };
    expect(ids(ctx, true)).not.toContain("actividad");
    expect(ids(ctx, true)).toContain("velocidad");
  });
});

describe("subvistaDeIdViejo", () => {
  it("los ids que abrían el hub caen en su sub-vista", () => {
    expect(subvistaDeIdViejo("rendimiento")).toBe("velocidad");
    expect(subvistaDeIdViejo("auditoria")).toBe("actividad");
    expect(subvistaDeIdViejo("colas")).toBe("colas");
  });

  it("un nombre de hoy pasa tal cual y lo desconocido no se inventa", () => {
    expect(subvistaDeIdViejo("salud")).toBe("salud");
    expect(subvistaDeIdViejo("constructor")).toBeUndefined();
    expect(subvistaDeIdViejo(undefined)).toBeUndefined();
  });
});
