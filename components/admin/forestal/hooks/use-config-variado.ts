/**
 * use-config-variado — la especie «Variado» del cubicador (Brandon, 2026-10-02):
 * qué medidas entran en un paquete 6×6 y qué especies no lo reciben.
 *
 * La config vive en localStorage con la clave del cubicador por negocio
 * (`slugKey("-variado")`, igual que `-meta`): la escribe el panel «Variado» del
 * cubicado y la leen el cubicado y la Distribución. Sin storage (modo privado)
 * sirve igual: vale lo de la sesión y, al recargar, el default.
 *
 * El desglose en sí es de `lib/forestal/variado-desglose.ts`; acá sólo se lo
 * engancha al lote del cubicador para el papel (Anexo 04) y el envío al Libro.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import type { BloqueRolliza } from "@/lib/forestal/cubicacion-reparto";
import { slugKey } from "@/lib/forestal/sembrar-reparto";
import {
  desglosarVariado,
  esVariado,
  leerConfigVariado,
  type ConfigVariado,
  type MotivoSinDesglosar,
  type ResultadoVariado,
} from "@/lib/forestal/variado-desglose";

/** Avisa a los demás lectores de ESTA pestaña (el `storage` sólo llega a las otras). */
const EVENTO_CFG = "buleje-variado-cfg";
const claveConfig = () => slugKey("-variado");
/** Los bloques de la Distribución: la misma clave que escribe `ResumenReparto`. */
const claveBloques = () => slugKey("-rolliza");

function leerCrudo(clave: string): string | null {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(clave); } catch { return null; }
}

function parsear(raw: string | null): unknown {
  if (!raw) return null;
  try { return JSON.parse(raw) as unknown; } catch { return null; }
}

const leerConfigGuardada = (): ConfigVariado => leerConfigVariado(parsear(leerCrudo(claveConfig())));

/** La config del Variado, recordada por negocio. `guardar` valida igual que al leer. */
export function useConfigVariado(): { cfg: ConfigVariado; guardar: (next: ConfigVariado) => void } {
  const [cfg, setCfg] = useState<ConfigVariado>(leerConfigGuardada);
  useEffect(() => {
    const onEvento = (e: Event) => {
      const d = (e as CustomEvent<ConfigVariado>).detail;
      if (d) setCfg(d);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === claveConfig()) setCfg(leerConfigGuardada());
    };
    window.addEventListener(EVENTO_CFG, onEvento);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENTO_CFG, onEvento);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  const guardar = useCallback((next: ConfigVariado) => {
    const limpia = leerConfigVariado(next);
    setCfg(limpia);
    try { localStorage.setItem(claveConfig(), JSON.stringify(limpia)); } catch { /* modo privado: vale para la sesión */ }
    window.dispatchEvent(new CustomEvent<ConfigVariado>(EVENTO_CFG, { detail: limpia }));
  }, []);
  return { cfg, guardar };
}

function bloquesDe(raw: string | null): BloqueRolliza[] {
  const v = parsear(raw);
  return Array.isArray(v) ? (v as BloqueRolliza[]) : [];
}

/**
 * Los bloques que dejó cargados la Distribución (Resúmenes). Se leen al montar
 * —cada herramienta se monta al elegirla— y cuando otra pestaña los cambia; el
 * texto crudo se compara antes de pisar el estado para no redibujar la tabla
 * del cubicador por nada.
 */
function useBloquesDelReparto(activo: boolean): BloqueRolliza[] {
  const [estado, setEstado] = useState<{ raw: string | null; bloques: BloqueRolliza[] }>(() => {
    const raw = activo ? leerCrudo(claveBloques()) : null;
    return { raw, bloques: bloquesDe(raw) };
  });
  useEffect(() => {
    if (!activo) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== null && e.key !== claveBloques()) return;
      const raw = leerCrudo(claveBloques());
      setEstado((prev) => (prev.raw === raw ? prev : { raw, bloques: bloquesDe(raw) }));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [activo]);
  return estado.bloques;
}

/** Paquetes 6×6 Variado del lote (la `cantidad` de cada fila es la de paquetes). */
export const paquetesVariado = (filas: readonly PiezaCubicada[]): number =>
  filas.reduce((a, r) => a + (esVariado(r.especie) ? Math.max(0, Math.round(r.cantidad)) : 0), 0);

/**
 * Las filas del papel con el Variado abierto en sus medidas y especies. El
 * desglose se calcula UNA vez sobre el lote entero (las proporciones salen del
 * lote, no de lo tildado) y acá cada fila Variado se cambia por sus piezas
 * —`desglosarVariado` las nombra `${id}-v-N`—, en el orden del papel.
 */
export function abrirVariado(filas: readonly PiezaCubicada[], des: ResultadoVariado): PiezaCubicada[] {
  const abiertos = new Set(des.grupos.map((g) => g.origenId));
  if (abiertos.size === 0) return [...filas];
  const hijos = new Map<string, PiezaCubicada[]>();
  for (const p of des.piezas) {
    const corte = p.id.lastIndexOf("-v-");
    if (corte <= 0) continue;
    const origen = p.id.slice(0, corte);
    if (!abiertos.has(origen)) continue;
    const lista = hijos.get(origen);
    if (lista) lista.push(p);
    else hijos.set(origen, [p]);
  }
  return filas.flatMap((r) => hijos.get(r.id) ?? [r]);
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Por qué no se puede sacar el papel: una línea, la causa que se arregla primero. */
export function motivoSinDesglosar(lista: readonly { motivo: MotivoSinDesglosar }[]): string | null {
  if (lista.length === 0) return null;
  const cuenta = (m: MotivoSinDesglosar) => lista.filter((x) => x.motivo === m).length;
  const no6x6 = cuenta("no-6x6");
  if (no6x6 > 0) return `${plural(no6x6, "fila Variado no es", "filas Variado no son")} 6×6: Variado es sólo para paquetes de 6×6.`;
  if (cuenta("sin-especies") > 0) {
    return "El Variado no tiene especies donde repartirse: carga los bloques en Resúmenes › Distribución o quita excepciones.";
  }
  return `${plural(cuenta("no-cierra"), "fila Variado no cierra", "filas Variado no cierran")} con las medidas que entran: revisa «Variado».`;
}

export interface VariadoDelLote {
  cfg: ConfigVariado;
  guardar: (next: ConfigVariado) => void;
  bloques: BloqueRolliza[];
  /** Hay al menos una fila Variado en el lote. */
  hay: boolean;
  paquetes: number;
  /** El desglose del lote entero; `null` sin Variado. */
  des: ResultadoVariado | null;
  /** Lo que frena «Enviar al Libro» (todo el lote) y el Anexo 04 (lo del papel). */
  bloqueoEnvio: string | null;
  bloqueoPapel: string | null;
  /** El lote y el papel con el Variado abierto (iguales a la entrada sin Variado). */
  envio: PiezaCubicada[];
  papel: PiezaCubicada[];
}

/**
 * El Variado del lote del cubicador. `activo` = sólo el cubicador de
 * Herramientas: es el único lote que lee la Distribución, de donde salen las
 * especies del reparto.
 */
export function useVariadoDelLote(
  rows: PiezaCubicada[],
  rowsParaPapel: PiezaCubicada[],
  activo: boolean,
): VariadoDelLote {
  const { cfg, guardar } = useConfigVariado();
  const bloques = useBloquesDelReparto(activo);
  const hay = useMemo(() => activo && rows.some((r) => esVariado(r.especie)), [activo, rows]);
  const des = useMemo(() => (hay ? desglosarVariado(rows, bloques, cfg) : null), [hay, rows, bloques, cfg]);
  return useMemo(() => {
    if (!des) {
      return { cfg, guardar, bloques, hay, paquetes: 0, des, bloqueoEnvio: null, bloqueoPapel: null, envio: rows, papel: rowsParaPapel };
    }
    const enPapel = new Set(rowsParaPapel.map((r) => r.id));
    return {
      cfg, guardar, bloques, hay, des,
      paquetes: paquetesVariado(rows),
      bloqueoEnvio: motivoSinDesglosar(des.sinDesglosar),
      bloqueoPapel: motivoSinDesglosar(des.sinDesglosar.filter((s) => enPapel.has(s.id))),
      envio: abrirVariado(rows, des),
      papel: abrirVariado(rowsParaPapel, des),
    };
  }, [cfg, guardar, bloques, hay, des, rows, rowsParaPapel]);
}
