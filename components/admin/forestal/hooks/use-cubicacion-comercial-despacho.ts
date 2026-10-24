"use client";

/**
 * «Cubicación comercial» de un despacho del Libro CTP (ADR-483, contrato K7 §8-A).
 *
 * La oficial (la del libro, la de la GTF) no se toca: ésta es la que se COBRA,
 * con descuentos, ligada a la cuenta del cliente (o del que te vende). Dos modos:
 *   - «Uno por uno»: una cubicación guardada del Cubicador de madera; el
 *     servidor copia SUS piezas por `cubicacionRefId` (no las del cuerpo).
 *   - «Rápida»: el PT por especie (o uno «General») tipeado por la persona;
 *     el m³ es informativo y el servidor nunca lo convierte a PT para pagar.
 *
 * Todo número de acá es VISTA PREVIA con las mismas funciones puras que usa el
 * servidor (`lineasDeEspecie` + `aplicarDescuentoLote`); el servidor recalcula.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { z } from "zod";
import { cubicarPieza } from "@/lib/forestal/cubicacion";
import { aplicarDescuentoLote, DescuentoInvalidoError, lineasDeEspecie, ptSugeridoDeM3 } from "@/lib/forestal/cubicacion-comercial";
import type { DescuentoLote, guardarAserradaSchema, PrefillOrigenDespacho } from "@/lib/forestal/cubicacion-comercial-tipos";
import type { LineaEspecie } from "@/lib/forestal/cubicacion-cuenta";
import type { CubicacionRegistro } from "@/lib/forestal/cubicacion-registro";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import { limaDateKey } from "@/lib/utils";
import { jsonPost, pedir, RUTA_CUBICACIONES_TROZAS, unaCubicacion, type SentidoCubicacion } from "./use-cubicaciones-trozas";

export type CuerpoAserrada = z.input<typeof guardarAserradaSchema>;
export type ModoComercial = "pieza" | "total";

/** Una línea del modo rápido, como se tipea. `de` dice de dónde salió el PT hasta que se toque. */
export interface LineaRapida {
  key: string;
  especie: string;
  pt: string;
  m3: string;
  piezas: string;
  de: "libro" | "sugerido" | null;
}
export interface DescuentosForm {
  pct: string;
  porEspecie: Record<string, { pct: string; menos: string }>;
}
export type VistaComercial =
  | { brutas: LineaEspecie[]; netas: LineaEspecie[]; bruto: number; neto: number }
  | { brutas: LineaEspecie[]; error: string }
  | null;

/** «1,5» o «1.5» → 1.5; vacío, cero o raro → null. */
export const leerNumero = (s: string): number | null => {
  const t = s.trim().replace(/\s/g, "").replace(",", ".");
  const n = Number(t);
  return t && Number.isFinite(n) && n > 0 ? n : null;
};
const nuevaKey = () => `l-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
export const lineaVacia = (especie = ""): LineaRapida => ({ key: nuevaKey(), especie, pt: "", m3: "", piezas: "", de: null });

/** Lo que dice el LIBRO, una línea por especie (las repetidas se suman). El PT queda vacío: lo pone la persona. */
export function lineasDelLibro(libro: PrefillOrigenDespacho["lineas"]): LineaRapida[] {
  const por = new Map<string, { especie: string; m3: number | null; piezas: number | null }>();
  for (const l of libro) {
    const k = claveEspecie(l.especie) || l.especie;
    const a = por.get(k) ?? { especie: l.especie, m3: null, piezas: null };
    if (l.m3 != null) a.m3 = (a.m3 ?? 0) + l.m3;
    if (l.piezas != null) a.piezas = (a.piezas ?? 0) + l.piezas;
    por.set(k, a);
  }
  return [...por.values()].map((a) => ({
    ...lineaVacia(a.especie),
    m3: a.m3 != null ? String(Math.round(a.m3 * 10_000) / 10_000).replace(".", ",") : "",
    piezas: a.piezas != null ? String(a.piezas) : "",
  }));
}

/** «≈ desde el libro»: el PT que el libro anotó; si no lo tiene, m³ × 424 (rotulado «sugerido»). */
export function sugerirPt(l: LineaRapida, libro: PrefillOrigenDespacho["lineas"]): LineaRapida {
  const k = claveEspecie(l.especie);
  const delLibro = libro.filter((x) => (claveEspecie(x.especie) || x.especie) === k);
  if (delLibro.length && delLibro.every((x) => x.ptLibro != null)) {
    const pt = delLibro.reduce((s, x) => s + (x.ptLibro ?? 0), 0);
    return { ...l, pt: String(Math.round(pt * 100) / 100).replace(".", ","), de: "libro" };
  }
  const m3 = leerNumero(l.m3);
  return m3 != null ? { ...l, pt: String(ptSugeridoDeM3(m3)).replace(".", ","), de: "sugerido" } : l;
}

/** El formulario → `DescuentoLote` (null si no hay ninguno). */
export function aDescuentoLote(f: DescuentosForm): DescuentoLote | null {
  const porEspecie = Object.entries(f.porEspecie)
    .map(([clave, d]) => ({ clave, pct: leerNumero(d.pct), menos: leerNumero(d.menos) }))
    .filter((d) => d.pct != null || d.menos != null);
  const pct = leerNumero(f.pct);
  if (pct == null && !porEspecie.length) return null;
  return { ...(pct != null ? { pct } : {}), ...(porEspecie.length ? { porEspecie } : {}) };
}

/** Bruto por especie → descuentos del lote → neto, con las funciones del servidor. */
export function vistaComercial(medidas: ReadonlyArray<{ especie: string; volumen: number }>, modo: ModoComercial, d: DescuentoLote | null): VistaComercial {
  if (!medidas.length) return null;
  const trozas = medidas.map((m, i) => ({ n: i + 1, ...m }));
  const brutas = lineasDeEspecie({ material: "aserrada", modo, formula: "tablar", trozas });
  try {
    const r = aplicarDescuentoLote(brutas, d, "tablar");
    return { brutas, netas: r.lineas, bruto: r.bruto, neto: r.neto };
  } catch (e) {
    return { brutas, error: e instanceof DescuentoInvalidoError ? e.message : "Un descuento no cuadra con el lote." };
  }
}

/** GET …/cubicaciones-trozas/origen?tipo=despacho&id= */
export function usePrefillDespacho(despachoId: string) {
  const [prefill, setPrefill] = useState<PrefillOrigenDespacho | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vuelta, setVuelta] = useState(0);
  const [recargando, setRecargando] = useState(false);
  useEffect(() => {
    let vivo = true;
    setError(null);
    const url = `${RUTA_CUBICACIONES_TROZAS}/origen?tipo=despacho&id=${encodeURIComponent(despachoId)}`;
    void pedir(url, { cache: "no-store" }, (j) => ((j ?? {}) as { prefill?: PrefillOrigenDespacho }).prefill ?? null).then((r) => {
      if (!vivo) return;
      setRecargando(false);
      if (r.ok && r.data?.tipo === "despacho") setPrefill(r.data);
      else setError(r.ok ? "El servidor no devolvió el despacho." : r.mensaje);
    });
    return () => { vivo = false; };
  }, [despachoId, vuelta]);
  const recargar = useCallback(() => { setRecargando(true); setVuelta((v) => v + 1); }, []);
  return { prefill, cargando: !prefill && !error, recargando, error, recargar };
}

/**
 * Las piezas de las cubicaciones guardadas del Cubicador de madera (KV), para
 * la vista previa por especie de «Uno por uno». Se piden cuando hace falta y
 * otra vez cuando cambia `vuelta` (el despacho se recargó: puede haber una nueva).
 */
export function useGuardadasDelCubicador(despachoId: string, activo: boolean, vuelta: unknown) {
  const [registros, setRegistros] = useState<CubicacionRegistro[] | null>(null);
  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    void pedir(`/api/admin/forestal/cubicaciones?despachoId=${encodeURIComponent(despachoId)}`, { cache: "no-store" },
      (j) => ((j ?? {}) as { cubicaciones?: CubicacionRegistro[] }).cubicaciones ?? []).then((r) => {
      if (vivo) setRegistros(r.ok ? r.data : []);
    });
    return () => { vivo = false; };
  }, [activo, despachoId, vuelta]);
  return registros;
}

/** Las piezas de UNA guardada → PT bruto por medida (como `piezaNeta` sin descuento). */
export function medidasDeRegistro(r: CubicacionRegistro | undefined): Array<{ especie: string; volumen: number }> {
  /* El mismo respaldo que el servidor (`piezasDelRegistro`): la especie del registro antes que «Sin especie». */
  return (r?.piezas ?? []).map((p) => ({ especie: p.especie?.trim() || r?.especie?.trim() || "Sin especie", volumen: cubicarPieza(p).pieTablar }));
}

/** El estado del formulario y la vista previa; el modal sólo dibuja. */
export function useFormularioComercial(prefill: PrefillOrigenDespacho | null) {
  const [modo, setModo] = useState<ModoComercial>("total");
  const [refId, setRefId] = useState("");
  const [lineas, setLineas] = useState<LineaRapida[]>([]);
  const [descuentos, setDescuentos] = useState<DescuentosForm>({ pct: "", porEspecie: {} });
  const [sentido, setSentido] = useState<SentidoCubicacion>("venta");
  const [fecha, setFecha] = useState(() => limaDateKey());
  const [notas, setNotas] = useState("");

  const [iniciado, setIniciado] = useState(false);

  /* Al llegar el despacho: con una guardada ligada, «Uno por uno» con ella; si
     no, «Rápida» con las especies del libro. Al recargar no se pisa lo tipeado:
     sólo se elige la ligada nueva si todavía no había ninguna elegida. */
  useEffect(() => {
    if (!prefill) return;
    const ligada = prefill.guardadas.find((g) => g.ligada) ?? null;
    if (iniciado) {
      if (ligada) setRefId((r) => r || ligada.id);
      return;
    }
    setIniciado(true);
    setModo(ligada ? "pieza" : "total");
    setRefId(ligada?.id ?? "");
    setLineas(prefill.lineas.length ? lineasDelLibro(prefill.lineas) : [lineaVacia("General")]);
    /* La fecha del despacho (date-only); si viniera futura, hoy: el servidor no acepta mañana. */
    const delDespacho = prefill.fecha.slice(0, 10);
    setFecha(/^\d{4}-\d{2}-\d{2}$/.test(delDespacho) && delDespacho <= limaDateKey() ? delDespacho : limaDateKey());
  }, [prefill, iniciado]);

  return { modo, setModo, refId, setRefId, lineas, setLineas, descuentos, setDescuentos, sentido, setSentido, fecha, setFecha, notas, setNotas };
}

/** Las medidas del modo elegido, listas para `vistaComercial`. */
export function useMedidasDelModo(modo: ModoComercial, lineas: LineaRapida[], refId: string, registros: CubicacionRegistro[] | null) {
  return useMemo(() => {
    if (modo === "total") {
      return lineas.flatMap((l) => {
        const pt = leerNumero(l.pt);
        return pt != null && l.especie.trim() ? [{ especie: l.especie.trim(), volumen: pt }] : [];
      });
    }
    return medidasDeRegistro(registros?.find((r) => r.id === refId));
  }, [modo, lineas, refId, registros]);
}

/** El cuerpo del POST (material aserrada, origen despacho). */
export function cuerpoComercial(p: {
  despachoId: string; modo: ModoComercial; refId: string; lineas: LineaRapida[]; descuentos: DescuentoLote | null;
  persona: { beneficiarioId: string | null; parteId: string | null } | null; sentido: SentidoCubicacion; fecha: string; notas: string;
}): CuerpoAserrada {
  return {
    material: "aserrada",
    modo: p.modo,
    fecha: p.fecha,
    beneficiarioId: p.persona?.beneficiarioId ?? undefined,
    parteId: p.persona?.parteId ?? undefined,
    sentido: p.sentido,
    origen: "despacho",
    origenId: p.despachoId,
    ...(p.modo === "pieza"
      ? { cubicacionRefId: p.refId }
      : {
          lineas: p.lineas.flatMap((l) => {
            const pt = leerNumero(l.pt);
            if (pt == null || !l.especie.trim()) return [];
            const m3 = leerNumero(l.m3);
            const piezas = leerNumero(l.piezas);
            return [{ especie: l.especie.trim(), pt, ...(m3 != null ? { m3 } : {}), ...(piezas != null && Number.isInteger(piezas) ? { piezas } : {}) }];
          }),
        }),
    descuentos: p.descuentos,
    notas: p.notas.trim() || undefined,
  };
}

export const guardarCubicacionComercial = (cuerpo: CuerpoAserrada) =>
  pedir(RUTA_CUBICACIONES_TROZAS, jsonPost("POST", cuerpo), unaCubicacion);
