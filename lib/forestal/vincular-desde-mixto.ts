/**
 * De la producción del día al lote mixto (ADR-441, paso 7): qué trozas se
 * proponen para cada corrida, repartidas por lote.
 *
 * El caso (Brandon, 26-09): la pila del patio se escanea a un lote MIXTO, se
 * reparte en lotes de una especie y un permiso, va a la sierra, y lo que sale se
 * cubica pieza por pieza en «Producir sin lote». Declarar deja una corrida por
 * especie (ADR-429) **sin origen**. Esto arma, por corrida, de qué trozas salió.
 *
 * ## Decisión 1 del dueño: toda la madera de esa especie
 *
 * El mixto entró entero a la sierra, así que el modo por defecto (`todo`) da por
 * aserradas TODAS las trozas libres de la especie de la corrida, en cualquiera
 * de los lotes del mixto — la Mashonaste de dos permisos son dos lotes, así que
 * la corrida se vincula con dos partes. Las que no entraron se destildan
 * (`excluidas`) y quedan como saldo en su lote.
 *
 * El permiso (ADR-447): una corrida que DECLARA permiso sólo recibe madera de
 * él (lote y guía de la troza); el servidor rechaza la otra con
 * `PERMISO_DISTINTO`. Una corrida sin permiso sigue tomando la de los dos
 * permisos, que es lo que decidió Brandon para el mixto.
 *
 * El modo `justo56` es la alternativa manual: sólo las trozas que hacen falta
 * para llegar al 56 % (el techo de la plaza, ADR-358), con el mismo reparto que
 * la tanda de siempre (`repartirEnTanda`).
 *
 * ## Las reglas no se reescriben
 *
 * Cada propuesta pasa por `revisarVinculacion` (ADR-408): especie, volumen,
 * largo, fechas y disponibilidad. Encima se simula I2 por guía (`cuposDeGuia`):
 * si la suma de las propuestas pasa lo que una guía declara, el servidor
 * cortaría la vinculación con un 422, así que la pantalla lo dice antes.
 *
 * PURO y client-safe: sin DB, sin React y sin `window`. El servidor
 * (`vincularCorrida`) sigue teniendo la última palabra.
 */

import { z } from "zod";
import {
  LABEL_BLOQUEO,
  cuposDeGuia,
  fechaIngresoDeTroza,
  motivoBloqueo,
  motivoDeCupo,
  type TrozaConsumible,
} from "./consumo-trozas";
import { RENDIMIENTO_META } from "./loctp-catalogos";
import { claveEspecie } from "./loth-constants";
import { codigoDeTroza, ordenarTrozas, trozaAVincular } from "./vincular-desde-permiso";
import { clavePermiso, mismoPermiso } from "./vincular-trozas";
import { repartirEnTanda, type CorridaEnTanda } from "./vincular-en-tanda";
import {
  pasaElTope,
  revisarVinculacion,
  type HallazgoVinculo,
  type RevisionVinculo,
  type TrozaAVincular,
} from "./vincular-produccion";

const r4 = (n: number) => Math.round(n * 10_000) / 10_000 || 0;
const vol = (v: number | string | null | undefined) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Cuántos lotes puede citar una vinculación: el mixto rara vez tiene más de 2 permisos por especie. */
export const MAX_PARTES_POR_CORRIDA = 6;
/** Cuántas trozas por lote en un pedido (mismo tope que `agregar` en lotes-aserrio). */
export const MAX_TROZAS_POR_PARTE = 500;

// ── Contrato del pedido (ruta y pantalla comparten el MISMO esquema) ────────

const idCorto = z.string().trim().min(1).max(60);

/** Un lote y las trozas de él que entran a la corrida. */
export const parteDeVinculoSchema = z.object({
  loteId: idCorto,
  trozaIds: z.array(idCorto).min(1, "Elige al menos una troza de este lote").max(MAX_TROZAS_POR_PARTE),
});

/**
 * `PATCH /api/admin/forestal/lotes-aserrio` `accion:"vincular-corrida"` sin la
 * `accion` (la ruta la agrega con `.extend`). `fecha` es el día de consumo de
 * las piezas; sin ella, el de la corrida.
 *
 * `fecha` es un día DE VERDAD (`z.iso.date`, Zod 4): la forma AAAA-MM-DD sola
 * dejaba pasar «2026-13-45», y `new Date("2026-13-45T12:00:00.000Z")` es
 * `Invalid Date` — la ruta lo mandaba a la transacción como fecha de consumo.
 * El `trim` va antes, en su propio paso: dentro de `z.iso.date()` correría
 * DESPUÉS del chequeo de formato y un espacio de más lo rechazaría.
 */
export const vincularCorridaSchema = z.object({
  corridaId: idCorto,
  partes: z
    .array(parteDeVinculoSchema)
    .min(1, "Elige al menos un lote")
    .max(MAX_PARTES_POR_CORRIDA, `Una corrida se vincula con hasta ${MAX_PARTES_POR_CORRIDA} lotes`),
  fecha: z
    .string()
    .trim()
    .pipe(z.iso.date("Usa una fecha real con el formato AAAA-MM-DD"))
    .optional(),
});
export type VincularCorridaPedido = z.infer<typeof vincularCorridaSchema>;

/**
 * Lo que está mal en las partes ANTES de ir a la base, en una frase. `null` = bien.
 *
 * Lo usa el servidor antes de abrir la transacción y la pantalla antes de
 * firmar: un lote repetido o una troza en dos partes no son un problema del
 * patio, son un pedido mal armado.
 */
export function problemaDePartes(
  partes: readonly { loteId: string; trozaIds: readonly string[] }[],
): string | null {
  if (partes.length === 0) return "Elige al menos un lote con sus trozas.";
  if (partes.length > MAX_PARTES_POR_CORRIDA) {
    return `Una corrida se vincula con hasta ${MAX_PARTES_POR_CORRIDA} lotes; elegiste ${partes.length}.`;
  }
  const lotes = new Set<string>();
  const trozas = new Set<string>();
  for (const p of partes) {
    if (lotes.has(p.loteId)) return "Un mismo lote aparece dos veces: junta sus trozas en una sola parte.";
    lotes.add(p.loteId);
    if (p.trozaIds.length === 0) return "Hay un lote sin trozas elegidas: quítalo o elige sus trozas.";
    for (const t of p.trozaIds) {
      if (trozas.has(t)) return "Una misma troza aparece dos veces en el pedido: cada pieza entra una sola vez.";
      trozas.add(t);
    }
  }
  return null;
}

// ── El plan ─────────────────────────────────────────────────────────────────

/** Una corrida del día como la conoce la pantalla de Declarar (ADR-429). */
export interface CorridaDelMixto {
  id: string;
  lineNo?: number | null;
  especie: string | null;
  /** m³ de producto que la corrida declara. */
  volumenM3: number | null;
  /** Fecha del asiento (AAAA-MM-DD o ISO). */
  fecha: string;
  /** La pieza más larga declarada, EN METROS (regla 3). */
  largoMaxPiezaM?: number | null;
  /** Ya tiene materia prima (consumos, volumen de entrada o lote): ADR-364 la cierra. */
  tieneMateriaPrima?: boolean;
  /**
   * El permiso que declara la corrida (código). Con permiso, sólo se le ofrece
   * madera de SU permiso —el lote y la guía de cada troza—, porque el servidor
   * (`vincularCorridaEnTx`, ADR-447) rechaza la otra con `PERMISO_DISTINTO`.
   * Sin permiso (`null`/ausente), toda la de su especie, de los permisos que
   * sean: la Mashonaste de dos permisos de ADR-441 se vincula así A PROPÓSITO
   * (decisión de Brandon; el servidor lo admite porque no hay qué comparar).
   */
  permiso?: string | null;
}

/** Un lote hijo del mixto: una especie y un permiso, con sus trozas. */
export interface LoteDelMixto {
  id: string;
  code?: string | null;
  especie: string | null;
  permiso: string | null;
  /** `abierto` si no se dice. Un lote consumido o cerrado ya no aporta madera. */
  status?: string;
  trozas: readonly TrozaConsumible[];
}

export type ModoDelMixto = "todo" | "justo56";

export interface OpcionesDelMixto {
  /** `todo` (decisión 1 del dueño) o `justo56` (alternativa manual). */
  modo?: ModoDelMixto;
  /** Trozas destildadas: no entran y quedan como saldo en su lote. */
  excluidas?: readonly string[];
  /** Meta de rendimiento para `justo56` (0-1). Por defecto, el 56 % de la plaza. */
  meta?: number;
}

/** Las trozas de UN lote que entran a la corrida. */
export interface ParteDePropuesta {
  loteId: string;
  code: string | null;
  permiso: string | null;
  trozaIds: string[];
  piezas: number;
  volumenM3: number;
}

/**
 * Por qué una corrida no se ofrece. `null` = se ofrece.
 *  · `sin-especie` / `sin-volumen`: la corrida no dice qué ni cuánto produjo.
 *  · `ya-tiene-origen`: ya tiene materia prima (ADR-364).
 *  · `sin-trozas`: no hay trozas libres de su especie en el mixto.
 *  · `fecha`: todas las de su especie entraron al patio después de la corrida.
 *  · `se-acabo`: las que podían ir se las llevaron las corridas anteriores.
 *  · `regla`: `revisarVinculacion` o I2 dicen que no (el mensaje dice cuál).
 */
export type FrenoDelMixto =
  | null
  | "sin-especie"
  | "sin-volumen"
  | "ya-tiene-origen"
  | "sin-trozas"
  | "fecha"
  | "se-acabo"
  | "regla";

export interface PropuestaDeCorrida {
  corrida: CorridaDelMixto;
  partes: ParteDePropuesta[];
  piezas: number;
  /** m³ de troza que se atribuyen. */
  trozaM3: number;
  /** `producido ÷ troza × 100`, o `null` sin troza. */
  rendimientoPct: number | null;
  /** Pasa el 56 %: se avisa y se firma igual (ADR-358). */
  sobreElTope: boolean;
  /** Las cinco reglas de ADR-408 más I2 por guía. `error` bloquea, `aviso` se lee. */
  hallazgos: HallazgoVinculo[];
  revision: RevisionVinculo | null;
  puedeVincular: boolean;
  frena: FrenoDelMixto;
  mensaje: string | null;
  /** El cuerpo listo para `accion:"vincular-corrida"` (sin la `accion`), o `null` si no se puede. */
  pedido: VincularCorridaPedido | null;
}

/** Una troza del mixto que no se puede usar, con el porqué en palabras. */
export interface TrozaQueNoVa {
  id: string;
  codigo: string | null;
  loteId: string;
  especie: string | null;
  motivo: string;
}

/** Lo que queda en un lote sin ir a ninguna corrida: sigue ahí, como saldo. */
export interface SaldoDeLote {
  loteId: string;
  code: string | null;
  especie: string | null;
  permiso: string | null;
  trozaIds: string[];
  piezas: number;
  volumenM3: number;
}

export interface PlanDelMixto {
  modo: ModoDelMixto;
  /** Una por corrida, la más vieja primero. */
  propuestas: PropuestaDeCorrida[];
  saldo: SaldoDeLote[];
  /** Especies con madera libre en el mixto y ninguna corrida que la reclame. */
  especiesSinCorrida: { especie: string; piezas: number; volumenM3: number }[];
  noVan: TrozaQueNoVa[];
  /** Cuántas corridas se pueden firmar tal cual. */
  vinculables: number;
}

/** Una troza utilizable, con el lote del que sale. */
interface Candidata {
  troza: TrozaConsumible;
  lote: LoteDelMixto;
}

/** « LA-2026-004» o nada: para armar la frase sin un doble espacio cuando el lote no tiene código. */
const nombreLote = (l: Pick<LoteDelMixto, "code">) => (l.code?.trim() ? ` ${l.code.trim()}` : "");

/** Por qué una troza del lote no se puede usar. `null` = se puede; `"ya-usada"` = es historia, no se lista. */
function motivoNoVa(t: TrozaConsumible, lote: LoteDelMixto): string | "ya-usada" | null {
  const bloqueo = motivoBloqueo(t);
  if (bloqueo === "ya_consumida") return "ya-usada";
  if (bloqueo) return LABEL_BLOQUEO[bloqueo];
  /* La guía que no se recibió no está en la pila (ADR-325): el servidor la rechaza. */
  if (t.guiaRecepcionada === false) return "su guía todavía no se recibió en el patio";
  const kt = claveEspecie(t.especieComun);
  const kl = claveEspecie(lote.especie);
  if (kt && kl && kt !== kl) return `es ${t.especieComun} y el lote${nombreLote(lote)} es de ${lote.especie}`;
  return null;
}

/** La corrida como la reciben la tanda y la revisión de ADR-408. */
function enTanda(c: CorridaDelMixto): CorridaEnTanda {
  return {
    id: c.id,
    lineNo: c.lineNo ?? null,
    especie: c.especie,
    producidoM3: vol(c.volumenM3),
    largoMaxPiezaM: c.largoMaxPiezaM ?? null,
    fecha: c.fecha.slice(0, 10),
    tieneMateriaPrima: Boolean(c.tieneMateriaPrima),
  };
}

const puedeIr = (t: TrozaAVincular, c: CorridaEnTanda) => {
  const ingreso = (t.fechaIngreso ?? "").slice(0, 10);
  return !ingreso || ingreso <= c.fecha.slice(0, 10);
};

/**
 * Reparte el pool de UNA especie entre sus corridas.
 *
 * `justo56`: la tanda de siempre con la meta (primero cada corrida cubre lo
 * que produjo, después se completa hasta el 56 %).
 *
 * `todo`: la misma primera pasada sin meta, y después TODA la madera que sobra,
 * troza por troza, a la corrida que puede recibirla (T3) con el rendimiento más
 * alto — así ninguna queda con un rendimiento inflado mientras otra se lleva
 * todo el sobrante. Con una sola corrida, es simplemente «todas».
 */
function repartir(
  corridas: readonly CorridaEnTanda[],
  especie: string,
  pool: readonly TrozaAVincular[],
  modo: ModoDelMixto,
  meta: number,
): Map<string, TrozaAVincular[]> {
  const r = repartirEnTanda(
    corridas,
    { code: "", especie, status: "abierto" },
    pool,
    modo === "justo56" ? { rendimientoMeta: meta } : {},
  );
  const asignadas = new Map<string, TrozaAVincular[]>(r.filas.map((f) => [f.corrida.id, [...f.trozas]]));
  if (modo === "justo56") return asignadas;

  const usadas = new Set(r.filas.flatMap((f) => f.trozas.map((t) => t.id)));
  const acumulado = new Map(r.filas.map((f) => [f.corrida.id, f.revision.trozaM3]));
  const ordenadas = r.filas.map((f) => f.corrida);
  for (const t of pool) {
    if (usadas.has(t.id)) continue;
    let mejor: CorridaEnTanda | null = null;
    let mejorRatio = Number.POSITIVE_INFINITY;
    for (const c of ordenadas) {
      if (!puedeIr(t, c) || !(c.producidoM3 > 0)) continue;
      /* Más troza por m³ producido = rendimiento más bajo: el sobrante va a la
         que menos tiene, en proporción a lo que produjo. */
      const ratio = (acumulado.get(c.id) ?? 0) / c.producidoM3;
      if (ratio < mejorRatio) {
        mejor = c;
        mejorRatio = ratio;
      }
    }
    if (!mejor) continue;
    usadas.add(t.id);
    asignadas.get(mejor.id)!.push(t);
    acumulado.set(mejor.id, r4((acumulado.get(mejor.id) ?? 0) + t.volumenM3));
  }
  return asignadas;
}

/**
 * Arma la propuesta de vinculación para las corridas del día contra los lotes
 * del mixto.
 *
 * @param entrada.corridas las del día (una por especie en ADR-429; puede haber más).
 * @param entrada.lotes los lotes hijos del mixto, con TODAS sus trozas (el
 *   plan descarta las que no se pueden usar y dice por qué).
 */
export function planDelMixto(
  entrada: { corridas: readonly CorridaDelMixto[]; lotes: readonly LoteDelMixto[] },
  opciones: OpcionesDelMixto = {},
): PlanDelMixto {
  const modo: ModoDelMixto = opciones.modo ?? "todo";
  const meta = opciones.meta != null && opciones.meta > 0 && opciones.meta < 1 ? opciones.meta : RENDIMIENTO_META;
  const excluidas = new Set(opciones.excluidas ?? []);

  /* 1 · La madera: qué se puede usar, por especie, y qué no y por qué. */
  const noVan: TrozaQueNoVa[] = [];
  const porEspecie = new Map<string, Candidata[]>();
  const destildadas: Candidata[] = [];
  for (const lote of entrada.lotes) {
    const abierto = (lote.status ?? "abierto") === "abierto";
    for (const t of lote.trozas) {
      const motivo = abierto ? motivoNoVa(t, lote) : motivoBloqueo(t) ? "ya-usada" : `el lote${nombreLote(lote)} está ${lote.status}`;
      if (motivo === "ya-usada") continue;
      if (motivo) {
        noVan.push({ id: t.id, codigo: codigoDeTroza(t), loteId: lote.id, especie: t.especieComun, motivo });
        continue;
      }
      if (excluidas.has(t.id)) {
        destildadas.push({ troza: t, lote });
        continue;
      }
      const clave = claveEspecie(lote.especie) || claveEspecie(t.especieComun);
      if (!clave) {
        noVan.push({ id: t.id, codigo: codigoDeTroza(t), loteId: lote.id, especie: t.especieComun, motivo: "no tiene especie" });
        continue;
      }
      porEspecie.set(clave, [...(porEspecie.get(clave) ?? []), { troza: t, lote }]);
    }
  }
  const lotePorTroza = new Map<string, LoteDelMixto>();
  for (const cs of porEspecie.values()) for (const c of cs) lotePorTroza.set(c.troza.id, c.lote);

  /* 2 · Las corridas: las que no se pueden vincular se dicen antes de repartir. */
  const ordenadas = [...entrada.corridas].sort(
    (a, b) => a.fecha.slice(0, 10).localeCompare(b.fecha.slice(0, 10)) || (a.lineNo ?? 0) - (b.lineNo ?? 0),
  );
  const frenoPrevio = new Map<string, { frena: FrenoDelMixto; mensaje: string }>();
  const corridasPorEspecie = new Map<string, CorridaDelMixto[]>();
  for (const c of ordenadas) {
    const clave = claveEspecie(c.especie);
    const n = c.lineNo != null ? ` N° ${c.lineNo}` : "";
    if (!clave) {
      frenoPrevio.set(c.id, { frena: "sin-especie", mensaje: `La corrida${n} no declara especie: no se sabe qué madera buscar.` });
    } else if (!(vol(c.volumenM3) > 0)) {
      frenoPrevio.set(c.id, { frena: "sin-volumen", mensaje: `La corrida${n} no declara m³ de producto: declárala antes de vincularla.` });
    } else if (c.tieneMateriaPrima) {
      frenoPrevio.set(c.id, {
        frena: "ya-tiene-origen",
        mensaje: `La corrida${n} ya tiene materia prima: sumarle más le cambiaría el rendimiento (ADR-364).`,
      });
    } else {
      corridasPorEspecie.set(clave, [...(corridasPorEspecie.get(clave) ?? []), c]);
    }
  }

  /* 3 · El reparto, especie por especie, sobre la madera en el orden de la sierra.
     Dentro de la especie, por permiso (ADR-447): primero las corridas CON
     permiso, cada una sólo con la madera de su permiso (lote Y guía de la
     troza: lo que mira el servidor); después las sin permiso, con lo que quede
     de cualquier permiso (el caso de ADR-441, a propósito). */
  const asignadas = new Map<string, TrozaAVincular[]>();
  /** El pool de CADA corrida (el de su grupo): con él se dice por qué no le tocó madera. */
  const poolDe = new Map<string, TrozaAVincular[]>();
  /** Corridas con permiso cuya especie sólo tiene madera de OTRO permiso en el mixto: los permisos de esa madera. */
  const otroPermiso = new Map<string, string[]>();
  for (const [clave, cs] of corridasPorEspecie) {
    const candidatas = porEspecie.get(clave) ?? [];
    const especie = cs[0]!.especie?.trim() || clave;
    const porPermiso = new Map<string, CorridaDelMixto[]>();
    for (const c of cs) {
      const k = clavePermiso({ contratoId: null, codigo: c.permiso ?? null }) ?? "";
      porPermiso.set(k, [...(porPermiso.get(k) ?? []), c]);
    }
    const grupos = [...porPermiso.entries()].sort(([a], [b]) => (a ? 0 : 1) - (b ? 0 : 1) || a.localeCompare(b));
    const tomadas = new Set<string>();
    for (const [k, gcs] of grupos) {
      const ref = { contratoId: null, codigo: gcs[0]!.permiso ?? null };
      const libres = candidatas.filter((x) => !tomadas.has(x.troza.id));
      const suyas = k
        ? libres.filter(
            (x) =>
              mismoPermiso(ref, { contratoId: null, codigo: x.lote.permiso }) &&
              mismoPermiso(ref, { contratoId: null, codigo: x.troza.permiso ?? null }),
          )
        : libres;
      const pool = ordenarTrozas(suyas.map((x) => x.troza)).map((t) => trozaAVincular(t, fechaIngresoDeTroza(t)));
      for (const c of gcs) poolDe.set(c.id, pool);
      if (k && pool.length === 0 && libres.length > 0) {
        const permisos = [...new Set(libres.map((x) => x.lote.permiso ?? x.troza.permiso ?? "").filter(Boolean))];
        for (const c of gcs) otroPermiso.set(c.id, permisos);
      }
      if (pool.length === 0) continue;
      for (const [id, ts] of repartir(gcs.map(enTanda), especie, pool, modo, meta)) {
        asignadas.set(id, ts);
        for (const t of ts) tomadas.add(t.id);
      }
    }
  }

  /* 4 · I2 por guía sobre TODO lo propuesto: dos corridas pueden tirar de la misma guía. */
  const trozaPorId = new Map<string, TrozaConsumible>();
  for (const cs of porEspecie.values()) for (const c of cs) trozaPorId.set(c.troza.id, c.troza);
  const propuestasTodas = [...asignadas.values()].flat().map((t) => trozaPorId.get(t.id)!).filter(Boolean);
  const guiasLlenas = new Map(
    cuposDeGuia(propuestasTodas)
      .filter((c) => c.exceso > 0)
      .map((c) => [c.woodEntryId, motivoDeCupo(c)]),
  );

  /* 5 · La propuesta de cada corrida, con sus partes por lote. */
  const propuestas: PropuestaDeCorrida[] = ordenadas.map((c) => {
    const previo = frenoPrevio.get(c.id);
    if (previo) {
      return {
        corrida: c,
        partes: [],
        piezas: 0,
        trozaM3: 0,
        rendimientoPct: null,
        sobreElTope: false,
        hallazgos: [],
        revision: null,
        puedeVincular: false,
        frena: previo.frena,
        mensaje: previo.mensaje,
        pedido: null,
      };
    }
    const clave = claveEspecie(c.especie);
    const mias = asignadas.get(c.id) ?? [];
    const pool = poolDe.get(c.id) ?? [];
    const tanda = enTanda(c);

    /* Partes por lote, en el orden de los códigos: es como se leen en la pantalla. */
    const porLote = new Map<string, ParteDePropuesta>();
    for (const t of mias) {
      const lote = lotePorTroza.get(t.id)!;
      const parte =
        porLote.get(lote.id) ??
        { loteId: lote.id, code: lote.code ?? null, permiso: lote.permiso, trozaIds: [], piezas: 0, volumenM3: 0 };
      parte.trozaIds.push(t.id);
      parte.piezas += 1;
      parte.volumenM3 = r4(parte.volumenM3 + t.volumenM3);
      porLote.set(lote.id, parte);
    }
    const partes = [...porLote.values()].sort((a, b) => (a.code ?? a.loteId).localeCompare(b.code ?? b.loteId, "es-PE", { numeric: true }));

    const revision = revisarVinculacion(
      tanda,
      { code: partes.map((p) => p.code ?? p.loteId).join(" + ") || "—", especie: c.especie, status: "abierto" },
      mias,
    );
    const hallazgos: HallazgoVinculo[] = [...revision.hallazgos];
    const guias = new Set(mias.map((t) => trozaPorId.get(t.id)?.woodEntryId));
    for (const [woodEntryId, mensaje] of guiasLlenas) {
      if (guias.has(woodEntryId)) hallazgos.push({ regla: "volumen", severidad: "error", mensaje });
    }
    if (partes.length > MAX_PARTES_POR_CORRIDA) {
      hallazgos.push({
        regla: "lote",
        severidad: "error",
        mensaje: `La madera sale de ${partes.length} lotes y una vinculación admite ${MAX_PARTES_POR_CORRIDA}: destilda trozas de los lotes más chicos.`,
      });
    }
    const error = hallazgos.find((h) => h.severidad === "error");
    const frena: FrenoDelMixto =
      mias.length === 0
        ? pool.length === 0
          ? "sin-trozas"
          : pool.some((t) => puedeIr(t, tanda))
            ? "se-acabo"
            : "fecha"
        : error
          ? "regla"
          : null;
    const especie = c.especie?.trim() || clave;
    const ajenos = otroPermiso.get(c.id);
    const mensaje =
      frena === "sin-trozas" && ajenos
        ? `Las trozas de ${especie} del mixto son de otro permiso${ajenos.length > 0 ? ` (${ajenos.join(", ")})` : ""} ` +
          `y la corrida es del ${c.permiso}: corrige el permiso de la corrida o vincúlala con madera de su permiso.`
        : frena === "sin-trozas"
        ? `No hay trozas de ${especie} libres en el mixto ni en sus lotes.`
        : frena === "fecha"
          ? `Todas las trozas de ${especie} entraron al patio después del ${tanda.fecha}: no pudieron estar en esa sierra.`
          : frena === "se-acabo"
            ? `Las trozas de ${especie} que podían ir ya se las llevaron las corridas anteriores.`
            : frena === "regla"
              ? (error?.mensaje ?? null)
              : null;
    const puedeVincular = frena == null;
    return {
      corrida: c,
      partes,
      piezas: mias.length,
      trozaM3: revision.trozaM3,
      rendimientoPct: revision.rendimientoPct,
      sobreElTope: puedeVincular && pasaElTope(revision.rendimientoPct),
      hallazgos,
      revision,
      puedeVincular,
      frena,
      mensaje,
      pedido: puedeVincular
        ? { corridaId: c.id, partes: partes.map((p) => ({ loteId: p.loteId, trozaIds: p.trozaIds })) }
        : null,
    };
  });

  /* 6 · El saldo: lo libre que no fue a ninguna corrida sigue en su lote. */
  const enUso = new Set([...asignadas.values()].flat().map((t) => t.id));
  const saldoPorLote = new Map<string, SaldoDeLote>();
  const sumarSaldo = ({ troza, lote }: Candidata) => {
    const s =
      saldoPorLote.get(lote.id) ??
      { loteId: lote.id, code: lote.code ?? null, especie: lote.especie, permiso: lote.permiso, trozaIds: [], piezas: 0, volumenM3: 0 };
    s.trozaIds.push(troza.id);
    s.piezas += 1;
    s.volumenM3 = r4(s.volumenM3 + vol(troza.volumenM3));
    saldoPorLote.set(lote.id, s);
  };
  for (const cs of porEspecie.values()) for (const c of cs) if (!enUso.has(c.troza.id)) sumarSaldo(c);
  for (const c of destildadas) sumarSaldo(c);

  const especiesSinCorrida = [...porEspecie.entries()]
    .filter(([clave]) => !corridasPorEspecie.has(clave))
    .map(([clave, cs]) => ({
      especie: cs[0]!.lote.especie?.trim() || cs[0]!.troza.especieComun?.trim() || clave,
      piezas: cs.length,
      volumenM3: r4(cs.reduce((a, c) => a + vol(c.troza.volumenM3), 0)),
    }))
    .sort((a, b) => b.volumenM3 - a.volumenM3 || a.especie.localeCompare(b.especie, "es"));

  return {
    modo,
    propuestas,
    saldo: [...saldoPorLote.values()].sort((a, b) => (a.code ?? a.loteId).localeCompare(b.code ?? b.loteId, "es-PE", { numeric: true })),
    especiesSinCorrida,
    noVan,
    vinculables: propuestas.filter((p) => p.puedeVincular).length,
  };
}
