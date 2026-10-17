/**
 * loth-plan-tala — qué árboles tumbar para llegar a la meta de la zafra.
 *
 * La pantalla ya sabía decir «vas atrasado, hacen falta 1.149 m³/día». Eso es
 * un diagnóstico, no un plan: el que está en el monte necesita la lista de
 * árboles concretos que cubren ese número, y necesita que la lista respete lo
 * que el papel permite.
 *
 * Las dos reglas que no se negocian, y que hacen que esto sea distinto de
 * ordenar por volumen:
 *
 *   1. **Sólo entra lo aprovechable**: sobre el DMC, en pie, de una especie
 *      autorizada y que no sea semillero. Proponer un árbol que no se puede
 *      tumbar no es una sugerencia optimista, es inducir una infracción.
 *   2. **El tope es POR ESPECIE**: cada una tiene su volumen autorizado y su
 *      saldo. Llenar la meta total con Shihuahuaco cuando su saldo se acabó
 *      hace un plan que cuadra en el total y viola la resolución en el detalle.
 *
 * Dentro de eso, primero los de mayor volumen: menos árboles tumbados para el
 * mismo m³ es menos daño al rodal y menos trabajo de arrastre.
 *
 * PURO y client-safe.
 */

export interface ArbolParaTalar {
  id: string;
  treeCode: string;
  especie: string;
  volumenM3: number;
  /** Categoría que le asignó el POA. Sólo `aprovechable` entra al plan. */
  categoria: string;
  estado: string;
  /** Para ubicarlo en el monte. */
  utmX: number | null;
  utmY: number | null;
  parcela: string | null;
}

export interface SaldoEspecie {
  especie: string;
  /** Lo que queda por movilizar de esa especie, en m³. */
  saldoM3: number;
}

export interface LineaPlanTala {
  arbol: ArbolParaTalar;
  /** m³ acumulados del plan hasta este árbol, inclusive. */
  acumuladoM3: number;
}

export interface PlanTala {
  lineas: LineaPlanTala[];
  /** Lo que suma el plan. */
  totalM3: number;
  /** Lo que se pidió cubrir. */
  metaM3: number;
  /** Cuánto falta para la meta si el bosque disponible no alcanza. */
  faltanteM3: number;
  /** Por qué no se llegó, cuando no se llega. */
  motivoFaltante: "sin_arboles" | "tope_por_especie" | null;
  /** Cuánto se descartó y por qué: el plan tiene que poder explicarse. */
  descartes: { especie: string; arboles: number; m3: number; motivo: string }[];
}

const norm = (s: string) => s.trim().toLowerCase();
const r3 = (n: number) => Number(n.toFixed(3));

/**
 * Arma el plan de tala hasta cubrir `metaM3`.
 *
 * `saldos` manda: si una especie no figura, se asume que no tiene saldo y sus
 * árboles no entran —el silencio en un límite legal se lee como cero, nunca
 * como infinito—.
 */
export function planDeTala(
  arboles: readonly ArbolParaTalar[],
  saldos: readonly SaldoEspecie[],
  metaM3: number,
): PlanTala {
  const meta = Math.max(0, Number(metaM3) || 0);
  const restante = new Map(saldos.map((s) => [norm(s.especie), Math.max(0, s.saldoM3)]));

  const descartados = new Map<string, { especie: string; arboles: number; m3: number; motivo: string }>();
  const anotar = (especie: string, m3: number, motivo: string) => {
    const k = `${norm(especie)}|${motivo}`;
    const d = descartados.get(k) ?? { especie, arboles: 0, m3: 0, motivo };
    d.arboles += 1;
    d.m3 = r3(d.m3 + m3);
    descartados.set(k, d);
  };

  /* Mayor volumen primero, y a igualdad el código: el mismo censo tiene que dar
     el mismo plan dos veces seguidas o nadie puede fiarse de él. */
  const candidatos = [...arboles].sort(
    (a, b) => b.volumenM3 - a.volumenM3 || a.treeCode.localeCompare(b.treeCode, "es-PE", { numeric: true }),
  );

  const lineas: LineaPlanTala[] = [];
  let total = 0;
  let topeGolpeado = false;

  for (const a of candidatos) {
    if (total >= meta) break;
    if (a.categoria !== "aprovechable") { anotar(a.especie, a.volumenM3, "no es aprovechable según el POA"); continue; }
    if (a.estado !== "en_pie") { anotar(a.especie, a.volumenM3, "ya no está en pie"); continue; }
    if (!(a.volumenM3 > 0)) { anotar(a.especie, 0, "sin volumen estimado"); continue; }

    const k = norm(a.especie);
    const saldo = restante.get(k);
    if (saldo == null) { anotar(a.especie, a.volumenM3, "especie sin saldo autorizado"); continue; }
    if (a.volumenM3 > saldo) {
      /* No se parte un árbol para que entre: se tumba entero o no se tumba. */
      anotar(a.especie, a.volumenM3, "no entra en el saldo que le queda a la especie");
      topeGolpeado = true;
      continue;
    }

    restante.set(k, r3(saldo - a.volumenM3));
    total = r3(total + a.volumenM3);
    lineas.push({ arbol: a, acumuladoM3: total });
  }

  const faltante = r3(Math.max(0, meta - total));
  return {
    lineas,
    totalM3: total,
    metaM3: r3(meta),
    faltanteM3: faltante,
    motivoFaltante: faltante <= 0 ? null : topeGolpeado ? "tope_por_especie" : "sin_arboles",
    descartes: [...descartados.values()].sort((a, b) => b.m3 - a.m3),
  };
}

/**
 * Cuánto conviene tumbar para no perder saldo al vencer la zafra.
 *
 * Se propone el trabajo de `dias` jornadas al ritmo requerido, nunca más que el
 * saldo entero: pedir más de lo que la autorización permite sería exactamente
 * el error que este módulo existe para evitar.
 */
export function metaDeDias(ritmoRequeridoM3Dia: number, dias: number, saldoM3: number): number {
  const r = Math.max(0, Number(ritmoRequeridoM3Dia) || 0);
  const d = Math.max(0, Math.floor(dias) || 0);
  return r3(Math.min(r * d, Math.max(0, saldoM3)));
}
