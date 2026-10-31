/**
 * El tope de una persona, dicho como lo diría Brandon.
 *
 * Antes la fila decía «Le queda S/ 600.00» y se leía como deuda; lo que
 * quiere decir es cuánto MÁS puede pedir antes de pasar su tope. Acá se decide
 * el texto (para que fila y ficha digan lo mismo) y el tope que se le sugiere
 * a partir de su historia. Sin tope cargado no se dice nada: inventarle uno
 * sería ruido (misma regla que `limite-credito.ts`).
 */

import type { AdelantoDeLaPersona } from "@/lib/adelantos/saldo-persona";
import { direccionDe } from "@/lib/adelantos/direccion";
import type { EstadoCredito } from "@/lib/adelantos/limite-credito";

/** «S/ 1,000» o «S/ 1,000.50»: sin ceros que sobran y sin depender del ICU del servidor. */
export function soles(n: number): string {
  const v = Math.round(n * 100) / 100;
  const [ent, dec] = Math.abs(v).toFixed(2).split(".");
  const miles = ent.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${v < 0 ? "-" : ""}S/ ${miles}${dec === "00" ? "" : `.${dec}`}`;
}

export type TextoTope = {
  /** Lo que va a la vista. */
  texto: string;
  /** «bien» = holgado, «atencion» = justo en el tope o pasado. */
  tono: "bien" | "atencion";
  /** Una frase más larga para el `title` / la ficha. */
  detalle: string;
};

/** `null` = sin tope: no se muestra nada (o «Sin tope» en la ficha). */
export function textoDeTope(e: EstadoCredito): TextoTope | null {
  switch (e.estado) {
    case "sin-limite":
      return null;
    case "holgado":
      return {
        texto: `Puede pedir ${soles(e.disponible)} más · tope ${soles(e.limite)}`,
        tono: "bien",
        detalle: `Tope de ${soles(e.limite)}; ya debe ${soles(e.usado)}, así que todavía puede pedir ${soles(e.disponible)} más.`,
      };
    case "al-limite":
      return {
        texto: `Ya no puede pedir más · tope ${soles(e.limite)}`,
        tono: "atencion",
        detalle: `Debe ${soles(e.usado)} y su tope es ${soles(e.limite)}: está justo en el tope. Un adelanto más lo pasa.`,
      };
    case "excede":
      return {
        texto: `Pasó su tope por ${soles(e.usado - e.limite)} · tope ${soles(e.limite)}`,
        tono: "atencion",
        detalle: `Debe ${soles(e.usado)} y su tope es ${soles(e.limite)}: lo pasó por ${soles(e.usado - e.limite)}.`,
      };
  }
}

export type TopeSugerido = {
  monto: number;
  /** De dónde sale, para el ⓘ: «lo más alto que devolvió completo». */
  porque: string;
  /** Cuántos adelantos suyos sostienen la cifra. */
  basadoEn: number;
};

/**
 * Tope sugerido = el adelanto más grande, en soles, que la persona devolvió
 * COMPLETO (LIQUIDADO). Es lo único que la historia prueba que sabe devolver.
 * Los cancelados no cuentan (no se cobraron), ni lo recibido (otra dirección),
 * ni los dólares (el tope es en soles).
 * `null` si no devolvió nada completo todavía: sin historia no se sugiere.
 */
export function topeSugerido(adelantos: readonly AdelantoDeLaPersona[]): TopeSugerido | null {
  const devueltos = adelantos.filter(
    (a) => a.status === "LIQUIDADO" && (a.moneda ?? "PEN") === "PEN" && direccionDe(a.direccion) === "DADO" && a.montoAdelantado > 0,
  );
  if (devueltos.length === 0) return null;
  const monto = Math.round(Math.max(...devueltos.map((a) => a.montoAdelantado)));
  return {
    monto,
    porque: `Lo más alto que devolvió completo: ${soles(monto)}`,
    basadoEn: devueltos.length,
  };
}

/** ¿Vale la pena ofrecer «Usar»? No si ya tiene ese tope (o uno mayor puesto a propósito). */
export function conviene(sugerido: TopeSugerido | null, limiteActual: number | null | undefined): sugerido is TopeSugerido {
  return !!sugerido && sugerido.monto !== (limiteActual ?? 0);
}
