"use client";

/**
 * reparto-paquetes — elegir PAQUETES YA DECLARADOS del Libro para cargarlos en
 * la distribución como bloques de madera ya aserrada (Brandon, 2026-09-01).
 *
 * El bloque de aserrada directa se tipeaba a mano: m³ y piezas de una madera
 * que el Libro **ya tiene declarada, con código y todo**. Retipearla es la vía
 * más corta a que el papel diga un número y el Libro otro; acá se elige de la
 * misma lista que ya alimenta «Productos disponibles» (`?disponibles=1`,
 * ADR-349) y el m³ y las piezas bajan tal cual vinieron.
 *
 * Lo que NO hace, a propósito:
 *
 * · **No inventa el N° de permiso.** El payload de disponibles trae la GTF y
 *   el titular de origen, no el título habilitante. Poner cualquiera de esos
 *   dos en la columna «N° de permiso» sería declarar como permiso algo que no
 *   lo es — mismo criterio que `permisoDelLote` en `ResumenReparto`, que deja
 *   la celda en blanco antes que adivinar.
 * · **No descuenta ni reserva nada.** Elegir un paquete acá no lo despacha ni
 *   lo marca usado: la distribución es un papel de respaldo, no un movimiento
 *   del Libro. Lo único que se evita es cargar DOS VECES el mismo paquete, que
 *   sí duplicaría su m³ dentro de esta hoja.
 */

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Loader2, Ruler, Search, X } from "@buleje/design-system/icons";
import { ctpGet } from "@/lib/forestal/ctp-fetch";
import { fmtM3, fmtPiezas } from "@/lib/forestal/cubicacion-formato";
import type { CorridaDisponible } from "@/lib/forestal/despacho-lista";

/** Un candidato de la lista: un paquete con código, o la corrida entera si no tiene paquetes. */
export interface PaqueteElegible {
  /** Id estable para no ofrecer dos veces lo mismo (`paqueteId` del bloque). */
  ref: string;
  etiqueta: string;
  especie: string;
  producto: string;
  m3: number;
  /** `null` = la corrida no declara piezas (sólo volumen). */
  piezas: number | null;
  /** Medida del paquete, si la declaró — sólo para reconocerlo en la lista. */
  medida: string | null;
  lineNo: number | null;
  fecha: string;
}

/** Sin tildes ni mayúsculas: en el aserradero se busca «tornillo», no «TORNILLO». */
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * Aplana la respuesta de `?disponibles=1` a candidatos.
 *
 * Una corrida SIN paquetes entra igual, como un candidato con su saldo y sin
 * piezas: es producto que existe en la pila, y esconderlo porque la corrida es
 * vieja obligaría a tipearlo a mano — justo lo que esto viene a evitar.
 */
export function elegiblesDeCorridas(corridas: readonly CorridaDisponible[]): PaqueteElegible[] {
  const out: PaqueteElegible[] = [];
  for (const c of corridas) {
    const especie = (c.especie ?? "").trim();
    const producto = (c.producto ?? "").trim();
    if (c.paquetes.length === 0) {
      if (c.disponible > 1e-4) {
        out.push({
          ref: `corrida:${c.id}`,
          etiqueta: `Corrida N° ${c.lineNo ?? "—"}`,
          especie, producto, m3: c.disponible, piezas: null, medida: null,
          lineNo: c.lineNo, fecha: c.fecha,
        });
      }
      continue;
    }
    for (const p of c.paquetes) {
      if (!(p.volumenM3 > 1e-4)) continue;
      const medida = p.espesorCm && p.anchoCm && p.largoM
        ? `${p.espesorCm}×${p.anchoCm} cm × ${p.largoM} m`
        : null;
      out.push({
        ref: `paquete:${p.id}`,
        etiqueta: `Paquete ${p.codigo}`,
        especie,
        producto: (p.producto ?? producto).trim(),
        m3: p.volumenM3,
        piezas: p.cantidad > 0 ? p.cantidad : null,
        medida,
        lineNo: c.lineNo,
        fecha: c.fecha,
      });
    }
  }
  return out;
}

/** Filtro de texto sobre etiqueta, especie, producto y N° de corrida. */
export function filtrarElegibles(lista: readonly PaqueteElegible[], termino: string): PaqueteElegible[] {
  const t = norm(termino.trim());
  if (!t) return [...lista];
  return lista.filter((p) =>
    [p.etiqueta, p.especie, p.producto, p.lineNo == null ? "" : `N° ${p.lineNo}`].some((c) => norm(c).includes(t)),
  );
}

const BTN = "inline-flex h-9 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)] disabled:opacity-40";

export default function RepartoPaquetesPicker({
  yaCargados, onAgregar, onCerrar,
}: {
  /** Refs (`paqueteId`) que ya están en la tabla: no se ofrecen de nuevo. */
  yaCargados: ReadonlySet<string>;
  onAgregar: (elegidos: PaqueteElegible[]) => void;
  onCerrar: () => void;
}) {
  const [corridas, setCorridas] = useState<CorridaDisponible[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());

  useEffect(() => {
    let vivo = true;
    ctpGet<{ corridas?: CorridaDisponible[] }>("/api/admin/forestal/ctp?disponibles=1")
      .then((r) => { if (vivo) { setCorridas(r.corridas ?? []); setError(null); } })
      .catch((e: unknown) => { if (vivo) setError(e instanceof Error ? e.message : String(e)); });
    return () => { vivo = false; };
  }, []);

  const todos = useMemo(() => (corridas ? elegiblesDeCorridas(corridas) : []), [corridas]);
  /** Lo ya cargado se saca de la lista, no se muestra en gris: en una lista de
   *  20 paquetes, media docena tachados sólo tapan los que sí se pueden usar. */
  const disponibles = useMemo(() => todos.filter((p) => !yaCargados.has(p.ref)), [todos, yaCargados]);
  const visibles = useMemo(() => filtrarElegibles(disponibles, texto), [disponibles, texto]);
  const elegidos = useMemo(() => disponibles.filter((p) => sel.has(p.ref)), [disponibles, sel]);
  const totalM3 = elegidos.reduce((a, p) => a + p.m3, 0);
  const totalPiezas = elegidos.reduce((a, p) => a + (p.piezas ?? 0), 0);

  const alternar = (ref: string) => setSel((prev) => {
    const next = new Set(prev);
    if (next.has(ref)) next.delete(ref); else next.add(ref);
    return next;
  });

  return (
    <div className="mb-3 rounded-xl border-2 border-[var(--accent)] bg-[var(--surface-raised)] p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
          <Ruler className="h-4 w-4 text-[var(--accent)]" aria-hidden />
          Paquetes ya declarados en el Libro
        </span>
        <button type="button" onClick={onCerrar} aria-label="Cerrar el buscador de paquetes" className="rounded-lg px-2 py-1 text-xs font-bold text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <p className="mb-2 text-xs text-[var(--text-tertiary)]">
        Entran como bloques de <b>madera ya aserrada</b>: su m³ y sus piezas bajan tal como los declaró el Libro, sin retipear.
        El <b>N° de permiso</b> queda en blanco — esta lista no trae el título habilitante, y ponerle la GTF sería declarar
        como permiso algo que no lo es.
      </p>

      <label className="relative mb-2 block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar por código, especie, producto o N° de corrida"
          aria-label="Buscar paquetes disponibles"
          className="h-10 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] pl-9 pr-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
        />
      </label>

      {error && (
        <p className="mb-2 flex items-center gap-1.5 rounded-lg border-2 border-[var(--data-error-500)] px-2.5 py-1.5 text-xs font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden /> No se pudieron leer los productos disponibles: {error}
        </p>
      )}

      {corridas === null && !error ? (
        <p className="flex items-center gap-2 py-4 text-sm text-[var(--text-tertiary)]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Leyendo lo que hay declarado…
        </p>
      ) : visibles.length === 0 ? (
        <p className="py-4 text-center text-sm text-[var(--text-tertiary)]">
          {todos.length === 0
            ? "El Libro no tiene productos disponibles todavía."
            : disponibles.length === 0
              ? "Ya cargaste todos los paquetes disponibles en esta distribución."
              : "Ningún paquete coincide con esa búsqueda."}
        </p>
      ) : (
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {visibles.map((p) => {
            const marcado = sel.has(p.ref);
            return (
              <li key={p.ref}>
                <label className={`flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border-2 px-2.5 py-2 transition-colors ${marcado
                  ? "border-[var(--accent)] bg-primary/10"
                  : "border-[var(--rule-soft)] bg-[var(--surface-canvas)] hover:border-[var(--accent)]"}`}>
                  <input
                    type="checkbox"
                    checked={marcado}
                    onChange={() => alternar(p.ref)}
                    aria-label={`Cargar ${p.etiqueta} como bloque de madera ya aserrada`}
                    className="h-5 w-5 shrink-0 accent-[var(--accent)]"
                  />
                  <span className="text-sm font-bold text-[var(--text-primary)]">{p.etiqueta}</span>
                  <span className="text-sm text-[var(--text-secondary)]">{p.especie || "Sin especie"}</span>
                  {p.producto && <span className="text-xs text-[var(--text-tertiary)]">{p.producto}</span>}
                  {p.medida && <span className="font-mono text-xs text-[var(--text-tertiary)]">{p.medida}</span>}
                  <span className="ml-auto flex shrink-0 items-center gap-3 font-mono text-sm font-bold tabular-nums text-[var(--text-secondary)]">
                    <span>{p.piezas == null ? "—" : fmtPiezas(p.piezas)} <span className="font-sans font-normal text-[var(--text-tertiary)]">pzas</span></span>
                    <span>{fmtM3(p.m3)} <span className="font-sans font-normal text-[var(--text-tertiary)]">m³ (A)</span></span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={elegidos.length === 0}
          onClick={() => { onAgregar(elegidos); onCerrar(); }}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-white hover:brightness-95 disabled:opacity-40"
        >
          <Check className="h-4 w-4" aria-hidden />
          {elegidos.length === 0
            ? "Elegí al menos uno"
            : `Agregar ${elegidos.length} bloque${elegidos.length === 1 ? "" : "s"}`}
        </button>
        {elegidos.length > 0 && (
          <span className="font-mono text-sm font-bold tabular-nums text-[var(--accent-ink)] dark:text-[var(--accent)]">
            {fmtM3(totalM3)} m³ (A){totalPiezas > 0 ? ` · ${fmtPiezas(totalPiezas)} piezas` : ""}
          </span>
        )}
        <button type="button" onClick={onCerrar} className={`ml-auto ${BTN}`}>Cancelar</button>
      </div>
    </div>
  );
}
