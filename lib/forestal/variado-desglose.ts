/**
 * variado-desglose — la especie «Variado»: paquetería 6×6 mezclada que, al
 * distribuir sobre la rolliza, se abre en las medidas que de verdad lleva el
 * paquete (2×2, 2×3, 2×4, 1×4, 1×3, 1×2, 1.5×3, 3×3) y se reparte por especie
 * según el volumen libre de cada una (Brandon, 2026-10-02).
 *
 * Reglas:
 *  · La SECCIÓN cierra EXACTA: Σ espesor×ancho×piezas = 36 × paquetes. Se cuenta
 *    en medias pulgadas² (6×6 = 72) para trabajar con enteros.
 *  · El reparto por especie es en PIEZAS ENTERAS; el PT sólo difiere por el
 *    redondeo a centésimas de cada fila (≤ 0,005 por fila).
 *  · Una especie exceptuada, o con peso 0, no recibe nada.
 *  · Cada pieza abierta lleva el TIPO DE SU MEDIDA (Brandon 03-10: «ya no se
 *    llamará paquetería sino de acuerdo a las medidas: larga angosta, corta…»):
 *    1×3 y 1×4 largas son Tabla, el resto largo es Larga angosta y todo lo de
 *    menos de 6′ es Corta (`clasificarTipo`). Por eso cada pieza va sólo a las
 *    especies cuyos bloques ADMITEN su tipo («Lleva sólo»).
 *
 * PURO y client-safe: sin React, sin fetch, sin DOM. Determinista.
 */
import { z } from "zod";
import { cubicarPieza, toFeet, toInches, type PiezaCubicada } from "./cubicacion";
import {
  capacidadDe,
  claveEspecie as claveEspecieMotor,
  gruposAdmitidos,
  type BloqueRolliza,
} from "./cubicacion-reparto";
import { clasificarTipo, tipoDePieza, type TipoComercial } from "./cubicacion-tipo";
import { claveEspecie } from "./loth-constants";

export const ESPECIE_VARIADO = "Variado";

/** ¿Esta especie es «Variado»? Se compara por `claveEspecie` (sin tildes ni mayúsculas). */
export const esVariado = (especie: string | null | undefined): boolean =>
  claveEspecie(especie) === claveEspecie(ESPECIE_VARIADO);

/** Una medida que puede traer el paquete. `peso` 0 = no entra. */
export interface MedidaVariado {
  espesor: number;
  ancho: number;
  peso: number;
}

export interface ConfigVariado {
  medidas: MedidaVariado[];
  /** Especies que no reciben nada, por `claveEspecie`. */
  excluidas: string[];
}

export const NIVEL_PESO = { normal: 3, poco: 1, no: 0 } as const;

const med = (espesor: number, ancho: number, peso: number): MedidaVariado => ({ espesor, ancho, peso });

export const VARIADO_DEFAULT: ConfigVariado = {
  medidas: [
    med(2, 2, NIVEL_PESO.normal),
    med(2, 3, NIVEL_PESO.normal),
    med(2, 4, NIVEL_PESO.normal),
    med(1, 4, NIVEL_PESO.normal),
    med(1, 3, NIVEL_PESO.normal),
    med(1, 2, NIVEL_PESO.normal),
    med(1.5, 3, NIVEL_PESO.poco),
    med(3, 3, NIVEL_PESO.poco),
  ],
  excluidas: [],
};

/** Área en medias pulgadas² (entero), o 0 si la medida no es representable. */
const areaMedia = (m: { espesor: number; ancho: number }): number => {
  const v = m.espesor * m.ancho * 2;
  const r = Math.round(v);
  return Math.abs(v - r) < 1e-9 && r >= 1 ? r : 0;
};

export const configVariadoSchema = z.object({
  medidas: z
    .array(
      z.object({
        espesor: z.number().positive().max(12),
        ancho: z.number().positive().max(30),
        peso: z.number().min(0).max(100),
      }),
    )
    .max(40)
    .refine((ms) => ms.every((m) => areaMedia(m) > 0), { message: "área no representable en medias pulgadas²" }),
  excluidas: z
    .array(z.string().max(120))
    .max(300)
    .transform((l) => [...new Set(l.map((e) => claveEspecie(e)).filter(Boolean))]),
});

/** Lee la config guardada; cualquier cosa rara vuelve al default. */
export function leerConfigVariado(raw: unknown): ConfigVariado {
  const r = configVariadoSchema.safeParse(raw);
  if (!r.success) return { medidas: VARIADO_DEFAULT.medidas.map((m) => ({ ...m })), excluidas: [] };
  return r.data;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

// ─── Pesos por especie ──────────────────────────────────────────────────────

export interface PesoEspecie {
  clave: string;
  especie: string;
  /** m³ libres (o capacidad total si ninguna tiene libre). Siempre > 0 en la lista. */
  peso: number;
  /** Parte de las especies con peso, en % (suma 100). */
  pct: number;
}

/**
 * Cuánto le toca a cada especie del Variado: lo LIBRE de la distribución
 * (capacidad de sus bloques − su aserrada que no es Variado, nunca negativo).
 * Si ninguna tiene libre, la capacidad total. Las exceptuadas y «Variado»
 * mismo pesan 0 y no aparecen.
 */
export function pesosPorEspecie(
  bloques: readonly BloqueRolliza[],
  piezasNoVariado: readonly PiezaCubicada[],
  cfg: ConfigVariado,
  /** Tipo del paquete que se reparte: sólo cuentan los bloques cuyo «Lleva sólo» lo admite. */
  tipo?: TipoComercial,
): PesoEspecie[] {
  const fuera = new Set(cfg.excluidas.map((e) => claveEspecie(e)));
  // La especie se agrupa con la MISMA clave que el motor del reparto.
  const especies = new Map<string, { especie: string; capacidad: number; aserrada: number; sinFiltro: boolean }>();
  for (const b of bloques) {
    const clave = claveEspecieMotor(b.especie);
    if (!clave || esVariado(b.especie) || fuera.has(claveEspecie(b.especie))) continue;
    const admitidos = gruposAdmitidos(b, "tipo");
    if (tipo !== undefined && admitidos && !admitidos.has(tipo)) continue;
    const acc = especies.get(clave) ?? { especie: b.especie.trim(), capacidad: 0, aserrada: 0, sinFiltro: false };
    acc.capacidad += capacidadDe(b);
    if (!admitidos) acc.sinFiltro = true;
    especies.set(clave, acc);
  }
  for (const p of piezasNoVariado) {
    const acc = especies.get(claveEspecieMotor(p.especie));
    // Con bloques filtrados, sólo la aserrada de ESE tipo ocupa su capacidad.
    if (acc && (tipo === undefined || acc.sinFiltro || tipoDePieza(p) === tipo)) acc.aserrada += Number(p.m3) || 0;
  }
  const libres = [...especies.entries()].map(([clave, e]) => ({
    clave,
    especie: e.especie,
    libre: Math.max(0, e.capacidad - e.aserrada),
    capacidad: e.capacidad,
  }));
  const hayLibre = libres.some((e) => e.libre > 1e-9);
  const conPeso = libres
    .map((e) => ({ clave: e.clave, especie: e.especie, peso: hayLibre ? e.libre : e.capacidad }))
    .filter((e) => e.peso > 1e-9);
  const total = conPeso.reduce((a, e) => a + e.peso, 0);
  return conPeso.map((e) => ({
    clave: e.clave,
    especie: e.especie,
    peso: r4(e.peso),
    pct: total > 0 ? (e.peso / total) * 100 : 0,
  }));
}

// ─── Desglose de N paquetes 6×6 en medidas ──────────────────────────────────

const AREA_PAQUETE = 72; // 6×6 en medias pulgadas²

interface Item {
  idx: number;
  a: number;
  x: number;
  base: number;
}

/** Reparte `R` unidades de área en extras `e_i ≥ 0` minimizando Σ (base+e−x)². */
function repartirResiduo(items: readonly Item[], R: number): number[] | null {
  const INF = Number.POSITIVE_INFINITY;
  let mejor = new Float64Array(R + 1).fill(INF);
  mejor[0] = 0;
  const elegido: Int32Array[] = [];
  for (const it of items) {
    const nuevo = new Float64Array(R + 1).fill(INF);
    const e = new Int32Array(R + 1);
    for (let r = 0; r <= R; r++) {
      for (let k = 0; k * it.a <= r; k++) {
        const previo = mejor[r - k * it.a];
        if (previo === INF) continue;
        const d = it.base + k - it.x;
        const c = previo + d * d;
        if (c < nuevo[r] - 1e-12) {
          nuevo[r] = c;
          e[r] = k;
        }
      }
    }
    mejor = nuevo;
    elegido.push(e);
  }
  if (mejor[R] === INF) return null;
  const extras = new Array<number>(items.length).fill(0);
  let r = R;
  for (let i = items.length - 1; i >= 0; i--) {
    extras[i] = elegido[i][r];
    r -= extras[i] * items[i].a;
  }
  return extras;
}

const mcd = (a: number, b: number): number => (b === 0 ? a : mcd(b, a % b));

const memo = new Map<string, { espesor: number; ancho: number; piezas: number }[] | null>();

/**
 * Abre `n` paquetes 6×6 en piezas de las medidas dadas (por pesos). La sección
 * cierra EXACTA: Σ espesor×ancho×piezas = 36 × n. `null` si no hay combinación.
 */
export function desglosarPaquetes(
  n: number,
  medidas: readonly MedidaVariado[],
): { espesor: number; ancho: number; piezas: number }[] | null {
  const paquetes = Math.floor(n);
  if (!(paquetes >= 1)) return null;
  const clave = `${paquetes}|${medidas.map((m) => `${m.espesor}x${m.ancho}:${m.peso}`).join(",")}`;
  const hit = memo.get(clave);
  if (hit !== undefined) return hit ? hit.map((x) => ({ ...x })) : null;
  const res = calcularDesglose(paquetes, medidas);
  if (memo.size > 2000) memo.clear();
  memo.set(clave, res);
  return res ? res.map((x) => ({ ...x })) : null;
}

function calcularDesglose(paquetes: number, medidas: readonly MedidaVariado[]) {
  const activas = medidas
    .map((m, idx) => ({ m, idx, a: areaMedia(m) }))
    .filter((v) => v.m.peso > 0 && v.a > 0);
  if (activas.length === 0) return null;
  const T = AREA_PAQUETE * paquetes;
  const sumaPesoArea = activas.reduce((s, v) => s + v.m.peso * v.a, 0);
  const lambda = T / sumaPesoArea;

  // Si el máximo común de las áreas no divide T, ninguna combinación cierra.
  const g = activas.reduce((acc, v) => mcd(acc, v.a), 0);
  if (T % g !== 0) return null;

  const armar = (rebaja: number) => {
    const items: Item[] = activas.map((v) => {
      const x = v.m.peso * lambda;
      return { idx: v.idx, a: v.a, x, base: Math.max(0, Math.floor(x + 1e-9) - rebaja) };
    });
    const R = T - items.reduce((s, it) => s + it.base * it.a, 0);
    const extras = repartirResiduo(items, R);
    return extras ? items.map((it, i) => it.base + extras[i]) : null;
  };
  // El piso exacto deja un residuo chico que a veces no se puede armar; se baja
  // el piso de a 1, 2, 4… piezas (residuo acotado) en vez de repartir todo T.
  let cuentas = armar(0);
  for (let rebaja = 1; !cuentas && rebaja <= 4096; rebaja *= 2) cuentas = armar(rebaja);
  if (!cuentas) return null;
  return activas
    .map((v, i) => ({ espesor: v.m.espesor, ancho: v.m.ancho, piezas: cuentas[i] }))
    .filter((v) => v.piezas > 0);
}

// ─── Desglose sobre la lista de piezas ──────────────────────────────────────

export interface DesgloseGrupo {
  origenId: string;
  /** Largo en pies. */
  largo: number;
  paquetes: number;
  porEspecie: {
    especie: string;
    /** `tipo` = el de la medida abierta (Tabla, Larga angosta, Corta…), no «Paquetería». */
    medidas: { espesor: number; ancho: number; piezas: number; tipo: TipoComercial }[];
  }[];
}

export type MotivoSinDesglosar = "sin-especies" | "no-6x6" | "no-cierra";

export interface ResultadoVariado {
  piezas: PiezaCubicada[];
  pesos: PesoEspecie[];
  grupos: DesgloseGrupo[];
  sinDesglosar: { id: string; motivo: MotivoSinDesglosar }[];
  cuadre: { ptOrigen: number; ptDesglose: number; toleranciaPt: number };
}

const es6x6 = (p: PiezaCubicada): boolean =>
  Math.abs(toInches(p.espesor, p.uEspesor) - 6) < 0.05 && Math.abs(toInches(p.ancho, p.uAncho) - 6) < 0.05;

/**
 * Abre cada fila «Variado» 6×6 en medidas y especies reales. Lo que no se pueda
 * abrir queda intacto y se lista en `sinDesglosar` con el motivo.
 */
export function desglosarVariado(
  piezas: readonly PiezaCubicada[],
  bloques: readonly BloqueRolliza[],
  cfg: ConfigVariado,
): ResultadoVariado {
  const noVariado = piezas.filter((p) => !esVariado(p.especie));
  const pesos = pesosPorEspecie(bloques, noVariado, cfg);
  // Pesos por tipo de paquete (larga/corta): cada uno sólo ve los bloques que lo admiten.
  const pesosDeTipo = new Map<TipoComercial, { pesos: PesoEspecie[]; total: number }>();
  const pesosPara = (t: TipoComercial) => {
    let v = pesosDeTipo.get(t);
    if (!v) {
      const ps = pesosPorEspecie(bloques, noVariado, cfg, t);
      v = { pesos: ps, total: ps.reduce((a, e) => a + e.peso, 0) };
      pesosDeTipo.set(t, v);
    }
    return v;
  };
  let filas = 0;

  const salida: PiezaCubicada[] = [];
  const grupos: DesgloseGrupo[] = [];
  const sinDesglosar: ResultadoVariado["sinDesglosar"] = [];
  let ptOrigen = 0;
  let ptDesglose = 0;

  for (const p of piezas) {
    if (!esVariado(p.especie)) {
      salida.push(p);
      continue;
    }
    if (!es6x6(p)) {
      sinDesglosar.push({ id: p.id, motivo: "no-6x6" });
      salida.push(p);
      continue;
    }
    const paquetes = p.cantidad > 0 ? Math.round(p.cantidad) : 1;
    const cuentas = desglosarPaquetes(paquetes, cfg.medidas);
    if (!cuentas) {
      sinDesglosar.push({ id: p.id, motivo: "no-cierra" });
      salida.push(p);
      continue;
    }

    // Medidas de la más grande a la más chica (sección; empate: espesor mayor).
    const ordenadas = cuentas
      .map((c) => ({ ...c, a: areaMedia(c) }))
      .sort((x, y) => y.a - x.a || y.espesor - x.espesor || y.ancho - x.ancho);
    const tipoDe = (m: { espesor: number; ancho: number }): TipoComercial =>
      clasificarTipo({ espesor: m.espesor, ancho: m.ancho, largo: p.largo, uEspesor: "pulg", uAncho: "pulg", uLargo: p.uLargo });

    // Cada tipo que sale del paquete con sus especies posibles y su área.
    const porTipo = new Map<TipoComercial, { pesos: PesoEspecie[]; total: number; area: number }>();
    for (const m of ordenadas) {
      const t = tipoDe(m);
      const g = porTipo.get(t) ?? { ...pesosPara(t), area: 0 };
      g.area += m.a * m.piezas;
      porTipo.set(t, g);
    }
    // Un tipo sin especie que lo admita deja la fila sin abrir (no se inventa dónde va).
    if ([...porTipo.values()].some((g) => g.pesos.length === 0 || g.total <= 0)) {
      sinDesglosar.push({ id: p.id, motivo: "sin-especies" });
      salida.push(p);
      continue;
    }

    // Lo que le toca a cada especie: el área de cada tipo repartida según los
    // pesos de ESE tipo. Sin «Lleva sólo», todos los tipos pesan igual y el
    // reparto es el mismo que cuando las piezas seguían siendo paquetería.
    const objetivo = new Map<string, { especie: string; falta: number }>();
    for (const g of porTipo.values()) {
      for (const e of g.pesos) {
        const o = objetivo.get(e.clave) ?? { especie: e.especie, falta: 0 };
        o.falta += (e.peso / g.total) * g.area;
        objetivo.set(e.clave, o);
      }
    }
    const claves = [...objetivo.keys()];
    const falta = claves.map((k) => objetivo.get(k)?.falta ?? 0);
    const elegibles = new Map<TipoComercial, number[]>(
      [...porTipo.entries()].map(([t, g]) => [t, g.pesos.map((e) => claves.indexOf(e.clave))]),
    );

    // Cada pieza, a la especie (que admite su tipo) a la que más le falta en área.
    const reparto: Map<string, number>[] = claves.map(() => new Map());
    for (const m of ordenadas) {
      const clave = `${m.espesor}x${m.ancho}`;
      const candidatas = elegibles.get(tipoDe(m)) ?? [];
      for (let k = 0; k < m.piezas; k++) {
        let mejor = candidatas[0];
        for (const s of candidatas) if (falta[s] > falta[mejor] + 1e-9) mejor = s;
        falta[mejor] -= m.a;
        reparto[mejor].set(clave, (reparto[mejor].get(clave) ?? 0) + 1);
      }
    }

    const largoPies = toFeet(p.largo, p.uLargo);
    const porEspecie: DesgloseGrupo["porEspecie"] = [];
    let n = 0;
    claves.forEach((k, s) => {
      const especie = objetivo.get(k)?.especie ?? k;
      const medidas = ordenadas
        .map((m) => ({ espesor: m.espesor, ancho: m.ancho, piezas: reparto[s].get(`${m.espesor}x${m.ancho}`) ?? 0, tipo: tipoDe(m) }))
        .filter((m) => m.piezas > 0);
      if (medidas.length === 0) return;
      porEspecie.push({ especie, medidas });
      for (const m of medidas) {
        n += 1;
        filas += 1;
        const base = {
          cantidad: m.piezas,
          espesor: m.espesor,
          ancho: m.ancho,
          largo: p.largo,
          uEspesor: "pulg" as const,
          uAncho: "pulg" as const,
          uLargo: p.uLargo,
        };
        const { pieTablar, m3 } = cubicarPieza(base);
        ptDesglose += pieTablar;
        salida.push({
          id: `${p.id}-v-${n}`,
          ...base,
          especie,
          ...(p.dueno !== undefined ? { dueno: p.dueno } : {}),
          ...(p.duenoParteId !== undefined ? { duenoParteId: p.duenoParteId } : {}),
          ...(p.codigo !== undefined ? { codigo: p.codigo } : {}),
          ...(p.observacion !== undefined ? { observacion: p.observacion } : {}),
          tipo: m.tipo,
          pieTablar,
          m3,
          /* La marca de origen: sobrevive a juntar filas y llega a la vista previa del Anexo 04. */
          variadoPiezas: m.piezas,
        });
      }
    });
    ptOrigen += p.pieTablar;
    grupos.push({ origenId: p.id, largo: r2(largoPies), paquetes, porEspecie });
  }

  return {
    piezas: salida,
    pesos,
    grupos,
    sinDesglosar,
    cuadre: { ptOrigen: r2(ptOrigen), ptDesglose: r2(ptDesglose), toleranciaPt: toleranciaCuadrePt(filas) },
  };
}

/** Cota real del redondeo a centésimas por fila desglosada: 0,005 PT × filas. */
export const toleranciaCuadrePt = (filasDesglosadas: number): number =>
  r4(0.005 * Math.max(0, Math.floor(filasDesglosadas) || 0));

// ─── Agrupar piezas iguales (para el reparto) ───────────────────────────────

/**
 * Junta las piezas idénticas (misma especie, medida, unidades, tipo, dueño,
 * código y observación) en UNA fila: suma la cantidad y recalcula PT y m³ con
 * la fórmula del cubicador. Mantiene el orden de primera aparición; una pieza
 * sin pareja queda intacta; el id de un grupo es `g-<id de la primera>`.
 */
export function agruparPiezasIguales(piezas: readonly PiezaCubicada[]): PiezaCubicada[] {
  const grupos = new Map<string, { primera: PiezaCubicada; cantidad: number; n: number; variado: number }>();
  for (const p of piezas) {
    const clave = JSON.stringify([
      claveEspecieMotor(p.especie), p.espesor, p.ancho, p.largo, p.uEspesor, p.uAncho, p.uLargo,
      tipoDePieza(p), p.dueno ?? null, p.duenoParteId ?? null, p.codigo ?? null, p.observacion ?? null,
    ]);
    const g = grupos.get(clave);
    const cant = p.cantidad > 0 ? p.cantidad : 1;
    if (g) {
      g.cantidad += cant;
      g.n += 1;
      g.variado += p.variadoPiezas ?? 0;
    } else grupos.set(clave, { primera: p, cantidad: cant, n: 1, variado: p.variadoPiezas ?? 0 });
  }
  return [...grupos.values()].map(({ primera, cantidad, n, variado }) => {
    if (n === 1) return primera;
    const { pieTablar, m3 } = cubicarPieza({ ...primera, cantidad });
    const fila: PiezaCubicada = { ...primera, id: `g-${primera.id}`, cantidad, tipo: tipoDePieza(primera), pieTablar, m3 };
    if (variado > 0) fila.variadoPiezas = variado;
    else delete fila.variadoPiezas;
    return fila;
  });
}
