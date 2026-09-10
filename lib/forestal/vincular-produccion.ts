/**
 * Vincular una producción YA declarada con la materia prima que la hizo.
 *
 * El caso (Brandon, 2026-09-09): la sierra cortó el sábado, el parte se anota
 * el lunes con «Producir sin lote» y el lote con sus trozas se arma después.
 * Queda una corrida que declara producto y **no dice de qué madera salió** — un
 * hueco de trazabilidad que hay que poder cerrar sin anular el asiento.
 *
 * ## Por qué esto NO es maquillar el rendimiento (ADR-364 sigue en pie)
 *
 * Sumarle materia prima a una corrida que YA tenía origen le baja el
 * rendimiento: eso está prohibido y se sigue prohibiendo. Lo que se permite acá
 * es lo contrario: una corrida **sin ninguna materia prima** no tiene
 * rendimiento que cambiar — no hay número que empeorar, hay un origen que
 * falta. Declararlo lo completa; no declararlo deja el libro afirmando que salió
 * madera de la nada.
 *
 * ## Las cinco reglas (acordadas con Brandon)
 *
 * 1. **Especie** — el lote es de UNA especie y la corrida declara la suya. Si no
 *    son la misma, no se vincula: sería decir que de tornillo salió cachimbo.
 * 2. **Volumen** — de las trozas no puede salir más madera de la que entró:
 *    `producido ≤ Σ trozas`. Y si el rendimiento pasa del tope de la plaza, se
 *    avisa (no se bloquea: un tope alto puede ser real y hay que poder
 *    explicarlo, pero nadie lo firma sin verlo).
 * 3. **Largo** — ninguna pieza puede ser más larga que la troza más larga: de
 *    una troza de 3 m no sale una tabla de 6 m. Todo se compara en METROS, que
 *    es donde se mide la troza; las piezas del cubicador vienen en pies y se
 *    convierten antes (el bug que Brandon anticipó: «3 metros» contra «20 pies»
 *    son la misma unidad escrita distinto).
 * 4. **Fechas** — la madera no se puede aserrar antes de entrar al patio, y la
 *    producción no puede ser anterior a su consumo.
 * 5. **Disponibilidad** — sólo trozas vivas: ni consumidas, ni despachadas, ni
 *    descartadas, ni sin recepcionar, ni madres ya retrozadas.
 *
 * PURO: sin DB y sin React. El servidor sigue teniendo la última palabra
 * (I1/I2, locks, cierre de período); esto es lo que se le muestra a quien firma
 * ANTES de apretar el botón.
 */

/** Media décima de metro: la tolerancia del corte, no la del float. */
const TOL_LARGO_M = 0.05;
/** Diez litros — la tolerancia del patio para comparar volúmenes. */
const TOL_M3 = 0.01;
/**
 * Techo de rendimiento de la plaza (ADR-358): por encima se avisa, no se
 * bloquea. Un 60 % puede ser real en madera muy limpia; lo que no puede es
 * pasar inadvertido.
 */
export const TOPE_RENDIMIENTO_PCT = 56;

export interface CorridaAVincular {
  lineNo: number | null;
  /** Especie declarada en el asiento. */
  especie: string | null;
  /** m³ de producto que la corrida declara. */
  producidoM3: number;
  /** El largo de la pieza más larga declarada, EN METROS (`null` si no se sabe). */
  largoMaxPiezaM: number | null;
  /** Fecha del asiento de producción (ISO date-only). */
  fecha: string;
  /**
   * `true` si la corrida YA tiene materia prima atribuida (consumos, volumen de
   * entrada o lote). Con esto en `true` la vinculación está prohibida: le
   * cambiaría el rendimiento a un asiento ya declarado (ADR-364).
   */
  tieneMateriaPrima: boolean;
}

export interface TrozaAVincular {
  id: string;
  /** Código legible para nombrarla en el aviso. */
  codigo?: string | null;
  volumenM3: number;
  /** Largo de la troza EN METROS (`null` si no se midió). */
  largoM: number | null;
  /** Fecha de ingreso al patio (ISO date-only), si se sabe. */
  fechaIngreso?: string | null;
  /** `null` = disponible; con texto, por qué NO se puede usar. */
  noDisponible?: string | null;
}

export interface LoteAVincular {
  code: string;
  especie: string | null;
  /** `abierto` es el único estado que admite vincularse. */
  status: string;
}

export type SeveridadVinculo = "error" | "aviso";

export interface HallazgoVinculo {
  regla: "especie" | "volumen" | "largo" | "fecha" | "disponibilidad" | "ya-tiene-origen" | "lote";
  severidad: SeveridadVinculo;
  mensaje: string;
}

export interface RevisionVinculo {
  hallazgos: HallazgoVinculo[];
  /** `false` si hay algún error: la vinculación no se ofrece. */
  puedeVincular: boolean;
  /** m³ de troza que se van a atribuir. */
  trozaM3: number;
  /** `producido / troza × 100`, o `null` si no hay troza. */
  rendimientoPct: number | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** Sin tildes ni mayúsculas: «TORNILLO» y «Tornillo» son la misma madera. */
const norma = (v: string | null | undefined): string =>
  (v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const fmt = (n: number) => n.toLocaleString("es-PE", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

/**
 * Revisa una vinculación ANTES de escribirla y devuelve lo que hay que mirar.
 *
 * Los `error` bloquean; los `aviso` se leen y se firma igual. La diferencia no
 * es de gravedad, es de naturaleza: un error dice «esto no puede haber pasado»,
 * un aviso dice «esto puede haber pasado y hay que poder explicarlo».
 */
export function revisarVinculacion(
  corrida: CorridaAVincular,
  lote: LoteAVincular,
  trozas: readonly TrozaAVincular[],
): RevisionVinculo {
  const hallazgos: HallazgoVinculo[] = [];

  /* 0 · La puerta del ADR-364: si ya tiene origen, esto no es completar, es
     cambiarle el rendimiento a un asiento declarado. */
  if (corrida.tieneMateriaPrima) {
    hallazgos.push({
      regla: "ya-tiene-origen",
      severidad: "error",
      mensaje:
        `La corrida N° ${corrida.lineNo ?? "—"} ya tiene materia prima atribuida: sumarle más le cambiaría el rendimiento. ` +
        "Registrá la madera nueva en una corrida aparte.",
    });
  }

  if (lote.status !== "abierto") {
    hallazgos.push({
      regla: "lote",
      severidad: "error",
      mensaje: `El lote ${lote.code} está ${lote.status}: sólo un lote abierto se puede vincular.`,
    });
  }
  if (trozas.length === 0) {
    hallazgos.push({
      regla: "lote",
      severidad: "error",
      mensaje: "No elegiste ninguna troza: sin madera no hay origen que declarar.",
    });
  }

  /* 1 · Especie. */
  const espCorrida = norma(corrida.especie);
  const espLote = norma(lote.especie);
  if (espCorrida && espLote && espCorrida !== espLote) {
    hallazgos.push({
      regla: "especie",
      severidad: "error",
      mensaje: `La corrida declara ${corrida.especie} y el lote ${lote.code} es de ${lote.especie}: de una madera no sale la otra.`,
    });
  } else if (!espCorrida || !espLote) {
    hallazgos.push({
      regla: "especie",
      severidad: "aviso",
      mensaje: "Falta la especie en una de las dos puntas: no se puede comprobar que sean la misma madera.",
    });
  }

  /* 5 · Disponibilidad — antes del volumen: una troza que no se puede usar
     tampoco cuenta para el cálculo. */
  const usables = trozas.filter((t) => !t.noDisponible);
  for (const t of trozas.filter((x) => x.noDisponible)) {
    hallazgos.push({
      regla: "disponibilidad",
      severidad: "error",
      mensaje: `La troza ${t.codigo ?? t.id} no se puede usar: ${t.noDisponible}.`,
    });
  }

  /* 2 · Volumen: de la troza no sale más de lo que entró. */
  const trozaM3 = r4(usables.reduce((a, t) => a + (t.volumenM3 || 0), 0));
  const rendimientoPct = trozaM3 > 0 ? r2((corrida.producidoM3 / trozaM3) * 100) : null;
  if (trozaM3 > 0 && corrida.producidoM3 > trozaM3 + TOL_M3) {
    hallazgos.push({
      regla: "volumen",
      severidad: "error",
      mensaje:
        `La corrida declara ${fmt(corrida.producidoM3)} m³ de producto y las trozas elegidas suman ${fmt(trozaM3)} m³: ` +
        "de la sierra nunca sale más madera de la que entró. Elegí más trozas.",
    });
  } else if (rendimientoPct != null && rendimientoPct > TOPE_RENDIMIENTO_PCT) {
    hallazgos.push({
      regla: "volumen",
      severidad: "aviso",
      mensaje:
        `El rendimiento queda en ${rendimientoPct} %, por encima del ${TOPE_RENDIMIENTO_PCT} % de la plaza. ` +
        "Puede ser real, pero es lo primero que va a preguntar una fiscalización.",
    });
  }

  /* 3 · Largo: todo en METROS. */
  const largos = usables.map((t) => t.largoM).filter((l): l is number => l != null && l > 0);
  if (corrida.largoMaxPiezaM != null && largos.length > 0) {
    const trozaMasLarga = Math.max(...largos);
    if (corrida.largoMaxPiezaM > trozaMasLarga + TOL_LARGO_M) {
      hallazgos.push({
        regla: "largo",
        severidad: "error",
        mensaje:
          `La pieza más larga declarada mide ${corrida.largoMaxPiezaM.toFixed(2)} m y la troza más larga del lote ${trozaMasLarga.toFixed(2)} m: ` +
          "de una troza corta no sale una tabla larga.",
      });
    }
  } else if (corrida.largoMaxPiezaM != null && largos.length === 0) {
    hallazgos.push({
      regla: "largo",
      severidad: "aviso",
      mensaje: "Las trozas elegidas no declaran largo: no se puede comprobar que la pieza más larga salga de alguna.",
    });
  }

  /* 4 · Fechas: la madera no se asierra antes de entrar al patio. */
  const fechaProd = (corrida.fecha ?? "").slice(0, 10);
  for (const t of usables) {
    const ingreso = (t.fechaIngreso ?? "").slice(0, 10);
    if (ingreso && fechaProd && ingreso > fechaProd) {
      hallazgos.push({
        regla: "fecha",
        severidad: "error",
        mensaje: `La troza ${t.codigo ?? t.id} entró al patio el ${ingreso}, después de la producción del ${fechaProd}: no pudo estar en esa sierra.`,
      });
    }
  }

  return {
    hallazgos,
    puedeVincular: !hallazgos.some((h) => h.severidad === "error"),
    trozaM3,
    rendimientoPct,
  };
}

/** El largo de la pieza más larga, en METROS, desde paquetes en metros o pies. */
export function largoMaxEnMetros(
  paquetes: readonly { largoM?: number | null; largoPies?: number | null }[],
): number | null {
  const largos = paquetes
    .map((p) => (p.largoM != null ? p.largoM : p.largoPies != null ? p.largoPies * 0.3048 : null))
    .filter((l): l is number => l != null && l > 0);
  return largos.length > 0 ? Math.max(...largos) : null;
}
