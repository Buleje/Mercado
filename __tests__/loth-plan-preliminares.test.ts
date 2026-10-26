/**
 * GTF preliminares del plan (25-10): las reglas puras. Lo que se prueba es lo
 * que Brandon pidió: «saldo si se registran» = lo que queda − lo preliminar
 * pendiente, por especie y por bloque; la anulada, la registrada y la que ya
 * está en el libro no descuentan; el N.º no se repite; la especie se cruza con
 * `claveEspecie` y el bloque es obligatorio sólo con más de uno.
 */
import { describe, it, expect } from "vitest";
import {
  agregarPreliminar,
  aVista,
  avisoDePreliminar,
  cambiarEstadoPreliminar,
  corregirPreliminar,
  guiaDelLibroDe,
  numeroConRegion,
  prepararPreliminar,
  previsualizarGuia,
  resumirPreliminares,
  type DatosListos,
  type EspecieDelSaldo,
  type GtfPreliminar,
  gtfPreliminarGuardadaSchema,
  textoDeLts,
} from "@/lib/forestal/loth-plan-preliminares";

const ESPECIES_PLAN = [{ speciesCommon: "Tornillo (Cedrelinga catenaeformis)" }, { speciesCommon: "Capirona" }];
const SALDO: EspecieDelSaldo[] = [
  { clave: "tornillo", especie: "Tornillo (Cedrelinga catenaeformis)", autorizadoM3: 100, usadoM3: 70, quedaM3: 30 },
  { clave: "capirona", especie: "Capirona", autorizadoM3: null, usadoM3: 5, quedaM3: null },
];
const saldo = { especies: SALDO, total: { quedaM3: 30 }, sinTecho: false };

const ctx = (id: string) => ({ id, por: "qaadmin", at: `2026-10-25T10:00:0${id.length}Z`, enElLibro: null });

const listos = (numeroGtf: string, lineas: DatosListos["lineas"]): DatosListos => ({ numeroGtf, numerosLt: ["2"], fecha: null, lineas, nota: null });

function anotar(lista: GtfPreliminar[], id: string, d: DatosListos): GtfPreliminar[] {
  const r = agregarPreliminar(lista, d, ctx(id));
  if (!r.ok) throw new Error(r.mensaje);
  return r.lista;
}

describe("varias listas de trozas por guía (Brandon 25-10)", () => {
  it("guarda todas las LT y la misma escrita dos veces queda una sola", () => {
    const r = prepararPreliminar(
      { numeroGtf: "19-000015", numerosLt: ["19-000012", " 19-000013 ", "019-0000012"], lineas: [{ especie: "tornillo", trozas: 30, m3: 20 }] },
      ESPECIES_PLAN,
      [],
    );
    expect(r.ok && r.datos.numerosLt).toEqual(["19-000012", "19-000013"]);
  });
  it("lo guardado con UNA sola LT (antes de las varias) se lee como lista", () => {
    const vieja = {
      id: "g1", numeroGtf: "1", numeroLt: "2", fecha: null, lineas: [], nota: null, estado: "anulada", motivoAnulacion: "prueba",
      gtfId: null, creadaPor: "qa", creadaAt: "2026-10-25T20:00:00Z", cambiadaPor: null, cambiadaAt: null, historial: [],
    };
    const p = gtfPreliminarGuardadaSchema.safeParse(vieja);
    expect(p.success && p.data.numerosLt).toEqual(["2"]);
    expect(p.success && "numeroLt" in p.data).toBe(false);
    expect(textoDeLts(["19-000012", "19-000013"])).toBe("19-000012, 19-000013");
  });
});

describe("prepararPreliminar", () => {
  it("cruza la especie por claveEspecie y guarda el nombre del plan", () => {
    const r = prepararPreliminar({ numeroGtf: " 001-0000123 ", numerosLt: ["2"], lineas: [{ especie: "tornillo", trozas: 30, m3: 20.00049 }] }, ESPECIES_PLAN, []);
    expect(r).toEqual({
      ok: true,
      datos: { numeroGtf: "001-0000123", numerosLt: ["2"], fecha: null, nota: null, lineas: [{ especie: "Tornillo (Cedrelinga catenaeformis)", trozas: 30, m3: 20, bloque: null }] },
    });
  });

  it("rechaza la especie que no está en el plan", () => {
    const r = prepararPreliminar({ numeroGtf: "1", numerosLt: ["2"], lineas: [{ especie: "Caoba", trozas: 1, m3: 1 }] }, ESPECIES_PLAN, []);
    expect(r).toEqual({ ok: false, mensaje: "«Caoba» no está en las especies de este plan." });
  });

  it("con un solo bloque lo pone solo; con varios lo exige y tiene que existir", () => {
    const uno = prepararPreliminar({ numeroGtf: "1", numerosLt: ["2"], lineas: [{ especie: "Capirona", trozas: 1, m3: 1 }] }, ESPECIES_PLAN, ["Bloque 1"]);
    expect(uno.ok && uno.datos.lineas[0]!.bloque).toBe("Bloque 1");
    const sinElegir = prepararPreliminar({ numeroGtf: "1", numerosLt: ["2"], lineas: [{ especie: "Capirona", trozas: 1, m3: 1 }] }, ESPECIES_PLAN, ["Bloque 1", "Bloque 2"]);
    expect(sinElegir).toEqual({ ok: false, mensaje: "Elige el bloque de Capirona: el plan tiene 2." });
    const otro = prepararPreliminar({ numeroGtf: "1", numerosLt: ["2"], lineas: [{ especie: "Capirona", trozas: 1, m3: 1, bloque: "Bloque 9" }] }, ESPECIES_PLAN, ["Bloque 1", "Bloque 2"]);
    expect(otro).toEqual({ ok: false, mensaje: "El bloque «Bloque 9» no está en este plan." });
    const bien = prepararPreliminar({ numeroGtf: "1", numerosLt: ["2"], lineas: [{ especie: "Capirona", trozas: 1, m3: 1, bloque: "bloque 2" }] }, ESPECIES_PLAN, ["Bloque 1", "Bloque 2"]);
    expect(bien.ok && bien.datos.lineas[0]!.bloque).toBe("Bloque 2");
  });

  it("la misma especie y bloque dos veces en una guía se rechaza", () => {
    const r = prepararPreliminar(
      { numeroGtf: "1", numerosLt: ["2"], lineas: [{ especie: "Tornillo", trozas: 1, m3: 1 }, { especie: "tornillo (cedrelinga)", trozas: 2, m3: 2 }] },
      ESPECIES_PLAN,
      [],
    );
    expect(r.ok).toBe(false);
  });
});

describe("N.º de GTF repetido", () => {
  it("«001-0000123» y «1-123» son la misma guía: 409", () => {
    const lista = anotar([], "a", listos("001-0000123", [{ especie: "Capirona", trozas: 1, m3: 1, bloque: null }]));
    const r = agregarPreliminar(lista, listos("1-123", [{ especie: "Capirona", trozas: 1, m3: 1, bloque: null }]), ctx("b"));
    expect(r).toMatchObject({ ok: false, status: 409, codigo: "preliminar_repetida" });
    expect(!r.ok && r.mensaje).toContain("ya está anotada en este plan (pendiente)");
  });

  it("una anulada deja volver a anotar el mismo N.º", () => {
    let lista = anotar([], "a", listos("7", [{ especie: "Capirona", trozas: 1, m3: 1, bloque: null }]));
    const anulada = cambiarEstadoPreliminar(lista, "a", { accion: "anular", motivo: "se rompió" }, { por: "qa", at: "x" });
    if (!anulada.ok) throw new Error("no anuló");
    lista = anulada.lista;
    expect(agregarPreliminar(lista, listos("7", [{ especie: "Capirona", trozas: 1, m3: 1, bloque: null }]), ctx("bb")).ok).toBe(true);
  });

  it("corregir al N.º de otra viva también es 409", () => {
    let lista = anotar([], "a", listos("1", [{ especie: "Capirona", trozas: 1, m3: 1, bloque: null }]));
    lista = anotar(lista, "bb", listos("2", [{ especie: "Capirona", trozas: 1, m3: 1, bloque: null }]));
    expect(corregirPreliminar(lista, "bb", listos("001", [{ especie: "Capirona", trozas: 1, m3: 1, bloque: null }]), { por: "qa", at: "x", enElLibro: null })).toMatchObject({
      ok: false,
      status: 409,
    });
  });
});

describe("saldo si se registran", () => {
  const T = "Tornillo (Cedrelinga catenaeformis)";
  const base = () => {
    let lista = anotar([], "a", listos("1", [{ especie: T, trozas: 30, m3: 20, bloque: "Bloque 1" }]));
    lista = anotar(lista, "bb", listos("2", [{ especie: T, trozas: 10, m3: 15, bloque: "Bloque 2" }, { especie: "Capirona", trozas: 4, m3: 3, bloque: "Bloque 1" }]));
    return lista;
  };

  it("resta lo pendiente de lo que queda, por especie y por bloque, y pinta rojo lo que se pasa", () => {
    const vistas = base().map((g) => aVista(g, null));
    const { resumen, porEspecie } = resumirPreliminares(saldo, vistas);
    const tornillo = porEspecie.find((e) => e.clave === "tornillo")!;
    expect(tornillo).toMatchObject({ trozas: 40, m3: 35, quedaM3: 30, quedaSiSeRegistranM3: -5, excede: true });
    expect(tornillo.porBloque).toEqual([
      { bloque: "Bloque 1", trozas: 30, m3: 20 },
      { bloque: "Bloque 2", trozas: 10, m3: 15 },
    ]);
    /* Capirona no tiene techo: se muestra, pero no hay saldo que descontar. */
    expect(porEspecie.find((e) => e.clave === "capirona")).toMatchObject({ m3: 3, quedaSiSeRegistranM3: null, excede: false });
    expect(resumen).toMatchObject({ guias: 2, trozas: 44, m3: 38, quedaTotalM3: 30, quedaSiSeRegistranTotalM3: -5, excede: true });
  });

  it("justo en el techo no se pasa (misma tolerancia del freno)", () => {
    const lista = anotar([], "a", listos("1", [{ especie: T, trozas: 1, m3: 30.0004, bloque: null }]));
    const { porEspecie } = resumirPreliminares(saldo, lista.map((g) => aVista(g, null)));
    expect(porEspecie[0]).toMatchObject({ excede: false });
  });

  it("la anulada y la registrada no descuentan", () => {
    let lista = base();
    const a = cambiarEstadoPreliminar(lista, "a", { accion: "anular", motivo: "mal hecha" }, { por: "qa", at: "x" });
    if (!a.ok) throw new Error("no anuló");
    const b = cambiarEstadoPreliminar(a.lista, "bb", { accion: "registrada" }, { por: "qa", at: "x" });
    if (!b.ok) throw new Error("no registró");
    lista = b.lista;
    const { resumen, porEspecie } = resumirPreliminares(saldo, lista.map((g) => aVista(g, null)));
    expect(resumen).toMatchObject({ guias: 0, m3: 0, quedaSiSeRegistranTotalM3: 30, excede: false });
    expect(porEspecie).toEqual([]);
  });

  it("la pendiente cuyo N.º ya está en el libro no descuenta otra vez (y lo avisa)", () => {
    const lista = base();
    const libro = [{ id: "gtf-9", gtfNumber: "0002", planId: "plan-1" }];
    const vistas = lista.map((g) => aVista(g, guiaDelLibroDe(g.numeroGtf, libro, "plan-1")));
    const { resumen } = resumirPreliminares(saldo, vistas);
    expect(resumen).toMatchObject({ guias: 1, m3: 20, enElLibro: 1, quedaSiSeRegistranTotalM3: 10 });
    expect(avisoDePreliminar(vistas.find((v) => v.id === "bb")!)).toBe("GTF 2 (LT 2): ya está en el libro; confírmala como registrada.");
    expect(avisoDePreliminar(vistas.find((v) => v.id === "a")!)).toBe("GTF 1 (LT 2): falta registrarla en SERFOR y en el libro.");
  });

  it("la vista previa al corregir no cuenta la guía dos veces", () => {
    const vistas = base().map((g) => aVista(g, null));
    const previa = previsualizarGuia(SALDO, vistas, [{ especie: T, trozas: 30, m3: 10, bloque: "Bloque 1" }], "a");
    /* 15 de la otra pendiente + 10 nuevos (no los 20 viejos de «a») → quedan 5. */
    expect(previa).toEqual([expect.objectContaining({ clave: "tornillo", m3: 25, quedaSiSeRegistranM3: 5, excede: false })]);
  });
});

describe("el N.º con la región (Brandon: «pongo GTF 15 y LT 12 y el sistema lo acomoda»)", () => {
  it("Pasco: un dígito, dos dígitos y ceros escritos de más", () => {
    expect(numeroConRegion("5", "19")).toBe("19-000005");
    expect(numeroConRegion("15", "19")).toBe("19-000015");
    expect(numeroConRegion(" 12 ", "19")).toBe("19-000012");
    expect(numeroConRegion("015", "19")).toBe("19-000015");
  });
  it("región de un dígito lleva su cero (Amazonas = 01)", () => {
    expect(numeroConRegion("7", "1")).toBe("01-000007");
  });
  it("sin región, o con el N.º ya completo, se guarda tal cual", () => {
    expect(numeroConRegion("15", "")).toBe("15");
    expect(numeroConRegion("19-000015", "19")).toBe("19-000015");
    expect(numeroConRegion("019-001-0000065", "19")).toBe("019-001-0000065");
  });
});

describe("guía del libro con el mismo N.º", () => {
  it("prefiere la de este plan; si no, la sin plan; nunca la de otro plan", () => {
    const libro = [
      { id: "otro", gtfNumber: "5", planId: "plan-2" },
      { id: "suelta", gtfNumber: "005", planId: null },
    ];
    expect(guiaDelLibroDe("5", libro, "plan-1")).toEqual({ gtfId: "suelta", gtfNumber: "005", sinPlan: true });
    expect(guiaDelLibroDe("5", [...libro, { id: "propia", gtfNumber: "0005", planId: "plan-1" }], "plan-1")).toEqual({ gtfId: "propia", gtfNumber: "0005", sinPlan: false });
    expect(guiaDelLibroDe("6", libro, "plan-1")).toBeNull();
  });

  it("un despacho del libro con el N.º escrito (sin su guía guardada) también la cuenta: no descuenta dos veces", () => {
    // Revisor 25-10: QA forestal tenía 001-0000487 despachada sin ForestGtf; la preliminar «1-487» descontaba otra vez.
    const contada = [{ id: null, gtfNumber: "001-0000487", planId: null }];
    const enLibro = guiaDelLibroDe("1-487", contada, "plan-1");
    expect(enLibro).toEqual({ gtfId: null, gtfNumber: "001-0000487", sinPlan: true });
    const g = { estado: "pendiente", lineas: [{ especie: "Tornillo", trozas: 30, m3: 20, bloque: null }] } as unknown as GtfPreliminar;
    expect(aVista(g, enLibro).cuenta).toBe(false);
  });

  it("al anotar una que ya está en el libro de este plan, nace registrada", () => {
    const r = agregarPreliminar([], listos("5", [{ especie: "Capirona", trozas: 1, m3: 1, bloque: null }]), {
      ...ctx("a"),
      enElLibro: { gtfId: "propia", gtfNumber: "0005", sinPlan: false },
    });
    expect(r).toMatchObject({ ok: true, yaEnElLibro: true, guia: { estado: "registrada", gtfId: "propia" } });
  });
});
