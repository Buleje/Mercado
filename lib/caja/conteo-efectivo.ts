/**
 * Conteo del cajón por denominación — lo que escribe «Cuadrar caja».
 *
 * El conteo express se guarda como un movimiento `arqueo` de la caja, con su
 * nota. Antes la nota decía sólo «contado / esperado / diferencia», así que el
 * detalle del cuadre no podía mostrar cuánto fue en billetes y cuánto en
 * monedas: `leerNotasArqueo` busca `Billetes: S/…` y `Monedas: S/…`, el formato
 * del Arqueo Guiado. Ahora el conteo manual escribe ese mismo formato, más el
 * desglose billete por billete y la observación de quien contó.
 */

export type Denominacion = { tipo: "billete" | "moneda"; valor: number; etiqueta: string };

export const BILLETES: readonly Denominacion[] = [
  { tipo: "billete", valor: 200, etiqueta: "S/ 200" },
  { tipo: "billete", valor: 100, etiqueta: "S/ 100" },
  { tipo: "billete", valor: 50, etiqueta: "S/ 50" },
  { tipo: "billete", valor: 20, etiqueta: "S/ 20" },
  { tipo: "billete", valor: 10, etiqueta: "S/ 10" },
];

export const MONEDAS: readonly Denominacion[] = [
  { tipo: "moneda", valor: 5, etiqueta: "S/ 5" },
  { tipo: "moneda", valor: 2, etiqueta: "S/ 2" },
  { tipo: "moneda", valor: 1, etiqueta: "S/ 1" },
  { tipo: "moneda", valor: 0.5, etiqueta: "S/ 0.50" },
  { tipo: "moneda", valor: 0.2, etiqueta: "S/ 0.20" },
  { tipo: "moneda", valor: 0.1, etiqueta: "S/ 0.10" },
];

export type Conteo = Record<string, number>;

export function claveDenominacion(d: Pick<Denominacion, "tipo" | "valor">): string {
  return `${d.tipo}-${d.valor}`;
}

const centimos = (n: number) => Math.round(n * 100) / 100;

function sumar(conteo: Conteo, lista: readonly Denominacion[]): number {
  let total = 0;
  for (const d of lista) total += (conteo[claveDenominacion(d)] ?? 0) * d.valor;
  return centimos(total);
}

export type TotalesConteo = { billetes: number; monedas: number; contado: number; diferencia: number; hayConteo: boolean };

/** Vista previa del conteo: lo que el cajero tiene en la mano contra lo esperado del backend. */
export function totalesDelConteo(conteo: Conteo, esperado: number): TotalesConteo {
  const billetes = sumar(conteo, BILLETES);
  const monedas = sumar(conteo, MONEDAS);
  const contado = centimos(billetes + monedas);
  return {
    billetes,
    monedas,
    contado,
    diferencia: centimos(contado - esperado),
    hayConteo: Object.values(conteo).some((v) => v > 0),
  };
}

/** `S/12.50` · `-S/7.50` · `+S/3.00` — el formato que `leerNotasArqueo` sabe leer. */
function soles(n: number, conSigno = false): string {
  const signo = n < 0 ? "-" : conSigno && n > 0 ? "+" : "";
  return `${signo}S/${Math.abs(n).toFixed(2)}`;
}

/** `2×S/100, 3×S/50` — sólo las denominaciones que se contaron. */
function desglose(conteo: Conteo): string {
  const partes: string[] = [];
  for (const d of [...BILLETES, ...MONEDAS]) {
    const n = conteo[claveDenominacion(d)] ?? 0;
    if (n > 0) partes.push(`${n}×S/${d.valor % 1 === 0 ? d.valor : d.valor.toFixed(2)}`);
  }
  return partes.join(", ");
}

/**
 * La nota del conteo, en el formato del Arqueo Guiado:
 * `Conteo manual | Billetes: S/350.00 | Monedas: S/12.50 | Total efectivo: S/362.50 |
 *  Esperado: S/370.00 | Diferencia: -S/7.50 | Detalle: 2×S/100, 3×S/50 | Obs: faltó un vuelto`
 */
export function notaDelConteo(conteo: Conteo, esperado: number, observacion = ""): string {
  const t = totalesDelConteo(conteo, esperado);
  const partes = [
    "Conteo manual",
    `Billetes: ${soles(t.billetes)}`,
    `Monedas: ${soles(t.monedas)}`,
    `Total efectivo: ${soles(t.contado)}`,
    `Esperado: ${soles(esperado)}`,
    `Diferencia: ${soles(t.diferencia, true)}`,
  ];
  const detalle = desglose(conteo);
  if (detalle) partes.push(`Detalle: ${detalle}`);
  const obs = observacion.replace(/\s+/g, " ").trim();
  if (obs) partes.push(`Obs: ${obs}`);
  // El backend acepta 2000 caracteres; la observación es lo único que crece.
  return partes.join(" | ").slice(0, 1990);
}

/** La observación que quedó escrita en la nota (`Obs: …` hasta el final o el próximo `|`). */
export function observacionDeLaNota(nota: string | null | undefined): string | null {
  if (!nota) return null;
  const m = /Obs:\s*([^|]+)/i.exec(nota);
  return m ? m[1].trim() : null;
}

/** Diferencia ≠ 0 pide explicación: un faltante o sobrante sin observación no se puede revisar después. */
export function pideObservacion(t: Pick<TotalesConteo, "diferencia" | "hayConteo">): boolean {
  return t.hayConteo && t.diferencia !== 0;
}
