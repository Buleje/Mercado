/**
 * Trámites y oficios del CTP (ADR-308): catálogo, expediente y documento.
 *
 * Lo que se testea es lo que se presenta ante una autoridad: que el cuerpo del
 * documento diga los datos que se llenaron, que no quede un párrafo colgado por
 * un campo opcional vacío, y que un trámite no pueda declararse "presentado"
 * sin fecha (sin fecha no hay plazo que contar).
 */
import { describe, expect, it } from "vitest";
import {
  asuntoDe,
  cuerpoDe,
  FORMATOS_TRAMITE,
  faltantesDelTramite,
  formatoPorId,
  type DatosTramite,
} from "@/lib/forestal/tramites-catalogo";
import {
  construirTramite,
  contarPorEstado,
  diasDesdePresentacion,
  tramitesSinRespuesta,
  type TramiteRegistro,
} from "@/lib/forestal/tramites-registro";
import { buildTramiteHtml } from "@/lib/forestal/tramites-print";

const FICHA = {
  razonSocial: "Maderera San Martín SAC",
  ruc: "20512345678",
  codigoCtp: "CTP-UCA-001",
  registroArffs: "RA-2024-018",
  region: "Ucayali",
  provincia: "Coronel Portillo",
};

describe("catálogo de formatos", () => {
  it("cada formato declara autoridad, asunto o campo de asunto, base legal y campos", () => {
    for (const f of FORMATOS_TRAMITE) {
      expect(f.id, "id").toBeTruthy();
      expect(f.nombre.length, `nombre de ${f.id}`).toBeGreaterThan(3);
      expect(f.baseLegal.length, `base legal de ${f.id}`).toBeGreaterThan(0);
      expect(f.campos.length, `campos de ${f.id}`).toBeGreaterThan(0);
      // O trae asunto propio, o lo pide como campo (la carta genérica).
      const pideAsunto = f.campos.some((c) => c.id === "asuntoLibre");
      expect(Boolean(f.asunto) || pideAsunto, `asunto de ${f.id}`).toBe(true);
    }
  });

  it("los ids no se repiten (el catálogo se indexa por id)", () => {
    const ids = FORMATOS_TRAMITE.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("todo formato pide quién firma: un oficio sin firmante no se presenta", () => {
    for (const f of FORMATOS_TRAMITE) {
      expect(f.campos.some((c) => c.id === "firmante"), f.id).toBe(true);
    }
  });

  it("faltantesDelTramite lista sólo los requeridos vacíos", () => {
    const f = formatoPorId("visado-talonario-gtf")!;
    expect(faltantesDelTramite(f, {}).map((c) => c.id)).toContain("cantidadTalonarios");
    const completo: DatosTramite = Object.fromEntries(
      f.campos.filter((c) => c.requerido).map((c) => [c.id, "x"]),
    );
    expect(faltantesDelTramite(f, completo)).toEqual([]);
  });
});

describe("cuerpo del documento", () => {
  const f = formatoPorId("visado-talonario-gtf")!;

  it("mete los datos llenados en el texto", () => {
    const parrafos = cuerpoDe(f, {
      cantidadTalonarios: "2",
      guiasPorTalonario: "50",
      serieActual: "001",
      ultimoCorrelativo: "0000121",
      motivo: "se agotó el talonario",
    });
    const texto = parrafos.join(" ");
    expect(texto).toContain("2 talonario(s)");
    expect(texto).toContain("de 50 guías cada uno");
    expect(texto).toContain("serie 001");
    expect(texto).toContain("N° 0000121");
    expect(texto).toContain("se agotó el talonario");
  });

  it("un campo opcional vacío NO deja un párrafo colgado", () => {
    const parrafos = cuerpoDe(f, { cantidadTalonarios: "1" });
    expect(parrafos.every((p) => p.trim().length > 0)).toBe(true);
    // Sin `motivo` cae al texto por defecto, no a una frase incompleta.
    expect(parrafos.join(" ")).toContain("agotamiento del talonario en uso");
  });

  it("la carta genérica parte el cuerpo libre en un párrafo por línea", () => {
    const generica = formatoPorId("carta-generica")!;
    const parrafos = cuerpoDe(generica, { cuerpoLibre: "Primero.\n\nSegundo.", pedido: "atender el pedido" });
    expect(parrafos).toHaveLength(3);
    expect(parrafos[2]).toContain("atender el pedido");
  });

  it("el asunto libre gana sobre el del formato", () => {
    expect(asuntoDe(f, {})).toBe(f.asunto);
    expect(asuntoDe(f, { asuntoLibre: "Otro asunto" })).toBe("Otro asunto");
  });
});

describe("documento imprimible", () => {
  const f = formatoPorId("revision-campo")!;

  it("lleva el membrete del CTP, el destinatario y la base legal", () => {
    const html = buildTramiteHtml({
      formato: f,
      datos: {
        destinatarioCargo: "Director de la DRFFS",
        destinatarioEntidad: "Gobierno Regional de Ucayali",
        firmante: "Luis Buleje",
        firmanteDni: "12345678",
        motivoInspeccion: "registro inicial del CTP",
      },
      ficha: FICHA,
      lugar: "Pucallpa",
    });
    expect(html).toContain("Maderera San Martín SAC");
    expect(html).toContain("CTP-UCA-001");
    expect(html).toContain("RA-2024-018");
    // El cargo va tal como se tipeó; las mayúsculas las pone el CSS al imprimir.
    expect(html).toContain("Director de la DRFFS");
    expect(html).toContain("Gobierno Regional de Ucayali");
    expect(html).toContain("Ley N° 29763");
    expect(html).toContain("Pucallpa");
    expect(html).toContain("DNI 12345678");
  });

  it("escapa el HTML de los datos: un &lt;script&gt; en un campo no se ejecuta", () => {
    const html = buildTramiteHtml({
      formato: formatoPorId("carta-generica")!,
      datos: { cuerpoLibre: '<script>alert("x")</script>', firmante: "Titular" },
      ficha: null,
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("sin ficha igual sale un documento (el operador lo completa a mano)", () => {
    const html = buildTramiteHtml({ formato: f, datos: {}, ficha: null });
    expect(html).toContain(f.nombre);
    expect(html.length).toBeGreaterThan(400);
  });
});

describe("expediente", () => {
  const base = { formatoId: "visado-talonario-gtf", autoridad: "arffs" as const, ahora: "2026-07-29T10:00:00.000Z" };

  it("un estado desconocido cae a borrador, NUNCA a presentado", () => {
    expect(construirTramite({ ...base, estado: "cualquier-cosa" }).estado).toBe("borrador");
  });

  it("presentado sin fecha recibe la de hoy: sin fecha no hay plazo que contar", () => {
    const t = construirTramite({ ...base, estado: "presentado" });
    expect(t.fechaPresentacion).toBe("2026-07-29");
  });

  it("resuelto también fija la fecha de respuesta", () => {
    const t = construirTramite({ ...base, estado: "resuelto" });
    expect(t.fechaRespuesta).toBe("2026-07-29");
  });

  it("un borrador no inventa fechas", () => {
    const t = construirTramite({ ...base, estado: "borrador" });
    expect(t.fechaPresentacion).toBeNull();
    expect(t.fechaRespuesta).toBeNull();
  });

  it("respeta la fecha que puso el operador y descarta una basura", () => {
    expect(construirTramite({ ...base, estado: "presentado", fechaPresentacion: "2026-05-02" }).fechaPresentacion).toBe("2026-05-02");
    expect(construirTramite({ ...base, estado: "borrador", fechaPresentacion: "ayer" }).fechaPresentacion).toBeNull();
  });

  it("acota los datos del formulario (el KV es un JSON compartido)", () => {
    const t = construirTramite({ ...base, datos: { campo: "x".repeat(25_000) } });
    expect(t.datos.campo.length).toBe(20_000);
  });

  it("genera un id estable y legible desde el formato", () => {
    const t = construirTramite(base);
    expect(t.id).toMatch(/^tra-visado-talonario-gtf-\d+$/);
    // Mismo input ⇒ mismo id: el registro es reproducible.
    expect(construirTramite(base).id).toBe(t.id);
  });
});

describe("correlativo (numeroDocumento, ADR-364 ronda 3)", () => {
  const base = { formatoId: "relacion-guias-serfor", autoridad: "serfor" as const, ahora: "2026-08-20T10:00:00.000Z" };

  it("un formato sin `correlativo: true` nunca asigna número", () => {
    const t = construirTramite({ formatoId: "visado-talonario-gtf", autoridad: "arffs", estado: "presentado", ahora: base.ahora });
    expect(t.numeroDocumento).toBeNull();
  });

  it("un borrador no recibe número (se asigna recién al presentar)", () => {
    const t = construirTramite(base);
    expect(t.numeroDocumento).toBeNull();
  });

  it("el primer presentado del año saca 001-2026", () => {
    const t = construirTramite({ ...base, estado: "presentado" });
    expect(t.numeroDocumento).toBe("001-2026");
  });

  it("el siguiente continúa el correlativo, ignorando otros formatos y borradores", () => {
    const existentes = [
      construirTramite({ ...base, id: "a", estado: "presentado" }),
      construirTramite({ formatoId: "visado-talonario-gtf", autoridad: "arffs", estado: "presentado", ahora: base.ahora, id: "b" }),
      construirTramite({ ...base, id: "c", estado: "borrador" }),
    ];
    const t = construirTramite({ ...base, estado: "presentado" }, existentes);
    expect(t.numeroDocumento).toBe("002-2026");
  });

  it("un número YA asignado nunca se reasigna, ni volviendo a presentado", () => {
    const existentes = [construirTramite({ ...base, id: "a", estado: "presentado" })];
    // El caller (ForestTramitesDB.save) preserva numeroDocumento del existente.
    const t = construirTramite({ ...base, id: "a", estado: "presentado", numeroDocumento: existentes[0].numeroDocumento }, existentes);
    expect(t.numeroDocumento).toBe(existentes[0].numeroDocumento);
  });

  it("el correlativo se resetea en un año distinto", () => {
    const existentes = [construirTramite({ ...base, id: "a", estado: "presentado" })]; // 001-2026
    const t = construirTramite({ ...base, estado: "presentado", ahora: "2027-01-05T00:00:00.000Z" }, existentes);
    expect(t.numeroDocumento).toBe("001-2027");
  });
});

describe("seguimiento", () => {
  const tramite = (over: Partial<TramiteRegistro>): TramiteRegistro => ({
    ...construirTramite({ formatoId: "f", autoridad: "arffs", ahora: "2026-07-01T00:00:00.000Z" }),
    ...over,
  });

  it("cuenta los días desde la presentación", () => {
    const t = tramite({ fechaPresentacion: "2026-07-01" });
    expect(diasDesdePresentacion(t, new Date("2026-07-16T12:00:00Z"))).toBe(15);
    expect(diasDesdePresentacion(tramite({ fechaPresentacion: null }), new Date())).toBeNull();
  });

  it("los que esperan respuesta hace más de 15 días, el más viejo primero", () => {
    const lista = [
      tramite({ id: "a", estado: "presentado", fechaPresentacion: "2026-07-10" }),
      tramite({ id: "b", estado: "presentado", fechaPresentacion: "2026-07-01" }),
      tramite({ id: "c", estado: "resuelto", fechaPresentacion: "2026-05-01" }),
      tramite({ id: "d", estado: "borrador", fechaPresentacion: null }),
    ];
    const hoy = new Date("2026-07-29T00:00:00Z");
    expect(tramitesSinRespuesta(lista, hoy).map((t) => t.id)).toEqual(["b", "a"]);
  });

  it("un resuelto no aparece como pendiente aunque sea viejo", () => {
    const lista = [tramite({ id: "c", estado: "resuelto", fechaPresentacion: "2026-01-01" })];
    expect(tramitesSinRespuesta(lista, new Date("2026-07-29T00:00:00Z"))).toEqual([]);
  });

  it("cuenta por estado para los chips", () => {
    const lista = [
      tramite({ estado: "borrador" }),
      tramite({ estado: "presentado" }),
      tramite({ estado: "presentado" }),
    ];
    expect(contarPorEstado(lista)).toMatchObject({ borrador: 1, presentado: 2, observado: 0 });
  });
});
