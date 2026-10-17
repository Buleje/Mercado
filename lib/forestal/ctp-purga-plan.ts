/**
 * QUÉ borra el vaciado del Libro de Operaciones, decidido sin tocar la base.
 *
 * `lib/db/forest-ctp-purga.db.ts` lee una foto del libro (`SnapshotLibro`)
 * dentro de la transacción y le pregunta a `planificarVaciado()` qué filas caen
 * y cuáles se salvan. Separarlo así permite probar cada regla con datos
 * armados a mano, que es la única forma honesta de probar una operación que no
 * se puede ensayar sobre el libro real.
 *
 * ## Varios alcances = la UNIÓN
 *
 * Cada alcance se evalúa contra la MISMA foto y se juntan los ids en conjuntos:
 * una corrida que cae en «Madera aserrada» y en «Consumos» se borra (y se
 * cuenta) una vez. Las trozas de un lote que se borra NO pasan a contar como
 * «del patio» para el alcance de trozas: vuelven al patio y quedan ahí.
 *
 * ## Lotes: la regla de las dependencias (Brandon 2026-10-02)
 *
 * Un lote es el hilo entre Consumos, Producción y Salidas, así que borrarlo
 * no puede dejar a nadie apuntando a la nada ni llevarse madera o producción
 * que la persona no marcó:
 *
 * | Lote | Qué cuelga | Qué pasa |
 * |---|---|---|
 * | De aserrío sin corrida viva (abierto, o su corrida se anuló) | sus trozas | El lote se borra; sus trozas quedan en el patio (`loteAserrioId`, y el `consumidaEnId` a una corrida muerta, en null). |
 * | De aserrío con corrida viva | la corrida y sus piezas | Se borra SÓLO si esa corrida también cae en este vaciado («Consumos», o «Madera aserrada» si declaró madera). Entonces la corrida se borra con sus consumos y sus piezas vuelven al patio. Si no, NO se borra y se dice por qué. |
 * | Cualquiera cuya corrida salió (despacho, aunque esté anulado) o se reprocesó | la guía de salida | NO se borra: eso sólo lo borra «Todo el libro». |
 * | Cualquiera cuya corrida es de un mes cerrado | el acta del mes | NO se borra (ver abajo). |
 * | Cualquiera cuya corrida tiene el consumo congelado (mes cerrado y reabierto) | el costo congelado | NO se borra. |
 * | Mixto (ADR-441) | sus trozas apartadas y sus lotes hijos | Se borra si todos sus lotes hijos se borran; sus trozas vuelven al patio. |
 * | Comercial (ADR-136) | sus miembros (corrida + cantidad) | Se borran el lote y sus miembros; las corridas NO. No se borra si está «despachado» o si alguna de sus corridas salió con una guía viva. |
 *
 * Y al revés: con «Lotes» marcado, una corrida deja de estar protegida por
 * los lotes que se borran en el mismo acto. Sin «Lotes», todo sigue como
 * antes: cualquier lote encima salva a la corrida.
 *
 * Un lote bloqueado no se toca EN NADA (ni se le sueltan las piezas): o se
 * borra entero con lo suyo, o queda como estaba.
 *
 * ## Meses cerrados: cada uno protege SÓLO lo suyo (Brandon 2026-10-02)
 *
 * Como en el resto del libro (ADR-139, `closedPeriodOf`), un mes cerrado no
 * frena el vaciado parcial: salva las filas fechadas en ese mes. La fecha de
 * cada fila la pone `leerSnapshot` en `mesCerrado` (el nombre del mes, o null):
 *
 * | Fila | Su fecha | Si es de un mes cerrado |
 * |---|---|---|
 * | Troza del patio | `entryDate` de su ingreso (GTF) | Se queda. |
 * | Corrida | `entryDate` | Se queda (protección `mes_cerrado`): el lote que la necesita queda bloqueado y dice «su corrida N° 12 es de mayo de 2026, un mes cerrado». |
 * | Lote de aserrío / mixto / comercial | `fechaApertura` / `abiertoEn` / `fechaInicio` (si falta, `createdAt`) | Bloqueado: «es de mayo de 2026, un mes cerrado». |
 *
 * Soltar al patio una troza cuyo ingreso es de un mes cerrado, porque cae su
 * lote o su corrida (de un mes abierto), SÍ se hace: no cambia ninguna línea
 * del mes cerrado — el ingreso queda igual y lo que se borra es de otro mes.
 * Lo que NO se suelta es el consumo de una corrida ANULADA de un mes cerrado
 * (`corridaMuertaDeMesCerrado`): ese consumo es del mes cerrado.
 * Por lo mismo, un lote hijo de un mes abierto puede caer aunque su lote mixto
 * sea de un mes cerrado (el mixto se queda; ya pasaba con un hermano bloqueado).
 *
 * «Todo el libro» no pasa por acá: borraría los meses cerrados, así que
 * cualquier mes cerrado lo frena entero (`forest-ctp-purga.db.ts`).
 */
import { z } from "zod";
import {
  ALCANCES_VACIADO,
  CLAVES_CONTEO_ESPERADO,
  type AlcanceParcial,
  type ConteoDelLibro,
  type ConteoEsperado,
  type ConteoPorAlcance,
  type LoteBloqueado,
  type SalvadoPorMesCerrado,
} from "./ctp-purga-tipos";
import { closedPeriodOf, monthKeyOf, type CtpCierrePeriodo } from "./ctp-cierre-types";

// ── Entrada ─────────────────────────────────────────────────────────────────

/**
 * Los alcances que manda el modal. Repetidos se juntan, el orden se normaliza
 * y «todo» no se combina: ya incluye lo demás, y un pedido que diga «todo y
 * además trozas» es ambiguo — sobre una operación que no se deshace, ambiguo
 * se rechaza.
 */
export const alcancesSchema = z
  .array(z.enum(ALCANCES_VACIADO))
  .min(1, { error: "Elige al menos una cosa para borrar." })
  .transform((xs) => ALCANCES_VACIADO.filter((a) => xs.includes(a)))
  .refine((xs) => !(xs.includes("todo") && xs.length > 1), {
    error: "«Todo el libro» ya incluye lo demás: no se combina con otras casillas.",
  });

/** `?scope=trozas_disponibles,lotes` o `?scope=a&scope=b` → validado. */
export function alcancesDeLaUrl(sp: URLSearchParams) {
  const crudos = sp
    .getAll("scope")
    .flatMap((s) => s.split(","))
    .map((s) => s.trim())
    .filter(Boolean);
  return alcancesSchema.safeParse(crudos);
}

const cifra = z.number().int().nonnegative();

/**
 * Lo que la vista previa MOSTRÓ, tal como vuelve del modal al confirmar. Es
 * obligatorio: sin él el servidor no puede saber si lo que va a borrar es lo
 * que la persona miró (el modal es el único cliente; no hay versiones viejas
 * que mantener).
 */
export const conteoEsperadoSchema = z.object(
  {
    ingresos: cifra,
    trozas: cifra,
    produccion: cifra,
    despachos: cifra,
    consumos: cifra,
    origenes: cifra,
    lotes: cifra,
    trozasAlPatio: cifra,
    total: cifra,
  },
  { error: "Falta lo que mostró la vista previa: vuelve a abrir el vaciado." },
) satisfies z.ZodType<ConteoEsperado>;

/** ¿El libro de ahora es el que la persona miró? Cifra por cifra. */
export function mismoConteo(ahora: ConteoDelLibro, esperado: ConteoEsperado): boolean {
  return CLAVES_CONTEO_ESPERADO.every((k) => ahora[k] === esperado[k]);
}

// ── Meses cerrados: qué mes es una fecha ───────────────────────────────────

/** Lima no tiene horario de verano: UTC−5 todo el año. */
const LIMA_MS = 5 * 60 * 60 * 1000;

/** "YYYY-MM" del calendario UTC de un instante. */
function mesUtc(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * El mes cerrado (sin reabrir) en que cae `fecha` PARA EL VACIADO, con su
 * nombre; null = ninguno. Protege de más a propósito: una fila es del mes
 * cerrado si CUALQUIERA de estas lecturas lo dice —
 *
 *  1. el instante cae entre `from` y `to` del cierre (`closedPeriodOf`, la
 *     regla del resto del libro);
 *  2. el mes calendario UTC de la fecha es el `periodKey` del cierre;
 *  3. el mes calendario de Lima (UTC−5) es el `periodKey` del cierre;
 *  4. el mes local del servidor que corre esto (`monthKeyOf`).
 *
 * Por qué no basta la 1: `from`/`to` los calculó `monthRange` con la hora del
 * servidor que CERRÓ el mes. Medido con el cierre real de `main`: `from` =
 * 2026-05-01T05:00Z (hora Lima), y un ingreso «del 1 de mayo» guardado como
 * date-only (00:00Z) quedaba ANTES del cierre → abierto → su troza se borraba.
 * Al revés, con un cierre hecho en UTC, un lote abierto el 31-may a las 21:00
 * de Lima (01:00Z de junio) quedaba fuera. Borrar una fila de un mes cerrado
 * no tiene vuelta; dejar una de más, sí (se borra a mano o reabriendo el mes).
 */
export function mesCerradoParaVaciar(cierres: readonly CtpCierrePeriodo[], fecha: Date | null | undefined): string | null {
  if (!fecha || Number.isNaN(fecha.getTime())) return null;
  const activos = cierres.filter((c) => !c.reabierto);
  if (activos.length === 0) return null;
  const nombre = (c: CtpCierrePeriodo) => c.label || c.periodKey;
  const porInstante = closedPeriodOf([...activos], fecha);
  if (porInstante) return nombre(porInstante);
  const claves = new Set([mesUtc(fecha), mesUtc(new Date(fecha.getTime() - LIMA_MS)), monthKeyOf(fecha)]);
  const porCalendario = activos.find((c) => claves.has(c.periodKey));
  return porCalendario ? nombre(porCalendario) : null;
}

// ── La foto del libro ───────────────────────────────────────────────────────

/**
 * El mes cerrado (sin reabrir) en que cae la fecha de la fila, con su nombre
 * («mayo de 2026»); null o ausente = mes abierto. Lo calcula `leerSnapshot`
 * con `mesCerradoParaVaciar`: el plan no ve fechas ni cierres, sólo este dato.
 */
type ConMes = { mesCerrado?: string | null };

/** Una línea del libro: corrida de producción o línea de despacho, viva o no. */
export type SnapCorrida = ConMes & {
  id: string;
  section: string;
  status: string;
  borrada: boolean;
  quantity: number;
  lineNo: number;
  gtfNumber: string | null;
};

/** `mesCerrado` = el del `entryDate` de su ingreso (GTF). */
export type SnapTroza = ConMes & {
  id: string;
  consumidaEnId: string | null;
  despachadaEnId: string | null;
  loteAserrioId: string | null;
  loteMixtoId: string | null;
  trozaOrigenId: string | null;
};

export type SnapLoteAserrio = ConMes & {
  id: string;
  code: string;
  status: string;
  produccionEntryId: string | null;
  loteMixtoId: string | null;
};

export type SnapLote = ConMes & { id: string; code: string; status: string };

export type SnapshotLibro = {
  /** TODAS las líneas del negocio (ambas secciones, vivas y anuladas). */
  corridas: SnapCorrida[];
  trozas: SnapTroza[];
  despachoOrigenes: { despachoEntryId: string; produccionEntryId: string }[];
  reprocesos: { origenEntryId: string; destinoEntryId: string }[];
  /** TODOS los miembros, también los de lotes comerciales ya dados de baja:
   *  la FK es `Restrict`, así que siguen frenando el borrado de su corrida. */
  loteMiembros: { loteId: string; produccionEntryId: string }[];
  consumos: { ctpEntryId: string; congelado: boolean }[];
  /** Sólo los VIVOS (`deletedAt: null`). */
  lotesAserrio: SnapLoteAserrio[];
  lotesMixtos: SnapLote[];
  lotesComerciales: SnapLote[];
};

// ── La salida ───────────────────────────────────────────────────────────────

export type PlanVaciado = {
  trozasABorrar: string[];
  corridasABorrar: string[];
  consumosABorrar: number;
  lotesAserrioABorrar: string[];
  lotesMixtosABorrar: string[];
  lotesComercialesABorrar: string[];
  miembrosABorrar: number;
  /** Trozas a las que se les suelta la corrida (`consumidaEnId`, `fechaConsumo`). */
  soltarConsumo: string[];
  /** Trozas a las que se les suelta el lote de aserrío. */
  soltarDeLote: string[];
  /** Trozas a las que se les suelta el lote mixto. */
  soltarDeMixto: string[];
  lotesBloqueados: LoteBloqueado[];
  conteo: ConteoDelLibro;
  porAlcance: ConteoPorAlcance;
};

// ── Reglas ──────────────────────────────────────────────────────────────────

/** Viva = existe, no se borró ni se anuló. Es el ESTADO lo que manda, no el id. */
function esViva(c: SnapCorrida | undefined): c is SnapCorrida {
  return c != null && !c.borrada && c.status !== "anulado";
}

/** Una corrida que los alcances de producción pueden borrar (como siempre). */
function esCorridaDelLibro(c: SnapCorrida): boolean {
  return c.section === "produccion" && !c.borrada && c.status === "registrado";
}

function etiquetaGuia(d: SnapCorrida | undefined): string {
  return d?.gtfNumber?.trim() || (d ? `N° ${d.lineNo}` : "sin número");
}

type Proteccion =
  | { tipo: "despacho"; guia: string; vivo: boolean }
  | { tipo: "reproceso" }
  | { tipo: "mes_cerrado"; periodo: string }
  | { tipo: "congelado" }
  | { tipo: "lote_comercial"; codigo: string | null }
  | { tipo: "lote_aserrio"; codigo: string }
  | { tipo: "trozas"; piezas: number };

/** Orden en que se elige el motivo para mostrar: lo que no tiene arreglo, primero.
 *  El mes cerrado va antes que el congelado: cerrar el mes congela sus
 *  consumos, y «es de mayo de 2026» dice más que «el consumo está congelado». */
const PRIORIDAD: Record<Proteccion["tipo"], number> = {
  despacho: 0,
  reproceso: 1,
  mes_cerrado: 2,
  congelado: 3,
  lote_comercial: 4,
  lote_aserrio: 5,
  trozas: 6,
};

function indexar(snap: SnapshotLibro) {
  const agrupar = <T>(xs: T[], clave: (x: T) => string | null) => {
    const m = new Map<string, T[]>();
    for (const x of xs) {
      const k = clave(x);
      if (!k) continue;
      const l = m.get(k);
      if (l) l.push(x);
      else m.set(k, [x]);
    }
    return m;
  };
  return {
    corrida: new Map(snap.corridas.map((c) => [c.id, c])),
    aserrio: new Map(snap.lotesAserrio.map((l) => [l.id, l])),
    comercial: new Map(snap.lotesComerciales.map((l) => [l.id, l])),
    despachosDe: agrupar(snap.despachoOrigenes, (o) => o.produccionEntryId),
    reprocesadas: new Set(snap.reprocesos.flatMap((r) => [r.origenEntryId, r.destinoEntryId])),
    congeladas: new Set(snap.consumos.filter((c) => c.congelado).map((c) => c.ctpEntryId)),
    consumosDe: agrupar(snap.consumos, (c) => c.ctpEntryId),
    miembrosDe: agrupar(snap.loteMiembros, (m) => m.produccionEntryId),
    miembrosDelLote: agrupar(snap.loteMiembros, (m) => m.loteId),
    lotesAserrioDe: agrupar(snap.lotesAserrio, (l) => l.produccionEntryId),
    hijosDelMixto: agrupar(snap.lotesAserrio, (l) => l.loteMixtoId),
    trozasConsumidasEn: agrupar(snap.trozas, (t) => t.consumidaEnId),
    trozasDelLote: agrupar(snap.trozas, (t) => t.loteAserrioId),
    madres: new Set(snap.trozas.map((t) => t.trozaOrigenId).filter((x): x is string => Boolean(x))),
  };
}
type Indice = ReturnType<typeof indexar>;

/**
 * Una troza «del patio» para el vaciado: nunca tocó la sierra ni un camión, no
 * es una madre con pedazos de retrozado y NADIE la apartó — ni en un lote de
 * aserrío (ADR-334) ni en un lote mixto (ADR-441). Las dos relaciones son
 * `SetNull`: sin este filtro el lote quedaba vacío en silencio.
 */
function esTrozaDelPatio(t: SnapTroza, ix: Indice): boolean {
  return (
    !t.consumidaEnId && !t.despachadaEnId && !t.loteAserrioId && !t.loteMixtoId && !ix.madres.has(t.id)
  );
}

/**
 * Lo que salva a una corrida. `A`/`K` = lotes de aserrío / comerciales que se
 * borran en este mismo vaciado: ésos ya no la protegen.
 */
function protecciones(c: SnapCorrida, ix: Indice, A: ReadonlySet<string>, K: ReadonlySet<string>): Proteccion[] {
  const p: Proteccion[] = [];
  for (const o of ix.despachosDe.get(c.id) ?? []) {
    const d = ix.corrida.get(o.despachoEntryId);
    p.push({ tipo: "despacho", guia: etiquetaGuia(d), vivo: esViva(d) });
  }
  if (ix.reprocesadas.has(c.id)) p.push({ tipo: "reproceso" });
  if (c.mesCerrado) p.push({ tipo: "mes_cerrado", periodo: c.mesCerrado });
  if (ix.congeladas.has(c.id)) p.push({ tipo: "congelado" });
  for (const m of ix.miembrosDe.get(c.id) ?? []) {
    if (!K.has(m.loteId)) p.push({ tipo: "lote_comercial", codigo: ix.comercial.get(m.loteId)?.code ?? null });
  }
  for (const l of ix.lotesAserrioDe.get(c.id) ?? []) {
    if (!A.has(l.id)) p.push({ tipo: "lote_aserrio", codigo: l.code });
  }
  /* Las piezas consumidas en ella: su relación es `SetNull`, así que borrar la
     corrida sin soltarlas deja una pieza «consumida por nadie». Sólo dejan de
     proteger si TODAS son de lotes que se borran ahora: ésas se sueltan. */
  const fuera = (ix.trozasConsumidasEn.get(c.id) ?? []).filter(
    (t) => !(t.loteAserrioId && A.has(t.loteAserrioId)),
  );
  const deOtroLote = fuera.find((t) => t.loteAserrioId && ix.aserrio.has(t.loteAserrioId));
  if (deOtroLote?.loteAserrioId) {
    p.push({ tipo: "lote_aserrio", codigo: ix.aserrio.get(deOtroLote.loteAserrioId)?.code ?? "?" });
  } else if (fuera.length > 0) {
    p.push({ tipo: "trozas", piezas: fuera.length });
  }
  return p.sort((a, b) => PRIORIDAD[a.tipo] - PRIORIDAD[b.tipo]);
}

const NINGUNO: ReadonlySet<string> = new Set();

/**
 * Las corridas que caen con estos lotes. `salvadas` = las que algo encima
 * protege; `deMesCerrado` = los meses (uno por corrida) de las que se quedan
 * por ser de un mes cerrado — ésas no cuentan en `salvadas`.
 */
function corridasQueCaen(
  snap: SnapshotLibro,
  ix: Indice,
  A: ReadonlySet<string>,
  K: ReadonlySet<string>,
  alc: { madera: boolean; consumo: boolean },
): { ids: Set<string>; salvadas: number; deLotes: number; deMesCerrado: string[] } {
  const ids = new Set<string>();
  let salvadas = 0;
  let deLotes = 0;
  const deMesCerrado: string[] = [];
  if (!alc.madera && !alc.consumo) return { ids, salvadas, deLotes, deMesCerrado };
  for (const c of snap.corridas) {
    if (!esCorridaDelLibro(c)) continue;
    const enDominio = alc.consumo || (alc.madera && c.quantity > 0);
    if (!enDominio) continue;
    if (protecciones(c, ix, A, K).length === 0) {
      ids.add(c.id);
      if ((A.size > 0 || K.size > 0) && protecciones(c, ix, NINGUNO, NINGUNO).length > 0) deLotes++;
    } else if (c.mesCerrado) {
      deMesCerrado.push(c.mesCerrado);
    } else {
      salvadas++;
    }
  }
  return { ids, salvadas, deLotes, deMesCerrado };
}

/** Las corridas VIVAS que un lote de aserrío tiene atadas: la que declara y las de sus piezas. */
function corridasVivasDelLote(l: SnapLoteAserrio, ix: Indice): SnapCorrida[] {
  const ids = new Set<string>();
  if (l.produccionEntryId) ids.add(l.produccionEntryId);
  for (const t of ix.trozasDelLote.get(l.id) ?? []) if (t.consumidaEnId) ids.add(t.consumidaEnId);
  return [...ids].map((id) => ix.corrida.get(id)).filter(esViva).sort((a, b) => a.lineNo - b.lineNo);
}

/**
 * Una corrida ANULADA de un mes cerrado que todavía figura como la que
 * consumió una pieza del lote. Borrar el lote soltaría esa pieza (le vacía
 * `consumidaEnId` y `fechaConsumo`), y ese consumo es una línea del mes
 * cerrado: el lote queda bloqueado (security 2026-10-02). Reabierto el mes,
 * se suelta como cualquier consumo muerto.
 */
function corridaMuertaDeMesCerrado(l: SnapLoteAserrio, ix: Indice): SnapCorrida | undefined {
  for (const t of ix.trozasDelLote.get(l.id) ?? []) {
    const c = t.consumidaEnId ? ix.corrida.get(t.consumidaEnId) : undefined;
    if (c?.mesCerrado && !esViva(c)) return c;
  }
  return undefined;
}

function textoProteccion(p: Proteccion, n: number): string {
  switch (p.tipo) {
    case "despacho":
      return p.vivo
        ? `su madera ya salió con la guía ${p.guia} (corrida N° ${n}). Sólo «Todo el libro» la borra.`
        : `la guía anulada ${p.guia} todavía cita su corrida N° ${n}. Sólo «Todo el libro» la borra.`;
    case "reproceso":
      return `su corrida N° ${n} se reprocesó en otra corrida. Sólo «Todo el libro» la borra.`;
    case "mes_cerrado":
      return `su corrida N° ${n} es de ${p.periodo}, un mes cerrado.`;
    case "congelado":
      return `su corrida N° ${n} es de un mes que ya se cerró (el consumo está congelado).`;
    case "lote_comercial":
      return p.codigo
        ? `su corrida N° ${n} está en el lote comercial ${p.codigo}, que no se puede borrar.`
        : `su corrida N° ${n} todavía figura en un lote comercial dado de baja.`;
    case "lote_aserrio":
      return `su corrida N° ${n} también es del lote ${p.codigo}, que no se puede borrar.`;
    case "trozas":
      return `su corrida N° ${n} también consumió ${p.piezas} troza${p.piezas === 1 ? "" : "s"} de fuera de este lote.`;
  }
}

/**
 * Por qué una corrida traba a su lote, con su peso: entre todas las corridas
 * de un lote se muestra el motivo más duro (una guía emitida antes que «marca
 * también Consumos»), porque es el que de verdad decide. `null` = sin motivo
 * propio (la traba viene de otra corrida del mismo lote).
 */
function motivoCorrida(
  c: SnapCorrida,
  ix: Indice,
  A: ReadonlySet<string>,
  K: ReadonlySet<string>,
  alc: { madera: boolean; consumo: boolean },
): { peso: number; texto: string } | null {
  if (!esCorridaDelLibro(c)) {
    return { peso: 0, texto: `su corrida N° ${c.lineNo} sigue en el libro y no se puede borrar desde acá.` };
  }
  const p = protecciones(c, ix, A, K)[0];
  if (p) return { peso: PRIORIDAD[p.tipo], texto: textoProteccion(p, c.lineNo) };
  if (!alc.madera && !alc.consumo) {
    return {
      peso: 9,
      texto: `se aserró en la corrida N° ${c.lineNo}: marca también «Consumos» para borrarla junto con el lote.`,
    };
  }
  if (!alc.consumo && c.quantity <= 0) {
    return {
      peso: 9,
      texto: `su corrida N° ${c.lineNo} no declaró madera: marca «Consumos» para borrarla junto con el lote.`,
    };
  }
  return null;
}

function motivoComercial(l: SnapLote, ix: Indice): string | null {
  if (l.status === "despachado") return "ya se despachó: es parte de una venta.";
  for (const m of ix.miembrosDelLote.get(l.id) ?? []) {
    const c = ix.corrida.get(m.produccionEntryId);
    if (!esViva(c)) continue;
    for (const o of ix.despachosDe.get(c.id) ?? []) {
      const d = ix.corrida.get(o.despachoEntryId);
      if (esViva(d)) return `su corrida N° ${c.lineNo} ya salió con la guía ${etiquetaGuia(d)}.`;
    }
  }
  return null;
}

// ── El plan ─────────────────────────────────────────────────────────────────

export function planificarVaciado(snap: SnapshotLibro, alcances: readonly AlcanceParcial[]): PlanVaciado {
  const quiere = (a: AlcanceParcial) => alcances.includes(a);
  const alc = { madera: quiere("madera_disponible"), consumo: quiere("consumo") };
  const enLotes = quiere("lotes");
  const ix = indexar(snap);

  /* Lo que se queda por ser de un mes cerrado: un mes por fila salvada. */
  const mesesDe = { trozas: [] as string[], lotes: [] as string[] };

  const trozasABorrar: string[] = [];
  if (quiere("trozas_disponibles")) {
    for (const t of snap.trozas) {
      if (!esTrozaDelPatio(t, ix)) continue;
      if (t.mesCerrado) mesesDe.trozas.push(t.mesCerrado);
      else trozasABorrar.push(t.id);
    }
  }

  /* Un lote abierto/armado en un mes cerrado es una línea de ese mes. */
  const bloqueados: LoteBloqueado[] = [];
  const bloquearPorMes = (l: SnapLote, tipo: LoteBloqueado["tipo"]): boolean => {
    if (!l.mesCerrado) return false;
    mesesDe.lotes.push(l.mesCerrado);
    bloqueados.push({ id: l.id, codigo: l.code, tipo, motivo: `es de ${l.mesCerrado}, un mes cerrado.` });
    return true;
  };

  /* Comerciales: su bloqueo no depende de qué corridas caen. Uno de un mes
     abierto SÍ se borra aunque un miembro sea una corrida de un mes cerrado
     (decisión 2026-10-02): se va la fila del miembro, que es del lote; la
     corrida no cambia —igual que soltar al patio una troza de un ingreso
     cerrado—. */
  const K = new Set<string>();
  if (enLotes) {
    for (const l of snap.lotesComerciales) {
      if (bloquearPorMes(l, "comercial")) continue;
      const motivo = motivoComercial(l, ix);
      if (motivo) bloqueados.push({ id: l.id, codigo: l.code, tipo: "comercial", motivo });
      else K.add(l.id);
    }
  }

  /* De aserrío: punto fijo. Se arranca suponiendo que caen todos (menos los de
     un mes cerrado); un lote con una corrida viva que NO cae sale del
     conjunto, lo que puede volver a proteger otra corrida (compartida con ese
     lote), y así hasta que nada cambia. El conjunto sólo achica: termina. */
  let A = new Set<string>(
    enLotes ? snap.lotesAserrio.filter((l) => !l.mesCerrado && !corridaMuertaDeMesCerrado(l, ix)).map((l) => l.id) : [],
  );
  let C = corridasQueCaen(snap, ix, A, K, alc);
  for (;;) {
    const siguiente = new Set(
      [...A].filter((id) => {
        const l = ix.aserrio.get(id);
        return l != null && corridasVivasDelLote(l, ix).every((c) => C.ids.has(c.id));
      }),
    );
    if (siguiente.size === A.size) break;
    A = siguiente;
    C = corridasQueCaen(snap, ix, A, K, alc);
  }

  if (enLotes) {
    for (const l of snap.lotesAserrio) {
      if (A.has(l.id) || bloquearPorMes(l, "aserrio")) continue;
      const muerta = corridaMuertaDeMesCerrado(l, ix);
      if (muerta) {
        bloqueados.push({
          id: l.id,
          codigo: l.code,
          tipo: "aserrio",
          motivo: `sus trozas figuran consumidas en la corrida anulada N° ${muerta.lineNo}, de ${muerta.mesCerrado}, un mes cerrado.`,
        });
        continue;
      }
      const conEste = new Set([...A, l.id]);
      const fuera = corridasVivasDelLote(l, ix).filter((c) => !C.ids.has(c.id));
      const motivo =
        fuera
          .map((c) => motivoCorrida(c, ix, conEste, K, alc))
          .filter((m): m is { peso: number; texto: string } => m != null)
          .sort((x, y) => x.peso - y.peso)[0]?.texto ?? "comparte una corrida con otro lote que no se puede borrar.";
      bloqueados.push({ id: l.id, codigo: l.code, tipo: "aserrio", motivo });
    }
  }

  /* Mixtos: caen si caen todos sus lotes hijos (uno repartido sin hijos vivos,
     uno abierto o uno anulado, caen siempre). */
  const M = new Set<string>();
  if (enLotes) {
    for (const m of snap.lotesMixtos) {
      if (bloquearPorMes(m, "mixto")) continue;
      const hijoQueQueda = (ix.hijosDelMixto.get(m.id) ?? []).find((h) => !A.has(h.id));
      if (hijoQueQueda) {
        bloqueados.push({
          id: m.id,
          codigo: m.code,
          tipo: "mixto",
          motivo: `su lote ${hijoQueQueda.code} no se puede borrar.`,
        });
      } else {
        M.add(m.id);
      }
    }
  }

  /* Las piezas que vuelven al patio. Nunca se borran por arrastre. */
  const soltarConsumo: string[] = [];
  const soltarDeLote: string[] = [];
  const soltarDeMixto: string[] = [];
  for (const t of snap.trozas) {
    const deLoteQueCae = t.loteAserrioId != null && A.has(t.loteAserrioId);
    if (deLoteQueCae) soltarDeLote.push(t.id);
    if (t.loteMixtoId != null && M.has(t.loteMixtoId)) soltarDeMixto.push(t.id);
    if (
      t.consumidaEnId &&
      (C.ids.has(t.consumidaEnId) || (deLoteQueCae && !esViva(ix.corrida.get(t.consumidaEnId))))
    ) {
      soltarConsumo.push(t.id);
    }
  }
  const trozasAlPatio = new Set([...soltarConsumo, ...soltarDeLote, ...soltarDeMixto]).size;

  const corridasABorrar = [...C.ids];
  const consumosDe = (ids: Iterable<string>) => {
    let n = 0;
    for (const id of ids) n += ix.consumosDe.get(id)?.length ?? 0;
    return n;
  };
  const consumosABorrar = consumosDe(corridasABorrar);
  const miembrosABorrar = [...K].reduce((n, id) => n + (ix.miembrosDelLote.get(id)?.length ?? 0), 0);
  const lotes = A.size + M.size + K.size;

  const porAlcance: ConteoPorAlcance = {};
  if (quiere("trozas_disponibles")) porAlcance.trozas_disponibles = { trozas: trozasABorrar.length };
  if (alc.madera) {
    const conMadera = corridasABorrar.filter((id) => (ix.corrida.get(id)?.quantity ?? 0) > 0);
    porAlcance.madera_disponible = { corridas: conMadera.length, consumos: consumosDe(conMadera) };
  }
  if (alc.consumo) {
    porAlcance.consumo = { corridas: corridasABorrar.length, consumos: consumosABorrar, deLotes: C.deLotes };
  }
  if (enLotes) {
    porAlcance.lotes = {
      aserrio: A.size,
      mixtos: M.size,
      comerciales: K.size,
      trozasAlPatio,
      bloqueados: bloqueados.length,
    };
  }

  const meses = [...mesesDe.trozas, ...C.deMesCerrado, ...mesesDe.lotes];
  const deMesCerrado: SalvadoPorMesCerrado | null =
    meses.length > 0
      ? {
          trozas: mesesDe.trozas.length,
          corridas: C.deMesCerrado.length,
          lotes: mesesDe.lotes.length,
          meses: [...new Set(meses)],
        }
      : null;

  const tipoOrden = { aserrio: 0, mixto: 1, comercial: 2 } as const;
  bloqueados.sort((a, b) => tipoOrden[a.tipo] - tipoOrden[b.tipo] || a.codigo.localeCompare(b.codigo));

  return {
    trozasABorrar,
    corridasABorrar,
    consumosABorrar,
    lotesAserrioABorrar: [...A],
    lotesMixtosABorrar: [...M],
    lotesComercialesABorrar: [...K],
    miembrosABorrar,
    soltarConsumo,
    soltarDeLote,
    soltarDeMixto,
    lotesBloqueados: bloqueados,
    porAlcance,
    conteo: {
      ingresos: 0,
      trozas: trozasABorrar.length,
      produccion: corridasABorrar.length,
      despachos: 0,
      consumos: consumosABorrar,
      origenes: 0,
      lotes,
      trozasAlPatio,
      total: trozasABorrar.length + corridasABorrar.length + lotes,
      ...(alc.madera || alc.consumo ? { saltadas: C.salvadas } : {}),
      ...(deMesCerrado ? { deMesCerrado } : {}),
    },
  };
}
