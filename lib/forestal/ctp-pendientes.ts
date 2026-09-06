/**
 * ctp-pendientes — qué le falta hacer al operario en el Libro, hoy.
 *
 * El Libro tiene doce pestañas y la respuesta a "¿qué tengo pendiente?" estaba
 * repartida entre todas: los ingresos sin validar en una, las guías del monte
 * sin ingresar en otra, los despachos sin GTF o sin anexo en otras dos. Esto lo
 * junta y lo ordena por lo que traba primero.
 *
 * PURO: recibe los datos ya cargados (no hace fetch) y decide. Así se testea la
 * priorización sin levantar el módulo entero.
 */

export type UrgenciaPendiente = "bloquea" | "atrasado" | "pendiente";

export interface Pendiente {
  clave: string;
  urgencia: UrgenciaPendiente;
  /** Cuántos casos hay. Un pendiente con 0 no se muestra. */ cantidad: number;
  /** Qué hay que hacer, en imperativo. */ titulo: string;
  /** Por qué importa (una línea). */ detalle: string;
  /** Pestaña del Libro donde se resuelve. */ vista: string;
  /**
   * Filtro que deja puesta la pestaña de destino, para aterrizar en los casos y
   * no en la lista entera. Hoy lo entiende Ingresos: `"pendiente"` (estado) y
   * `"fuera-de-plazo"`.
   */
  filtro?: "pendiente" | "fuera-de-plazo";
}

export interface DatosPendientes {
  /** Ingresos de materia prima en estado "pendiente". */ ingresosPendientes: number;
  /** Ingresos vigentes registrados fuera del plazo legal. */ fueraDePlazo: number;
  /** GTF del monte emitidas que todavía no entraron al CTP. */ guiasSinIngresar: number;
  /** Despachos vivos sin número de GTF de salida. */ despachosSinGtf: number;
  /** Despachos vivos sin ANEXO N° 04 emitido. */ despachosSinAnexo: number;
  /** Corridas de producción sin materia prima atribuida. */ corridasSinOrigen: number;
  /** Especies con saldo negativo (se despachó más de lo que entró). */ saldosNegativos: number;
  /**
   * Piezas que llevan `TROZAS_VARADAS_DIAS` o más paradas en el patio.
   *
   * No traba ningún cierre —el libro cierra igual— pero es plata perdiéndose
   * sola: la troza tropical se mancha y se raja. Es el único pendiente que no
   * es un papel sino madera.
   */
  trozasVaradas?: number;
  /**
   * Ingresos vigentes sin costo cargado.
   *
   * El único pendiente que no le importa a SERFOR: el libro cierra perfecto sin
   * un solo precio. Le importa al dueño — sin costo no hay COGS, y sin COGS
   * ningún despacho puede decir si dejó plata. Por eso "pendiente" y nunca
   * "bloquea".
   */
  ingresosSinCosto?: number;
  /** m³ de esos ingresos. El conteo solo subestima lo que está en juego. */
  m3SinCosto?: number;

}

/** A partir de acá una troza parada empieza a costar. Mismo corte que el patio. */
export const TROZAS_VARADAS_DIAS = 60;

/** Día calendario de una fecha *date-only* (guardada a medianoche UTC). */
export function diaDeFechaOnly(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  const d = iso instanceof Date ? iso : new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

/** Día calendario de un límite de período (construido en hora LOCAL). */
export function diaDeLimiteLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * ¿Ese día cae dentro del período? Se compara por día calendario y no por
 * instante: `to` es "31 a las 23:59 hora local" y la fecha del documento es
 * medianoche UTC — restarlos como instantes corre el mes de un día (Lima UTC-5).
 * Sin límites (todo el histórico) entra todo.
 */
export function diaEnPeriodo(dia: string, desde: string, hasta: string): boolean {
  if (!dia) return false;
  if (desde && dia < desde) return false;
  if (hasta && dia > hasta) return false;
  return true;
}

const ORDEN: Record<UrgenciaPendiente, number> = { bloquea: 0, atrasado: 1, pendiente: 2 };

/**
 * Arma la lista de pendientes, sólo con los que tienen casos, ordenada por lo
 * que traba primero: un saldo negativo invalida el libro entero; un ingreso sin
 * validar es rutina.
 */
export function pendientesDelLibro(d: DatosPendientes): Pendiente[] {
  const todos: Pendiente[] = [
    {
      clave: "saldos-negativos",
      urgencia: "bloquea",
      cantidad: d.saldosNegativos,
      titulo: "Saldos en negativo",
      detalle: "Se despachó más de lo que entró: el libro no cierra así.",
      vista: "saldos",
    },
    {
      clave: "sin-origen",
      urgencia: "bloquea",
      cantidad: d.corridasSinOrigen,
      titulo: "Corridas sin materia prima atribuida",
      detalle: "Sin origen no hay cadena de custodia ni certificado.",
      vista: "produccion",
    },
    {
      clave: "fuera-de-plazo",
      urgencia: "atrasado",
      cantidad: d.fueraDePlazo,
      titulo: "Ingresos registrados fuera de plazo",
      detalle: "Es lo primero que mira una fiscalización.",
      vista: "cumplimiento",
    },
    {
      clave: "guias-sin-ingresar",
      urgencia: "atrasado",
      cantidad: d.guiasSinIngresar,
      titulo: "Guías del monte sin ingresar al CTP",
      detalle: "La madera salió del bosque y todavía no figura en planta.",
      vista: "ingresos",
    },
    {
      clave: "despachos-sin-gtf",
      urgencia: "atrasado",
      cantidad: d.despachosSinGtf,
      titulo: "Despachos sin GTF de salida",
      detalle: "El producto salió sin guía que lo ampare.",
      vista: "despacho",
    },
    {
      clave: "ingresos-pendientes",
      urgencia: "pendiente",
      cantidad: d.ingresosPendientes,
      titulo: "Ingresos por validar",
      detalle: "Hasta validarlos no cuentan como materia prima disponible.",
      vista: "ingresos",
      filtro: "pendiente",
    },
    {
      clave: "despachos-sin-anexo",
      urgencia: "pendiente",
      cantidad: d.despachosSinAnexo,
      titulo: "Despachos sin ANEXO N° 04",
      detalle: "La guía viaja con su lista de productos transformados.",
      vista: "despacho",
    },
    /* El único que no es un papel: son troncos parados. No traba el cierre —por
       eso "pendiente" y no "atrasado"— pero se pudre solo mientras espera. */
    {
      clave: "trozas-varadas",
      urgencia: "pendiente",
      cantidad: d.trozasVaradas ?? 0,
      titulo: `Trozas paradas hace ${TROZAS_VARADAS_DIAS} días o más`,
      detalle: "La madera en troza se mancha y se raja: conviene aserrarlas primero.",
      vista: "trozas",
    },
    /* Tampoco es un papel: es la mitad de la cuenta. El libro cierra igual sin
       costos —a SERFOR no le interesan— pero el margen de todo lo que salga de
       esa madera queda en "no sé". */
    {
      clave: "ingresos-sin-costo",
      urgencia: "pendiente",
      cantidad: d.ingresosSinCosto ?? 0,
      /* El título lleva los m³, no sólo el conteo: «3 ingresos» suena a tres
         papeles y se posterga; «3 · 32.93 m³ sin valorizar» es todo el patio. */
      titulo: (d.m3SinCosto ?? 0) > 0
        ? `Ingresos sin costo · ${(d.m3SinCosto ?? 0).toFixed(2)} m³ sin valorizar`
        : "Ingresos sin costo cargado",
      /* El detalle NO estima cuánto producto queda sin margen: haría falta
         saber qué parte de cada corrida salió de un ingreso sin costo, y eso no
         se sabe sin recorrer la atribución. Un derivado presentado como dato es
         justo lo que este libro no puede permitirse. */
      detalle: "Sin lo que se pagó no hay margen posible en lo que salga de esa madera.",
      vista: "rentabilidad",
    },
  ];

  return todos
    .filter((p) => p.cantidad > 0)
    .sort((a, b) => ORDEN[a.urgencia] - ORDEN[b.urgencia] || b.cantidad - a.cantidad);
}

/** Una línea para el encabezado: nada pendiente también es una respuesta. */
export function resumenPendientes(lista: Pendiente[]): string {
  if (lista.length === 0) return "Sin pendientes: el libro está al día.";
  const bloquean = lista.filter((p) => p.urgencia === "bloquea").reduce((a, p) => a + p.cantidad, 0);
  const total = lista.reduce((a, p) => a + p.cantidad, 0);
  return bloquean > 0
    ? `${total} pendientes · ${bloquean} traban el cierre`
    : `${total} pendientes, ninguno traba el cierre`;
}
