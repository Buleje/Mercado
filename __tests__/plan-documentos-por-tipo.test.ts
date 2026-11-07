/**
 * ADR-517 — las carpetas del plan alineadas con los papeles de SU tipo de plan.
 * Con la plantilla sugerida tal como la sembró el negocio (la de main y Blas):
 * qué casillero pide cada tipo, qué cuenta, y que la cuenta de las carpetas sea
 * la de los papeles.
 */
import { describe, expect, it } from "vitest";
import { archivosDeVista, papelesDePlan, tagPapel, type PlanParaPapeles } from "@/lib/forestal/loth-plan-papeles";
import { alinearConPapeles, claveCasilleroNorma } from "@/lib/forestal/plan-documentos-por-tipo";
import {
  armarCarpetas,
  filasDeSemilla,
  resumirCarpetas,
  type CampoArchivoFila,
  type DocumentoFila,
} from "@/lib/forestal/plan-documentos-semilla";
import { FORMULARIO_CARPETAS_PLAN, TIPO_ARCHIVO, tagCampo, tagCarpetaPlan, type CarpetaDelPlan } from "@/lib/forestal/plan-documentos-tipos";
import { carpetasDelServidor, loQueFalta } from "@/components/admin/forestal/plan-documentos/modelo";
import { destinoDelPapel } from "@/components/admin/forestal/plan-papeles/papeles-grupos";

const HOY = "2026-10-26";
const filas = filasDeSemilla();
const plantilla = filas
  .filter((f) => f.formulario === FORMULARIO_CARPETAS_PLAN)
  .map((f) => ({ id: `t-${f.clave}`, clave: f.clave, nombre: f.nombre, soloParaRegistroId: null, orden: f.orden }));
const semillaArchivos: CampoArchivoFila[] = filas
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
const carpetasDrive = plantilla.map((t) => ({ id: `f-${t.clave}`, name: t.nombre.replace(/\//g, "-"), tags: [tagCarpetaPlan(t.clave)] }));

const CAS_TITULO = "titulo-de-propiedad-o-constancia-de-pose";
const CAS_RESOLUCION = "resolucion-o-constancia-de-registro";
const idDe = (clave: string) => semillaArchivos.find((c) => c.clave === clave)?.id ?? "";

const doc = (id: string, carpeta: string, tags: string[], expiresAt: string | null = null): DocumentoFila => ({
  id,
  name: `${id}.pdf`,
  mimeType: "application/pdf",
  size: 1000,
  expiresAt: expiresAt ? new Date(`${expiresAt}T00:00:00.000Z`) : null,
  uploadedAt: new Date("2026-10-20T15:00:00.000Z"),
  folderId: `f-${carpeta}`,
  tags,
});

/** Lo mismo que hace `ForestPlanDocumentosDB.vista()`: armar, calcular papeles sobre lo armado y alinear. */
function vista(plan: PlanParaPapeles, documentos: DocumentoFila[], extra: CampoArchivoFila[] = []) {
  const armadas = armarCarpetas({
    planId: "plan-1",
    hoy: HOY,
    plantilla,
    camposArchivo: [...semillaArchivos, ...extra],
    carpetasDrive,
    documentos,
    subcarpetasPorCarpeta: new Map(),
  });
  const papeles = papelesDePlan(plan, archivosDeVista({ carpetas: armadas }), HOY);
  const carpetas = alinearConPapeles(armadas, papeles.lista);
  /* La pantalla recalcula los papeles sobre la vista ya alineada: tiene que dar lo mismo. */
  const papelesDespues = papelesDePlan(plan, archivosDeVista({ carpetas }), HOY);
  return { armadas, carpetas, papeles, papelesDespues, resumen: resumirCarpetas(carpetas), falta: loQueFalta(carpetasDelServidor(carpetas)) };
}

const casillero = (carpetas: CarpetaDelPlan[], clave: string) => carpetas.flatMap((c) => c.casilleros).find((k) => k.campo.clave === clave);
const obligatorios = (carpetas: CarpetaDelPlan[]) =>
  carpetas.flatMap((c) => c.casilleros.filter((k) => k.cuenta === "obligatorio").map((k) => `${c.clave}/${k.papel}`)).sort();

describe("PO: el contrato de concesión tiene su casillero y el título de propiedad no cuenta", () => {
  /* PO 12 de main: el contrato subido desde «Papeles» con `papel:titulo`, suelto en Títulos. */
  const po = vista({ planType: "PO", titularName: "FORESTAL QA SAC" }, [doc("contrato", "titulos", ["legal", tagPapel("titulo")])]);

  it("cada papel obligatorio del PO tiene su casillero en su carpeta", () => {
    expect(obligatorios(po.carpetas)).toEqual(["otros/regente", "resolucion/plan-aprobado", "resolucion/resolucion", "titulos/titulo"]);
    const contrato = casillero(po.carpetas, claveCasilleroNorma("titulo"));
    expect(contrato).toMatchObject({ porNorma: true, papel: "titulo", cuenta: "obligatorio", estado: "cargado" });
    expect(contrato?.campo.id).toBe("");
    expect(contrato?.campo.nombre).toBe("Contrato de concesión");
    expect(contrato?.archivos.map((a) => a.documentId)).toEqual(["contrato"]);
    expect(po.carpetas.find((c) => c.clave === "titulos")?.sueltos).toEqual([]);
  });

  it("el título de propiedad de la plantilla queda «no aplica»; DNI, acta y poder «si aplica»", () => {
    expect(casillero(po.carpetas, CAS_TITULO)).toMatchObject({ cuenta: "no_aplica", papel: null });
    for (const k of ["dni-del-jefe-o-representante", "vigencia-de-poder", "acta-de-eleccion-o-asamblea"]) {
      expect(casillero(po.carpetas, k)).toMatchObject({ cuenta: "si_aplica", papel: "representante" });
    }
    expect(casillero(po.carpetas, CAS_RESOLUCION)).toMatchObject({ cuenta: "obligatorio", papel: "resolucion" });
  });

  it("antes: 0 de 5 documentos; ahora: 1 de 4, lo mismo que «Papeles»", () => {
    expect(resumirCarpetas(po.armadas)).toMatchObject({ esperados: 5, cargados: 0, faltan: 5 });
    expect(po.papeles).toMatchObject({ requeridos: 4, presentes: 1 });
    expect(po.resumen).toMatchObject({ esperados: 4, cargados: 1, faltan: 3 });
    expect(po.falta.porTipo).toEqual({ obligatorios: 4, presentes: 1, propios: 0, propiosCargados: 0 });
    expect(po.falta.chips.map((c) => c.nombre)).not.toContain("Título de propiedad o constancia de posesión");
  });

  it("alinear no cambia los papeles: la pantalla los recalcula sobre la vista alineada", () => {
    expect(po.papelesDespues.presentes).toBe(po.papeles.presentes);
    expect(po.papelesDespues.lista.map((p) => p.estado)).toEqual(po.papeles.lista.map((p) => p.estado));
  });

  it("«Subir» desde Papeles cae en el casillero del contrato (sin `campo:`, con su etiqueta `papel:`)", () => {
    const d = destinoDelPapel({ clave: "titulo", carpeta: "titulos", casilleros: [] }, carpetasDelServidor(po.carpetas));
    expect(d?.carpeta.clave).toBe("titulos");
    expect(d?.casillero).toMatchObject({ clave: claveCasilleroNorma("titulo"), campoId: null, papel: "titulo", cuenta: "obligatorio" });
  });

  it("sin el contrato: falta, y el casillero lo dice", () => {
    const vacio = vista({ planType: "PO" }, []);
    expect(casillero(vacio.carpetas, claveCasilleroNorma("titulo"))?.estado).toBe("falta");
    expect(vacio.resumen).toMatchObject({ esperados: 4, cargados: 0, faltan: 4 });
  });
});

describe("PGMF, PMFI y DEMA", () => {
  it("PGMF pide lo mismo que el PO (contrato de concesión en Títulos)", () => {
    const v = vista({ planType: "PGMF" }, []);
    expect(obligatorios(v.carpetas)).toEqual(["otros/regente", "resolucion/plan-aprobado", "resolucion/resolucion", "titulos/titulo"]);
    expect(casillero(v.carpetas, CAS_TITULO)?.cuenta).toBe("no_aplica");
    expect(v.resumen.esperados).toBe(v.papeles.requeridos);
  });

  it("PMFI: el título del predio va al casillero de la plantilla, que sí cuenta", () => {
    const v = vista({ planType: "PMFI" }, [doc("tit", "titulos", [tagCampo(idDe(CAS_TITULO))])]);
    expect(casillero(v.carpetas, CAS_TITULO)).toMatchObject({ cuenta: "obligatorio", papel: "titulo", estado: "cargado" });
    expect(casillero(v.carpetas, claveCasilleroNorma("titulo"))).toBeUndefined();
    expect(obligatorios(v.carpetas)).toEqual(["otros/regente", "resolucion/plan-aprobado", "resolucion/resolucion", "titulos/titulo"]);
    expect(v.resumen).toMatchObject({ esperados: 4, cargados: 1 });
    expect(v.papeles).toMatchObject({ requeridos: 4, presentes: 1 });
  });

  it("DEMA: título de la comunidad + acta con la comunidad (en Jefe); el regente, si aplica", () => {
    const v = vista({ planType: "DEMA", titularName: "COMUNIDAD NATIVA SAN LUIS" }, []);
    expect(obligatorios(v.carpetas)).toEqual(["jefe/comunidad", "resolucion/plan-aprobado", "resolucion/resolucion", "titulos/titulo"]);
    expect(casillero(v.carpetas, claveCasilleroNorma("regente"))).toMatchObject({ cuenta: "si_aplica", estado: "falta" });
    expect(casillero(v.carpetas, "acta-de-eleccion-o-asamblea")?.cuenta).toBe("si_aplica");
    expect(v.resumen.esperados).toBe(v.papeles.requeridos);
  });
});

describe("Plantación (la plantilla se pensó para ella): sigue igual, sin contar lo que es según el caso", () => {
  /* Como 19-SEC/REG-PLT-2025-096 de Blas: comunal, con registro, título y DNI. */
  const plt = vista({ planType: "PLANTACION", titularName: "CCNN SAN LUIS DE CHINCHIGUANI", propietarioNombre: "CCNN SAN LUIS DE CHINCHIGUANI" }, [
    doc("registro", "resolucion", [tagCampo(idDe(CAS_RESOLUCION))]),
    doc("titulo", "titulos", [tagCampo(idDe(CAS_TITULO))]),
    doc("dni", "jefe", [tagCampo(idDe("dni-del-jefe-o-representante"))], "2030-01-31"),
  ]);

  it("los casilleros de la semilla siguen siendo los suyos; sólo se agregan mapa y acta con la comunidad", () => {
    expect(casillero(plt.carpetas, CAS_RESOLUCION)).toMatchObject({ cuenta: "obligatorio", papel: "resolucion", estado: "cargado" });
    expect(casillero(plt.carpetas, CAS_TITULO)).toMatchObject({ cuenta: "obligatorio", papel: "titulo", estado: "cargado" });
    expect(casillero(plt.carpetas, "dni-del-jefe-o-representante")).toMatchObject({ cuenta: "si_aplica", estado: "cargado" });
    expect(obligatorios(plt.carpetas)).toEqual(["jefe/comunidad", "otros/mapa", "resolucion/resolucion", "titulos/titulo"]);
    expect(plt.carpetas.flatMap((c) => c.casilleros).filter((k) => k.cuenta === "no_aplica")).toEqual([]);
  });

  it("antes 3 de 5 (el DNI contaba, el poder faltaba); ahora 2 de 4, lo mismo que «Papeles»", () => {
    expect(resumirCarpetas(plt.armadas)).toMatchObject({ esperados: 5, cargados: 3 });
    expect(plt.papeles).toMatchObject({ requeridos: 4, presentes: 2 });
    expect(plt.resumen).toMatchObject({ esperados: 4, cargados: 2, faltan: 2 });
    expect(plt.falta.porTipo).toMatchObject({ obligatorios: 4, presentes: 2 });
  });

  it("un vencido del «si aplica» que se subió pesa igual (vigencia de poder vencida)", () => {
    const v = vista({ planType: "PLANTACION" }, [doc("poder", "jefe", [tagCampo(idDe("vigencia-de-poder"))], "2026-10-01")]);
    expect(v.resumen.vencidos).toBe(1);
    expect(v.falta.vencidos).toBe(1);
  });
});

describe("lo que el negocio agregó se respeta", () => {
  it("un casillero propio sigue contando, aparte de los obligatorios", () => {
    const propio: CampoArchivoFila = { ...semillaArchivos[0], id: "c-propio", formulario: "forestal.plan.documentos.otros", clave: "permiso-municipal", nombre: "Permiso municipal" };
    const v = vista({ planType: "PO" }, [doc("muni", "otros", [tagCampo("c-propio")])], [propio]);
    expect(casillero(v.carpetas, "permiso-municipal")).toMatchObject({ cuenta: "propio", estado: "cargado" });
    expect(v.resumen).toMatchObject({ esperados: 5, cargados: 1 });
    expect(v.falta.porTipo).toEqual({ obligatorios: 4, presentes: 0, propios: 1, propiosCargados: 1 });
  });

  it("un título de propiedad subido a un PO no se pierde: se ve, «no aplica», sin contar", () => {
    const v = vista({ planType: "PO" }, [doc("tit", "titulos", [tagCampo(idDe(CAS_TITULO))])]);
    expect(casillero(v.carpetas, CAS_TITULO)).toMatchObject({ cuenta: "no_aplica", estado: "cargado" });
    expect(casillero(v.carpetas, CAS_TITULO)?.archivos).toHaveLength(1);
    expect(v.resumen).toMatchObject({ esperados: 4, cargados: 0 });
  });

  it("sin alinear (vista vieja) cuenta todo como antes", () => {
    const v = vista({ planType: "PO" }, []);
    expect(loQueFalta(carpetasDelServidor(v.armadas))).toMatchObject({ esperados: 5, faltan: 5, porTipo: null });
  });

  it("no toca la entrada", () => {
    const v = vista({ planType: "PO" }, [doc("contrato", "titulos", [tagPapel("titulo")])]);
    expect(v.armadas.find((c) => c.clave === "titulos")?.sueltos).toHaveLength(1);
    expect(v.armadas.flatMap((c) => c.casilleros).every((k) => k.cuenta === undefined)).toBe(true);
  });
});
