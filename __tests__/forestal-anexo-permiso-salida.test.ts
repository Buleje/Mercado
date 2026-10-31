/**
 * ADR-519 · decisión 3 — «Permiso en la salida»: un Anexo 04 que salió de un
 * permiso sólo se atribuye a corridas de ESE permiso.
 *
 * Antes: el mejor ajuste de `proponerDespachoDeAnexo` elegía la corrida que
 * cubría justo el grupo, fuera del permiso que fuera — la guía del permiso A
 * quedaba atada a la producción del permiso B. Ahora:
 *  · con permiso, sólo corridas de su permiso (`mismoPermiso`, el criterio de
 *    `vincularCorridaEnTx`); lo que no alcanza queda en `sinAtribuirM3` (`≤`);
 *  · sin permiso (los anexos de antes), igual que siempre;
 *  · elegir a mano una corrida de otro permiso bloquea con PERMISO_DISTINTO, y
 *    la transacción de `registrarTanda` lo vuelve a mirar BAJO los locks;
 *  · reasignar después el origen a mano (`setOrigenes`) tampoco lo cruza;
 *  · una corrida reaserrada hereda el permiso de sus corridas de origen;
 *  · la línea sin origen dice el motivo verdadero («no hay del permiso X»).
 *
 * La parte de base corre contra op-qa-ui (Blas no se toca), con prefijo
 * `TEST-A519P-` purgado antes y después:
 *   node --env-file=.env.local node_modules/.bin/vitest run --no-file-parallelism __tests__/forestal-anexo-permiso-salida.test.ts
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

process.env.AUDIT_CHAIN_ENABLED ??= "false";

import {
  claveStockPorDefecto,
  corridasDeOtroPermiso,
  faltaConfirmar,
  permisoAjeno,
  proponerDespachoDeAnexo,
  type AnexoParaDespacho,
  type ConfirmoDeGuia,
  type CorridaOrigen,
  type EstadoDelLibro,
} from "@/lib/forestal/anexo-a-despacho";
import { construirEmision, type AnexoEmitido } from "@/lib/forestal/anexo04-registro";
import { anexoGuardadoDelPermiso } from "@/lib/forestal/anexo-del-permiso-guardado";
import { cubicarPieza, type PiezaCubicada } from "@/lib/forestal/cubicacion";
import { prisma } from "@/lib/prisma";
import { ForestCtpDB } from "@/lib/db/forest-ctp.db";
import { ForestCtpCierreDB } from "@/lib/db/forest-ctp-cierre.db";
import { ForestAnexosDB, claveAnexos, normalizarAnexos } from "@/lib/db/forest-anexos.db";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { ForestCtpGuiaDesdeAnexoDB, type ResultadoTanda } from "@/lib/db/forest-ctp-guia-desde-anexo.db";
import { ForestCtpDespachoDB } from "@/lib/db/forest-ctp-despacho.db";
import { permisosDeCorridasPorId } from "@/lib/db/forest-ctp-permiso-corrida";

const r4 = (n: number) => Math.round(n * 10000) / 10000;
const A = "10-HUA-PUE/PER-FMP-2026-007";
const B = "CON-25-UCA-0142";

const fila = (cantidad: number, e: number, a: number, l: number, especie: string): PiezaCubicada => {
  const base = { cantidad, espesor: e, ancho: a, largo: l, uEspesor: "pulg" as const, uAncho: "pulg" as const, uLargo: "pies" as const };
  return { id: `p${cantidad}${e}${a}${l}`, ...base, especie, ...cubicarPieza(base) };
};
const PIEZAS = [fila(16, 1, 6, 8, "Tornillo")];
/** Con 3 decimales, como lo declara el papel (`redondearA3`). */
const PEDIDO = Math.round(PIEZAS[0].m3 * 1000) / 1000;
const anexoDe = (permiso?: string | null): AnexoParaDespacho => ({
  id: "a", numero: "1", gtf: "19-001-0000099", fecha: "2026-09-20", createdAt: "2026-09-20T00:00:00Z", totalM3: PEDIDO,
  piezas: PIEZAS, ...(permiso !== undefined ? { permiso } : {}),
});
const corrida = (over: Partial<CorridaOrigen>): CorridaOrigen => ({
  id: "c1", lineNo: 1, fecha: "2026-09-01", especie: "Tornillo", producto: "MADERA ASERRADA (TABLA)", presentacion: null,
  unidad: "m3", disponibleM3: 1, usado: false, sinOrigen: false, duenoMadera: null, titularNombre: null,
  paquetes: [], salidoSinPaquete: [], ...over,
});
/** I3 es del producto + especie, sin permiso: el stock suma las dos corridas. */
const estadoDe = (corridas: CorridaOrigen[]): EstadoDelLibro => ({
  corridas,
  stock: { [claveStockPorDefecto("MADERA ASERRADA (TABLA)", "Tornillo")]: r4(corridas.reduce((s, c) => s + c.disponibleM3, 0)) },
});
const ref = (codigo: string, contratoId: string | null = null) => ({ contratoId, codigo });

/* La del permiso B cubre JUSTO el grupo (la primera regla del mejor ajuste);
   la del A lo cubre con sobra. Es el cruce que había. */
const delA = corrida({ id: "cA", lineNo: 1, disponibleM3: r4(PEDIDO + 5), permisos: [ref(A)] });
const delB = corrida({ id: "cB", lineNo: 2, disponibleM3: PEDIDO, permisos: [ref(B)] });

describe("ADR-519 · la propuesta de despacho respeta el permiso del anexo", () => {
  it("sin permiso en el anexo, el mejor ajuste cruza al permiso B (lo de antes)", () => {
    const p = proponerDespachoDeAnexo(anexoDe(), estadoDe([delA, delB]));
    expect(p.lineas.map((l) => l.origen?.corridaId)).toEqual(["cB"]);
  });

  it("con el permiso A, sale sólo de la corrida del A: ya no se cruza", () => {
    const p = proponerDespachoDeAnexo(anexoDe(A), estadoDe([delA, delB]));
    expect(p.lineas.map((l) => l.origen?.corridaId)).toEqual(["cA"]);
    expect(p.atribuidoM3).toBe(PEDIDO);
    expect(p.sinAtribuirM3).toBe(0);
    expect(p.registrable).toBe(true);
    /* Ni la ofrece para cambiar el origen. */
    expect(p.grupos[0].candidatas.map((c) => c.corridaId)).toEqual(["cA"]);
  });

  it("lo que su permiso no alcanza queda sin atribuir (≤): nunca se completa con el B", () => {
    const poco = corrida({ id: "cA", lineNo: 1, disponibleM3: r4(PEDIDO / 2), permisos: [ref(A)] });
    const p = proponerDespachoDeAnexo(anexoDe(A), estadoDe([poco, delB]));
    expect(p.lineas.filter((l) => l.origen).map((l) => l.origen!.corridaId)).toEqual(["cA"]);
    expect(p.atribuidoM3).toBe(r4(PEDIDO / 2));
    expect(p.sinAtribuirM3).toBe(r4(PEDIDO - PEDIDO / 2));
    expect(p.atribuidoM3).toBeLessThanOrEqual(p.totalM3);
    expect(p.sinOrigenPorConfirmar).toBe(true);
  });

  it("un anexo sin permiso da EXACTAMENTE la misma propuesta que antes del campo", () => {
    const sinCampo = [delA, delB].map(({ permisos: _p, ...c }) => c as CorridaOrigen);
    expect(proponerDespachoDeAnexo(anexoDe(), estadoDe([delA, delB]))).toEqual(proponerDespachoDeAnexo(anexoDe(), estadoDe(sinCampo)));
    expect(proponerDespachoDeAnexo(anexoDe(null), estadoDe([delA, delB]))).toEqual(proponerDespachoDeAnexo(anexoDe(), estadoDe(sinCampo)));
  });

  it("elegir a mano la corrida del B bloquea con PERMISO_DISTINTO y dice cuál y de qué permiso", () => {
    const p = proponerDespachoDeAnexo(anexoDe(A), estadoDe([delA, delB]), {
      elecciones: [{ especie: "Tornillo", tipo: p0Tipo(), corridas: ["cB"] }],
    });
    expect(p.registrable).toBe(false);
    expect(p.bloqueos).toHaveLength(1);
    expect(p.bloqueos[0]).toMatchObject({ codigo: "PERMISO_DISTINTO", corridaId: "cB" });
    expect(p.bloqueos[0].mensaje).toContain("corrida N° 2");
    expect(p.bloqueos[0].mensaje).toContain(B);
    expect(p.bloqueos[0].mensaje).toContain(A);
    expect(p.atribuidoM3).toBe(0);
  });

  it("permisoAjeno usa el criterio de vincular: sin dato no decide, código normalizado, mezcla = ajena", () => {
    expect(permisoAjeno(corrida({}), A)).toBeNull();
    expect(permisoAjeno(corrida({ permisos: [] }), A)).toBeNull();
    expect(permisoAjeno(delB, null)).toBeNull();
    expect(permisoAjeno(delB, "  ")).toBeNull();
    expect(permisoAjeno(corrida({ permisos: [ref(` ${A.toLowerCase()} `, "k1")] }), A)).toBeNull();
    expect(permisoAjeno(corrida({ permisos: [ref(A), ref(B)] }), A)).toEqual(ref(B));
  });

  it("corridasDeOtroPermiso (lo que la tx mira bajo los locks) nombra sólo las ajenas pedidas", () => {
    const e = estadoDe([delA, delB, corrida({ id: "cS", lineNo: 3 })]);
    expect(corridasDeOtroPermiso(e, A, ["cA", "cB", "cS", "no-existe"])).toEqual([{ corridaId: "cB", lineNo: 2, permiso: B }]);
    expect(corridasDeOtroPermiso(e, null, ["cB"])).toEqual([]);
  });
});

/** El tipo que el anexo le da a `PIEZAS` (la clave de la elección). */
function p0Tipo() {
  return proponerDespachoDeAnexo(anexoDe(), estadoDe([delA])).grupos[0].tipo;
}

describe("ADR-519 · el anexo guarda su permiso", () => {
  const datos = { numero: "7", gtf: "19-001-7", empresa: "", firmante: "", documento: "", cargo: "", observaciones: "", unidadV: "pt" as const, modo: "oficial" as const };

  it("construirEmision guarda el permiso recortado, y nada si viene vacío", () => {
    expect(construirEmision({ datos, piezas: PIEZAS, permiso: `  ${A} ` }).permiso).toBe(A);
    expect("permiso" in construirEmision({ datos, piezas: PIEZAS, permiso: " " })).toBe(false);
    expect("permiso" in construirEmision({ datos, piezas: PIEZAS })).toBe(false);
  });

  it("la Distribución no toma como suyo el anexo guardado de OTRO permiso con las mismas medidas", () => {
    const deB: AnexoEmitido = { ...construirEmision({ datos, piezas: PIEZAS, permiso: B }), id: "b" };
    const viejo: AnexoEmitido = { ...construirEmision({ datos, piezas: PIEZAS }), id: "v" };
    expect(anexoGuardadoDelPermiso(PIEZAS, [deB], A)).toBeNull();
    expect(anexoGuardadoDelPermiso(PIEZAS, [deB], B)?.id).toBe("b");
    expect(anexoGuardadoDelPermiso(PIEZAS, [deB, viejo], A)?.id).toBe("v");
    /* Sin permiso pedido, como antes: por contenido. */
    expect(anexoGuardadoDelPermiso(PIEZAS, [deB])?.id).toBe("b");
  });
});

describe("ADR-519 · el motivo de una línea sin origen es el verdadero", () => {
  it("había madera pero de otro permiso: la línea y el aviso lo dicen, no «falta producción»", () => {
    const p = proponerDespachoDeAnexo(anexoDe(A), estadoDe([delB]));
    const sinOrigen = p.lineas.filter((l) => !l.origen);
    expect(sinOrigen).toHaveLength(1);
    expect(sinOrigen[0].sinCorridaDelPermiso).toBe(A);
    const [aviso] = faltaConfirmar(p);
    expect(aviso.codigo).toBe("FALTA_CONFIRMAR_SIN_ORIGEN");
    expect(aviso.mensaje).toContain(`corrida de origen del permiso ${A}`);
    expect(aviso.mensaje).toContain("las de otro permiso no valen");
    expect(aviso.mensaje).not.toContain("la producción que falta");
  });

  it("si no había madera de ningún permiso, el motivo sigue siendo el de siempre", () => {
    const sinCorridas: EstadoDelLibro = { corridas: [], stock: estadoDe([delB]).stock };
    const p = proponerDespachoDeAnexo(anexoDe(A), sinCorridas);
    expect(p.lineas.filter((l) => !l.origen).map((l) => "sinCorridaDelPermiso" in l)).toEqual([false]);
    expect(faltaConfirmar(p)[0].mensaje).toContain("anota antes la producción que falta");
  });
});

/* Un doble del cliente de Prisma: filtra por `id`/`destinoEntryId`/`ctpEntryId` `in`. */
type Fila = Record<string, unknown>;
const tabla = (filas: Fila[], campo: string) => ({
  findMany: async ({ where }: { where: Record<string, { in: string[] } | string> }) => {
    const enLista = (where[campo] as { in: string[] }).in;
    return filas.filter((f) => enLista.includes(f[campo] as string));
  },
});
const lectorDe = (d: { corridas?: Fila[]; consumos?: Fila[]; reprocesos?: Fila[]; guias?: Fila[]; contratos?: Fila[] }) =>
  ({
    forestCtpEntry: tabla(d.corridas ?? [], "id"),
    forestCtpConsumo: tabla(d.consumos ?? [], "ctpEntryId"),
    forestCtpReproceso: tabla(d.reprocesos ?? [], "destinoEntryId"),
    woodEntry: tabla(d.guias ?? [], "id"),
    forestContrato: tabla(d.contratos ?? [], "id"),
  }) as unknown as Parameters<typeof permisosDeCorridasPorId>[0];

describe("ADR-519 · una corrida reaserrada hereda el permiso de la madera de la que salió", () => {
  it("sin permiso propio ni guías: toma el de su corrida de origen (y la de ésta, hacia atrás)", async () => {
    const lector = lectorDe({
      corridas: [
        { id: "re", contratoId: null, originCode: null },
        { id: "medio", contratoId: null, originCode: null },
        { id: "base", contratoId: null, originCode: null },
        { id: "otra", contratoId: null, originCode: B },
      ],
      consumos: [{ ctpEntryId: "base", woodEntryId: "w1" }],
      guias: [{ id: "w1", contratoId: "k1", originCode: "lo que tipeó" }],
      contratos: [{ id: "k1", codigo: A, deletedAt: null }],
      reprocesos: [
        { destinoEntryId: "re", origenEntryId: "medio" },
        { destinoEntryId: "medio", origenEntryId: "base" },
        { destinoEntryId: "mixta", origenEntryId: "base" },
        { destinoEntryId: "mixta", origenEntryId: "otra" },
      ],
    });
    const m = await permisosDeCorridasPorId(lector, "t", ["re"]);
    expect(m.get("re")).toEqual([{ contratoId: "k1", codigo: A }]);
    expect(permisoAjeno({ permisos: m.get("re") }, A)).toBeNull();
    expect(permisoAjeno({ permisos: m.get("re") }, B)).toEqual({ contratoId: "k1", codigo: A });
  });

  it("de dos orígenes con permisos distintos: no sirve a ninguna guía con permiso", async () => {
    const lector = lectorDe({
      corridas: [
        { id: "mixta", contratoId: null, originCode: null },
        { id: "deA", contratoId: null, originCode: A },
        { id: "deB", contratoId: null, originCode: B },
      ],
      reprocesos: [
        { destinoEntryId: "mixta", origenEntryId: "deA" },
        { destinoEntryId: "mixta", origenEntryId: "deB" },
      ],
    });
    const m = await permisosDeCorridasPorId(lector, "t", ["mixta"]);
    expect(m.get("mixta")?.map((p) => p.codigo).sort()).toEqual([A, B].sort());
    expect(permisoAjeno({ permisos: m.get("mixta") }, A)).toEqual(ref(B));
    expect(permisoAjeno({ permisos: m.get("mixta") }, B)).toEqual(ref(A));
  });

  it("sin reprocesos ni datos: lista vacía (sin dato no decide, como antes)", async () => {
    const m = await permisosDeCorridasPorId(lectorDe({ corridas: [{ id: "x", contratoId: null, originCode: " " }] }), "t", ["x"]);
    expect(m.get("x")).toEqual([]);
  });
});

// ── Contra la base (op-qa-ui) ─────────────────────────────────────────────
// Correr sin `--file-parallelism` junto al test de ADR-446: comparten la bandeja.

const T = "cmtqtncxz001vs8vze4o3y7j9"; // …-op-qa-ui
const PREFIJO = "TEST-A519P-";
const runId = Math.random().toString(36).slice(2, 7);
const P = `${PREFIJO}${runId}`;
const COMERCIAL = "MADERA ASERRADA (COMERCIAL)";
const PERM_A = `${P}-PERM-A`;
const PERM_B = `${P}-PERM-B`;
/** Una especie por caso: lo que un caso deja en el stock no lo toma otro (ni su reintento). */
const especieDe = (caso: string) => `A519P ${runId} ${caso}`;

async function purgar() {
  const linea = { tenantId: T, createdBy: { startsWith: PREFIJO } };
  await prisma.forestCtpDespachoOrigen.deleteMany({
    where: { tenantId: T, OR: [{ despacho: linea }, { produccion: linea }, { createdBy: { startsWith: PREFIJO } }] },
  });
  await prisma.forestCtpPaquete.deleteMany({ where: { tenantId: T, codigo: { startsWith: PREFIJO } } });
  await prisma.forestCtpEntry.deleteMany({ where: linea });
  await prisma.activityLog.deleteMany({ where: { tenantId: T, user: { startsWith: PREFIJO } } });
  await PlatformSettingsDB.actualizar<unknown, null>(claveAnexos(T), (actual) => {
    const lista = normalizarAnexos(actual);
    const quedan = lista.filter((a) => !a.numero.startsWith(PREFIJO));
    return quedan.length === lista.length ? { resultado: null } : { valor: quedan, resultado: null };
  });
}

const HAS_DB: boolean = await prisma
  .$queryRaw`SELECT 1`
  .then(() => prisma.tenant.count({ where: { id: T } }))
  .then((n) => n === 1)
  .catch(() => false);

beforeAll(async () => {
  if (HAS_DB) await purgar();
}, 60_000);

afterAll(async () => {
  if (!HAS_DB) return;
  try {
    await purgar();
  } catch (err) {
    console.error(`\n🔴 LA LIMPIEZA FALLÓ — quedan datos ${PREFIJO} en op-qa-ui.\n`, err);
    throw err;
  }
}, 60_000);

afterEach(() => {
  vi.restoreAllMocks();
});

const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
/** El otro test de base (ADR-446) usa la MISMA bandeja de op-qa-ui: si corren a
 *  la vez, su tanda la tiene tomada y el guardado/registro de acá vuelve con
 *  TANDA_EN_CURSO. Se reintenta en vez de fallar (no es lo que se prueba). */
const MAX_INTENTOS = 12;
const tandaAjena = (r: ResultadoTanda) => r.guias[0]?.estado === "error" && r.guias[0].codigo === "TANDA_EN_CURSO";
async function sinTandaAjena<R>(fn: () => Promise<R>, ocupada: (r: R) => boolean = () => false): Promise<R> {
  for (let intento = 1; ; intento++) {
    try {
      const r = await fn();
      if (!ocupada(r) || intento >= MAX_INTENTOS) return r;
    } catch (err) {
      if (!(err instanceof Error && "code" in err && err.code === "TANDA_EN_CURSO") || intento >= MAX_INTENTOS) throw err;
    }
    await esperar(3000);
  }
}
const registrar = (anexoId: string, confirmo?: ConfirmoDeGuia) =>
  sinTandaAjena(() => ForestCtpGuiaDesdeAnexoDB.registrarGuia(T, anexoId, { user: P, confirmo }), tandaAjena);

let n = 0;
const gtf = () => `19-519-${runId}${String(++n).padStart(4, "0")}`;
/** Comercial de 2"×8"×10' (13,33 pt c/u), con su propia cantidad (dos papeles iguales serían una duda). */
const comercial = (pz: number, especie: string): PiezaCubicada => {
  const base = { cantidad: pz, espesor: 2, ancho: 8, largo: 10, uEspesor: "pulg" as const, uAncho: "pulg" as const, uLargo: "pies" as const };
  return { id: `q${++n}`, ...base, especie, ...cubicarPieza(base) };
};
const corridaDe = (especie: string, permiso: string, quantity: number) =>
  ForestCtpDB.create(T, {
    section: "produccion",
    entryDate: new Date("2026-08-01T17:00:00.000Z"),
    speciesCommon: especie,
    productType: COMERCIAL,
    volumeInputM3: quantity * 2,
    quantity,
    unit: "m3",
    originCode: permiso,
    createdBy: P,
  });
const anexoGuardado = (numero: string, piezas: PiezaCubicada[], permiso: string) =>
  sinTandaAjena(() =>
    ForestAnexosDB.save(
      T,
      {
        fecha: "2026-08-20",
        permiso,
        datos: { numero: `${P}-${numero}`, gtf: gtf(), empresa: "QA", firmante: "QA", documento: "", cargo: "", observaciones: "", unidadV: "pt", modo: "oficial" },
        piezas,
      },
      P,
    ),
  );

describe.skipIf(!HAS_DB)("ADR-519 · registrar la guía de un permiso (op-qa-ui)", () => {
  it("dos permisos con madera: la guía del A queda atada a la corrida del A", async () => {
    const E = especieDe("uno");
    const piezas = [comercial(30, E)];
    const m3 = r4(piezas[0].m3);
    const cA = await corridaDe(E, PERM_A, r4(m3 + 3));
    const cB = await corridaDe(E, PERM_B, m3); // la que cubre justo: el mejor ajuste la elegía
    const anexo = await anexoGuardado("1", piezas, PERM_A);
    expect(anexo.permiso).toBe(PERM_A);

    const r = await registrar(anexo.id);
    const g = r.guias[0];
    expect(g.estado).toBe("registrada");
    if (g.estado !== "registrada") return;
    expect(g.despachos.map((d) => d.corridaLineNo)).toEqual([cA.lineNo]);
    expect(g.despachos.map((d) => d.corridaLineNo)).not.toContain(cB.lineNo);
    const origenes = await prisma.forestCtpDespachoOrigen.findMany({
      where: { tenantId: T, despachoEntryId: { in: g.despachos.map((d) => d.id) } },
      select: { produccionEntryId: true },
    });
    expect(origenes.map((o) => o.produccionEntryId)).toEqual([cA.id]);
  }, 120_000);

  it("reasignar a mano el origen a una corrida del B: PERMISO_DISTINTO y no cambia; a otra del A, sí", async () => {
    const E = especieDe("dos");
    const piezas = [comercial(32, E)];
    const m3 = r4(piezas[0].m3);
    const cA = await corridaDe(E, PERM_A, r4(m3 + 1));
    const anexo = await anexoGuardado("2", piezas, PERM_A);
    const r = await registrar(anexo.id);
    const g = r.guias[0];
    expect(g.estado).toBe("registrada");
    if (g.estado !== "registrada") return;
    const d = g.despachos[0];
    const cB = await corridaDe(E, PERM_B, r4(m3 + 1));
    const otraA = await corridaDe(E, PERM_A, r4(m3 + 1));

    const rechazo = await ForestCtpDespachoDB.setOrigenes(T, d.id, [{ produccionEntryId: cB.id, quantity: d.origenM3 }], P).then(
      () => null,
      (err: unknown) => err as { code?: string; message?: string },
    );
    expect(rechazo?.code).toBe("PERMISO_DISTINTO");
    expect(rechazo?.message).toContain(`corrida N° ${cB.lineNo}`);
    expect(rechazo?.message).toContain(PERM_B);
    expect(rechazo?.message).toContain(PERM_A);
    const siguen = await prisma.forestCtpDespachoOrigen.findMany({ where: { tenantId: T, despachoEntryId: d.id }, select: { produccionEntryId: true } });
    expect(siguen.map((o) => o.produccionEntryId)).toEqual([cA.id]);

    const ok = await ForestCtpDespachoDB.setOrigenes(T, d.id, [{ produccionEntryId: otraA.id, quantity: d.origenM3 }], P);
    expect(ok.map((o) => o.produccionEntryId)).toEqual([otraA.id]);
  }, 120_000);

  it("sin corrida de su permiso (sí del B): la línea queda sin origen y dice el motivo verdadero", async () => {
    const E = especieDe("tres");
    const piezas = [comercial(33, E)];
    const cB = await corridaDe(E, PERM_B, r4(r4(piezas[0].m3) + 1));
    const anexo = await anexoGuardado("3", piezas, PERM_A);
    const r = await registrar(anexo.id, { sinOrigenM3: 1e5, usadas: [] });
    const g = r.guias[0];
    expect(g.estado).toBe("registrada");
    if (g.estado !== "registrada") return;
    expect(g.despachos.map((d) => d.corridaLineNo)).toEqual([null]);
    const fila = await prisma.forestCtpEntry.findFirst({ where: { tenantId: T, id: g.despachos[0].id }, select: { observations: true } });
    expect(fila?.observations).toContain(`no hay producción del permiso ${PERM_A}`);
    expect(fila?.observations).not.toContain("el libro no tiene producción");
    const deB = await prisma.forestCtpDespachoOrigen.count({ where: { tenantId: T, produccionEntryId: cB.id } });
    expect(deB).toBe(0);
  }, 120_000);

  it("si la corrida pasa a otro permiso antes de los locks, la tx rechaza con PERMISO_DISTINTO y no escribe", async () => {
    const E = especieDe("cuatro");
    const piezas = [comercial(31, E)];
    const m3 = r4(piezas[0].m3);
    const c = await corridaDe(E, PERM_A, r4(m3 + 1));
    const anexo = await anexoGuardado("4", piezas, PERM_A);
    /* Entre la propuesta de afuera y la transacción (la lectura de cierres va
       justo antes): alguien deja la corrida del permiso B. Si la bandeja estaba
       tomada por otro test, cada intento vuelve a empezar desde el permiso A. */
    const original = ForestCtpCierreDB.list.bind(ForestCtpCierreDB);
    const deja = (permiso: string) => prisma.forestCtpEntry.update({ where: { id: c.id }, data: { originCode: permiso } });
    let r: ResultadoTanda | null = null;
    for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
      await deja(PERM_A);
      vi.spyOn(ForestCtpCierreDB, "list").mockImplementationOnce(async (tenantId: string) => {
        await deja(PERM_B);
        return original(tenantId);
      });
      r = await ForestCtpGuiaDesdeAnexoDB.registrarGuia(T, anexo.id, { user: P });
      vi.restoreAllMocks();
      if (!tandaAjena(r)) break;
      await esperar(3000);
    }
    const g = r!.guias[0];
    expect(g).toMatchObject({ estado: "error", codigo: "PERMISO_DISTINTO" });
    if (g.estado !== "error") return;
    expect(g.mensaje).toContain(`corrida N° ${c.lineNo}`);
    expect(g.mensaje).toContain(PERM_B);
    expect(g.mensaje).toContain(PERM_A);
    const despachos = await prisma.forestCtpEntry.count({ where: { tenantId: T, section: "despacho", gtfNumber: anexo.gtf } });
    expect(despachos).toBe(0);
    const bandeja = (await ForestAnexosDB.list(T)).find((a) => a.id === anexo.id);
    expect(bandeja?.despachoIds ?? []).toEqual([]);
  }, 180_000);
});
