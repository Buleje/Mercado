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

import { RENDIMIENTO_META } from "@/lib/forestal/loctp-catalogos";
import {
  admiteDelLote,
  corridasDeFuente,
  lotesDeFuente,
  trozasDeFuente,
  type ClaveFuente,
  type EntradaCapacidad,
  type FiltrosCapacidad,
} from "@/lib/forestal/capacidad-de-planta";

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
  /** `null` en aserrada directa: ahí no hay porcentaje que aplicar. */
  aprovechablePct: number | null;
  /** Piezas declaradas, si se saben. Es el tope del bloque de aserrada. */
  piezasManual: number | null;
  /** Para no sembrar dos veces la misma corrida (mismo `ref` que el picker de paquetes). */
  paqueteId?: string;
  /** Cuántas piezas hay detrás — informativo, para leer la línea en el modal. */
  piezas: number;
}

const PCT_TARJETA = Math.round(RENDIMIENTO_META * 100);

/** El único de la lista, o `null` si hay varios (o ninguno): no se inventa. */
function unicoONull(valores: readonly (string | null | undefined)[]): string | null {
  const unicos = [...new Set(valores.map(txt).filter(Boolean))];
  return unicos.length === 1 ? unicos[0] : null;
}

/** Agrupa trozas por especie; la especie vacía queda junta y se dice. */
function porEspecie(
  trozas: readonly { especieComun?: string | null; volumenM3?: number | string | null; permiso?: string | null }[],
) {
  const grupos = new Map<string, { especie: string; m3: number; piezas: number; permisos: (string | null)[] }>();
  for (const t of trozas) {
    const especie = txt(t.especieComun);
    const clave = especie.toUpperCase();
    const g = grupos.get(clave) ?? { especie, m3: 0, piezas: 0, permisos: [] };
    g.m3 = r4(g.m3 + (Number(t.volumenM3 ?? 0) || 0));
    g.piezas += 1;
    g.permisos.push(t.permiso ?? null);
    grupos.set(clave, g);
  }
  return [...grupos.values()].sort((a, b) => b.m3 - a.m3);
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
        especie: g.especie,
        m3: g.m3,
        tipo: "rolliza",
        permiso: unicoONull(g.permisos),
        aprovechablePct: PCT_TARJETA,
        piezasManual: null,
        piezas: g.piezas,
      });
    }
  }

  const lotes = lotesDeFuente(entrada.lotes, filtros);

  /* Piezas apartadas en un lote que TODAVÍA están enteras: siguen siendo
     rolliza, aunque ya tengan lote asignado. */
  for (const l of lotes) {
    if (!(l.apartadoM3 > MINIMO_M3)) continue;
    out.push({
      clave: `apartado:${l.id}`,
      fuente: "apartado",
      fuenteLabel: "Apartado en lotes, sin aserrar",
      etiqueta: `Lote ${l.code} · apartado`,
      especie: txt(l.especie),
      m3: r4(l.apartadoM3),
      tipo: "rolliza",
      permiso: unicoONull(l.permisos),
      aprovechablePct: PCT_TARJETA,
      piezasManual: null,
      piezas: l.piezas,
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
      especie: txt(l.especie),
      m3: r4(admite),
      tipo: "aserrada",
      permiso: unicoONull(l.permisos),
      aprovechablePct: null,
      piezasManual: null,
      piezas: 0,
    });
  }

  /* Producto que sigue en el depósito: aserrada directa, una línea por corrida.
     El `paqueteId` es el mismo `ref` que usa el picker de paquetes, así que una
     corrida sembrada desde acá no se vuelve a ofrecer allá. */
  for (const c of corridasDeFuente(entrada.corridas ?? [], filtros)) {
    if (!(c.disponible > MINIMO_M3)) continue;
    const piezas = c.paquetes.reduce((a, p) => a + (Number(p.volumenM3) > 0 ? 1 : 0), 0);
    out.push({
      clave: `productos:${c.id}`,
      fuente: "productos",
      fuenteLabel: "Productos terminados",
      etiqueta: `${txt(c.producto) || "Producto"}${c.lote ? ` · ${c.lote}` : ""}`,
      especie: txt(c.especie),
      m3: r4(c.disponible),
      tipo: "aserrada",
      /* Igual que el picker de paquetes: el payload trae GTF y titular, no el
         título habilitante, y un permiso inventado es peor que uno vacío. */
      permiso: null,
      aprovechablePct: null,
      piezasManual: null,
      paqueteId: `corrida:${c.id}`,
      piezas,
    });
  }

  return out;
}

/** m³ de rolliza y de aserrada de una selección — nunca sumados entre sí. */
export function totalesDeCandidatos(candidatos: readonly CandidatoDeCapacidad[]) {
  const rolliza = r4(candidatos.filter((c) => c.tipo === "rolliza").reduce((a, c) => a + c.m3, 0));
  const aserrada = r4(candidatos.filter((c) => c.tipo === "aserrada").reduce((a, c) => a + c.m3, 0));
  return {
    rolliza,
    aserrada,
    /** Lo que ampararía: la rolliza pasada por el % de la tarjeta, más la aserrada. */
    amparaM3: r4(rolliza * RENDIMIENTO_META + aserrada),
  };
}
