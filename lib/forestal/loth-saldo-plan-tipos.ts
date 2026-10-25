/**
 * Contrato de `/api/admin/forestal/loth/saldo-plan` (24-10, «Saldo que no se
 * pasa»): lo que el servidor devuelve y lo que la pantalla manda. Sólo tipos —se
 * importa desde el cliente sin arrastrar al importador ni a Prisma—.
 */
import type { AtarSinPlanConteo } from "./loth-atar-sin-plan";
import type { MinimoDelPlanNuevo, PlanDesdeLaGuia, PlanSugerido } from "./loth-atar-lo-suelto";
import type { SaldoDeEspecie, SaldoDelPlan, UsoDeLaGuia } from "./loth-saldo-cascada";

/** Lo que una guía se llevó de una especie, con su guía para abrirla (`null` = no se encontró viva). */
export interface UsoConGuia extends UsoDeLaGuia {
  gtfId: string | null;
}

export interface SaldoDeEspecieConGuias extends Omit<SaldoDeEspecie, "guias"> {
  guias: UsoConGuia[];
}

export interface SaldoConGuias extends Omit<SaldoDelPlan, "especies"> {
  especies: SaldoDeEspecieConGuias[];
}

export interface SaldoPlanRespuesta {
  plan: { id: string; nombre: string; plantacion: boolean };
  /** Las especies del plan tal como están (para el freno del despacho: `claveT6`). */
  delPlan: { speciesCommon: string; speciesScientific: string | null }[];
  saldo: SaldoConGuias;
}

/**
 * `GET ?sinPlan=1` (25-10): los planes vigentes CON especies cargadas, contra
 * los que T6 mide lo que sale sin plan (cuenta en el saldo de cada uno,
 * ADR-459). Vacío = no hay contra qué medir. El freno es `frenoSinPlan`.
 */
export interface SaldosDeLoSinPlan {
  planes: SaldoPlanRespuesta[];
}

/** Una guía sin plan del libro, con a qué plan iría y el plan que se crearía con ella. */
export interface GuiaSuelta {
  gtfId: string;
  gtfNumber: string;
  /** AAAA-MM-DD (date-only). */
  gtfDate: string | null;
  piezas: number;
  m3: number;
  /** El título que cita; `null` = no cita ninguno (no se puede crear el plan desde ella). */
  titulo: string | null;
  titular: string | null;
  sugerido: PlanSugerido | null;
  propuesta: PlanDesdeLaGuia;
  /**
   * Por especie de la guía, lo que el plan nuevo ya llevaría usado al atarla
   * (esta guía + lo sin plan de otras): lo autorizado no puede ser menos. Vacío
   * si la guía no cita título (no se crea el plan desde ella).
   */
  minimos: MinimoDelPlanNuevo[];
}

export interface SueltosDelLibro {
  /** Las más nuevas primero (hasta 60). */
  guias: GuiaSuelta[];
  /** Trozas del libro sin plan: cuentan en el saldo de todos (ADR-459). */
  trozas: { total: number; m3: number };
  /** Todas las líneas sin plan (la cuenta de «Atar sin plan»). */
  lineas: AtarSinPlanConteo;
  planes: { id: string; nombre: string; titular: string; estado: string }[];
}

/** Lo que manda la ventana «Crear el plan desde la guía». Lo autorizado lo escribe la persona. */
export interface AltaDesdeLaGuia {
  titularName: string;
  /** De todas las especies de la guía o de ninguna. */
  especies: { especie: string; volumenAutorizadoM3: number }[];
}

export interface PlanCreadoDesdeLaGuia {
  planId: string;
  nombre: string;
  gtfId: string;
  /** Especies registradas con su volumen. */
  especies: number;
  /** Líneas del libro que quedaron atadas al plan nuevo. */
  despachos: number;
  trozados: number;
}
