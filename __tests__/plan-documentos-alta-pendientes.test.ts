import { describe, it, expect, afterEach, vi } from "vitest";
import {
  documentosVacios,
  guardarDocumentosPendientes,
  hayDocumentosPendientes,
  type PendientesDocumentos,
} from "@/components/admin/forestal/plan-documentos/pendientes";
import { carpetasDelAlta, loQueFalta, plantillaDeSemilla } from "@/components/admin/forestal/plan-documentos/modelo";
import { SEMILLA_CARPETAS_PLAN } from "@/lib/forestal/plan-documentos-semilla";
import { foto, pdf, servidorFalso } from "./helpers/plan-documentos-fixtures";

/**
 * «Documentos del plan» (ADR-467) — el alta: todo queda en memoria hasta que el
 * plan tiene id, y al guardar se escribe en orden (preparar → carpetas →
 * casilleros → subir → etiqueta + vencimiento). Lo que falla queda para
 * reintentar SIN duplicar lo que ya entró.
 */

afterEach(() => vi.unstubAllGlobals());

const PLAN = "plan-qa-1";

/** Resolución en PDF + DNI en foto con vencimiento, como los carga el alta. */
function altaConDosArchivos(): PendientesDocumentos {
  return {
    ...documentosVacios(),
    archivos: [
      { id: "a1", file: pdf(), carpetaClave: "resolucion", casillero: { id: null, clave: "resolucion-o-constancia-de-registro", nombre: "Resolución o constancia de registro" }, vence: null },
      { id: "a2", file: foto(), carpetaClave: "jefe", casillero: { id: null, clave: "dni-del-jefe-o-representante", nombre: "DNI del jefe o representante" }, vence: "2027-03-01" },
    ],
  };
}

describe("guardarDocumentosPendientes — el alta con archivos pendientes", () => {
  it("prepara, sube cada archivo a SU carpeta y le pone la etiqueta del casillero y el vencimiento", async () => {
    const srv = servidorFalso(PLAN);
    vi.stubGlobal("fetch", srv.fetchMock);

    const r = await guardarDocumentosPendientes(PLAN, altaConDosArchivos());

    expect(r.errores).toEqual([]);
    expect(r.subidos).toBe(2);
    expect(hayDocumentosPendientes(r.restante)).toBe(false);
    expect(srv.de("POST", "/api/admin/forestal/plan/documentos/preparar")).toHaveLength(1);

    const subidas = srv.de("POST", "/api/admin/documents").filter((l) => l.ruta === "/api/admin/documents");
    const carpetaDe = (nombre: string) =>
      (subidas.find((l) => ((l.cuerpo as FormData).get("file") as File).name === nombre)?.cuerpo as FormData).get("folderId");
    expect(carpetaDe("resolucion.pdf")).toBe("f-res");
    expect(carpetaDe("dni.jpg")).toBe("f-jefe");

    /* La etiqueta se SUMA a la que puso la subida (el PATCH reemplaza la lista). */
    const patches = srv.de("PATCH", "/api/admin/documents/").map((l) => l.cuerpo as { tags?: string[]; expiresAt?: string | null });
    expect(patches).toContainEqual({ tags: ["pdf", "campo:c-res"] });
    expect(patches).toContainEqual({ tags: ["imagen", "campo:c-dni"], expiresAt: "2027-03-01T00:00:00.000Z" });
  });

  it("si un archivo no sube, dice cuál y el reintento manda SÓLO ése", async () => {
    let falla = true;
    const srv = servidorFalso(PLAN, (l) => {
      const f = l.cuerpo instanceof FormData ? (l.cuerpo.get("file") as File) : null;
      if (falla && f?.name === "dni.jpg") return { status: 413, json: { error: "too_large" } };
      return undefined;
    });
    vi.stubGlobal("fetch", srv.fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const r1 = await guardarDocumentosPendientes(PLAN, altaConDosArchivos());
    expect(r1.subidos).toBe(1);
    expect(r1.errores).toEqual(["dni.jpg: pesa más de lo permitido"]);
    expect(r1.restante.archivos.map((a) => a.file.name)).toEqual(["dni.jpg"]);

    falla = false;
    const antes = srv.de("POST", "/api/admin/documents").filter((l) => l.ruta === "/api/admin/documents").length;
    const r2 = await guardarDocumentosPendientes(PLAN, r1.restante);
    const despues = srv.de("POST", "/api/admin/documents").filter((l) => l.ruta === "/api/admin/documents").length;
    expect(r2.errores).toEqual([]);
    expect(despues - antes).toBe(1);
    expect(hayDocumentosPendientes(r2.restante)).toBe(false);
  });

  it("si subió pero no se pudo etiquetar, el reintento sólo etiqueta (no lo sube dos veces)", async () => {
    let fallaPatch = true;
    const srv = servidorFalso(PLAN, (l) => (fallaPatch && l.metodo === "PATCH" ? { status: 500, json: { error: "internal_error" } } : undefined));
    vi.stubGlobal("fetch", srv.fetchMock);
    const soloResolucion = { ...altaConDosArchivos(), archivos: altaConDosArchivos().archivos.slice(0, 1) };

    const r1 = await guardarDocumentosPendientes(PLAN, soloResolucion);
    expect(r1.restante.archivos[0].documentId).toBe("doc-1");

    fallaPatch = false;
    const subidasAntes = srv.de("POST", "/api/admin/documents").filter((l) => l.ruta === "/api/admin/documents").length;
    const r2 = await guardarDocumentosPendientes(PLAN, r1.restante);
    expect(r2.errores).toEqual([]);
    expect(srv.de("POST", "/api/admin/documents").filter((l) => l.ruta === "/api/admin/documents").length).toBe(subidasAntes);
    // Con las etiquetas que puso la subida: el PATCH del Drive reemplaza la lista entera.
    expect(srv.de("PATCH", "/api/admin/documents/doc-1").at(-1)?.cuerpo).toEqual({ tags: ["pdf", "campo:c-res"] });
  });

  it("una carpeta y un casillero inventados en el alta se crean ANTES de subir lo que va en ellos", async () => {
    const srv = servidorFalso(PLAN);
    vi.stubGlobal("fetch", srv.fetchMock);
    const pend: PendientesDocumentos = {
      ...documentosVacios(),
      carpetas: [{ clave: "nueva-1", nombre: "Contratos", paraTodosLosPlanes: false }],
      casilleros: [{ clave: "doc-1", carpetaClave: "nueva-1", nombre: "Contrato", descripcion: "", soloEstePlan: true }],
      archivos: [{ id: "a1", file: pdf("contrato.pdf"), carpetaClave: "nueva-1", casillero: { id: null, clave: "doc-1", nombre: "Contrato" }, vence: null }],
    };

    const r = await guardarDocumentosPendientes(PLAN, pend);

    expect(r.errores).toEqual([]);
    const orden = srv.llamadas.map((l) => `${l.metodo} ${l.ruta.split("?")[0]}`).filter((x) => !x.includes("velocidad"));
    expect(orden.indexOf("POST /api/admin/forestal/plan/documentos/carpetas")).toBeLessThan(orden.indexOf("POST /api/admin/campos-personalizados"));
    expect(orden.indexOf("POST /api/admin/campos-personalizados")).toBeLessThan(orden.indexOf("POST /api/admin/documents"));
    /* El casillero va a la carpeta con la clave REAL, y sólo para este plan. */
    expect(srv.de("POST", "/api/admin/campos-personalizados")[0].cuerpo).toMatchObject({
      formulario: "forestal.plan.documentos.contratos",
      tipo: "archivo",
      soloParaRegistroId: PLAN,
    });
    const subida = srv.de("POST", "/api/admin/documents").find((l) => l.ruta === "/api/admin/documents")?.cuerpo as FormData;
    expect(subida.get("folderId")).toBe("f-contratos");
    expect(srv.de("PATCH", "/api/admin/documents/")[0].cuerpo).toEqual({ tags: ["pdf", "campo:c-nuevo"] });
  });

  it("sin nada cargado no toca el servidor (ni prepara carpetas vacías)", async () => {
    const srv = servidorFalso(PLAN);
    vi.stubGlobal("fetch", srv.fetchMock);
    const r = await guardarDocumentosPendientes(PLAN, documentosVacios());
    expect(r.errores).toEqual([]);
    expect(srv.llamadas).toHaveLength(0);
  });
});

describe("lo que se ve en el alta — plantilla sugerida + lo cargado", () => {
  it("un archivo pendiente cuenta como cargado; uno vencido dice vencido", () => {
    const plantilla = plantillaDeSemilla(SEMILLA_CARPETAS_PLAN);
    const pend = altaConDosArchivos();
    pend.archivos[1] = { ...pend.archivos[1], vence: "2020-01-01" };
    const carpetas = carpetasDelAlta(plantilla, pend, "2026-09-29");
    const r = loQueFalta(carpetas);
    // 1 + 3 + 1 casilleros de la semilla; «Otros» no espera ninguno.
    expect(r.esperados).toBe(5);
    expect(r.vencidos).toBe(1);
    // Vencido también está cargado (hay que renovarlo, no buscarlo): misma cuenta que el servidor.
    expect(r.cargados).toBe(2);
    expect(r.faltan).toBe(3);
    // Primero lo que pide acción.
    expect(r.chips[0]).toMatchObject({ nombre: "DNI del jefe o representante", estado: "vencido", porSubir: true });
  });
});
