"use client";

/**
 * Elegir el lote que entra hoy a la sierra.
 *
 * Es LA decisión de la pestaña —todo lo que sigue (tildar trozas, declarar, el
 * rendimiento que sale) cuelga de ella— y vivía en un desplegable de 300 px que
 * el borde de la pantalla cortaba, terminado en un «Hay más opciones» que no
 * decía cuántas ni cuáles. Para decidir hay que comparar, y para comparar hay
 * que ver: acá cada lote muestra su madera libre, su volumen, cuántos días
 * lleva esperando y cuánto le queda por declarar.
 *
 * Lo viejo primero, no lo último cargado: la madera apilada se mancha y se
 * raja, así que el orden por defecto es por antigüedad. El menú anterior
 * ordenaba por como venían del servidor.
 */

import { useMemo, useState } from "react";
import { Boxes, ClipboardList, Layers, PackageOpen, RotateCcw, Search } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import type { LoteConMadera } from "./ctp-entries-acciones";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { pieTablarDe } from "@/lib/forestal/lotes-aserrio";
import { MODAL_BODY } from "@/components/admin/shared/AdminModal";

type Orden = "antiguedad" | "volumen";

/** Días entre la apertura del lote y hoy. `null` si la fecha no se puede leer. */
function diasEsperando(fechaApertura: string | null | undefined): number | null {
  if (!fechaApertura) return null;
  const t = Date.parse(fechaApertura);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

/** Un lote, con todo lo que hace falta para elegirlo sin abrirlo. */
function FilaLote({
  item,
  activo,
  onElegir,
}: {
  item: LoteConMadera;
  activo: boolean;
  onElegir: () => void;
}) {
  const { lote, volumenM3, margenM3 = 0, inventario = false, piezas: libres } = item;
  const soloMargen = libres === 0 && margenM3 > 0.01;
  const dias = diasEsperando(lote.fechaApertura);
  const Icono = inventario ? ClipboardList : soloMargen ? RotateCcw : Layers;
  const volumen = soloMargen ? margenM3 : volumenM3;

  return (
    <button
      type="button"
      onClick={onElegir}
      className={`flex w-full items-center gap-3 rounded-xl border-[1.5px] px-3 py-2.5 text-left transition ${
        activo
          ? "border-[var(--accent)] bg-[var(--accent-soft)]"
          : "border-[var(--rule-base)] bg-[var(--surface-raised)] hover:border-[var(--accent)] hover:bg-[var(--surface-sunken)]"
      }`}
    >
      <Icono className="h-5 w-5 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-bold text-[var(--text-primary)]">{lote.code}</span>
          <span className="truncate text-sm text-[var(--text-secondary)]">
            {lote.speciesScientific ? `${lote.speciesScientific} (${lote.speciesCommon.toUpperCase()})` : lote.speciesCommon}
          </span>
          {lote.permiso && (
            <span className="rounded-full bg-[var(--surface-sunken)] px-1.5 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
              {lote.permiso}
            </span>
          )}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
          {soloMargen ? (
            <span className="font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
              Ya aserrado · queda volumen por declarar
            </span>
          ) : inventario ? (
            <span>Declarado por inventario · su volumen se declara directo</span>
          ) : libres > 0 ? (
            <span className="tabular-nums">
              {libres} troza{libres === 1 ? "" : "s"} esperando la sierra
            </span>
          ) : (
            <span>Sin piezas libres — abrilo para ver qué tiene</span>
          )}
          {dias != null && (
            <span className="tabular-nums" title={`Abierto el ${lote.fechaApertura?.slice(0, 10)}`}>
              · {dias === 0 ? "abierto hoy" : `${dias} día${dias === 1 ? "" : "s"} esperando`}
            </span>
          )}
          {!soloMargen && margenM3 > 0.01 && (
            <span className="tabular-nums">· y {fmtM3(margenM3)} m³ por declarar</span>
          )}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block font-bold tabular-nums text-[var(--text-primary)]">{fmtM3(volumen)} m³</span>
        <span className="block text-[length:var(--ts-2xs)] tabular-nums text-[var(--text-tertiary)]">
          {pieTablarDe(volumen).toLocaleString("es-PE")} pt
        </span>
      </span>
    </button>
  );
}

/** Una corrida que ya se comió su madera y todavía no dice qué salió (ADR-340). */
export interface CorridaPorDeclarar {
  id: string;
  lineNo: number | string;
  /** El lote del que salió, si se sabe. */
  materiaPrimaRef?: string | null;
  volumenM3: number;
}

export default function CtpElegirLoteModal({
  lotes,
  corridas = [],
  loteAbierto,
  corridaAbierta,
  onElegir,
  onElegirCorrida,
  onCerrar,
  onArmarLote,
}: {
  lotes: LoteConMadera[];
  /**
   * Las corridas por declarar viajan en el MISMO modal que los lotes: son el
   * otro camino de la misma pregunta («¿sobre qué trabajo hoy?»), y separarlas
   * en un menú aparte fue lo que llevó a tener tres botones para un solo acto.
   */
  corridas?: CorridaPorDeclarar[];
  loteAbierto: string;
  corridaAbierta?: string | null;
  onElegir: (loteId: string) => void;
  onElegirCorrida?: (corridaId: string) => void;
  onCerrar: () => void;
  /** Ir a armar uno nuevo: sin lotes, el modal no puede ser un callejón. */
  onArmarLote?: () => void;
}) {
  const [q, setQ] = useState("");
  const [especie, setEspecie] = useState<string | null>(null);
  const [orden, setOrden] = useState<Orden>("antiguedad");

  /** Las especies que de verdad hay, con cuántos lotes cada una. */
  const especies = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of lotes) m.set(l.lote.speciesCommon, (m.get(l.lote.speciesCommon) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [lotes]);

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    const base = lotes.filter((l) => {
      if (especie && l.lote.speciesCommon !== especie) return false;
      if (!t) return true;
      return (
        l.lote.code.toLowerCase().includes(t) ||
        l.lote.speciesCommon.toLowerCase().includes(t) ||
        (l.lote.speciesScientific ?? "").toLowerCase().includes(t) ||
        (l.lote.permiso ?? "").toLowerCase().includes(t) ||
        (l.lote.ordenProduccion ?? "").toLowerCase().includes(t)
      );
    });
    return [...base].sort((a, b) => {
      if (orden === "volumen") {
        const va = a.piezas === 0 ? (a.margenM3 ?? 0) : a.volumenM3;
        const vb = b.piezas === 0 ? (b.margenM3 ?? 0) : b.volumenM3;
        return vb - va;
      }
      /* Antigüedad: el que más espera, primero. Sin fecha va al final —no se
         puede afirmar que sea urgente algo cuya fecha no se pudo leer. */
      const da = diasEsperando(a.lote.fechaApertura);
      const db = diasEsperando(b.lote.fechaApertura);
      if (da == null) return 1;
      if (db == null) return -1;
      return db - da;
    });
  }, [lotes, q, especie, orden]);

  /* Dos actos distintos y por eso dos grupos: meter madera a la sierra, o
     terminar de declarar lo que ya salió de ella (ADR-340/365). */
  const conMadera = filtrados.filter((l) => !(l.piezas === 0 && (l.margenM3 ?? 0) > 0.01));
  const porDeclarar = filtrados.filter((l) => l.piezas === 0 && (l.margenM3 ?? 0) > 0.01);

  const totalM3 = conMadera.reduce((a, l) => a + l.volumenM3, 0);

  return (
    <AdminModal
      open
      onClose={onCerrar}
      icon={Boxes}
      variant="wide"
      title="¿Qué lote entra hoy a la sierra?"
      /* Sólo se anuncia lo que EXISTE: «0 con madera (0.000 m³)» es una cifra
         vacía compitiendo con la que sí tiene contenido. */
      description={
        [
          conMadera.length > 0 ? `${conMadera.length} con madera (${fmtM3(totalM3)} m³)` : null,
          porDeclarar.length > 0 ? `${porDeclarar.length} por terminar de declarar` : null,
          corridas.length > 0 ? `${corridas.length} corrida${corridas.length === 1 ? "" : "s"} sin declarar` : null,
        ]
          .filter(Boolean)
          .join(" · ") || "No hay lotes con madera ni corridas por declarar."
      }
    >
      <div className={`space-y-3 ${MODAL_BODY}`}>
        {lotes.length > 0 && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex h-11 flex-1 items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3">
              <Search className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
              <label htmlFor="ctp-buscar-lote" className="sr-only">
                Buscar un lote por código, especie, permiso u orden de producción
              </label>
              <input
                id="ctp-buscar-lote"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Código, especie, permiso u orden…"
                className="w-full bg-transparent text-base text-[var(--text-primary)] outline-none"
              />
            </div>
            {/* El orden importa: por antigüedad se consume la madera que lleva
                más tiempo apilada, que es la que se arruina primero. */}
            <div className="flex shrink-0 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-0.5">
              {([["antiguedad", "Más viejo"], ["volumen", "Más volumen"]] as const).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setOrden(k)}
                  className={`h-10 rounded-lg px-3 text-sm font-semibold transition ${
                    orden === k
                      ? "bg-[var(--accent)] text-white"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {especies.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setEspecie(null)}
              className={`h-8 rounded-lg border px-2.5 text-sm font-semibold transition ${
                especie == null
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)] dark:text-[var(--accent)]"
                  : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--accent)]"
              }`}
            >
              Todas
            </button>
            {especies.map(([e, n]) => (
              <button
                key={e}
                type="button"
                onClick={() => setEspecie((v) => (v === e ? null : e))}
                className={`h-8 rounded-lg border px-2.5 text-sm font-semibold transition ${
                  especie === e
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)] dark:text-[var(--accent)]"
                    : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--accent)]"
                }`}
              >
                {e} <span className="tabular-nums opacity-70">{n}</span>
              </button>
            ))}
          </div>
        )}

        {filtrados.length === 0 ? (
          <p className="rounded-xl bg-[var(--surface-sunken)] px-3 py-6 text-center text-sm text-[var(--text-secondary)]">
            {lotes.length === 0
              ? "Todavía no hay lotes armados. Apartá madera del patio para programar el primero."
              : "Ningún lote coincide con lo que buscaste."}
          </p>
        ) : (
          <div className="max-h-[min(60vh,32rem)] space-y-3 overflow-y-auto">
            {conMadera.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[length:var(--ts-2xs)] font-bold tracking-wide text-[var(--text-tertiary)] uppercase">
                  Con madera para aserrar
                </p>
                {conMadera.map((l) => (
                  <FilaLote
                    key={l.lote.id}
                    item={l}
                    activo={loteAbierto === l.lote.id}
                    onElegir={() => { onElegir(l.lote.id); onCerrar(); }}
                  />
                ))}
              </div>
            )}
            {porDeclarar.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[length:var(--ts-2xs)] font-bold tracking-wide text-[var(--text-tertiary)] uppercase">
                  Ya aserrados · falta declarar lo que salió
                </p>
                {porDeclarar.map((l) => (
                  <FilaLote
                    key={l.lote.id}
                    item={l}
                    activo={loteAbierto === l.lote.id}
                    onElegir={() => { onElegir(l.lote.id); onCerrar(); }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Fuera del filtro de lotes a propósito: una corrida no es un lote y
            buscar «TORNILLO» no puede hacerla desaparecer sin avisar. */}
        {corridas.length > 0 && onElegirCorrida && (
          <div className="space-y-1.5 border-t border-[var(--rule-base)] pt-3">
            <p className="text-[length:var(--ts-2xs)] font-bold tracking-wide text-[var(--text-tertiary)] uppercase">
              Corridas que ya consumieron · falta decir qué salió
            </p>
            {corridas.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => { onElegirCorrida(c.id); onCerrar(); }}
                className={`flex w-full items-center gap-3 rounded-xl border-[1.5px] px-3 py-2.5 text-left transition ${
                  corridaAbierta === c.id
                    ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                    : "border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/8 hover:border-[var(--accent)]"
                }`}
              >
                <Boxes className="h-5 w-5 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-[var(--text-primary)]">
                    Corrida N° {c.lineNo}
                    {c.materiaPrimaRef ? ` · del lote ${c.materiaPrimaRef}` : ""}
                  </span>
                  <span className="block text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                    Abre sus trozas para declarar qué salió de la sierra
                  </span>
                </span>
                <span className="shrink-0 font-bold tabular-nums text-[var(--text-primary)]">
                  {fmtM3(c.volumenM3)} m³
                </span>
              </button>
            ))}
          </div>
        )}

        {onArmarLote && (
          <button
            type="button"
            onClick={() => { onArmarLote(); onCerrar(); }}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-[var(--rule-base)] px-3 py-2.5 text-sm font-semibold text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
          >
            <PackageOpen className="h-4 w-4" aria-hidden />
            {lotes.length === 0 ? "Programar un lote" : "Armar otro lote"}
          </button>
        )}
      </div>
    </AdminModal>
  );
}
