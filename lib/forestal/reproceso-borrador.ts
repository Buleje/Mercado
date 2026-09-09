"use client";

/**
 * El puente entre el reproceso **sugerido** (la distribución del cubicador,
 * ADR-404) y el reproceso **declarado** (el Libro, ADR-316).
 *
 * Hasta acá eran dos pantallas que no se hablaban: la distribución decía
 * «reprocesá 0.629 m³ de comercial en paquetería larga» y el operario tenía
 * que ir al Libro, buscar la corrida, y volver a tipear el producto y el
 * volumen de memoria. Cada retipeo es una oportunidad de declarar otra cosa.
 *
 * ## Qué viaja y qué NO
 *
 * Viaja lo que la sugerencia SABE: de qué tipo a qué tipo, cuántos m³, la
 * especie y de qué bloque salió. **No viaja la corrida de origen**: la
 * sugerencia trabaja con bloques del cubicador (una GTF, un saldo, un paquete)
 * y el reproceso del Libro se declara contra una corrida de producción con
 * saldo. Elegir esa corrida por el operario sería inventar de qué asiento sale
 * la madera — justo lo que la trazabilidad no perdona. Por eso el Libro
 * **ofrece** la sugerencia y el operario elige la corrida.
 *
 * Vive en `sessionStorage` y se consume UNA vez: es un pase de una pantalla a
 * otra, no una preferencia. Si el operario cierra la pestaña sin declarar, el
 * pase se pierde y no queda un borrador viejo esperando a confundir a nadie.
 */

/** Clave del pase. Sesión, no local: no sobrevive a cerrar la pestaña. */
const CLAVE = "buleje-reproceso-sugerido";

export interface BorradorDeReproceso {
  /** Tipo comercial del que sale («Comercial»). */
  desdeTipo: string;
  /** Tipo comercial que se quiere («Paquetería larga»). */
  haciaTipo: string;
  /** El producto del Libro que corresponde a `haciaTipo`, si el catálogo lo tiene. */
  productoDestino: string | null;
  /** m³ que la sugerencia dice convertir. */
  m3: number;
  especie: string;
  /** De qué bloque de la distribución salió — para reconocerlo en el Libro. */
  etiqueta: string;
  /** N° de permiso del bloque, si lo declara. */
  permiso: string | null;
  /** Cuándo se creó el pase (ISO), para no ofrecer uno de hace horas. */
  creadoAt: string;
}

/** Más viejo que esto ya no se ofrece: es de otro momento de trabajo. */
const VENCE_MS = 30 * 60 * 1000;

export function guardarBorradorDeReproceso(b: Omit<BorradorDeReproceso, "creadoAt">): boolean {
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify({ ...b, creadoAt: new Date().toISOString() }));
    return true;
  } catch {
    /* Modo privado / cuota: se navega igual, sólo que sin el pase. */
    return false;
  }
}

/** Lee el pase si hay uno y no venció. No lo borra. */
export function leerBorradorDeReproceso(): BorradorDeReproceso | null {
  try {
    const raw = sessionStorage.getItem(CLAVE);
    if (!raw) return null;
    const b = JSON.parse(raw) as BorradorDeReproceso;
    if (!b || typeof b.m3 !== "number" || !b.haciaTipo) return null;
    if (Date.now() - new Date(b.creadoAt).getTime() > VENCE_MS) {
      olvidarBorradorDeReproceso();
      return null;
    }
    return b;
  } catch {
    return null;
  }
}

export function olvidarBorradorDeReproceso(): void {
  try {
    sessionStorage.removeItem(CLAVE);
  } catch {
    /* sin sessionStorage no hay nada que olvidar */
  }
}

/**
 * Deja el pase y abre el Libro en Productos disponibles, que es donde el
 * reproceso se declara de verdad.
 *
 * Navegación DURA (`location.href`) y no `router.push`: el sidebar del panel
 * cambia de módulo por su propio estado y un push movía la barra de
 * direcciones dejando la pantalla donde estaba (bug real de 2026-09-01).
 */
export function declararEnElLibro(b: Omit<BorradorDeReproceso, "creadoAt">): void {
  guardarBorradorDeReproceso(b);
  window.location.href = "/admin?tab=ctp-libro-operaciones&vista=disponibles";
}
