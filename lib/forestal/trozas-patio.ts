/**
 * trozas-patio — el estado de cada PIEZA del patio.
 *
 * Consumos habla en metros cúbicos por guía: cuánta madera de qué GTF entró a
 * qué corrida. Esta lectura es la otra mitad y la que el patio necesita todos
 * los días: **la troza como unidad**. Cuál está libre, cuál está apartada para
 * un lote, cuál ya se fue a la sierra, cuál salió entera sin aserrar, cuál se
 * partió en pedazos y cuál nunca bajó del camión.
 *
 * El orden en que se decide el estado NO es cosmético: una pieza puede traer
 * varias marcas a la vez y la que manda es la que decide si se puede usar. Una
 * madre retrozada, por ejemplo, existe en la base y tiene volumen, pero no se
 * consume nunca —van sus pedazos— y contarla como disponible sería contar la
 * misma madera dos veces (ADR-313).
 *
 * PURO y client-safe.
 */

/** Lo que esta lib necesita de una troza. Es un subconjunto de `/trozas/patio`. */
export interface TrozaPatio {
  id: string;
  especieComun: string | null;
  volumenM3: number | null;
  gtfNumber: string | null;
  /** Fecha del asiento de la guía en el libro. */
  fechaIngreso: string | null;
  /** Cuándo bajó del camión esta pieza (ADR-336). */
  fechaRecepcion?: string | null;
  consumidaEnId: string | null;
  despachadaEnId: string | null;
  noRecepcionada: boolean;
  descarte: boolean;
  /** Cuántos pedazos salieron de ella: si tiene, es una madre retrozada. */
  retrozos: number;
  /** Si vino de partir otra pieza, el id de la madre. */
  trozaOrigenId: string | null;
  loteAserrioCode: string | null;
  /* Lo que se usa para buscar y para saber si la pieza es rastreable. Opcional
     porque no todo llamador las trae, pero el endpoint del patio sí. */
  codificacion?: string | null;
  codigoPlanta?: string | null;
  proveedor?: string | null;
  permiso?: string | null;
}

export type EstadoTroza =
  | "libre"
  | "apartada"
  | "consumida"
  | "despachada"
  | "retrozada"
  | "no_recepcionada"
  | "descarte";

export const ESTADO_META: Record<EstadoTroza, { label: string; hint: string; tono: "ok" | "info" | "warn" | "muted" }> = {
  libre: { label: "Libre en patio", hint: "Se puede llevar a la sierra hoy", tono: "ok" },
  apartada: { label: "Apartada en un lote", hint: "Reservada para una corrida; no se puede usar en otra", tono: "info" },
  consumida: { label: "Ya aserrada", hint: "Entró a una corrida de producción", tono: "muted" },
  despachada: { label: "Salió sin aserrar", hint: "Se fue entera con su guía (ADR-363)", tono: "muted" },
  retrozada: { label: "Partida en pedazos", hint: "No se consume: van sus retrozos, contarla sería duplicar", tono: "muted" },
  no_recepcionada: { label: "No llegó", hint: "La guía la declara pero nunca bajó del camión", tono: "warn" },
  descarte: { label: "Descartada", hint: "Se dio de baja: no entra a ningún cálculo", tono: "warn" },
};

/** El orden en que se muestran: primero lo accionable. */
export const ORDEN_ESTADOS: EstadoTroza[] = [
  "libre", "apartada", "no_recepcionada", "consumida", "despachada", "retrozada", "descarte",
];

/**
 * El estado que manda.
 *
 * Se evalúa de la marca más determinante a la menos: una pieza descartada no es
 * «libre» aunque nadie la haya consumido, y una madre retrozada no es «libre»
 * aunque su volumen siga en la base.
 */
export function estadoDeTroza(t: TrozaPatio): EstadoTroza {
  if (t.descarte) return "descarte";
  if (t.retrozos > 0) return "retrozada";
  if (t.despachadaEnId) return "despachada";
  if (t.consumidaEnId) return "consumida";
  if (t.noRecepcionada) return "no_recepcionada";
  if (t.loteAserrioCode) return "apartada";
  return "libre";
}

/** Sólo la pieza libre o apartada sigue parada en el patio ocupando lugar. */
export const estaEnPatio = (e: EstadoTroza): boolean => e === "libre" || e === "apartada";

const r3 = (n: number) => Number(n.toFixed(3));
const vol = (t: TrozaPatio) => (Number.isFinite(t.volumenM3) ? Number(t.volumenM3) : 0);

export interface GrupoTrozas {
  piezas: number;
  m3: number;
}

export interface PorEspecieTroza extends GrupoTrozas {
  especie: string;
  /** Cuántas de esas piezas se pueden aserrar hoy. */
  libres: number;
  m3Libres: number;
}

export interface ResumenPatio {
  total: GrupoTrozas;
  /** Lo que sigue parado en el patio (libre + apartada). */
  enPatio: GrupoTrozas;
  porEstado: { estado: EstadoTroza; piezas: number; m3: number }[];
  porEspecie: PorEspecieTroza[];
  /** Piezas sin código de codificación: no se pueden rastrear pieza a pieza. */
  sinCodificar: number;
  /**
   * Piezas EN PATIO que no declaran título habilitante.
   *
   * El otro hueco de trazabilidad, y el que pesa en una fiscalización: sin
   * título no hay origen legal que acreditar. Se cuenta sólo sobre lo que sigue
   * parado porque es lo único que todavía se puede corregir — lo ya aserrado o
   * despachado se arregla en su asiento, no acá.
   *
   * El libro las admite; el certificado no (`trazabilidadCompleta()`).
   */
  sinTitulo: GrupoTrozas;
  /** Cuántas piezas están apartadas en un lote: decide si «en patio» se desdobla. */
  apartadas: number;
}

/**
 * Cuenta el patio por estado y por especie.
 *
 * `sinCodificar` es aparte porque no es un estado sino un hueco de registro: la
 * pieza está, pero no se la puede pedir por su código en una fiscalización.
 */
export function resumirPatio(trozas: readonly TrozaPatio[]): ResumenPatio {
  const porEstado = new Map<EstadoTroza, GrupoTrozas>();
  const porEspecie = new Map<string, PorEspecieTroza>();
  let total: GrupoTrozas = { piezas: 0, m3: 0 };
  let enPatio: GrupoTrozas = { piezas: 0, m3: 0 };
  let sinCodificar = 0;
  let sinTitulo: GrupoTrozas = { piezas: 0, m3: 0 };
  let apartadas = 0;

  for (const t of trozas) {
    const e = estadoDeTroza(t);
    const v = vol(t);
    total = { piezas: total.piezas + 1, m3: r3(total.m3 + v) };
    if (estaEnPatio(e)) {
      enPatio = { piezas: enPatio.piezas + 1, m3: r3(enPatio.m3 + v) };
      if (!(t.permiso ?? "").trim()) sinTitulo = { piezas: sinTitulo.piezas + 1, m3: r3(sinTitulo.m3 + v) };
    }
    if (e === "apartada") apartadas += 1;
    if (!(t.codificacion ?? "").trim()) sinCodificar += 1;

    const ge = porEstado.get(e) ?? { piezas: 0, m3: 0 };
    porEstado.set(e, { piezas: ge.piezas + 1, m3: r3(ge.m3 + v) });

    const esp = (t.especieComun ?? "").trim() || "Sin especie";
    const g = porEspecie.get(esp) ?? { especie: esp, piezas: 0, m3: 0, libres: 0, m3Libres: 0 };
    g.piezas += 1;
    g.m3 = r3(g.m3 + v);
    if (e === "libre") { g.libres += 1; g.m3Libres = r3(g.m3Libres + v); }
    porEspecie.set(esp, g);
  }

  return {
    total,
    enPatio,
    porEstado: ORDEN_ESTADOS.filter((e) => porEstado.has(e)).map((estado) => ({ estado, ...(porEstado.get(estado) as GrupoTrozas) })),
    porEspecie: [...porEspecie.values()].sort((a, b) => {
      if (a.especie === "Sin especie") return 1;
      if (b.especie === "Sin especie") return -1;
      return b.m3 - a.m3 || a.especie.localeCompare(b.especie);
    }),
    sinCodificar,
    sinTitulo,
    apartadas,
  };
}

// ─── Antigüedad ────────────────────────────────────────────────────────────

/**
 * Días que lleva parada una pieza. Cuenta desde que BAJÓ DEL CAMIÓN si se sabe;
 * si no, desde el asiento de la guía. Comparar por día UTC y no por hora local:
 * Lima es UTC−5 y a las 20:00 la resta local adelanta un día
 * (`ctp-radar-tiempo` aprendió lo mismo).
 */
export function diasParada(t: TrozaPatio, hoy: Date): number | null {
  const iso = t.fechaRecepcion ?? t.fechaIngreso;
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const diaUtc = (x: Date) => Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
  return Math.max(0, Math.round((diaUtc(hoy) - diaUtc(d)) / 86_400_000));
}

/**
 * Tramos de antigüedad. La madera tropical en troza se mancha y se raja: los
 * cortes son los mismos que ya usa el patio por guía (`CtpPatioAging`), para
 * que las dos pantallas no digan cosas distintas del mismo tronco.
 */
export const TRAMOS_ANTIGUEDAD = [
  { key: "fresca", label: "Menos de 30 días", desde: 0, hasta: 29, tono: "ok" as const },
  { key: "atencion", label: "30 a 59 días", desde: 30, hasta: 59, tono: "warn" as const },
  { key: "riesgo", label: "60 días o más", desde: 60, hasta: Number.POSITIVE_INFINITY, tono: "danger" as const },
];

export interface TramoAntiguedad {
  key: string;
  label: string;
  tono: "ok" | "warn" | "danger";
  piezas: number;
  m3: number;
}

/**
 * Reparte por antigüedad SÓLO lo que sigue en el patio: una troza ya aserrada no
 * está envejeciendo en ningún lado, y contarla haría ver un riesgo que no
 * existe. Las que no tienen fecha se cuentan aparte, no se inventan.
 */
export function antiguedadDelPatio(
  trozas: readonly TrozaPatio[],
  hoy: Date,
): { tramos: TramoAntiguedad[]; sinFecha: number; masVieja: number | null } {
  const tramos: TramoAntiguedad[] = TRAMOS_ANTIGUEDAD.map((t) => ({ key: t.key, label: t.label, tono: t.tono, piezas: 0, m3: 0 }));
  let sinFecha = 0;
  let masVieja: number | null = null;

  for (const t of trozas) {
    if (!estaEnPatio(estadoDeTroza(t))) continue;
    const d = diasParada(t, hoy);
    if (d == null) { sinFecha += 1; continue; }
    masVieja = masVieja == null ? d : Math.max(masVieja, d);
    const i = TRAMOS_ANTIGUEDAD.findIndex((x) => d >= x.desde && d <= x.hasta);
    const tramo = tramos[i < 0 ? tramos.length - 1 : i];
    tramo.piezas += 1;
    tramo.m3 = r3(tramo.m3 + vol(t));
  }
  return { tramos, sinFecha, masVieja };
}

/** En qué tramo cae una antigüedad concreta. `null` si no hay fecha. */
export function tramoDe(dias: number | null): string | null {
  if (dias == null) return null;
  return (TRAMOS_ANTIGUEDAD.find((x) => dias >= x.desde && dias <= x.hasta) ?? TRAMOS_ANTIGUEDAD[TRAMOS_ANTIGUEDAD.length - 1]).key;
}

// ─── Buscar en el patio ────────────────────────────────────────────────────

/** Sin tildes y en minúscula: en el patio se tipea «tornillo», no «Tornillo». */
const plano = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export type OrdenTrozas = "antiguedad" | "volumen" | "codigo" | "especie";

export interface FiltroTrozas {
  texto?: string;
  estado?: EstadoTroza | null;
  especie?: string | null;
  /** `key` de `TRAMOS_ANTIGUEDAD`. */
  tramo?: string | null;
  /**
   * N° de GTF con la que entró la pieza.
   *
   * Es LA pregunta del fiscalizador —«¿qué trozas ampara esta guía?»— y hasta
   * ahora sólo se podía responder tipeando el número en la búsqueda libre, que
   * también matchea proveedor y código: una guía `019-001-0000011` y una troza
   * codificada `0000011` caían juntas.
   */
  guia?: string | null;
  /** Título habilitante (`permiso`). `SIN_TITULO` para las que no declaran uno. */
  titulo?: string | null;
  orden?: OrdenTrozas;
}

/**
 * La clave de las piezas sin título habilitante declarado.
 *
 * No es un título más: es el hueco de ORIGEN LEGAL. El libro las admite —por eso
 * están en la lista— pero el certificado no, y en una fiscalización son las
 * primeras que se piden. Se puede filtrar por ellas justamente para cerrarlas.
 */
export const SIN_TITULO = "__sin_titulo__";

/**
 * Las guías y los títulos que hay en el patio, con cuántas piezas trae cada uno.
 *
 * Se calcula sobre las piezas SIN filtrar por ese mismo campo (quien llama pasa
 * ya filtrado por lo demás) para que el desplegable siga ofreciendo las otras
 * guías después de elegir una — si no, elegir una guía dejaría el filtro con una
 * sola opción y habría que limpiarlo para cambiar de guía.
 *
 * Ordena por cantidad de piezas: la guía que más madera trajo es la que más se
 * consulta. `SIN_TITULO` va último aunque pese: es un pendiente, no un origen
 * (mismo criterio que el nodo «Sin título declarado» del Radar).
 */
export function opcionesDeOrigen(
  trozas: readonly TrozaPatio[],
  campo: "guia" | "titulo",
): { valor: string; label: string; piezas: number }[] {
  const cuenta = new Map<string, number>();
  for (const t of trozas) {
    const crudo = (campo === "guia" ? t.gtfNumber : t.permiso) ?? "";
    const v = crudo.trim();
    if (campo === "guia" && !v) continue; // una pieza sin guía no se puede pedir por guía
    const clave = v || SIN_TITULO;
    cuenta.set(clave, (cuenta.get(clave) ?? 0) + 1);
  }
  return [...cuenta.entries()]
    .map(([valor, piezas]) => ({
      valor,
      label: valor === SIN_TITULO ? "Sin título declarado" : valor,
      piezas,
    }))
    .sort((a, b) => {
      if (a.valor === SIN_TITULO) return 1;
      if (b.valor === SIN_TITULO) return -1;
      return b.piezas - a.piezas || a.label.localeCompare(b.label, "es-PE", { numeric: true });
    });
}

/**
 * Filtra y ordena el patio.
 *
 * El texto busca en TODO lo que identifica una pieza —su código del bosque, el
 * que le marcó la planta, la especie, la guía, el proveedor, el título— porque
 * quien pregunta por una troza la nombra con lo que tiene a mano: el fiscalizador
 * con el código del POA, el aserrador con el número pintado en la testa.
 *
 * El orden por defecto es por antigüedad: lo que hay que aserrar primero va
 * arriba. Las piezas sin fecha caen al final y no se mezclan con las frescas.
 */
export function filtrarPatio<T extends TrozaPatio>(trozas: readonly T[], f: FiltroTrozas, hoy: Date): T[] {
  const q = plano((f.texto ?? "").trim());
  const salida = trozas.filter((t) => {
    if (f.estado && estadoDeTroza(t) !== f.estado) return false;
    if (f.especie && ((t.especieComun ?? "").trim() || "Sin especie") !== f.especie) return false;
    if (f.tramo && tramoDe(diasParada(t, hoy)) !== f.tramo) return false;
    if (f.guia && (t.gtfNumber ?? "").trim() !== f.guia) return false;
    if (f.titulo) {
      const suyo = (t.permiso ?? "").trim();
      /* Sin título es una opción de filtro con nombre propio, no la ausencia de
         filtro: buscar «las que no declaran origen» es una tarea concreta. */
      if (f.titulo === SIN_TITULO ? suyo !== "" : suyo !== f.titulo) return false;
    }
    if (!q) return true;
    return [t.codificacion, t.codigoPlanta, t.especieComun, t.gtfNumber, t.proveedor, t.permiso, t.loteAserrioCode]
      .some((v) => v && plano(String(v)).includes(q));
  });

  const orden = f.orden ?? "antiguedad";
  return salida.sort((a, b) => {
    if (orden === "volumen") return vol(b) - vol(a);
    if (orden === "codigo") return (a.codificacion ?? "\uffff").localeCompare(b.codificacion ?? "\uffff", "es-PE", { numeric: true });
    if (orden === "especie") {
      return (a.especieComun ?? "\uffff").localeCompare(b.especieComun ?? "\uffff", "es-PE") || vol(b) - vol(a);
    }
    const da = diasParada(a, hoy);
    const db = diasParada(b, hoy);
    if (da == null && db == null) return 0;
    if (da == null) return 1; // sin fecha, al fondo
    if (db == null) return -1;
    return db - da;
  });
}
