/**
 * De «cuánto puede salir» a «repartilo»: la capacidad filtrada, convertida en
 * bloques de la distribución de rolliza sobre lo aserrado.
 *
 * El puente que faltaba (Brandon, 2026-09-08): en Saldos → Capacidad se filtra
 * la madera —especie, permisos, guías— y sale un número; después, en el
 * cubicador, ese mismo número se volvía a tipear a mano para poder repartirlo.
 * Retipear es como el papel y el Libro empiezan a decir cosas distintas.
 *
 * Tres reglas que este archivo existe para no romper:
 *
 *  1. **Sólo lo filtrado.** Cada fuente se lee con las mismas funciones que
 *     alimentan la tarjeta (`trozasDeFuente`, `lotesDeFuente`,
 *     `corridasDeFuente`), así que lo que viaja al cubicador es exactamente lo
 *     que el operario está mirando, ni un metro más.
 *  2. **Troza y tabla no se mezclan** (ADR-358 · `reparto-aserrada-directa`).
 *     Lo que todavía es rolliza viaja como bloque `rolliza` con su
 *     % aprovechable; lo que ya salió de la sierra viaja como `aserrada`, donde
 *     el m³ ES lo amparado. Mandar producto terminado como rolliza le aplicaría
 *     el rendimiento por segunda vez.
 *  3. **El % es el mismo que muestra la tarjeta** (`RENDIMIENTO_META`, 56 %).
 *     Si el bloque naciera con el 55 % por defecto del cubicador, el ampara de
 *     allá no coincidiría con el «→ al 56 %» que se acaba de leer acá, y no hay
 *     forma de que el operario sepa cuál de los dos números vale.
 *
 * Es PURO: entra lo ya pedido, sale la lista. Quién la siembra y cómo navega
 * vive en `sembrar-reparto.ts`.
 */

import { ESPECIES_MADERA } from "@/lib/forestal/cubicacion";
import { RENDIMIENTO_META, tipoComercialDelProducto } from "@/lib/forestal/loctp-catalogos";
import {
  admiteDelLote,
  corridasDeFuente,
  lotesDeFuente,
  trozasDeFuente,
  type ClaveFuente,
  type CorridaDisponible,
  type EntradaCapacidad,
  type FiltrosCapacidad,
  type LoteDeCapacidad,
} from "@/lib/forestal/capacidad-de-planta";
import type { BloqueSembrable } from "@/lib/forestal/sembrar-reparto";
import { MAX_TROZAS_POR_BLOQUE } from "@/lib/forestal/cubicacion-reparto";
import { totalizarGTF } from "@/lib/forestal/gtf-redondeo";
import {
  agruparPorPermiso,
  claveDePermiso,
  codigoCortoDePermiso,
  etiquetaCortaDePermiso,
  partirPorPermiso,
  permisoDeVarios,
  repartirPorAporte,
  type ItemPorPermiso,
  type ParteDePermiso,
} from "@/lib/forestal/capacidad-por-permiso";

const r4 = (v: number) => Math.round(v * 10000) / 10000;
const txt = (v: unknown) => String(v ?? "").trim();
/** Bajo este umbral no hay bloque que valga: son litros de redondeo. */
const MINIMO_M3 = 0.0001;

/** Una línea candidata a bloque, con lo que el modal necesita para mostrarla. */
export interface CandidatoDeCapacidad {
  /** Id estable dentro de la lista, para tildar y destildar. */
  clave: string;
  fuente: ClaveFuente;
  fuenteLabel: string;
  /** Lo que va a decir el bloque en el cubicador. */
  etiqueta: string;
  especie: string;
  m3: number;
  tipo: "rolliza" | "aserrada";
  /** Sólo cuando TODA la madera de la línea viene del mismo título. */
  permiso: string | null;
  /**
   * La línea partida por permiso (Brandon, 2026-10-19): cada parte es UN
   * bloque. Las trozas del patio de una especie se parten por el permiso de
   * cada troza; un lote o una corrida de UN permiso es una sola parte, y uno
   * que juntó varios se parte por lo que aportó cada uno (`partesDeLote`,
   * `partesDeCorrida`). Sin `partes`, la línea entera es una parte.
   */
  partes?: ParteDePermiso[];
  /** `null` en aserrada directa: ahí no hay porcentaje que aplicar. */
  aprovechablePct: number | null;
  /** Piezas declaradas, si se saben. Es el tope del bloque de aserrada. */
  piezasManual: number | null;
  /** Para no sembrar dos veces la misma corrida (mismo `ref` que el picker de paquetes). */
  paqueteId?: string;
  /**
   * Las trozas reales detrás de la línea (ADR-464). Sólo en las fuentes de
   * trozas sueltas (patio, por recepcionar): es lo que deja al bloque crear su
   * lote en el Libro. Un lote o una corrida ya tienen su propia referencia.
   */
  trozaIds?: string[];
  /** El lote de donde sale la línea (apartado o margen): ya tiene lote, no se arma otro. */
  loteId?: string;
  /**
   * Qué tipo comercial es esta madera («Comercial», «Paquetería larga»), cuando
   * el producto del Libro lo dice. Viaja al bloque para que la distribución
   * pueda sugerir el reproceso (ADR-404) — el reparto no lo mira.
   */
  tipoProducto?: string | null;
  /**
   * Cuántas piezas hay detrás — informativo, para leer la línea en el modal y
   * para que la sugerencia de reproceso pueda decir «25 piezas → 22 paquetes».
   */
  piezas: number;
}

const PCT_TARJETA = Math.round(RENDIMIENTO_META * 100);

/**
 * La especie con la grafía del cubicador, si es la misma madera.
 *
 * El libro la escribe «TORNILLO» y el cubicador ofrece «Tornillo»: el reparto
 * las cruza igual (`claveEspecie` normaliza), pero el desplegable de la tabla
 * compara el texto exacto y mostraba **«Sin especie»** sobre un bloque que sí
 * la tenía. Una especie que no está en el catálogo se deja tal cual: inventar
 * una grafía sería peor que respetar la del asiento.
 */
function especieDelCatalogo(raw: string): string {
  const norm = (v: string) =>
    v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const k = norm(raw);
  return ESPECIES_MADERA.find((e) => norm(e) === k) ?? raw;
}

/** El único de la lista, o `null` si hay varios (o ninguno): no se inventa. */
function unicoONull(valores: readonly (string | null | undefined)[]): string | null {
  const unicos = [...new Set(valores.map(txt).filter(Boolean))];
  return unicos.length === 1 ? unicos[0] : null;
}

/**
 * La especie de un lote, para el bloque: la suya, y si viniera vacía, la ÚNICA
 * de sus piezas. Un lote es de una sola especie (regla del aserradero, schema);
 * con piezas de varias no se elige una al azar: queda vacía y el modal lo dice.
 */
function especieDeLote(l: Pick<LoteDeCapacidad, "especie" | "trozas">): string {
  const propia = txt(l.especie);
  if (propia) return especieDelCatalogo(propia);
  /* «CUMALA» y «Cumala» son la misma madera: se comparan normalizadas. */
  const norm = (v: string) =>
    v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const deLasPiezas = new Map(
    l.trozas.map((t) => txt(t.especie)).filter(Boolean).map((e) => [norm(e), e] as const),
  );
  return deLasPiezas.size === 1 ? especieDelCatalogo([...deLasPiezas.values()][0]!) : "";
}

type TrozaDeLinea = { id: string; especieComun?: string | null; volumenM3?: number | string | null; permiso?: string | null };

/** Agrupa trozas por especie; la especie vacía queda junta y se dice. */
function porEspecie(trozas: readonly TrozaDeLinea[]) {
  const grupos = new Map<
    string,
    { especie: string; m3: number; piezas: number; permisos: (string | null)[]; trozaIds: string[]; trozas: TrozaDeLinea[] }
  >();
  for (const t of trozas) {
    const especie = txt(t.especieComun);
    const clave = especie.toUpperCase();
    const g = grupos.get(clave) ?? { especie, m3: 0, piezas: 0, permisos: [], trozaIds: [], trozas: [] };
    g.m3 = r4(g.m3 + (Number(t.volumenM3 ?? 0) || 0));
    g.piezas += 1;
    g.permisos.push(t.permiso ?? null);
    g.trozaIds.push(t.id);
    g.trozas.push(t);
    grupos.set(clave, g);
  }
  return [...grupos.values()].sort((a, b) => b.m3 - a.m3);
}

/**
 * Las partes por permiso de lo que sale de un lote (Brandon, 2026-10-19: «lote
 * con dos permisos»). Si TODA su madera es de un título —o de ninguno—, una
 * sola parte, la de siempre. Si juntó varios, cada permiso se lleva lo que
 * aportaron SUS piezas: lo apartado, por las piezas que siguen enteras (exacto,
 * pieza por pieza); el margen, en proporción a las piezas que entraron a la
 * sierra (`base` = lo consumido: lo que las piezas no explican queda «Sin
 * permiso», nunca se le carga a otro título).
 */
function partesDeLote(
  l: LoteDeCapacidad,
  de: "libres" | "consumidas",
  m3: number,
  piezas: number,
): ParteDePermiso[] {
  const p = permisoDeVarios(l.permisos);
  if (!p.mezclado) return [{ ...p, m3, piezas }];
  const trozas = l.trozas.filter((t) => (de === "libres" ? !t.consumida : t.consumida));
  const partes = repartirPorAporte(
    m3,
    trozas.map((t) => ({ permiso: t.permiso, m3: t.m3, piezas: de === "libres" ? 1 : 0 })),
    de === "libres" ? l.apartadoM3 : l.consumidoM3,
  );
  return partes.length > 0 ? partes : [{ ...p, m3, piezas }];
}

/**
 * Las partes por permiso de una corrida: su permiso, o —si consumió madera de
 * varios— en proporción a lo que consumió de cada uno (`origenPorPermiso`, los
 * m³ de `ForestCtpConsumo` por guía). Sin ese desglose no se puede saber: todo
 * va a «Sin permiso» y la tabla lo dice.
 */
function partesDeCorrida(c: CorridaDisponible, m3: number, piezas: number): ParteDePermiso[] {
  const p = permisoDeVarios(c.titularOrigen);
  if (!p.mezclado) return [{ ...p, m3, piezas }];
  const partes = repartirPorAporte(m3, c.origenPorPermiso ?? []);
  /* Las piezas de un paquete de madera mezclada no son de un título ni de
     otro: la línea las dice; las partes, no. */
  return partes.length > 0 ? partes.map((x) => ({ ...x, piezas: 0 })) : [{ ...p, m3, piezas }];
}

/**
 * Los bloques que salen de la capacidad tal como está filtrada.
 *
 * Un renglón por especie en las fuentes de patio (es lo que hace que el reparto
 * pueda cruzar cada troza con la aserrada de SU madera) y uno por lote o por
 * corrida en las demás, que ya vienen individualizadas.
 */
export function bloquesDesdeCapacidad(
  entrada: EntradaCapacidad,
  filtros: FiltrosCapacidad,
): CandidatoDeCapacidad[] {
  const out: CandidatoDeCapacidad[] = [];

  /* Las dos fuentes de rolliza suelta: patio libre y lo que todavía no bajó del
     camión. Se agrupan por especie porque el bloque de rolliza se cruza con la
     aserrada de la misma especie. */
  const deTrozas: { clave: "patio" | "porRecepcionar"; label: string }[] = [
    { clave: "patio", label: "Trozas en el patio" },
    { clave: "porRecepcionar", label: "Por recepcionar" },
  ];
  for (const f of deTrozas) {
    for (const g of porEspecie(trozasDeFuente(f.clave, entrada.patio, filtros))) {
      if (g.m3 <= MINIMO_M3) continue;
      out.push({
        clave: `${f.clave}:${g.especie.toUpperCase() || "sin-especie"}`,
        fuente: f.clave,
        fuenteLabel: f.label,
        etiqueta: `${f.label}${g.especie ? ` · ${g.especie}` : ""}`,
        especie: especieDelCatalogo(g.especie),
        m3: g.m3,
        tipo: "rolliza",
        permiso: unicoONull(g.permisos),
        /* Una parte por el permiso de CADA troza: tres permisos de Tornillo
           son tres bloques, no uno de 96.957 m³ sin dueño. */
        partes: partirPorPermiso(g.trozas),
        aprovechablePct: PCT_TARJETA,
        piezasManual: null,
        piezas: g.piezas,
        trozaIds: g.trozaIds,
      });
    }
  }

  const lotes = lotesDeFuente(entrada.lotes, filtros);
  /* La especie de cada lote por su código, de TODOS los lotes (no sólo los
     filtrados): una corrida sin especie propia la hereda del lote que la
     alimentó, que es la madera que de verdad entró a la sierra. */
  const especiePorLote = new Map(
    entrada.lotes.map((l) => [txt(l.code).toUpperCase(), especieDeLote(l)] as const),
  );

  /* Piezas apartadas en un lote que TODAVÍA están enteras: siguen siendo
     rolliza, aunque ya tengan lote asignado. */
  for (const l of lotes) {
    if (!(l.apartadoM3 > MINIMO_M3)) continue;
    out.push({
      clave: `apartado:${l.id}`,
      fuente: "apartado",
      fuenteLabel: "Apartado en lotes, sin aserrar",
      etiqueta: `Lote ${l.code} · apartado`,
      especie: especieDeLote(l),
      m3: r4(l.apartadoM3),
      tipo: "rolliza",
      permiso: unicoONull(l.permisos),
      partes: partesDeLote(l, "libres", r4(l.apartadoM3), l.piezas),
      aprovechablePct: PCT_TARJETA,
      piezasManual: null,
      piezas: l.piezas,
      loteId: l.id,
    });
  }

  /* Lo que el lote todavía admite declarar bajo el tope: YA está en unidades de
     aserrada (es el margen del 56 % de lo que consumió), así que entra como
     aserrada directa. Contarlo como rolliza le aplicaría el rendimiento otra
     vez y ensuciaría el de la sierra con madera que la sierra no cortó. */
  for (const l of lotes) {
    const admite = admiteDelLote(l);
    if (!(admite > MINIMO_M3)) continue;
    out.push({
      clave: `lotes:${l.id}`,
      fuente: "lotes",
      fuenteLabel: "Lo que los lotes admiten",
      etiqueta: `Lote ${l.code} · margen`,
      especie: especieDeLote(l),
      m3: r4(admite),
      tipo: "aserrada",
      permiso: unicoONull(l.permisos),
      /* Un lote que juntó dos permisos se parte por lo que cada uno metió a
         la sierra; lo que sus piezas no explican, «Sin permiso». */
      partes: partesDeLote(l, "consumidas", r4(admite), 0),
      aprovechablePct: null,
      piezasManual: null,
      piezas: 0,
      loteId: l.id,
    });
  }

  /* Producto que sigue en el depósito: aserrada directa, una línea por corrida.
     El `paqueteId` es el mismo `ref` que usa el picker de paquetes, así que una
     corrida sembrada desde acá no se vuelve a ofrecer allá. */
  for (const c of corridasDeFuente(entrada.corridas ?? [], filtros)) {
    if (!(c.disponible > MINIMO_M3)) continue;
    /* Las PIEZAS, no los paquetes: un paquete de 43 tablas es 43 piezas, y
       contar bultos daría «1 pieza» sobre 5 m³ de madera. */
    const piezas = c.paquetes.reduce(
      (a, p) => a + (Number(p.volumenM3) > 0 ? Number(p.cantidad) || 0 : 0),
      0,
    );
    out.push({
      clave: `productos:${c.id}`,
      fuente: "productos",
      fuenteLabel: "Productos terminados",
      etiqueta: `${txt(c.producto) || "Producto"}${c.lote ? ` · ${c.lote}` : ""}`,
      especie:
        especieDelCatalogo(txt(c.especie)) || (especiePorLote.get(txt(c.lote).toUpperCase()) ?? ""),
      m3: r4(c.disponible),
      tipo: "aserrada",
      /* `titularOrigen` es el permiso (`originCode`) de las guías que la
         alimentaron —el mismo que filtra el desplegable de permisos—: uno solo
         viaja; varios se parten por lo consumido de cada uno y ninguno es
         «sin permiso». */
      permiso: unicoONull(c.titularOrigen),
      partes: partesDeCorrida(c, r4(c.disponible), piezas),
      aprovechablePct: null,
      piezasManual: null,
      paqueteId: `corrida:${c.id}`,
      /* El producto del libro dice qué es: «MADERA ASERRADA (COMERCIAL)» →
         «Comercial». El genérico «MADERA ASERRADA» no dice el tipo y queda
         null, que es la respuesta honesta. */
      tipoProducto: tipoComercialDelProducto(c.producto),
      piezas,
    });
  }

  return out;
}

/** Las partes de una línea: las suyas, o la línea entera como una sola. */
export function partesDeCandidato(
  c: Pick<CandidatoDeCapacidad, "permiso" | "m3" | "piezas" | "trozaIds"> & { partes?: ParteDePermiso[] },
): ParteDePermiso[] {
  if (c.partes && c.partes.length > 0) return c.partes;
  return [{ permiso: c.permiso ?? null, mezclado: false, m3: c.m3, piezas: c.piezas, trozaIds: c.trozaIds }];
}

/** Cada parte de cada línea, con su especie y tipo: lo que agrupa el resumen. */
export function itemsPorPermiso(
  candidatos: readonly (Pick<CandidatoDeCapacidad, "especie" | "tipo" | "m3" | "piezas"> &
    Partial<Pick<CandidatoDeCapacidad, "permiso" | "partes" | "trozaIds">>)[],
): ItemPorPermiso[] {
  return candidatos.flatMap((c) =>
    partesDeCandidato({ ...c, permiso: c.permiso ?? null }).map((p) => ({
      permiso: p.permiso,
      mezclado: p.mezclado,
      ...(p.sinAtribuir ? { sinAtribuir: true } : {}),
      especie: c.especie,
      tipo: c.tipo,
      m3: p.m3,
      piezas: p.piezas,
    })),
  );
}

/** m³ de rolliza y de aserrada de una selección — nunca sumados entre sí. */
export function totalesDeCandidatos(candidatos: readonly CandidatoDeCapacidad[]) {
  /* Regla GTF (2026-10-03): cada fila (permiso × especie × tipo, 2026-10-19)
     se redondea UNA vez a 3 decimales y el total suma esas filas — las MISMAS
     filas de la tabla «Lo que se va al cubicador» de al lado; con la suma
     cruda decían 8,148 y 8,149. */
  const filas = agruparPorPermiso(itemsPorPermiso(candidatos));
  const deTipo = (tipo: CandidatoDeCapacidad["tipo"]) =>
    totalizarGTF(filas.filter((f) => f.tipo === tipo)).m3;
  const rolliza = deTipo("rolliza");
  const aserrada = deTipo("aserrada");
  return {
    rolliza,
    aserrada,
    /** Lo que ampararía: la rolliza pasada por el % de la tarjeta, más la aserrada. */
    amparaM3: r4(rolliza * RENDIMIENTO_META + aserrada),
  };
}

/**
 * Los bloques de una línea, UNO POR PERMISO (Brandon, 2026-10-19: «al llevarlo
 * al bloque cubicador se pondrá así separado por permiso»). La ESPECIE viaja
 * siempre con cada uno (Brandon, 2026-10-02): es lo que agrupa el reparto, y
 * un bloque que llega vacío obliga a elegirla otra vez en la tabla.
 *
 * El permiso viaja en su campo (`permiso`, lo que el cubicador separa en
 * `porPermiso`), y en las trozas sueltas también en la etiqueta —es la columna
 * «GTF / lote» y lo que imprime el papel—, PRIMERO y en corto: «PLT-2021-017 ·
 * Tornillo · patio». Primero porque la casilla de la tabla corta el final y lo
 * que distingue a un bloque de otro es el permiso. Sin él, los tres bloques se
 * llamarían igual y la huella del cubicador (`etiqueta::especie`) sembraría uno
 * y daría los otros por repetidos — por eso, si dos permisos comparten el
 * código corto, va el código entero.
 * La etiqueta NO lleva el recorte del filtro (Brandon, 2026-09-09: la volvía
 * ilegible). Un lote o una corrida de UN permiso ya se nombran solos: una
 * parte, su nombre de siempre. Uno que juntó varios (2026-10-19) se nombra
 * igual que las trozas, permiso primero: «PLT-2021-017 · Tornillo · lote 7 ·
 * margen» y «PLT-2025-167 · Tornillo · lote 7 · margen».
 *
 * `partidoDe`: la etiqueta de la línea entera. Si la hoja ya tiene ESE bloque
 * de antes (todo junto, sin permiso) y es la misma madera, el cubicador lo
 * cambia por sus partes en vez de dejar las dos versiones (`unirSiembra`).
 * `etiquetaPrevia`: cómo se llamó la parte el 19-10 antes de poner el permiso
 * adelante («Trozas en el patio · TORNILLO · PLT-…»): la hoja que ya la tenga
 * la renombra en vez de sumarla otra vez.
 */
export function bloquesDeCandidato(c: CandidatoDeCapacidad): BloqueSembrable[] {
  const partes = partesDeCandidato(c);
  const deTrozas = c.fuente === "patio" || c.fuente === "porRecepcionar";
  /* Un lote o una corrida partidos por permiso: cada parte su nombre, o la
     huella daría la segunda por repetida (misma etiqueta, mismo `paqueteId`). */
  const partido = !deTrozas && partes.length > 1;
  const cortos = partes.map((p) => codigoCortoDePermiso(p.permiso));
  const fuente = c.fuente === "patio" ? "patio" : "por recepcionar";
  return partes.map((p, i) => {
    const corto = cortos[i]!;
    /* Dos títulos con la misma cola (`…PLT-2021-017` de dos regiones) no
       pueden llamarse igual: la huella descartaría el segundo. */
    const nombre = corto && cortos.indexOf(corto) !== cortos.lastIndexOf(corto) ? p.permiso! : corto;
    const ids = deTrozas ? p.trozaIds : c.trozaIds;
    return {
      etiqueta: deTrozas
        ? `${nombre || "Sin permiso"} · ${c.especie || "Sin especie"} · ${fuente}`
        : partido
          ? `${nombre || "Sin permiso"} · ${c.especie || "Sin especie"} · ${c.etiqueta.replace(/^Lote /, "lote ")}`
          : c.etiqueta,
      especie: c.especie,
      m3: p.m3,
      permiso: p.permiso,
      origen: "manual",
      tipo: c.tipo,
      aprovechablePct: c.aprovechablePct,
      piezasManual: c.piezasManual,
      costoM3: null,
      /* Qué tipo de madera es, cuando el Libro lo dice: es lo que permite
         sugerir el reproceso del lado del cubicador (ADR-404). */
      ...(c.tipoProducto ? { tipoProducto: c.tipoProducto } : {}),
      ...(p.piezas > 0 ? { piezasOrigen: p.piezas } : {}),
      ...(c.paqueteId ? { paqueteId: c.paqueteId } : {}),
      /* ADR-464: las trozas reales viajan con el bloque (sin ellas no puede
         crear su lote) y el lote de origen también — así la Distribución no
         ofrece armar otro lote ni vuelve a ofrecer ese mismo lote como bloque. */
      ...(ids && ids.length > 0 && ids.length <= MAX_TROZAS_POR_BLOQUE ? { trozaIds: [...ids] } : {}),
      ...(c.loteId ? { loteId: c.loteId } : {}),
      ...(deTrozas ? { partidoDe: c.etiqueta, etiquetaPrevia: `${c.etiqueta} · ${corto || "sin permiso"}` } : {}),
      /* El bloque entero de antes (mismo lote o misma corrida, sin partir) se
         cambia por sus partes si es la misma madera (`unirSiembra`). */
      ...(partido ? { partidoDe: c.etiqueta } : {}),
    };
  });
}

/**
 * Cómo llegan a la distribución: especie × permiso, con cuántos bloques lleva
 * cada uno, en el orden en que aparecen. `""` = sin especie (se dice, no se
 * esconde). Sin m³: troza y tabla no se suman entre sí.
 */
export function llegadasDeCandidatos(
  candidatos: readonly (Pick<CandidatoDeCapacidad, "especie" | "m3" | "piezas"> &
    Partial<Pick<CandidatoDeCapacidad, "permiso" | "partes" | "trozaIds">>)[],
): { clave: string; especie: string; permiso: string; permisoCompleto: string | null; bloques: number }[] {
  const norm = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const grupos = new Map<
    string,
    { clave: string; especie: string; permiso: string; permisoCompleto: string | null; bloques: number }
  >();
  for (const c of candidatos) {
    const especie = txt(c.especie);
    for (const p of partesDeCandidato({ ...c, permiso: c.permiso ?? null })) {
      const clave = `${norm(especie)}|${claveDePermiso(p)}`;
      const g = grupos.get(clave) ?? {
        clave,
        especie,
        permiso: etiquetaCortaDePermiso(p),
        permisoCompleto: p.permiso,
        bloques: 0,
      };
      g.bloques += 1;
      grupos.set(clave, g);
    }
  }
  return [...grupos.values()];
}
