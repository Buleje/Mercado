/**
 * ADR-504 · ¿Qué guía es? ¿Qué troza es? — la identidad por PERMISO.
 *
 * Pedido de Brandon (19-10-2026): «permiso 1 GTF 4 / permiso 2 GTF 4 (dos
 * talonarios)… permiso 1 código 12 / permiso 2 código 12… sólo diferenciará
 * según el número de permiso que se ponga». El N° de guía solo NO identifica
 * la guía, y el código pintado solo NO identifica la troza:
 *
 *   guía  = N° (tramo a tramo, `claveNumeroGtf`) + permiso (`contratoId`)
 *   troza = código (`upper(btrim(..))`, como el índice ADR-436) + permiso
 *
 * Sin permiso (`contratoId` null) se escribe «∅» en la clave. Las reglas que
 * DECIDEN con esa identidad viven acá, puras (sin prisma), para que importar
 * y pantalla digan lo mismo:
 *
 *   - `decidirGuiaAlImportar`: misma / otra / asignar-permiso / crear-con-aviso / ambigua.
 *   - La PLATA (pagos, abonos, cubicaciones, fletes) sigue por N° con freno
 *     estricto: la parte «por permiso» está en pausa (ADR-504, Brandon 19-10;
 *     parche en `.claude/autonomo/adr-504-plata-pausada.patch`).
 *   - `resolverGuiaEntre`: lectura de una `GuiaRef` (la usa `GtfNumeroDB.resolverGuia`).
 *   - `chocanTrozas` / `decidirTrozasDelArchivo`: el choque de códigos y las
 *     filas repetidas dentro de un mismo archivo.
 *
 * NUNCA «la primera de la lista»: cuando no se sabe, «ambigua» (409
 * `GUIA_AMBIGUA` con las candidatas) o «varias».
 *
 * NO importar nada de `lib/db/*` ni `@/lib/prisma` acá.
 */
import { claveNumeroGtf, mismoNumeroGtf } from "./gtf-talonario";
import { claveEspecie } from "./loth-constants";
import { elegirGuiaDelDueno, mismoDuenoDeGuia, mismoPermiso, type IdentidadDeGuiaBuscada } from "./loth-talonario";

/** Lo que se escribe en la clave cuando la guía o la troza no tiene permiso. */
export const SIN_PERMISO = "∅";

// ── Guía ─────────────────────────────────────────────────────────────────────

/** Una guía por su identidad: N° + permiso (null = sin permiso). */
export interface GuiaRef {
  gtfNumber: string;
  contratoId: string | null;
}

/**
 * La LLAVE de una guía: `claveNumeroGtf(N°) | contratoId ?? "∅"`.
 * `019-001-0000004` y `19-001-4` del mismo permiso dan la misma llave; el
 * mismo N° en otro permiso es OTRA guía (otro talonario). Un N° sin tramos
 * legibles se compara por su texto sin bordes, como `GtfNumeroDB.bloquear`.
 */
export function claveDeGuiaRef(ref: GuiaRef): string {
  const numero = claveNumeroGtf(ref.gtfNumber) ?? (ref.gtfNumber ?? "").trim();
  return `${numero}|${ref.contratoId ?? SIN_PERMISO}`;
}

/** ¿Es la misma guía? Mismo N° (tramo a tramo) y mismo permiso (los dos sin permiso cuentan como iguales). */
export function mismaGuiaRef(a: GuiaRef, b: GuiaRef): boolean {
  return claveDeGuiaRef(a) === claveDeGuiaRef(b);
}

/**
 * Un ingreso del libro (una fila de `WoodEntry`: una especie de una guía),
 * como lo necesitan las reglas. Una guía con dos especies son dos ingresos con
 * la misma llave.
 */
export interface IngresoDeGuia {
  id: string;
  gtfNumber: string;
  contratoId: string | null;
  /** El permiso tal como está escrito (`WoodEntry.originCode`). */
  originCode: string | null;
  /** El titular (`WoodEntry.providerName`). */
  titular: string | null;
  especies: readonly string[];
  libroNro?: number | null;
  /**
   * ¿Tiene plata ligada (cubicación, abono, pago)? Lo llena quien la sabe
   * (carril de plata); sin el dato, `false`.
   */
  tienePlata?: boolean;
}

/** Una guía del libro: los ingresos que comparten la llave (`claveDeGuiaRef`). */
export interface GuiaResuelta {
  clave: string;
  gtfNumber: string;
  contratoId: string | null;
  /** El permiso escrito del primer ingreso (para mostrar en «elige el permiso»). */
  permiso: string | null;
  titular: string | null;
  ingresoIds: string[];
  libroNros: (number | null)[];
  especies: string[];
  tienePlata: boolean;
}

/** Junta los ingresos por llave, en el orden en que vinieron. */
export function agruparPorGuia(ingresos: readonly IngresoDeGuia[]): GuiaResuelta[] {
  const porClave = new Map<string, GuiaResuelta>();
  for (const i of ingresos) {
    const clave = claveDeGuiaRef(i);
    let g = porClave.get(clave);
    if (!g) {
      g = {
        clave,
        gtfNumber: i.gtfNumber,
        contratoId: i.contratoId,
        permiso: limpio(i.originCode),
        titular: limpio(i.titular),
        ingresoIds: [],
        libroNros: [],
        especies: [],
        tienePlata: false,
      };
      porClave.set(clave, g);
    }
    g.ingresoIds.push(i.id);
    if (i.libroNro !== undefined) g.libroNros.push(i.libroNro);
    for (const e of i.especies) if (limpio(e) && !g.especies.some((x) => claveEspecie(x) === claveEspecie(e))) g.especies.push(e.trim());
    g.permiso ??= limpio(i.originCode);
    g.titular ??= limpio(i.titular);
    g.tienePlata ||= Boolean(i.tienePlata);
  }
  return [...porClave.values()];
}

export type ResolucionDeGuia =
  | { estado: "una"; guia: GuiaResuelta }
  | { estado: "ninguna" }
  /** Dos o más guías con ese N° y la ref no dice cuál: 409 `GUIA_AMBIGUA`. */
  | { estado: "ambigua"; candidatas: GuiaResuelta[] };

/**
 * ¿Qué guía es esta ref? Entre los ingresos VIVOS (el llamador ya los filtró
 * por estado), los del mismo N° tramo a tramo:
 *
 * - **con permiso**: sólo los de ese permiso. Una guía SIN permiso con el mismo
 *   N° no es ésta (ponerle el permiso lo decide el import,
 *   `decidirGuiaAlImportar`, no una lectura).
 * - **sin permiso** («no lo dice»): primero las guías sin permiso (la del
 *   dueño, `elegirGuiaDelDueno`; de dos dueños = «ambigua»); si no hay, las
 *   con permiso que no contradicen la `identidad`: el permiso escrito elige
 *   una, una sola es ésa, dos o más = «ambigua». Nunca la primera.
 *
 * `identidad` (titular / permiso escrito) descarta las que la contradicen
 * pero el TITULAR no elige entre dos permisos: un titular puede tener dos
 * talonarios (el caso de Brandon).
 */
export function resolverGuiaEntre(
  ref: GuiaRef,
  ingresos: readonly IngresoDeGuia[],
  identidad?: IdentidadDeGuiaBuscada | null,
): ResolucionDeGuia {
  const delNumero = ingresos.filter((i) => mismoNumeroGtf(i.gtfNumber, ref.gtfNumber));
  if (ref.contratoId != null) {
    const guias = agruparPorGuia(delNumero.filter((i) => i.contratoId === ref.contratoId));
    return guias.length === 0 ? { estado: "ninguna" } : { estado: "una", guia: guias[0] };
  }
  return elegirSinSaberElPermiso(delNumero, identidad ?? null);
}

function elegirSinSaberElPermiso(delNumero: readonly IngresoDeGuia[], buscada: IdentidadDeGuiaBuscada | null): ResolucionDeGuia {
  const sinPermiso = delNumero.filter((i) => i.contratoId == null);
  if (sinPermiso.length > 0) {
    const eleccion = elegirGuiaDelDueno(sinPermiso, buscada, dueDe);
    if (eleccion.estado === "una") return { estado: "una", guia: agruparPorGuia(delMismoDueno(sinPermiso, eleccion.guia))[0] };
    if (eleccion.estado === "ambigua") return { estado: "ambigua", candidatas: guiasPorDueno(eleccion.candidatas) };
  }
  const guias = agruparPorGuia(delNumero.filter((i) => i.contratoId != null)).filter((g) => !contradiceAlDueno(g, buscada));
  if (guias.length === 0) return { estado: "ninguna" };
  const porTexto = limpio(buscada?.permiso) ? guias.filter((g) => mismoPermiso(g.permiso, buscada?.permiso)) : [];
  if (porTexto.length === 1) return { estado: "una", guia: porTexto[0] };
  if (guias.length === 1) return { estado: "una", guia: guias[0] };
  return { estado: "ambigua", candidatas: porTexto.length > 1 ? porTexto : guias };
}

// ── Decisión del IMPORT ─────────────────────────────────────────────────────

/** La guía que trae el archivo. */
export interface GuiaQueLlega {
  gtfNumber: string;
  /** El permiso elegido para el archivo (ADR-503) o el de la fila ya resuelto. */
  contratoId: string | null;
  /**
   * El permiso escrito en la fila; si la fila no lo trae y el archivo tiene
   * permiso elegido, el código de ese contrato (sin él no se ve si la guía sin
   * permiso que ya está dice OTRO permiso).
   */
  permiso?: string | null;
  titular?: string | null;
  especies?: readonly string[];
}

export type DecisionGuiaAlImportar =
  /** Es una guía que ya está (misma llave, o la única que puede ser). `ids` = sus ingresos. */
  | { estado: "misma"; id: string; ids: string[] }
  /** No hay guía con ese N° que pueda ser ésta: se crea. */
  | { estado: "otra" }
  /**
   * La guía ya estaba SIN permiso, es la única con ese N° y nada la contradice:
   * se le pone el permiso a sus ingresos (`ids`) en vez de duplicarla.
   * `conPlata`: tiene plata ligada (sólo para el aviso: la plata sigue por N°, ADR-504 plata en pausa).
   */
  | { estado: "asignar-permiso"; id: string; ids: string[]; conPlata: boolean }
  /**
   * Hay una guía SIN permiso con ese N° pero algo la contradice (otro permiso
   * escrito, otro titular, otras especies, o no es la única): se crea aparte y
   * la fila lo dice (`aviso`). `posible` = el ingreso que podría ser la misma.
   */
  | { estado: "crear-con-aviso"; posible: string; aviso: string; conPlata: boolean }
  /** Llega sin permiso y hay 2+ guías con ese N°: NO se escribe — «elige el permiso del archivo». */
  | { estado: "ambigua"; candidatas: GuiaResuelta[] };

/**
 * Qué hacer con una guía del archivo frente a las del libro con su N°.
 * `existentes` son ingresos VIVOS (el llamador ya los trajo por la cola del
 * N°); acá se comparan tramo a tramo (`mismoNumeroGtf`).
 *
 * Llega CON permiso P:
 *   1. hay guía con llave N|P → `misma`;
 *   2. no hay guías sin permiso con ese N° → `otra` (las de otros permisos son
 *      otro talonario);
 *   3. hay guía sin permiso → `asignar-permiso` sólo si es la única guía con
 *      ese N°, su permiso escrito y su titular no contradicen y sus especies
 *      coinciden (una contiene a la otra); si no, `crear-con-aviso`.
 *
 * Llega SIN permiso:
 *   1. guías sin permiso: la del dueño (`elegirGuiaDelDueno`) → `misma`; dos
 *      de dueños distintos → `ambigua`;
 *   2. guías con permiso que no la contradicen: el permiso escrito elige una;
 *      si no, una sola → `misma`, dos o más → `ambigua` (el titular NO elige:
 *      el mismo titular puede tener dos talonarios);
 *   3. ninguna → `otra`.
 */
export function decidirGuiaAlImportar(llega: GuiaQueLlega, existentes: readonly IngresoDeGuia[]): DecisionGuiaAlImportar {
  const delNumero = existentes.filter((i) => mismoNumeroGtf(i.gtfNumber, llega.gtfNumber));
  if (delNumero.length === 0) return { estado: "otra" };
  const buscada: IdentidadDeGuiaBuscada = { titular: llega.titular ?? null, permiso: llega.permiso ?? null };
  const sinPermiso = delNumero.filter((i) => i.contratoId == null);
  const conPermiso = delNumero.filter((i) => i.contratoId != null);

  if (llega.contratoId != null) {
    const exacta = agruparPorGuia(conPermiso.filter((i) => i.contratoId === llega.contratoId));
    if (exacta.length > 0) return { estado: "misma", id: exacta[0].ingresoIds[0], ids: exacta[0].ingresoIds };
    if (sinPermiso.length === 0) return { estado: "otra" };
    return asignarOAvisar(llega, buscada, sinPermiso, agruparPorGuia(conPermiso));
  }

  const r = elegirSinSaberElPermiso(delNumero, buscada);
  if (r.estado === "una") return { estado: "misma", id: r.guia.ingresoIds[0], ids: r.guia.ingresoIds };
  return r.estado === "ambigua" ? r : { estado: "otra" };
}

function asignarOAvisar(
  llega: GuiaQueLlega,
  buscada: IdentidadDeGuiaBuscada,
  sinPermiso: readonly IngresoDeGuia[],
  otrosPermisos: readonly GuiaResuelta[],
): DecisionGuiaAlImportar {
  const n = llega.gtfNumber.trim();
  const eleccion = elegirGuiaDelDueno(sinPermiso, buscada, dueDe);
  const posibleIngreso = eleccion.estado === "una" ? eleccion.guia : sinPermiso[0];
  const delDueno = delMismoDueno(sinPermiso, posibleIngreso);
  const guia = agruparPorGuia(delDueno)[0];
  /** Ingresos sin permiso de OTRO titular: entonces la del dueño no es «la única guía con ese N°». */
  const deOtroTitular = sinPermiso.filter((i) => !delDueno.includes(i));
  const conPlata = sinPermiso.some((i) => i.tienePlata);
  const plata = conPlata ? " Esa guía tiene plata ligada: la plata sigue por N° de guía, revísala antes de pagar ésta." : "";
  const avisar = (por: string): DecisionGuiaAlImportar => ({
    estado: "crear-con-aviso",
    posible: posibleIngreso.id,
    aviso: `Ya hay una guía N° ${n} sin permiso ${por}: se creó aparte. Revisa si es la misma y, si lo es, ponle el permiso a la que ya estaba.${plata}`,
    conPlata,
  });

  if (eleccion.estado === "ambigua") return avisar(`de más de un titular (${titularesDe(eleccion.candidatas)})`);
  if (eleccion.estado === "ninguna") return avisar(`de otro titular y otro permiso (${guia.titular ?? guia.permiso ?? "sin datos"})`);
  if (deOtroTitular.length > 0) return avisar(`de más de un titular (${titularesDe(sinPermiso)})`);
  if (otrosPermisos.length > 0) {
    return avisar(`y otras con ese N° en otros permisos (${otrosPermisos.map((g) => g.permiso ?? "sin código").join(", ")}): no se adivina cuál es`);
  }
  if (limpio(guia.permiso) && limpio(llega.permiso) && !mismoPermiso(guia.permiso, llega.permiso)) {
    return avisar(`que dice otro permiso («${guia.permiso}», no «${llega.permiso?.trim()}»)`);
  }
  if (mismoDuenoDeGuia(dueDeGuia(guia), buscada) === false) return avisar(`de otro titular («${guia.titular}»)`);
  if (!especiesCoinciden(guia.especies, llega.especies ?? [])) {
    return avisar(`con otras especies (${guia.especies.join(", ")}; el archivo trae ${(llega.especies ?? []).join(", ")})`);
  }
  return { estado: "asignar-permiso", id: guia.ingresoIds[0], ids: guia.ingresoIds, conPlata };
}

/**
 * ¿Las especies pueden ser de la misma guía? Sí si un lado no dice ninguna o
 * si una lista contiene a la otra (una guía a medio cargar tiene menos
 * especies que el archivo, o al revés). Disjuntas o cruzadas = otra madera.
 */
export function especiesCoinciden(a: readonly string[], b: readonly string[]): boolean {
  const ka = new Set(a.map(claveEspecie).filter(Boolean));
  const kb = new Set(b.map(claveEspecie).filter(Boolean));
  if (ka.size === 0 || kb.size === 0) return true;
  const contiene = (x: Set<string>, y: Set<string>) => [...y].every((k) => x.has(k));
  return contiene(ka, kb) || contiene(kb, ka);
}

// ── 409 GUIA_AMBIGUA ─────────────────────────────────────────────────────────

/** El texto del 409: qué permisos tienen ese N° y qué hacer. */
export function mensajeGuiaAmbigua(gtfNumber: string, candidatas: readonly { permiso?: string | null; titular?: string | null }[]): string {
  const cuales = candidatas.map((c) => limpio(c.permiso) ?? (limpio(c.titular) ? `sin permiso (${c.titular?.trim()})` : "sin permiso")).join(" · ");
  return `La guía N° ${gtfNumber.trim()} está en ${candidatas.length} permisos (${cuales}). Elige el permiso del archivo para saber cuál es.`;
}

/** Ambigüedad de guía → 409 con `error: "GUIA_AMBIGUA"` y las candidatas. */
export class GuiaAmbiguaError<C = GuiaResuelta> extends Error {
  readonly codigo = "GUIA_AMBIGUA" as const;
  constructor(
    readonly gtfNumber: string,
    readonly candidatas: C[],
    message: string,
  ) {
    super(message);
    this.name = "GuiaAmbiguaError";
  }
}

// ── Troza ────────────────────────────────────────────────────────────────────

/**
 * La LLAVE de una troza: el código como lo compara el índice ADR-436
 * (`upper(btrim(...))`) + el permiso. `null` = sin código (no ocupa número).
 * Vale para el código de planta (lo que mira el índice) y para la
 * codificación de la guía cuando se compara dentro de un permiso.
 */
export function claveDeTroza(codigoPlanta: string | null | undefined, contratoId: string | null): string | null {
  const c = normalizarCodigoTroza(codigoPlanta);
  return c ? `${c}|${contratoId ?? SIN_PERMISO}` : null;
}

/** El código como lo compara el índice: sin bordes y en mayúsculas. `null` = sin código. */
export function normalizarCodigoTroza(codigo: string | null | undefined): string | null {
  const c = (codigo ?? "").trim().toUpperCase();
  return c ? c : null;
}

/** Una pieza con su código y su permiso. */
export interface CodigoDeTroza {
  codigo: string | null | undefined;
  contratoId: string | null;
}

/**
 * ¿Pueden ser dos piezas distintas con ese código? NO (chocan) si es el mismo
 * código y: el mismo permiso (es la misma marca en el mismo talonario), o a
 * uno de los dos le falta el permiso (no se sabe de cuál es: la regla de
 * hoy). Permiso 1 «12» y permiso 2 «12» NO chocan.
 *
 * El índice nuevo (tenant, código, COALESCE(contratoId, '')) sólo ataja
 * P–P y ∅–∅; el choque P–∅ lo ataja esta regla en la app.
 */
export function chocanTrozas(a: CodigoDeTroza, b: CodigoDeTroza): boolean {
  const ca = normalizarCodigoTroza(a.codigo);
  if (!ca || ca !== normalizarCodigoTroza(b.codigo)) return false;
  return a.contratoId == null || b.contratoId == null || a.contratoId === b.contratoId;
}

/** Una fila de troza del archivo. */
export interface FilaDeTroza extends CodigoDeTroza {
  /** N° de fila del archivo (para los avisos). */
  fila: number;
  /**
   * Lo que hace «idénticas» a dos filas además del código (especie, medidas,
   * volumen…), ya normalizado por el llamador. Sin firma, mismo código y
   * permiso = idénticas.
   */
  firma?: string | null;
}

/** Una troza que ya está en el libro. */
export interface TrozaEnBase extends CodigoDeTroza {
  id: string;
}

export type DecisionTrozaDeArchivo =
  /**
   * Entra. `identicas` = las otras filas del archivo con el mismo código,
   * permiso y firma (aviso «filas N y M idénticas»). `codigoOcupado`: el
   * código ya lo tiene una troza de la base o una fila anterior que entra — el
   * índice no deja dos con el mismo código de planta en el mismo permiso, así
   * que el carril de importar NO repite ese código de planta en esta.
   */
  | { estado: "entra"; fila: number; identicas: number[]; codigoOcupado: boolean; aviso: string | null }
  /** Re-subida: esa troza ya está en el libro (misma llave). */
  | { estado: "ya-estaba"; fila: number; trozaId: string; aviso: string }
  /** No puede entrar con ese código: chocaría con otra pieza. */
  | {
      estado: "choca";
      fila: number;
      con: { trozaId: string; contratoId: string | null } | { fila: number; contratoId: string | null };
      aviso: string;
    };

/**
 * Las filas de trozas de UN archivo contra el libro:
 *
 * 1. Misma llave que una troza de la base → `ya-estaba` (re-subida). Por
 *    CONTEO: si el archivo trae dos filas iguales y la base tiene una (subida
 *    antes de ADR-504, que descartaba la 2.ª), la 1.ª es «ya estaba» y la 2.ª
 *    entra.
 * 2. Mismo código en la base con permiso de un lado y sin permiso del otro → `choca`.
 * 3. Dentro del archivo: mismo código y permiso con la misma firma → entran
 *    todas con aviso «filas N y M idénticas» (Brandon: «que se importe todo»);
 *    con otra firma → `choca` (dos piezas con la misma marca). Código sin
 *    permiso contra el mismo código con permiso en otra fila → `choca`.
 * 4. Si no, `entra`.
 *
 * Filas sin código entran siempre (no ocupan número).
 */
export function decidirTrozasDelArchivo(
  filas: readonly FilaDeTroza[],
  enBase: readonly TrozaEnBase[],
): DecisionTrozaDeArchivo[] {
  const libresPorClave = new Map<string, TrozaEnBase[]>();
  for (const t of enBase) {
    const k = claveDeTroza(t.codigo, t.contratoId);
    if (k) libresPorClave.set(k, [...(libresPorClave.get(k) ?? []), t]);
  }
  const ocupadasEnBase = new Set(libresPorClave.keys());
  const firma = (f: FilaDeTroza) => (f.firma ?? "").trim();
  const grupo = new Map<string, FilaDeTroza[]>();
  for (const f of filas) {
    const k = claveDeTroza(f.codigo, f.contratoId);
    if (k) grupo.set(k, [...(grupo.get(k) ?? []), f]);
  }
  const entraron: FilaDeTroza[] = [];
  const out: DecisionTrozaDeArchivo[] = [];

  for (const f of filas) {
    const k = claveDeTroza(f.codigo, f.contratoId);
    const codigo = normalizarCodigoTroza(f.codigo);
    if (!k || !codigo) {
      out.push({ estado: "entra", fila: f.fila, identicas: [], codigoOcupado: false, aviso: null });
      continue;
    }
    const libre = libresPorClave.get(k);
    if (libre && libre.length > 0) {
      const t = libre.shift() as TrozaEnBase;
      out.push({ estado: "ya-estaba", fila: f.fila, trozaId: t.id, aviso: `La troza ${codigo} ya estaba en el libro.` });
      continue;
    }
    const enBaseChoca = enBase.find((t) => t.contratoId !== f.contratoId && chocanTrozas(t, f));
    if (enBaseChoca) {
      out.push({
        estado: "choca",
        fila: f.fila,
        con: { trozaId: enBaseChoca.id, contratoId: enBaseChoca.contratoId },
        aviso: `La troza ${codigo} ya está en el libro ${enBaseChoca.contratoId == null ? "sin permiso" : "con un permiso"} y esta fila ${f.contratoId == null ? "no dice el permiso" : "trae otro"}: no se sabe si es la misma pieza.`,
      });
      continue;
    }
    const previa = entraron.find((e) => chocanTrozas(e, f) && (e.contratoId !== f.contratoId || firma(e) !== firma(f)));
    if (previa) {
      out.push({
        estado: "choca",
        fila: f.fila,
        con: { fila: previa.fila, contratoId: previa.contratoId },
        aviso:
          previa.contratoId !== f.contratoId
            ? `La troza ${codigo} está en la fila ${previa.fila} y en ésta, una de las dos sin permiso: no se sabe si es la misma pieza.`
            : `La troza ${codigo} está en la fila ${previa.fila} y en ésta con datos distintos: dos piezas no pueden llevar la misma marca.`,
      });
      continue;
    }
    const identicas = (grupo.get(k) ?? []).filter((o) => o !== f && firma(o) === firma(f)).map((o) => o.fila);
    const codigoOcupado = ocupadasEnBase.has(k) || entraron.some((e) => claveDeTroza(e.codigo, e.contratoId) === k);
    entraron.push(f);
    out.push({
      estado: "entra",
      fila: f.fila,
      identicas,
      codigoOcupado,
      aviso: identicas.length > 0 ? `Filas ${enLista([f.fila, ...identicas].sort((a, b) => a - b))} idénticas (troza ${codigo}).` : null,
    });
  }
  return out;
}

// ── Búsqueda de una troza por código (contrato de `WoodEntriesDB.buscarTrozaPorCodigo`) ──

/** Dónde buscar un código: sólo un permiso (null = sólo sin permiso) o sólo unos ingresos. */
export interface AmbitoDeTroza {
  contratoId?: string | null;
  woodEntryIds?: string[];
}

export type BusquedaDeTroza<T> =
  | { estado: "una"; troza: T }
  | { estado: "ninguna" }
  /** Dos o más piezas con ese código en el ámbito: NUNCA la primera. */
  | { estado: "varias"; trozas: T[] };

/** Lo que devuelve la base → la respuesta del contrato. */
export function busquedaDeTroza<T>(filas: readonly T[]): BusquedaDeTroza<T> {
  if (filas.length === 0) return { estado: "ninguna" };
  if (filas.length === 1) return { estado: "una", troza: filas[0] };
  return { estado: "varias", trozas: [...filas] };
}

// ── auxiliares ───────────────────────────────────────────────────────────────

function limpio(s: string | null | undefined): string | null {
  const t = (s ?? "").trim();
  return t ? t : null;
}

const dueDe = (i: IngresoDeGuia): IdentidadDeGuiaBuscada => ({ titular: i.titular, permiso: i.originCode });
const dueDeGuia = (g: GuiaResuelta): IdentidadDeGuiaBuscada => ({ titular: g.titular, permiso: g.permiso });

/** ¿La guía contradice al dueño buscado? Permiso escrito distinto, u otro titular Y otro permiso. */
function contradiceAlDueno(g: GuiaResuelta, buscada: IdentidadDeGuiaBuscada | null | undefined): boolean {
  if (!buscada) return false;
  if (limpio(g.permiso) && limpio(buscada.permiso) && !mismoPermiso(g.permiso, buscada.permiso)) return true;
  return mismoDuenoDeGuia(dueDeGuia(g), buscada) === false;
}

/** Los ingresos que son del mismo dueño que `uno` (o que no se puede saber). */
function delMismoDueno(ingresos: readonly IngresoDeGuia[], uno: IngresoDeGuia): IngresoDeGuia[] {
  return ingresos.filter((i) => i === uno || mismoDuenoDeGuia(dueDe(i), dueDe(uno)) !== false);
}

/** Agrupa ingresos sin permiso por dueño, para mostrarlos como candidatas. */
function guiasPorDueno(ingresos: readonly IngresoDeGuia[]): GuiaResuelta[] {
  const out: GuiaResuelta[] = [];
  const usados = new Set<IngresoDeGuia>();
  for (const i of ingresos) {
    if (usados.has(i)) continue;
    const grupo = ingresos.filter((o) => !usados.has(o) && (o === i || mismoDuenoDeGuia(dueDe(o), dueDe(i)) === true));
    grupo.forEach((o) => usados.add(o));
    out.push(...agruparPorGuia(grupo));
  }
  return out;
}

function titularesDe(ingresos: readonly IngresoDeGuia[]): string {
  return [...new Set(ingresos.map((i) => limpio(i.titular) ?? "sin titular"))].join(", ");
}

function enLista(nums: readonly number[]): string {
  return nums.length <= 1 ? nums.join("") : `${nums.slice(0, -1).join(", ")} y ${nums[nums.length - 1]}`;
}
