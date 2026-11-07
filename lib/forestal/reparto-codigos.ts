/**
 * El código de cada línea del reparto de rolliza (Brandon, 2026-10-19: «al lado
 * derecho de Distribuido añade un código, correlativo según el bloque para
 * identificar mejor; ojo es código único»).
 *
 * `{n.º del bloque}-{correlativo de 2 dígitos}`: 1-01, 1-02, 2-01… Es un
 * REGISTRO que se guarda, no una cuenta que se rehace al dibujar:
 *
 * · **Estable.** La llave es la de la casilla «Distribuido» (`claveMarca`:
 *   bloque × día × tipo), no la posición en la tabla: tildar, filtrar o
 *   reordenar no lo mueve.
 * · **Nunca se reusa.** Los contadores sólo suben: un tipo nuevo en el bloque
 *   toma el siguiente número y uno borrado se lleva el suyo. Lo mismo el número
 *   del bloque: se da la primera vez que aparece, en el orden de la lista
 *   maestra, y un bloque borrado no devuelve el suyo.
 * · **Único en la hoja.** El número del bloque es único y el correlativo es
 *   único dentro del bloque.
 *
 * Vive junto a las casillas, en el navegador (`…-rolliza-codigos`), igual que
 * las marcas que identifica.
 */

export interface RegistroCodigos {
  v: 1;
  /** `id del bloque → su número` (1, 2, 3…). */
  bloques: Record<string, number>;
  /** El último número de bloque dado. */
  sigBloque: number;
  /** `claveMarca → código` («1-03»). */
  lineas: Record<string, string>;
  /** `id del bloque → el último correlativo dado`. */
  sigLinea: Record<string, number>;
}

export const REGISTRO_VACIO: RegistroCodigos = Object.freeze({
  v: 1,
  bloques: {},
  sigBloque: 0,
  lineas: {},
  sigLinea: {},
}) as RegistroCodigos;

/** `1, 3` → «1-03». Desde 100 sigue sin recortar («1-100»). */
export const formatoCodigo = (bloque: number, n: number): string => `${bloque}-${String(n).padStart(2, "0")}`;

/** «1-03» → `[1, 3]`; lo que no tenga esa forma, `null`. */
export function partesCodigo(codigo: string | null | undefined): [number, number] | null {
  const m = /^(\d+)-(\d+)$/.exec(codigo ?? "");
  return m ? [Number(m[1]), Number(m[2])] : null;
}

export interface LineaConBloque {
  /** `claveMarca(bloqueId, dia, grupo)`. */
  clave: string;
  bloqueId: string;
}

/**
 * Da número a los bloques y código a las líneas que todavía no lo tienen.
 *
 * Si no hay nada nuevo devuelve EL MISMO objeto (`===`): quien lo guarda sabe
 * así que no tiene nada que escribir y no entra en bucle.
 */
export function asignarCodigos(
  prev: RegistroCodigos,
  ordenBloques: readonly string[],
  lineas: readonly LineaConBloque[],
): RegistroCodigos {
  let out: RegistroCodigos | null = null;
  const escribible = (): RegistroCodigos =>
    (out ??= {
      v: 1,
      bloques: { ...prev.bloques },
      sigBloque: prev.sigBloque,
      lineas: { ...prev.lineas },
      sigLinea: { ...prev.sigLinea },
    });
  const numeroDe = (id: string): number => {
    const ya = (out ?? prev).bloques[id];
    if (ya != null) return ya;
    const e = escribible();
    e.sigBloque += 1;
    e.bloques[id] = e.sigBloque;
    return e.sigBloque;
  };
  /* Primero los bloques en el orden de la lista maestra: el bloque 1 de la
     tabla de arriba es el 1 de los códigos, aunque todavía no tenga líneas. */
  for (const id of ordenBloques) numeroDe(id);
  for (const l of lineas) {
    if ((out ?? prev).lineas[l.clave]) continue;
    const nb = numeroDe(l.bloqueId);
    const e = escribible();
    const k = (e.sigLinea[l.bloqueId] ?? 0) + 1;
    e.sigLinea[l.bloqueId] = k;
    e.lineas[l.clave] = formatoCodigo(nb, k);
  }
  return out ?? prev;
}

/** El número del bloque, si ya lo tiene. */
export const numeroDeBloque = (r: RegistroCodigos | null | undefined, bloqueId: string): number | undefined =>
  r?.bloques[bloqueId];

/** Ordena por código: 1-02 antes que 1-10 y que 2-01; sin código, al final. */
export function compararCodigos(a: string | null | undefined, b: string | null | undefined): number {
  const pa = partesCodigo(a);
  const pb = partesCodigo(b);
  if (!pa || !pb) return pa ? -1 : pb ? 1 : 0;
  return pa[0] - pb[0] || pa[1] - pb[1];
}

/**
 * Lo guardado, limpio. Los contadores se suben a lo más alto que ya se usó:
 * aunque el JSON llegue a medias, un código dado no vuelve a salir.
 */
export function normalizarRegistro(crudo: unknown): RegistroCodigos {
  if (!crudo || typeof crudo !== "object") return REGISTRO_VACIO;
  const o = crudo as Partial<Record<keyof RegistroCodigos, unknown>>;
  const bloques: Record<string, number> = {};
  for (const [id, n] of Object.entries((o.bloques as Record<string, unknown>) ?? {})) {
    if (typeof n === "number" && Number.isInteger(n) && n > 0) bloques[id] = n;
  }
  const lineas: Record<string, string> = {};
  const sigLinea: Record<string, number> = {};
  for (const [id, n] of Object.entries((o.sigLinea as Record<string, unknown>) ?? {})) {
    if (typeof n === "number" && Number.isInteger(n) && n > 0) sigLinea[id] = n;
  }
  const bloquePorNumero = new Map(Object.entries(bloques).map(([id, n]) => [n, id]));
  for (const [clave, c] of Object.entries((o.lineas as Record<string, unknown>) ?? {})) {
    const p = typeof c === "string" ? partesCodigo(c) : null;
    if (!p) continue;
    lineas[clave] = c as string;
    const id = bloquePorNumero.get(p[0]);
    if (id != null) sigLinea[id] = Math.max(sigLinea[id] ?? 0, p[1]);
  }
  const maxBloque = Math.max(0, ...Object.values(bloques));
  const sigBloque = typeof o.sigBloque === "number" && Number.isFinite(o.sigBloque) ? Math.max(o.sigBloque, maxBloque) : maxBloque;
  return { v: 1, bloques, sigBloque, lineas, sigLinea };
}

type Almacen = Pick<Storage, "getItem" | "setItem">;

export function leerRegistro(almacen: Almacen | null | undefined, clave: string): RegistroCodigos {
  try {
    const raw = almacen?.getItem(clave);
    return raw ? normalizarRegistro(JSON.parse(raw)) : REGISTRO_VACIO;
  } catch {
    return REGISTRO_VACIO;
  }
}

export function guardarRegistro(almacen: Almacen | null | undefined, clave: string, r: RegistroCodigos): void {
  try {
    almacen?.setItem(clave, JSON.stringify(r));
  } catch {
    /* quota: vale para esta visita */
  }
}

/**
 * Junta el registro del servidor (`base`, manda) con el que trae un
 * dispositivo (`entrante`), para que la oficina y el celular vean los mismos
 * códigos (Brandon, 2026-10-19).
 *
 * · Lo que el servidor ya numeró no se mueve, aunque el dispositivo diga otra cosa.
 * · Lo nuevo del dispositivo conserva su número si está libre.
 * · Si choca —dos dispositivos dieron «1-03» a líneas distintas sin verse—, el
 *   que llega segundo toma el siguiente libre: un código dado nunca se repite.
 *
 * Sin nada nuevo devuelve `base` (`===`), para que quien guarda no escriba.
 */
export function fusionarRegistros(base: RegistroCodigos, entrante: RegistroCodigos | null | undefined): RegistroCodigos {
  if (!entrante || entrante === base) return base;
  const out: RegistroCodigos = {
    v: 1,
    bloques: { ...base.bloques },
    sigBloque: base.sigBloque,
    lineas: { ...base.lineas },
    sigLinea: { ...base.sigLinea },
  };
  let cambio = false;

  /* Bloques: primero los que no chocan (conservan su número), después los que sí. */
  const numerosUsados = new Set(Object.values(out.bloques));
  const bloquesNuevos = Object.entries(entrante.bloques)
    .filter(([id]) => out.bloques[id] == null)
    .sort((a, b) => a[1] - b[1]);
  const bloquesQueChocan: string[] = [];
  for (const [id, n] of bloquesNuevos) {
    if (numerosUsados.has(n)) { bloquesQueChocan.push(id); continue; }
    out.bloques[id] = n;
    numerosUsados.add(n);
    out.sigBloque = Math.max(out.sigBloque, n);
    cambio = true;
  }
  for (const id of bloquesQueChocan) {
    out.sigBloque += 1;
    out.bloques[id] = out.sigBloque;
    cambio = true;
  }

  /* Líneas: el número de bloque del código entrante se traduce por su id (el
     bloque pudo cambiar de número arriba). Mismo orden: libres, después choques. */
  const idPorNumero = new Map(Object.entries(entrante.bloques).map(([id, n]) => [n, id]));
  const usados = new Set(Object.values(out.lineas));
  const lineasNuevas = Object.entries(entrante.lineas)
    .filter(([clave]) => !out.lineas[clave])
    .sort((a, b) => compararCodigos(a[1], b[1]));
  const lineasQueChocan: [string, string][] = [];
  for (const [clave, codigo] of lineasNuevas) {
    const p = partesCodigo(codigo);
    const id = p ? idPorNumero.get(p[0]) : undefined;
    const nb = id != null ? out.bloques[id] : undefined;
    if (!p || id == null || nb == null) continue; // huérfana: `asignarCodigos` le da uno al dibujar
    const propio = formatoCodigo(nb, p[1]);
    if (usados.has(propio)) { lineasQueChocan.push([clave, id]); continue; }
    out.lineas[clave] = propio;
    usados.add(propio);
    out.sigLinea[id] = Math.max(out.sigLinea[id] ?? 0, p[1]);
    cambio = true;
  }
  for (const [clave, id] of lineasQueChocan) {
    const k = (out.sigLinea[id] ?? 0) + 1;
    out.sigLinea[id] = k;
    out.lineas[clave] = formatoCodigo(out.bloques[id]!, k);
    cambio = true;
  }
  return cambio ? out : base;
}
