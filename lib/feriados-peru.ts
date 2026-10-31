/**
 * Feriados NACIONALES del Perú (puro: sin imports de servidor, sirve en cliente y backend).
 *
 * Verificados el 2026-10-20 contra la lista oficial 2026 de gob.pe (https://www.gob.pe/feriados y
 * https://www.gob.pe/feriados/historicos) y las leyes citadas abajo. El régimen general es el
 * D.Leg. 713, art. 6 (descansos remunerados, 1991); las leyes posteriores agregaron fechas.
 *
 * Los «días no laborables» que decreta el Ejecutivo para el sector público (p. ej. 2 y 27 de julio
 * de 2026 en la lista de gob.pe) NO son feriados: el sector privado sólo los toma por acuerdo con
 * el empleador. Aquí NO están, ni tampoco los feriados regionales o provinciales.
 *
 * Fechas «YYYY-MM-DD» del día de Lima; la aritmética va en UTC (igual que `lib/agenda/recurrencia.ts`).
 */
import type { FechaKey } from "@/lib/agenda/tipos";

interface FeriadoFijo {
  mes: number; // 1-12
  dia: number;
  nombre: string;
  /** Primer año en que rige (si no, desde el D.Leg. 713 de 1991). */
  desde?: number;
  /** Fuente: D.Leg. 713 art. 6 salvo que diga otra. */
  fuente: string;
}

const DL713 = "D.Leg. 713 art. 6 · https://www.gob.pe/feriados";

const FIJOS: readonly FeriadoFijo[] = [
  { mes: 1, dia: 1, nombre: "Año Nuevo", fuente: DL713 },
  { mes: 5, dia: 1, nombre: "Día del Trabajo", fuente: DL713 },
  // Ley 31788 (El Peruano, 15-06-2023): https://elperuano.pe/noticia/295797-atencion-el-domingo-7-de-junio-sera-feriado-nacional-en-peru
  // Publicada tras el 7-jun-2023, así que el primer feriado fue 2024.
  { mes: 6, dia: 7, nombre: "Batalla de Arica y Día de la Bandera", desde: 2024, fuente: "Ley 31788" },
  { mes: 6, dia: 29, nombre: "San Pedro y San Pablo", fuente: DL713 },
  // Ley 31822 (publicada 08-07-2023): lista oficial gob.pe lo trae como feriado nacional 2026.
  { mes: 7, dia: 23, nombre: "Día de la Fuerza Aérea del Perú", desde: 2023, fuente: "Ley 31822" },
  { mes: 7, dia: 28, nombre: "Fiestas Patrias", fuente: DL713 },
  { mes: 7, dia: 29, nombre: "Fiestas Patrias", fuente: DL713 },
  // Ley 31530 (publicada 26-07-2022): primer feriado el 6-ago-2022.
  { mes: 8, dia: 6, nombre: "Batalla de Junín", desde: 2022, fuente: "Ley 31530" },
  { mes: 8, dia: 30, nombre: "Santa Rosa de Lima", fuente: DL713 },
  { mes: 10, dia: 8, nombre: "Combate de Angamos", fuente: DL713 },
  { mes: 11, dia: 1, nombre: "Día de Todos los Santos", fuente: DL713 },
  { mes: 12, dia: 8, nombre: "Inmaculada Concepción", fuente: DL713 },
  // Ley 31381 (El Peruano, 31-12-2021): primer feriado el 9-dic-2022.
  { mes: 12, dia: 9, nombre: "Batalla de Ayacucho", desde: 2022, fuente: "Ley 31381" },
  { mes: 12, dia: 25, nombre: "Navidad", fuente: DL713 },
];

const dos = (n: number) => String(n).padStart(2, "0");

/** Domingo de Pascua (calendario gregoriano; algoritmo de Meeus/Jones/Butcher). */
function pascua(anio: number): { mes: number; dia: number } {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return { mes, dia };
}

function restarDias(anio: number, mes: number, dia: number, dias: number): FechaKey {
  const d = new Date(Date.UTC(anio, mes - 1, dia - dias));
  return `${d.getUTCFullYear()}-${dos(d.getUTCMonth() + 1)}-${dos(d.getUTCDate())}`;
}

/** Todos los feriados de un año, por fecha. */
const CACHE_ANIO = new Map<number, Map<FechaKey, string>>();

function feriadosDelAnio(anio: number): Map<FechaKey, string> {
  const hit = CACHE_ANIO.get(anio);
  if (hit) return hit;
  const mapa = new Map<FechaKey, string>();
  for (const f of FIJOS) {
    if (f.desde && anio < f.desde) continue;
    mapa.set(`${anio}-${dos(f.mes)}-${dos(f.dia)}`, f.nombre);
  }
  // Jueves y Viernes Santo (D.Leg. 713): 3 y 2 días antes del Domingo de Pascua.
  const p = pascua(anio);
  mapa.set(restarDias(anio, p.mes, p.dia, 3), "Jueves Santo");
  mapa.set(restarDias(anio, p.mes, p.dia, 2), "Viernes Santo");
  CACHE_ANIO.set(anio, mapa);
  return mapa;
}

const FORMA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** El feriado nacional de esa fecha, o `null` si es un día común. */
export function feriadoDe(fecha: FechaKey): { nombre: string } | null {
  const m = FORMA.exec(fecha);
  if (!m) return null;
  const nombre = feriadosDelAnio(Number(m[1])).get(fecha);
  return nombre ? { nombre } : null;
}

/** Feriados entre dos fechas, ambas incluidas, ordenados por fecha. */
export function feriadosEntre(desde: FechaKey, hasta: FechaKey): { fecha: FechaKey; nombre: string }[] {
  const a = FORMA.exec(desde);
  const b = FORMA.exec(hasta);
  if (!a || !b || desde > hasta) return [];
  const salida: { fecha: FechaKey; nombre: string }[] = [];
  for (let anio = Number(a[1]); anio <= Number(b[1]); anio++) {
    for (const [fecha, nombre] of feriadosDelAnio(anio)) {
      if (fecha >= desde && fecha <= hasta) salida.push({ fecha, nombre });
    }
  }
  return salida.sort((x, y) => (x.fecha < y.fecha ? -1 : 1));
}
