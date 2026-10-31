/**
 * El lote del Cubicador de madera (aserrada, PT) a la cuenta de una persona.
 *
 * No hay un segundo camino de plata (ADR-483 D11): el lote se guarda en el
 * Cubicador (KV) y la cubicación comercial lo referencia por `cubicacionRefId`;
 * el SERVIDOR copia sus piezas, re-cubica el PT con `cubicarPiezasComercial`,
 * valoriza y descuenta del adelanto (ADR-478/484). Esto es lo que la pantalla
 * necesita para previsualizar con LAS MISMAS funciones y para no duplicar:
 *
 *   - `piezasDeMaderaParaCuenta`: las piezas tal como el servidor las va a
 *     leer del registro guardado (`piezasDelRegistro`): sin especie → la del
 *     lote → «Sin especie».
 *   - `vistaPreviaMadera`: el PT neto que va a congelar el servidor, o la
 *     primera pieza que el Zod del servidor rechazaría (antes del 422).
 *   - `preciosSugeridosMadera`: el precio por PT que el cubicador ya muestra
 *     (a mano, por especie o el trato de cada cliente) como punto de partida
 *     de «Valorizar»: una especie con dos precios distintos queda marcada y
 *     hay que elegirle el suyo (`valorizarConSugeridos`: el general no la cubre).
 *     Si el precio cambia SÓLO por el tipo (Brandon 28-10), arranca con el
 *     ponderado exacto: volumen × él = lo que cobra el cubicador.
 *   - `queHacerAlGuardar`: guardar dos veces el MISMO lote no crea otra
 *     cubicación — actualiza la que sigue en borrador; si ya se cobró en ese
 *     sentido, se frena acá (y el servidor igual responde 409
 *     `REF_YA_VALORIZADA` al aplicar).
 */
import { claveEspecie } from "./loth-constants";
import { cubicarPieza, type PiezaCubicada } from "./cubicacion";
import { ORDEN_TIPO, tipoDePieza, type TipoComercial } from "./cubicacion-tipo";
import { cubicarPiezasComercial, DescuentoInvalidoError } from "./cubicacion-comercial";
import { piezaComercialSchema, type OrigenCubicacion, type PiezaComercialEntrada } from "./cubicacion-comercial-tipos";
import { EspecieConVariosPreciosError, FaltaPrecioError, valorizar, type AplicarCubicacionInput, type LineaEspecie } from "./cubicacion-cuenta";

const SIN_ESPECIE = "Sin especie";

/** La especie con la que se cobra una pieza: la suya, la del lote o «Sin especie» (igual que el servidor). */
export function especieDeLaPieza(p: Pick<PiezaCubicada, "especie">, especieDelLote?: string | null): string {
  return p.especie?.trim() || especieDelLote?.trim() || SIN_ESPECIE;
}

/** Las piezas del lote como entrada comercial (sin validar: eso es `vistaPreviaMadera`). */
export function piezasDeMaderaParaCuenta(rows: readonly PiezaCubicada[], especieDelLote?: string | null): PiezaComercialEntrada[] {
  return rows.map((p) => ({
    especie: especieDeLaPieza(p, especieDelLote),
    cantidad: p.cantidad,
    espesor: p.espesor,
    ancho: p.ancho,
    largo: p.largo,
    uEspesor: p.uEspesor,
    uAncho: p.uAncho,
    uLargo: p.uLargo,
  }));
}

export type VistaPreviaMadera =
  | { ok: true; pt: number; piezas: number; lineas: LineaEspecie[] }
  | { ok: false; pieza: number; mensaje: string };

/**
 * El PT que va a congelar el servidor. Cada pieza pasa por el MISMO Zod que
 * usa el servidor al copiar el registro: la primera que no sirve se nombra
 * por su número (como el 422 `MEDIDA_FUERA_DE_RANGO`).
 */
export function vistaPreviaMadera(rows: readonly PiezaCubicada[], especieDelLote?: string | null): VistaPreviaMadera {
  const entrada = piezasDeMaderaParaCuenta(rows, especieDelLote);
  const validas: PiezaComercialEntrada[] = [];
  for (let i = 0; i < entrada.length; i++) {
    const r = piezaComercialSchema.safeParse(entrada[i]);
    if (!r.success) {
      return { ok: false, pieza: i + 1, mensaje: `La pieza ${i + 1} tiene una medida que no sirve (${r.error.issues[0]?.message ?? "revísala"}).` };
    }
    validas.push(r.data);
  }
  if (!validas.length) return { ok: false, pieza: 0, mensaje: "El lote no tiene piezas." };
  try {
    const c = cubicarPiezasComercial(validas, null);
    return { ok: true, pt: c.neto, piezas: c.piezas.reduce((t, p) => t + p.cantidad, 0), lineas: c.lineas };
  } catch (e) {
    return { ok: false, pieza: 0, mensaje: e instanceof DescuentoInvalidoError ? e.message : "No se pudo cubicar el lote." };
  }
}

export interface PreciosSugeridos {
  /** S/ por PT para las especies sin precio propio (el «precio general» del cubicador). */
  general: number | null;
  /**
   * Por clave de especie (`claveEspecie`): si TODAS sus piezas tienen el mismo
   * precio, ese; si el precio cambia SÓLO por el tipo (`porTipo`), el
   * ponderado exacto, sin redondear.
   */
  porEspecie: Record<string, number>;
  /**
   * Las especies con más de un precio en el lote (tratos de dos clientes, o
   * unas piezas con precio y otras sin): no se sugiere ninguno y el general
   * NUNCA las cubre — hay que elegir el de esta cuenta. Un promedio sería un
   * derivado, no el trato.
   */
  variosPrecios: Record<string, EspecieConVariosPrecios>;
  /**
   * Las especies cuyo precio cambia SÓLO por el tipo (Brandon 28-10: Corta a
   * S/ 3, Comercial a S/ 4): mismo dueño (o ninguno) y misma escritura en
   * todas sus piezas, un precio por tipo y ninguna sin precio. Ahí el
   * ponderado Σ(PT × precio) / Σ PT no es un promedio inventado: volumen × él
   * = lo que cobra el cubicador. Igual quedan marcadas (`marcasDeVariosPrecios`):
   * el general nunca las cubre.
   */
  porTipo?: Record<string, EspeciePorTipo>;
}

export interface EspeciePorTipo {
  nombre: string;
  /** Σ(PT × precio) / Σ PT, sin redondear: redondearlo corre el monto (400 PT × 0,005 = S/ 2). */
  precio: number;
  /** Cada tipo con su PT y su precio, en el orden de `ORDEN_TIPO`. */
  tipos: Array<{ tipo: TipoComercial; pt: number; precio: number }>;
}

export interface EspecieConVariosPrecios {
  nombre: string;
  /** Los precios distintos (S/ por PT, al céntimo), de menor a mayor. */
  precios: number[];
  /** Además, piezas de esta especie sin precio en el cubicador. */
  sinPrecio: boolean;
}

/**
 * Lo que el cubicador ya cobra por PT, para arrancar «Valorizar» con eso. El
 * monto lo vuelve a calcular el servidor con los precios que se confirmen.
 */
export function preciosSugeridosMadera(
  rows: readonly PiezaCubicada[],
  especieDelLote: string | null | undefined,
  precioDe: (p: PiezaCubicada) => number,
  general: number,
): PreciosSugeridos {
  type PorTipo = { precios: Set<number>; pt: number; importe: number };
  const vistos = new Map<string, {
    nombre: string; precios: Set<number>; sinPrecio: boolean;
    /* Lo que además de la especie cambia el precio de una pieza (`precioDePieza`): su dueño y cómo se escribió. */
    duenos: Set<string>; escrituras: Set<string>; tipos: Map<TipoComercial, PorTipo>; ptMal: boolean;
  }>();
  for (const p of rows) {
    const nombre = especieDeLaPieza(p, especieDelLote);
    const clave = claveEspecie(nombre) || "sin especie";
    const precio = precioDe(p);
    const v = vistos.get(clave) ?? { nombre, precios: new Set<number>(), sinPrecio: false, duenos: new Set<string>(), escrituras: new Set<string>(), tipos: new Map(), ptMal: false };
    v.duenos.add(p.duenoParteId?.trim() || (p.dueno?.trim() ? `texto:${p.dueno.trim().toLowerCase()}` : ""));
    v.escrituras.add(p.especie?.trim().toLowerCase() ?? "");
    if (Number.isFinite(precio) && precio > 0) {
      v.precios.add(Math.round(precio * 100) / 100);
      /* El PT con que el servidor arma la línea (`piezaNeta` → `cubicarPieza`), no el guardado en la fila. */
      const pt = cubicarPieza(p).pieTablar;
      if (!(Number.isFinite(pt) && pt >= 0)) v.ptMal = true;
      const tipo = tipoDePieza(p);
      const t = v.tipos.get(tipo) ?? { precios: new Set<number>(), pt: 0, importe: 0 };
      t.precios.add(Math.round(precio * 100) / 100);
      t.pt += pt;
      t.importe += pt * precio;
      v.tipos.set(tipo, t);
    } else v.sinPrecio = true;
    vistos.set(clave, v);
  }
  const porEspecie: Record<string, number> = {};
  const variosPrecios: Record<string, EspecieConVariosPrecios> = {};
  const porTipo: Record<string, EspeciePorTipo> = {};
  for (const [clave, v] of vistos) {
    const precios = [...v.precios].sort((a, b) => a - b);
    const tipos = [...v.tipos.entries()].sort(([a], [b]) => ORDEN_TIPO.indexOf(a) - ORDEN_TIPO.indexOf(b));
    const pt = tipos.reduce((s, [, t]) => s + t.pt, 0);
    const soloPorTipo = precios.length > 1 && !v.sinPrecio && !v.ptMal && v.duenos.size === 1 && v.escrituras.size === 1 &&
      tipos.every(([, t]) => t.precios.size === 1) && pt > 0;
    if (precios.length === 1 && !v.sinPrecio) porEspecie[clave] = precios[0];
    else if (soloPorTipo) {
      const precio = tipos.reduce((s, [, t]) => s + t.importe, 0) / pt;
      porEspecie[clave] = precio;
      porTipo[clave] = { nombre: v.nombre, precio, tipos: tipos.map(([tipo, t]) => ({ tipo, pt: Math.round(t.pt * 100) / 100, precio: [...t.precios][0] })) };
    } else if (precios.length > 0) variosPrecios[clave] = { nombre: v.nombre, precios, sinPrecio: v.sinPrecio };
  }
  return { general: Number.isFinite(general) && general > 0 ? general : null, porEspecie, variosPrecios, porTipo };
}

/** Decimales para escribir un precio: 2; el ponderado que no cierra al céntimo, 4 (el monto sale del exacto). */
export const decimalesDelPrecio = (precio: number): 2 | 4 => (Math.abs(precio * 100 - Math.round(precio * 100)) < 1e-6 ? 2 : 4);

/** Cómo arranca el campo de precio de una especie sugerida: «3.75», o «3.7333» si es un ponderado que no cierra. */
export const textoDelPrecio = (precio: number): string => precio.toFixed(decimalesDelPrecio(precio));

/**
 * El ponderado EXACTO mientras el campo siga diciendo lo sugerido: el campo
 * muestra «3.7333» pero cobrar 3,7333 en vez de 3,7333… corre el monto. Si se
 * cambió el texto, `null` (vale lo escrito).
 */
export function precioExactoDelCampo(clave: string, texto: string, sugeridos: PreciosSugeridos | null | undefined): number | null {
  const t = sugeridos?.porTipo?.[clave];
  return t && texto.trim() === textoDelPrecio(t.precio) ? t.precio : null;
}

/**
 * El ponderado vale sólo para el PT con que se calculó. Si la línea del
 * borrador no tiene ese PT (se agregó madera sin volver a guardar: 3,43 × el
 * volumen viejo no es lo del cubicador) o la especie viene sin su precio
 * sugerido (despacho), no hay promedio: pide elegir, como la de dos tratos.
 */
export function conPonderadoVigente(
  sugeridos: PreciosSugeridos | null | undefined,
  brutas: ReadonlyArray<Pick<LineaEspecie, "clave" | "volumen">>,
): PreciosSugeridos | null | undefined {
  if (!sugeridos?.porTipo) return sugeridos;
  const volumen = new Map(brutas.map((l) => [l.clave, l.volumen]));
  const vencidos = Object.entries(sugeridos.porTipo).filter(([clave, t]) =>
    sugeridos.porEspecie[clave] !== t.precio || Math.abs(t.tipos.reduce((s, x) => s + x.pt, 0) - (volumen.get(clave) ?? 0)) > 0.005);
  if (vencidos.length === 0) return sugeridos;
  const porTipo = { ...sugeridos.porTipo };
  const porEspecie = { ...sugeridos.porEspecie };
  const variosPrecios = { ...sugeridos.variosPrecios };
  for (const [clave, t] of vencidos) {
    delete porTipo[clave];
    delete porEspecie[clave];
    variosPrecios[clave] = { nombre: t.nombre, precios: [...new Set(t.tipos.map((x) => x.precio))].sort((a, b) => a - b), sinPrecio: false };
  }
  return { ...sugeridos, porEspecie, variosPrecios, porTipo };
}

export type VistaValorizada =
  | { monto: number; porEspecie: LineaEspecie[] }
  | { falta: string }
  | { elegir: string };

/**
 * Las especies con más de un precio, como las pide el servidor
 * (`especiesConVariosPrecios`). También las de precio por tipo: el general no
 * las cubre (cobraría Tornillo entero a un solo precio); necesitan el suyo.
 */
export function marcasDeVariosPrecios(sugeridos: PreciosSugeridos | null | undefined): Array<{ clave: string; cuantos: number }> {
  return [
    ...Object.entries(sugeridos?.variosPrecios ?? {}).map(([clave, v]) => ({ clave, cuantos: v.precios.length + (v.sinPrecio ? 1 : 0) })),
    ...Object.entries(sugeridos?.porTipo ?? {}).map(([clave, t]) => ({ clave, cuantos: new Set(t.tipos.map((x) => x.precio)).size })),
  ];
}

/**
 * «Valorizar» con lo que sugirió el cubicador: la MISMA `valorizar` del
 * servidor con las especies marcadas — una con varios precios en el lote
 * necesita SU precio; sin él no hay monto, aunque haya precio general.
 */
export function valorizarConSugeridos(
  lineas: readonly LineaEspecie[],
  propios: ReadonlyArray<{ clave: string; precio: number }>,
  precioGeneral: number | null,
  sugeridos: PreciosSugeridos | null | undefined,
): VistaValorizada {
  try {
    return valorizar(lineas, propios, precioGeneral, marcasDeVariosPrecios(sugeridos));
  } catch (e) {
    if (e instanceof EspecieConVariosPreciosError) return { elegir: e.especie };
    return { falta: e instanceof FaltaPrecioError ? e.especie : "una especie" };
  }
}

/**
 * Los precios del cuerpo de «aplicar». Las marcas viajan siempre (el servidor
 * rechaza con 422 `ESPECIE_CON_DOS_PRECIOS` una marcada sin precio propio) y
 * el general sólo va si no quedaría cubriendo a ninguna marcada.
 */
export function preciosParaAplicar(
  lineas: readonly LineaEspecie[],
  propios: ReadonlyArray<{ clave: string; precio: number }>,
  precioGeneral: number | null,
  sugeridos: PreciosSugeridos | null | undefined,
): Pick<AplicarCubicacionInput, "precios" | "precioGeneral" | "especiesConVariosPrecios"> {
  const marcas = marcasDeVariosPrecios(sugeridos);
  const conPropio = new Set(propios.filter((p) => p.precio > 0).map((p) => p.clave));
  const cubririaMarcada = lineas.some((l) => l.volumen > 0 && !conPropio.has(l.clave) && marcas.some((m) => m.clave === l.clave));
  return {
    precios: [...propios],
    ...(precioGeneral != null && !cubririaMarcada ? { precioGeneral } : {}),
    ...(marcas.length > 0 ? { especiesConVariosPrecios: marcas } : {}),
  };
}

/**
 * ¿El lote de la pantalla ya no es el que se guardó en el borrador? El PT y
 * las piezas que congeló el servidor contra la vista previa de ahora: cobrar
 * sin actualizar cobraría las medidas viejas.
 */
export function loteCambio(vista: VistaPreviaMadera, cub: { volumen: number; nTrozas: number }): boolean {
  return !vista.ok || Math.abs(vista.pt - cub.volumen) > 0.005 || vista.piezas !== cub.nTrozas;
}

/** Los dueños distintos del lote (columna «Dueño»): todas sus piezas van a UNA persona. */
export function duenosDelLote(rows: readonly PiezaCubicada[]): string[] {
  const vistos = new Map<string, string>();
  for (const p of rows) {
    const nombre = p.dueno?.trim();
    if (nombre && !vistos.has(nombre.toLowerCase())) vistos.set(nombre.toLowerCase(), nombre);
  }
  return [...vistos.values()];
}

const normalizar = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * La persona que el lote ya nombra, para no buscarla otra vez: el dueño con
 * ficha del Directorio (todas las piezas con dueño, del mismo) o el «cliente»
 * / el único dueño escrito IGUAL que su nombre en la cuenta. Con dos personas
 * del mismo nombre no adivina: se elige a mano.
 */
export function personaSugerida<P extends { nombre: string; parteId: string | null }>(
  personas: readonly P[],
  rows: readonly PiezaCubicada[],
  cliente?: string | null,
): P | null {
  const partes = new Set(rows.flatMap((p) => (p.duenoParteId?.trim() ? [p.duenoParteId.trim()] : [])));
  if (partes.size === 1) {
    const [id] = partes;
    const p = personas.find((x) => x.parteId === id);
    if (p) return p;
  }
  const duenos = duenosDelLote(rows);
  for (const texto of [cliente ?? "", duenos.length === 1 ? duenos[0] : ""]) {
    const t = normalizar(texto);
    if (!t) continue;
    const iguales = personas.filter((x) => normalizar(x.nombre) === t);
    if (iguales.length === 1) return iguales[0];
  }
  return null;
}

/**
 * La persona de la cuenta que es el COMPRADOR (Brandon 28-10, «Subir a la
 * cuenta de él»): su ficha del Directorio o, si se escribió a mano, el único
 * con ese nombre. A diferencia de `personaSugerida`, el dueño de las piezas no
 * cuenta: acá se pidió al que compra.
 */
export function personaDelComprador<P extends { nombre: string; parteId: string | null }>(
  personas: readonly P[],
  comprador: { parteId?: string | null; nombre: string },
): P | null {
  const id = comprador.parteId?.trim();
  if (id) {
    const p = personas.find((x) => x.parteId === id);
    if (p) return p;
  }
  const t = normalizar(comprador.nombre);
  if (!t) return null;
  const iguales = personas.filter((x) => normalizar(x.nombre) === t);
  return iguales.length === 1 ? iguales[0] : null;
}

/** Lo mínimo de una cubicación comercial ya hecha de este lote. */
export interface CubicacionDelLote {
  id: string;
  codigo: string;
  estado: "borrador" | "aplicada" | "anulada";
  sentido: "compra" | "venta";
  version: number;
  monto: number | null;
  personaNombre: string | null;
  cubicacionRefId?: string | null;
  /** «libre» = guardada desde el cubicador; «despacho» = la del modal del despacho (otro camino). */
  origen?: OrigenCubicacion | null;
}

/** Guardada desde el cubicador (la única que esta pantalla puede actualizar). */
export const esDelCubicador = (c: Pick<CubicacionDelLote, "origen">) => (c.origen ?? "libre") === "libre";

const AVANCE: Record<CubicacionDelLote["estado"], number> = { borrador: 0, aplicada: 1, anulada: 2 };

/**
 * Las cubicaciones de ESTE lote: las del servidor (filtradas por `refId`,
 * por si la lista todavía es la del lote anterior) más las que esta pantalla
 * acaba de guardar, aplicar o anular y la lista aún no trae. Gana la versión
 * más nueva; `null` = todavía cargando (no se decide nada con eso).
 */
export function mezclarDelLote<C extends CubicacionDelLote>(
  servidor: readonly C[] | null,
  locales: readonly C[],
  borradas: ReadonlySet<string>,
  refId: string | null,
): C[] | null {
  if (!refId) return [];
  if (servidor === null) return null;
  const propia = (c: C) => c.cubicacionRefId === refId && !borradas.has(c.id);
  const local = new Map(locales.filter(propia).map((c) => [c.id, c]));
  /* Aplicar y anular NO suben `version` (sólo editar): con la misma versión
     manda el estado más avanzado, que sólo va borrador → aplicada → anulada.
     Si no, lo local «borrador» tapaba la que otra pestaña ya descontó. */
  const masNueva = (l: C, c: C) =>
    l.version !== c.version ? l.version > c.version : AVANCE[l.estado] >= AVANCE[c.estado];
  const vistas = servidor.filter(propia).map((c) => {
    const l = local.get(c.id);
    return l && masNueva(l, c) ? l : c;
  });
  const soloLocales = [...local.values()].filter((l) => !servidor.some((c) => c.id === l.id));
  return [...soloLocales, ...vistas];
}

/** La que se muestra como «la de este lote»: la más nueva que no está anulada. */
export function cubicacionVigente<C extends CubicacionDelLote>(delLote: readonly C[] | null): C | null {
  return delLote?.find((c) => c.estado !== "anulada") ?? null;
}

export type AccionAlGuardar =
  | { tipo: "nueva" }
  | { tipo: "actualizar"; cub: CubicacionDelLote }
  | { tipo: "cobrada"; cub: CubicacionDelLote }
  | { tipo: "despacho"; cub: CubicacionDelLote };

/**
 * Guardar el lote a la cuenta, idempotente por lote y sentido: guardar otra
 * vez actualiza la MISMA cubicación en borrador. El doble clic lo frena el
 * botón (deshabilitado mientras envía) y la red que corta, la lista que se
 * vuelve a pedir tras cualquier falla: si el servidor alcanzó a guardarla, la
 * trae y esto da «actualizar». Sólo se actualiza la guardada desde el
 * cubicador (`origen: "libre"`); la del despacho es otro camino (el servidor
 * respondería 409 `ORIGEN_DISTINTO`): se avisa y se abre allá. Si ya se cobró
 * en ese sentido, se frena: cobrarla otra vez es pagar el mismo lote dos veces
 * (anúlala primero). Comprar el lote y después venderlo sigue valiendo.
 */
export function queHacerAlGuardar(delLote: readonly CubicacionDelLote[], sentido: "compra" | "venta"): AccionAlGuardar {
  const mismas = delLote.filter((c) => c.sentido === sentido && c.estado !== "anulada");
  const cobrada = mismas.find((c) => c.estado === "aplicada");
  if (cobrada) return { tipo: "cobrada", cub: cobrada };
  const borradores = mismas.filter((c) => c.estado === "borrador");
  const propio = borradores.find(esDelCubicador);
  if (propio) return { tipo: "actualizar", cub: propio };
  return borradores[0] ? { tipo: "despacho", cub: borradores[0] } : { tipo: "nueva" };
}
