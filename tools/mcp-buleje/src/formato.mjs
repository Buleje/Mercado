// Formato de salida en español: soles «S/ 1.234,50»; madera en PT primero, después m³ y piezas.

/** @param {number} n @param {number} dec */
export function numero(n, dec = 2) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "—";
  const v = Number(n);
  const [ent, frac] = Math.abs(v).toFixed(dec).split(".");
  const miles = ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const signo = v < 0 && Number(Math.abs(v).toFixed(dec)) !== 0 ? "-" : "";
  return `${signo}${miles}${frac ? "," + frac : ""}`;
}

/** @param {number} n */
export function soles(n) {
  const t = numero(n, 2);
  return t === "—" ? t : t.startsWith("-") ? `-S/ ${t.slice(1)}` : `S/ ${t}`;
}

/**
 * Madera: PT primero (unidad del negocio), después m³ y piezas. Omite lo que no viene.
 * @param {{ pt?: number|null, m3?: number|null, piezas?: number|null }} m
 */
export function madera(m) {
  const partes = [];
  if (m.pt !== undefined && m.pt !== null) partes.push(`${numero(m.pt, 2)} PT`);
  if (m.m3 !== undefined && m.m3 !== null) partes.push(`${numero(m.m3, 3)} m³`);
  if (m.piezas !== undefined && m.piezas !== null) partes.push(`${numero(m.piezas, 0)} ${Number(m.piezas) === 1 ? "pieza" : "piezas"}`);
  return partes.length ? partes.join(" · ") : "—";
}

/**
 * Recorta una lista a N filas y dice cómo pedir más.
 * @template T @param {T[]} filas @param {number} [max]
 */
export function recortar(filas, max = 50) {
  if (!Array.isArray(filas)) return { filas: [], total: 0, truncado: false, aviso: "" };
  const truncado = filas.length > max;
  return {
    filas: truncado ? filas.slice(0, max) : filas,
    total: filas.length,
    truncado,
    aviso: truncado ? `Se muestran ${max} de ${filas.length}. Pedí la siguiente página con page/cursor/limit.` : "",
  };
}

/** Fecha ISO o Date → «dd-mm-aaaa» en hora de Lima. */
export function fechaLima(v) {
  // Fechas de negocio guardadas como día suelto o medianoche UTC («2026-10-29», «…T00:00:00.000Z»): ese día tal cual.
  // Pasarlas a Lima (UTC-5) las mostraba un día antes (carril B, 29-10).
  const dia = typeof v === "string" ? v.match(/^(\d{4})-(\d{2})-(\d{2})(?:T00:00(?::00(?:\.0+)?)?(?:Z|\+00:00))?$/) : null;
  if (dia) return `${dia[3]}-${dia[2]}-${dia[1]}`;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  const p = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(d);
  const g = (t) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("day")}-${g("month")}-${g("year")}`;
}
