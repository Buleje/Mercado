/**
 * «¿De qué trozas salió?» — la pantalla de ADR-447 (lo puro y el envío):
 *
 *  - las líneas de la bandeja con Blas CONGELADO el 28-09 (el mismo fixture que
 *    el test del backend): una por arreglo, en el orden en que se resuelven,
 *    lo que deja cada una según la `simulacion` y las decisiones del dueño
 *    como decisiones (nada que se aplique solo);
 *  - la tanda de Blas TRAS corregir las llegadas: el pedido de cada grupo
 *    respeta lo desmarcado y lo dejado sin origen, y avisa el 56 %;
 *  - el envío: tandas de ≤ 15, las `pendiente` se vuelven a pedir sin perder
 *    lo hecho, un 429 espera y reintenta, un 403 corta.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  diagnosticarSinOrigen,
  type ContextoDelPatio,
  type CorridaParaDiagnostico,
  type TrozaParaDiagnostico,
  type VincularTrozasPedido,
} from "@/lib/forestal/vincular-trozas";
import { proponerTandaDeOrigen, simularArreglos } from "@/lib/forestal/origen-en-tanda";
import { lineasDeArreglo, resumenSinOrigen } from "@/components/admin/forestal/ctp-sin-origen-lineas";
import {
  SIN_ELEGIR,
  eleccionesVigentes,
  enTandas,
  estadoDelGrupo,
  loQueVa,
  pedidoDelGrupo,
  textoDeResultado,
  vistaDeCorrida,
} from "@/components/admin/forestal/origen-en-tanda-pantalla";
import { mandarGrupo } from "@/hooks/origen-en-tanda-envio";

interface Fixture {
  corridas: CorridaParaDiagnostico[];
  trozas: TrozaParaDiagnostico[];
  contexto: ContextoDelPatio;
}
const BLAS: Fixture = JSON.parse(readFileSync(join(__dirname, "fixtures/blas-sin-origen-2026-09-28.json"), "utf8"));
const diag = diagnosticarSinOrigen(BLAS.corridas, BLAS.trozas, undefined, { contexto: BLAS.contexto });
const sim = simularArreglos(BLAS.corridas, BLAS.trozas, BLAS.contexto);

/** Blas con las llegadas corregidas a la fecha de su guía: lo que `simularArreglos` mide. */
function blasTrasLlegada() {
  const llegadas = new Map<string, string>();
  for (const c of diag.corridas) {
    if (c.arreglo.tipo !== "corregir_llegada") continue;
    for (const g of c.arreglo.guias) {
      const prev = llegadas.get(g.gtfNumber);
      if (g.propuesta && (!prev || g.propuesta < prev)) llegadas.set(g.gtfNumber, g.propuesta);
    }
  }
  const trozas = BLAS.trozas.map((t) => {
    const p = t.gtfNumber ? llegadas.get(t.gtfNumber) : undefined;
    if (!p || !t.guiaRecibida || t.llegada?.sigueALaGuia === false) return t;
    return t.fechaIngreso && p < t.fechaIngreso ? { ...t, fechaIngreso: p } : t;
  });
  return proponerTandaDeOrigen(BLAS.corridas, trozas, undefined, { contexto: BLAS.contexto });
}

describe("las líneas de la bandeja con Blas (28-09)", () => {
  const lineas = lineasDeArreglo(diag, sim);

  it("44 corridas, 141.874 m³, y una línea por arreglo en el orden en que se resuelven", () => {
    expect(resumenSinOrigen(diag)).toMatchObject({ corridas: 44, m3: 141.8737 });
    expect(lineas.map((l) => l.clave.replace(/-c[a-z0-9]+$/, "-X").replace(/\|.*/, ""))).toEqual([
      "llegada",
      "recibir",
      "tomada-X",
      "tomada-X",
      "permiso-Copaiba",
      "especie-Huayruro Negro",
      "cargar-guia",
      "apertura",
      "sin-madera",
    ]);
    expect(lineas.reduce((a, l) => a + l.corridas.length, 0)).toBe(44);
  });

  it("cada arreglo dice qué hace y lo que deja según el servidor", () => {
    const llegada = lineas.find((l) => l.clave === "llegada")!;
    expect(llegada.texto).toBe("11 corridas figuran antes de que llegue su madera");
    expect(llegada.boton).toBe("Corregir la llegada de 5 guías");
    expect(llegada.deja).toBe(`deja ${sim.trasLlegada.listas} para vincular`);
    expect(llegada.accion.tipo === "corregir_llegada" && llegada.accion.guias.map((g) => g.gtfNumber)).toEqual([
      "010-001-0000005",
      "010-001-0000006",
      "010-001-0000007",
      "010-001-0000008",
      "010-001-0000013",
    ]);
    const recibir = lineas.find((l) => l.clave === "recibir")!;
    expect(recibir.texto).toBe("1 corrida espera la guía 019-001-0000004, sin recibir");
    expect(recibir.deja).toBe(`con las llegadas, deja ${sim.trasRecibir.listas}`);
    const sinMadera = lineas.at(-1)!;
    expect(sinMadera).toMatchObject({ boton: null, texto: "3 corridas sin madera de su especie: Tacho y Machimango" });
  });

  it("lo que depende del dueño es una DECISIÓN: la N.º 61 con las 5 de Cachimbo pasaría el 56 %", () => {
    const decisiones = lineas.filter((l) => l.decision);
    expect(decisiones.map((l) => l.accion.tipo)).toEqual(["soltar_corrida", "soltar_corrida", "corregir_permiso", "corregir_especie"]);
    expect(decisiones.every((l) => l.boton === "Ver y decidir")).toBe(true);
    const cachimbo = decisiones.find((l) => l.texto.includes("Cachimbo"))!;
    expect(cachimbo.texto).toBe("La N.º 61 del 27/09 tiene la madera de 5 corridas de Cachimbo");
    expect(cachimbo.accion.tipo === "soltar_corrida" && cachimbo.accion.juntasPct).toBe(80.5);
    const panguana = decisiones.find((l) => l.texto.includes("Panguana"))!;
    expect(panguana.texto).toBe("La N.º 62 del 27/09, abierta, tiene la madera de 5 corridas de Panguana");
    expect(panguana.accion.tipo === "soltar_corrida" && panguana.accion.juntasPct).toBe(46.9);
    const especie = decisiones.find((l) => l.accion.tipo === "corregir_especie")!;
    expect(especie.texto).toBe("4 corridas de Huayruro Negro: en el patio sólo hay Huayruro");
  });
});

describe("la tanda de Blas tras corregir las llegadas", () => {
  const p = blasTrasLlegada();

  it("sin tocar nada, lo que viaja grupo por grupo es exactamente el pedido del servidor", () => {
    expect(p.vinculables).toBe(11);
    const porGrupo = p.grupos.flatMap((g) => pedidoDelGrupo(g, SIN_ELEGIR, {}));
    const orden = (xs: VincularTrozasPedido[]) => [...xs].sort((a, b) => a.corridaId.localeCompare(b.corridaId));
    expect(orden(porGrupo)).toEqual(orden(p.pedido));
    expect(loQueVa(p, SIN_ELEGIR, {}).corridas).toBe(11);
  });

  it("desmarcar una troza la saca del pedido y sube el rendimiento; «sin origen» saca la corrida", () => {
    const g = p.grupos.find((x) => x.corridas.some((c) => c.trozas.length >= 2))!;
    const c = g.corridas.find((x) => x.trozas.length >= 2)!;
    const fuera = c.trozas[0]!.trozaId;
    const e = { desmarcadas: new Set([fuera]), sinOrigen: new Set<string>() };
    const pedido = pedidoDelGrupo(g, e, {});
    expect(pedido.find((x) => x.corridaId === c.corridaId)!.trozaIds).not.toContain(fuera);
    expect(vistaDeCorrida(c, e).rendimientoPct!).toBeGreaterThan(vistaDeCorrida(c, SIN_ELEGIR).rendimientoPct!);
    const sin = { desmarcadas: new Set<string>(), sinOrigen: new Set([c.corridaId]) };
    expect(pedidoDelGrupo(g, sin, {}).map((x) => x.corridaId)).not.toContain(c.corridaId);
    expect(vistaDeCorrida(c, sin).porQueNo).toBe("Queda sin origen: no se vincula.");
  });

  it("avisa el 56 % (N.º 55 y 59 de Mashonaste) y lo vinculado ya no viaja", () => {
    const mashonaste = p.grupos.find((g) => g.especie === "Mashonaste")!;
    const sobre = mashonaste.corridas.filter((c) => vistaDeCorrida(c, SIN_ELEGIR).sobreElTope).map((c) => c.lineNo);
    expect(sobre).toEqual(expect.arrayContaining([55, 59]));
    expect(estadoDelGrupo(mashonaste, SIN_ELEGIR, {}).texto).toBe("Pasa el 56 %");
    const hecha = mashonaste.corridas[0]!;
    const res = {
      [hecha.corridaId]: { corridaId: hecha.corridaId, lineNo: hecha.lineNo, estado: "vinculada" as const, trozas: 1, m3: 1, lotesArmados: [], rendimientoPct: 50, sobreElTope: false },
    };
    expect(pedidoDelGrupo(mashonaste, SIN_ELEGIR, res).map((x) => x.corridaId)).not.toContain(hecha.corridaId);
  });

  it("releer suelta lo elegido que ya no está en la propuesta", () => {
    const vivo = p.grupos[0]!.corridas[0]!;
    const e = eleccionesVigentes(p, { desmarcadas: new Set(["ya-no", vivo.trozas[0]!.trozaId]), sinOrigen: new Set(["otra", vivo.corridaId]) });
    expect([...e.desmarcadas]).toEqual([vivo.trozas[0]!.trozaId]);
    expect([...e.sinOrigen]).toEqual([vivo.corridaId]);
  });
});

describe("el envío de un grupo", () => {
  afterEach(() => vi.unstubAllGlobals());

  const pedido = Array.from({ length: 17 }, (_, i) => ({ corridaId: `c${i}`, trozaIds: [`t${i}`] }));
  const vinculada = (id: string) => ({ corridaId: id, lineNo: null, estado: "vinculada", trozas: 1, m3: 0.5, lotesArmados: [], rendimientoPct: 40, sobreElTope: false });
  function canales() {
    const puestos: string[] = [];
    const esperas: number[] = [];
    return {
      puestos,
      esperas,
      io: {
        cortar: () => false,
        poner: (rs: readonly { corridaId: string; estado: string }[]) => puestos.push(...rs.map((r) => `${r.corridaId}:${r.estado}`)),
        avisar: vi.fn(),
        esperar: async (seg: number) => {
          esperas.push(seg);
        },
        lineNoDe: () => null,
      },
    };
  }
  const respuesta = (status: number, cuerpo: unknown) =>
    new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });
  const cuerpoDe = (init?: RequestInit) => JSON.parse(String(init?.body)) as { tanda: VincularTrozasPedido[] };

  it("parte en tandas de 15 y vuelve a pedir SÓLO las pendientes, sin perder lo hecho", async () => {
    expect(enTandas(pedido).map((t) => t.length)).toEqual([15, 2]);
    const tamanios: number[] = [];
    let llamada = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const { tanda } = cuerpoDe(init);
        tamanios.push(tanda.length);
        llamada++;
        const corridas = tanda.map((p, i) =>
          llamada === 1 && i >= 13 ? { corridaId: p.corridaId, lineNo: null, estado: "pendiente" } : vinculada(p.corridaId),
        );
        return respuesta(200, { ok: true, tanda: { corridas, resumen: {} } });
      }),
    );
    const { io, puestos, esperas } = canales();
    const r = await mandarGrupo(pedido, io);
    expect(tamanios).toEqual([15, 2, 2]);
    expect(r).toMatchObject({ corta: false, vinculadas: 17 });
    expect(puestos.filter((x) => x.endsWith(":pendiente"))).toEqual(["c13:pendiente", "c14:pendiente"]);
    expect(esperas).toEqual([1]);
  });

  it("un 429 espera lo que pide el servidor y reintenta la MISMA parte; un 403 corta", async () => {
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        n++;
        if (n === 1) return respuesta(429, { error: "rate_limited", retryAfter: 7 });
        return respuesta(200, { ok: true, tanda: { corridas: cuerpoDe(init).tanda.map((p) => vinculada(p.corridaId)), resumen: {} } });
      }),
    );
    const a = canales();
    const r = await mandarGrupo(pedido.slice(0, 3), a.io);
    expect(a.esperas).toEqual([7]);
    expect(r.vinculadas).toBe(3);
    expect(a.io.avisar).toHaveBeenCalledWith(expect.stringMatching(/espera 7 s/));

    vi.stubGlobal("fetch", vi.fn(async () => respuesta(403, { ok: false, error: "forbidden", message: "Sólo el dueño." })));
    const b = canales();
    const r2 = await mandarGrupo(pedido, b.io);
    expect(r2).toMatchObject({ corta: true, vinculadas: 0 });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it("dice qué pasó con cada corrida, también la que quedó pendiente", () => {
    expect(textoDeResultado(vinculada("x") as never)).toBe("Vinculada: 1 troza · 0.500 m³ · rinde 40 %.");
    expect(textoDeResultado({ corridaId: "x", lineNo: 1, estado: "pendiente" })).toMatch(/se vuelve a pedir/);
  });
});
