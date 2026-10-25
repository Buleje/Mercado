/**
 * Papeles del permiso (`loth-plan-papeles`): qué pide cada tipo de plan, qué
 * cuenta como presente y cuándo un papel está vencido.
 */
import { describe, expect, it } from "vitest";
import {
  archivosDeVista,
  esTierraComunal,
  papelDeEtiquetas,
  papelesDePlan,
  papelesDeTipo,
  resumenParaSemaforo,
  tagPapel,
  textoCuenta,
  type ArchivoParaPapel,
} from "@/lib/forestal/loth-plan-papeles";
import type { PlanDocumentosVista } from "@/lib/forestal/plan-documentos-tipos";
import { semaforoDelPlan } from "@/lib/forestal/loth-plan-semaforo";

const HOY = "2026-10-24";
const SEM = { planType: "PLANTACION", estado: "vigente", vigenciaHasta: "2027-06-30", hoy: new Date("2026-10-24T05:00:00Z") };

const archivo = (p: Partial<ArchivoParaPapel>): ArchivoParaPapel => ({
  documentId: p.documentId ?? "d1",
  nombre: p.nombre ?? "x.pdf",
  mimeType: "application/pdf",
  expiresAt: null,
  uploadedAt: "2026-01-01T00:00:00Z",
  papel: null,
  casillero: null,
  carpeta: "otros",
  ...p,
});

/** El plan 096 de Blas: plantación inscrita a nombre de la comunidad nativa. */
const PLAN_096 = {
  planType: "PLANTACION",
  titularName: "COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI",
  propietarioNombre: null,
  vigenciaHasta: null,
};

describe("papelesDeTipo", () => {
  it("plantación comunal: certificado, título, mapa y acta van siempre; regente no aplica", () => {
    const l = papelesDeTipo(PLAN_096, HOY);
    expect(l.filter((p) => p.exigencia === "siempre").map((p) => p.clave)).toEqual(["resolucion", "titulo", "mapa", "comunidad"]);
    expect(l.some((p) => p.clave === "regente")).toBe(false);
    expect(l.find((p) => p.clave === "gtf")?.subible).toBe(false);
  });

  it("plantación de un privado sin comunidad: sin acta; autorización de uso sólo si el dueño es otro", () => {
    const solo = papelesDeTipo({ planType: "PLANTACION", titularName: "Juan Pérez" }, HOY);
    expect(solo.some((p) => p.clave === "comunidad")).toBe(false);
    expect(solo.find((p) => p.clave === "autorizacion-uso")?.exigencia).toBe("segun_caso");
    const otro = papelesDeTipo({ planType: "PLANTACION", titularName: "Juan Pérez", propietarioNombre: "Rosa Díaz" }, HOY);
    expect(otro.find((p) => p.clave === "autorizacion-uso")?.exigencia).toBe("siempre");
  });

  it("PO de concesión: contrato, resolución, PO aprobado y regente obligatorio", () => {
    const l = papelesDeTipo({ planType: "PO", titularName: "Maderera SAC", vigenciaHasta: "2027-06-30" }, HOY);
    expect(l.filter((p) => p.exigencia === "siempre").map((p) => p.clave)).toEqual(["titulo", "resolucion", "plan-aprobado", "regente"]);
    expect(l.find((p) => p.clave === "titulo")?.nombre).toBe("Contrato de concesión");
    expect(l.find((p) => p.clave === "plan-aprobado")?.nombre).toBe("PO aprobado");
    /* El año operativo sigue corriendo: el informe todavía no se pide. */
    expect(l.find((p) => p.clave === "informe")?.exigencia).toBe("segun_caso");
  });

  it("DEMA: título y acta de la comunidad; regente según el caso", () => {
    const l = papelesDeTipo({ planType: "DEMA", titularName: "CC.NN. Shipibo" }, HOY);
    expect(l.filter((p) => p.exigencia === "siempre").map((p) => p.clave)).toEqual(["titulo", "resolucion", "plan-aprobado", "comunidad"]);
    expect(l.find((p) => p.clave === "regente")?.exigencia).toBe("segun_caso");
    expect(l.find((p) => p.clave === "titulo")?.nombre).toBe("Título de la comunidad");
  });

  it("terminado el año operativo, el informe de ejecución va siempre con su plazo de 45 días", () => {
    const l = papelesDeTipo({ planType: "PMFI", titularName: "Fundo X", vigenciaHasta: "2026-09-30" }, HOY);
    const inf = l.find((p) => p.clave === "informe");
    expect(inf?.exigencia).toBe("siempre");
    expect(inf?.plazo).toBe("2026-11-14");
  });

  it("cada papel cita su fuente", () => {
    for (const tipo of ["PGMF", "PO", "PMFI", "DEMA", "PLANTACION"]) {
      for (const p of papelesDeTipo({ planType: tipo }, HOY)) expect(p.fuente.length).toBeGreaterThan(10);
    }
  });
});

describe("esTierraComunal", () => {
  it("reconoce las formas en que se escribe una comunidad", () => {
    expect(esTierraComunal("COMUNIDAD NATIVA SAN LUIS")).toBe(true);
    expect(esTierraComunal("Comunidad Campesina de Huayllay")).toBe(true);
    expect(esTierraComunal("CC.NN. Puerto Nuevo")).toBe(true);
    expect(esTierraComunal("C.N. Santa Rosa")).toBe(true);
    expect(esTierraComunal(null, "Maderera Comunidad SAC")).toBe(false);
    expect(esTierraComunal("Juan Pérez")).toBe(false);
  });
});

describe("papelesDePlan", () => {
  it("el plan 096 con su certificado y su título en los casilleros de la plantilla = 2 de 4", () => {
    const r = papelesDePlan(
      PLAN_096,
      [
        archivo({ documentId: "reg", nombre: "Registro de Plantacion.pdf", casillero: "resolucion-o-constancia-de-registro", carpeta: "resolucion" }),
        archivo({ documentId: "tit", nombre: "Titulo de chinchiguani.pdf", casillero: "titulo-de-propiedad-o-constancia-de-pose", carpeta: "titulos" }),
      ],
      HOY,
    );
    expect(textoCuenta(r)).toBe("2 de 4 papeles");
    expect(resumenParaSemaforo(r)).toEqual({
      requeridos: 4,
      presentes: 2,
      vencidos: [],
      faltan: ["Mapa o croquis de ubicación", "Acta de asamblea o contrato con la comunidad"],
    });
    expect(r.faltan).toEqual(["Mapa o croquis de ubicación", "Acta de asamblea o contrato con la comunidad"]);
    expect(r.lista.find((p) => p.clave === "resolucion")?.archivo?.documentId).toBe("reg");
  });

  it("la etiqueta papel: gana sobre el casillero y un archivo suelto con etiqueta cuenta", () => {
    const r = papelesDePlan(PLAN_096, [archivo({ documentId: "m", papel: "mapa" })], HOY);
    expect(r.lista.find((p) => p.clave === "mapa")?.estado).toBe("presente");
    expect(r.presentes).toBe(1);
  });

  it("vencido y por vencer salen del expiresAt; el más lejano respalda el papel", () => {
    const r = papelesDePlan(
      PLAN_096,
      [
        archivo({ documentId: "viejo", papel: "comunidad", expiresAt: "2026-03-01T12:00:00Z" }),
        archivo({ documentId: "nuevo", papel: "comunidad", expiresAt: "2026-11-10T12:00:00Z" }),
        archivo({ documentId: "mapa", papel: "mapa", expiresAt: "2026-01-01T00:00:00Z" }),
      ],
      HOY,
    );
    const acta = r.lista.find((p) => p.clave === "comunidad");
    expect(acta?.estado).toBe("vence_pronto");
    expect(acta?.archivo?.documentId).toBe("nuevo");
    expect(acta?.cuantos).toBe(2);
    expect(r.lista.find((p) => p.clave === "mapa")?.estado).toBe("vencido");
    expect(r.vencidos).toBe(1);
    expect(r.presentes).toBe(1);
  });

  it("un «si aplica» subido y vencido cuenta como vencido, pero no como requerido", () => {
    const base = papelesDePlan(PLAN_096, [], HOY);
    const r = papelesDePlan(PLAN_096, [archivo({ documentId: "poder", papel: "representante", expiresAt: "2026-02-01T00:00:00Z" })], HOY);
    expect(r.lista.find((p) => p.clave === "representante")?.estado).toBe("vencido");
    expect(r.vencidos).toBe(1);
    expect(r.requeridos).toBe(base.requeridos);
  });

  it("la resolución sin fecha propia vence con el plan, y se dice que es derivada", () => {
    const r = papelesDePlan(
      { planType: "PO", titularName: "X", vigenciaHasta: "2026-11-01" },
      [archivo({ papel: "resolucion" })],
      HOY,
    );
    const res = r.lista.find((p) => p.clave === "resolucion");
    expect(res?.vence).toBe("2026-11-01");
    expect(res?.venceDerivado).toBe(true);
    expect(res?.estado).toBe("vence_pronto");
  });

  it("un informe que falta pasado su plazo está vencido", () => {
    const r = papelesDePlan({ planType: "PO", titularName: "X", vigenciaHasta: "2026-08-01" }, [], HOY);
    const inf = r.lista.find((p) => p.clave === "informe");
    expect(inf?.estado).toBe("vencido");
    expect(inf?.vence).toBe("2026-09-15");
  });

  it("al semáforo: obligatorio vencido → vencidos; obligatorio que falta → faltan; «si aplica» → ninguno", () => {
    const base = papelesDePlan(PLAN_096, [], HOY);
    const todos = base.lista.filter((p) => p.exigencia === "siempre").map((p) => archivo({ documentId: p.clave, papel: p.clave }));
    // Los 4 obligatorios y el poder del representante («si aplica») sin subir: verde.
    const completo = resumenParaSemaforo(papelesDePlan(PLAN_096, todos, HOY));
    expect(completo).toMatchObject({ requeridos: 4, presentes: 4, vencidos: [], faltan: [] });
    expect(semaforoDelPlan({ ...SEM, papeles: completo }).color).toBe("verde");
    // Un «si aplica» subido y vencido tampoco pone rojo: el rojo es de los obligatorios.
    const poderViejo = archivo({ documentId: "poder", papel: "representante", expiresAt: "2026-02-01T00:00:00Z" });
    expect(resumenParaSemaforo(papelesDePlan(PLAN_096, [...todos, poderViejo], HOY)).vencidos).toEqual([]);
    // El mapa vencido: rojo con su nombre.
    const conMapaViejo = todos.map((a) => (a.papel === "mapa" ? { ...a, expiresAt: "2026-01-01T00:00:00Z" } : a));
    const r = resumenParaSemaforo(papelesDePlan(PLAN_096, conMapaViejo, HOY));
    expect(r.vencidos).toEqual(["Mapa o croquis de ubicación"]);
    expect(semaforoDelPlan({ ...SEM, papeles: r })).toMatchObject({ color: "rojo" });
  });

  it("lo que es según el caso no entra en la cuenta", () => {
    const r = papelesDePlan(PLAN_096, [], HOY);
    expect(r.lista.find((p) => p.clave === "representante")?.estado).toBe("segun_caso");
    expect(r.requeridos).toBe(4);
  });
});

describe("etiquetas y vista", () => {
  it("papel: ida y vuelta, y una clave desconocida no cuenta", () => {
    expect(papelDeEtiquetas(["plan:x", tagPapel("mapa")])).toBe("mapa");
    expect(papelDeEtiquetas(["papel:cualquiera"])).toBeNull();
    expect(papelDeEtiquetas(null)).toBeNull();
  });

  it("archivosDeVista aplana casilleros y sueltos con su carpeta", () => {
    const a = (id: string, papel: string | null = null) => ({
      documentId: id,
      nombre: `${id}.pdf`,
      mimeType: "application/pdf",
      expiresAt: null,
      uploadedAt: null,
      papel,
    });
    const vista = {
      carpetas: [
        {
          clave: "resolucion",
          casilleros: [{ campo: { clave: "resolucion-o-constancia-de-registro" }, archivos: [a("r")] }],
          sueltos: [a("s", "mapa"), a("z", "inventado")],
        },
      ],
    } as unknown as Pick<PlanDocumentosVista, "carpetas">;
    const l = archivosDeVista(vista);
    expect(l.map((x) => [x.documentId, x.casillero, x.papel, x.carpeta])).toEqual([
      ["r", "resolucion-o-constancia-de-registro", null, "resolucion"],
      ["s", null, "mapa", "resolucion"],
      ["z", null, null, "resolucion"],
    ]);
  });
});
