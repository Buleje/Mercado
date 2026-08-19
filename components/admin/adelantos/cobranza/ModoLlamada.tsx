"use client";

/**
 * La ronda de cobranza, una persona a la vez.
 *
 * En la lista se pierde el hilo: se llama a uno, suena el teléfono, se vuelve y
 * ya no se sabe por dónde se iba. Acá hay una sola persona en grande —nombre,
 * cuánto debe, qué prometió— con los botones de llamar, escribir y anotar, y
 * «siguiente». Es la pantalla del rato de cobrar, no la del análisis.
 */

import { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  NotebookPen,
  Phone,
  X,
} from "@buleje/design-system/icons";
import { formatCurrency } from "@/lib/currency";
import { enlaceWhatsAppConTexto } from "@/lib/adelantos/contacto";
import { etiquetaGestion, type Gestion, type PromesaVigente } from "@/lib/adelantos/gestion-cobranza";
import { explicarAtraso, type DeudorCobranza } from "@/lib/adelantos/urgencia-cobranza";

export default function ModoLlamada({
  deudores,
  promesas,
  ultimas,
  mensajeDe,
  onAnotar,
  onGestionRapida,
  onClose,
}: {
  deudores: DeudorCobranza[];
  promesas: Map<string, PromesaVigente>;
  ultimas: Map<string, Gestion>;
  mensajeDe: (d: DeudorCobranza) => string;
  onAnotar: (d: DeudorCobranza) => void;
  onGestionRapida: (beneficiarioId: string, tipo: string) => Promise<void>;
  onClose: () => void;
}) {
  const [i, setI] = useState(0);
  const [hechos, setHechos] = useState<Set<string>>(new Set());

  const d = deudores[i];

  /* Las flechas mueven la ronda y Escape la cierra: con el teléfono en la mano
     no se apunta con el mouse a un botón de 40 px. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setI((v) => Math.min(v + 1, deudores.length - 1));
      if (e.key === "ArrowLeft") setI((v) => Math.max(v - 1, 0));
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deudores.length, onClose]);

  if (!d) return null;

  const wa = enlaceWhatsAppConTexto(d.telefono, mensajeDe(d));
  const promesa = promesas.get(d.id);
  const ultima = ultimas.get(d.id);
  const marcar = async (tipo: string) => {
    setHechos((prev) => new Set(prev).add(d.id));
    await onGestionRapida(d.id, tipo);
    if (i < deudores.length - 1) setI(i + 1);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--surface-canvas)]">
      {/* Barra: dónde estoy y cuánto falta. */}
      <div className="flex shrink-0 items-center justify-between gap-3 px-6 py-4">
        <p className="text-base font-bold text-[var(--text-secondary)]">
          <span className="tabular-nums text-[var(--text-primary)]">{i + 1}</span> de {deudores.length}
          <span className="text-[var(--text-tertiary)]"> · {hechos.size} gestionados</span>
        </p>
        <button
          onClick={onClose}
          aria-label="Salir del modo llamada"
          className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)]"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-5 py-6 text-center">
          <span className="flex h-24 w-24 items-center justify-center rounded-full bg-primary/10 text-4xl font-extrabold text-[var(--accent-ink)] dark:text-[var(--accent)]">
            {d.nombre.charAt(0).toUpperCase()}
          </span>
          <div>
            <h2 className="text-3xl font-extrabold text-[var(--text-primary)]">{d.nombre}</h2>
            {d.telefono && <p className="mt-1 text-xl tabular-nums text-[var(--text-secondary)]">{d.telefono}</p>}
          </div>

          <p className="text-5xl font-extrabold tabular-nums text-[var(--data-warning)]">{formatCurrency(d.saldo)}</p>

          <div className="flex flex-wrap justify-center gap-2">
            {d.dias > 0 && (
              <span className="rounded-full bg-[var(--surface-sunken)] px-3.5 py-1.5 text-base font-semibold text-[var(--text-secondary)]">
                {explicarAtraso(d)}
              </span>
            )}
            {promesa && (
              <span
                className={`rounded-full px-3.5 py-1.5 text-base font-bold ${
                  promesa.estado === "incumplio"
                    ? "bg-[var(--data-error)]/15 text-[var(--data-error)]"
                    : "bg-[var(--data-info)]/15 text-[var(--data-info)]"
                }`}
              >
                {promesa.estado === "incumplio"
                  ? "Prometió y no cumplió"
                  : promesa.estado === "vence-hoy"
                    ? "Prometió pagar HOY"
                    : `Prometió en ${promesa.faltan} días`}
              </span>
            )}
          </div>

          {/* Lo último que se le dijo: sin esto se repite la misma conversación. */}
          {ultima && (
            <p className="max-w-lg text-base text-[var(--text-tertiary)]">
              Última vez: {etiquetaGestion(ultima.tipo)}
              {ultima.nota ? ` — «${ultima.nota}»` : ""}
            </p>
          )}

          <div className="flex flex-wrap justify-center gap-2">
            {d.telefono && (
              <a
                href={`tel:${d.telefono.replace(/\D/g, "")}`}
                className="inline-flex h-14 items-center gap-2 rounded-2xl bg-primary px-6 text-lg font-bold text-white transition-colors hover:bg-primary-dark"
              >
                <Phone className="h-5 w-5" /> Llamar
              </a>
            )}
            {wa && (
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => void onGestionRapida(d.id, "RECORDATORIO")}
                className="inline-flex h-14 items-center gap-2 rounded-2xl bg-primary/12 px-6 text-lg font-bold text-[var(--accent-ink)] ring-1 ring-primary/40 transition-colors hover:bg-primary/20 dark:text-[var(--accent)]"
              >
                <MessageCircle className="h-5 w-5" /> WhatsApp
              </a>
            )}
            <button
              onClick={() => onAnotar(d)}
              className="inline-flex h-14 items-center gap-2 rounded-2xl bg-[var(--surface-sunken)] px-6 text-lg font-bold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
            >
              <NotebookPen className="h-5 w-5" /> Anotar
            </button>
          </div>

          {/* Los dos desenlaces que no abren nada: se anotan y se pasa al que sigue. */}
          <div className="flex flex-wrap justify-center gap-2">
            <button
              onClick={() => void marcar("NO_CONTESTA")}
              className="h-11 rounded-xl bg-[var(--surface-sunken)] px-4 text-base font-bold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
            >
              No contesta
            </button>
            <button
              onClick={() => void marcar("PAGO")}
              className="h-11 rounded-xl bg-[var(--data-success)]/12 px-4 text-base font-bold text-[var(--data-success)] transition-colors hover:bg-[var(--data-success)]/20"
            >
              Ya pagó
            </button>
          </div>
        </div>
      </div>

      {/* Navegación al pie: el pulgar llega ahí en un teléfono. */}
      <div className="flex shrink-0 items-center justify-between gap-3 bg-[var(--surface-sunken)] px-6 py-4">
        <button
          onClick={() => setI(Math.max(0, i - 1))}
          disabled={i === 0}
          className="inline-flex h-12 items-center gap-1.5 rounded-xl px-4 text-base font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-raised)] disabled:opacity-40"
        >
          <ChevronLeft className="h-5 w-5" /> Anterior
        </button>
        <button
          onClick={() => (i < deudores.length - 1 ? setI(i + 1) : onClose())}
          className="inline-flex h-12 items-center gap-1.5 rounded-xl bg-primary px-5 text-base font-bold text-white transition-colors hover:bg-primary-dark"
        >
          {i < deudores.length - 1 ? "Siguiente" : "Terminar"} <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
