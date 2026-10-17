/**
 * armarVolumenDelPermiso (ADR-432) — volumen y trazabilidad de UN permiso.
 *
 * Cada caso fija una de las 6 reglas del encabezado de
 * `lib/forestal/volumen-del-permiso.ts`. Los nombres de guía, especie y los
 * volúmenes del caso «GTF con varias especies» están calcados de Blas
 * (10-HUA, GTF 010-001-0000008, 25-09-2026).
 */
import { describe, expect, it } from "vitest";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import { pieTablarAserrableDe } from "@/lib/forestal/cubicacion";
import { RENDIMIENTO_META } from "@/lib/forestal/loctp-catalogos";
import {
  armarVolumenDelPermiso,
  m3DeCantidad,
  type ConsumoEntrada,
  type CorridaEntrada,
  type DespachoEntrada,
  type EntradaVolumenDelPermiso,
  type GuiaEntrada,
} from "@/lib/forestal/volumen-del-permiso";
import { resumirPrecio } from "@/lib/forestal/puesta-al-dia-del-permiso";

const PERMISO = "ctr_este";
const OTRO = "ctr_otro";

const guia = (id: string, p: Partial<GuiaEntrada> = {}): GuiaEntrada => ({
  id,
  gtf: `GTF-${id}`,
  fechaAsiento: "2026-09-01T00:00:00.000Z",
  fechaRecepcion: null,
  especie: "Tornillo",
  producto: "rolliza",
  m3: 10,
  piezas: 1,
  proveedor: "Comunidad",
  fotos: [],
  ...p,
});

const troza = (id: string, woodEntryId: string, p: Partial<TrozaConsumible> = {}): TrozaConsumible => ({
  id,
  woodEntryId,
  codificacion: id,
  especieComun: "Tornillo",
  volumenM3: 1,
  guiaRecepcionada: true,
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
  trozas: [],
  consumos: [],
  corridas: [],
  codigosDeContratos: {},
  origenes: [],
  despachos: [],
  ...p,
});

describe("m3DeCantidad (regla 3)", () => {
  it("m3 tal cual, pt ÷ 424, cualquier otra unidad = null", () => {
    expect(m3DeCantidad(2.5, "m3")).toBe(2.5);
    expect(m3DeCantidad(2.5, " M³ ")).toBe(2.5);
    expect(m3DeCantidad(848, "pt")).toBe(2);
    expect(m3DeCantidad(100, "kg")).toBeNull();
    expect(m3DeCantidad(3, "unidad")).toBeNull();
    expect(m3DeCantidad(3, null)).toBeNull();
  });
});

describe("armarVolumenDelPermiso — corridas (regla 1)", () => {
  it("la heredada cuenta en la proporción de lo que comió de este permiso", () => {
    const v = armarVolumenDelPermiso(
      entrada({
        guias: [guia("g1")],
        corridas: [corrida("c1", { contratoId: null, cantidad: 4 })],
        // 3 m³ de este permiso + 1 m³ de una guía de otro permiso.
        consumos: [consumo("c1", "g1", 3), consumo("c1", "g-ajena", 1)],
      }),
    );
    const c = v.corridas[0];
    expect(c.origen).toBe("heredada");
    expect(c.parte).toBe(0.75);
    expect(c.m3).toBe(4);
    expect(c.m3DelPermiso).toBe(3);
    expect(c.consumidoM3).toBe(3);
    expect(c.guias).toEqual(["GTF-g1"]);
    expect(v.totales.producidoM3).toBe(3);
    expect(v.totales.consumidoM3).toBe(3);
    expect(v.avisos.corridasSinAtar).toEqual([{ id: "c1", lineNo: 1, especie: "Tornillo", m3: 4, consumidoM3: 3 }]);
  });

  it("la atada a OTRO contrato no suma producción: va a avisos, pero su consumo sí baja la guía", () => {
    const v = armarVolumenDelPermiso(
      entrada({
        guias: [guia("g1")],
        corridas: [corrida("c1", { contratoId: OTRO, cantidad: 2, lineNo: 7 })],
        consumos: [consumo("c1", "g1", 4)],
        codigosDeContratos: { [OTRO]: "19-SEC/REG-PLT-2018-020" },
      }),
    );
    expect(v.corridas).toEqual([]);
    expect(v.totales.producidoM3).toBe(0);
    expect(v.totales.corridas).toBe(0);
    expect(v.avisos.corridasDeOtroPermiso).toEqual([
      { id: "c1", lineNo: 7, contratoCodigo: "19-SEC/REG-PLT-2018-020", consumidoM3: 4 },
    ]);
    expect(v.guias[0].consumidoM3).toBe(4);
    expect(v.guias[0].saldoM3).toBe(6);
  });

  it("una corrida sin contrato que no comió de acá no entra", () => {
    const v = armarVolumenDelPermiso(entrada({ guias: [guia("g1")], corridas: [corrida("c1", { contratoId: null })] }));
    expect(v.corridas).toEqual([]);
  });

  it("atada sin un m³ de consumo = sin materia prima (y no baja el saldo)", () => {
    const v = armarVolumenDelPermiso(
      entrada({ guias: [guia("g1")], corridas: [corrida("c1", { cantidad: 1.5 }), corrida("c2", { cantidad: 2 })], consumos: [consumo("c2", "g1", 3)] }),
    );
    expect(v.avisos.corridasSinMateriaPrima).toEqual({ cantidad: 1, m3: 1.5, ids: ["c1"] });
    expect(v.totales.saldoRollizaM3).toBe(7);
  });

  it("atada que comió SÓLO de otro permiso también es «sin materia prima»: está en ids y el conteo coincide", () => {
    const v = armarVolumenDelPermiso(
      entrada({
        guias: [guia("g1")],
        corridas: [corrida("c2", { lineNo: 7, cantidad: 1.5 }), corrida("c3", { lineNo: 8, cantidad: 1 })],
        consumos: [consumo("c2", "guia_de_otro_permiso", 3), consumo("c3", "g1", 2)],
      }),
    );
    const c2 = v.corridas.find((c) => c.id === "c2");
    expect(c2?.consumidoM3).toBe(0);
    expect(v.avisos.corridasSinMateriaPrima).toEqual({ cantidad: 1, m3: 1.5, ids: ["c2"] });
    // La lista y el aviso son lo mismo: toda atada con consumidoM3 0, y nada más.
    const sinMp = v.corridas.filter((c) => c.origen === "atada" && c.consumidoM3 === 0).map((c) => c.id);
    expect(v.avisos.corridasSinMateriaPrima.ids).toEqual(sinMp);
    expect(v.avisos.corridasSinMateriaPrima.cantidad).toBe(v.avisos.corridasSinMateriaPrima.ids.length);
  });
});

describe("armarVolumenDelPermiso — unidades (regla 3)", () => {
  it("pt se pasa a m³ (÷ 424) y el pt producido no pierde nada", () => {
    const v = armarVolumenDelPermiso(entrada({ guias: [guia("g1")], corridas: [corrida("c1", { cantidad: 424, unidad: "pt" })] }));
    expect(v.corridas[0].m3).toBe(1);
    expect(v.especies[0].producidoM3).toBe(1);
    expect(v.especies[0].producidoPt).toBe(424);
  });

  it("kg no se convierte: m3 null, va a sinConvertir y no suma", () => {
    const v = armarVolumenDelPermiso(
      entrada({ guias: [guia("g1")], corridas: [corrida("c1", { cantidad: 800, unidad: "kg", lineNo: 12 })] }),
    );
    expect(v.corridas[0].m3).toBeNull();
    expect(v.corridas[0].m3DelPermiso).toBeNull();
    expect(v.avisos.sinConvertir).toEqual([{ id: "c1", lineNo: 12, cantidad: 800, unidad: "kg" }]);
    expect(v.totales.producidoM3).toBe(0);
    expect(v.totales.corridas).toBe(1);
    // En la tabla por tipo no se pinta 0: es «—» (regla 6).
    expect(v.porTipo).toEqual([
      expect.objectContaining({ tipo: "MADERA ASERRADA (COMERCIAL)", corridas: 1, m3: null, pt: null }),
    ]);
  });

  it("una fila por tipo que mezcla m3 y kg queda sin calcular, y va al final de su especie", () => {
    const v = armarVolumenDelPermiso(
      entrada({
        guias: [guia("g1")],
        corridas: [
          corrida("c1", { tipo: "LEÑA", cantidad: 2, unidad: "m3" }),
          corrida("c2", { tipo: "LEÑA", cantidad: 500, unidad: "kg" }),
          corrida("c3", { tipo: "TABLA", cantidad: 1, unidad: "m3" }),
        ],
      }),
    );
    expect(v.porTipo.map((f) => [f.tipo, f.m3, f.pt])).toEqual([
      ["TABLA", 1, 424],
      ["LEÑA", null, null],
    ]);
    // La especie sí suma lo que convierte: 2 + 1 m³.
    expect(v.especies[0].producidoM3).toBe(3);
  });
});

describe("armarVolumenDelPermiso — especies", () => {
  it("una especie producida sin ingreso va al final, con aviso, y NO además como exceso", () => {
    const v = armarVolumenDelPermiso(
      entrada({
        guias: [guia("g1", { especie: "Cachimbo", m3: 5 })],
        corridas: [corrida("c1", { especie: "Copaiba", cantidad: 0.911 }), corrida("c2", { especie: "Cachimbo", cantidad: 1 })],
      }),
    );
    expect(v.especies.map((e) => [e.especie, e.sinIngreso])).toEqual([
      ["Cachimbo", false],
      ["Copaiba", true],
    ]);
    expect(v.avisos.especiesSinIngreso).toEqual([{ especie: "Copaiba", m3: 0.911, corridas: 1 }]);
    expect(v.avisos.excesos).toEqual([]);
  });

  it("«Azúcar huayo» y «AZUCAR  huayo» son la misma fila; el nombre lo pone la guía", () => {
    const v = armarVolumenDelPermiso(
      entrada({
        guias: [guia("g1", { especie: "Azúcar huayo", m3: 6.049 })],
        corridas: [corrida("c1", { especie: "AZUCAR  huayo", cantidad: 1 })],
      }),
    );
    expect(v.especies).toHaveLength(1);
    expect(v.especies[0]).toMatchObject({ clave: "azucar huayo", especie: "Azúcar huayo", sinIngreso: false, corridas: 1 });
    expect(v.porTipo[0]).toMatchObject({ clave: "azucar huayo", especie: "Azúcar huayo" });
  });

  it("exceso: lo producido pasa el techo del 56 % y se avisa con los pt de más", () => {
    const v = armarVolumenDelPermiso(
      entrada({ guias: [guia("g1", { m3: 1 })], corridas: [corrida("c1", { cantidad: 1 })] }),
    );
    const techo = pieTablarAserrableDe(1, RENDIMIENTO_META);
    expect(v.especies[0].aserrablePt).toBe(techo);
    expect(v.especies[0].producidoPt).toBe(424);
    expect(v.especies[0].saldoPt).toBe(techo - 424);
    expect(v.avisos.excesos).toEqual([{ especie: "Tornillo", pt: 424 - techo }]);
  });
});

describe("armarVolumenDelPermiso — trozas (criterio ADR-431, regla 2)", () => {
  it("guía sin trozas → trozas null + aviso con su m³", () => {
    const v = armarVolumenDelPermiso(entrada({ guias: [guia("g1", { gtf: "019-001-0000013", m3: 21.311 })] }));
    expect(v.guias[0].trozas).toBeNull();
    expect(v.avisos.guiasSinTrozas).toEqual([{ id: "g1", gtf: "019-001-0000013", m3: 21.311 }]);
  });

  it("troza consumida + su consumo NO cuentan el m³ dos veces", () => {
    const v = armarVolumenDelPermiso(
      entrada({
        guias: [guia("g1", { m3: 5 })],
        trozas: [troza("t1", "g1", { volumenM3: 2, consumidaEnId: "c1" }), troza("t2", "g1", { volumenM3: 3 })],
        corridas: [corrida("c1")],
        consumos: [consumo("c1", "g1", 2)],
      }),
    );
    expect(v.guias[0].consumidoM3).toBe(2);
    expect(v.guias[0].saldoM3).toBe(3);
    expect(v.guias[0].trozas).toMatchObject({ total: 2, consumidas: 1, libres: 1 });
    expect(v.totales.consumidoM3).toBe(2);
  });

  it("cada troza cae en UNA cubeta con los predicados del patio", () => {
    const v = armarVolumenDelPermiso(
      entrada({
        guias: [guia("g1"), guia("g2")],
        trozas: [
          troza("libre", "g1"),
          troza("lote", "g1", { loteAserrioId: "L1" }),
          troza("consumida", "g1", { consumidaEnId: "c1" }),
          troza("noLlego", "g1", { noRecepcionada: true }),
          troza("madre", "g1", { retrozos: 2 }),
          troza("hija", "g1", { trozaOrigenId: "madre" }),
          troza("bandeja", "g2", { guiaRecepcionada: false }),
        ],
      }),
    );
    const [g1, g2] = v.guias;
    expect(g1.trozas).toEqual({
      total: 6,
      libres: 2,
      enLote: 1,
      porRecepcionar: 0,
      consumidas: 1,
      despachadas: 0,
      noRecepcionadas: 1,
      retrozadas: 1,
    });
    expect(g2.trozas).toMatchObject({ total: 1, porRecepcionar: 1, libres: 0 });
    // Totales sin las madres retrozadas: van sus pedazos.
    expect(v.totales.trozas).toBe(6);
  });

  it("GTF con varias especies: cada troza va a la fila de su especie (Blas, 010-001-0000008)", () => {
    const gtf = "010-001-0000008";
    const v = armarVolumenDelPermiso(
      entrada({
        guias: [
          guia("azucar", { gtf, especie: "Azucar huayo", m3: 6.049 }),
          guia("cachimbo", { gtf, especie: "Cachimbo", m3: 2.149 }),
          guia("pashaco", { gtf, especie: "Pashaco", m3: 3.139 }),
          guia("otraGtf", { gtf: "010-001-0000009", especie: "Cachimbo", m3: 4 }),
        ],
        // Todas cuelgan de la fila «Azucar huayo», como en la base.
        trozas: [
          troza("t1", "azucar", { especieComun: "Azucar huayo", volumenM3: 3.268 }),
          troza("t2", "azucar", { especieComun: "Azucar huayo", volumenM3: 2.781 }),
          troza("t3", "azucar", { especieComun: "Cachimbo", volumenM3: 2.149 }),
          troza("t4", "azucar", { especieComun: "PASHACO", volumenM3: 3.139 }),
          troza("t5", "azucar", { especieComun: "Moena", volumenM3: 1 }),
        ],
      }),
    );
    const porId = new Map(v.guias.map((g) => [g.id, g]));
    expect(porId.get("azucar")?.trozas?.total).toBe(3); // 2 propias + la Moena, que no tiene fila
    expect(porId.get("cachimbo")?.trozas?.total).toBe(1);
    expect(porId.get("pashaco")?.trozas?.total).toBe(1);
    // Nunca cruza a otra GTF aunque la especie coincida.
    expect(porId.get("otraGtf")?.trozas).toBeNull();
    expect(v.avisos.guiasSinTrozas.map((g) => g.id)).toEqual(["otraGtf"]);
  });
});

describe("armarVolumenDelPermiso — el m³ consumido sigue a sus trozas (GTF multi-especie)", () => {
  const gtf = "010-001-0000008";
  const filas = [
    guia("azucar", { gtf, especie: "Azucar huayo", m3: 1 }),
    guia("cachimbo", { gtf, especie: "Cachimbo", m3: 0.8 }),
    guia("pashaco", { gtf, especie: "Pashaco", m3: 3 }),
  ];

  it("troza Cachimbo cargada en la fila Azucar huayo y consumida → consumida y m³ en la fila Cachimbo", () => {
    const v = armarVolumenDelPermiso(
      entrada({
        guias: filas.slice(0, 2),
        trozas: [
          troza("t1", "azucar", { especieComun: "Azucar huayo", volumenM3: 1 }),
          troza("t2", "azucar", { especieComun: "Cachimbo", volumenM3: 0.8, consumidaEnId: "c1" }),
        ],
        // El lote anota el consumo en la fila donde la troza está CARGADA.
        consumos: [consumo("c1", "azucar", 0.8)],
        corridas: [corrida("c1", { especie: "Cachimbo", cantidad: 0.4 })],
      }),
    );
    const a = v.guias.find((g) => g.id === "azucar");
    const c = v.guias.find((g) => g.id === "cachimbo");
    expect(c?.trozas).toMatchObject({ consumidas: 1 });
    expect(c?.consumidoM3).toBe(0.8);
    expect(c?.saldoM3).toBe(0);
    expect(c?.consumos).toEqual([{ corridaId: "c1", lineNo: 1, fecha: "2026-09-10T00:00:00.000Z", m3: 0.8 }]);
    expect(a?.trozas).toMatchObject({ consumidas: 0, libres: 1 });
    expect(a?.consumidoM3).toBe(0);
    expect(a?.consumos).toEqual([]);
    expect(v.especies.find((e) => e.clave === "cachimbo")?.consumidoM3).toBe(0.8);
    expect(v.especies.find((e) => e.clave === "azucar huayo")?.consumidoM3).toBe(0);
    expect(v.totales.consumidoM3).toBe(0.8);
  });

  it("varias trozas de una corrida: el m³ se reparte por su volumen", () => {
    const v = armarVolumenDelPermiso(
      entrada({
        guias: filas,
        trozas: [
          troza("t1", "azucar", { especieComun: "Cachimbo", volumenM3: 1, consumidaEnId: "c1" }),
          troza("t2", "azucar", { especieComun: "Pashaco", volumenM3: 3, consumidaEnId: "c1" }),
        ],
        consumos: [consumo("c1", "azucar", 2)],
        corridas: [corrida("c1", { especie: "Pashaco" })],
      }),
    );
    const por = new Map(v.guias.map((g) => [g.id, g.consumidoM3]));
    expect(por.get("cachimbo")).toBe(0.5);
    expect(por.get("pashaco")).toBe(1.5);
    expect(por.get("azucar")).toBe(0);
  });

  it("consumo sólo por volumen: va a la fila de la especie de la corrida; sin fila de esa especie, se queda", () => {
    const v = armarVolumenDelPermiso(
      entrada({
        guias: filas,
        consumos: [consumo("cP", "azucar", 1.2), consumo("cM", "azucar", 0.7)],
        corridas: [corrida("cP", { especie: "PASHACO" }), corrida("cM", { especie: "Moena" })],
      }),
    );
    const por = new Map(v.guias.map((g) => [g.id, g.consumidoM3]));
    expect(por.get("pashaco")).toBe(1.2);
    expect(por.get("azucar")).toBe(0.7);
    expect(por.get("cachimbo")).toBe(0);
  });

  it("el reparto no cambia el total por GTF ni el del permiso", () => {
    const otra = guia("otra", { gtf: "010-001-0000009", especie: "Cachimbo", m3: 5 });
    const consumos = [
      consumo("c1", "azucar", 1.3), // marcó trozas de dos especies
      consumo("c2", "azucar", 0.45), // sólo por volumen, especie con fila
      consumo("c3", "azucar", 0.25), // sólo por volumen, especie sin fila
      consumo("c1", "otra", 2), // otra GTF: no se toca
    ];
    const v = armarVolumenDelPermiso(
      entrada({
        guias: [...filas, otra],
        trozas: [
          troza("t1", "azucar", { especieComun: "Cachimbo", volumenM3: 0.8, consumidaEnId: "c1" }),
          troza("t2", "azucar", { especieComun: "Azucar huayo", volumenM3: 0.7, consumidaEnId: "c1" }),
          troza("t3", "otra", { especieComun: "Cachimbo", volumenM3: 2, consumidaEnId: "c1" }),
        ],
        consumos,
        corridas: [corrida("c1"), corrida("c2", { especie: "Cachimbo" }), corrida("c3", { especie: "Tornillo" })],
      }),
    );
    const porGtf = (gtfN: string) => v.guias.filter((g) => g.gtf === gtfN).reduce((s, g) => s + g.consumidoM3, 0);
    expect(porGtf(gtf)).toBeCloseTo(1.3 + 0.45 + 0.25, 4);
    expect(porGtf("010-001-0000009")).toBe(2);
    expect(v.totales.consumidoM3).toBeCloseTo(4, 4);
    expect(v.guias.reduce((s, g) => s + g.consumidoM3, 0)).toBeCloseTo(4, 4);
    expect(v.guias.find((g) => g.id === "cachimbo")?.consumidoM3).toBeCloseTo((1.3 * 0.8) / 1.5 + 0.45, 4);
    // Cada corrida sigue comiendo lo mismo de este permiso.
    expect(v.corridas.find((c) => c.id === "c1")?.consumidoM3).toBe(3.3);
  });
});

describe("armarVolumenDelPermiso — despachos", () => {
  it("aserrada por la parte de cada corrida + rolliza de las trozas; un despacho muerto no cuenta", () => {
    const v = armarVolumenDelPermiso(
      entrada({
        guias: [guia("g1", { m3: 10 })],
        trozas: [troza("t1", "g1", { volumenM3: 1.5, despachadaEnId: "d2" })],
        corridas: [
          corrida("c1", { contratoId: null, cantidad: 4 }), // heredada al 50 %
          corrida("c2", { cantidad: 848, unidad: "pt" }), // atada, 2 m³
        ],
        consumos: [consumo("c1", "g1", 2), consumo("c1", "g-ajena", 2)],
        origenes: [
          { despachoId: "d1", corridaId: "c1", cantidad: 2 }, // 2 m³ × 0,5 = 1
          { despachoId: "d1", corridaId: "c2", cantidad: 424 }, // 1 m³
          { despachoId: "dMuerto", corridaId: "c2", cantidad: 424 },
        ],
        despachos: [despacho("d2", { fecha: "2026-09-25T00:00:00.000Z", tipo: "rolliza" }), despacho("d1")],
      }),
    );
    expect(v.despachos.map((d) => d.id)).toEqual(["d1", "d2"]);
    expect(v.despachos[0]).toMatchObject({ m3: 2, rollizaM3: 0, corridaIds: ["c1", "c2"], trozas: 0 });
    expect(v.despachos[1]).toMatchObject({ m3: 1.5, rollizaM3: 1.5, corridaIds: [], trozas: 1 });
    expect(v.corridas.find((c) => c.id === "c1")?.despachadoM3).toBe(1);
    expect(v.corridas.find((c) => c.id === "c2")?.despachadoM3).toBe(1);
    expect(v.guias[0].despachadoRollizaM3).toBe(1.5);
    expect(v.guias[0].trozas?.despachadas).toBe(1);
    expect(v.guias[0].saldoM3).toBe(10 - 2 - 1.5);
    expect(v.totales.despachadoM3).toBe(3.5);
    expect(v.totales.despachadoRollizaM3).toBe(1.5);
    expect(v.totales.despachos).toBe(2);
  });

  it("sin despachos la salida está vacía, no rota", () => {
    const v = armarVolumenDelPermiso(entrada({ guias: [guia("g1")] }));
    expect(v.despachos).toEqual([]);
    expect(v.totales.despachadoM3).toBe(0);
  });
});

describe("armarVolumenDelPermiso — orden y totales", () => {
  const v = armarVolumenDelPermiso(
    entrada({
      guias: [
        guia("gB", { gtf: "B", especie: "Panguana", m3: 3, piezas: 2, fechaAsiento: "2026-09-05T00:00:00.000Z" }),
        guia("gA", { gtf: "A", especie: "Cachimbo", m3: 8, piezas: 3, fechaAsiento: "2026-09-08T00:00:00.000Z", fechaRecepcion: "2026-09-02T00:00:00.000Z" }),
        guia("gC", { gtf: "C", especie: "cachimbo", m3: 1.2345, piezas: 1, fechaAsiento: "2026-09-03T00:00:00.000Z" }),
      ],
      corridas: [
        corrida("c3", { especie: "Panguana", lineNo: 5, fecha: "2026-09-12T00:00:00.000Z", tipo: "LISTON", cantidad: 0.5 }),
        corrida("c2", { especie: "Cachimbo", lineNo: 9, fecha: "2026-09-11T00:00:00.000Z", tipo: "TABLA", cantidad: 1 }),
        corrida("c1", { especie: "Cachimbo", lineNo: 4, fecha: "2026-09-11T00:00:00.000Z", tipo: "LISTON", cantidad: 2.3333 }),
        corrida("c4", { especie: "Tacho", lineNo: 1, fecha: "2026-09-13T00:00:00.000Z", tipo: null, cantidad: 0.59 }),
      ],
      consumos: [
        consumo("c1", "gA", 2, { corridaLineNo: 4, corridaFecha: "2026-09-11T00:00:00.000Z" }),
        consumo("c2", "gA", 1, { corridaLineNo: 9, corridaFecha: "2026-09-11T00:00:00.000Z" }),
        consumo("c3", "gB", 1, { corridaLineNo: 5, corridaFecha: "2026-09-12T00:00:00.000Z" }),
      ],
    }),
  );

  it("guías por fecha (recepción si hay, si no asiento); consumos de cada guía por fecha y línea", () => {
    expect(v.guias.map((g) => g.gtf)).toEqual(["A", "C", "B"]);
    expect(v.guias[0].fecha).toBe("2026-09-02T00:00:00.000Z");
    expect(v.guias[0].consumos.map((c) => c.lineNo)).toEqual([4, 9]);
  });

  it("corridas por fecha y línea; especies por ingresado con las sin ingreso al final; porTipo por especie y m³", () => {
    expect(v.corridas.map((c) => c.lineNo)).toEqual([4, 9, 5, 1]);
    expect(v.especies.map((e) => e.especie)).toEqual(["Cachimbo", "Panguana", "Tacho"]);
    expect(v.porTipo.map((f) => `${f.especie}/${f.tipo}`)).toEqual([
      "Cachimbo/LISTON",
      "Cachimbo/TABLA",
      "Panguana/LISTON",
      "Tacho/Sin tipo",
    ]);
  });

  it("totales = Σ filas", () => {
    const suma = (k: "ingresadoM3" | "consumidoM3" | "saldoRollizaM3" | "producidoM3" | "despachadoRollizaM3") =>
      v.especies.reduce((s, e) => s + e[k], 0);
    const sumaN = (k: "guias" | "piezas" | "aserrablePt" | "producidoPt" | "saldoPt" | "corridas") =>
      v.especies.reduce((s, e) => s + e[k], 0);
    expect(v.totales.ingresadoM3).toBeCloseTo(suma("ingresadoM3"), 4);
    expect(v.totales.consumidoM3).toBeCloseTo(suma("consumidoM3"), 4);
    expect(v.totales.saldoRollizaM3).toBeCloseTo(suma("saldoRollizaM3"), 4);
    expect(v.totales.producidoM3).toBeCloseTo(suma("producidoM3"), 4);
    expect(v.totales.despachadoRollizaM3).toBeCloseTo(suma("despachadoRollizaM3"), 4);
    expect(v.totales.guias).toBe(sumaN("guias"));
    expect(v.totales.piezas).toBe(sumaN("piezas"));
    expect(v.totales.aserrablePt).toBe(sumaN("aserrablePt"));
    expect(v.totales.producidoPt).toBe(sumaN("producidoPt"));
    expect(v.totales.saldoPt).toBe(sumaN("saldoPt"));
    expect(v.totales.corridas).toBe(sumaN("corridas"));
    expect(v.porTipo.reduce((s, f) => s + (f.m3 ?? 0), 0)).toBeCloseTo(v.totales.producidoM3, 4);
    expect(v.totales.ingresadoM3).toBe(12.2345);
    expect(v.totales.rendimientoPct).toBe(Math.round((v.totales.producidoM3 / 12.2345) * 10_000) / 100);
  });

  it("sin ingreso el rendimiento es null, no 0 (regla 6)", () => {
    const vacio = armarVolumenDelPermiso(entrada({ corridas: [corrida("c1", { cantidad: 3.814 })] }));
    expect(vacio.totales.rendimientoPct).toBeNull();
    expect(vacio.totales.saldoPt).toBe(-1617);
  });
});

describe("armarVolumenDelPermiso — fotos de la guía", () => {
  it("sin fotos, la guía sale con [] — nunca null (una guía vieja no tiene por qué tener foto)", () => {
    const v = armarVolumenDelPermiso(entrada({ guias: [guia("g1")] }));
    expect(v.guias[0].fotos).toEqual([]);
  });

  it("las fotos de la guía pasan tal cual, cada una a su fila", () => {
    const v = armarVolumenDelPermiso(
      entrada({
        guias: [
          guia("g1", { fotos: [{ url: "https://x.supabase.co/a.jpg" }, { url: "priv:t1/forestal-carga/b.webp", sellada: true }] }),
          guia("g2", { fotos: [] }),
        ],
      }),
    );
    const porId = new Map(v.guias.map((g) => [g.id, g]));
    expect(porId.get("g1")?.fotos).toEqual([{ url: "https://x.supabase.co/a.jpg" }, { url: "priv:t1/forestal-carga/b.webp", sellada: true }]);
    expect(porId.get("g2")?.fotos).toEqual([]);
  });
});

describe("armarVolumenDelPermiso — madera de servicio (ADR-437 §1)", () => {
  it("la marca llega a la fila y la guía de servicio no cuenta «sin precio» en la ficha", () => {
    const v = armarVolumenDelPermiso(
      entrada({
        guias: [
          guia("wasaco", { m3: 20, costo: null, maderaDeTercero: true }),
          guia("comprada", { m3: 5, costo: null }),
          guia("pagada", { m3: 3, costo: 900 }),
        ],
      }),
    );
    const porId = new Map(v.guias.map((g) => [g.id, g]));
    expect(porId.get("wasaco")?.maderaDeTercero).toBe(true);
    // Sin la marca en la entrada, la fila sale comprada: nunca `undefined`.
    expect(porId.get("comprada")?.maderaDeTercero).toBe(false);
    expect(resumirPrecio(v.guias)).toEqual({ sinPrecio: 1, m3SinPrecio: 5, filas: 2 });
  });
});
