"use client";

/**
 * Elegir las PIEZAS que entran a la sierra (ADR-326).
 *
 * Del ERP forestal de referencia: el operador tilda las trozas de una tabla
 * filtrable en vez de tipear un volumen. En el patio eso es lo que pasa —se
 * eligen los palos que entran al carro— y el volumen del consumo se DERIVA de
 * lo elegido, así nadie escribe un número que después no cuadra con la pila.
 *
 * Las bloqueadas se muestran igual, en gris y con el motivo: una pieza que el
 * operador sabe que está ahí y no aparece se lee como un bug del sistema.
 */

import { useMemo, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { AlertTriangle, Loader2, Search, TreePine } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import {
  agruparPorGuia,
  avisosSeleccion,
  filtrarTrozas,
  motivoBloqueo,
  totalesSeleccion,
  type TrozaConsumible,
} from "@/lib/forestal/consumo-trozas";
import CtpTrozaCardMobile from "./CtpTrozaCardMobile";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";

/** Mismo campo que los filtros de Ingresos: el módulo se lee como uno solo. */
const CAMPO =
  "h-12 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] transition-colors focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";

export default function CtpTrozasPicker({
  trozas,
  cargando,
  seleccion,
  onSeleccion,
  corridaId,
}: {
  trozas: TrozaConsumible[];
  cargando?: boolean;
  /** Ids elegidos. Lo controla el formulario: al guardar viajan con la corrida. */
  seleccion: Set<string>;
  onSeleccion: (ids: Set<string>) => void;
  /** La corrida que se está editando: sus propias trozas no cuentan como tomadas. */
  corridaId?: string | null;
}) {
  const [texto, setTexto] = useState("");
  const [especie, setEspecie] = useState("");
  const [gtf, setGtf] = useState("");
  const [soloDisponibles, setSoloDisponibles] = useState(true);

  /** Una troza tomada por ESTA corrida sigue siendo elegible: se está editando. */
  const normalizadas = useMemo(
    () =>
      trozas.map((t) =>
        corridaId && t.consumidaEnId === corridaId ? { ...t, consumidaEnId: null } : t,
      ),
    [trozas, corridaId],
  );

  const especies = useMemo(
    () => [...new Set(normalizadas.map((t) => t.especieComun).filter(Boolean))].sort() as string[],
    [normalizadas],
  );
  const guias = useMemo(
    () => [...new Set(normalizadas.map((t) => t.gtfNumber).filter(Boolean))].sort() as string[],
    [normalizadas],
  );

  const visibles = useMemo(
    () => filtrarTrozas(normalizadas, { texto, especie, gtf, soloDisponibles }),
    [normalizadas, texto, especie, gtf, soloDisponibles],
  );
  const elegidas = useMemo(
    () => normalizadas.filter((t) => seleccion.has(t.id)),
    [normalizadas, seleccion],
  );
  const totales = useMemo(() => totalesSeleccion(elegidas), [elegidas]);
  const porGuia = useMemo(() => agruparPorGuia(elegidas), [elegidas]);
  const avisos = useMemo(() => avisosSeleccion(elegidas), [elegidas]);

  const alternar = (id: string) => {
    const next = new Set(seleccion);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSeleccion(next);
  };

  /** Tilda de una todas las que el filtro dejó a la vista y se pueden elegir. */
  const tomarVisibles = () => {
    const next = new Set(seleccion);
    for (const t of visibles) if (motivoBloqueo(t) === null) next.add(t.id);
    onSeleccion(next);
  };

  return (
    <div className="space-y-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <TreePine className="h-4 w-4 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden />
        <CardTitle as="h4" className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
          Trozas que entran a la sierra
        </CardTitle>
        <span className="ml-auto font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">
          {totales.piezas} pza · {fmtM3(totales.volumenM3)} m³ ·{" "}
          {totales.pieTablar.toLocaleString("es-PE")} pt
        </span>
      </div>

      {/* El buscador va en su PROPIA fila y no compitiendo con cuatro controles.
          Medido en el modal de armado (columna de 640px): con todo en una fila
          quedaba en 71px —cabía «Có»— porque `min-w-*` NO emite CSS en este
          proyecto (medido: cero reglas `min-width` en la hoja) y el flex lo
          encogía a lo que sobraba. En el modal de corrida (471px) pasaba lo
          mismo. Se busca por código: es el control que más ancho necesita. */}
      <label className="relative block w-full">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Código, planta o parcela…"
          aria-label="Buscar troza"
          className={cn(CAMPO, "w-full pl-9 pr-3")}
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <select
          value={especie}
          onChange={(e) => setEspecie(e.target.value)}
          aria-label="Filtrar por especie"
          className={cn(CAMPO, "px-3")}
        >
          <option value="">Todas las especies</option>
          {especies.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
        <select
          value={gtf}
          onChange={(e) => setGtf(e.target.value)}
          aria-label="Filtrar por guía"
          className={cn(CAMPO, "px-3")}
        >
          <option value="">Todas las guías</option>
          {guias.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <label className="flex h-12 cursor-pointer items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-secondary)]">
          <input type="checkbox" checked={soloDisponibles} onChange={(e) => setSoloDisponibles(e.target.checked)} className="h-5 w-5 accent-[var(--accent)]" />
          Sólo disponibles
        </label>
        <button
          type="button"
          onClick={tomarVisibles}
          disabled={visibles.length === 0}
          className="h-12 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] transition-colors hover:border-[var(--accent)] disabled:opacity-40 disabled:hover:border-[var(--rule-base)]"
        >
          Tomar las {visibles.length} visibles
        </button>
      </div>

      {avisos.map((a) => (
        <p key={a} className="flex items-start gap-1.5 rounded-lg bg-[var(--data-warning-50)] px-3 py-2 text-sm text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/10 dark:text-[var(--data-warning-500)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {a}
        </p>
      ))}

      {cargando ? (
        <p className="flex items-center gap-2 px-1 py-4 text-sm text-[var(--text-tertiary)]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Buscando las trozas del patio…
        </p>
      ) : visibles.length === 0 ? (
        <p className="rounded-lg bg-[var(--surface-sunken)] px-3 py-6 text-center text-sm text-[var(--text-tertiary)]">
          {normalizadas.length === 0
            ? "No hay trozas cargadas. Se crean al registrar una guía con su lista de piezas."
            : "Ninguna troza coincide con el filtro."}
        </p>
      ) : (
        /* Una card por pieza, a cualquier ancho. Antes esto era una <table> de 6
           columnas: se midió el contenedor real —el picker vive en la columna
           izquierda del modal de corrida— y da 471px a 1440 y 562px a 2560, así
           que la tabla nunca tenía dónde respirar. La card además hace que el
           target sea la fila entera: un checkbox de 16px no se toca con guantes. */
        <ul className="max-h-96 space-y-2 overflow-y-auto">
          {visibles.map((t) => (
            <CtpTrozaCardMobile
              key={t.id}
              troza={t}
              elegida={seleccion.has(t.id)}
              onToggle={() => alternar(t.id)}
            />
          ))}
        </ul>
      )}

      {porGuia.length > 0 && (
        <div className="rounded-lg border border-[var(--rule-soft)] px-3 py-2">
          <p className="mb-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            De qué guías sale
          </p>
          <ul className="space-y-0.5">
            {porGuia.map((g) => (
              <li key={g.woodEntryId} className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate text-[var(--text-secondary)]">
                  {/* La especie va SIEMPRE: una misma guía puede tener un ingreso
                      por especie (ADR-312), y sin ella dos filas se leen iguales. */}
                  <b className="font-mono text-[var(--text-primary)]">{g.gtfNumber ?? "—"}</b>
                  {g.especie && <> · {g.especie}</>} · {g.piezas} pza
                </span>
                <span className="shrink-0 font-mono tabular-nums text-[var(--text-primary)]">
                  {fmtM3(g.volumenM3)} m³
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
