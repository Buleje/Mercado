"use client";

/**
 * Los datos con los que se dio el adelanto.
 *
 * Estaban todos en la base y en ninguna pantalla: la fecha, la modalidad, a
 * quién exactamente (con documento y teléfono) y —sobre todo— el MOTIVO que
 * alguien se tomó el trabajo de escribir al darlo. Sin esto, «¿para qué era este
 * adelanto?» sólo se podía contestar de memoria.
 */

import { CalendarDays, Hash, Phone, Repeat, StickyNote } from "@buleje/design-system/icons";
import type { DbAdelanto } from "@/lib/db/adelantos.db";
import { MODALIDAD_LABEL } from "../shared";

const fechaLarga = (iso: string) =>
  new Date(iso).toLocaleDateString("es-PE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

/** Hace cuánto se dio, en la unidad que uno usa al hablar. */
function hace(iso: string): string {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  if (dias < 30) return `hace ${dias} días`;
  const meses = Math.floor(dias / 30);
  return meses === 1 ? "hace un mes" : `hace ${meses} meses`;
}

export default function FichaAdelanto({ adelanto: a }: { adelanto: DbAdelanto }) {
  return (
    <div className="space-y-3 rounded-2xl border-2 border-[var(--rule-soft)] p-4">
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <Dato icon={CalendarDays} label="Se dio el">
          {/* `capitalize` mayusculiza CADA palabra: «Martes, 04 De Agosto De
              2026». Sólo la primera letra de la frase. */}
          <span className="inline-block first-letter:uppercase">{fechaLarga(a.fechaAdelanto)}</span>
          <span className="text-[var(--text-tertiary)]"> · {hace(a.fechaAdelanto)}</span>
        </Dato>
        <Dato icon={Repeat} label="Cómo se liquida">
          {MODALIDAD_LABEL[a.modalidad] ?? a.modalidad}
          {a.modalidad === "ENTREGAS_PACTADAS" && a.entregasPactadas.length > 0 && (
            <span className="text-[var(--text-tertiary)]"> · {a.entregasPactadas.length} cuotas</span>
          )}
        </Dato>
        {a.beneficiario?.documento && (
          <Dato icon={Hash} label="Documento">
            <span className="tabular-nums">{a.beneficiario.documento}</span>
          </Dato>
        )}
        {a.beneficiario?.telefono && (
          <Dato icon={Phone} label="Teléfono">
            <span className="tabular-nums">{a.beneficiario.telefono}</span>
          </Dato>
        )}
      </div>

      {/* El motivo va aparte y a lo ancho: es texto libre, no un dato de una
          línea, y es lo primero que se busca cuando el adelanto ya tiene meses. */}
      {a.notas && (
        <div className="border-t border-[var(--rule-soft)] pt-3">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
            <StickyNote className="h-3.5 w-3.5" aria-hidden /> Motivo
          </p>
          <p className="mt-1 whitespace-pre-wrap text-base text-[var(--text-primary)]">{a.notas}</p>
        </div>
      )}
    </div>
  );
}

function Dato({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden /> {label}
      </p>
      <div className="mt-0.5 truncate text-base font-semibold text-[var(--text-primary)]">{children}</div>
    </div>
  );
}
