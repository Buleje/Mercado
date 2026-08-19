"use client";

/**
 * Lo que hay que tener a mano mientras se declara producción, plegado en tres
 * solapas dentro del modal.
 *
 * Declarar es mirar la pila y anotar lo que salió. Las tres preguntas que
 * aparecen ahí son siempre las mismas —«¿qué madera entró?», «¿de qué guía y de
 * qué título es?», «¿qué paquetes ya declaré?»— y hasta ahora había que cerrar
 * el modal (perdiendo lo tipeado) para ir a buscarlas a otra pestaña.
 *
 * Las solapas son también el plegado: clic en una la abre, clic en la abierta la
 * cierra. Un solo control para las dos cosas — un botón «ver» aparte más tres
 * solapas serían cuatro clics para lo mismo.
 *
 * Nada de esto se edita: es material de consulta. Las tablas son las MISMAS que
 * el resto del libro (`CtpTrozasDelLote` en sólo lectura, `agruparPorGuia`), no
 * copias que puedan decir otra cosa de la misma madera.
 */

import { useMemo, useState } from "react";
import { Boxes, FileText, Layers } from "@buleje/design-system/icons";
import { agruparPorGuia, type TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import { pieTablarDe } from "@/lib/forestal/lotes-aserrio";
import type { OrigenMateriaPrima } from "@/lib/forestal/produccion-paquetes";
import CtpTrozasDelLote from "./CtpTrozasDelLote";
import { FilaVacia, TablaCtp, TbodyCtp, TheadCtp } from "./ctp-tabla";

/** Un paquete que la corrida ya declaró en una tanda anterior (ADR-361). */
export interface PaquetePrevio {
  id?: string;
  codigo: string;
  productType?: string | null;
  presentacion?: string | null;
  cantidad?: number | string | null;
  volumenM3?: number | string | null;
  espesorCm?: number | string | null;
  anchoCm?: number | string | null;
  largoM?: number | string | null;
}

type Solapa = "trozas" | "origen" | "paquetes";

const n = (v: number | string | null | undefined, dec = 4) =>
  v == null || v === "" ? "—" : Number(v).toFixed(dec);

export default function CtpMaterialPanel({
  trozas,
  origenes,
  paquetesPrevios,
  fecha,
}: {
  /** La madera que entró a la sierra. */
  trozas?: readonly TrozaConsumible[];
  /** Cuánto puso cada título habilitante (ya calculado por quien llama). */
  origenes?: readonly OrigenMateriaPrima[];
  /** Lo que esta corrida ya declaró, cuando se está ampliando. */
  paquetesPrevios?: readonly PaquetePrevio[];
  /** Día del consumo, para la columna de la tabla de trozas. */
  fecha: string;
}) {
  const [abierta, setAbierta] = useState<Solapa | null>(null);

  const guias = useMemo(() => agruparPorGuia([...(trozas ?? [])]), [trozas]);
  const totalPrevio = useMemo(
    () => (paquetesPrevios ?? []).reduce((a, p) => a + (Number(p.volumenM3) || 0), 0),
    [paquetesPrevios],
  );

  const solapas: { id: Solapa; label: string; cuenta: number; icon: typeof Layers }[] = [
    { id: "trozas", label: "Trozas que entraron", cuenta: trozas?.length ?? 0, icon: Layers },
    { id: "origen", label: "Guías y títulos", cuenta: guias.length, icon: FileText },
    { id: "paquetes", label: "Ya declarados", cuenta: paquetesPrevios?.length ?? 0, icon: Boxes },
  ];
  const visibles = solapas.filter((s) => s.cuenta > 0);
  if (visibles.length === 0) return null;

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        {visibles.map((s) => {
          const Icon = s.icon;
          const activa = abierta === s.id;
          return (
            <button
              key={s.id}
              type="button"
              aria-expanded={activa}
              onClick={() => setAbierta((a) => (a === s.id ? null : s.id))}
              className={`inline-flex h-11 items-center gap-2 rounded-xl border-2 px-3 text-sm font-bold transition-colors ${
                activa
                  ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                  : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {s.label}
              <span className="rounded-lg bg-[var(--surface-sunken)] px-1.5 font-mono text-xs tabular-nums text-[var(--text-secondary)]">
                {s.cuenta}
              </span>
            </button>
          );
        })}
      </div>

      {abierta === "trozas" && trozas && trozas.length > 0 && (
        <div className="mt-2">
          <CtpTrozasDelLote
            trozas={[...trozas]}
            soloLectura
            fechaConsumo={fecha}
            titulo="Madera que entró a la sierra"
          />
        </div>
      )}

      {abierta === "origen" && (
        <div className="mt-2 space-y-2">
          {/* Por GTF: es el documento que ampara la madera y lo primero que
              cruza un fiscalizador. */}
          <TablaCtp>
            <TheadCtp>
              <tr>
                <th className="px-3 py-2 font-bold">Guía (GTF)</th>
                <th className="px-3 py-2 font-bold">Proveedor</th>
                <th className="px-3 py-2 text-right font-bold">Piezas</th>
                <th className="px-3 py-2 text-right font-bold">Volumen (m³)</th>
                <th className="px-3 py-2 text-right font-bold">Pie tablar</th>
              </tr>
            </TheadCtp>
            <TbodyCtp>
              {guias.length === 0 && <FilaVacia cols={5}>Esta corrida no tiene piezas cargadas.</FilaVacia>}
              {guias.map((g) => (
                <tr key={g.woodEntryId} className="hover:bg-[var(--surface-sunken)]">
                  <td className="px-3 py-2 font-mono font-bold text-[var(--text-primary)]">{g.gtfNumber ?? "—"}</td>
                  <td className="px-3 py-2 text-[var(--text-secondary)]">{g.proveedor ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{g.piezas}</td>
                  <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">
                    {g.volumenM3.toFixed(4)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-tertiary)]">
                    {g.pieTablar.toLocaleString("es-PE")}
                  </td>
                </tr>
              ))}
            </TbodyCtp>
          </TablaCtp>

          {/* Y por título habilitante, que es lo que ampara legalmente la
              madera: la guía dice de dónde vino, el título dice con qué permiso
              se cortó. Las piezas sin título se NOMBRAN. */}
          {(origenes ?? []).length > 0 && (
            <ul className="divide-y divide-[var(--rule-soft)] overflow-hidden rounded-xl border border-[var(--rule-base)]">
              <li className="bg-[var(--surface-sunken)] px-3 py-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                Títulos habilitantes que amparan esta madera
              </li>
              {(origenes ?? []).map((o) => (
                <li key={o.permiso ?? "sin"} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-1.5 text-sm">
                  <b className="font-mono text-[var(--text-primary)]">{o.permiso ?? "sin título declarado"}</b>
                  <span className="font-mono tabular-nums text-[var(--text-secondary)]">
                    {o.piezas} pza · {o.volumenM3.toFixed(4)} m³
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {abierta === "paquetes" && (
        <div className="mt-2">
          <TablaCtp>
            <TheadCtp>
              <tr>
                <th className="px-3 py-2 font-bold">Código</th>
                <th className="px-3 py-2 font-bold">Producto</th>
                <th className="px-3 py-2 font-bold">Presentación</th>
                <th className="px-3 py-2 text-right font-bold">Cant.</th>
                <th className="px-3 py-2 text-right font-bold">Esp. × Ancho × Largo</th>
                <th className="px-3 py-2 text-right font-bold">Volumen</th>
              </tr>
            </TheadCtp>
            <TbodyCtp>
              {(paquetesPrevios ?? []).map((p) => (
                <tr key={p.id ?? p.codigo} className="hover:bg-[var(--surface-sunken)]">
                  <td className="px-3 py-2 font-mono font-bold text-[var(--text-primary)]">{p.codigo}</td>
                  <td className="px-3 py-2 text-[var(--text-secondary)]">{p.productType ?? "—"}</td>
                  <td className="px-3 py-2 text-[var(--text-secondary)]">{p.presentacion ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{p.cantidad ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-tertiary)]">
                    {p.espesorCm == null || p.anchoCm == null || p.largoM == null
                      ? "—"
                      : `${n(p.espesorCm, 2)} × ${n(p.anchoCm, 2)} cm × ${n(p.largoM, 2)} m`}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">
                    {n(p.volumenM3)}
                  </td>
                </tr>
              ))}
            </TbodyCtp>
          </TablaCtp>
          <p className="mt-2 rounded-xl bg-[var(--surface-sunken)] px-3 py-2 text-sm text-[var(--text-secondary)]">
            Ya declarados: <b className="font-mono tabular-nums text-[var(--text-primary)]">{totalPrevio.toFixed(4)} m³</b>{" "}
            en {paquetesPrevios?.length ?? 0} paquete{(paquetesPrevios?.length ?? 0) === 1 ? "" : "s"} ·{" "}
            {pieTablarDe(totalPrevio).toLocaleString("es-PE")} pt. Lo que cargues abajo se suma a esto.
          </p>
        </div>
      )}
    </div>
  );
}
