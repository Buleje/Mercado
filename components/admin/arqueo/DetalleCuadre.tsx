"use client";

import { useId, useRef } from "react";
import { BlockTitle, CardTitle } from "@buleje/design-system";
import { Banknote, Coins, MessageCircle, X } from "@buleje/design-system/icons";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { useVentanaDeModal } from "@/hooks/use-ventana-de-modal";
import { ControlesDeVentana, TiradorDeVentana } from "@/components/admin/shared/modal-controles-ventana";
import { leerNotasArqueo } from "@/lib/caja/leer-notas-arqueo";
import { cn } from "@/lib/utils";
import { STATUS_MAP, TITULO_VENTANA, fmt, fmtSigno, horaLima, textoWhatsApp, type CashAudit } from "./arqueo-shared";

/** Lo que el arqueo contó, sacado de sus propias notas (billetes, monedas, medios digitales, foto). */
function ComoSeConto({ notes }: { notes: string }) {
  const arqueo = leerNotasArqueo(notes);
  if (!arqueo.hayDatos) return null;
  const chips: Array<{ label: string; valor: number; Icono: typeof Coins }> = [];
  if (arqueo.billetes != null) chips.push({ label: "Billetes", valor: arqueo.billetes, Icono: Banknote });
  if (arqueo.monedas != null) chips.push({ label: "Monedas", valor: arqueo.monedas, Icono: Coins });
  for (const d of arqueo.digitales) chips.push({ label: d.medio, valor: d.monto, Icono: Coins });
  if (chips.length === 0 && !arqueo.fotoUrl) return null;
  return (
    <div>
      <BlockTitle className="mb-2 flex items-center gap-1"><Coins className="h-4 w-4" aria-hidden /> Cómo se contó</BlockTitle>
      <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {chips.map(({ label, valor, Icono }) => (
          <div key={label} className="flex items-center justify-between rounded-lg bg-[var(--surface-sunken)] px-3 py-1.5 text-sm">
            <span className="flex items-center gap-1 text-[var(--text-secondary)]"><Icono className="h-4 w-4" aria-hidden /> {label}</span>
            <span className="font-bold tabular-nums text-[var(--text-primary)]">{fmt(valor)}</span>
          </div>
        ))}
      </div>
      {arqueo.fotoUrl && (
        <a href={arqueo.fotoUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-[var(--accent-ink)] hover:underline dark:text-[var(--accent)]">
          Ver la foto del cajón
        </a>
      )}
    </div>
  );
}

export default function DetalleCuadre({ detail, onClose }: { detail: CashAudit; onClose: () => void }) {
  const tituloId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  useModalAccesible(panelRef, { onCerrar: onClose, activo: true });
  const ventana = useVentanaDeModal(true, { ref: panelRef, aplicarTranslate: true, claveMemoria: "cash-audit-detalle" });
  const s = STATUS_MAP[detail.status];
  const cerrada = detail.status !== "pendiente";

  return (
    <div className="modal-backdrop p-4" onClick={(e) => { if (e.target === e.currentTarget && !ventana.fijado) onClose(); }}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        tabIndex={-1}
        className="relative max-h-[80vh] w-full max-w-[32rem] space-y-4 overflow-auto rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div {...ventana.asaProps} className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle id={tituloId} className={TITULO_VENTANA}>Cuadre del {detail.fecha} · {detail.turno}</CardTitle>
            <p className="text-sm text-[var(--text-secondary)]">
              {detail.cajero !== "—" ? `Abrió ${detail.cajero} a las ${horaLima(detail.openedAt)}` : `Abierta a las ${horaLima(detail.openedAt)}`}
              {detail.closedAt ? ` · cerró ${detail.cerro || "—"} a las ${horaLima(detail.closedAt)}` : " · sigue abierta"}
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-1">
            <ControlesDeVentana ventana={ventana} />
            <button type="button" aria-label="Cerrar" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-[var(--surface-sunken)]"><X className="h-4 w-4 text-[var(--text-secondary)]" /></button>
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded-xl bg-[var(--surface-sunken)] p-3"><p className="libro-kicker">Esperado</p><p className="font-extrabold tabular-nums text-[var(--text-primary)]">{fmt(detail.expectedAmount)}</p></div>
          <div className="rounded-xl bg-[var(--surface-sunken)] p-3"><p className="libro-kicker">Contado</p><p className="font-extrabold tabular-nums text-[var(--text-primary)]">{cerrada ? fmt(detail.countedAmount) : "—"}</p></div>
          <div className={cn("rounded-xl p-3", s.bg)}><p className="libro-kicker">Diferencia</p><p className={cn("font-extrabold tabular-nums", s.color)}>{cerrada ? fmtSigno(detail.difference) : "—"}</p></div>
        </div>

        <ComoSeConto notes={detail.notes} />

        {detail.conteos.length > 0 && (
          <div>
            <BlockTitle className="mb-2">Conteos durante el turno · {detail.conteos.length}</BlockTitle>
            <ul className="divide-y divide-[var(--rule-soft)] rounded-lg border border-[var(--rule-soft)] text-sm">
              {detail.conteos.slice(0, 10).map((c) => (
                <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-x-3 px-3 py-2">
                  <span className="tabular-nums text-[var(--text-secondary)]">{horaLima(c.creadoEn)}</span>
                  <span className="font-bold tabular-nums text-[var(--text-primary)]">{fmt(c.contado)}</span>
                  {c.diferencia != null && (
                    <span className={cn("tabular-nums", c.diferencia < 0 ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" : "text-[var(--text-secondary)]")}>{fmtSigno(c.diferencia)}</span>
                  )}
                  {c.observacion && <span className="w-full text-xs text-[var(--text-secondary)]">«{c.observacion}»</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {detail.notes && <p className="text-sm italic text-[var(--text-secondary)]">«{detail.notes}»</p>}

        <a
          href={`https://wa.me/?text=${encodeURIComponent(textoWhatsApp(detail))}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--rule-base)] px-3 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
        >
          <MessageCircle className="h-4 w-4" aria-hidden /> Enviar por WhatsApp
        </a>
        <TiradorDeVentana ventana={ventana} />
      </div>
    </div>
  );
}
