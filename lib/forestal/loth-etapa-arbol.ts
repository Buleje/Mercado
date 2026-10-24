/**
 * loth-etapa-arbol — en qué punto de la cadena está cada árbol del censo:
 * en pie → talado → trozado → despachado (en parte o entero) → en el CTP.
 * Lo que el mapa del Libro TH escribe sobre cada punto («114 · Trozado ×3»),
 * lo que filtra y lo que cuenta la ficha del árbol.
 *
 * Manda el LIBRO, no el `estado` del censo: el censo pasa a «talado» con un
 * fire-and-forget después de asentar la tala, y puede quedar atrás (28-09, en
 * el tenant de QA: el 85-TOR seguía «en pie» con su tala, 4 trozas y 2
 * despachadas). Cuando los dos no coinciden no se elige uno en silencio: el
 * árbol lleva un AVISO que dice cuál dice qué.
 *
 * Se calcula con TODAS las líneas del plan (el servidor las lee enteras): el
 * mapa carga el libro con un tope de 500 líneas, y con un libro grande el
 * estado de un árbol saldría a medias.
 *
 * El despacho y el consumo de troza traen sólo el código de la troza: su árbol
 * sale de la línea de Trozado que la creó (y, si no la hay, del propio código:
 * «85-TOR-A» → «85-TOR»). Los códigos se comparan por su clave (`claveDeCodigo`:
 * «0114» = «114», «85 tor» = «85-TOR»), nunca por el texto crudo.
 *
 * Puro y client-safe: lo usan la DB class (el cálculo), el mapa (semillero
 * según el POA, textos) y las pruebas.
 */

import { claveDeCodigo } from "./loth-placa";
import { arbolDeTroza, diaDelLibro } from "./loth-censo-uso";
import { normalizarCondicion, type ClaseArbol } from "./loth-mapa-arboles";

// ─── Las etapas ──────────────────────────────────────────────────────────────

export type EtapaArbol =
  | "en_pie"
  | "semillero"
  | "talado"
  | "trozado"
  | "despachado_parcial"
  | "despachado"
  | "en_ctp"
  | "descartado";

/** En el orden de la cadena: así se listan en la leyenda y en el filtro. */
export const ETAPAS: readonly EtapaArbol[] = [
  "en_pie",
  "semillero",
  "talado",
  "trozado",
  "despachado_parcial",
  "despachado",
  "en_ctp",
  "descartado",
];

/** Las que se muestran en el filtro aunque no haya ninguna: la cadena entera se lee de un vistazo. */
export const ETAPAS_SIEMPRE: readonly EtapaArbol[] = ["en_pie", "talado", "trozado", "despachado"];

/** Lo que el filtro acepta además de una etapa: los árboles donde el censo y el libro no coinciden. */
export type EtapaFiltro = EtapaArbol | "con_aviso";

export const ETAPA_LABEL: Record<EtapaArbol, string> = {
  en_pie: "En pie",
  semillero: "Semillero",
  talado: "Talado",
  trozado: "Trozado",
  despachado_parcial: "Despacho parcial",
  despachado: "Despachado",
  en_ctp: "En el CTP",
  descartado: "Descartado",
};

export const CON_AVISO_LABEL = "Censo ≠ libro";

/**
 * Color de cada etapa, como token del DS: el borde de la etiqueta, la insignia
 * del símbolo y la leyenda. Nunca es lo único que distingue: la etiqueta dice
 * la palabra y la insignia tiene su propio dibujo.
 */
export const ETAPA_TOKEN: Record<EtapaArbol, string> = {
  en_pie: "var(--data-2)",
  semillero: "var(--data-8)",
  talado: "var(--data-warning-500)",
  trozado: "var(--data-6)",
  despachado_parcial: "var(--data-1)",
  despachado: "var(--data-1)",
  en_ctp: "var(--data-success-700)",
  descartado: "var(--data-3)",
};

/** El aviso de «el censo y el libro no dicen lo mismo»: rojo, con su signo de admiración. */
export const AVISO_TOKEN = "var(--data-error-500)";

/**
 * Cómo se rellena el símbolo según la etapa: lleno si sigue en pie, hueco y
 * tachado si ya se tumbó (la insignia dice lo que vino después), punteado si
 * se descartó. Es el MISMO criterio que el estado del censo, pero leído del libro.
 */
export function estadoVisualDeEtapa(etapa: EtapaArbol): "en_pie" | "talado" | "descartado" {
  if (etapa === "en_pie" || etapa === "semillero") return "en_pie";
  if (etapa === "descartado") return "descartado";
  return "talado";
}

// ─── Lo que entra ────────────────────────────────────────────────────────────

/** Un árbol del censo, en el mínimo que hace falta. */
export interface ArbolParaEtapa {
  id: string;
  treeCode: string;
  /** en_pie | talado | descartado (lo que dice el CENSO). */
  estado: string | null;
  /** Condición que declaró el regente («Semillero»…). */
  condicion: string | null;
}

/** Una línea del libro (Tala, Trozado, Despacho o Consumo de troza), borradas ya fuera. */
export interface LineaParaEtapa {
  id: string;
  section: string;
  /** registrado | anulado — las anuladas no cuentan (sólo se nombran en el aviso). */
  status: string;
  lineNo: number;
  entryDate: Date | string;
  treeCode: string | null;
  trozaCode: string | null;
  volumeM3: number | null;
  gtfNumber: string | null;
}

// ─── Lo que sale ─────────────────────────────────────────────────────────────

export type TipoAviso =
  | "censo_talado_sin_tala"
  | "censo_no_dice_talado"
  | "trozas_sin_tala"
  | "despacho_sin_trozado"
  | "semillero_talado";

export interface AvisoEtapa {
  tipo: TipoAviso;
  texto: string;
}

export interface EstadoArbol {
  treeId: string;
  treeCode: string;
  /** Según el libro (y el censo sólo cuando el libro no dice nada). */
  etapa: EtapaArbol;
  /** Lo que dice el censo, tal cual. */
  estadoCenso: string;
  /** La tala vigente (una sola: T3). `fecha` es `AAAA-MM-DD`. */
  tala: { lineNo: number; fecha: string; volumeM3: number | null } | null;
  /** Sin tala vigente: la última que se anuló, para decir por qué el censo y el libro no cuadran. */
  talaAnulada: { lineNo: number; fecha: string } | null;
  trozas: {
    total: number;
    despachadas: number;
    /** Consumidas en el aserradero del título (Consumo de troza): también salieron del monte. */
    consumidas: number;
    /** Ni despachadas ni consumidas: siguen en el monte. */
    enMonte: number;
    /** Recibidas y vivas en el Libro CTP (ADR-450). */
    enCtp: number;
  };
  m3: { talado: number | null; trozado: number; despachado: number; consumido: number };
  /** N° de las guías con que salieron sus trozas, sin repetir. */
  guias: string[];
  /** La última operación vigente (`AAAA-MM-DD`), o null si el libro no tiene ninguna. */
  ultimaFecha: string | null;
  avisos: AvisoEtapa[];
}

export interface EstadoDeArbolesPlan {
  arboles: EstadoArbol[];
  /** Árboles con tala o trozas en el libro que no están en el censo de este plan (su código tal cual). */
  sinCenso: string[];
}

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

function diaIso(v: Date | string): string {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

interface Troza {
  arbol: string;
  m3: number;
  /** Id de la línea de Trozado (null: la troza sólo aparece en un despacho). */
  trozadoId: string | null;
  /** Cuándo se trozó (`AAAA-MM-DD`); null si sólo aparece en un despacho. */
  fechaTrozado: string | null;
  despachada: boolean;
  consumida: boolean;
  fechaSalida: string | null;
}

/**
 * El estado de cada árbol del censo, cruzado con el libro.
 *
 * @param enCtp ids de las líneas de Trozado cuya troza está recibida y viva en
 *   el Libro CTP (la troza guarda su `lothTrozadoId`, ADR-450).
 */
export function estadoDeArboles(
  arboles: readonly ArbolParaEtapa[],
  lineas: readonly LineaParaEtapa[],
  enCtp: ReadonlySet<string> = new Set(),
): EstadoDeArbolesPlan {
  const ordenadas = [...lineas].sort((a, b) => a.lineNo - b.lineNo || diaIso(a.entryDate).localeCompare(diaIso(b.entryDate)));
  const vigente = (l: LineaParaEtapa) => l.status === "registrado";

  // Talas: la vigente (T3: una sola; si hubiera dos, la primera) y la última anulada.
  const talaDe = new Map<string, LineaParaEtapa>();
  const anuladaDe = new Map<string, LineaParaEtapa>();
  /** El código como lo escribió el libro, para nombrar lo que no está en el censo. */
  const codigoDe = new Map<string, string>();
  for (const l of ordenadas) {
    if (l.section !== "tala" || !l.treeCode?.trim()) continue;
    const k = claveDeCodigo(l.treeCode);
    if (!k) continue;
    if (vigente(l)) {
      if (!talaDe.has(k)) talaDe.set(k, l);
      codigoDe.set(k, l.treeCode.trim());
    } else if (l.status === "anulado") {
      anuladaDe.set(k, l);
    }
  }

  // Trozas del Trozado vigente, por su clave; cada una sabe su árbol.
  const trozaDe = new Map<string, Troza>();
  const trozasDe = new Map<string, Troza[]>();
  const agregar = (clave: string, t: Troza) => {
    trozaDe.set(clave, t);
    const lista = trozasDe.get(t.arbol);
    if (lista) lista.push(t);
    else trozasDe.set(t.arbol, [t]);
  };
  for (const l of ordenadas) {
    if (l.section !== "trozado" || !vigente(l)) continue;
    const troza = l.trozaCode?.trim() ?? "";
    const arbolTexto = l.treeCode?.trim() || (troza ? arbolDeTroza(troza) : "");
    const arbol = claveDeCodigo(arbolTexto);
    if (!arbol) continue;
    const clave = troza ? claveDeCodigo(troza) : `#${l.id}`;
    if (trozaDe.has(clave)) continue; // T3: la misma troza dos veces cuenta una
    if (!codigoDe.has(arbol)) codigoDe.set(arbol, arbolTexto);
    agregar(clave, {
      arbol,
      m3: l.volumeM3 ?? 0,
      trozadoId: l.id,
      fechaTrozado: diaIso(l.entryDate),
      despachada: false,
      consumida: false,
      fechaSalida: null,
    });
  }

  // Salidas: despacho y consumo. Una troza sale una vez (T1): la segunda no suma.
  const guiasDe = new Map<string, Set<string>>();
  const sinTrozadoDe = new Map<string, number>();
  for (const l of ordenadas) {
    if ((l.section !== "despacho_troza" && l.section !== "consumo_troza") || !vigente(l)) continue;
    const troza = l.trozaCode?.trim();
    if (!troza) continue;
    const clave = claveDeCodigo(troza);
    let t = trozaDe.get(clave);
    if (!t) {
      // T2 lo impide al guardar, pero si pasa no se esconde: cuenta y avisa.
      const arbol = claveDeCodigo(arbolDeTroza(troza));
      if (!arbol) continue;
      t = { arbol, m3: l.volumeM3 ?? 0, trozadoId: null, fechaTrozado: null, despachada: false, consumida: false, fechaSalida: null };
      agregar(clave, t);
      sinTrozadoDe.set(arbol, (sinTrozadoDe.get(arbol) ?? 0) + 1);
    }
    if (t.despachada || t.consumida) continue;
    if (l.section === "despacho_troza") {
      t.despachada = true;
      const gtf = l.gtfNumber?.trim();
      if (gtf) {
        const set = guiasDe.get(t.arbol) ?? new Set<string>();
        set.add(gtf);
        guiasDe.set(t.arbol, set);
      }
    } else {
      t.consumida = true;
    }
    t.fechaSalida = diaIso(l.entryDate);
  }

  const enCenso = new Set<string>();
  const out: EstadoArbol[] = arboles.map((a) => {
    const k = claveDeCodigo(a.treeCode);
    enCenso.add(k);
    const tala = talaDe.get(k) ?? null;
    const anulada = tala ? null : (anuladaDe.get(k) ?? null);
    const trozas = trozasDe.get(k) ?? [];
    const total = trozas.length;
    const despachadas = trozas.filter((t) => t.despachada).length;
    const consumidas = trozas.filter((t) => t.consumida).length;
    const salidas = despachadas + consumidas;
    const ctp = trozas.filter((t) => t.trozadoId !== null && enCtp.has(t.trozadoId)).length;
    const estadoCenso = (a.estado ?? "").trim() || "en_pie";
    const semilleroRegente = normalizarCondicion(a.condicion) === "semillero";
    const conLibro = tala !== null || total > 0;

    let etapa: EtapaArbol;
    if (conLibro) {
      if (total === 0) etapa = "talado";
      else if (salidas === 0) etapa = "trozado";
      else if (salidas < total) etapa = "despachado_parcial";
      else etapa = ctp > 0 && ctp >= despachadas ? "en_ctp" : "despachado";
    } else if (estadoCenso === "descartado") etapa = "descartado";
    else if (estadoCenso === "talado") etapa = "talado";
    else etapa = semilleroRegente ? "semillero" : "en_pie";

    const avisos: AvisoEtapa[] = [];
    if (tala && estadoCenso !== "talado") {
      avisos.push({
        tipo: "censo_no_dice_talado",
        texto:
          estadoCenso === "descartado"
            ? `El censo lo tiene descartado, pero el libro tiene su tala (línea N° ${tala.lineNo}).`
            : `El censo todavía lo tiene en pie, pero el libro ya lo taló (línea N° ${tala.lineNo}).`,
      });
    }
    if (!tala && estadoCenso === "talado") {
      avisos.push({
        tipo: "censo_talado_sin_tala",
        texto: anulada
          ? `El censo lo marca talado, pero su tala (línea N° ${anulada.lineNo}) se anuló y el libro no tiene otra.`
          : "El censo lo marca talado, pero el libro no tiene su tala.",
      });
    }
    if (!tala && total > 0) {
      avisos.push({ tipo: "trozas_sin_tala", texto: `Tiene ${plural(total, "troza", "trozas")} en el libro sin una tala vigente.` });
    }
    const sinTrozado = sinTrozadoDe.get(k) ?? 0;
    if (sinTrozado > 0) {
      avisos.push({
        tipo: "despacho_sin_trozado",
        texto: `${sinTrozado === 1 ? "Una troza salió" : `${sinTrozado} trozas salieron`} sin su línea de Trozado.`,
      });
    }
    if (conLibro && semilleroRegente) {
      avisos.push({ tipo: "semillero_talado", texto: "El regente lo declaró semillero y el libro tiene su tala." });
    }

    const todas = [tala ? diaIso(tala.entryDate) : null, ...trozas.flatMap((t) => [t.fechaTrozado, t.fechaSalida])]
      .filter((f): f is string => !!f)
      .sort();

    return {
      treeId: a.id,
      treeCode: a.treeCode,
      etapa,
      estadoCenso,
      tala: tala ? { lineNo: tala.lineNo, fecha: diaIso(tala.entryDate), volumeM3: tala.volumeM3 } : null,
      talaAnulada: anulada ? { lineNo: anulada.lineNo, fecha: diaIso(anulada.entryDate) } : null,
      trozas: { total, despachadas, consumidas, enMonte: total - salidas, enCtp: ctp },
      m3: {
        talado: tala?.volumeM3 ?? null,
        trozado: r4(trozas.reduce((s, t) => s + t.m3, 0)),
        despachado: r4(trozas.filter((t) => t.despachada).reduce((s, t) => s + t.m3, 0)),
        consumido: r4(trozas.filter((t) => t.consumida).reduce((s, t) => s + t.m3, 0)),
      },
      guias: [...(guiasDe.get(k) ?? [])].sort(),
      ultimaFecha: todas.length > 0 ? todas[todas.length - 1] : null,
      avisos,
    };
  });

  const sinCenso = [...new Set([...talaDe.keys(), ...trozasDe.keys()])]
    .filter((k) => !enCenso.has(k))
    .map((k) => codigoDe.get(k) ?? k)
    .sort((a, b) => a.localeCompare(b, "es", { numeric: true }));

  return { arboles: out, sinCenso };
}

// ─── En el mapa ──────────────────────────────────────────────────────────────

/**
 * La etapa con la que se pinta un árbol en el mapa. El servidor sabe del
 * regente; el mapa sabe además del POA: un árbol en pie que el POA reserva
 * como semillero (y el regente no dijo otra cosa) se ve «Semillero».
 *
 * Sin estado del servidor (cargando, o la lectura falló), la etapa sale del
 * censo: mejor el dato viejo que ninguno, y la barra dice que falta el libro.
 */
export function etapaEnElMapa(estado: Pick<EstadoArbol, "etapa"> | null | undefined, arbol: { estado: string; clase: ClaseArbol }): EtapaArbol {
  const base = estado?.etapa ?? (arbol.estado === "descartado" ? "descartado" : arbol.estado === "talado" ? "talado" : "en_pie");
  return base === "en_pie" && arbol.clase === "semillero" ? "semillero" : base;
}

/**
 * El texto corto de la etiqueta sobre el punto, después del código:
 * «Trozado ×3» (tres trozas), «Despacho 2/4» (dos de cuatro salieron).
 */
export function textoCortoEtapa(etapa: EtapaArbol, estado?: Pick<EstadoArbol, "trozas"> | null): string {
  const t = estado?.trozas;
  if (etapa === "trozado" && t && t.total > 0) return `Trozado ×${t.total}`;
  if (etapa === "despachado_parcial" && t && t.total > 0) return `Despacho ${t.despachadas + t.consumidas}/${t.total}`;
  return ETAPA_LABEL[etapa];
}

/** La etapa dicha entera: el nombre accesible del marcador y el tooltip. */
export function textoLargoEtapa(etapa: EtapaArbol, estado?: EstadoArbol | null): string {
  const t = estado?.trozas;
  switch (etapa) {
    case "en_pie":
      return "en pie";
    case "semillero":
      return "semillero, se queda en pie";
    case "descartado":
      return "descartado del censo";
    case "talado":
      return estado?.tala ? `talado el ${diaDelLibro(estado.tala.fecha)}, línea N° ${estado.tala.lineNo}` : "talado según el censo";
    case "trozado":
      return t ? `trozado en ${plural(t.total, "troza", "trozas")}, en el monte` : "trozado";
    case "despachado_parcial":
      return t ? `${t.despachadas + t.consumidas} de ${plural(t.total, "troza", "trozas")} salieron del monte` : "despachado en parte";
    case "despachado":
      return estado?.guias.length ? `despachado entero, guía ${estado.guias.join(", ")}` : "despachado entero";
    case "en_ctp":
      return t ? `en el CTP, ${t.enCtp} de ${plural(t.total, "troza", "trozas")} recibidas` : "en el CTP";
  }
}

/** Cuántos árboles hay en cada etapa (y con aviso), para el filtro y la leyenda. */
export function contarEtapas(arboles: readonly { etapa?: EtapaArbol; conAviso?: boolean }[]): Record<EtapaFiltro, number> {
  const n = Object.fromEntries([...ETAPAS, "con_aviso"].map((e) => [e, 0])) as Record<EtapaFiltro, number>;
  for (const a of arboles) {
    if (a.etapa) n[a.etapa] += 1;
    if (a.conAviso) n.con_aviso += 1;
  }
  return n;
}

export interface OpcionEtapa {
  valor: EtapaFiltro;
  label: string;
  n: number;
}

/**
 * Las opciones del filtro por etapa, con cuántos árboles hay en cada una en el
 * censo entero: la cadena (en pie → talado → trozado → despachado) siempre,
 * aunque sea cero —«Despachado 0» también es un dato—; el resto sólo si hay.
 */
export function opcionesDeEtapa(arboles: readonly { etapa?: EtapaArbol; conAviso?: boolean }[]): OpcionEtapa[] {
  const n = contarEtapas(arboles);
  return [
    ...ETAPAS.filter((e) => ETAPAS_SIEMPRE.includes(e) || n[e] > 0).map((e) => ({ valor: e, label: ETAPA_LABEL[e], n: n[e] })),
    ...(n.con_aviso > 0 ? [{ valor: "con_aviso" as const, label: CON_AVISO_LABEL, n: n.con_aviso }] : []),
  ];
}
