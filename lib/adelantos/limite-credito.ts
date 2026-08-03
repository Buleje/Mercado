/**
 * Cuánto se le puede adelantar todavía a una persona.
 *
 * EL HUECO QUE TAPA. `limiteCredito` existía por persona y sólo se pintaba en su
 * ficha, en pasado: «Límite de crédito: S/ 500 · alcanzado». Para cuando se lee
 * eso, la plata ya salió. La pregunta útil es la otra: al REGISTRAR el adelanto,
 * ¿este monto lo pasa?
 *
 * AVISA, NO BLOQUEA. El tope es del dueño y él decide saltárselo — hay clientes
 * de años a los que se les fía de más a propósito. Lo que no puede pasar es que
 * se lo salte sin enterarse. Igual criterio que el resto del libro: el faltante
 * se declara, no se prohíbe.
 *
 * Sin límite cargado no hay nada que decir: la mayoría de las personas no tienen
 * tope, y inventarles uno de la nada sería ruido.
 */

export type EstadoCredito =
  | { estado: "sin-limite" }
  | { estado: "holgado"; limite: number; usado: number; disponible: number }
  | { estado: "al-limite"; limite: number; usado: number; disponible: number; aviso: string }
  | { estado: "excede"; limite: number; usado: number; disponible: number; exceso: number; aviso: string };

const r2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * @param limite tope de la persona (`limiteCredito`), o null si no tiene.
 * @param saldoActual lo que ya debe sin liquidar.
 * @param montoNuevo lo que se está por adelantar ahora (0 para "sólo mirar").
 */
export function estadoDeCredito(
  limite: number | null | undefined,
  saldoActual: number | null | undefined,
  montoNuevo = 0,
): EstadoCredito {
  if (limite == null || !(limite > 0)) return { estado: "sin-limite" };

  const usado = Math.max(0, r2(saldoActual ?? 0));
  const disponible = r2(limite - usado);
  const quedaria = r2(usado + Math.max(0, montoNuevo));

  if (quedaria > limite) {
    const exceso = r2(quedaria - limite);
    return {
      estado: "excede",
      limite,
      usado,
      disponible,
      exceso,
      aviso:
        montoNuevo > 0
          ? `Con este adelanto pasa su límite de ${money(limite)} por ${money(exceso)}.`
          : `Ya debe ${money(usado)} y su límite es ${money(limite)}.`,
    };
  }

  // Justo en el tope no es "holgado": es el último adelanto que entra.
  if (quedaria === limite) {
    return {
      estado: "al-limite",
      limite,
      usado,
      disponible,
      aviso: `Queda exactamente en su límite de ${money(limite)}.`,
    };
  }

  return { estado: "holgado", limite, usado, disponible };
}

/** Para las pantallas que sólo quieren saber si hay que mostrar alarma. */
export function requiereAtencion(
  e: EstadoCredito,
): e is Extract<EstadoCredito, { estado: "excede" | "al-limite" }> {
  return e.estado === "excede" || e.estado === "al-limite";
}

/**
 * Orden de la lista de personas: primero quien está más cerca de su tope.
 *
 * Es la pregunta de quien atiende el mostrador —«¿a quién ya no le puedo fiar
 * más?»— y por nombre alfabético no se responde. Los que no tienen límite van al
 * final: no es que estén bien, es que no hay nada que medir.
 */
export function ordenarPorRiesgoDeCredito<
  T extends { limiteCredito?: number | null; saldoPendiente?: number | null; nombre: string },
>(personas: readonly T[]): T[] {
  const usoDe = (p: T) => {
    const e = estadoDeCredito(p.limiteCredito, p.saldoPendiente);
    if (e.estado === "sin-limite") return -1;
    return e.limite > 0 ? e.usado / e.limite : -1;
  };
  return [...personas].sort((a, b) => {
    const ua = usoDe(a);
    const ub = usoDe(b);
    if (ua !== ub) return ub - ua;
    return a.nombre.localeCompare(b.nombre, "es");
  });
}
