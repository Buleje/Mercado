/**
 * cubicacion-cuadre — la medición contra lo que el libro ya declaró (ADR-368).
 *
 * Cubicar un producto que **ya está en el libro** no es medir en el aire: la
 * corrida declaró un tipo, una especie, una cantidad de piezas y un volumen. Si
 * la cinta dice otra cosa, hay dos papeles que se contradicen — y el que los
 * cruza es un fiscalizador, no el operador.
 *
 * Esto no bloquea nada: la medición real puede diferir del asiento por motivos
 * legítimos (se midió mejor, el paquete se rearmó). Lo que hace es **decirlo**,
 * con el número exacto de la diferencia, para poder cuadrarlos antes de que el
 * anexo salga impreso.
 *
 * PURO y client-safe.
 */

import type { PiezaCubicada } from "./cubicacion";
import { tipoDePieza } from "./cubicacion-tipo";
import { fmtM3 } from "./cubicacion-formato";

/** Lo que el Libro CTP afirma del producto que se está cubicando. */
export interface DeclaradoEnLibro {
  /** Tipo de producto del asiento ("MADERA ASERRADA (COMERCIAL)"). */
  producto?: string | null;
  especie?: string | null;
  /** Piezas declaradas (del paquete o de la corrida). */
  piezas?: number | null;
  /** Volumen declarado en m³. */
  volumenM3?: number | null;
}

export type TonoCuadre = "ok" | "aviso" | "error";

export interface AvisoCuadre {
  /** Qué se comparó: sirve de key y de ancla para el que lee. */
  campo: "tipo" | "especie" | "piezas" | "volumen";
  tono: TonoCuadre;
  /** En español y accionable: se muestra tal cual. */
  texto: string;
  /** La diferencia con signo, cuando el campo es numérico. */
  delta?: number;
}

/**
 * Tolerancias del NEGOCIO, no del float.
 *
 * El volumen se mide con cinta y se declara con cuatro decimales: 10 litros
 * (0.01 m³) es lo que separa dos mediciones honestas de la misma pila. En piezas
 * no hay tolerancia: una tabla de más o de menos se cuenta con la mano.
 */
export const TOLERANCIA_M3 = 0.01;
/** A partir de acá la diferencia deja de ser redondeo y pasa a ser un problema. */
export const DIFERENCIA_GRAVE_PCT = 5;

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;
const norm = (v: string | null | undefined) =>
  (v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** ¿El tipo comercial medido está nombrado en el producto del libro? */
function tipoCoincide(tipoMedido: string, producto: string): boolean {
  const p = norm(producto);
  const t = norm(tipoMedido);
  if (!p || !t) return true;
  /* El libro nombra «MADERA ASERRADA (PAQUETERIA CORTA)» y el cubicador
     «Paq. corta»: se comparan las palabras con contenido, no la cadena entera. */
  const palabras = t.split(/[\s.·]+/).filter((w) => w.length >= 4);
  if (palabras.length === 0) return true;
  return palabras.some((w) => p.includes(w.slice(0, Math.max(4, w.length - 1))));
}

/**
 * Cruza la cubicación con el asiento. Devuelve un aviso por campo comparable;
 * los que no se pueden comparar (el libro no lo declara) quedan fuera en vez de
 * inventar un veredicto.
 */
export function cuadrarConLibro(
  piezas: readonly PiezaCubicada[],
  declarado: DeclaradoEnLibro,
): AvisoCuadre[] {
  const avisos: AvisoCuadre[] = [];
  if (piezas.length === 0) return avisos;

  const totalPiezas = piezas.reduce((a, p) => a + (Number(p.cantidad) || 0), 0);
  const totalM3 = r4(piezas.reduce((a, p) => a + (Number(p.m3) || 0), 0));

  // ── Tipo comercial ──
  const tipos = [...new Set(piezas.map((p) => tipoDePieza(p)))];
  if (declarado.producto?.trim()) {
    const ajenos = tipos.filter((t) => !tipoCoincide(t, declarado.producto ?? ""));
    if (ajenos.length > 0) {
      avisos.push({
        campo: "tipo",
        tono: "aviso",
        texto:
          `La medición tiene ${ajenos.map((t) => `«${t}»`).join(", ")} y el libro declara ` +
          `«${declarado.producto}». O el asiento dice otro producto, o esas piezas van en otra guía.`,
      });
    } else {
      avisos.push({ campo: "tipo", tono: "ok", texto: `El tipo coincide con «${declarado.producto}».` });
    }
  }

  // ── Especie ──
  const especies = [...new Set(piezas.map((p) => norm(p.especie)).filter(Boolean))];
  if (declarado.especie?.trim()) {
    const esperada = norm(declarado.especie);
    if (especies.length === 0) {
      avisos.push({
        campo: "especie",
        tono: "aviso",
        texto: `Ninguna pieza dice especie y el libro declara ${declarado.especie}: cargala para que el anexo la pueda nombrar.`,
      });
    } else if (especies.length > 1 || especies[0] !== esperada) {
      avisos.push({
        campo: "especie",
        tono: "error",
        texto:
          `La medición trae ${especies.length > 1 ? `${especies.length} especies` : `«${piezas.find((p) => norm(p.especie) === especies[0])?.especie}»`} ` +
          `y el libro declara ${declarado.especie}. Una guía ampara la especie que dice el asiento.`,
      });
    } else {
      avisos.push({ campo: "especie", tono: "ok", texto: `La especie coincide con ${declarado.especie}.` });
    }
  }

  // ── Piezas ──
  if (declarado.piezas != null && declarado.piezas > 0) {
    const delta = totalPiezas - declarado.piezas;
    avisos.push(
      delta === 0
        ? { campo: "piezas", tono: "ok", texto: `Las ${totalPiezas} piezas coinciden con el libro.`, delta }
        : {
            campo: "piezas",
            tono: "aviso",
            texto:
              `Contaste ${totalPiezas} piezas y el libro declara ${declarado.piezas} ` +
              `(${delta > 0 ? "+" : ""}${delta}).`,
            delta,
          },
    );
  }

  // ── Volumen ──
  if (declarado.volumenM3 != null && declarado.volumenM3 > 0) {
    const delta = r4(totalM3 - declarado.volumenM3);
    const pct = Math.abs(delta / declarado.volumenM3) * 100;
    if (Math.abs(delta) <= TOLERANCIA_M3) {
      avisos.push({
        campo: "volumen",
        tono: "ok",
        texto: `El volumen cuadra: ${fmtM3(totalM3)} m³ contra ${fmtM3(declarado.volumenM3)} declarados.`,
        delta,
      });
    } else {
      avisos.push({
        campo: "volumen",
        tono: pct >= DIFERENCIA_GRAVE_PCT ? "error" : "aviso",
        texto:
          `La cubicación da ${fmtM3(totalM3)} m³ y el libro declara ${fmtM3(declarado.volumenM3)} ` +
          `(${delta > 0 ? "+" : ""}${fmtM3(delta)} m³, ${pct.toFixed(1)} %). ` +
          (delta > 0
            ? "Medir de más que lo declarado es lo que un control lee como carga sin amparo."
            : "Si sobró madera declarada, revisá si parte salió en otra guía."),
        delta,
      });
    }
  }

  return avisos;
}

/** El peor tono de la tanda: es lo que decide el color del resumen. */
export function tonoGeneral(avisos: readonly AvisoCuadre[]): TonoCuadre {
  if (avisos.some((a) => a.tono === "error")) return "error";
  if (avisos.some((a) => a.tono === "aviso")) return "aviso";
  return "ok";
}

// ── El cuadre de un CONJUNTO de registros (ADR-369) ─────────────────────────

/** Una fila del libro elegida para cuadrar contra la cubicación. */
export interface FilaDeclarada {
  /** Id de la fila (paquete o corrida): sirve para volver a ella. */
  id: string;
  etiqueta: string;
  especie?: string | null;
  producto?: string | null;
  piezas?: number | null;
  volumenM3?: number | null;
}

export interface CuadrePorEspecie {
  especie: string;
  piezasMedidas: number;
  piezasDeclaradas: number;
  m3Medido: number;
  m3Declarado: number;
  deltaPiezas: number;
  deltaM3: number;
  tono: TonoCuadre;
}

export interface CuadreConjunto {
  porEspecie: CuadrePorEspecie[];
  total: Omit<CuadrePorEspecie, "especie">;
  /** Qué mirar, en español. Vacío = cuadra todo. */
  avisos: AvisoCuadre[];
  tono: TonoCuadre;
}

const SIN_ESPECIE = "sin especie";

function tonoDe(deltaPiezas: number, deltaM3: number, m3Declarado: number): TonoCuadre {
  const pct = m3Declarado > 0 ? Math.abs(deltaM3 / m3Declarado) * 100 : 0;
  if (Math.abs(deltaM3) > TOLERANCIA_M3 && pct >= DIFERENCIA_GRAVE_PCT) return "error";
  if (Math.abs(deltaM3) > TOLERANCIA_M3 || deltaPiezas !== 0) return "aviso";
  return "ok";
}

/**
 * Cruza UNA cubicación contra VARIAS filas del libro, especie por especie.
 *
 * Es el caso real del aserradero: se cubica el camión entero —veinte metros
 * cúbicos de tres especies— y eso tiene que cuadrar contra el conjunto de
 * paquetes que se van a despachar, no contra uno. Comparar sólo los totales
 * escondería el error que importa: que sobre Tornillo y falte Capirona da cero
 * en la suma y es exactamente lo que no puede pasar en una guía.
 *
 * Las piezas sin especie se agrupan bajo «sin especie» y se NOMBRAN: son las que
 * hay que poder señalar antes de imprimir.
 */
export function cuadrarConjunto(
  piezas: readonly PiezaCubicada[],
  filas: readonly FilaDeclarada[],
): CuadreConjunto {
  const clave = (v: string | null | undefined) => norm(v) || SIN_ESPECIE;
  const acc = new Map<string, CuadrePorEspecie>();
  const nombre = new Map<string, string>();

  const tomar = (k: string): CuadrePorEspecie => {
    const previo = acc.get(k);
    if (previo) return previo;
    const fila: CuadrePorEspecie = {
      especie: nombre.get(k) ?? k,
      piezasMedidas: 0, piezasDeclaradas: 0, m3Medido: 0, m3Declarado: 0,
      deltaPiezas: 0, deltaM3: 0, tono: "ok",
    };
    acc.set(k, fila);
    return fila;
  };

  for (const p of piezas) {
    const k = clave(p.especie);
    if (p.especie?.trim() && !nombre.has(k)) nombre.set(k, p.especie.trim());
    const f = tomar(k);
    f.piezasMedidas += Number(p.cantidad) || 0;
    f.m3Medido = r4(f.m3Medido + (Number(p.m3) || 0));
  }
  for (const d of filas) {
    const k = clave(d.especie);
    if (d.especie?.trim() && !nombre.has(k)) nombre.set(k, d.especie.trim());
    const f = tomar(k);
    f.piezasDeclaradas += Number(d.piezas) || 0;
    f.m3Declarado = r4(f.m3Declarado + (Number(d.volumenM3) || 0));
  }

  const porEspecie = [...acc.entries()]
    .map(([k, f]) => {
      const especie = nombre.get(k) ?? f.especie;
      const deltaPiezas = f.piezasMedidas - f.piezasDeclaradas;
      const deltaM3 = r4(f.m3Medido - f.m3Declarado);
      return { ...f, especie, deltaPiezas, deltaM3, tono: tonoDe(deltaPiezas, deltaM3, f.m3Declarado) };
    })
    .sort((a, b) => b.m3Declarado - a.m3Declarado || a.especie.localeCompare(b.especie));

  const total = porEspecie.reduce(
    (a, f) => ({
      piezasMedidas: a.piezasMedidas + f.piezasMedidas,
      piezasDeclaradas: a.piezasDeclaradas + f.piezasDeclaradas,
      m3Medido: r4(a.m3Medido + f.m3Medido),
      m3Declarado: r4(a.m3Declarado + f.m3Declarado),
      deltaPiezas: 0, deltaM3: 0, tono: "ok" as TonoCuadre,
    }),
    { piezasMedidas: 0, piezasDeclaradas: 0, m3Medido: 0, m3Declarado: 0, deltaPiezas: 0, deltaM3: 0, tono: "ok" as TonoCuadre },
  );
  total.deltaPiezas = total.piezasMedidas - total.piezasDeclaradas;
  total.deltaM3 = r4(total.m3Medido - total.m3Declarado);
  total.tono = tonoDe(total.deltaPiezas, total.deltaM3, total.m3Declarado);

  const avisos: AvisoCuadre[] = [];
  for (const f of porEspecie) {
    if (f.tono === "ok") continue;
    if (f.m3Declarado === 0) {
      avisos.push({
        campo: "especie",
        tono: "error",
        texto: `Se midieron ${fmtM3(f.m3Medido)} m³ de ${f.especie} y no hay ninguna fila elegida de esa especie.`,
        delta: f.deltaM3,
      });
      continue;
    }
    if (f.m3Medido === 0) {
      avisos.push({
        campo: "especie",
        tono: "error",
        texto: `Elegiste ${fmtM3(f.m3Declarado)} m³ de ${f.especie} y la cubicación no tiene ninguna pieza de esa especie.`,
        delta: f.deltaM3,
      });
      continue;
    }
    avisos.push({
      campo: "volumen",
      tono: f.tono,
      texto:
        `${f.especie}: medidos ${fmtM3(f.m3Medido)} m³ contra ${fmtM3(f.m3Declarado)} declarados ` +
        `(${f.deltaM3 > 0 ? "+" : ""}${fmtM3(f.deltaM3)} m³` +
        (f.deltaPiezas !== 0 ? `, ${f.deltaPiezas > 0 ? "+" : ""}${f.deltaPiezas} piezas` : "") +
        ").",
      delta: f.deltaM3,
    });
  }
  /* La suma de m³ puede cerrar con las especies cruzadas —sobra Tornillo, falta
     Capirona— y eso es lo que NO puede pasar en una guía. Se dice primero, para
     que nadie lea el total en verde como que está todo bien. Se mira el volumen
     y no el tono del total: ése ya incluye las piezas. */
  if (Math.abs(total.deltaM3) <= TOLERANCIA_M3 && avisos.length > 0) {
    avisos.unshift({
      campo: "especie",
      tono: "aviso",
      texto: "El total cuadra, pero no especie por especie: lo que sobra de una tapa lo que falta de otra.",
    });
  }

  return { porEspecie, total, avisos, tono: avisos.length > 0 ? tonoGeneral(avisos) : total.tono };
}
