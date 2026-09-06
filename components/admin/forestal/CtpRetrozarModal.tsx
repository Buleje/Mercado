"use client";

import { useMemo, useState } from "react";
import AdminModal from "@/components/admin/shared/AdminModal";
import { DataTable } from "@buleje/design-system";
import { Scissors, Plus, Trash2, Loader2, AlertTriangle, Check } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { calcularRetrozado, volumenHuber, type RetrozoNuevo } from "@/lib/forestal/ctp-retrozado";
import { Btn, Field, I, ModalBody, ModalFooter, Seccion, useAtajoGuardar, useCierreSeguro, useHayCambios } from "./ctp-shared";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";

/**
 * Cortar una troza en pedazos — Apartado 2 del LO-CTP (ADR-313).
 *
 * Valida con la MISMA función pura que el servidor: lo que acá se ve en rojo es
 * exactamente lo que la base va a rechazar. Un modal que valida distinto que el
 * backend enseña al operador a pelearse con el formulario.
 */

export type TrozaParaCortar = {
  id: string;
  codificacion: string | null;
  especieComun: string | null;
  dimensiones: string | null;
  largoM: number | null;
  diametroCm: number | null;
  /** Los extremos reales del tronco. El promedio esconde el mayor, que es el
   *  tope físico del corte (ADR-313). */
  d1Cm?: number | null;
  d2Cm?: number | null;
  volumenM3: number | null;
  retrozos?: Array<{ volumenM3: number | null; largoM: number | null; descarte?: boolean }>;
};

type Fila = { d1: string; d2: string; largo: string; volumen: string; obs: string; descarte: boolean };

const FILA_VACIA: Fila = { d1: "", d2: "", largo: "", volumen: "", obs: "", descarte: false };

export default function CtpRetrozarModal({
  troza,
  onClose,
  onSaved,
}: {
  troza: TrozaParaCortar;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [filas, setFilas] = useState<Fila[]>([{ ...FILA_VACIA }, { ...FILA_VACIA }]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (i: number, campo: keyof Fila, valor: string | boolean) =>
    setFilas((prev) => prev.map((f, j) => (i === j ? { ...f, [campo]: valor } : f)));

  /** Sólo las filas con las tres medidas: las vacías son "todavía no la cargué". */
  const pedazos: RetrozoNuevo[] = useMemo(
    () =>
      filas
        .filter((f) => Number(f.d1) > 0 && Number(f.d2) > 0 && Number(f.largo) > 0)
        .map((f) => ({
          d1Cm: Number(f.d1),
          d2Cm: Number(f.d2),
          largoM: Number(f.largo),
          volumenM3: Number(f.volumen) > 0 ? Number(f.volumen) : null,
          observaciones: f.obs.trim() || null,
          descarte: f.descarte,
        })),
    [filas],
  );

  const previos = troza.retrozos ?? [];
  const calculo = useMemo(
    () =>
      pedazos.length === 0
        ? null
        : calcularRetrozado(
            {
              id: troza.id,
              codificacion: troza.codificacion,
              d1Cm: troza.d1Cm ?? troza.diametroCm,
              d2Cm: troza.d2Cm ?? troza.diametroCm,
              largoM: troza.largoM,
              volumenM3: troza.volumenM3,
              retrozosPrevios: previos,
            },
            pedazos,
          ),
    [pedazos, troza, previos],
  );

  async function guardar() {
    if (!calculo?.ok || guardando) return;
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/forestal/trozas/retrozar", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ trozaId: troza.id, fecha: new Date(fecha).toISOString(), pedazos }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${r.status}`);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setGuardando(false);
    }
  }

  const bodyRef = useAtajoGuardar(() => void guardar(), !guardando && Boolean(calculo?.ok));
  const cerrar = useCierreSeguro(useHayCambios(pedazos) && !guardando, onClose);

  return (
    <AdminModal
      open
      onClose={cerrar}
      variant="info"
      title={`Retrozar ${troza.codificacion ?? "la troza"}`}
      description={`${troza.especieComun ?? "—"} · ${troza.volumenM3 != null ? fmtM3(troza.volumenM3) : "—"} m³`}
      icon={Scissors}
      className="sm:w-[min(95vw,72rem)] sm:max-w-none sm:max-h-[92vh]"
      footer={
        <ModalFooter
          error={error}
          nota={
            calculo?.ok
              ? `${calculo.retrozos.length} pedazo(s) · ${fmtM3(calculo.volumenRetrozado)} m³ cortados, ${fmtM3(calculo.volumenLibre)} m³ sin asignar.`
              : undefined
          }
          atajo
        >
          <Btn variant="ghost" onClick={cerrar}>Cancelar</Btn>
          <Btn variant="dark" onClick={() => void guardar()} disabled={!calculo?.ok || guardando}>
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />}
            Registrar el corte
          </Btn>
        </ModalFooter>
      }
    >
      <ModalBody ref={bodyRef} className="space-y-5">
        {/* Lo que hay para cortar, antes de tocar nada. */}
        <div className="grid grid-cols-2 gap-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-4 sm:grid-cols-4">
          <Dato label="Troza" valor={troza.codificacion ?? "—"} mono />
          <Dato label="Medidas (guía)" valor={troza.dimensiones ?? "—"} mono />
          <Dato label="Volumen" valor={`${troza.volumenM3 != null ? fmtM3(troza.volumenM3) : "0"} m³`} mono />
          <Dato
            label="Ya cortado"
            valor={`${fmtM3(previos.reduce((a, r) => a + (r.volumenM3 ?? 0), 0))} m³`}
            mono
          />
        </div>

        <Seccion numero={1} title="Los pedazos que salen">
          <Field span={4} label="Fecha del corte" required>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={I} />
          </Field>

          <div className="sm:col-span-12 overflow-x-auto">
            <DataTable className="w-full min-w-[46rem] text-sm">
              <thead>
                <tr className="border-b border-[var(--rule-soft)] text-left text-[length:var(--ts-2xs)] uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                  <th className="py-2 pr-2 font-bold">Código</th>
                  <th className="px-2 py-2 font-bold">D1 (cm)</th>
                  <th className="px-2 py-2 font-bold">D2 (cm)</th>
                  <th className="px-2 py-2 font-bold">Largo (m)</th>
                  <th className="px-2 py-2 font-bold">Volumen (m³)</th>
                  <th className="px-2 py-2 font-bold">Observaciones</th>
                  <th className="px-2 py-2 text-center font-bold">Descarte</th>
                  <th className="py-2 pl-2" />
                </tr>
              </thead>
              <tbody>
                {filas.map((f, i) => {
                  const auto = volumenHuber(Number(f.d1), Number(f.d2), Number(f.largo));
                  return (
                    <tr key={i} className="border-b border-[var(--rule-soft)] last:border-0">
                      <td className="py-2 pr-2 font-mono text-xs text-[var(--text-tertiary)]">
                        {troza.codificacion ? `${troza.codificacion}-${previos.length + i + 1}` : "—"}
                      </td>
                      <td className="px-2 py-2">
                        <input type="number" step="0.1" min="0" value={f.d1} onChange={(e) => set(i, "d1", e.target.value)} placeholder="73" className={`${I} h-10 w-24`} />
                      </td>
                      <td className="px-2 py-2">
                        <input type="number" step="0.1" min="0" value={f.d2} onChange={(e) => set(i, "d2", e.target.value)} placeholder="66" className={`${I} h-10 w-24`} />
                      </td>
                      <td className="px-2 py-2">
                        <input type="number" step="0.01" min="0" value={f.largo} onChange={(e) => set(i, "largo", e.target.value)} placeholder="5.00" className={`${I} h-10 w-24`} />
                      </td>
                      <td className="px-2 py-2">
                        {/* El placeholder muestra el calculado: si el operador no
                            escribe nada, ése es el que se guarda. */}
                        <input
                          type="number"
                          step="0.0001"
                          min="0"
                          value={f.volumen}
                          onChange={(e) => set(i, "volumen", e.target.value)}
                          placeholder={auto > 0 ? fmtM3(auto) : "—"}
                          className={`${I} h-10 w-28 font-mono`}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input value={f.obs} onChange={(e) => set(i, "obs", e.target.value)} placeholder="Tramo podrido…" className={`${I} h-10 min-w-40`} />
                      </td>
                      <td className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={f.descarte}
                          onChange={(e) => set(i, "descarte", e.target.checked)}
                          aria-label={`El pedazo ${i + 1} es descarte`}
                          className="h-4 w-4 accent-[var(--accent)]"
                        />
                      </td>
                      <td className="py-2 pl-2">
                        {filas.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setFilas((p) => p.filter((_, j) => j !== i))}
                            aria-label={`Quitar el pedazo ${i + 1}`}
                            className="rounded-lg p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--data-error-500)]/10 hover:text-[var(--data-error-700)]"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
          </div>

          <div className="sm:col-span-12">
            <button
              type="button"
              onClick={() => setFilas((p) => [...p, { ...FILA_VACIA }])}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-primary hover:text-[var(--text-primary)]"
            >
              <Plus className="h-4 w-4" /> Otro pedazo
            </button>
          </div>
        </Seccion>

        {/* El veredicto, con la misma regla que aplica el servidor. */}
        {calculo && !calculo.ok && (
          <div className="rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 p-4">
            <p className="mb-2 flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
              <AlertTriangle className="h-3.5 w-3.5" /> Así no se puede cortar
            </p>
            <ul className="space-y-1">
              {calculo.errores.map((e, i) => (
                <li key={i} className="text-sm leading-snug text-[var(--text-secondary)]">{e}</li>
              ))}
            </ul>
          </div>
        )}

        {calculo?.ok && (
          <div className="rounded-xl border border-[var(--data-success-500)]/30 bg-[var(--data-success-50)] p-4 dark:bg-[var(--data-success-500)]/10">
            <p className="mb-2 flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
              <Check className="h-3.5 w-3.5" /> {calculo.retrozos.length} pedazo{calculo.retrozos.length === 1 ? "" : "s"}
            </p>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-[var(--text-secondary)]">
              <span>Cortado: <b className="font-mono text-[var(--text-primary)]">{fmtM3(calculo.volumenRetrozado)} m³</b></span>
              <span>Sin cortar: <b className="font-mono text-[var(--text-primary)]">{fmtM3(calculo.volumenLibre)} m³</b></span>
            </div>
            {calculo.volumenLibre > 0.001 && (
              <p className="mt-1.5 text-xs text-[var(--text-tertiary)]">
                Queda madera sin asignar. Está permitido —al aserrar se pierde— pero conviene que sea a propósito.
              </p>
            )}
          </div>
        )}

      </ModalBody>
    </AdminModal>
  );
}

function Dato({ label, valor, mono }: { label: string; valor: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">{label}</div>
      <div className={`truncate text-sm font-medium text-[var(--text-primary)] ${mono ? "font-mono" : ""}`}>{valor}</div>
    </div>
  );
}
