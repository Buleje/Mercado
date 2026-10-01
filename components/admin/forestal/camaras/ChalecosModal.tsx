"use client";

/**
 * Chalecos del personal — número del chaleco o casco → quién lo usa (ADR-456 §3).
 *
 * Es la forma de reconocer al personal en las fotos SIN biometría: la IA lee
 * un número impreso, no una cara (Ley 29733: el dato biométrico pide
 * consentimiento escrito de cada trabajador). Con el número asignado, la foto
 * dice «N° 3 · Juan · marcó 07:58» y el resumen del día cuenta a quien estuvo
 * en el patio sin marcar asistencia.
 *
 * Se abre desde la vista de cámaras y desde la pastilla «N° 9 sin asignar» de
 * una foto, que llega con el número ya puesto: es justo el que falta asignar.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Hash, Loader2, X } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { normalizarChaleco } from "@/lib/camaras/cruces";
import { cn } from "@/lib/utils";
import {
  BTN,
  CHIP_BASE,
  CHIP_TONO,
  type ChalecosPantalla,
  type ColaboradorOpcion,
} from "./camaras-ui";

interface Props {
  chalecos: ChalecosPantalla;
  colaboradores: ColaboradorOpcion[];
  /** Números que la IA leyó y no son de nadie, con cuántas fotos. */
  vistosSinAsignar: { numero: string; fotos: number }[];
  numeroInicial: string | null;
  guardando: boolean;
  error: string | null;
  onAsignar: (numero: string, colaboradorId: string | null) => Promise<{ mensaje?: string } | null>;
  onCerrar: () => void;
}

const CAMPO =
  "h-11 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";

export default function ChalecosModal({
  chalecos,
  colaboradores,
  vistosSinAsignar,
  numeroInicial,
  guardando,
  error,
  onAsignar,
  onCerrar,
}: Props) {
  const [numero, setNumero] = useState(numeroInicial ?? "");
  const [quien, setQuien] = useState("");
  const [hecho, setHecho] = useState<string | null>(null);
  const [liberando, setLiberando] = useState<string | null>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const numeroRef = useRef<HTMLInputElement>(null);

  /* Radix monta el contenido en un portal después de este efecto: el foco va
     en un rAF. Con el número ya puesto, lo que falta es elegir a la persona. */
  useEffect(() => {
    const id = requestAnimationFrame(() =>
      (numeroInicial ? selectRef.current : numeroRef.current)?.focus(),
    );
    return () => cancelAnimationFrame(id);
  }, [numeroInicial]);

  const normalizado = normalizarChaleco(numero);
  const duenoActual = normalizado ? chalecos[normalizado] : undefined;
  const asignados = useMemo(
    () => Object.entries(chalecos).sort(([a], [b]) => a.localeCompare(b, "es", { numeric: true })),
    [chalecos],
  );
  const personas = useMemo(
    () => [...colaboradores].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    [colaboradores],
  );
  const puestoDe = (id: string) => colaboradores.find((c) => c.id === id)?.puesto ?? null;

  const asignar = async () => {
    if (!normalizado || !quien) return;
    setHecho(null);
    const r = await onAsignar(normalizado, quien);
    if (r) {
      setHecho(r.mensaje ?? `El chaleco N° ${normalizado} quedó asignado.`);
      setNumero("");
      setQuien("");
      numeroRef.current?.focus();
    }
  };

  const liberar = async (n: string) => {
    setLiberando(n);
    setHecho(null);
    const r = await onAsignar(n, null);
    if (r) setHecho(r.mensaje ?? `El chaleco N° ${n} quedó libre.`);
    setLiberando(null);
  };

  return (
    <AdminModal
      open
      onClose={onCerrar}
      title="Chalecos del personal"
      description="El número del chaleco o casco dice quién es en las fotos"
      icon={Hash}
      variant="wide"
      footer={
        <div className="flex justify-end">
          <button type="button" onClick={onCerrar} className={BTN}>
            Listo
          </button>
        </div>
      }
    >
      <div className={`${MODAL_BODY} space-y-4`}>
        <form
          className="grid gap-2 sm:grid-cols-[9rem_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void asignar();
          }}
        >
          <label className="block">
            <span className="flex items-center gap-1 whitespace-nowrap text-sm font-bold text-[var(--text-secondary)]">
              N° del chaleco
              <InfoTip
                title="Número del chaleco"
                what="El número impreso en el chaleco o el casco, como lo lee la IA."
                affects="«03» y «3» son el mismo. Tiene que tener al menos un número."
                example="Chaleco con «12» en la espalda → 12."
              />
            </span>
            <input
              ref={numeroRef}
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              inputMode="numeric"
              maxLength={10}
              placeholder="3"
              aria-describedby="chaleco-dueno-actual"
              className={`${CAMPO} mt-1 w-full font-mono`}
            />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-[var(--text-secondary)]">Quién lo usa</span>
            <select
              ref={selectRef}
              value={quien}
              onChange={(e) => setQuien(e.target.value)}
              className={`${CAMPO} mt-1 w-full`}
            >
              <option value="">Elige a la persona…</option>
              {personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                  {p.puesto ? ` · ${p.puesto}` : ""}
                  {p.chaleco ? ` (tiene el N° ${p.chaleco})` : ""}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={guardando || !normalizado || !quien}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-[var(--accent-600,var(--accent))] px-4 text-sm font-bold text-white transition hover:brightness-95 disabled:opacity-50"
          >
            {guardando && !liberando ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Check className="h-4 w-4" aria-hidden />
            )}
            Asignar
          </button>
          <p
            id="chaleco-dueno-actual"
            className="text-xs text-[var(--text-tertiary)] sm:col-span-3"
          >
            {numero && !normalizado
              ? "Ese número no sirve: tiene que llevar al menos una cifra."
              : duenoActual
                ? `Hoy el N° ${normalizado} es de ${duenoActual.nombre ?? "una persona dada de baja"}: al asignarlo pasa a la nueva.`
                : personas.length === 0
                  ? "No hay personal activo: agrégalo en Recursos Humanos."
                  : " "}
          </p>
        </form>

        {(hecho || error) && (
          <p
            role={error ? "alert" : "status"}
            className={`rounded-xl border px-3 py-2 text-sm ${error ? "border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 text-[var(--data-error-ink)]" : "border-[var(--data-success-500)]/40 bg-[var(--data-success-500)]/10 text-[var(--text-primary)]"}`}
          >
            {error ?? hecho}
          </p>
        )}

        {vistosSinAsignar.length > 0 && (
          <div>
            <p className="mb-1.5 text-sm font-bold text-[var(--text-secondary)]">
              Vistos en las fotos y sin dueño
            </p>
            <div className="flex flex-wrap gap-1.5">
              {vistosSinAsignar.map((v) => (
                <button
                  key={v.numero}
                  type="button"
                  onClick={() => {
                    setNumero(v.numero);
                    selectRef.current?.focus();
                  }}
                  className={cn(
                    CHIP_BASE,
                    CHIP_TONO.neutro,
                    "h-8 border-dashed px-2 text-sm hover:border-[var(--accent)]",
                  )}
                >
                  N° {v.numero} · {v.fotos} {v.fotos === 1 ? "foto" : "fotos"}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="mb-1.5 text-sm font-bold text-[var(--text-secondary)]">
            Asignados ({asignados.length})
          </p>
          {asignados.length === 0 ? (
            <p className="text-sm text-[var(--text-tertiary)]">Ningún chaleco asignado todavía.</p>
          ) : (
            <ul className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-base)]">
              {asignados.map(([n, a]) => (
                <li key={n} className="flex items-center gap-2 px-3 py-2">
                  <span className="w-14 shrink-0 font-mono text-sm font-bold text-[var(--text-primary)]">
                    N° {n}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-[var(--text-primary)]">
                      {a.nombre ?? "Persona dada de baja"}
                    </span>
                    {puestoDe(a.colaboradorId) && (
                      <span className="block truncate text-xs text-[var(--text-tertiary)]">
                        {puestoDe(a.colaboradorId)}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => void liberar(n)}
                    disabled={guardando}
                    aria-label={`Liberar el chaleco N° ${n}`}
                    className={cn(BTN, "h-8 text-xs")}
                  >
                    {liberando === n ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : (
                      <X className="h-3.5 w-3.5" aria-hidden />
                    )}
                    Liberar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AdminModal>
  );
}
