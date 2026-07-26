/**
 * ctp-verificacion — cotejar el papel que viaja contra la línea del libro.
 *
 * La verificación pública ya mostraba el despacho y el ANEXO N° 04 uno debajo
 * del otro, y dejaba la comparación a ojo del que escanea. Eso es justo lo que
 * un anexo adulterado aprovecha: nadie cruza doce dígitos de guía en la tranca.
 * Acá se cruzan solos.
 *
 * PURO: sin fetch ni DB, para poder probar el criterio (que es lo que importa)
 * sin levantar el módulo.
 */

/** Tolerancia de redondeo del volumen: por debajo, es el mismo número. */
const TOLERANCIA_M3 = 0.005; // 0,5 %

/** Normaliza un número de guía: se tipea con espacios, guiones y minúsculas. */
export function normalizarGuia(v: string | null | undefined): string {
  return (v ?? "").toUpperCase().replace(/[\s.]/g, "").replace(/-+/g, "-").trim();
}

export interface AnexoPublico {
  gtf?: string | null;
  totalPiezas?: number | null;
  totalM3?: number | null;
}

export interface LineaPublica {
  gtfNumber?: string | null;
  pieces?: number | null;
  quantity?: number | null;
  unit?: string | null;
}

export interface CotejoPublico {
  /** Qué no cuadra, en criollo. Vacío = no se encontró nada raro. */
  discrepancias: string[];
  /** Se comparó algo y todo coincidió (distinto de "no había nada que comparar"). */
  coincide: boolean;
}

/**
 * Compara lo comparable y NO inventa lo que no puede saber: si el libro mide en
 * pie tablar y el anexo en m³, no se compara el volumen (convertir exigiría el
 * factor de la pieza, y un cotejo aproximado que acusa en falso es peor que no
 * cotejar). Un campo vacío no es una discrepancia: es un dato que falta.
 */
export function cotejarAnexoConLibro(anexo: AnexoPublico | null, linea: LineaPublica): CotejoPublico {
  if (!anexo) return { discrepancias: [], coincide: false };

  const discrepancias: string[] = [];
  let comparado = 0;

  const gA = normalizarGuia(anexo.gtf);
  const gL = normalizarGuia(linea.gtfNumber);
  if (gA && gL) {
    comparado++;
    if (gA !== gL) {
      discrepancias.push(`El anexo ampara la guía ${anexo.gtf}, pero esta línea del libro salió con la ${linea.gtfNumber}.`);
    }
  }

  const pA = Number(anexo.totalPiezas ?? 0);
  const pL = Number(linea.pieces ?? 0);
  if (pA > 0 && pL > 0) {
    comparado++;
    if (pA !== pL) {
      discrepancias.push(`El anexo declara ${pA} piezas y el libro registra ${pL}.`);
    }
  }

  // Volumen: sólo si el libro también está en m³.
  const vA = Number(anexo.totalM3 ?? 0);
  const vL = Number(linea.quantity ?? 0);
  if (vA > 0 && vL > 0 && (linea.unit ?? "").toLowerCase() === "m3") {
    comparado++;
    const dif = Math.abs(vA - vL);
    if (dif / Math.max(vA, vL) > TOLERANCIA_M3) {
      discrepancias.push(`El anexo declara ${vA.toFixed(4)} m³ y el libro registra ${vL.toFixed(4)} m³.`);
    }
  }

  return { discrepancias, coincide: comparado > 0 && discrepancias.length === 0 };
}
