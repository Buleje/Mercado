/**
 * ADR-446 · del Anexo 04 guardado a las líneas de Despacho — con los datos
 * REALES de Blas congelados el 28-09 (`fixtures/adr446-blas-anexos-y-corridas.json`,
 * leídos con BEGIN READ ONLY, sin datos del firmante).
 *
 * La simulación del ADR daba, con el mejor ajuste: ≈95,85 m³ atribuidos y
 * ≈3,21 sin atribuir (piso 3,16: Azúcar huayo 0,92 sin producción + Tornillo
 * corta/tabla/larga angosta sin producción de ese tipo). Estos tests fijan esos
 * números y las reglas que los sostienen (`≤`, nunca `==`).
 */
import { describe, expect, it } from "vitest";
import fixture from "./fixtures/adr446-blas-anexos-y-corridas.json";
import {
  TOL_RESTO_M3,
  claveStockPorDefecto,
  clasificarAnexos,
  gruposDelAnexo,
  proponerDespachoDeAnexo,
  proponerTanda,
  repartirPiezas,
  type AnexoParaDespacho,
  type CorridaOrigen,
  type EstadoDelLibro,
} from "@/lib/forestal/anexo-a-despacho";
import { cubicarPieza, type PiezaCubicada } from "@/lib/forestal/cubicacion";
import { filaNoCuadra, recortarBandeja, type AnexoEmitido } from "@/lib/forestal/anexo04-registro";

type FilaPieza = [number, number, number, number, string | null, number, number];
type FilaPaquete = [string, string, string | null, string | null, number, number, boolean];

const anexos: AnexoParaDespacho[] = fixture.anexos.map((a) => ({
  id: a.id,
  numero: a.numero,
  gtf: a.gtf,
  fecha: a.fecha,
  createdAt: a.createdAt,
  totalM3: a.totalM3,
  totalManualM3: a.totalManualM3,
  especieGlobal: a.especieGlobal ?? undefined,
  ctpEntryId: a.ctpEntryId ?? undefined,
  piezas: (a.piezas as FilaPieza[]).map(
    ([cantidad, espesor, ancho, largo, especie, m3, pieTablar], i): PiezaCubicada => ({
      id: `f${i}`,
      cantidad, espesor, ancho, largo,
      uEspesor: "pulg", uAncho: "pulg", uLargo: "pies",
      especie: especie ?? undefined,
      m3, pieTablar,
    }),
  ),
}));

const corridasBlas: CorridaOrigen[] = fixture.corridas.map((c) => ({
  id: c.id,
  lineNo: c.lineNo,
  fecha: c.fecha,
  especie: c.especie,
  producto: c.producto,
  presentacion: null,
  unidad: c.unidad,
  disponibleM3: c.disponibleM3,
  usado: c.usado,
  sinOrigen: c.sinOrigen,
  duenoMadera: c.duenoMadera,
  titularNombre: c.titularNombre,
  paquetes: (c.paquetes as FilaPaquete[]).map(([id, codigo, producto, presentacion, cantidad, volumenM3, conMedidas]) => ({
    id, codigo, producto, presentacion, cantidad, volumenM3, conMedidas, despachado: false, apartado: false,
  })),
  salidoSinPaquete: [],
}));

function estadoDe(corridas: CorridaOrigen[]): EstadoDelLibro {
  const stock: Record<string, number> = {};
  for (const c of corridas) {
    const k = claveStockPorDefecto(c.producto, c.especie);
    stock[k] = (stock[k] ?? 0) + c.disponibleM3;
  }
  return { corridas, stock };
}

const BLAS = estadoDe(corridasBlas);
const r4 = (n: number) => Math.round(n * 10000) / 10000;
const porGtf = (gtf: string) => anexos.filter((a) => a.gtf === gtf);

describe("anexos pendientes de Blas", () => {
  const cl = clasificarAnexos(anexos, new Set());

  it("9 guías (054 a 064, sin 059 ni 061) y la 064 vale con el anexo de 256 piezas", () => {
    expect(cl.pendientes.map((a) => a.gtf.slice(-3))).toEqual(["054", "055", "056", "057", "058", "060", "062", "063", "064"]);
    const la064 = cl.pendientes.at(-1)!;
    expect(la064.piezas.reduce((a, p) => a + p.cantidad, 0)).toBe(256);
    expect(cl.reemplazados).toHaveLength(1);
    const [viejo] = cl.reemplazados;
    expect(viejo.por).toBe(la064.id);
    expect(porGtf("19-001-0000064").find((a) => a.id === viejo.anexoId)!.piezas.reduce((a, p) => a + p.cantidad, 0)).toBe(251);
    expect(viejo.marcado).toBe(false);
  });

  it("dos números escritos distinto son la misma guía (019-001-… ≡ 19-001-…)", () => {
    const [a] = porGtf("19-001-0000063");
    const copia = { ...a, id: "otra", gtf: "019-001-0000063", createdAt: "2026-09-30T00:00:00.000Z" };
    const c = clasificarAnexos([a, copia], new Set());
    expect(c.pendientes.map((x) => x.id)).toEqual(["otra"]);
    expect(c.reemplazados.map((x) => x.anexoId)).toEqual([a.id]);
  });

  it("un anexo ya registrado no vuelve a pendientes, y el de su misma guía queda reemplazado por él", () => {
    const [viejo, nuevo] = [...porGtf("19-001-0000064")].sort((x, y) => x.createdAt.localeCompare(y.createdAt));
    const c = clasificarAnexos([{ ...viejo, despachoIds: ["d1"] }, nuevo], new Set(["d1"]));
    expect(c.pendientes).toHaveLength(0);
    expect(c.registrados.map((x) => x.id)).toEqual([viejo.id]);
    expect(c.reemplazados[0]).toMatchObject({ anexoId: nuevo.id, por: viejo.id });
  });

  it("si el despacho que lo registró se anuló, el anexo vuelve a estar pendiente", () => {
    const [a] = porGtf("19-001-0000057");
    const c = clasificarAnexos([{ ...a, despachoIds: ["anulado"] }], new Set());
    expect(c.pendientes.map((x) => x.id)).toEqual([a.id]);
  });
});

describe("la tanda de Blas con el mejor ajuste", () => {
  const { pendientes } = clasificarAnexos(anexos, new Set());
  const tanda = proponerTanda(pendientes, BLAS);

  it("99,06 m³ en 9 guías: ≈95,84 atribuido y ≈3,22 sin atribuir (ADR: 95,85 / 3,21; piso 3,16)", () => {
    expect(tanda.resumen.totalM3).toBeCloseTo(99.056, 2);
    expect(tanda.resumen.atribuidoM3).toBeCloseTo(95.84, 1);
    expect(tanda.resumen.sinAtribuirM3).toBeGreaterThanOrEqual(3.159);
    expect(tanda.resumen.sinAtribuirM3).toBeLessThan(3.23);
    expect(r4(tanda.resumen.atribuidoM3 + tanda.resumen.sinAtribuirM3)).toBeCloseTo(tanda.resumen.totalM3, 3);
  });

  it("una línea por especie × tipo × corrida: 67, no 242", () => {
    expect(tanda.resumen.lineas).toBeLessThan(80);
    // Los montones del inventario del 1/08 se parten 13 veces (7 montones distintos).
    expect(tanda.resumen.partidos).toBe(13);
  });

  it("la 064 no se registra sin la producción de Azúcar huayo, y lo dice", () => {
    const la064 = tanda.guias.at(-1)!;
    expect(la064.registrable).toBe(false);
    expect(la064.bloqueos).toEqual([
      expect.objectContaining({ codigo: "SIN_STOCK_DE_LA_ESPECIE", especie: "Azucar huayo", piezas: 16, stockM3: 0 }),
    ]);
    expect(la064.bloqueos[0].m3).toBeCloseTo(0.92, 2);
    expect(la064.bloqueos[0].mensaje).toMatch(/Azucar huayo.*25\/09\/2026 o antes/);
    // Todo lo demás de la 064 tiene origen: su único faltante es esa especie.
    expect(la064.sinAtribuirM3).toBeCloseTo(0.9199, 4);
  });

  it("anotada la producción de Azúcar huayo, la 064 se registra entera", () => {
    const azucar: CorridaOrigen = {
      ...corridasBlas.find((c) => c.lineNo === 44)!,
      id: "azucar", lineNo: 999, especie: "Azucar huayo", fecha: "2026-09-24",
      disponibleM3: 0.92, paquetes: [], sinOrigen: true,
    };
    const conAzucar = estadoDe([...corridasBlas, azucar]);
    const t = proponerTanda(pendientes, conAzucar);
    const la064 = t.guias.at(-1)!;
    expect(la064.registrable).toBe(true);
    expect(la064.sinAtribuirM3).toBeLessThan(0.001);
    expect(la064.lineas.filter((l) => l.especie === "Azucar huayo").map((l) => l.origen?.corridaId)).toEqual(["azucar"]);
  });

  it("ninguna línea atribuye más de lo que declara, ni ninguna corrida sale por encima de su saldo (≤)", () => {
    const porCorrida = new Map<string, number>();
    for (const g of tanda.guias.filter((x) => x.registrable)) {
      for (const l of g.lineas) {
        expect(l.origenM3).toBeLessThanOrEqual(l.m3 + 1e-9);
        if (!l.origen) continue;
        expect(l.origen.fecha <= g.fecha).toBe(true);
        porCorrida.set(l.origen.corridaId, (porCorrida.get(l.origen.corridaId) ?? 0) + l.origenM3);
      }
    }
    for (const [id, m3] of porCorrida) {
      expect(r4(m3)).toBeLessThanOrEqual(corridasBlas.find((c) => c.id === id)!.disponibleM3);
    }
  });

  it("un bulto que se nombra en la línea nunca sale por encima de lo que mide, y el de otro tipo sale entero", () => {
    const paquetes = new Map(corridasBlas.flatMap((c) => c.paquetes.map((p) => [p.id, p] as const)));
    const salidas = new Map<string, number>();
    for (const g of tanda.guias.filter((x) => x.registrable)) {
      for (const l of g.lineas) {
        if (!l.origen?.paqueteId) continue;
        salidas.set(l.origen.paqueteId, (salidas.get(l.origen.paqueteId) ?? 0) + l.origenM3);
        if (l.origen.clase === "paquete") expect(l.origen.restoM3).toBe(0);
      }
    }
    for (const [id, m3] of salidas) expect(r4(m3)).toBeLessThanOrEqual(paquetes.get(id)!.volumenM3 + 1e-9);
  });

  it("el libro declara lo que dice el anexo: por grupo, Σ líneas = m³ y piezas del papel", () => {
    for (const g of tanda.guias) {
      for (const grupo of g.grupos) {
        const lineas = g.lineas.filter((l) => l.grupo === grupo.clave);
        if (!grupo.producto) continue;
        expect(r4(lineas.reduce((a, l) => a + l.m3, 0))).toBeCloseTo(grupo.m3, 4);
        expect(lineas.reduce((a, l) => a + l.piezas, 0)).toBe(grupo.piezas);
      }
    }
  });

  it("054-062 salen del inventario del 1/08 marcado «usado»: el resto del inventario son ≈8,3 m³", () => {
    const inventario = corridasBlas.filter((c) => c.usado && c.fecha === "2026-08-01");
    const total = inventario.reduce((a, c) => a + c.disponibleM3, 0);
    const salido = tanda.guias
      .flatMap((g) => g.lineas)
      .filter((l) => l.origen && inventario.some((c) => c.id === l.origen!.corridaId))
      .reduce((a, l) => a + l.origenM3, 0);
    expect(r4(total - salido)).toBeCloseTo(8.28, 1);
    const resto = [...tanda.usadasConResto, ...tanda.usadasSinGuia].filter((u) => inventario.some((c) => c.id === u.corridaId));
    expect(r4(resto.reduce((a, u) => a + u.restoM3, 0))).toBeCloseTo(r4(total - salido), 3);
    // La #16 no la toma ninguna guía: no se desmarca sola (decisión 4), se muestra.
    expect(tanda.usadasSinGuia.map((u) => u.lineNo)).toContain(16);
    // Los «Ajuste» (#24-27) tampoco.
    expect(tanda.usadasConResto.map((u) => u.lineNo)).not.toContain(24);
  });

  it("la 063 (24/09) sale de la cubicación del 22/09, no de los restos de agosto", () => {
    const la063 = tanda.guias.find((g) => g.gtf.endsWith("063"))!;
    expect(new Set(la063.lineas.map((l) => l.origen?.lineNo))).toEqual(new Set([36]));
  });

  it("una corrida producida después de la guía nunca es su origen", () => {
    const la064 = tanda.guias.at(-1)!;
    expect(la064.lineas.some((l) => l.origen?.lineNo === 61)).toBe(false); // Cachimbo del 27/09
  });
});

describe("el operador cambia el origen", () => {
  const [a060] = porGtf("19-001-0000060");

  it("elige otra corrida para un grupo y la línea sale de ahí", () => {
    const p = proponerDespachoDeAnexo(a060, BLAS, {
      elecciones: [{ especie: "Tornillo", tipo: "Comercial", corridas: [corridasBlas.find((c) => c.lineNo === 20)!.id] }],
    });
    const com = p.lineas.filter((l) => l.tipo === "Comercial");
    expect(com[0].origen?.lineNo).toBe(20);
    expect(p.registrable).toBe(true);
  });

  it("una lista vacía = sin origen: todo el grupo queda sin atribuir, sin forzarlo", () => {
    const p = proponerDespachoDeAnexo(a060, BLAS, { elecciones: [{ especie: "Tornillo", tipo: "Comercial", corridas: [] }] });
    const com = p.lineas.filter((l) => l.tipo === "Comercial");
    expect(com).toHaveLength(1);
    expect(com[0].origen).toBeNull();
    expect(com[0].m3).toBeCloseTo(3.1667, 4);
  });

  it("una corrida de otra especie o posterior a la guía se rechaza con el motivo", () => {
    const cachimbo = corridasBlas.find((c) => c.lineNo === 38)!.id;
    const posterior = corridasBlas.find((c) => c.lineNo === 36)!.id; // 22/09, la guía es del 09/09
    const p = proponerDespachoDeAnexo(a060, BLAS, {
      elecciones: [{ especie: "Tornillo", tipo: "Comercial", corridas: [cachimbo, posterior, "no-existe"] }],
    });
    expect(p.registrable).toBe(false);
    expect(p.bloqueos.map((b) => b.corridaId)).toEqual([cachimbo, posterior, "no-existe"]);
    expect(p.bloqueos.every((b) => b.codigo === "ORIGEN_INVALIDO")).toBe(true);
  });

  it("cada grupo trae las corridas que podrían cubrirlo (para el selector)", () => {
    const p = proponerDespachoDeAnexo(a060, BLAS);
    const com = p.grupos.find((g) => g.tipo === "Comercial")!;
    expect(com.candidatas.map((c) => c.lineNo)).toEqual(expect.arrayContaining([18, 20, 21, 22]));
    expect(com.candidatas.some((c) => c.lineNo === 36)).toBe(false);
  });
});

describe("reglas de las fuentes", () => {
  const base: CorridaOrigen = {
    id: "k", lineNo: 1, fecha: "2026-01-01", especie: "Tornillo", producto: "MADERA ASERRADA (COMERCIAL)",
    presentacion: null, unidad: "m3", disponibleM3: 10, usado: false, sinOrigen: false,
    duenoMadera: null, titularNombre: null, paquetes: [], salidoSinPaquete: [],
  };
  const anexo = (m3: number, largo = 10): AnexoParaDespacho => ({
    id: "a", numero: "1", gtf: "19-001-0000001", fecha: "2026-02-01", createdAt: "2026-02-01T00:00:00Z", totalM3: m3,
    piezas: [{ id: "p", cantidad: 10, espesor: 2, ancho: 8, largo, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies", especie: "Tornillo", m3, pieTablar: 0 }],
  });
  const monton = (volumenM3: number) => ({
    id: "m", codigo: "55", producto: "MADERA ASERRADA (COMERCIAL)", presentacion: null, cantidad: 0, volumenM3,
    conMedidas: false, despachado: false, apartado: false,
  });

  it("un resto de montón de menos de 5 litros no se parte: sale entero", () => {
    const e = estadoDe([{ ...base, disponibleM3: 3.2, paquetes: [monton(3.2)] }]);
    const casi = proponerDespachoDeAnexo(anexo(3.2 - TOL_RESTO_M3 / 2), e).lineas[0];
    expect(casi.origen).toMatchObject({ clase: "monton", codigo: "55", restoM3: 0 });
    const parte = proponerDespachoDeAnexo(anexo(3), e).lineas[0];
    expect(parte.origen?.restoM3).toBeCloseTo(0.2, 4);
  });

  it("un paquete ya despachado o apartado no se ofrece", () => {
    for (const marca of [{ despachado: true }, { apartado: true }]) {
      const e = estadoDe([{ ...base, disponibleM3: 3, paquetes: [{ ...monton(3), ...marca }] }]);
      const p = proponerDespachoDeAnexo(anexo(1), e);
      expect(p.lineas).toHaveLength(1);
      expect(p.lineas[0].origen).toBeNull();
    }
  });

  it("lo que ya salió a nivel corrida se descuenta de los bultos de su tipo", () => {
    const fisico = { ...monton(4), id: "f", codigo: "F1", cantidad: 30, conMedidas: true };
    const e = estadoDe([{ ...base, disponibleM3: 4, paquetes: [fisico], salidoSinPaquete: [{ producto: base.producto, m3: 3 }] }]);
    const p = proponerDespachoDeAnexo(anexo(2), e);
    expect(p.atribuidoM3).toBeCloseTo(1, 4);
    expect(p.lineas.find((l) => l.origen)?.origen?.clase).toBe("corrida");
  });

  it("un bulto físico de otro tipo que su corrida sale entero, en su propia línea con su código", () => {
    const tabla = { ...base, producto: "MADERA ASERRADA (TABLA)" };
    const b = (id: string, v: number) => ({ ...monton(v), id, codigo: id, cantidad: 5, conMedidas: true });
    const e = estadoDe([{ ...tabla, disponibleM3: 1, paquetes: [b("A", 0.5), b("B", 0.3), b("C", 0.2)] }]);
    const p = proponerDespachoDeAnexo(anexo(0.52), e);
    const conOrigen = p.lineas.filter((l) => l.origen);
    // La mochila encuentra 0,3 + 0,2 = 0,5 (o 0,5 solo): nunca parte un bulto.
    expect(r4(conOrigen.reduce((a, l) => a + l.origenM3, 0))).toBeCloseTo(0.5, 4);
    expect(conOrigen.every((l) => l.origen?.clase === "paquete" && l.origen.codigo)).toBe(true);
  });

  it("una corrida en otra unidad no es origen de m³", () => {
    const e = estadoDe([{ ...base, unidad: "pt" }]);
    expect(proponerDespachoDeAnexo(anexo(1), e).atribuidoM3).toBe(0);
  });

  it("una guía bloqueada de la tanda no consume: la siguiente ve el stock entero", () => {
    const e = estadoDe([{ ...base, disponibleM3: 2 }]);
    const conOtra = { ...anexo(1), id: "b", gtf: "19-001-0000002" };
    const invalida = { ...anexo(1), piezas: [{ ...anexo(1).piezas[0], especie: "" }] };
    const t = proponerTanda([invalida, conOtra], e);
    expect(t.guias[0].registrable).toBe(false);
    expect(t.guias[1].atribuidoM3).toBeCloseTo(1, 4);
  });

  it("I3 no distingue tipo: Comercial y Corta de una especie comparten stock", () => {
    expect(claveStockPorDefecto("MADERA ASERRADA (COMERCIAL)", "Tornillo")).toBe(
      claveStockPorDefecto("MADERA ASERRADA (CORTA)", "tornillo"),
    );
  });
});

describe("la propuesta juzga igual que el alta (revisión 28-09)", () => {
  const fila = (cantidad: number, e: number, a: number, l: number, especie: string): PiezaCubicada => {
    const base = { cantidad, espesor: e, ancho: a, largo: l, uEspesor: "pulg" as const, uAncho: "pulg" as const, uLargo: "pies" as const };
    return { id: `p${cantidad}${e}${a}${l}`, ...base, especie, ...cubicarPieza(base) };
  };
  const anexoDe = (piezas: PiezaCubicada[]): AnexoParaDespacho => ({
    id: "a", numero: "1", gtf: "19-001-0000099", fecha: "2026-09-20", createdAt: "2026-09-20T00:00:00Z", totalM3: 0, piezas,
  });
  const corrida = (over: Partial<CorridaOrigen>): CorridaOrigen => ({
    id: "c1", lineNo: 1, fecha: "2026-09-01", especie: "Tornillo", producto: "MADERA ASERRADA (TABLA)", presentacion: null,
    unidad: "m3", disponibleM3: 1, usado: false, sinOrigen: false, duenoMadera: null, titularNombre: null,
    paquetes: [], salidoSinPaquete: [], ...over,
  });

  it("I3 sin tolerancia: 0,9199 pedidos contra 0,919 de stock NO es registrable (el alta lo rechazaría)", () => {
    const piezas = [fila(16, 1, 6, 8, "Azucar huayo")];
    const pedido = r4(piezas[0].m3);
    const stock = r4(pedido - 0.0009);
    const c = corrida({ id: "az", especie: "Azucar huayo", disponibleM3: stock });
    const p = proponerDespachoDeAnexo(anexoDe(piezas), { corridas: [c], stock: { [claveStockPorDefecto(c.producto, c.especie)]: stock } });
    expect(pedido).toBeGreaterThan(stock);
    expect(p.registrable).toBe(false);
    expect(p.bloqueos[0]).toMatchObject({ codigo: "SIN_STOCK_DE_LA_ESPECIE", fechaTope: "2026-09-20" });
    expect(p.bloqueos[0].mensaje).toContain("20/09/2026 o antes");
  });

  it("con Blas y Azúcar huayo anotada a 0,919 (3 decimales), la 064 queda bloqueada", () => {
    const az: CorridaOrigen = {
      ...corridasBlas.find((c) => c.lineNo === 44)!,
      id: "azucar", lineNo: 999, especie: "Azucar huayo", fecha: "2026-09-24", disponibleM3: 0.919, paquetes: [], sinOrigen: true,
    };
    const t = proponerTanda(clasificarAnexos(anexos, new Set()).pendientes, estadoDe([...corridasBlas, az]));
    expect(t.guias.at(-1)!.registrable).toBe(false);
  });

  it("un bulto de otro tipo sale entero, pero su corrida no atribuye más de su saldo (I5)", () => {
    const piezas = [fila(40, 2, 8, 10, "Tornillo")];
    expect(piezas[0].m3).toBeGreaterThan(1);
    const c = corrida({
      disponibleM3: 0.997,
      paquetes: [{ id: "k1", codigo: "K1", producto: "MADERA ASERRADA (COMERCIAL)", presentacion: null, cantidad: 12, volumenM3: 1, conMedidas: true, despachado: false, apartado: false }],
    });
    const p = proponerDespachoDeAnexo(anexoDe(piezas), { corridas: [c], stock: { [claveStockPorDefecto(c.producto, c.especie)]: 5 } });
    const l = p.lineas.find((x) => x.origen?.corridaId === "c1")!;
    expect(l.origen?.clase).toBe("paquete");
    expect(l.origenM3).toBeLessThanOrEqual(0.997);
    expect(r4(p.lineas.reduce((a, x) => a + x.m3, 0))).toBeCloseTo(r4(piezas[0].m3), 4);
  });
});

describe("repartirPiezas y grupos", () => {
  it("reparte sin perder piezas", () => {
    expect(repartirPiezas(118, [3.99, 2.06, 1.72, 0.59, 0.8])).toHaveLength(5);
    expect(repartirPiezas(118, [3.99, 2.06, 1.72, 0.59, 0.8]).reduce((a, b) => a + b, 0)).toBe(118);
    expect(repartirPiezas(7, [0, 0])).toEqual([7, 0]);
  });

  it("agrupa el anexo por especie × tipo en el orden del papel", () => {
    const [a064] = porGtf("19-001-0000064").sort((x, y) => y.createdAt.localeCompare(x.createdAt));
    const g = gruposDelAnexo(a064);
    expect(g.map((x) => `${x.especie}·${x.tipo}`)).toEqual([
      "Cachimbo·Comercial", "Copal·Comercial", "Mashonaste·Comercial", "Mashonaste·Larga angosta",
      "Panguana·Comercial", "Azucar huayo·Comercial",
    ]);
    expect(g.reduce((a, x) => a + x.piezas, 0)).toBe(256);
  });
});

describe("bandeja del anexo (revisión 28-09)", () => {
  const a = (id: string, despachoIds?: string[]) => ({ ...anexos[0], id, despachoIds }) as unknown as AnexoEmitido;

  it("el tope de 200 descarta primero los viejos SIN despachos; uno registrado nunca sale", () => {
    const lista = [a("nuevo"), a("r1", ["d1"]), a("v1"), a("r2", ["d2"]), a("v2")];
    expect(recortarBandeja(lista, 3, "nuevo").map((x) => x.id)).toEqual(["nuevo", "r1", "r2"]);
    // Aunque el tope no alcance: ni los registrados ni el que se está guardando salen.
    expect(recortarBandeja(lista, 1, "nuevo").map((x) => x.id)).toEqual(["nuevo", "r1", "r2"]);
  });

  it("una fila cuyo m³ no sale de sus medidas no cuadra; el redondeo de Blas (≤ 0,0007) sí", () => {
    const base = { id: "p", cantidad: 10, espesor: 2, ancho: 8, largo: 10, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies" } as const;
    const bien = cubicarPieza(base);
    expect(filaNoCuadra({ ...base, ...bien, m3: bien.m3 + 0.0007 })).toBeNull();
    expect(filaNoCuadra({ ...base, ...bien, m3: bien.m3 + 0.002 })).toMatchObject({ calculadoM3: bien.m3 });
    expect(filaNoCuadra({ ...base, ...bien, m3: 50 })).not.toBeNull();
    const malasBlas = anexos.flatMap((x) => x.piezas).filter((p) => filaNoCuadra(p));
    expect(malasBlas).toHaveLength(0);
  });
});
