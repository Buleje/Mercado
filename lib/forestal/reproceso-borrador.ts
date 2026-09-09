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
 *
 * ## 2026-09-09: el pase es una COLA, no uno solo
 *
 * Un bloque casi nunca tiene un reproceso: tiene tres (paquetería larga, corta
 * y larga angosta salidas del mismo comercial). Declararlos de a uno obligaba a
 * volver a la distribución entre cada uno, buscar la fila y apretar «Declarar»
 * otra vez. Ahora se tildan los que se van a declarar y viajan juntos: el Libro
 * ofrece el primero, y al declararlo (o descartarlo) aparece el siguiente.
 *
 * Se guarda como ARRAY. `leerBorradorDeReproceso()` devuelve el primero
 * pendiente y `olvidarBorradorDeReproceso()` lo saca y devuelve el que sigue —
 * así la pantalla que ya lo consumía no cambia de contrato.
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

/** Un solo pase: reemplaza la cola entera (es el botón «Declarar» de una fila). */
export function guardarBorradorDeReproceso(b: Omit<BorradorDeReproceso, "creadoAt">): boolean {
  return guardarColaDeReprocesos([b]) > 0;
}

/**
 * La cola completa, en el orden en que se va a declarar. Devuelve cuántos
 * quedaron guardados (0 = no se pudo: modo privado o cuota).
 */
export function guardarColaDeReprocesos(bs: readonly Omit<BorradorDeReproceso, "creadoAt">[]): number {
  const creadoAt = new Date().toISOString();
  const cola: BorradorDeReproceso[] = bs.map((b) => ({ ...b, creadoAt }));
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify(cola));
    return cola.length;
  } catch {
    /* Modo privado / cuota: se navega igual, sólo que sin el pase. */
    return 0;
  }
}

/**
 * La cola guardada, ya filtrada por vencimiento.
 *
 * Acepta también el formato viejo (UN objeto): una pestaña abierta antes de
 * este cambio podía tener un pase suelto guardado, y descartarlo en silencio
 * sería perder el reproceso que el operario venía a declarar.
 */
function leerCola(): BorradorDeReproceso[] {
  try {
    const raw = sessionStorage.getItem(CLAVE);
    if (!raw) return [];
    const dato: unknown = JSON.parse(raw);
    const lista = Array.isArray(dato) ? dato : [dato];
    const vivos = (lista as BorradorDeReproceso[]).filter(
      (b) =>
        b && typeof b.m3 === "number" && !!b.haciaTipo &&
        Date.now() - new Date(b.creadoAt).getTime() <= VENCE_MS,
    );
    if (vivos.length === 0) olvidarTodosLosReprocesos();
    return vivos;
  } catch {
    return [];
  }
}

/** Lee el pase PENDIENTE (el primero de la cola) si no venció. No lo borra. */
export function leerBorradorDeReproceso(): BorradorDeReproceso | null {
  return leerCola()[0] ?? null;
}

/** Cuántos pases quedan por declarar — para decir «1 de 3» y no «un pase». */
export function pendientesDeReproceso(): number {
  return leerCola().length;
}

/**
 * Consume el pase actual y devuelve **el siguiente** (o `null` si era el
 * último). Es lo mismo que hacía antes cuando la cola tenía uno solo.
 */
export function olvidarBorradorDeReproceso(): BorradorDeReproceso | null {
  const cola = leerCola();
  const resto = cola.slice(1);
  try {
    if (resto.length === 0) sessionStorage.removeItem(CLAVE);
    else sessionStorage.setItem(CLAVE, JSON.stringify(resto));
  } catch {
    /* sin sessionStorage no hay nada que olvidar */
  }
  return resto[0] ?? null;
}

/** Tira la cola entera («ya no» a todos). */
export function olvidarTodosLosReprocesos(): void {
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

/** Lo mismo, con varios: el Libro los ofrece uno tras otro, en este orden. */
export function declararColaEnElLibro(bs: readonly Omit<BorradorDeReproceso, "creadoAt">[]): void {
  if (bs.length === 0) return;
  guardarColaDeReprocesos(bs);
  window.location.href = "/admin?tab=ctp-libro-operaciones&vista=disponibles";
}
