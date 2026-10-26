/**
 * El nombre de las carpetas de la semilla según el tipo de plan (ADR-517):
 * sólo en pantalla, con el real en `nombreEnDocumentos`; si el negocio la
 * renombró (plantilla o Drive), manda el suyo. Plan guardado y alta.
 */
import { describe, expect, it } from "vitest";
import { carpetasDelAlta, carpetasDelServidor, plantillaDeSemilla } from "@/components/admin/forestal/plan-documentos/modelo";
import { documentosVacios } from "@/components/admin/forestal/plan-documentos/pendientes";
import { destinoDelPapel } from "@/components/admin/forestal/plan-papeles/papeles-grupos";
import { archivosDeVista, papelesDePlan, type PlanParaPapeles } from "@/lib/forestal/loth-plan-papeles";
import { alinearConElPlan, nombreDeCarpetaParaElTipo, nombreDeCarpetaPorTipo } from "@/lib/forestal/plan-documentos-por-tipo";
import { SEMILLA_CARPETAS_PLAN, armarCarpetas, filasDeSemilla } from "@/lib/forestal/plan-documentos-semilla";
import { FORMULARIO_CARPETAS_PLAN, TIPO_ARCHIVO, tagCarpetaPlan, type CarpetaDelPlan } from "@/lib/forestal/plan-documentos-tipos";

const HOY = "2026-10-26";
const RESOLUCION = "Registro de plantación / Resolución";
const TITULOS = "Títulos de propiedad";
const filas = filasDeSemilla();
const plantillaFilas = filas
  .filter((f) => f.formulario === FORMULARIO_CARPETAS_PLAN)
  .map((f) => ({ id: `t-${f.clave}`, clave: f.clave, nombre: f.nombre, soloParaRegistroId: null, orden: f.orden }));
const camposArchivo = filas
  .filter((f) => f.tipo === TIPO_ARCHIVO)
  .map((f) => ({
    id: `c-${f.clave}`.slice(0, 40),
    formulario: f.formulario,
    clave: f.clave,
    nombre: f.nombre,
    descripcion: f.descripcion,
    tipo: TIPO_ARCHIVO,
    opciones: [],
    soloParaRegistroId: null,
    orden: f.orden,
    activo: true,
  }));

const plan = (planType: string): PlanParaPapeles => ({ planType, titularName: "QA TITULAR SAC", propietarioNombre: null, vigenciaHasta: "2027-12-31" });

/** El plan guardado, como lo arma `ForestPlanDocumentosDB.vista()`. */
function guardado(planType: string, renombrar: { plantilla?: Record<string, string>; drive?: Record<string, string> } = {}) {
  const plantilla = plantillaFilas.map((t) => ({ ...t, nombre: renombrar.plantilla?.[t.clave] ?? t.nombre }));
  const armadas = armarCarpetas({
    planId: "plan-1",
    hoy: HOY,
    plantilla,
    camposArchivo,
    carpetasDrive: plantilla.map((t) => ({ id: `f-${t.clave}`, name: renombrar.drive?.[t.clave] ?? t.nombre.replace(/\//g, "-"), tags: [tagCarpetaPlan(t.clave)] })),
    documentos: [],
    subcarpetasPorCarpeta: new Map(),
  });
  return alinearConElPlan(armadas, plan(planType), HOY);
}
const de = (cs: readonly Pick<CarpetaDelPlan, "clave" | "nombre" | "nombreEnDocumentos">[], clave: string) => {
  const c = cs.find((x) => x.clave === clave);
  return { nombre: c?.nombre, nombreEnDocumentos: c?.nombreEnDocumentos };
};

describe("nombre de las carpetas por tipo de plan (plan guardado)", () => {
  it.each([
    ["PO", "Resolución y PO aprobado", "Contrato de concesión"],
    ["PGMF", "Resolución y PGMF aprobado", "Contrato de concesión"],
    ["PMFI", "Resolución y PMFI aprobado", "Título del predio"],
    ["DEMA", "Resolución y DEMA aprobado", "Título de la comunidad"],
  ])("%s: «%s» y «%s», con el nombre de Documentos al lado", (tipo, resolucion, titulos) => {
    const cs = guardado(tipo);
    expect(de(cs, "resolucion")).toEqual({ nombre: resolucion, nombreEnDocumentos: RESOLUCION });
    expect(de(cs, "titulos")).toEqual({ nombre: titulos, nombreEnDocumentos: TITULOS });
    /* Las otras carpetas no cambian. */
    expect(de(cs, "jefe").nombreEnDocumentos).toBeUndefined();
    expect(de(cs, "otros")).toEqual({ nombre: "Otros", nombreEnDocumentos: undefined });
  });

  it("Plantación: los nombres de siempre, sin nombre aparte", () => {
    const cs = guardado("PLANTACION");
    expect(de(cs, "resolucion")).toEqual({ nombre: RESOLUCION, nombreEnDocumentos: undefined });
    expect(de(cs, "titulos")).toEqual({ nombre: TITULOS, nombreEnDocumentos: undefined });
    expect(cs.every((c) => c.nombreEnDocumentos === undefined)).toBe(true);
  });

  it("Carpeta renombrada por el negocio en su plantilla: manda la suya", () => {
    const cs = guardado("PO", { plantilla: { resolucion: "Resoluciones ARFFS" } });
    expect(de(cs, "resolucion")).toEqual({ nombre: "Resoluciones ARFFS", nombreEnDocumentos: undefined });
    expect(de(cs, "titulos").nombre).toBe("Contrato de concesión");
  });

  it("Carpeta renombrada en el Drive: manda la del Drive", () => {
    const cs = guardado("PO", { drive: { titulos: "Contratos firmados" } });
    expect(de(cs, "titulos")).toEqual({ nombre: "Contratos firmados", nombreEnDocumentos: undefined });
  });

  it("«se guarda en …» usa el nombre del tipo: PO aprobado → Resolución y PO aprobado", () => {
    const cs = guardado("PO");
    const vista = carpetasDelServidor(cs);
    const papeles = papelesDePlan(plan("PO"), archivosDeVista({ carpetas: cs }), HOY).lista;
    const destino = (clave: string) => {
      const p = papeles.find((x) => x.clave === clave);
      return p ? destinoDelPapel(p, vista)?.carpeta.nombre : undefined;
    };
    expect(destino("plan-aprobado")).toBe("Resolución y PO aprobado");
    expect(destino("titulo")).toBe("Contrato de concesión");
    expect(vista.find((c) => c.clave === "titulos")?.nombreEnDocumentos).toBe(TITULOS);
  });

  it("Realinear no pierde el nombre real: PO → plantación vuelve al de siempre", () => {
    const po = guardado("PO");
    expect(de(alinearConElPlan(po, plan("PO"), HOY), "titulos")).toEqual({ nombre: "Contrato de concesión", nombreEnDocumentos: TITULOS });
    expect(de(alinearConElPlan(po, plan("PLANTACION"), HOY), "titulos")).toEqual({ nombre: TITULOS, nombreEnDocumentos: undefined });
  });

  it("no toca la entrada ni carpetas fuera de la semilla", () => {
    const entrada = { clave: "contratos-qa-ui", nombre: "Contratos QA-UI" };
    expect(nombreDeCarpetaPorTipo(entrada, "PO")).toEqual({ nombre: "Contratos QA-UI" });
    expect(nombreDeCarpetaParaElTipo("jefe", "PO")).toBeNull();
    expect(nombreDeCarpetaParaElTipo("titulos", "PLANTACION")).toBeNull();
  });
});

describe("nombre de las carpetas por tipo de plan (alta)", () => {
  const plantilla = plantillaDeSemilla(SEMILLA_CARPETAS_PLAN);
  it("PO: el alta ya muestra «Contrato de concesión» y «Resolución y PO aprobado»", () => {
    const cs = carpetasDelAlta(plantilla, documentosVacios(), HOY, plan("PO"));
    expect(de(cs, "titulos")).toEqual({ nombre: "Contrato de concesión", nombreEnDocumentos: TITULOS });
    expect(de(cs, "resolucion")).toEqual({ nombre: "Resolución y PO aprobado", nombreEnDocumentos: RESOLUCION });
  });
  it("Plantación y sin tipo: la plantilla tal cual", () => {
    for (const cs of [carpetasDelAlta(plantilla, documentosVacios(), HOY, plan("PLANTACION")), carpetasDelAlta(plantilla, documentosVacios(), HOY)]) {
      expect(de(cs, "titulos")).toEqual({ nombre: TITULOS, nombreEnDocumentos: undefined });
      expect(de(cs, "resolucion")).toEqual({ nombre: RESOLUCION, nombreEnDocumentos: undefined });
    }
  });
});
