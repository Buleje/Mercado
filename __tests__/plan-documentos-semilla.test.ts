/**
 * Documentos del plan de manejo (ADR-467) — la semilla y el armado de la vista,
 * sin base.
 *
 * Lo que se prueba es lo que la pantalla muestra como «lo que falta»: qué
 * casillero está en falta, cargado, por vencer o vencido, qué archivo queda
 * suelto, y que el nombre de la carpeta en el Drive nunca pase de 80 (la
 * trampa de `createFolderTree`) ni deje una etiqueta de más de 40.
 */
import { describe, expect, it } from "vitest";
import {
  armarCarpetas,
  claveDeCarpeta,
  claveDeCarpetaSuelta,
  filasDeSemilla,
  folderIdDeClaveSuelta,
  nombreCarpetaDelPlan,
  nombreCarpetaDesambiguada,
  resumirCarpetas,
  rutaPropuestaDelPlan,
  SEMILLA_CARPETAS_PLAN,
  type CampoArchivoFila,
  type DocumentoFila,
} from "@/lib/forestal/plan-documentos-semilla";
import { FORMULARIO_CARPETAS_PLAN, formularioDeCarpeta, tagCarpetaPlan } from "@/lib/forestal/plan-documentos-tipos";

describe("la semilla", () => {
  const filas = filasDeSemilla();

  it("siembra las cuatro carpetas del pedido, en orden, como tipo carpeta", () => {
    const carpetas = filas.filter((f) => f.formulario === FORMULARIO_CARPETAS_PLAN);
    expect(carpetas.map((c) => [c.clave, c.tipo, c.orden])).toEqual([
      ["resolucion", "carpeta", 1],
      ["jefe", "carpeta", 2],
      ["titulos", "carpeta", 3],
      ["otros", "carpeta", 4],
    ]);
  });

  it("los documentos esperados son `archivo` y van antes que los campos de texto", () => {
    const jefe = filas.filter((f) => f.formulario === formularioDeCarpeta("jefe"));
    expect(jefe.map((f) => [f.nombre, f.tipo, f.orden])).toEqual([
      ["DNI del jefe o representante", "archivo", 1],
      ["Acta de elección o asamblea", "archivo", 2],
      ["Vigencia de poder", "archivo", 3],
      ["Cargo", "texto", 4],
    ]);
    // El N° y la fecha de la resolución NO se piden: ya viven en el plan.
    expect(filas.filter((f) => f.formulario === formularioDeCarpeta("resolucion")).map((f) => f.tipo)).toEqual(["archivo"]);
  });

  it("toda clave de la semilla cabe en su etiqueta de máquina (≤40)", () => {
    for (const c of SEMILLA_CARPETAS_PLAN) expect(tagCarpetaPlan(c.clave).length).toBeLessThanOrEqual(40);
    for (const f of filas) expect(f.clave).toMatch(/^[a-z0-9-]{1,40}$/);
  });
});

describe("dónde queda la carpeta del plan", () => {
  const plan = {
    id: "cmuamvvnu00018tvz1owuk0h0",
    planType: "PLANTACION",
    planNumber: "19-SEC/REG-PLT-2025-096",
    resolucionNumber: null,
    titularName: "CCNN SAN LUIS DE CHINCHIGUANI",
  };

  it("Libro TH / titular / N° — la `/` del N° no abre otra carpeta", () => {
    expect(rutaPropuestaDelPlan(plan)).toEqual(["Libro TH", "CCNN SAN LUIS DE CHINCHIGUANI", "19-SEC-REG-PLT-2025-096"]);
  });

  it("un titular de 120 letras queda en 80: el mismo nombre que guarda el Drive", () => {
    const largo = { ...plan, titularName: "COMUNIDAD NATIVA ".repeat(8) };
    const [, titular] = rutaPropuestaDelPlan(largo);
    expect(titular.length).toBeLessThanOrEqual(80);
    // Dos llamadas, mismo nombre: sin esto la carpeta se duplicaba en cada subida.
    expect(rutaPropuestaDelPlan(largo)[1]).toBe(titular);
  });

  it("sin N° usa el de la resolución, y sin ninguno el tipo + el final del id (nunca vacío)", () => {
    expect(nombreCarpetaDelPlan({ ...plan, planNumber: null, resolucionNumber: "RDF N° 045-2026" })).toBe("RDF N° 045-2026");
    expect(nombreCarpetaDelPlan({ ...plan, planNumber: " ", resolucionNumber: null })).toBe(
      `PLANTACION sin número ${plan.id.slice(-6)}`,
    );
  });

  it("la variante para un plan con el mismo N° conserva el sufijo aunque el N° sea largo", () => {
    const largo = { ...plan, planNumber: "X".repeat(120) };
    const d = nombreCarpetaDesambiguada(largo);
    expect(d.length).toBeLessThanOrEqual(80);
    expect(d.endsWith(plan.id.slice(-6))).toBe(true);
  });

  it("la clave de una carpeta nueva no pasa de 27 (la etiqueta queda en ≤40)", () => {
    const clave = claveDeCarpeta("Contratos de compraventa de madera con terceros");
    expect(clave.length).toBeLessThanOrEqual(27);
    expect(clave.endsWith("-")).toBe(false);
    expect(tagCarpetaPlan(clave).length).toBeLessThanOrEqual(40);
  });

  it("la clave de una carpeta suelta ida y vuelta", () => {
    expect(folderIdDeClaveSuelta(claveDeCarpetaSuelta("cmf1"))).toBe("cmf1");
    expect(folderIdDeClaveSuelta("jefe")).toBeNull();
  });
});

describe("lo que falta (armado de la vista)", () => {
  const HOY = "2026-09-29";
  const campo = (id: string, clave: string, nombre: string, orden: number, soloPara: string | null = null): CampoArchivoFila => ({
    id,
    formulario: formularioDeCarpeta(clave),
    clave: id,
    nombre,
    descripcion: null,
    tipo: "archivo",
    opciones: [],
    soloParaRegistroId: soloPara,
    orden,
    activo: true,
  });
  const doc = (id: string, folderId: string, tags: string[], expiresAt: string | null): DocumentoFila => ({
    id,
    name: `${id}.pdf`,
    mimeType: "application/pdf",
    size: 1000,
    expiresAt: expiresAt ? new Date(`${expiresAt}T00:00:00.000Z`) : null,
    uploadedAt: new Date("2026-09-20T15:00:00.000Z"),
    folderId,
    tags,
  });

  const entrada = {
    planId: "plan-1",
    hoy: HOY,
    plantilla: [
      { id: "t-res", clave: "resolucion", nombre: "Registro de plantación / Resolución", soloParaRegistroId: null, orden: 1 },
      { id: "t-jefe", clave: "jefe", nombre: "Jefe / representante (DNI, actas, poderes)", soloParaRegistroId: null, orden: 2 },
      { id: "t-tit", clave: "titulos", nombre: "Títulos de propiedad", soloParaRegistroId: null, orden: 3 },
    ],
    camposArchivo: [
      campo("c-res", "resolucion", "Resolución", 1),
      campo("c-dni", "jefe", "DNI del jefe", 1),
      campo("c-acta", "jefe", "Acta de elección", 2),
      campo("c-poder", "jefe", "Vigencia de poder", 3),
      campo("c-tit", "titulos", "Título de propiedad", 1),
    ],
    carpetasDrive: [
      { id: "f-res", name: "Registro de plantación - Resolución", tags: [tagCarpetaPlan("resolucion")] },
      { id: "f-jefe", name: "Papeles del apu", tags: [tagCarpetaPlan("jefe")] },
      { id: "f-mano", name: "Fotos del predio", tags: [] },
    ],
    documentos: [
      doc("d-res", "f-res", ["campo:c-res"], "2026-09-28"), // vencido ayer
      doc("d-dni", "f-jefe", ["campo:c-dni", "pdf"], "2026-10-10"), // vence en 11 días
      doc("d-poder", "f-jefe", ["campo:c-poder"], "2027-06-01"), // lejos
      doc("d-suelto", "f-jefe", ["pdf"], null),
      doc("d-otro-campo", "f-jefe", ["campo:c-tit"], null), // casillero de OTRA carpeta: suelto acá
      doc("d-foto", "f-mano", [], null),
    ],
    subcarpetasPorCarpeta: new Map([["f-mano", 2]]),
  };

  const carpetas = armarCarpetas(entrada);
  const casillero = (id: string) => carpetas.flatMap((c) => c.casilleros).find((x) => x.campo.id === id);

  it("cada casillero con su estado: vencido, vence pronto, cargado y falta", () => {
    expect(casillero("c-res")?.estado).toBe("vencido");
    expect(casillero("c-dni")?.estado).toBe("vence_pronto");
    expect(casillero("c-dni")?.venceEl).toBe("2026-10-10T00:00:00.000Z");
    expect(casillero("c-poder")?.estado).toBe("cargado");
    expect(casillero("c-acta")?.estado).toBe("falta");
    // La carpeta de títulos no existe todavía en el Drive: su casillero falta.
    expect(casillero("c-tit")?.estado).toBe("falta");
  });

  it("el resumen cuenta por casillero; un vencido está CARGADO (hay que renovarlo, no buscarlo)", () => {
    expect(resumirCarpetas(carpetas)).toEqual({ esperados: 5, cargados: 3, faltan: 2, vencenPronto: 1, vencidos: 1 });
  });

  it("un archivo sin casillero —o con el de otra carpeta— queda suelto en su carpeta", () => {
    const jefe = carpetas.find((c) => c.clave === "jefe");
    expect(jefe?.sueltos.map((s) => s.documentId).sort()).toEqual(["d-otro-campo", "d-suelto"]);
    expect(jefe?.sueltos.every((s) => s.campoId === null)).toBe(true);
  });

  it("manda el nombre del Drive si lo renombraron; si no, el de la plantilla con su `/`", () => {
    expect(carpetas.find((c) => c.clave === "jefe")?.nombre).toBe("Papeles del apu");
    expect(carpetas.find((c) => c.clave === "resolucion")?.nombre).toBe("Registro de plantación / Resolución");
  });

  it("una carpeta hecha a mano en el Drive se ve, sin plantilla y con su subcarpetas contadas", () => {
    const mano = carpetas.find((c) => c.folderId === "f-mano");
    expect(mano).toMatchObject({ plantillaId: null, clave: "carpeta-f-mano", subcarpetas: 2 });
    expect(mano?.sueltos.map((s) => s.documentId)).toEqual(["d-foto"]);
  });

  it("la carpeta de la plantilla que falta en el Drive va con folderId null", () => {
    expect(carpetas.find((c) => c.clave === "titulos")).toMatchObject({ folderId: null, plantillaId: "t-tit" });
  });
});
