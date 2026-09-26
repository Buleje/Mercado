/**
 * El papel/Excel de la ficha de un permiso (ADR-432, botón «Imprimir / Excel»):
 * las mismas seis cifras y los mismos avisos que pinta la pantalla, saneado
 * para un archivo, y `null` que nunca sale como cero.
 */
import { describe, expect, it } from "vitest";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import {
  armarVolumenDelPermiso,
  type ConsumoEntrada,
  type CorridaEntrada,
  type DespachoEntrada,
  type DespachoOrigenEntrada,
  type EntradaVolumenDelPermiso,
  type GuiaEntrada,
} from "@/lib/forestal/volumen-del-permiso";
import {
  avisosDelPermiso,
  filasDeGuias,
  hojasDelFichaDePermiso,
  kpisDelPermiso,
  nombreArchivoPermiso,
  sanearCodigoPermiso,
  trozasPorEstadoTexto,
  type ContratoDeFicha,
  type PermisoFichaExportData,
} from "@/lib/forestal/permiso-ficha-export";
import { lineasDeAvisos } from "@/components/admin/forestal/CtpPermisoAvisos";

const PERMISO = "ctr_este";
const AHORA = new Date("2026-09-25T15:00:00-05:00");

const guia = (id: string, p: Partial<GuiaEntrada> = {}): GuiaEntrada => ({
  id,
  gtf: `GTF-${id}`,
  fechaAsiento: "2026-09-01T00:00:00.000Z",
  fechaRecepcion: null,
  especie: "Tornillo",
  producto: "rolliza",
  m3: 10,
  piezas: 4,
  proveedor: "Comunidad",
  fotos: [],
  ...p,
});

const corrida = (id: string, p: Partial<CorridaEntrada> = {}): CorridaEntrada => ({
  id,
  lineNo: 1,
  fecha: "2026-09-10T00:00:00.000Z",
  contratoId: PERMISO,
  especie: "Tornillo",
  tipo: "MADERA ASERRADA (COMERCIAL)",
  cantidad: 1,
  unidad: "m3",
  piezas: 10,
  lote: null,
  ...p,
});

let nConsumo = 0;
const consumo = (corridaId: string, woodEntryId: string, m3: number, p: Partial<ConsumoEntrada> = {}): ConsumoEntrada => ({
  id: `cs${++nConsumo}`,
  woodEntryId,
  corridaId,
  corridaLineNo: 1,
  corridaFecha: "2026-09-10T00:00:00.000Z",
  m3,
  ...p,
});

const despacho = (id: string, p: Partial<DespachoEntrada> = {}): DespachoEntrada => ({
  id,
  lineNo: 1,
  fecha: "2026-09-20T00:00:00.000Z",
  gtf: `SAL-${id}`,
  destino: "Lima",
  especie: "Tornillo",
  tipo: "MADERA ASERRADA (COMERCIAL)",
  ...p,
});

const entrada = (p: Partial<EntradaVolumenDelPermiso> = {}): EntradaVolumenDelPermiso => ({
  contratoId: PERMISO,
  codigo: "10-HUA-PUE/PER-FMP-2026-007",
  guias: [],
  trozas: [] as TrozaConsumible[],
  consumos: [],
  corridas: [],
  codigosDeContratos: {},
  origenes: [],
  despachos: [],
  ...p,
});

const contrato: ContratoDeFicha = {
  codigo: "10-HUA-PUE/PER-FMP-2026-007",
  titularNombre: "Comunidad Santa Rosa",
  tipo: "PER-FMP",
  region: "Ucayali",
  vigenciaDesde: "2026-01-01T00:00:00.000Z",
  vigenciaHasta: "2026-12-31T00:00:00.000Z",
  estado: "vigente",
};

/**
 * Un permiso con: una guía sin lista de trozas (Tornillo, 10 m³), una corrida
 * atada que comió 3 m³ (Tornillo, aserrada), una heredada que comió 1 m³, y
 * una corrida atada en kg sin materia prima de una especie que ninguna guía
 * trajo (Ishpingo) — la que dispara los tres avisos «leves» a la vez y un
 * `null` real en «Por tipo».
 */
function armarDatos(): PermisoFichaExportData {
  const g1 = guia("g1");
  const origenes: DespachoOrigenEntrada[] = [{ despachoId: "d1", corridaId: "c1", cantidad: 2 }];
  const v = armarVolumenDelPermiso(
    entrada({
      guias: [g1],
      consumos: [consumo("c1", "g1", 3), consumo("c2", "g1", 1)],
      corridas: [
        corrida("c1", { lineNo: 1, especie: "Tornillo", cantidad: 3, unidad: "m3", piezas: 20 }),
        corrida("c2", { lineNo: 2, contratoId: null, especie: "Tornillo", cantidad: 1, unidad: "m3", piezas: 5 }),
        corrida("c3", { lineNo: 3, especie: "Ishpingo", cantidad: 50, unidad: "kg", piezas: 2 }),
      ],
      origenes,
      despachos: [despacho("d1")],
    }),
  );
  return { contrato, volumen: v };
}

describe("sanearCodigoPermiso", () => {
  it("sólo letras, números y guiones; vacío no rompe el nombre", () => {
    expect(sanearCodigoPermiso("CON-25/UCA 0142")).toBe("CON-25-UCA-0142");
    expect(sanearCodigoPermiso("  10-HUA-PUE/PER-FMP-2026-007  ")).toBe("10-HUA-PUE-PER-FMP-2026-007");
    expect(sanearCodigoPermiso("   ")).toBe("sin-codigo");
  });
});

describe("nombreArchivoPermiso", () => {
  it("sin «.xlsx» (exportSheetsToExcel la agrega) y con el día de Lima", () => {
    expect(nombreArchivoPermiso(contrato.codigo, AHORA)).toBe("permiso-10-HUA-PUE-PER-FMP-2026-007-2026-09-25");
    expect(nombreArchivoPermiso(contrato.codigo, AHORA)).not.toMatch(/\.xlsx$/);
    // 03:00 UTC del 25 ya es 22:00 del 24 en Lima: el archivo no puede fecharse mañana.
    expect(nombreArchivoPermiso(contrato.codigo, new Date("2026-09-25T03:00:00.000Z"))).toBe(
      "permiso-10-HUA-PUE-PER-FMP-2026-007-2026-09-24",
    );
  });
});

describe("trozasPorEstadoTexto", () => {
  it("sólo las cubetas con algo, y «—» cuando la guía no trae lista", () => {
    expect(trozasPorEstadoTexto(null)).toBe("—");
    expect(
      trozasPorEstadoTexto({
        total: 5,
        libres: 2,
        enLote: 1,
        porRecepcionar: 0,
        consumidas: 2,
        despachadas: 0,
        noRecepcionadas: 0,
        retrozadas: 0,
      }),
    ).toBe("2 libres · 1 en lote · 2 consumidas");
  });
});

describe("kpisDelPermiso — mismas condiciones que CtpPermisoVolumen.tsx", () => {
  it("ingresado con guía; sin ingreso ninguna corrida se mide contra un techo", () => {
    const { volumen } = armarDatos();
    const kpis = kpisDelPermiso(volumen);
    const ingresado = kpis.find((k) => k.label === "Ingresado")!;
    expect(ingresado.valor).toBeCloseTo(volumen.totales.ingresadoM3, 3);
    expect(ingresado.detalle).toBe("1 guía · 0 trozas");

    // Sin ninguna guía: el KPI dice «Sin ingreso», no un cero.
    const sinGuias = armarVolumenDelPermiso(entrada({ corridas: [corrida("c1", { cantidad: 2 })] }));
    const kpisVacio = kpisDelPermiso(sinGuias);
    expect(kpisVacio.find((k) => k.label === "Ingresado")!.valor).toBeNull();
    expect(kpisVacio.find((k) => k.label === "Ingresado")!.detalle).toBe(
      "Ninguna guía de ingreso bajo este permiso",
    );
    expect(kpisVacio.find((k) => k.label === "Saldo aserrable")!.valor).toBeNull();
  });
});

describe("avisosDelPermiso — las MISMAS palabras que CtpPermisoAvisos.tsx", () => {
  it("reusa lineasDeAvisos: nunca se desalinea de la pantalla", () => {
    const { volumen } = armarDatos();
    const propios = avisosDelPermiso(volumen.avisos);
    const pantalla = lineasDeAvisos(volumen.avisos);
    expect(propios.map((a) => a.texto)).toEqual(pantalla.map((l) => l.texto));
    expect(propios.length).toBeGreaterThan(0);
    // Ishpingo: producida sin que ninguna guía del permiso la trajera.
    expect(propios.some((a) => a.texto.includes("sin guía de ingreso"))).toBe(true);
    // c3: en kg, no convierte a m³.
    expect(propios.some((a) => a.texto.includes("no pasa a m³"))).toBe(true);
    // g1: tiene m³ pero no lista de trozas.
    expect(propios.some((a) => a.texto.includes("sin lista de trozas"))).toBe(true);
  });
});

describe("hojasDelFichaDePermiso — 7 hojas, totales = Σ filas, null → «—»", () => {
  it("hojas en el orden pedido", () => {
    const hojas = hojasDelFichaDePermiso(armarDatos(), AHORA);
    expect(hojas.map((h) => h.nombre)).toEqual([
      "Resumen",
      "Por especie",
      "Por tipo",
      "Guías",
      "Corridas",
      "Despachos",
      "Qué se exportó",
    ]);
  });

  it("«Por especie»: la fila total es la Σ de las filas de especie (no un número aparte)", () => {
    const { volumen } = armarDatos();
    const hojas = hojasDelFichaDePermiso({ contrato, volumen }, AHORA);
    const especie = hojas.find((h) => h.nombre === "Por especie")!;
    const filas = especie.filas.slice(0, -1);
    const total = especie.filas.at(-1)!;
    const suma = (col: string) => filas.reduce((s, f) => s + (typeof f[col] === "number" ? (f[col] as number) : 0), 0);
    expect(suma("Ingresado m³")).toBeCloseTo(Number(total["Ingresado m³"]), 3);
    expect(suma("Ingresado m³")).toBeCloseTo(volumen.totales.ingresadoM3, 3);
    expect(suma("Consumido m³")).toBeCloseTo(Number(total["Consumido m³"]), 3);
    expect(suma("Consumido m³")).toBeCloseTo(volumen.totales.consumidoM3, 3);
    // Ishpingo no tiene guía: sus columnas de rolliza son «—», no 0.
    const ishpingo = filas.find((f) => String(f.Especie).startsWith("Ishpingo"))!;
    expect(ishpingo["Ingresado m³"]).toBe("—");
    expect(ishpingo["Aserrable ≈pt aserr."]).toBe("—");
    expect(ishpingo["Saldo ≈pt aserr."]).toBe("—");
    // Tornillo SÍ tuvo despacho y nada salió en troza: el 0 real se escribe
    // 0, no «—» — «—» es «no hubo despacho», no «no sabemos cuánto».
    const tornillo = filas.find((f) => f.Especie === "Tornillo")!;
    expect(tornillo["Despachado rolliza m³"]).toBe(0);
    expect(typeof tornillo["Despachado rolliza m³"]).toBe("number");
  });

  it("«Por tipo»: la corrida en kg no convierte — «—», nunca 0", () => {
    const hojas = hojasDelFichaDePermiso(armarDatos(), AHORA);
    const porTipo = hojas.find((h) => h.nombre === "Por tipo")!;
    const fila = porTipo.filas.find((f) => String(f.Especie).startsWith("Ishpingo"))!;
    expect(fila["m³"]).toBe("—");
    expect(fila.pt).toBe("—");
  });

  it("«Guías»: sin lista de trozas el texto es «—», no una fila vacía", () => {
    const hojas = hojasDelFichaDePermiso(armarDatos(), AHORA);
    const guias = hojas.find((h) => h.nombre === "Guías")!;
    expect(guias.filas).toHaveLength(1);
    expect(guias.filas[0]["Trozas por estado"]).toBe("—");
    expect(guias.filas[0].GTF).toBe("GTF-g1");
    expect(typeof guias.filas[0]["Ingresado m³"]).toBe("number");
    // Sin fotos: 0 (número, no «—» — «—» es «no medible», 0 fotos SÍ se sabe).
    expect(guias.filas[0].Fotos).toBe(0);
    expect(guias.filas[0]["Links de fotos"]).toBe("—");
  });

  it("«Guías»: con fotos, el Excel trae la cantidad y los links; el papel las miniaturiza", () => {
    // Una legado (https) y una privada con sello (ADR-434): el link de la privada
    // va por el panel, con dominio — sin sesión no se ve.
    const g1 = guia("g1", {
      fotos: [{ url: "https://x.supabase.co/a.jpg" }, { url: "priv:t1/forestal-carga/b.webp", por: "Ana" }],
    });
    const v = armarVolumenDelPermiso(entrada({ guias: [g1] }));
    const hojas = hojasDelFichaDePermiso({ contrato, volumen: v }, AHORA);
    const guias = hojas.find((h) => h.nombre === "Guías")!;
    expect(guias.filas[0].Fotos).toBe(2);
    expect(guias.filas[0]["Links de fotos"]).toBe(
      `https://x.supabase.co/a.jpg ${window.location.origin}/api/admin/forestal/fotos/ver?p=t1%2Fforestal-carga%2Fb.webp`,
    );
    // `filasDeGuias` es lo que consume el papel (`tablaGuiasHtml`): la lista
    // de fotos llega intacta, sin recortar — recortar a 4 miniaturas es del
    // HTML, no del dato.
    expect(filasDeGuias(v)[0].fotos).toEqual(g1.fotos);
  });

  it("«Corridas» y «Despachos»: los números van como número", () => {
    const hojas = hojasDelFichaDePermiso(armarDatos(), AHORA);
    const corridas = hojas.find((h) => h.nombre === "Corridas")!;
    expect(corridas.filas).toHaveLength(3);
    for (const f of corridas.filas) {
      expect(typeof f.Cantidad).toBe("number");
      expect(typeof f["Consumido de este permiso (m³)"]).toBe("number");
    }
    const despachos = hojas.find((h) => h.nombre === "Despachos")!;
    expect(despachos.filas).toHaveLength(1);
    expect(typeof despachos.filas[0]["m³"]).toBe("number");
    expect(despachos.filas[0]["GTF de salida"]).toBe("SAL-d1");
  });

  it("«Resumen» trae el permiso, el titular y cuántos avisos hay", () => {
    const { volumen } = armarDatos();
    const hojas = hojasDelFichaDePermiso({ contrato, volumen }, AHORA);
    const resumen = Object.fromEntries(hojas[0].filas.map((f) => [f.Dato, f.Valor]));
    expect(resumen.Permiso).toBe(contrato.codigo);
    expect(resumen.Titular).toBe(contrato.titularNombre);
    expect(resumen.AVISOS).toBe(String(lineasDeAvisos(volumen.avisos).length));
  });
});
