/**
 * Accesos rápidos de la cabecera (10-10): un acceso sólo aparece si las mismas
 * capas de la barra lateral (rol, plan, especialización) dejan ver su pestaña y
 * su vista, y lleva a un destino que el panel conoce.
 */
import { describe, expect, it } from "vitest";
import {
  ACCESOS,
  ANCLADOS_POR_DEFECTO,
  accesoPermitido,
  hrefDelAcceso,
} from "@/components/admin/header/accesos-rapidos";
import { SIN_FILTRO, idsDelPlan, idsDelRol, type ContextoPermiso } from "@/lib/admin/permiso-vista";
import { resolverDestino } from "@/lib/admin/destino-tab";
import { vistasDelModulo } from "@/lib/admin/subvistas-modulos";

const ids = (ctx: ContextoPermiso | null) =>
  ACCESOS.filter((a) => accesoPermitido(ctx, a)).map((a) => a.id);

describe("accesos rápidos: permiso", () => {
  it("con el rol sin confirmar no se ofrece nada", () => {
    expect(ids(null)).toEqual([]);
  });

  it("el admin sin candados ve los ocho", () => {
    expect(ids(SIN_FILTRO)).toHaveLength(ACCESOS.length);
  });

  it("el plan manda: en Pro no hay Cámaras", () => {
    expect(ids({ ...SIN_FILTRO, plan: idsDelPlan("pro") })).not.toContain("camaras");
  });

  it("sin la especialización forestal no aparece Ingresos de madera", () => {
    expect(ids({ ...SIN_FILTRO, especialidades: new Set<string>() })).not.toContain(
      "ingresos-madera",
    );
  });

  it("el rol manda: el almacenero ve Asistencia y no la Caja (lo mismo que su barra)", () => {
    const almacenero = ids({ ...SIN_FILTRO, rol: idsDelRol("almacenero") });
    expect(almacenero).toContain("asistencia");
    expect(almacenero).not.toContain("caja");
  });
});

describe("accesos rápidos: destinos", () => {
  it.each(ACCESOS.map((a) => [a.id, a] as const))(
    "%s lleva a una pestaña y vista que existen",
    (_id, a) => {
      expect(resolverDestino(a.tab)?.tab).toBe(a.tab);
      if (a.vista) expect(vistasDelModulo(a.tab).map((v) => v.key)).toContain(a.vista);
      expect(hrefDelAcceso(a)).toMatch(/^\/admin\?tab=/);
    },
  );

  it("los anclados por defecto son los medidos: Cámaras, Archivos, Asistencia y Caja", () => {
    expect(ANCLADOS_POR_DEFECTO).toEqual(["camaras", "archivos", "asistencia", "caja"]);
  });
});
