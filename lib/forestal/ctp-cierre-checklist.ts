/**
 * ctp-cierre-checklist — ¿conviene cerrar el mes?
 *
 * Cerrar congela costos y bloquea el período: lo que quedó mal adentro se
 * arregla sólo reabriendo, y una reapertura queda en el historial para siempre.
 * Por eso el asistente revisa ANTES y distingue tres cosas: lo que impide
 * cerrar, lo que conviene resolver primero, y lo que ya no se arregla cerrando
 * (un ingreso registrado fuera de plazo lo estará igual el mes que viene).
 *
 * PURO: recibe los contadores y decide.
 */
import type { DatosPendientes } from "./ctp-pendientes";

export type VeredictoCierre = "listo" | "con_observaciones" | "no_conviene";

export interface RevisionCierre {
  veredicto: VeredictoCierre;
  /** Qué impide cerrar (vacío si no hay). */ impedimentos: string[];
  /** Qué conviene resolver antes, pero no impide. */ observaciones: string[];
  /** Lo que el cierre no va a arreglar: se informa para que no sorprenda. */ nota: string[];
  /** Frase para el botón: el usuario tiene que saber qué está por hacer. */ titulo: string;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Revisa el período contra los pendientes. Un saldo en negativo es lo único que
 * impide cerrar: significa que el libro no cuadra y congelarlo así deja un acta
 * falsa. El resto son avisos — el libro admite huecos, pero conviene saberlos.
 */
export function revisarCierre(d: DatosPendientes, mes = "el mes"): RevisionCierre {
  const impedimentos: string[] = [];
  const observaciones: string[] = [];
  const nota: string[] = [];

  if (d.saldosNegativos > 0) {
    impedimentos.push(
      `${plural(d.saldosNegativos, "especie o producto", "especies o productos")} con saldo en negativo: se despachó más de lo que entró y el acta quedaría falsa.`,
    );
  }
  if (d.corridasSinOrigen > 0) {
    observaciones.push(`${plural(d.corridasSinOrigen, "corrida", "corridas")} sin materia prima atribuida: su costo se congela sin origen.`);
  }
  if (d.ingresosPendientes > 0) {
    observaciones.push(`${plural(d.ingresosPendientes, "ingreso", "ingresos")} sin validar: no cuentan como materia prima disponible del mes.`);
  }
  if (d.despachosSinGtf > 0) {
    observaciones.push(`${plural(d.despachosSinGtf, "despacho", "despachos")} sin GTF de salida.`);
  }
  if (d.guiasSinIngresar > 0) {
    observaciones.push(`${plural(d.guiasSinIngresar, "guía", "guías")} del monte sin ingresar al CTP.`);
  }
  /* Va como observación y no como nota porque el cierre lo vuelve irreversible:
     congela los costos Y bloquea `setCosto`. Una factura que llegue después del
     cierre ya no entra sin reabrir el período, y el margen de todo lo que salió
     de esa madera queda en "no sé" para siempre. */
  if ((d.ingresosSinCosto ?? 0) > 0) {
    observaciones.push(
      `${plural(d.ingresosSinCosto ?? 0, "ingreso", "ingresos")} sin costo cargado: al cerrar se congelan así y la factura que llegue después ya no entra sin reabrir.`,
    );
  }
  if (d.despachosSinAnexo > 0) {
    nota.push(`${plural(d.despachosSinAnexo, "despacho", "despachos")} sin ANEXO N° 04 — se puede emitir después del cierre.`);
  }
  if (d.fueraDePlazo > 0) {
    nota.push(`${plural(d.fueraDePlazo, "ingreso registrado", "ingresos registrados")} fuera de plazo: cerrar no lo cambia, ya quedó en el acta.`);
  }

  const veredicto: VeredictoCierre =
    impedimentos.length > 0 ? "no_conviene" : observaciones.length > 0 ? "con_observaciones" : "listo";

  return {
    veredicto,
    impedimentos,
    observaciones,
    nota,
    // Nombra el mes: en pantalla convive con el panel de pendientes, que mira el
    // período de la vista — sin el mes, dos veredictos distintos parecen un bug.
    titulo:
      veredicto === "no_conviene" ? `Revisá esto antes de cerrar ${mes}`
        : veredicto === "con_observaciones" ? `Se puede cerrar ${mes}, con observaciones`
          : `Todo en orden para cerrar ${mes}`,
  };
}
