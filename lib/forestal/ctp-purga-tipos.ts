/**
 * Contrato del vaciado del Libro de Operaciones (servidor ↔ modal).
 *
 * Sin zod ni prisma a propósito: lo importa el modal del navegador, y lo único
 * que tiene que viajar es la forma de los datos. La lógica de qué se borra
 * vive en `ctp-purga-plan.ts`; la escritura, en `lib/db/forest-ctp-purga.db.ts`.
 */

/** Los alcances, en el orden en que se muestran y se auditan. */
export const ALCANCES_VACIADO = [
  "trozas_disponibles",
  "madera_disponible",
  "consumo",
  "lotes",
  "todo",
] as const;

export type ScopeVaciado = (typeof ALCANCES_VACIADO)[number];

/** Todo menos «todo»: los que se combinan entre sí (la unión). */
export type AlcanceParcial = Exclude<ScopeVaciado, "todo">;

/** Lo que se borraría (o se borró), ya sumado SIN contar dos veces una fila. */
export type ConteoDelLibro = {
  ingresos: number;
  trozas: number;
  /** Corridas de producción. */
  produccion: number;
  despachos: number;
  /** Consumos atribuidos (m³ de una guía → una corrida) que caen con sus corridas. */
  consumos: number;
  origenes: number;
  /** Lotes de aserrío + mixtos + comerciales. */
  lotes: number;
  /** Trozas que NO se borran: vuelven al patio porque su lote (o su corrida) se borra. */
  trozasAlPatio: number;
  /** Registros que el operador reconoce como «lo que cargué». */
  total: number;
  /** Corridas que un alcance de producción no pudo tocar (tienen algo encima).
   *  NO incluye las de un mes cerrado: ésas van en `deMesCerrado`. */
  saltadas?: number;
  /** Lo que se salvó por estar fechado en un mes cerrado. Sólo aparece si
   *  salvó algo. Informativo: no entra en `CLAVES_CONTEO_ESPERADO` (lo que
   *  cambie ahí ya mueve las cifras de lo que se borra). */
  deMesCerrado?: SalvadoPorMesCerrado;
};

/**
 * Un mes cerrado (ADR-139) protege SÓLO las líneas fechadas en ese mes, como
 * en el resto del libro (Brandon 2026-10-02, «Solo protege su mes»). En un
 * vaciado parcial esas filas se quedan; esto dice cuántas, por tipo, y qué
 * meses pesaron («mayo de 2026»), para que la pantalla lo diga en palabras.
 */
export type SalvadoPorMesCerrado = {
  /** Trozas del patio cuyo ingreso (GTF) es de un mes cerrado. */
  trozas: number;
  /** Corridas que habrían caído y son de un mes cerrado. */
  corridas: number;
  /** Lotes abiertos (o armados) en un mes cerrado. */
  lotes: number;
  /** Los meses, con su nombre: «mayo de 2026». */
  meses: string[];
};

/** Qué aporta cada alcance elegido. Con varios, sus números pueden solaparse;
 *  el total sin repetir es `ConteoDelLibro`. */
export type ConteoPorAlcance = {
  trozas_disponibles?: { trozas: number };
  madera_disponible?: { corridas: number; consumos: number };
  consumo?: {
    corridas: number;
    consumos: number;
    /** De ésas, las que sólo se pueden borrar porque su lote también se borra. */
    deLotes: number;
  };
  lotes?: {
    aserrio: number;
    mixtos: number;
    comerciales: number;
    trozasAlPatio: number;
    bloqueados: number;
  };
  todo?: {
    ingresos: number;
    trozas: number;
    produccion: number;
    despachos: number;
    consumos: number;
    origenes: number;
    lotes: number;
  };
};

/** Un lote que NO se borra, con el motivo en palabras de quien lo opera. */
export type LoteBloqueado = {
  id: string;
  codigo: string;
  tipo: "aserrio" | "mixto" | "comercial";
  /** Empieza en minúscula: la pantalla antepone «No se puede: ». */
  motivo: string;
};

export type ResumenVaciado = {
  alcances: ScopeVaciado[];
  conteo: ConteoDelLibro;
  porAlcance: ConteoPorAlcance;
  lotesBloqueados: LoteBloqueado[];
};

/**
 * Las cifras de la vista previa que el modal devuelve al confirmar y que el
 * servidor vuelve a contar DENTRO de la transacción del borrado. Todas, no sólo
 * el total: una troza menos y un lote más dan el mismo total y son otro libro.
 * (`saltadas` no entra: no es algo que se borre.)
 */
export const CLAVES_CONTEO_ESPERADO = [
  "ingresos",
  "trozas",
  "produccion",
  "despachos",
  "consumos",
  "origenes",
  "lotes",
  "trozasAlPatio",
  "total",
] as const satisfies readonly (keyof ConteoDelLibro)[];

export type ConteoEsperado = Pick<ConteoDelLibro, (typeof CLAVES_CONTEO_ESPERADO)[number]>;
