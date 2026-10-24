/**
 * resumenPorPermiso (ADR-431) — «¿cuántas trozas me quedan por permiso?».
 *
 * El fixture está CALCADO de Blas (SELECT dentro de BEGIN READ ONLY, 24-09-2026):
 * 46 trozas de 10-HUA en 8 guías recibidas y 31 de 19-SEC con la guía en la
 * bandeja. Los volúmenes son los de la base, pieza por pieza: si la función
 * cambia de criterio, estos números se mueven.
 */
import { describe, expect, it } from "vitest";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import { pieTablarAserrableDe } from "@/lib/forestal/cubicacion";
import { RENDIMIENTO_META } from "@/lib/forestal/loctp-catalogos";
import { esLibre } from "@/lib/forestal/capacidad-de-planta";
import { enPatio, estaLibreEnPatio, resumenPorPermiso } from "@/lib/forestal/patio-resumen";

/** Mediodía en Lima: el día UTC y el de Lima coinciden (24-09). */
const AHORA = new Date("2026-09-24T12:00:00-05:00");
const ASIENTO = "2026-09-08T05:00:00.000Z";
const HUA = "10-HUA-PUE/PER-FMP-2026-007";
const SEC = "19-SEC/REG-PLT-2021-017";

/* [permiso, guía, especie, guía recibida, volúmenes m³] — tal como están en Blas. */
const BLAS: [string, string, string, boolean, number[]][] = [
  [SEC, "019-001-0000004", "TORNILLO", false, [
    0.641, 1.048, 0.438, 1.006, 0.794, 0.538, 0.6, 1.287, 0.964, 0.756, 0.792, 0.52, 0.813, 0.831, 0.491, 0.766,
    0.499, 0.652, 0.594, 0.421, 0.596, 0.552, 0.824, 0.619, 0.415, 0.309, 0.685, 0.392, 0.377, 0.524, 0.317,
  ]],
  [HUA, "010-001-0000014", "Ana Caspi", true, [3.424, 2.296, 2.664]],
  [HUA, "010-001-0000014", "Panguana", true, [3.225, 2.197]],
  [HUA, "010-001-0000013", "Mashonaste", true, [4.441, 3.058, 1.921]],
  [HUA, "010-001-0000013", "Copal", true, [2.661, 3.11, 3.886]],
  [HUA, "010-001-0000009", "Cachimbo", true, [4.469, 2.8, 2.14, 1.268]],
  [HUA, "010-001-0000009", "Yacuchapana", true, [3.722, 1.779, 2.808]],
  [HUA, "010-001-0000010", "Panguana", true, [3.414, 2.644, 4.651, 2.056, 2.531]],
  [HUA, "010-001-0000010", "Huayruro", true, [4.224]],
  [HUA, "010-001-0000008", "Cachimbo", true, [2.149]],
  [HUA, "010-001-0000008", "Azucar huayo", true, [3.268, 2.781]],
  [HUA, "010-001-0000008", "Pashaco", true, [3.139]],
  [HUA, "010-001-0000008", "Huayruro", true, [2.508]],
  [HUA, "010-001-0000007", "Pashaco", true, [6.668, 5.254, 4.482]],
  [HUA, "010-001-0000007", "Cumala", true, [1.433]],
  [HUA, "010-001-0000006", "Cachimbo", true, [2.394, 1.917]],
  [HUA, "010-001-0000006", "Cumala", true, [3.255, 2.167]],
  [HUA, "010-001-0000006", "Shimbillo", true, [4.102]],
  [HUA, "010-001-0000006", "Copal", true, [2.128]],
  [HUA, "010-001-0000005", "Cachimbo", true, [2.808, 2.153, 1.956, 1.44, 3.453]],
  [HUA, "010-001-0000005", "Shimbillo", true, [2.991]],
  [HUA, "010-001-0000005", "Copal", true, [1.752]],
];

let n = 0;
function troza(over: Partial<TrozaConsumible> = {}): TrozaConsumible {
  n += 1;
  return {
    id: `t${n}`,
    woodEntryId: over.gtfNumber ? `w-${over.gtfNumber}` : "w1",
    codificacion: String(n),
    especieComun: "Tornillo",
    volumenM3: 1,
    gtfNumber: "001",
    permiso: HUA,
    fechaIngreso: ASIENTO,
    fechaRecepcion: null,
    guiaRecepcionada: true,
    consumidaEnId: null,
    despachadaEnId: null,
    noRecepcionada: false,
    descarte: false,
    retrozos: 0,
    loteAserrioId: null,
    ...over,
  };
}

const blas = (): TrozaConsumible[] =>
  BLAS.flatMap(([permiso, gtfNumber, especieComun, recibida, vols]) =>
    vols.map((volumenM3) =>
      troza({
        permiso,
        gtfNumber,
        especieComun,
        volumenM3,
        guiaRecepcionada: recibida,
        resolucion: permiso === HUA ? "R.A N° 022-2026-GR-DRA-HCO/ATFFS-PI" : SEC,
      }),
    ),
  );

describe("resumenPorPermiso — con el patio de Blas (24-09)", () => {
  const r = resumenPorPermiso(blas(), AHORA);
  const [hua, sec] = r.filas;

  it("2 filas: 10-HUA con 46 en el patio, 19-SEC con 31 por recepcionar", () => {
    expect(r.filas.map((f) => f.permiso)).toEqual([HUA, SEC]);
    expect(hua).toMatchObject({
      enPatio: { trozas: 46, m3: 135.587 },
      libres: { trozas: 46, m3: 135.587 },
      enLote: { trozas: 0, m3: 0 },
      porRecepcionar: { trozas: 0, m3: 0, guias: 0, asientoMasViejo: null },
      guias: 8,
      especies: 11,
      masVieja: { fecha: ASIENTO, dias: 16 },
    });
    expect(sec).toMatchObject({
      enPatio: { trozas: 0, m3: 0, ptAserrable: 0 },
      porRecepcionar: { trozas: 31, m3: 20.061, guias: 1 },
      guias: 1,
      especies: 1,
    });
  });

  it("totales 77 / 155,648 = lo que da el SQL; en el patio 46 / 135,587", () => {
    expect(r.totales.total).toEqual({ trozas: 77, m3: 155.648 });
    expect(r.totales.enPatio.trozas).toBe(46);
    expect(r.totales.enPatio.m3).toBe(135.587);
    expect(r.totales.porRecepcionar).toMatchObject({ trozas: 31, m3: 20.061, guias: 1 });
    expect(r.totales.permisos).toBe(2);
    expect(r.totales.guias).toBe(9);
  });

  it("≈pt aserrable es el DERIVADO al 56 %, no otro número", () => {
    expect(hua.enPatio.ptAserrable).toBe(pieTablarAserrableDe(135.587, RENDIMIENTO_META));
    expect(hua.enPatio.ptAserrable).toBe(32194);
  });

  it("lo por recepcionar NO cuenta días en el patio: sólo el asiento, rotulado aparte (C7)", () => {
    expect(sec.masVieja).toBeNull();
    expect(Object.values(sec.tramos).every((x) => x === 0)).toBe(true);
    expect(sec.porRecepcionar.asientoMasViejo).toEqual({ fecha: ASIENTO, dias: 16 });
    // En 10-HUA las 46 caen en «15 a 29 días» (16 d desde el asiento).
    expect(hua.tramos).toEqual({ hasta15: 0, "16a30": 46, "31a60": 0, mas60: 0 });
  });
});

describe("resumenPorPermiso — el criterio del libro (estaDisponible)", () => {
  it("se excluyen consumida, despachada, descarte, madre retrozada, sin volumen y no llegada", () => {
    const viva = troza({ id: "viva" });
    const r = resumenPorPermiso(
      [
        viva,
        troza({ consumidaEnId: "c1" }),
        troza({ despachadaEnId: "d1" }),
        troza({ descarte: true }),
        troza({ retrozos: 2 }),
        troza({ volumenM3: 0 }),
        troza({ volumenM3: null }),
        troza({ noRecepcionada: true }),
      ],
      AHORA,
    );
    expect(r.totales.total).toEqual({ trozas: 1, m3: 1 });
    expect(r.filas).toHaveLength(1);
  });

  it("la apartada en un lote cuenta en «en lote» y en el patio, NO en libres", () => {
    const r = resumenPorPermiso([troza(), troza({ loteAserrioId: "LA-1", volumenM3: 2 })], AHORA);
    expect(r.filas[0]).toMatchObject({
      enPatio: { trozas: 2, m3: 3 },
      libres: { trozas: 1, m3: 1 },
      enLote: { trozas: 1, m3: 2 },
    });
  });

  it("la fila sin permiso existe y va AL FINAL aunque pese más", () => {
    const r = resumenPorPermiso(
      [troza({ permiso: "P-CHICO", volumenM3: 1 }), troza({ permiso: null, volumenM3: 50 }), troza({ permiso: "  ", volumenM3: 9 })],
      AHORA,
    );
    expect(r.filas.map((f) => f.permiso)).toEqual(["P-CHICO", null]);
    expect(r.filas[1].enPatio).toMatchObject({ trozas: 2, m3: 59 });
    expect(r.totales.permisos).toBe(1);
  });

  it("orden: más m³ en el patio primero; a igualdad, más m³ por recepcionar", () => {
    const r = resumenPorPermiso(
      [
        troza({ permiso: "A", volumenM3: 1 }),
        troza({ permiso: "B", volumenM3: 5 }),
        troza({ permiso: "C", volumenM3: 1, guiaRecepcionada: false }),
        troza({ permiso: "D", volumenM3: 7, guiaRecepcionada: false }),
      ],
      AHORA,
    );
    expect(r.filas.map((f) => f.permiso)).toEqual(["B", "A", "D", "C"]);
  });

  it("las especies se cuentan por la especie de la TROZA (Panguana bajo guía Huayruro es Panguana)", () => {
    const r = resumenPorPermiso(
      [
        troza({ gtfNumber: "G-HUAYRURO", especieComun: "Panguana" }),
        troza({ gtfNumber: "G-HUAYRURO", especieComun: "PANGUANA (Brosimum utile)" }),
        troza({ gtfNumber: "G-HUAYRURO", especieComun: "Huayruro" }),
      ],
      AHORA,
    );
    expect(r.filas[0].especies).toBe(2);
    expect(r.filas[0].guias).toBe(1);
  });

  it("la más vieja se mide desde la RECEPCIÓN de la pieza si la tiene; el asiento es el respaldo", () => {
    const r = resumenPorPermiso(
      [
        troza({ fechaRecepcion: "2026-09-20T15:00:00.000Z" }), // 4 días
        troza({ fechaRecepcion: null, fechaIngreso: "2026-08-01T05:00:00.000Z" }), // 54 días
      ],
      AHORA,
    );
    expect(r.filas[0].masVieja).toEqual({ fecha: "2026-08-01T05:00:00.000Z", dias: 54 });
    expect(r.filas[0].tramos).toEqual({ hasta15: 1, "16a30": 0, "31a60": 1, mas60: 0 });
  });

  it("un patio vacío no inventa filas ni fechas", () => {
    const r = resumenPorPermiso([], AHORA);
    expect(r.filas).toEqual([]);
    expect(r.totales).toMatchObject({ total: { trozas: 0, m3: 0 }, masVieja: null, permisos: 0 });
  });
});

describe("un solo predicado de «libre» (ADR-431)", () => {
  const casos: TrozaConsumible[] = [
    ...blas(),
    troza({ loteAserrioId: "LA-1" }),
    troza({ consumidaEnId: "c1" }),
    troza({ despachadaEnId: "d1" }),
    troza({ descarte: true }),
    troza({ retrozos: 1 }),
    troza({ volumenM3: null }),
    troza({ guiaRecepcionada: undefined }),
    troza({ guiaRecepcionada: false, loteAserrioId: "LA-2" }),
  ];

  it("esLibre (capacidad) === estaLibreEnPatio (Consumos) en cada pieza", () => {
    for (const t of casos) expect(esLibre(t)).toBe(estaLibreEnPatio(t));
  });

  it("libres por fila = cuántas pasan esLibre; en el patio = cuántas pasan enPatio", () => {
    const r = resumenPorPermiso(casos, AHORA);
    for (const f of r.filas) {
      const suyas = casos.filter((t) => ((t.permiso ?? "").trim() || null) === f.permiso);
      expect(f.libres.trozas).toBe(suyas.filter(esLibre).length);
      expect(f.enPatio.trozas).toBe(suyas.filter(enPatio).length);
    }
  });
});
