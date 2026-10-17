/**
 * El acta impresa de una inspección de planta (fase 3, 17-10): todo lo que
 * escribe alguien sale escapado, las fotos sólo si son las de la inspección,
 * y lo que falta del patio se agrupa como se va a buscar (especie y guía).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { anotarDesconocido, anotarTroza, nuevoConteo, type TrozaDelConteo } from "@/lib/forestal/conteo-patio";
import { actaDeInspeccion, type InspeccionParaActa } from "@/lib/superadmin/plantas-forestales/acta-inspeccion";

const SUPABASE = "https://abcdefgh.supabase.co";
const FOTO_BUENA = `${SUPABASE}/storage/v1/object/public/media/superadmin/inspecciones-planta/1760000000000-foto.webp`;

const troza = (id: string, especie: string, guia: string, m3: number): TrozaDelConteo => ({
  id,
  codificacion: null,
  codigoPlanta: id.toUpperCase(),
  especieComun: especie,
  gtfNumber: guia,
  volumenM3: m3,
  motivo: null,
});

const PATIO = [
  troza("t-a", "Cumala", "019-001-0000001", 1.2),
  troza("t-b", "Tornillo", "019-001-0000002", 0.8),
  troza("t-c", "Cumala", "019-001-0000002", 0.5),
];

function inspeccion(extra: Partial<InspeccionParaActa> = {}): InspeccionParaActa {
  const ahora = "2026-10-17T14:00:00.000Z";
  let conteo = nuevoConteo({ fecha: "2026-10-17", quien: "Inspector", trozas: PATIO, ahora });
  conteo = anotarTroza(conteo, PATIO[0], ahora);
  conteo = anotarDesconocido(conteo, "ZZ-9", ahora);
  return {
    id: "insp-1",
    tenantId: "planta-op-qa",
    fecha: "2026-10-17",
    inspector: "superadmin",
    estado: "cerrada",
    hallazgos: 1,
    faltantesTrozas: 2,
    conteoPatioId: "conteo-1",
    trozas: null,
    aserrada: [{ producto: "Tabla 1x8", especie: "Cumala", libroM3: 3, contadoM3: 2.5, libroPiezas: null, contadoPiezas: null }],
    hallazgosDetalle: [
      {
        id: "h1",
        gravedad: "error",
        categoria: "volumen",
        texto: `Faltan trozas <script>alert("x")</script> en la cancha 2`,
        m3: 1.3,
        fotos: ["javascript:alert(1)", "data:image/png;base64,AAAA", FOTO_BUENA],
        referencia: { tipo: "guia", valor: "019-001-0000002" },
      },
    ],
    conclusion: "Revisar <b>guías</b>",
    responsablePlanta: "Jefe & Cía",
    cerradaAt: "2026-10-17T18:00:00.000Z",
    libro: {
      tomadaEn: ahora,
      trozas: {
        enPatio: { piezas: 3, m3: 2.5, ptAserrable: 594 },
        porRecepcionar: { piezas: 0, m3: 0 },
        pendienteSinPiezasM3: 0,
        varadas: { piezas: 0, m3: 0, dias: 90 },
      },
      aserrada: null,
      movimiento: null,
      incoherencias: { error: 1, warning: 0, info: 0, m3EnJuego: 1 },
      trozasDelPatio: PATIO,
      incoherenciasDetalle: [],
    },
    conteoPatio: conteo,
    ...extra,
  };
}

beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE));
afterEach(() => vi.unstubAllEnvs());

describe("acta de la inspección", () => {
  it("escapa todo lo que se escribe: hallazgo, conclusión, responsable y nombre de la planta", () => {
    const { body, title } = actaDeInspeccion(inspeccion(), { nombre: `Aserradero <img src=x onerror=alert(1)>` });
    expect(body).not.toContain("<script>");
    expect(body).toContain("&lt;script&gt;");
    expect(body).not.toContain("<b>guías</b>");
    expect(body).not.toContain("<img src=x");
    expect(body).toContain("Jefe &amp; Cía");
    /* El título lo escapa `openCtpReport`; acá sólo lleva el nombre. */
    expect(title).toContain("Aserradero");
  });

  it("sólo dibuja las fotos subidas desde la inspección (ni javascript: ni data:)", () => {
    const { body } = actaDeInspeccion(inspeccion(), { nombre: "Planta" });
    expect(body).not.toContain("javascript:");
    expect(body).not.toContain("data:image");
    expect(body).toContain(`<img src="${FOTO_BUENA}"`);
  });

  it("muestra lo que falta agrupado por especie y por guía, y lo que sobra", () => {
    const { body } = actaDeInspeccion(inspeccion(), { nombre: "Planta" });
    expect(body).toContain("Faltan por especie");
    expect(body).toContain("Faltan por guía");
    expect(body).toContain("Tornillo");
    expect(body).toContain("019-001-0000002");
    expect(body).toContain("T-B");
    expect(body).toContain("T-C");
    /* La contada no está entre las que faltan; el código desconocido va a «Sobran». */
    expect(body).toContain("ZZ-9");
    expect(body).toMatch(/Sobran: el libro dice que no están \(1\)/);
    expect(body).not.toContain("Se esperan");
  });

  it("si el libro da menos libres que las esperadas, el acta dice por qué (lotes sin aserrar)", () => {
    const base = inspeccion();
    const libro = {
      ...base.libro,
      trozas: {
        enPatio: { piezas: 2, m3: 1.7, ptAserrable: 400 },
        porRecepcionar: { piezas: 0, m3: 0 },
        pendienteSinPiezasM3: 0,
        varadas: { piezas: 0, m3: 0, dias: 90 },
      },
    };
    const { body } = actaDeInspeccion({ ...base, libro }, { nombre: "Planta" });
    expect(body).toContain("Se esperan 3 y no 2");
  });

  it("anulada: lo dice en grande con su motivo (escapado)", () => {
    const { body } = actaDeInspeccion(
      inspeccion({ estado: "anulada", motivoAnulacion: "prueba <del> agente", anuladaAt: "2026-10-17T19:00:00.000Z" }),
      { nombre: "Planta" },
    );
    expect(body).toContain("ANULADA");
    expect(body).toContain("prueba &lt;del&gt; agente");
    expect(body).not.toContain("BORRADOR");
  });

  it("abierta: borrador; sin conteo usa las cuentas guardadas", () => {
    const { body } = actaDeInspeccion(
      inspeccion({
        estado: "abierta",
        cerradaAt: null,
        conteoPatio: null,
        trozas: { esperadas: 10, contadas: 7, faltantes: 3, sobrantes: 2, m3Esperado: 5, m3Contado: 3.5 },
      }),
      { nombre: "Planta" },
    );
    expect(body).toContain("BORRADOR");
    expect(body).not.toContain("ANULADA");
    expect(body).toMatch(/<b>3<\/b><span>Faltan/);
    expect(body).toMatch(/<b>2<\/b><span>Sobran/);
  });
});
