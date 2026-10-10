/**
 * «Saber de qué trozas salió»: por qué cada corrida sin origen no tiene su
 * madera, y qué trozas le tocan (Libro CTP, forestal).
 *
 * Medido en `inversiones-agroforestales-blas-sociedad-anonima` (2026-09-27):
 * 44 de 44 corridas vivas SIN ORIGEN —ni consumos ni reprocesos—. Casi ninguna
 * se puede vincular hoy, y cada una por una razón que se arregla en OTRO lado:
 * la guía no se recibió, la troza figura llegada después de la corrida, está
 * anotada en la fila de otra especie de su guía, o es madera de antes del libro.
 * Una pantalla que sólo dice «sin origen» no enseña qué hacer; ésta dice el
 * motivo, en una frase, y cuando se puede, propone las trozas.
 *
 * ## Qué es «sin origen»
 *
 * La regla VERDADERA, la de `corridaSinOrigen` (`loctp-consumos-analisis.ts`):
 * ninguna arista de `ForestCtpConsumo` ni de `ForestCtpReproceso` llega a la
 * corrida. El volumen de entrada escrito en el asiento NO es un origen: las 5
 * corridas del 01/08 de Blas declaran 142 m³ y ninguna troza
 * ([[materiaprimaref-no-es-origen]]). Esas van por «Declarar apertura».
 *
 * ## El motivo es el arreglo más corto
 *
 * Cada troza de la especie y del permiso de la corrida se detiene en la PRIMERA
 * regla que no pasa, en el orden en que se arreglan en la vida real:
 *
 *   guía sin recibir → llegó después de la corrida (T3) → anotada en la fila de
 *   otra especie → su guía ya no tiene volumen libre (I2) → lista
 *
 * El motivo de la corrida es la etapa más ALTA que, sumando todo lo que está de
 * ahí para arriba, cubre lo producido (de la sierra no sale más de lo que entró).
 * Así el mensaje nombra el arreglo mínimo: si con corregir una fecha alcanza, no
 * se le pide recibir otra guía.
 *
 * ## «No hay madera» se dice al final (ADR-447)
 *
 * Antes de decir que no hay madera se mira adónde fue: si OTRA corrida viva la
 * tiene (`tomada_por_otra_corrida`: la N° 61 con las 12 de Cachimbo), si hay
 * una especie de nombre parecido (`especie_parecida`: «Huayruro» para
 * «Huayruro Negro», que NO se iguala en la regla), si las libres son de otro
 * permiso (`permiso_distinto`) o si al permiso le falta la guía o su lista de
 * trozas (`guia_sin_trozas`). Cada motivo trae su `arreglo`: el dato para abrir
 * el modal que ya existe. Ninguno se aplica solo. Sin `contexto` (tomadas,
 * guías, hoy), los motivos que lo necesitan no se dicen.
 *
 * ## La propuesta
 *
 * Sólo con motivo `lista`. Primero las piezas ya apartadas en un lote abierto de
 * la especie y el permiso, después las sueltas del patio, cada grupo en el orden
 * de la sierra (llegada, código). Se pre-marca hasta cubrir lo producido ÷ 56 %
 * con el MISMO reparto que usa «Descontar la madera usada» (`repartoDelGrupo`):
 * no hay una segunda forma de decidir de qué madera salió una corrida. El 56 %
 * es la meta, no un techo: si la madera no alcanza para él, igual se propone
 * (rinde de más y se avisa), porque cubre lo producido.
 *
 * La propuesta de UNA corrida no mira a las otras: dos corridas pueden recibir
 * la misma troza en el diagnóstico. El servidor decide al vincular (lock + T1).
 *
 * PURO y client-safe: sin DB, sin React y sin `window`.
 */

import { z } from "zod";
import { formatNumber } from "@/lib/format";
import { normalizarCodigoContrato } from "./contratos";
import { PT_POR_M3 } from "./cubicacion";
import { guiaRecibida, type TrozaConsumible } from "./consumo-trozas";
import { propuestaDeLlegada, sigueALaGuia, type FuenteDeLlegada } from "./fecha-de-llegada";
import { RENDIMIENTO_META } from "./loctp-catalogos";
import { claveEspecie } from "./loth-constants";
import { diaDelLibro, ingresoDeLaTroza } from "./recepcion-antes-de-la-sierra";
import { repartoDelGrupo } from "./vincular-desde-permiso";
import type { CorridaEnTanda } from "./vincular-en-tanda";
import { TOPE_RENDIMIENTO_PCT } from "./vincular-produccion";

// ── Contrato con la pantalla ────────────────────────────────────────────────

/** El pedido de vincular: la persona confirmó ESTAS trozas para ESTA corrida. */
export const vincularTrozasSchema = z.object({
  corridaId: z.string().trim().min(1).max(40),
  trozaIds: z.array(z.string().trim().min(1).max(40)).min(1).max(500),
});
export type VincularTrozasPedido = z.infer<typeof vincularTrozasSchema>;

/**
 * Corridas por pedido de tanda. Cada una es su propia transacción (~30
 * consultas con sus locks): 15 entran holgadas en el plazo de la ruta
 * (`maxDuration` 300 s en `vercel.json`); una tanda más grande se manda en
 * varios pedidos, y lo que no alcanzó a entrar vuelve `pendiente`.
 */
export const MAX_CORRIDAS_POR_TANDA = 15;

/**
 * Vincular en tanda (ADR-447 §4): cada corrida con las trozas que la persona
 * confirmó en la propuesta. Una troza en dos corridas, una troza dos veces en
 * la misma, o una corrida dos veces, es un pedido mal armado (400) antes de
 * tocar la base.
 */
export const vincularTandaSchema = z
  .object({
    tanda: z
      .array(vincularTrozasSchema)
      .min(1)
      .max(MAX_CORRIDAS_POR_TANDA, `Una tanda lleva hasta ${MAX_CORRIDAS_POR_TANDA} corridas: manda el resto en otra.`),
  })
  .superRefine((v, ctx) => {
    const corridas = new Set<string>();
    /* De qué corrida es cada troza ya vista: la frase dice si se repite en la
       MISMA corrida o en dos. */
    const dueña = new Map<string, number>();
    for (const [i, p] of v.tanda.entries()) {
      if (corridas.has(p.corridaId)) {
        ctx.addIssue({ code: "custom", path: ["tanda", i, "corridaId"], message: "Una corrida aparece dos veces en la tanda." });
      }
      corridas.add(p.corridaId);
      for (const t of p.trozaIds) {
        const previa = dueña.get(t);
        if (previa != null) {
          ctx.addIssue({
            code: "custom",
            path: ["tanda", i, "trozaIds"],
            message:
              previa === i
                ? "Una troza aparece dos veces en la misma corrida: cada pieza entra una sola vez."
                : "Una troza aparece en dos corridas de la tanda: cada pieza entra a una sola.",
          });
          return;
        }
        dueña.set(t, i);
      }
    }
  });
export type VincularTandaPedido = z.infer<typeof vincularTandaSchema>;

/** Cómo terminó UNA corrida de la tanda. Las demás siguen aunque ésta no. */
export type ResultadoCorridaEnTanda =
  | {
      corridaId: string;
      lineNo: number | null;
      estado: "vinculada";
      trozas: number;
      m3: number;
      lotesArmados: string[];
      rendimientoPct: number | null;
      sobreElTope: boolean;
    }
  | {
      corridaId: string;
      lineNo: number | null;
      /** Ya tenía origen (un reintento, u otra pestaña): no se escribió nada. */
      estado: "ya_vinculada";
      /** Piezas que ya tiene marcadas. */
      trozas: number;
      /** Son exactamente las pedidas: fue un reintento. */
      mismas: boolean;
      mensaje: string;
    }
  | {
      corridaId: string;
      lineNo: number | null;
      /** El libro dijo que no (T1, T3, permiso, volumen, I2, mes cerrado): nada escrito de esta. */
      estado: "bloqueada";
      codigo: string;
      mensaje: string;
    }
  | {
      corridaId: string;
      lineNo: number | null;
      /** Otra operación tenía las trozas, otra tanda arrancó en el medio, o falló el servidor. */
      estado: "error";
      codigo: "LIBRO_OCUPADO" | "TANDA_EN_CURSO" | "INTERNO";
      mensaje: string;
    }
  | {
      corridaId: string;
      lineNo: number | null;
      /** Se acabó el plazo del pedido antes de empezarla: no se tocó; se manda en otro pedido. */
      estado: "pendiente";
      mensaje: string;
    };

export interface ResultadoTandaVincular {
  /** En el orden en que se escribieron: la más vieja primero. */
  corridas: ResultadoCorridaEnTanda[];
  resumen: {
    vinculadas: number;
    yaVinculadas: number;
    bloqueadas: number;
    errores: number;
    /** No se alcanzaron a intentar (plazo del pedido): van en el siguiente. */
    pendientes: number;
    trozas: number;
    m3: number;
  };
}

export type MotivoSinOrigen =
  /** Hay propuesta que pasa todas las reglas. */
  | "lista"
  /** Las trozas llegaron después de la corrida (T3). */
  | "llegada_posterior"
  /** Hay trozas, pero anotadas en la fila de otra especie de su guía. */
  | "fila_de_otra_especie"
  | "guia_sin_recibir"
  /**
   * Las trozas de la especie y el permiso ya entraron a OTRA corrida viva
   * (ADR-447: en Blas la N° 61 tomó las 12 de Cachimbo y la N° 62 las 7 de
   * Panguana). Decirle «no hay trozas en el patio» era falso: hubo, y otra
   * corrida las tiene. Lo decide la persona, nunca se mueven solas.
   */
  | "tomada_por_otra_corrida"
  /** Hay trozas libres de la especie, pero todas de OTRO permiso (la Copaiba del 2024-008). */
  | "permiso_distinto"
  /** No hay de la especie, pero sí de una de nombre parecido («Huayruro» para «Huayruro Negro»). */
  | "especie_parecida"
  /** El permiso no tiene ninguna guía en el libro, o su guía no tiene la lista de trozas. */
  | "guia_sin_trozas"
  /** Lote de inventario / madera de antes del libro: va por «Declarar apertura». */
  | "apertura"
  /**
   * No hay madera usable de la especie: ninguna troza, no alcanzan para lo
   * producido, o su guía ya no tiene volumen libre.
   */
  | "sin_trozas_de_la_especie";

/** Todos los motivos, en el orden en que la pantalla los lista. */
export const MOTIVOS_SIN_ORIGEN: readonly MotivoSinOrigen[] = [
  "lista",
  "llegada_posterior",
  "fila_de_otra_especie",
  "guia_sin_recibir",
  "tomada_por_otra_corrida",
  "permiso_distinto",
  "especie_parecida",
  "guia_sin_trozas",
  "apertura",
  "sin_trozas_de_la_especie",
];

// ── El arreglo: qué se hace, dónde, con qué dato (ADR-447) ──────────────────

/** Una guía a corregir o a recibir, con la llegada que se propone y de dónde sale. */
export interface GuiaDelArreglo {
  gtfNumber: string;
  /** Las filas (`WoodEntry`) de esa guía que tienen las trozas de la corrida. */
  woodEntryIds: string[];
  trozas: number;
  m3: number;
  /** La llegada que figura hoy (la primera de sus trozas); `null` = no se recibió. */
  llegada: string | null;
  /**
   * La que se PROPONE (ADR-434 §1): la fecha de la guía, o la del asiento si la
   * guía no trae. Nunca futura. Se confirma en «Corregir la recepción» con
   * motivo: acá no se escribe. `null` = no hay de dónde sacarla.
   */
  propuesta: string | null;
  fuente: FuenteDeLlegada | null;
  /** Con la propuesta, la madera ya estaba en el patio el día de la corrida. */
  sirve: boolean;
}

/** Una corrida viva que ya tiene las trozas que a ésta le faltan. */
export interface TomadaPor {
  corridaId: string;
  lineNo: number | null;
  /** AAAA-MM-DD. */
  fecha: string;
  /** m³ de producto de AQUELLA corrida; `null` = no declara lo producido. */
  m3Producido: number | null;
  /** Todavía no declara lo producido. */
  abierta: boolean;
  trozas: number;
  m3: number;
  /**
   * (lo de ésta + lo de aquella) ÷ la madera que aquella tomó × 100: si las dos
   * salieron de esas trozas, rinden esto juntas. `null` = no se puede calcular.
   */
  sumadasPct: number | null;
}

/**
 * El arreglo más corto de una corrida sin origen, con el dato que la pantalla
 * necesita para abrir el modal que YA existe. Nada de esto se aplica solo:
 * cada uno es un botón que la persona aprieta y confirma.
 */
export type ArregloDeCorrida =
  /** Nada que arreglar en el libro: está lista, o no hay madera y hay que esperarla. */
  | { tipo: "ninguno" }
  /** «Corregir la recepción» (ADR-434) de estas guías. */
  | { tipo: "corregir_llegada"; guias: GuiaDelArreglo[] }
  /**
   * «Recibir en bloque» de estas guías. `corregirTambien` = las guías ya
   * recibidas cuyas trozas también hacen falta y llegaron después: recibir solo
   * no alcanza.
   */
  | { tipo: "recibir_guia"; guias: GuiaDelArreglo[]; corregirTambien?: GuiaDelArreglo[] }
  /** «Acomodar trozas en su especie» (ADR-435). */
  | {
      tipo: "acomodar_trozas";
      guias: { gtfNumber: string; woodEntryIds: string[]; especieDeLaFila: string | null; trozas: number }[];
    }
  /** «Declarar apertura» (ADR-394). */
  | { tipo: "declarar_apertura" }
  /** Otra corrida tiene la madera: la persona decide si la suelta (nunca solo). */
  | { tipo: "soltar_corrida"; corridas: TomadaPor[] }
  /** El permiso de la corrida no es el de la madera: se corrige en su ficha (ADR-401). */
  | {
      tipo: "corregir_corrida";
      campo: "permiso";
      actual: string | null;
      propuestos: { codigo: string; contratoId: string | null; trozas: number; m3: number }[];
    }
  /** «Es la misma especie»: se corrige en la ficha de la corrida. `propuesta: null` = no dice su especie. */
  | { tipo: "corregir_corrida"; campo: "especie"; actual: string; propuesta: string | null; trozas: number; m3: number }
  /** Registrar la guía del permiso, o cargar la lista de trozas de la que ya está (`guias` vacío = el permiso no tiene ninguna). */
  | {
      tipo: "cargar_guia";
      permiso: string | null;
      guias: { woodEntryId: string; gtfNumber: string; especie: string | null; m3: number; recibida: boolean }[];
    };

// ── Lo que el patio no tiene pero explica por qué falta (ADR-447) ───────────

/** La corrida viva que tomó una troza. */
export interface CorridaTomadora {
  id: string;
  lineNo: number | null;
  /** AAAA-MM-DD. */
  fecha: string;
  /** m³ de producto; `null` = todavía no declara lo producido. */
  m3Producido: number | null;
}

/** Una troza que ya entró a OTRA corrida viva: no está en el patio, pero dice adónde fue. */
export interface TrozaTomada {
  id: string;
  especie: string | null;
  m3: number;
  /** El permiso de su guía. */
  permiso: PermisoRef;
  corrida: CorridaTomadora;
}

/** Una fila de guía viva del libro (`WoodEntry`), tenga o no trozas. */
export interface GuiaDelLibro {
  id: string;
  gtfNumber: string;
  especie: string | null;
  m3: number;
  recibida: boolean;
  /** Trozas listadas en la fila; 0 = la guía está pero sin su lista de piezas. */
  trozas: number;
  permiso: PermisoRef;
}

/** Lo que el diagnóstico mira además del patio: sin esto, los motivos nuevos no se dicen. */
export interface ContextoDelPatio {
  tomadas: readonly TrozaTomada[];
  guias: readonly GuiaDelLibro[];
  /** Hoy en Lima (AAAA-MM-DD, `limaDateKey`): la llegada propuesta nunca es futura. */
  hoy: string;
}

export interface OpcionesDeDiagnostico {
  contexto?: ContextoDelPatio | null;
  /**
   * SÓLO para medir cuánto frena la regla del permiso (`simularArreglos`):
   * nunca para proponer ni vincular.
   */
  ignorarPermiso?: boolean;
}

export interface TrozaPropuesta {
  trozaId: string;
  codigo: string;
  m3: number;
  gtfNumber: string;
  especie: string;
}

export interface DiagnosticoCorrida {
  corridaId: string;
  lineNo: number | null;
  /** AAAA-MM-DD. */
  fecha: string;
  especie: string;
  permiso: string | null;
  m3Producido: number;
  motivo: MotivoSinOrigen;
  /** Una frase simple: qué pasa y dónde se arregla. */
  detalle: string;
  propuesta: TrozaPropuesta[];
  m3Propuesto: number;
  /** El arreglo, con el dato para abrir su modal (ADR-447). Siempre viene del servidor. */
  arreglo: ArregloDeCorrida;
  /**
   * El mes de la corrida está CERRADO (ADR-139): nombre del período, o `null`.
   * El motivo sigue hablando de la madera; esto dice que además el libro no se
   * toca hasta reabrirlo. La pantalla apaga «Vincular» con él.
   */
  mesCerrado?: string | null;
}

export interface DiagnosticoSinOrigen {
  corridas: DiagnosticoCorrida[];
  porMotivo: Record<MotivoSinOrigen, number>;
  total: number;
}

export type ResultadoVincularTrozas =
  | {
      ok: true;
      corridaId: string;
      trozas: number;
      m3: number;
      lotesArmados: string[];
      /** `producido ÷ troza × 100` que quedó escrito, o `null` si no se puede calcular. */
      rendimientoPct?: number | null;
      /** Pasa el 56 % de la plaza: se avisa, no se corrige (ADR-358). */
      sobreElTope?: boolean;
    }
  | { ok: false; error: string; message: string };

// ── Lo que el servidor ya decidió de cada troza ─────────────────────────────

/** El permiso de una punta: el contrato cargado (ADR-421) y el código escrito. */
export interface PermisoRef {
  contratoId: string | null;
  /** `ForestContrato.codigo`, o el `originCode` escrito si no hay contrato. */
  codigo: string | null;
}

/**
 * ¿Las dos puntas son el MISMO título habilitante?
 *
 * Con los dos contratos cargados manda el vínculo; si no, el código
 * normalizado (`normalizarCodigoContrato`, el mismo que usa el alta del
 * contrato). Sin dato en una punta NO se afirma que difieren: una guía vieja sin
 * código de origen sigue siendo válida (ADR-421), igual que el lote sin permiso
 * de ADR-393.
 */
export function mismoPermiso(a: PermisoRef, b: PermisoRef): boolean {
  if (a.contratoId && b.contratoId) return a.contratoId === b.contratoId;
  const ca = normalizarCodigoContrato(a.codigo ?? "");
  const cb = normalizarCodigoContrato(b.codigo ?? "");
  if (!ca || !cb) return true;
  return ca === cb;
}

/**
 * De trozas de varios permisos, las del permiso con más m³ (desempate por
 * código) más las que no declaran permiso. Es lo que el servidor admite en
 * una corrida sin permiso propio.
 */
export function deUnSoloPermiso<T extends { m3: number; permiso: PermisoRef }>(trozas: readonly T[]): T[] {
  const porPermiso = new Map<string, number>();
  for (const t of trozas) {
    const k = clavePermiso(t.permiso);
    if (k) porPermiso.set(k, (porPermiso.get(k) ?? 0) + (t.m3 || 0));
  }
  if (porPermiso.size <= 1) return [...trozas];
  const [elegido] = [...porPermiso.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return trozas.filter((t) => {
    const k = clavePermiso(t.permiso);
    return !k || k === elegido;
  });
}

/** La clave con la que se agrupan permisos al buscar mezclas (`null` = sin dato). */
export function clavePermiso(p: PermisoRef): string | null {
  const c = normalizarCodigoContrato(p.codigo ?? "");
  return c || p.contratoId || null;
}

/**
 * El permiso de una fila del libro (guía, corrida o lote): el contrato VIVO si
 * lo tiene (ADR-421); si no, el código escrito. Una sola regla para los dos
 * vinculadores: si divergieran, uno aceptaría lo que el otro rechaza.
 */
export function permisoRef(
  contratoId: string | null,
  contrato: { codigo: string; deletedAt: Date | string | null } | null | undefined,
  texto: string | null | undefined,
): PermisoRef {
  const vivo = contrato && !contrato.deletedAt ? contrato : null;
  return {
    contratoId: vivo ? contratoId : null,
    codigo: vivo?.codigo?.trim() || texto?.trim() || null,
  };
}

/**
 * El estado de una troza tal como lo lee el servidor, ya derivado: el ESTADO de
 * la corrida que la tomó (una anulada devolvió la madera al patio), del
 * despacho, del mixto y del lote — nunca el id pelado.
 */
export interface EstadoDeTroza {
  consumidaViva: boolean;
  despachadaViva: boolean;
  guiaAnulada: boolean;
  noRecepcionada: boolean;
  descarte: boolean;
  /** Cuántos pedazos tiene: una madre retrozada ya no entra entera. */
  retrozos: number;
  m3: number;
  /** El lote mixto donde está apartada, sólo si sigue abierto (LM4). */
  mixto: { code: string } | null;
  /** El lote de aserrío donde está, si está en uno vivo. */
  lote: { code: string; status: string; corridaViva: boolean } | null;
}

/**
 * ¿La troza está libre del lote que la tiene? Sí cuando no tiene lote, o cuando
 * su lote quedó `consumido` por una corrida que se anuló: esa madera volvió al
 * patio (ADR-326 §6) y el lote apunta a algo muerto (`alertasDeLote`).
 */
export function liberadaDeSuLote(lote: EstadoDeTroza["lote"]): boolean {
  return !lote || (lote.status === "consumido" && !lote.corridaViva);
}

/**
 * Por qué esta troza no puede ir a la sierra, sea cual sea la corrida. `null` =
 * puede. La guía SIN RECIBIR no va acá: es una etapa del diagnóstico, con su
 * propio arreglo (recibirla en Ingresos).
 *
 * Es la regla de `motivoNoVinculable` (`forest-vincular-corrida.db.ts`) más lo
 * que ese vinculador no puede ver porque sólo recibe lotes: el mixto y el lote
 * cerrado.
 */
export function motivoFueraDeLaSierra(t: EstadoDeTroza): string | null {
  if (t.consumidaViva) return "ya entró a una corrida";
  if (t.despachadaViva) return "ya se despachó sin aserrar";
  if (t.guiaAnulada) return "la guía de ingreso está anulada o rechazada";
  if (t.mixto) return `está en el lote mixto ${t.mixto.code}: repártelo primero`;
  if (t.noRecepcionada) return "no llegó al patio";
  if (t.descarte) return "es descarte del retrozado";
  if (t.retrozos > 0) return "se cortó en pedazos: vincula los pedazos";
  if (!(t.m3 > 0)) return "no tiene volumen registrado";
  if (t.lote && t.lote.status !== "abierto" && !liberadaDeSuLote(t.lote)) {
    return `está en el lote ${t.lote.code}, que ya está ${t.lote.status}`;
  }
  return null;
}

/** Una troza candidata, ya leída y derivada por el servidor. */
export interface TrozaParaDiagnostico {
  id: string;
  /** Código de planta o del bosque; `null` si no tiene. */
  codigo: string | null;
  especie: string | null;
  m3: number;
  gtfNumber: string | null;
  /** La fila de guía (`WoodEntry`) de la que cuelga: ahí cae su consumo (I2). */
  fila: { id: string; especie: string | null; m3: number; consumidoM3: number };
  /** El permiso de su GUÍA (la misma fuente que el lote, ADR-393). */
  permiso: PermisoRef;
  guiaRecibida: boolean;
  /** Desde cuándo está en el patio (AAAA-MM-DD): troza → guía → asiento, como T3. */
  fechaIngreso: string | null;
  /** `motivoFueraDeLaSierra`; `null` = puede ir. */
  fuera: string | null;
  /** El lote ABIERTO donde ya está apartada; `null` si está suelta o liberada. */
  lote: { id: string; code: string; especie: string | null; permiso: string | null } | null;
  /**
   * Las fechas con que se propone corregir o recibir su llegada (ADR-447). Sin
   * esto, el arreglo no puede proponer fecha (no se inventa).
   */
  llegada?: {
    /** `gtfDate` de su guía: la fecha que declara el papel (AAAA-MM-DD). */
    guia: string | null;
    /** `entryDate` del asiento de su guía. */
    asiento: string | null;
    /**
     * Toma la fecha nueva al corregir la guía: no tiene fecha propia, o tiene la
     * misma que su asiento (`sigueALaGuia`, ADR-434). Una que bajó en otro viaje
     * conserva la suya y el arreglo de la guía no la mueve.
     */
    sigueALaGuia: boolean;
  };
}

/** La corrida (o la que se va a declarar) como la mira la propuesta. */
export interface CorridaParaProponer {
  id?: string | null;
  lineNo?: number | null;
  especie: string | null;
  permiso: PermisoRef;
  /** AAAA-MM-DD o ISO: el día en que se aserró. */
  fecha: string;
  /** m³ de producto (0 si no se sabe). */
  m3Producido: number;
}

export interface CorridaParaDiagnostico extends CorridaParaProponer {
  id: string;
  lineNo: number | null;
  /**
   * La corrida ya declara materia prima SIN trozas —lote de inventario, volumen
   * de entrada escrito, apertura declarada, piezas marcadas—: el vinculador la
   * rechaza («ya tiene materia prima»). En palabras, o `null`.
   */
  materiaPrimaSinTrozas: string | null;
  /** El período cerrado donde cae la corrida («julio de 2026»), o `null`. */
  mesCerrado?: string | null;
  /**
   * Qué clase de materia prima sin trozas declara (acompaña a
   * `materiaPrimaSinTrozas`): sólo el lote de inventario y el volumen escrito se
   * arreglan declarando apertura.
   */
  materiaPrima?: "apertura_declarada" | "lote_inventario" | "volumen_escrito" | "piezas_sin_consumo" | null;
}

export interface PropuestaDeTrozas {
  motivo: MotivoSinOrigen;
  detalle: string;
  propuesta: TrozaPropuesta[];
  m3Propuesto: number;
  arreglo: ArregloDeCorrida;
}

// ── El cálculo ──────────────────────────────────────────────────────────────

const r4 = (n: number) => Math.round(n * 10_000) / 10_000 || 0;
/** Diez litros: la tolerancia del patio, la misma de `vincularCorridaEnTx`. */
const TOL_M3 = 0.01;
const fm3 = (n: number) => `${formatNumber(n, 3)} m³`;
const ddmm = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
const ddmmaaaa = (dia: string) => `${ddmm(dia)}/${dia.slice(0, 4)}`;
const suma = (ts: readonly { m3: number }[]) => r4(ts.reduce((a, t) => a + t.m3, 0));

/** Hasta dos nombres y «y N más»: una frase, no una lista. */
function nombrar(xs: readonly string[]): string {
  const u = [...new Set(xs.filter(Boolean))];
  if (u.length <= 2) return u.join(" y ");
  return `${u.slice(0, 2).join(", ")} y ${u.length - 2} más`;
}

type Etapa = "sin_recibir" | "tarde" | "otra_fila" | "sin_saldo" | "ok";

interface Evaluada {
  t: TrozaParaDiagnostico;
  etapa: Etapa;
  /** Todo lo que le falta, no sólo lo primero: el detalle dice «además…». */
  problemas: Set<Exclude<Etapa, "ok">>;
}

/** El orden de la sierra: llegada, después código. El mismo de `ordenarTrozas`. */
function ordenSierra(a: TrozaParaDiagnostico, b: TrozaParaDiagnostico): number {
  return (
    (a.fechaIngreso ?? "9999").localeCompare(b.fechaIngreso ?? "9999") ||
    (a.codigo ?? "").localeCompare(b.codigo ?? "", "es-PE", { numeric: true }) ||
    a.id.localeCompare(b.id)
  );
}

/** Primero lo apartado en un lote abierto (por lote), después lo suelto. */
export function ordenPropuesta(a: TrozaParaDiagnostico, b: TrozaParaDiagnostico): number {
  const la = a.lote?.code ?? null;
  const lb = b.lote?.code ?? null;
  if (la && !lb) return -1;
  if (!la && lb) return 1;
  if (la && lb && la !== lb) return la.localeCompare(lb, "es-PE", { numeric: true });
  return ordenSierra(a, b);
}

/** La troza como la recibe el reparto de siempre (`repartoDelGrupo`). */
export function comoConsumible(t: TrozaParaDiagnostico): TrozaConsumible {
  return {
    id: t.id,
    woodEntryId: t.fila.id,
    codificacion: t.codigo,
    especieComun: t.especie,
    volumenM3: t.m3,
    /* `fechaIngresoDeTroza` lee primero `fechaRecepcion`: acá ya viene la
       fecha efectiva (troza → guía → asiento), la misma que mira T3. */
    fechaRecepcion: t.fechaIngreso,
  };
}

export function aPropuesta(t: TrozaParaDiagnostico): TrozaPropuesta {
  return {
    trozaId: t.id,
    codigo: t.codigo ?? t.id,
    m3: t.m3,
    gtfNumber: t.gtfNumber ?? "",
    especie: t.especie ?? "",
  };
}

/**
 * El lote abierto que ya tiene la troza, ¿es de OTRA especie o de otro permiso
 * que la corrida? Entonces la troza no se puede llevar sin sacarla de ahí: el
 * vinculador exige que cada lote sea de la especie de la corrida (L-A1), y un
 * lote es de un título habilitante (ADR-393).
 */
export function loteAjeno(
  corrida: Pick<CorridaParaProponer, "permiso">,
  clave: string,
  lote: TrozaParaDiagnostico["lote"],
  ignorarPermiso = false,
): "especie" | "permiso" | null {
  if (!lote) return null;
  const claveLote = claveEspecie(lote.especie);
  if (claveLote && claveLote !== clave) return "especie";
  if (!ignorarPermiso && !mismoPermiso(corrida.permiso, { contratoId: null, codigo: lote.permiso })) return "permiso";
  return null;
}

const NINGUNO: ArregloDeCorrida = { tipo: "ninguno" };

const sinPropuesta = (
  motivo: MotivoSinOrigen,
  detalle: string,
  arreglo: ArregloDeCorrida = NINGUNO,
): PropuestaDeTrozas => ({
  motivo,
  detalle,
  propuesta: [],
  m3Propuesto: 0,
  arreglo,
});

const r1 = (n: number) => Math.round(n * 10) / 10;

/** El número de una corrida en una frase: «N° 61», o «otra corrida» sin número. */
const nroDe = (lineNo: number | null) => (lineNo != null ? `N° ${lineNo}` : "sin número");

/**
 * Las guías de estas trozas, una por GTF, con la llegada que se propone (la de
 * la guía, ADR-434 §1: nunca inventada ni futura) y si con ella alcanza.
 */
function guiasDelArreglo(ts: readonly TrozaParaDiagnostico[], dia: string, hoy: string): GuiaDelArreglo[] {
  const porGtf = new Map<string, TrozaParaDiagnostico[]>();
  for (const t of ts) {
    const k = t.gtfNumber?.trim() || "";
    porGtf.set(k, [...(porGtf.get(k) ?? []), t]);
  }
  return [...porGtf.entries()]
    .map(([gtfNumber, xs]) => {
      const fechas = xs.find((x) => x.llegada)?.llegada ?? null;
      const p = fechas ? propuestaDeLlegada({ guia: fechas.guia, asiento: fechas.asiento }, hoy, false) : null;
      const recibidas = xs.filter((x) => x.guiaRecibida);
      return {
        gtfNumber,
        woodEntryIds: [...new Set(xs.map((x) => x.fila.id))],
        trozas: xs.length,
        m3: suma(xs),
        llegada: recibidas.length > 0 ? (recibidas.map((x) => x.fechaIngreso ?? "").filter(Boolean).sort()[0] ?? null) : null,
        propuesta: p?.dia ?? null,
        fuente: p?.fuente ?? null,
        sirve: p != null && (!dia || p.dia <= dia),
      };
    })
    .sort((a, b) => a.gtfNumber.localeCompare(b.gtfNumber, "es-PE", { numeric: true }));
}

/** ¿`a` y `b` son la misma especie con un apellido de más? («huayruro» / «huayruro negro»). Sólo sugiere, nunca iguala. */
export function especiesParecidas(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = claveEspecie(a);
  const kb = claveEspecie(b);
  if (!ka || !kb || ka === kb) return false;
  return ka.startsWith(`${kb} `) || kb.startsWith(`${ka} `);
}

/**
 * Otra corrida viva tiene las trozas de la especie y el permiso: se dice cuál,
 * con cuánta madera, y cuánto rinden las dos juntas. Es el caso de Cachimbo en
 * Blas: la bandeja decía «No hay trozas en el patio» porque la N° 61 las tomó.
 */
function tomadaPorOtra(
  corrida: CorridaParaProponer,
  especie: string,
  clave: string,
  ctx: ContextoDelPatio | null,
  permisoOk: (p: PermisoRef) => boolean,
): PropuestaDeTrozas | null {
  if (!ctx) return null;
  const suyas = ctx.tomadas.filter(
    (t) => claveEspecie(t.especie) === clave && permisoOk(t.permiso) && t.corrida.id !== (corrida.id ?? ""),
  );
  if (suyas.length === 0) return null;
  const producido = Math.max(0, r4(corrida.m3Producido || 0));
  const porCorrida = new Map<string, TrozaTomada[]>();
  for (const t of suyas) porCorrida.set(t.corrida.id, [...(porCorrida.get(t.corrida.id) ?? []), t]);
  const corridas: TomadaPor[] = [...porCorrida.values()]
    .map((ts) => {
      const c = ts[0]!.corrida;
      const m3 = suma(ts);
      const otra = c.m3Producido != null && c.m3Producido > 0 ? c.m3Producido : null;
      return {
        corridaId: c.id,
        lineNo: c.lineNo,
        fecha: c.fecha,
        m3Producido: otra,
        abierta: otra == null,
        trozas: ts.length,
        m3,
        sumadasPct: m3 > 0 && producido > 0 ? r1(((producido + (otra ?? 0)) / m3) * 100) : null,
      };
    })
    .sort((a, b) => b.m3 - a.m3 || a.fecha.localeCompare(b.fecha));
  const a = corridas[0]!;
  const resto = corridas.length - 1;
  return {
    ...sinPropuesta(
      "tomada_por_otra_corrida",
      `${a.trozas === 1 ? "La troza" : `Las ${a.trozas} trozas`} de ${especie} de este permiso ` +
        `(${fm3(a.m3)}) ya ${a.trozas === 1 ? "entró" : "entraron"} a la corrida ${nroDe(a.lineNo)} del ${ddmm(a.fecha)}` +
        (a.abierta ? ", que todavía no declara lo producido" : "") +
        (resto > 0 ? ` (y otras a ${resto === 1 ? "1 corrida más" : `${resto} corridas más`})` : "") +
        "." +
        (a.sumadasPct != null ? ` Si esta salió de la misma madera, las dos juntas rinden ${formatNumber(a.sumadasPct, 1)} %.` : "") +
        ` Decide si la ${nroDe(a.lineNo)} suelta sus trozas o si esta queda sin origen.`,
      { tipo: "soltar_corrida", corridas },
    ),
  };
}

/** En el patio no está la especie, pero sí una de nombre parecido del mismo permiso. */
function especieParecida(
  especie: string,
  trozas: readonly TrozaParaDiagnostico[],
  permisoOk: (p: PermisoRef) => boolean,
): PropuestaDeTrozas | null {
  const parecidas = trozas.filter((t) => t.fuera == null && permisoOk(t.permiso) && especiesParecidas(t.especie, especie));
  if (parecidas.length === 0) return null;
  const porEspecie = new Map<string, TrozaParaDiagnostico[]>();
  for (const t of parecidas) {
    const k = claveEspecie(t.especie);
    porEspecie.set(k, [...(porEspecie.get(k) ?? []), t]);
  }
  const [ts] = [...porEspecie.values()].sort((a, b) => suma(b) - suma(a));
  const nombre = ts![0]!.especie?.trim() || "";
  const m3 = suma(ts!);
  return sinPropuesta(
    "especie_parecida",
    `En el patio no hay ${especie}, pero hay ${ts!.length === 1 ? "1 troza" : `${ts!.length} trozas`} de «${nombre}» ` +
      `(${fm3(m3)}) de este permiso: si es la misma especie, corrige la especie de la corrida.`,
    { tipo: "corregir_corrida", campo: "especie", actual: especie, propuesta: nombre, trozas: ts!.length, m3 },
  );
}

/**
 * El permiso de la corrida no tiene ninguna guía en el libro, o la que tiene de
 * esta especie no trae su lista de trozas: la madera existe en papel y no en el
 * patio. Sin permiso en la corrida no hay nada que afirmar.
 */
function faltaLaGuia(corrida: CorridaParaProponer, clave: string, ctx: ContextoDelPatio | null): PropuestaDeTrozas | null {
  if (!ctx || !clavePermiso(corrida.permiso)) return null;
  const permiso = corrida.permiso.codigo?.trim() || null;
  /* Sólo las guías que DICEN su permiso: con una punta sin dato `mismoPermiso`
     no afirma nada, y acá hay que afirmar que la guía es de este permiso. */
  const delPermiso = ctx.guias.filter((g) => clavePermiso(g.permiso) && mismoPermiso(corrida.permiso, g.permiso));
  if (delPermiso.length === 0) {
    return sinPropuesta(
      "guia_sin_trozas",
      `El permiso ${permiso ?? "de la corrida"} no tiene ninguna guía en Ingresos: registra la guía de esta madera, ` +
        "o corrige el permiso de la corrida si salió de otro.",
      { tipo: "cargar_guia", permiso, guias: [] },
    );
  }
  const sinTrozas = delPermiso.filter((g) => g.trozas === 0 && (!claveEspecie(g.especie) || claveEspecie(g.especie) === clave));
  if (sinTrozas.length === 0) return null;
  const gtfs = nombrar(sinTrozas.map((g) => g.gtfNumber));
  const pendiente = sinTrozas.some((g) => !g.recibida);
  return sinPropuesta(
    "guia_sin_trozas",
    `${sinTrozas.length === 1 ? "La guía" : "Las guías"} ${gtfs} de este permiso no ${sinTrozas.length === 1 ? "tiene" : "tienen"} su lista de trozas` +
      (pendiente ? " y todavía no se recibió" : "") +
      ": cárgala en Ingresos.",
    {
      tipo: "cargar_guia",
      permiso,
      guias: sinTrozas.map((g) => ({ woodEntryId: g.id, gtfNumber: g.gtfNumber, especie: g.especie, m3: g.m3, recibida: g.recibida })),
    },
  );
}

/**
 * Qué trozas le tocan a una corrida (existente o por declarar), o por qué
 * ninguna. Ver la cabecera para el orden de las etapas y de la propuesta.
 */
export function proponerTrozas(
  corrida: CorridaParaProponer,
  trozas: readonly TrozaParaDiagnostico[],
  meta: number = RENDIMIENTO_META,
  opciones: OpcionesDeDiagnostico = {},
): PropuestaDeTrozas {
  const ctx = opciones.contexto ?? null;
  const ignorarPermiso = opciones.ignorarPermiso === true;
  const permisoOk = (p: PermisoRef) => ignorarPermiso || mismoPermiso(corrida.permiso, p);
  /* Sin contexto no hay «hoy»: la propuesta de llegada no se acota a él. */
  const hoy = ctx?.hoy ?? "9999-12-31";
  const especie = corrida.especie?.trim() || "";
  const clave = claveEspecie(especie);
  if (!clave) {
    return sinPropuesta(
      "sin_trozas_de_la_especie",
      "La corrida no dice su especie: complétala antes de buscarle trozas.",
      { tipo: "corregir_corrida", campo: "especie", actual: "", propuesta: null, trozas: 0, m3: 0 },
    );
  }
  const dia = diaDelLibro(corrida.fecha) ?? "";
  const necesario = Math.max(0, r4(corrida.m3Producido || 0));

  /* «No hay madera» se dice sólo después de mirar adónde fue (otra corrida), si
     hay una especie de nombre parecido y si al permiso le falta la guía. Es lo
     que la bandeja de Blas no miraba: decía «No hay trozas de Cachimbo en el
     patio» con las 12 dentro de la N° 61 (ADR-447). */
  /* La especie parecida sólo cuando NO hay ni una troza de la especie: si hay
     y no alcanzan, «en el patio no hay X» sería falso. */
  const sinMadera = (detalle: string, hayDeLaEspecie: boolean): PropuestaDeTrozas =>
    tomadaPorOtra(corrida, especie, clave, ctx, permisoOk) ??
    (hayDeLaEspecie ? null : especieParecida(especie, trozas, permisoOk)) ??
    faltaLaGuia(corrida, clave, ctx) ??
    sinPropuesta("sin_trozas_de_la_especie", detalle);

  const deEspecie = trozas.filter((t) => claveEspecie(t.especie) === clave);
  if (deEspecie.length === 0) return sinMadera(`No hay trozas de ${especie} en el patio.`, false);
  const libres = deEspecie.filter((t) => t.fuera == null);
  if (libres.length === 0) return sinMadera(`Las trozas de ${especie} que hay ya se usaron o no pueden ir a la sierra.`, true);
  /* El permiso, antes que todo lo demás: la regla nueva rechaza otra guía
     aunque todo lo demás esté bien. El lote abierto que la tiene también tiene
     que ser del permiso (ADR-393) y de la especie (L-A1). */
  const delPermiso = libres.filter((t) => permisoOk(t.permiso) && !loteAjeno(corrida, clave, t.lote, ignorarPermiso));
  if (delPermiso.length === 0) {
    const tomada = tomadaPorOtra(corrida, especie, clave, ctx, permisoOk);
    if (tomada) return tomada;
    const deOtroPermiso = libres.filter((t) => !permisoOk(t.permiso));
    /* Del permiso pero en un lote de otra especie o permiso: el arreglo es
       sacarla de ese lote, no tocar la corrida. */
    if (deOtroPermiso.length === 0) {
      const lotes = nombrar(libres.map((t) => t.lote?.code ?? "").filter(Boolean));
      return sinPropuesta(
        "sin_trozas_de_la_especie",
        `Las ${libres.length} trozas de ${especie} de este permiso están en ${lotes ? `el lote ${lotes}` : "un lote"} ` +
          "de otra especie o de otro permiso: sácalas de ahí en Consumos.",
      );
    }
    const guia = faltaLaGuia(corrida, clave, ctx);
    if (guia) return guia;
    const porPermiso = new Map<string, { codigo: string; contratoId: string | null; trozas: number; m3: number }>();
    for (const t of deOtroPermiso) {
      const k = clavePermiso(t.permiso) ?? "";
      const p = porPermiso.get(k) ?? { codigo: t.permiso.codigo ?? "", contratoId: t.permiso.contratoId, trozas: 0, m3: 0 };
      p.trozas += 1;
      p.m3 = r4(p.m3 + t.m3);
      porPermiso.set(k, p);
    }
    const permisos = nombrar(deOtroPermiso.map((t) => t.permiso.codigo ?? "").filter(Boolean));
    return sinPropuesta(
      "permiso_distinto",
      `Las ${deOtroPermiso.length} trozas de ${especie} que hay son de otro permiso${permisos ? ` (${permisos})` : ""}. ` +
        "Si la corrida salió de esa madera, corrige su permiso.",
      {
        tipo: "corregir_corrida",
        campo: "permiso",
        actual: corrida.permiso.codigo?.trim() || null,
        propuestos: [...porPermiso.values()].filter((p) => p.codigo).sort((a, b) => b.m3 - a.m3),
      },
    );
  }

  /* Corrida SIN permiso: `mismoPermiso` deja pasar a todas, pero el servidor
     acepta un solo permiso por corrida (el lote sería de dos títulos) y
     rechazaba la propuesta entera con 400. Se propone el permiso con más
     madera; las trozas sin permiso declarado acompañan a cualquiera (igual que
     en el servidor). Revisión 27-09. */
  const corridaSinPermiso =
    !corrida.permiso.contratoId && !normalizarCodigoContrato(corrida.permiso.codigo ?? "");
  const candidatas = corridaSinPermiso && !ignorarPermiso ? deUnSoloPermiso(delPermiso) : delPermiso;

  /* Cada troza se detiene en la primera regla que no pasa. */
  const evaluadas: Evaluada[] = candidatas.map((t) => {
    const problemas = new Set<Exclude<Etapa, "ok">>();
    if (!t.guiaRecibida) problemas.add("sin_recibir");
    if (dia && t.fechaIngreso && t.fechaIngreso > dia) problemas.add("tarde");
    const claveFila = claveEspecie(t.fila.especie);
    if (claveFila && claveFila !== clave) problemas.add("otra_fila");
    const etapa: Etapa = problemas.has("sin_recibir")
      ? "sin_recibir"
      : problemas.has("tarde")
        ? "tarde"
        : problemas.has("otra_fila")
          ? "otra_fila"
          : "ok";
    return { t, etapa, problemas };
  });

  /* I2 por fila, simulado en el orden de la propuesta: lo que ya se consumió de
     la fila más lo que se llevaría no pasa de lo que declara. */
  const usado = new Map<string, number>();
  for (const e of evaluadas.filter((x) => x.etapa === "ok").sort((a, b) => ordenPropuesta(a.t, b.t))) {
    const f = e.t.fila;
    const tope = r4(f.m3 - f.consumidoM3);
    const llevaria = r4((usado.get(f.id) ?? 0) + e.t.m3);
    if (llevaria > tope + 1e-9) {
      e.etapa = "sin_saldo";
      e.problemas.add("sin_saldo");
      continue;
    }
    usado.set(f.id, llevaria);
  }

  const en = (etapa: Etapa) => evaluadas.filter((e) => e.etapa === etapa);
  const ok = en("ok").map((e) => e.t).sort(ordenPropuesta);

  // ── lista ──────────────────────────────────────────────────────────────
  const m3Ok = suma(ok);
  if (ok.length > 0 && m3Ok + TOL_M3 >= necesario) {
    const elegidas = elegir(corrida, especie, ok, necesario, meta);
    const m3Propuesto = suma(elegidas);
    const pct = m3Propuesto > 0 && necesario > 0 ? Math.round((necesario / m3Propuesto) * 1000) / 10 : null;
    return {
      motivo: "lista",
      detalle:
        `${elegidas.length === 1 ? "Hay 1 troza" : `Hay ${elegidas.length} trozas`} de ${especie} (${fm3(m3Propuesto)}) ` +
        `de este permiso que ${elegidas.length === 1 ? "llegó" : "llegaron"} a tiempo.` +
        (pct != null && pct > TOPE_RENDIMIENTO_PCT
          ? ` Rinde ${formatNumber(pct, 1)} %: más que el ${TOPE_RENDIMIENTO_PCT} % de la plaza.`
          : ""),
      propuesta: elegidas.map(aPropuesta),
      m3Propuesto,
      arreglo: NINGUNO,
    };
  }

  // ── el arreglo más corto que cubre lo producido ──────────────────────────
  const escalera: Exclude<Etapa, "ok">[] = ["sin_saldo", "otra_fila", "tarde", "sin_recibir"];
  let acumulado = m3Ok;
  let alcanza: Exclude<Etapa, "ok"> | null = null;
  for (const etapa of escalera) {
    acumulado = r4(acumulado + suma(en(etapa).map((e) => e.t)));
    if (en(etapa).length > 0 && acumulado + TOL_M3 >= necesario) {
      alcanza = etapa;
      break;
    }
  }
  if (!alcanza) {
    return sinMadera(
      `Las trozas de ${especie} de este permiso suman ${fm3(acumulado)} y la corrida produjo ${fm3(necesario)}: faltan trozas.`,
      true,
    );
  }
  /* Las que hacen falta: las de esa etapa y todas las de arriba. De ellas sale
     el «además». */
  const hasta = escalera.indexOf(alcanza);
  const necesarias = evaluadas.filter(
    (e) => e.etapa === "ok" || escalera.indexOf(e.etapa as Exclude<Etapa, "ok">) <= hasta,
  );
  const deLaEtapa = en(alcanza).map((e) => e.t);
  /* «Además» cuenta cuántas de las necesarias tienen OTRO problema: con decir
     «están en otra fila» sin número, una sola pieza mal anotada parecía el
     problema de las cinco. */
  const conFilaAjena = necesarias.filter((e) => e.problemas.has("otra_fila")).length;
  const colaFila =
    alcanza !== "otra_fila" && conFilaAjena > 0
      ? conFilaAjena === necesarias.length
        ? " Además, están anotadas en la fila de otra especie de su guía."
        : ` Además, ${conFilaAjena} de ellas ${conFilaAjena === 1 ? "está anotada" : "están anotadas"} en la fila de otra especie de su guía.`
      : "";

  /* Las guías que además hay que acomodar o corregir, para que el arreglo no
     prometa que con un solo paso alcanza. */
  const acomodar = (ts: readonly TrozaParaDiagnostico[]): Extract<ArregloDeCorrida, { tipo: "acomodar_trozas" }>["guias"] => {
    const porGtf = new Map<string, TrozaParaDiagnostico[]>();
    for (const t of ts) porGtf.set(t.gtfNumber ?? "", [...(porGtf.get(t.gtfNumber ?? "") ?? []), t]);
    return [...porGtf.entries()].map(([gtfNumber, xs]) => ({
      gtfNumber,
      woodEntryIds: [...new Set(xs.map((x) => x.fila.id))],
      especieDeLaFila: xs[0]!.fila.especie,
      trozas: xs.length,
    }));
  };

  switch (alcanza) {
    case "sin_recibir": {
      const guias = [...new Set(deLaEtapa.map((t) => t.gtfNumber ?? "").filter(Boolean))];
      const tarde = necesarias.filter((e) => e.etapa === "tarde").map((e) => e.t);
      return sinPropuesta(
        "guia_sin_recibir",
        guias.length > 1
          ? `Las guías ${nombrar(guias)} todavía no se recibieron: recíbelas en Ingresos.`
          : `La guía ${guias[0] ?? "de estas trozas"} todavía no se recibió: recíbela en Ingresos.`,
        {
          tipo: "recibir_guia",
          guias: guiasDelArreglo(deLaEtapa, dia, hoy),
          ...(tarde.length > 0 ? { corregirTambien: guiasDelArreglo(tarde, dia, hoy) } : {}),
        },
      );
    }
    case "tarde": {
      const primera = deLaEtapa.map((t) => t.fechaIngreso ?? "").filter(Boolean).sort()[0];
      /* Con años distintos, el año va: «03/08» solo haría pensar en el mismo. */
      const f = primera && primera.slice(0, 4) !== dia.slice(0, 4) ? ddmmaaaa : ddmm;
      return sinPropuesta(
        "llegada_posterior",
        `Las trozas de ${especie} llegaron después de la corrida del ${f(dia)}` +
          (primera ? ` (la primera, el ${f(primera)})` : "") +
          ": corrige la fecha de llegada en Ingresos." +
          colaFila,
        { tipo: "corregir_llegada", guias: guiasDelArreglo(deLaEtapa, dia, hoy) },
      );
    }
    case "otra_fila": {
      const filas = nombrar(deLaEtapa.map((t) => t.fila.especie ?? "otra especie"));
      return sinPropuesta(
        "fila_de_otra_especie",
        `Las trozas de ${especie} están anotadas en la fila de ${filas} de su guía: acomódalas en Ingresos.`,
        { tipo: "acomodar_trozas", guias: acomodar(deLaEtapa) },
      );
    }
    case "sin_saldo": {
      const guias = nombrar(deLaEtapa.map((t) => t.gtfNumber ?? "").filter(Boolean));
      return sinPropuesta(
        "sin_trozas_de_la_especie",
        `La guía ${guias || "de estas trozas"} ya no tiene volumen libre: revisa sus consumos en Ingresos.`,
      );
    }
  }
}

/**
 * Las trozas pre-marcadas: lo producido ÷ 56 % con el reparto de siempre. Sin
 * producido conocido (0), toda la madera usable: no hay contra qué cortar.
 */
function elegir(
  corrida: CorridaParaProponer,
  especie: string,
  pool: readonly TrozaParaDiagnostico[],
  necesario: number,
  meta: number,
): TrozaParaDiagnostico[] {
  if (!(necesario > 0)) return [...pool];
  const enTanda: CorridaEnTanda = {
    id: corrida.id || "nueva",
    lineNo: corrida.lineNo ?? null,
    especie,
    producidoM3: necesario,
    largoMaxPiezaM: null,
    fecha: diaDelLibro(corrida.fecha) ?? "",
    tieneMateriaPrima: false,
  };
  const { sugeridas } = repartoDelGrupo([enTanda], especie, pool.map(comoConsumible), meta, {
    desde: null,
    hayAptas: pool.length > 0,
  });
  const ids = new Set(sugeridas);
  const elegidas = pool.filter((t) => ids.has(t.id));
  /* Red de seguridad: si el reparto no eligió (una regla suya que acá no
     aplica), se cubre lo producido de a troza entera, en el mismo orden. */
  if (elegidas.length > 0) return elegidas;
  const out: TrozaParaDiagnostico[] = [];
  let acc = 0;
  for (const t of pool) {
    if (acc + TOL_M3 >= necesario / meta) break;
    out.push(t);
    acc = r4(acc + t.m3);
  }
  return out;
}

/** El diagnóstico de UNA corrida sin origen. */
export function diagnosticarCorrida(
  corrida: CorridaParaDiagnostico,
  trozas: readonly TrozaParaDiagnostico[],
  meta: number = RENDIMIENTO_META,
  opciones: OpcionesDeDiagnostico = {},
): DiagnosticoCorrida {
  const base = {
    corridaId: corrida.id,
    lineNo: corrida.lineNo,
    fecha: diaDelLibro(corrida.fecha) ?? "",
    especie: corrida.especie?.trim() || "",
    permiso: corrida.permiso.codigo?.trim() || null,
    m3Producido: r4(corrida.m3Producido || 0),
  };
  /* Sólo el lote de inventario y el volumen escrito se arreglan declarando
     apertura: la ya declarada no pide nada, y la de piezas sin consumo se anula
     y se vuelve a declarar (lo dice el detalle). Sin la clase (una lectura
     vieja), «Declarar apertura» como hasta hoy. */
  const aperturaSeArregla =
    corrida.materiaPrima == null ||
    corrida.materiaPrima === "lote_inventario" ||
    corrida.materiaPrima === "volumen_escrito";
  const r = corrida.materiaPrimaSinTrozas
    ? sinPropuesta(
        "apertura",
        corrida.materiaPrimaSinTrozas,
        aperturaSeArregla ? { tipo: "declarar_apertura" } : NINGUNO,
      )
    : proponerTrozas(corrida, trozas, meta, opciones);
  const mesCerrado = corrida.mesCerrado?.trim() || null;
  /* Con el mes cerrado el servidor rechaza cualquier vínculo (PERIODO_CERRADO):
     se dice en la misma frase, para que «lista» no prometa lo que el POST niega. */
  return {
    ...base,
    ...r,
    detalle: mesCerrado ? `${r.detalle} El mes de ${mesCerrado} está cerrado: reábrelo para vincular.` : r.detalle,
    mesCerrado,
  };
}

/** Cuántas corridas hay por motivo, con los seis en cero de arranque. */
export function contarPorMotivo(corridas: readonly Pick<DiagnosticoCorrida, "motivo">[]): Record<MotivoSinOrigen, number> {
  const out = Object.fromEntries(MOTIVOS_SIN_ORIGEN.map((m) => [m, 0])) as Record<MotivoSinOrigen, number>;
  for (const c of corridas) out[c.motivo] += 1;
  return out;
}

/**
 * El diagnóstico de todas las corridas sin origen: lo que se puede vincular
 * hoy primero, después por fecha (la más vieja arriba, que es como se aserró).
 */
export function diagnosticarSinOrigen(
  corridas: readonly CorridaParaDiagnostico[],
  trozas: readonly TrozaParaDiagnostico[],
  meta: number = RENDIMIENTO_META,
  opciones: OpcionesDeDiagnostico = {},
): DiagnosticoSinOrigen {
  const orden = new Map(MOTIVOS_SIN_ORIGEN.map((m, i) => [m, i]));
  const lista = corridas
    .map((c) => diagnosticarCorrida(c, trozas, meta, opciones))
    .sort(
      (a, b) =>
        (orden.get(a.motivo) ?? 9) - (orden.get(b.motivo) ?? 9) ||
        a.fecha.localeCompare(b.fecha) ||
        (a.lineNo ?? 0) - (b.lineNo ?? 0),
    );
  return { corridas: lista, porMotivo: contarPorMotivo(lista), total: lista.length };
}

/**
 * Por qué una troza pedida NO puede entrar a esta corrida, del lado que ESCRIBE.
 * `null` = puede (le quedan las reglas del vinculador: T1 bajo lock, T3,
 * volumen, I1/I2, mes cerrado).
 *
 * Es la misma escalera del diagnóstico —si divergieran, la pantalla propondría
 * lo que el servidor rechaza— salvo T3 y el saldo de la guía, que los decide
 * `vincularCorridaEnTx` con su mensaje de siempre.
 */
export function problemaAlVincular(
  corrida: Pick<CorridaParaProponer, "especie" | "permiso">,
  t: TrozaParaDiagnostico,
): string | null {
  const clave = claveEspecie(corrida.especie);
  if (claveEspecie(t.especie) !== clave) {
    return `es ${t.especie?.trim() || "sin especie"} y la corrida es de ${corrida.especie?.trim() || "otra especie"}`;
  }
  if (t.fuera) return t.fuera;
  if (!mismoPermiso(corrida.permiso, t.permiso)) {
    return `es del permiso ${t.permiso.codigo ?? "de otra guía"} y la corrida es del ${corrida.permiso.codigo ?? "otro permiso"}`;
  }
  const ajeno = loteAjeno(corrida, clave, t.lote);
  if (ajeno && t.lote) {
    return `está en el lote ${t.lote.code}, que es ${ajeno === "especie" ? `de ${t.lote.especie}` : `del permiso ${t.lote.permiso}`}: sácala de ese lote en Consumos`;
  }
  if (!t.guiaRecibida) {
    return `la guía ${t.gtfNumber ?? "de ingreso"} todavía no se recibió: recíbela en Ingresos`;
  }
  const claveFila = claveEspecie(t.fila.especie);
  if (claveFila && claveFila !== clave) {
    return `está anotada en la fila de ${t.fila.especie} de su guía ${t.gtfNumber ?? ""}: acomódala en Ingresos`.replace(
      /\s+:/,
      ":",
    );
  }
  return null;
}

// ── De la fila leída al diagnóstico (lo comparten la DB class y las mediciones) ──

type Fecha = Date | string | null | undefined;

/** Una troza como sale de la base, con los estados ya resueltos por quien la lee. */
export interface TrozaLeida {
  id: string;
  woodEntryId: string;
  codificacion: string | null;
  codigoPlanta: string | null;
  especieComun: string | null;
  volumenM3: number | null;
  fechaRecepcion: Fecha;
  noRecepcionada: boolean;
  descarte: boolean;
  retrozos: number;
  /** La corrida que la tomó sigue registrada y sin borrar. */
  consumidaViva: boolean;
  despachadaViva: boolean;
  /** El mixto donde está, SÓLO si sigue abierto. */
  mixtoAbierto: { code: string } | null;
  /** Su lote de aserrío, si no está borrado; `corridaViva` = la de `produccionEntryId`. */
  lote: {
    id: string;
    code: string;
    status: string;
    especie: string | null;
    permiso: string | null;
    corridaViva: boolean;
  } | null;
  guia: {
    status: string;
    anulada: boolean;
    fechaRecepcion: Fecha;
    /** Fecha del asiento en el libro: la última fuente de T3. */
    entryDate: Fecha;
    gtfNumber: string | null;
    especie: string | null;
    m3: number;
    /** Lo consumido por corridas vivas (I2). */
    consumidoM3: number;
    contratoId: string | null;
    /** `ForestContrato.codigo` si hay contrato; si no, `originCode`. */
    permisoCodigo: string | null;
    /** `gtfDate`: la fecha que declara el papel. Con ella se propone la llegada (ADR-447). */
    gtfDate?: Fecha;
  };
}

/**
 * La troza leída, en la forma del diagnóstico. Las fechas y la recepción salen
 * de las MISMAS reglas que el escritor: `guiaRecibida` (ADR-325/339) y la cadena
 * troza → guía → asiento de T3 (`ingresoDeLaTroza`).
 */
export function trozaParaDiagnostico(t: TrozaLeida): TrozaParaDiagnostico {
  const m3 = Number(t.volumenM3 ?? 0) || 0;
  const recibida = guiaRecibida({
    estado: t.guia.status,
    fechaRecepcionGuia: t.guia.fechaRecepcion,
    fechaRecepcionTroza: t.fechaRecepcion,
  });
  const fechaIngreso =
    ingresoDeLaTroza({
      id: t.id,
      codigo: null,
      gtf: t.guia.gtfNumber,
      fechaRecepcionTroza: t.fechaRecepcion ?? null,
      fechaRecepcionGuia: t.guia.fechaRecepcion ?? null,
      fechaAsientoGuia: t.guia.entryDate ?? null,
    })?.dia ?? null;
  const fuera = motivoFueraDeLaSierra({
    consumidaViva: t.consumidaViva,
    despachadaViva: t.despachadaViva,
    guiaAnulada: t.guia.anulada,
    noRecepcionada: t.noRecepcionada,
    descarte: t.descarte,
    retrozos: t.retrozos,
    m3,
    mixto: t.mixtoAbierto,
    lote: t.lote ? { code: t.lote.code, status: t.lote.status, corridaViva: t.lote.corridaViva } : null,
  });
  return {
    id: t.id,
    codigo: t.codigoPlanta?.trim() || t.codificacion?.trim() || null,
    especie: t.especieComun,
    m3,
    gtfNumber: t.guia.gtfNumber,
    fila: { id: t.woodEntryId, especie: t.guia.especie, m3: t.guia.m3, consumidoM3: t.guia.consumidoM3 },
    permiso: { contratoId: t.guia.contratoId, codigo: t.guia.permisoCodigo },
    guiaRecibida: recibida,
    fechaIngreso,
    fuera,
    lote:
      t.lote && t.lote.status === "abierto"
        ? { id: t.lote.id, code: t.lote.code, especie: t.lote.especie, permiso: t.lote.permiso }
        : null,
    llegada: {
      guia: diaDelLibro(t.guia.gtfDate ?? null),
      asiento: diaDelLibro(t.guia.entryDate ?? null),
      sigueALaGuia: sigueALaGuia({ fechaPropia: t.fechaRecepcion, fechaDeSuAsiento: t.guia.fechaRecepcion }),
    },
  };
}

/** Una corrida sin origen como sale de la base. */
export interface CorridaLeida {
  id: string;
  lineNo: number | null;
  entryDate: Fecha;
  speciesCommon: string | null;
  quantity: number | null;
  unit: string | null;
  volumeInputM3: number | null;
  contratoId: string | null;
  /** `ForestContrato.codigo` si hay contrato; si no, `originCode`. */
  permisoCodigo: string | null;
  aperturaDeclarada: boolean;
  /** Lotes vivos que apuntan a ella (`produccionEntryId`): el de inventario. */
  lotes: number;
  /** Piezas marcadas con su id (`consumidaEnId`). */
  piezas: number;
}

/** m³ de producto de una corrida: en pt se pasa a m³ (`PT_POR_M3`); en otra unidad no se sabe (0). */
export function m3DeProducto(quantity: number | null, unit: string | null): number {
  const q = Number(quantity ?? 0);
  if (!(q > 0)) return 0;
  const u = (unit ?? "m3").trim().toLowerCase();
  if (u === "m3" || u === "m³") return r4(q);
  if (u === "pt") return r4(q / PT_POR_M3);
  return 0;
}

/**
 * La corrida leída, en la forma del diagnóstico. «Ya tiene materia prima sin
 * trozas» son las mismas cuatro señales con que `vincularCorridaEnTx` la
 * rechaza (volumen de entrada, lote, piezas) más la apertura declarada.
 */
export function corridaParaDiagnostico(c: CorridaLeida): CorridaParaDiagnostico {
  const entrada = Number(c.volumeInputM3 ?? 0);
  const materiaPrimaSinTrozas = c.aperturaDeclarada
    ? "Ya está declarada como madera de antes del libro (apertura): no necesita trozas."
    : c.lotes > 0
      ? "Salió de un lote de inventario (madera de antes del libro): decláralo como apertura."
      : entrada > 0
        ? `Ya declara ${fm3(entrada)} de madera sin trozas: decláralo como apertura.`
        : c.piezas > 0
          ? "Tiene trozas marcadas sin su consumo por guía: anúlala y vuelve a declararla."
          : null;
  const materiaPrima: CorridaParaDiagnostico["materiaPrima"] = c.aperturaDeclarada
    ? "apertura_declarada"
    : c.lotes > 0
      ? "lote_inventario"
      : entrada > 0
        ? "volumen_escrito"
        : c.piezas > 0
          ? "piezas_sin_consumo"
          : null;
  return {
    id: c.id,
    lineNo: c.lineNo,
    especie: c.speciesCommon,
    permiso: { contratoId: c.contratoId, codigo: c.permisoCodigo },
    fecha: diaDelLibro(c.entryDate ?? null) ?? "",
    m3Producido: m3DeProducto(c.quantity, c.unit),
    materiaPrimaSinTrozas,
    materiaPrima,
  };
}
