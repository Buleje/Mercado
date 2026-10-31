"use client";

/**
 * useConteoGuiaTh — contar las trozas de la guía del Libro TH mientras bajan
 * del camión (ADR-450 L1).
 *
 * Cada troza de la guía está en uno de tres estados: sin contar, llegó (la
 * escaneaste o la marcaste a mano, igual a la guía o con otra medida) o no
 * llegó. Lo que se manda al servidor sale de acá y sigue su regla: TODAS las
 * trozas, una vez cada una; la que no se contó va `llego: false` sólo si quien
 * recibe marcó «La que no conté no llegó».
 *
 * El pie y el resumen por especie se calculan con `resumenConteo` —la MISMA
 * función con que el servidor decide— así que lo que se ve es lo que entra.
 *
 * Las funciones puras van exportadas para el test.
 */

import { useCallback, useMemo, useState } from "react";
import { MAX_DIAMETRO_CM } from "@/lib/forestal/medidas-troza";
import {
  MAX_LARGO_RECIBIDO_M,
  MAX_SOBRANTES,
  medidaRecibidaFinal,
  resumenConteo,
  type ComoSeConto,
  type MedidaRecibida,
  type MedidaRecibidaFinal,
  type ResumenConteo,
  type TrozaContadaInput,
} from "@/lib/forestal/conteo-guia-th";
import type { LineaDeIngresoTh, TrozaDeIngresoTh } from "@/lib/forestal/guia-th-al-ctp";

/** Lo escrito en «Llegó distinta», tal cual se tipea (coma o punto). */
export interface MedidaEscrita {
  d1: string;
  d2: string;
  largo: string;
}

export interface MarcaConteo {
  estado: "llego" | "no_llego";
  como: ComoSeConto;
  /** La fila de «Llegó distinta» abierta, con lo escrito; `null` = cerrada. */
  medida: MedidaEscrita | null;
}

export type EstadoFila = "sin_contar" | "llego" | "distinta" | "no_llego";

export interface FilaConteo {
  troza: TrozaDeIngresoTh;
  /** El código como se pinta en la testa; `N° 3` si la guía no lo trae. */
  codigo: string;
  especie: string;
  estado: EstadoFila;
  como: ComoSeConto | null;
  medida: MedidaEscrita | null;
  /** Lo medido en planta completado con la guía; `null` = mide lo que dice la guía. */
  final: MedidaRecibidaFinal | null;
  /** m³ de planta − m³ de la guía (negativo = llegó más chica). */
  diferenciaM3: number | null;
  /** Por qué lo escrito no vale (se dice en la fila y frena «Recibir»). */
  errorMedida: string | null;
}

// ── Puras ───────────────────────────────────────────────────────────────────

/** `""` → null · `"4,20"` → 4.2 · basura → NaN. */
export function numeroEscrito(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : Number.NaN;
}

const texto = (v: number | null): string => (v == null ? "" : String(Math.round(v * 1000) / 1000));

/** La fila de «Llegó distinta» arranca con las medidas de la guía puestas. */
export function medidaDeLaGuia(t: Pick<TrozaDeIngresoTh, "d1Cm" | "d2Cm" | "largoM">): MedidaEscrita {
  return { d1: texto(t.d1Cm), d2: texto(t.d2Cm), largo: texto(t.largoM) };
}

/** Lo escrito → la medida que viaja, o por qué no vale. */
export function leerMedidaEscrita(m: MedidaEscrita): { medida: MedidaRecibida; error: null } | { medida: null; error: string } {
  const d1 = numeroEscrito(m.d1);
  const d2 = numeroEscrito(m.d2);
  const largo = numeroEscrito(m.largo);
  const malDiametro = [d1, d2].some((d) => d != null && (!(d > 0) || d > MAX_DIAMETRO_CM));
  if (malDiametro) return { medida: null, error: `El diámetro va en cm, entre 1 y ${MAX_DIAMETRO_CM}.` };
  if (largo != null && (!(largo > 0) || largo > MAX_LARGO_RECIBIDO_M)) {
    return { medida: null, error: `El largo va en metros, hasta ${MAX_LARGO_RECIBIDO_M}.` };
  }
  return { medida: { d1Cm: d1, d2Cm: d2, largoM: largo }, error: null };
}

/** Las trozas de la guía en su orden, con la especie de su renglón. */
export function trozasDeLaGuia(lineas: readonly LineaDeIngresoTh[]): { troza: TrozaDeIngresoTh; especie: string }[] {
  return lineas
    .flatMap((l) => l.trozas.map((troza) => ({ troza, especie: l.especieComun })))
    .sort((a, b) => a.troza.orden - b.troza.orden);
}

export const codigoDeTroza = (t: Pick<TrozaDeIngresoTh, "codificacion" | "orden">): string =>
  t.codificacion?.trim() || `N° ${t.orden}`;

/** Una fila, con su estado y lo que la medida de planta cambia. */
export function filaDeConteo(
  troza: TrozaDeIngresoTh,
  especie: string,
  marca: MarcaConteo | undefined,
  restoNoLlego: boolean,
): FilaConteo {
  const base = { troza, codigo: codigoDeTroza(troza), especie, final: null, diferenciaM3: null, errorMedida: null };
  if (!marca) {
    return { ...base, estado: restoNoLlego ? "no_llego" : "sin_contar", como: null, medida: null };
  }
  if (marca.estado === "no_llego") return { ...base, estado: "no_llego", como: null, medida: null };
  if (!marca.medida) return { ...base, estado: "llego", como: marca.como, medida: null };
  const leida = leerMedidaEscrita(marca.medida);
  const final = leida.medida ? medidaRecibidaFinal(troza, leida.medida) : null;
  const v = Number(troza.volumenM3 ?? 0);
  return {
    ...base,
    estado: "distinta",
    como: marca.como,
    medida: marca.medida,
    final,
    diferenciaM3: final?.volumenM3 != null ? Math.round((final.volumenM3 - v) * 10000) / 10000 : null,
    errorMedida: leida.error,
  };
}

/** Lo que se cuenta en vivo: sólo lo marcado (el resto es «sin contar»). */
function marcadas(filas: readonly FilaConteo[]): TrozaContadaInput[] {
  const out: TrozaContadaInput[] = [];
  for (const f of filas) {
    if (f.estado === "sin_contar") continue;
    if (f.estado === "no_llego") {
      out.push({ orden: f.troza.orden, llego: false });
      continue;
    }
    const leida = f.medida ? leerMedidaEscrita(f.medida) : null;
    out.push({
      orden: f.troza.orden,
      llego: true,
      como: f.como ?? "a_mano",
      ...(leida?.medida && f.final ? { medida: leida.medida } : {}),
    });
  }
  return out;
}

/**
 * El `conteo` del POST: TODAS las trozas de la guía, una vez cada una. `null`
 * si todavía no se puede mandar (hay sin contar sin la casilla, o una medida
 * mal escrita): la pantalla nunca manda un conteo que el servidor rechazaría.
 */
export function conteoParaEnviar(filas: readonly FilaConteo[]): { conteo: TrozaContadaInput[]; confirmaFaltantes: boolean } | null {
  if (filas.some((f) => f.estado === "sin_contar" || f.errorMedida)) return null;
  const conteo = marcadas(filas);
  return { conteo, confirmaFaltantes: conteo.some((c) => !c.llego) };
}

// ── Hook ────────────────────────────────────────────────────────────────────

interface EstadoConteo {
  /** La lista que se está contando: si cambia (la guía se volvió a abrir), el conteo arranca de cero. */
  huella: string | null;
  marcas: ReadonlyMap<number, MarcaConteo>;
  sobrantes: readonly string[];
  restoNoLlego: boolean;
}

const vacio = (huella: string | null): EstadoConteo => ({ huella, marcas: new Map(), sobrantes: [], restoNoLlego: false });

export interface ConteoGuiaTh {
  filas: FilaConteo[];
  resumen: ResumenConteo | null;
  sobrantes: readonly string[];
  restoNoLlego: boolean;
  setRestoNoLlego: (v: boolean) => void;
  marcarLlego: (orden: number, como: ComoSeConto) => void;
  marcarNoLlego: (orden: number) => void;
  desmarcar: (orden: number) => void;
  abrirDistinta: (orden: number) => void;
  cerrarDistinta: (orden: number) => void;
  escribirMedida: (orden: number, campo: keyof MedidaEscrita, valor: string) => void;
  llegaronTodas: () => void;
  elRestoNoLlego: () => void;
  anotarSobrante: (codigo: string) => void;
  /** El cuerpo del POST, o `null` si todavía no se puede recibir. */
  envio: ReturnType<typeof conteoParaEnviar>;
}

export function useConteoGuiaTh(lineas: readonly LineaDeIngresoTh[] | null, huella: string | null): ConteoGuiaTh {
  const [estado, setEstado] = useState<EstadoConteo>(() => vacio(huella));
  /* Otra lista (se volvió a abrir tras «la guía cambió»): lo contado ya no vale. */
  const actual = estado.huella === huella ? estado : vacio(huella);
  if (actual !== estado) setEstado(actual);

  const piezas = useMemo(() => (lineas ? trozasDeLaGuia(lineas) : []), [lineas]);
  const filas = useMemo(
    () => piezas.map(({ troza, especie }) => filaDeConteo(troza, especie, actual.marcas.get(troza.orden), actual.restoNoLlego)),
    [piezas, actual.marcas, actual.restoNoLlego],
  );
  /* En vivo: la casilla «la que no conté no llegó» no cuenta como contada. */
  const resumen = useMemo(
    () => (lineas ? resumenConteo(lineas, marcadas(filas.filter((f) => actual.marcas.has(f.troza.orden)))) : null),
    [lineas, filas, actual.marcas],
  );

  const mutar = useCallback((f: (m: Map<number, MarcaConteo>) => void) => {
    setEstado((prev) => {
      const m = new Map(prev.marcas);
      f(m);
      return { ...prev, marcas: m };
    });
  }, []);

  const marcarLlego = useCallback(
    (orden: number, como: ComoSeConto) =>
      mutar((m) => {
        const antes = m.get(orden);
        /* Escanear una que se abrió «distinta» no borra lo medido. */
        m.set(orden, { estado: "llego", como, medida: antes?.estado === "llego" ? antes.medida : null });
      }),
    [mutar],
  );
  const marcarNoLlego = useCallback((orden: number) => mutar((m) => void m.set(orden, { estado: "no_llego", como: "a_mano", medida: null })), [mutar]);
  const desmarcar = useCallback((orden: number) => mutar((m) => void m.delete(orden)), [mutar]);
  const abrirDistinta = useCallback(
    (orden: number) =>
      mutar((m) => {
        const t = piezas.find((p) => p.troza.orden === orden)?.troza;
        if (!t) return;
        const antes = m.get(orden);
        m.set(orden, { estado: "llego", como: antes?.estado === "llego" ? antes.como : "a_mano", medida: medidaDeLaGuia(t) });
      }),
    [mutar, piezas],
  );
  const cerrarDistinta = useCallback(
    (orden: number) =>
      mutar((m) => {
        const antes = m.get(orden);
        if (antes) m.set(orden, { ...antes, medida: null });
      }),
    [mutar],
  );
  const escribirMedida = useCallback(
    (orden: number, campo: keyof MedidaEscrita, valor: string) =>
      mutar((m) => {
        const antes = m.get(orden);
        if (antes?.medida) m.set(orden, { ...antes, medida: { ...antes.medida, [campo]: valor } });
      }),
    [mutar],
  );
  const llegaronTodas = useCallback(
    () =>
      mutar((m) => {
        for (const { troza } of piezas) {
          if (m.get(troza.orden)?.estado !== "llego") m.set(troza.orden, { estado: "llego", como: "a_mano", medida: null });
        }
      }),
    [mutar, piezas],
  );
  const elRestoNoLlego = useCallback(
    () =>
      mutar((m) => {
        for (const { troza } of piezas) if (!m.has(troza.orden)) m.set(troza.orden, { estado: "no_llego", como: "a_mano", medida: null });
      }),
    [mutar, piezas],
  );
  const anotarSobrante = useCallback(
    (codigo: string) =>
      setEstado((prev) => {
        const c = codigo.trim().slice(0, 60);
        if (!c || prev.sobrantes.includes(c) || prev.sobrantes.length >= MAX_SOBRANTES) return prev;
        return { ...prev, sobrantes: [...prev.sobrantes, c] };
      }),
    [],
  );
  const setRestoNoLlego = useCallback((v: boolean) => setEstado((prev) => ({ ...prev, restoNoLlego: v })), []);

  return {
    filas,
    resumen,
    sobrantes: actual.sobrantes,
    restoNoLlego: actual.restoNoLlego,
    setRestoNoLlego,
    marcarLlego,
    marcarNoLlego,
    desmarcar,
    abrirDistinta,
    cerrarDistinta,
    escribirMedida,
    llegaronTodas,
    elRestoNoLlego,
    anotarSobrante,
    envio: useMemo(() => conteoParaEnviar(filas), [filas]),
  };
}
