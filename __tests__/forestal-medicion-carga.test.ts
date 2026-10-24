/**
 * Cargas medidas en el monte (16-10, F3): la lógica pura (armar, tope,
 * retención, estados) y el contrato con «Medir por foto» que el monte reusa
 * sin tocarlo.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { piezasAMano, volumenPorTroza, type TrozaAMano } from "@/lib/forestal/loth-trozas-a-mano";
import {
  MAX_CARGAS,
  MAX_CARGAS_VIVAS,
  MAX_FOTOS_POR_CARGA,
  RETENCION_DIAS,
  agregarFoto,
  aplicarAccion,
  armarCarga,
  correlativosConCargas,
  crearCarga,
  etiquetaPermiso,
  filasParaLaGuia,
  fotosQueFaltan,
  liberarCargas,
  normalizarAlmacen,
  podar,
  rangoDeCodigos,
  recientes,
  reservarCargas,
  vigentes,
  type AlmacenCargas,
  type CargaMedida,
  type NuevaCarga,
} from "@/lib/forestal/medicion-carga";
import { filasDeLaCarga } from "@/components/admin/forestal/LothMedirCargaMonteFilas";

const DIA = 86_400_000;
const AHORA = Date.parse("2026-10-16T15:00:00.000Z");
const firma = (en = new Date(AHORA).toISOString(), por = "monte") => ({ en, por });

function entrada(filas: NuevaCarga["filas"], extra: Partial<NuevaCarga> = {}): NuevaCarga {
  return { planId: "plan-1", desde: 24, fotosEsperadas: 2, filas, ...extra };
}
const fila = (codigo: string, d1 = 45, extra: Partial<NuevaCarga["filas"][number]> = {}) => ({ codigo, d1Cm: d1, d2Cm: d1 - 2, largoM: 3.2, especie: "Tornillo", ...extra });

function carga(id: string, extra: Partial<CargaMedida> = {}): CargaMedida {
  const r = armarCarga(entrada([fila("24"), fila("25")]), firma(), id);
  if (!r.ok) throw new Error(r.mensaje);
  return { ...r.carga, ...extra };
}

describe("armarCarga", () => {
  it("valida cada fila con la regla del alta a mano y calcula el volumen en el servidor", () => {
    const r = armarCarga(entrada([fila("24", 45, { medidoPorFoto: true }), fila("25", 50, { d2Supuesto: true })]), firma(), "c1");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const esperado = volumenPorTroza({ d1Cm: 45, d2Cm: 43, largoM: 3.2 });
    expect(r.carga.filas[0]?.volumenM3).toBe(esperado);
    expect(r.carga.trozas).toBe(2);
    expect(r.carga.especie).toBe("Tornillo");
    expect(r.carga.largoM).toBe(3.2);
    expect(r.carga.estado).toBe("medida");
    expect(r.carga.filas[0]?.medidoPorFoto).toBe(true);
    expect(r.carga.filas[1]?.d2Supuesto).toBe(true);
    expect(r.carga.filas[0]?.dudosa).toBe(false);
  });

  it("especie o largo distintos → null (la carga no es de una sola)", () => {
    const r = armarCarga(entrada([fila("1"), fila("2", 45, { especie: "Cumala", largoM: 4 })]), firma(), "c1");
    expect(r.ok && r.carga.especie).toBeNull();
    expect(r.ok && r.carga.largoM).toBeNull();
  });

  it("rechaza un N° repetido y una fila fuera de rango, diciendo cuál", () => {
    const dup = armarCarga(entrada([fila("24"), fila("24")]), firma(), "c1");
    expect(dup).toMatchObject({ ok: false, fila: "24" });
    const mala = armarCarga(entrada([fila("24"), fila("25", 5000)]), firma(), "c1");
    expect(mala).toMatchObject({ ok: false, fila: "25" });
    expect(!mala.ok && mala.mensaje).toContain("Troza 25");
  });

  it("filasParaLaGuia: una troza por fila, con su marca de foto", () => {
    const c = carga("c1", {});
    const f = filasParaLaGuia({ filas: [{ ...c.filas[0]!, medidoPorFoto: true, d2Supuesto: true }] });
    expect(f).toEqual([{ d1Cm: 45, d2Cm: 43, largoM: 3.2, cantidad: 1, especie: "Tornillo", medidoPorFoto: true, d2Supuesto: true }]);
  });
});

describe("almacén: tope y retención", () => {
  it("con el tope de cargas sin usar no entra otra", () => {
    const alm: AlmacenCargas = { cargas: Array.from({ length: MAX_CARGAS_VIVAS }, (_, i) => carga(`v${i}`)) };
    expect(crearCarga(alm, carga("nueva"), AHORA)).toEqual({ ok: false, motivo: "tope" });
    expect(crearCarga({ cargas: alm.cargas.slice(1) }, carga("nueva"), AHORA).ok).toBe(true);
  });

  it("lo terminado hace más de 30 días se va; lo sin usar nunca", () => {
    const viejo = new Date(AHORA - (RETENCION_DIAS + 1) * DIA).toISOString();
    const alm: AlmacenCargas = {
      cargas: [
        carga("vieja-viva", { creada: firma(viejo) }),
        carga("vieja-usada", { estado: "usada", usada: { ...firma(viejo), gtfNumber: "001-1" } }),
        carga("nueva-descartada", { estado: "descartada", descartada: { ...firma(), motivo: "repetida" } }),
      ],
    };
    expect(podar(alm, AHORA).cargas.map((c) => c.id)).toEqual(["vieja-viva", "nueva-descartada"]);
    expect(vigentes(alm).map((c) => c.id)).toEqual(["vieja-viva"]);
    expect(recientes(alm).map((c) => c.id)).toEqual(["nueva-descartada", "vieja-usada"]);
  });

  it("por encima del tope total se van las terminadas más viejas, nunca las vivas", () => {
    const alm: AlmacenCargas = {
      cargas: [carga("viva"), carga("t1", { estado: "usada", usada: { ...firma(new Date(AHORA - DIA).toISOString()), gtfNumber: "1" } }), carga("t2", { estado: "usada", usada: { ...firma(), gtfNumber: "2" } })],
    };
    expect(podar(alm, AHORA, 2).cargas.map((c) => c.id)).toEqual(["viva", "t2"]);
  });

  it("normalizarAlmacen descarta lo roto sin tumbar lo demás", () => {
    expect(normalizarAlmacen({ cargas: [carga("ok"), { id: 3 }, null] }).cargas.map((c) => c.id)).toEqual(["ok"]);
    expect(normalizarAlmacen(null).cargas).toEqual([]);
  });
});

describe("estados", () => {
  const foto = (docId: string) => ({ docId, tipo: "original" as const, subida: firma() });

  it("agregarFoto: idempotente por documento, con tope y sólo mientras está sin usar", () => {
    let alm: AlmacenCargas = { cargas: [carga("c1")] };
    const r1 = agregarFoto(alm, "c1", foto("d1"));
    expect(r1).toMatchObject({ ok: true, cambio: true });
    alm = r1.ok ? r1.almacen : alm;
    expect(agregarFoto(alm, "c1", foto("d1"))).toMatchObject({ ok: true, cambio: false });
    expect(agregarFoto(alm, "nada", foto("d2"))).toMatchObject({ ok: false, motivo: "no_existe" });
    const llena: AlmacenCargas = { cargas: [carga("c2", { fotos: Array.from({ length: MAX_FOTOS_POR_CARGA }, (_, i) => foto(`f${i}`)) })] };
    expect(agregarFoto(llena, "c2", foto("otra"))).toMatchObject({ ok: false, motivo: "tope_fotos" });
    const usada: AlmacenCargas = { cargas: [carga("c3", { estado: "usada" })] };
    expect(agregarFoto(usada, "c3", foto("x"))).toMatchObject({ ok: false, motivo: "cerrada" });
  });

  it("usada con la misma guía es idempotente; con otra guía, no", () => {
    const alm: AlmacenCargas = { cargas: [carga("c1")] };
    const r = aplicarAccion(alm, "c1", { accion: "usada", gtfNumber: " 019-001-0000123 " }, firma(undefined, "oficina"));
    expect(r).toMatchObject({ ok: true, cambio: true, carga: { estado: "usada", usada: { gtfNumber: "019-001-0000123", por: "oficina" } } });
    if (!r.ok) return;
    expect(aplicarAccion(r.almacen, "c1", { accion: "usada", gtfNumber: "019-001-0000123" }, firma())).toMatchObject({ ok: true, cambio: false });
    expect(aplicarAccion(r.almacen, "c1", { accion: "usada", gtfNumber: "019-001-0000999" }, firma())).toMatchObject({ ok: false, motivo: "otra_guia" });
    expect(aplicarAccion(r.almacen, "c1", { accion: "descartar", motivo: "repetida" }, firma())).toMatchObject({ ok: false, motivo: "cerrada" });
  });

  it("descartar guarda el motivo y la carga ya no se puede usar", () => {
    const r = aplicarAccion({ cargas: [carga("c1")] }, "c1", { accion: "descartar", motivo: " foto repetida " }, firma());
    expect(r).toMatchObject({ ok: true, carga: { estado: "descartada", descartada: { motivo: "foto repetida" } } });
    if (!r.ok) return;
    expect(aplicarAccion(r.almacen, "c1", { accion: "usada", gtfNumber: "1" }, firma())).toMatchObject({ ok: false, motivo: "cerrada" });
  });

  it("fotosQueFaltan y rangoDeCodigos", () => {
    expect(fotosQueFaltan({ fotos: [], fotosEsperadas: 2 })).toBe(2);
    expect(rangoDeCodigos(carga("c1").filas)).toBe("24 a 25");
    expect(rangoDeCodigos([])).toBe("—");
  });
});

describe("reservar y liberar en el registro de la guía (security 16-10)", () => {
  const GTF = "019-001-0000123";
  const usadaCon = (gtf: string) => ({ estado: "usada" as const, usada: { ...firma(), gtfNumber: gtf } });

  it("marca usadas todas con el N° de la guía, en una pasada", () => {
    const r = reservarCargas({ cargas: [carga("a"), carga("b"), carga("c")] }, ["a", "b", "a"], GTF, firma(undefined, "oficina"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cambiadas).toEqual(["a", "b"]);
    expect(r.almacen.cargas.map((c) => c.estado)).toEqual(["usada", "usada", "medida"]);
    expect(r.cargas.map((c) => c.usada?.gtfNumber)).toEqual([GTF, GTF]);
  });

  it("todas o ninguna: si una ya va en otra guía, está descartada o no existe, no se toca nada", () => {
    const alm: AlmacenCargas = {
      cargas: [carga("a"), carga("otra", usadaCon("019-001-0000999")), carga("desc", { estado: "descartada", descartada: { ...firma(), motivo: "x" } })],
    };
    expect(reservarCargas(alm, ["a", "otra"], GTF, firma())).toMatchObject({ ok: false, motivo: "otra_guia", id: "otra", carga: { usada: { gtfNumber: "019-001-0000999" } } });
    expect(reservarCargas(alm, ["a", "desc"], GTF, firma())).toMatchObject({ ok: false, motivo: "cerrada", id: "desc" });
    expect(reservarCargas(alm, ["a", "nada"], GTF, firma())).toMatchObject({ ok: false, motivo: "no_existe", id: "nada" });
    expect(alm.cargas[0]?.estado).toBe("medida");
  });

  it("ya usada con ESTA guía = reintento: pasa sin contar como cambiada", () => {
    const r = reservarCargas({ cargas: [carga("a", usadaCon(GTF)), carga("b")] }, ["a", "b"], ` ${GTF} `, firma());
    expect(r).toMatchObject({ ok: true, cambiadas: ["b"] });
  });

  it("liberar suelta sólo lo que marcó esa firma con ese N°", () => {
    const mia = firma("2026-10-16T15:00:00.000Z", "oficina");
    const r = reservarCargas({ cargas: [carga("a"), carga("b"), carga("c", usadaCon(GTF))] }, ["a", "b", "c"], GTF, mia);
    if (!r.ok) throw new Error("no reservó");
    const l = liberarCargas(r.almacen, ["a", "b", "c"], GTF, mia);
    expect(l.liberadas).toEqual(["a", "b"]);
    expect(l.almacen.cargas.map((c) => c.estado)).toEqual(["medida", "medida", "usada"]);
    expect(l.almacen.cargas[0]?.usada).toBeUndefined();
    expect(liberarCargas(r.almacen, ["a"], GTF, firma("2026-10-16T15:00:00.001Z", "oficina")).liberadas).toEqual([]);
    expect(liberarCargas(r.almacen, ["a"], GTF, firma(mia.en, "otro")).liberadas).toEqual([]);
    expect(liberarCargas(r.almacen, ["a"], "019-001-0000124", mia).liberadas).toEqual([]);
  });
});

describe("tamaño de la fila KV", () => {
  it("el peor caso (tope de cargas, 150 trozas con N° y especie largos, 12 fotos) no pasa de 1 MB", () => {
    const especie = "E".repeat(60);
    const filas = Array.from({ length: 150 }, (_, i) => fila(`N${String(i).padStart(11, "0")}`, 45.75, { d2Cm: 43.25, largoM: 3.25, especie, medidoPorFoto: true, d2Supuesto: true, dudosa: true }));
    const por = "u".repeat(60);
    const r = armarCarga(entrada(filas, { planId: "p".repeat(64), nota: "n".repeat(300) }), firma(undefined, por), "0".repeat(36));
    if (!r.ok) throw new Error(r.mensaje);
    const fotos = Array.from({ length: MAX_FOTOS_POR_CARGA }, (_, i) => ({ docId: `doc${"x".repeat(30)}${i}`, tipo: "anotada" as const, subida: firma(undefined, por) }));
    const una: CargaMedida = { ...r.carga, especie: null, fotos, estado: "usada", usada: { ...firma(undefined, por), gtfNumber: "9".repeat(60) } };
    const alm: AlmacenCargas = { cargas: Array.from({ length: MAX_CARGAS }, () => una) };
    expect(Buffer.byteLength(JSON.stringify(alm))).toBeLessThanOrEqual(1_000_000);
  });
});

describe("numeración entre cargas del monte", () => {
  it("la segunda carga del mismo permiso arranca después de la primera, aunque el libro no la tenga", () => {
    const base = { "plan-1": 24, sin_permiso: 3 };
    const sigue = correlativosConCargas(base, [carga("c1"), carga("c2", { planId: "plan-2", estado: "descartada" })]);
    expect(sigue).toEqual({ "plan-1": 26, sin_permiso: 3 });
    expect(correlativosConCargas({ "plan-1": 40 }, [carga("c1")])).toEqual({ "plan-1": 40 });
  });

  it("etiquetaPermiso: título (o N° de plan) y titular", () => {
    expect(etiquetaPermiso({ tituloHabilitante: "PO-2026-001", planNumber: "X", titularName: "Juan" })).toBe("PO-2026-001 · Juan");
    expect(etiquetaPermiso({ planNumber: "PLAN-9", titularName: null })).toBe("PLAN-9");
    expect(etiquetaPermiso(null)).toBeNull();
  });

  it("filasDeLaCarga: el N° de cada troza sale de la misma numeración que la guía", () => {
    const filas: TrozaAMano[] = [
      { d1Cm: 45, d2Cm: 43, largoM: 3.2, cantidad: 1, especie: "Tornillo", medidoPorFoto: true },
      { d1Cm: 50, d2Cm: 50, largoM: 3.2, cantidad: 2, especie: " ", medidoPorFoto: true, d2Supuesto: true },
    ];
    const out = filasDeLaCarga(filas, piezasAMano(filas, [], new Map(), 24));
    expect(out.map((f) => f.codigo)).toEqual(["24", "25", "26"]);
    expect(out[1]).toMatchObject({ d1Cm: 50, especie: null, medidoPorFoto: true, d2Supuesto: true });
  });
});

describe("contrato con «Medir por foto»", () => {
  /* El monte le da a `LothTrozasPorFoto` un despacho chico (`DespachoParaMedir`):
     si empieza a leer otra cosa del despacho, en el monte rompe en el navegador
     sin que tsc lo vea (el adaptador va con cast). */
  it("LothTrozasPorFoto sólo lee del despacho lo que el monte le da", () => {
    const dir = path.resolve(__dirname, "../components/admin/forestal");
    const permitidos = new Set(["aMano", "especiesAMano", "arbolesAMano", "fotosCarga", "piezas", "piezasManuales", "planId", "siguienteCorrelativo"]);
    const usados = new Set<string>();
    const deArboles = new Set<string>();
    for (const f of readdirSync(dir).filter((n) => /^LothTrozasPorFoto.*\.tsx$/.test(n))) {
      const fuente = readFileSync(path.join(dir, f), "utf8");
      for (const m of fuente.matchAll(/\bg\.([A-Za-z]\w*)/g)) usados.add(m[1]!);
      for (const m of fuente.matchAll(/\bg\.arbolesAMano(?:\.(\w+))?/g)) deArboles.add(m[1] ?? "(entero)");
    }
    expect(usados.size).toBeGreaterThan(0);
    expect([...usados].filter((u) => !permitidos.has(u))).toEqual([]);
    /* De los árboles el monte sólo da el mapa vacío (las trozas van con número). */
    expect([...deArboles].filter((u) => u !== "porId")).toEqual([]);
    const adaptador = readFileSync(path.join(dir, "LothMedirCargaMonteModal.tsx"), "utf8");
    for (const p of permitidos) expect(adaptador).toContain(p);
  });
});
