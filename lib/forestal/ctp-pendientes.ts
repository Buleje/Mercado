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
}

export interface DatosPendientes {
  /** Ingresos de materia prima en estado "pendiente". */ ingresosPendientes: number;
  /** Ingresos vigentes registrados fuera del plazo legal. */ fueraDePlazo: number;
  /** GTF del monte emitidas que todavía no entraron al CTP. */ guiasSinIngresar: number;
  /** Despachos vivos sin número de GTF de salida. */ despachosSinGtf: number;
  /** Despachos vivos sin ANEXO N° 04 emitido. */ despachosSinAnexo: number;
  /** Corridas de producción sin materia prima atribuida. */ corridasSinOrigen: number;
  /** Especies con saldo negativo (se despachó más de lo que entró). */ saldosNegativos: number;
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
    },
    {
      clave: "despachos-sin-anexo",
      urgencia: "pendiente",
      cantidad: d.despachosSinAnexo,
      titulo: "Despachos sin ANEXO N° 04",
      detalle: "La guía viaja con su lista de productos transformados.",
      vista: "despacho",
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
