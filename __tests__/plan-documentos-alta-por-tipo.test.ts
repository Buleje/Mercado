/**
 * ADR-517 en el ALTA del plan: las carpetas del formulario «Nuevo plan» se
 * alinean con los papeles del tipo elegido, con la MISMA función que la vista
 * del plan guardado (`alinearConElPlan`). Lo cargado en un casillero «de la
 * norma» se guarda con la etiqueta de su papel y reaparece en ese casillero.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { carpetasDelAlta, loQueFalta, plantillaDeSemilla, type CarpetaVista } from "@/components/admin/forestal/plan-documentos/modelo";
import { avisoFueraDeSuCasillero, fueraDeSuCasillero } from "@/components/admin/forestal/plan-documentos/alta-por-tipo";
import { seEsconde } from "@/components/admin/forestal/plan-documentos/CasillerosDeCarpeta";
import { documentosVacios, guardarDocumentosPendientes, type PendientesDocumentos } from "@/components/admin/forestal/plan-documentos/pendientes";
import { papelDeEtiquetas, papelesDePlan, type PlanParaPapeles } from "@/lib/forestal/loth-plan-papeles";
import { alinearConElPlan, claveCasilleroNorma, papelDeCasilleroNorma } from "@/lib/forestal/plan-documentos-por-tipo";
import { SEMILLA_CARPETAS_PLAN } from "@/lib/forestal/plan-documentos-semilla";
import { TIPO_ARCHIVO, type CarpetaDelPlan, type PlanDocumentosVista } from "@/lib/forestal/plan-documentos-tipos";
import { carpeta, pdf, servidorFalso, vistaDePlan } from "./helpers/plan-documentos-fixtures";

afterEach(() => vi.unstubAllGlobals());

const HOY = "2026-10-26";
const CAS_TITULO = "titulo-de-propiedad-o-constancia-de-pose";
const CAS_RESOLUCION = "resolucion-o-constancia-de-registro";
const plantilla = plantillaDeSemilla(SEMILLA_CARPETAS_PLAN);
const PO: PlanParaPapeles = { planType: "PO", titularName: "QA TITULAR SAC", propietarioNombre: null, vigenciaHasta: "2027-12-31" };
const PLANTACION: PlanParaPapeles = { ...PO, planType: "PLANTACION" };

const casillero = (cs: readonly CarpetaVista[], carpetaClave: string, clave: string) =>
  cs.find((c) => c.clave === carpetaClave)?.casilleros.find((k) => k.clave === clave);
const todas = (cs: readonly CarpetaVista[]) => cs.flatMap((c) => c.casilleros);

describe("carpetasDelAlta con el tipo de plan (ADR-517)", () => {
  it("PO: el contrato de concesión tiene su casillero y el título de propiedad no aplica (escondido)", () => {
    const cs = carpetasDelAlta(plantilla, documentosVacios(), HOY, PO);
    expect(casillero(cs, "titulos", claveCasilleroNorma("titulo"))).toMatchObject({
      nombre: "Contrato de concesión",
      cuenta: "obligatorio",
      porNorma: true,
      papel: "titulo",
      campoId: null,
      estado: "falta",
    });
    const titulo = casillero(cs, "titulos", CAS_TITULO);
    expect(titulo?.cuenta).toBe("no_aplica");
    expect(titulo && seEsconde(titulo, [])).toBe(true);
    expect(casillero(cs, "resolucion", CAS_RESOLUCION)).toMatchObject({ cuenta: "obligatorio", papel: "resolucion" });
    expect(casillero(cs, "resolucion", claveCasilleroNorma("plan-aprobado"))?.cuenta).toBe("obligatorio");
    /* La cuenta del alta es la de «Papeles». */
    expect(loQueFalta(cs).porTipo?.obligatorios).toBe(papelesDePlan(PO, [], HOY).requeridos);
  });

  it("Plantación: los mismos casilleros de la plantilla, ninguno escondido; sin contrato de concesión", () => {
    const sinTipo = carpetasDelAlta(plantilla, documentosVacios(), HOY);
    const cs = carpetasDelAlta(plantilla, documentosVacios(), HOY, PLANTACION);
    expect(casillero(cs, "titulos", claveCasilleroNorma("titulo"))).toBeUndefined();
    expect(casillero(cs, "titulos", CAS_TITULO)).toMatchObject({ cuenta: "obligatorio", papel: "titulo" });
    expect(casillero(cs, "resolucion", CAS_RESOLUCION)).toMatchObject({ cuenta: "obligatorio", papel: "resolucion" });
    expect(todas(cs).filter((k) => k.cuenta === "no_aplica")).toEqual([]);
    /* Todo lo de la plantilla sigue, en su carpeta. */
    for (const c of sinTipo) for (const k of c.casilleros) expect(casillero(cs, c.clave, k.clave)).toBeDefined();
    expect(cs.map((c) => c.clave)).toEqual(sinTipo.map((c) => c.clave));
    expect(loQueFalta(cs).porTipo?.obligatorios).toBe(papelesDePlan(PLANTACION, [], HOY).requeridos);
  });

  it("lo cargado en el casillero del contrato entra ahí; al cambiar a un tipo que no pide el papel, queda en «Otros archivos» con aviso", () => {
    const pend: PendientesDocumentos = {
      ...documentosVacios(),
      archivos: [
        { id: "c1", file: pdf("contrato.pdf"), carpetaClave: "titulos", casillero: { id: null, clave: claveCasilleroNorma("titulo"), nombre: "Contrato de concesión" }, vence: null },
        { id: "p1", file: pdf("po-aprobado.pdf"), carpetaClave: "resolucion", casillero: { id: null, clave: claveCasilleroNorma("plan-aprobado"), nombre: "PO aprobado" }, vence: null },
      ],
    };
    const po = carpetasDelAlta(plantilla, pend, HOY, PO);
    expect(casillero(po, "titulos", claveCasilleroNorma("titulo"))).toMatchObject({ estado: "cargado", archivos: [{ key: "c1", pendiente: true }] });
    expect(casillero(po, "resolucion", claveCasilleroNorma("plan-aprobado"))?.archivos.map((a) => a.key)).toEqual(["p1"]);
    expect(fueraDeSuCasillero(po, pend)).toEqual([]);

    const pl = carpetasDelAlta(plantilla, pend, HOY, PLANTACION);
    /* Plantación no pide «PO aprobado»: suelto en su carpeta, no se pierde. */
    expect(pl.find((c) => c.clave === "resolucion")?.sueltos.map((a) => a.key)).toEqual(["p1"]);
    /* El contrato es el papel «titulo»: en plantación entra al casillero de ese papel. */
    expect(casillero(pl, "titulos", CAS_TITULO)?.archivos.map((a) => a.key)).toEqual(["c1"]);
    const fuera = fueraDeSuCasillero(pl, pend);
    expect(fuera).toEqual([{ archivo: "po-aprobado.pdf", casillero: "PO aprobado", carpeta: "Registro de plantación / Resolución" }]);
    expect(avisoFueraDeSuCasillero(fuera)).toContain("«Otros archivos»");
  });

  it("papelDeCasilleroNorma lee la clave y rechaza lo que no es un papel", () => {
    expect(papelDeCasilleroNorma(claveCasilleroNorma("titulo"))).toBe("titulo");
    expect(papelDeCasilleroNorma("norma-cualquiera")).toBeNull();
    expect(papelDeCasilleroNorma(CAS_TITULO)).toBeNull();
  });
});

// ── Al guardar ───────────────────────────────────────────────────────────────

const PLAN = "plan-qa-po";
const campoTitulo = {
  id: "c-tit",
  formulario: "forestal.plan.documentos.titulos",
  clave: CAS_TITULO,
  nombre: "Título de propiedad o constancia de posesión",
  descripcion: null,
  tipo: TIPO_ARCHIVO,
  opciones: [],
  soloParaRegistroId: null,
  orden: 1,
  activo: true,
};
const titulos = (): CarpetaDelPlan =>
  carpeta({ clave: "titulos", nombre: "Títulos de propiedad", folderId: "f-tit", orden: 3, casilleros: [{ campo: campoTitulo, estado: "falta", archivos: [], venceEl: null }] });

/** Lo que devuelve «preparar» de un PO recién creado: la vista ya alineada por el servidor. */
function vistaPO(alineada: boolean): PlanDocumentosVista {
  const v = vistaDePlan(PLAN, true, [titulos()]);
  return alineada ? { ...v, carpetas: alinearConElPlan(v.carpetas, PO, HOY) } : v;
}

const altaPO = (): PendientesDocumentos => ({
  ...documentosVacios(),
  archivos: [
    { id: "c1", file: pdf("contrato.pdf"), carpetaClave: "titulos", casillero: { id: null, clave: claveCasilleroNorma("titulo"), nombre: "Contrato de concesión" }, vence: null },
    { id: "r1", file: pdf("resolucion.pdf"), carpetaClave: "resolucion", casillero: { id: null, clave: CAS_RESOLUCION, nombre: "Resolución o constancia de registro" }, vence: null },
  ],
});

function servidorPO(alineada: boolean) {
  return servidorFalso(PLAN, (l) =>
    l.ruta.startsWith("/api/admin/forestal/plan/documentos/preparar") ? { json: { vista: vistaPO(alineada) } } : undefined,
  );
}

const carpetaDe = (srv: ReturnType<typeof servidorFalso>, nombre: string) =>
  (
    srv.de("POST", "/api/admin/documents").find((l) => l.ruta === "/api/admin/documents" && ((l.cuerpo as FormData).get("file") as File).name === nombre)
      ?.cuerpo as FormData
  ).get("folderId");

describe("guardarDocumentosPendientes — un PO con su contrato de concesión", () => {
  it("el archivo del casillero «de la norma» sube a su carpeta con la etiqueta del papel y reaparece en ese casillero", async () => {
    const srv = servidorPO(true);
    vi.stubGlobal("fetch", srv.fetchMock);

    const r = await guardarDocumentosPendientes(PLAN, altaPO());
    expect(r.errores).toEqual([]);
    expect(r.subidos).toBe(2);
    expect(carpetaDe(srv, "contrato.pdf")).toBe("f-tit");

    const patches = srv.de("PATCH", "/api/admin/documents/").map((l) => ({ id: l.ruta.split("/").pop(), ...(l.cuerpo as { tags?: string[] }) }));
    const contrato = patches.find((p) => p.tags?.includes("papel:titulo"));
    /* Sin `campo:` (el casillero no existe en la base): sólo el papel. */
    expect(contrato?.tags).toEqual(["pdf", "papel:titulo"]);
    /* El casillero de la plantilla que representa un papel suma las dos, como al subir con el plan guardado. */
    expect(patches.map((p) => p.tags)).toContainEqual(["pdf", "campo:c-res", "papel:resolucion"]);

    /* Lo que va a leer la pestaña Papeles: el suelto con esa etiqueta entra al casillero del contrato. */
    const despues = titulos();
    despues.sueltos = [
      { documentId: String(contrato?.id), nombre: "contrato.pdf", mimeType: "application/pdf", size: 1, expiresAt: null, uploadedAt: "2026-10-26T12:00:00Z", campoId: null, papel: papelDeEtiquetas(contrato?.tags) },
    ];
    const vista = alinearConElPlan([...vistaDePlan(PLAN, true).carpetas, despues], PO, HOY);
    const norma = vista.find((c) => c.clave === "titulos")?.casilleros.find((k) => k.campo.clave === claveCasilleroNorma("titulo"));
    expect(norma?.archivos.map((a) => a.nombre)).toEqual(["contrato.pdf"]);
    expect(norma?.estado).toBe("cargado");
  });

  it("si el plan guardado no tiene ese casillero, el archivo va suelto a su carpeta con la etiqueta: no se pierde ni da error", async () => {
    const srv = servidorPO(false);
    vi.stubGlobal("fetch", srv.fetchMock);

    const r = await guardarDocumentosPendientes(PLAN, altaPO());
    expect(r.errores).toEqual([]);
    expect(r.restante.archivos).toEqual([]);
    expect(carpetaDe(srv, "contrato.pdf")).toBe("f-tit");
    const tags = srv.de("PATCH", "/api/admin/documents/").map((l) => (l.cuerpo as { tags?: string[] }).tags);
    expect(tags).toContainEqual(["pdf", "papel:titulo"]);
    /* Sin vista alineada, la resolución sólo lleva su casillero (lo de antes de ADR-517). */
    expect(tags).toContainEqual(["pdf", "campo:c-res"]);
  });
});
