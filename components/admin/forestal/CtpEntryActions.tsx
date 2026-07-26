"use client";

/**
 * CtpEntryActions — las acciones por ingreso del Libro CTP (Ver · Validar ·
 * Rechazar · Anular + el form inline de motivo). Extraído para que la tabla
 * desktop y la card mobile compartan EXACTAMENTE la misma lógica de acciones
 * (single source): si cambia una regla de estado, cambia en un solo lugar.
 */

import { Eye, Share2, ThumbsDown, ThumbsUp, XCircle } from "@buleje/design-system/icons";
import { IconAction, type WoodEntry } from "./ctp-shared";

export interface CtpEntryActionsProps {
  entry: WoodEntry;
  busy: string | null;
  rejectingId: string | null;
  rejectReason: string;
  setRejectReason: (v: string) => void;
  onStartReject: (id: string) => void;
  onCancelReject: () => void;
  onConfirmReject: (id: string) => void;
  onValidate: (id: string) => void;
  onDetail: (entry: WoodEntry) => void;
  /** Cadena hacia adelante (¿a dónde fue la madera?). Solo tiene sentido si el
   *  ingreso pudo consumirse — se muestra en validado/procesado. */
  onChain?: (entry: WoodEntry) => void;
  /** mobile-card estira los botones al ancho completo; la tabla los deja inline. */
  block?: boolean;
}

export default function CtpEntryActions({
  entry: e,
  busy,
  rejectingId,
  rejectReason,
  setRejectReason,
  onStartReject,
  onCancelReject,
  onConfirmReject,
  onValidate,
  onDetail,
  onChain,
  block = false,
}: CtpEntryActionsProps) {
  if (rejectingId === e.id) {
    return (
      // w-full sm:w-auto/w-48: en desktop es idéntico a antes (192px fijo); en
      // mobile-card el valor de la celda solo tiene ~58% del ancho, y un ancho
      // fijo de 192px desborda en pantallas chicas.
      <div className="inline-flex w-full flex-col items-end gap-2 sm:w-auto">
        <input
          type="text"
          value={rejectReason}
          onChange={(ev) => setRejectReason(ev.target.value)}
          placeholder={e.status === "validado" ? "Motivo de anulación (min 3)" : "Motivo (min 3 chars)"}
          aria-label={e.status === "validado" ? "Motivo de la anulación" : "Motivo del rechazo"}
          className="h-9 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2 text-sm outline-none focus:border-[var(--data-error-500)] sm:w-48"
          autoFocus
        />
        <div className="flex gap-2">
          <button
            type="button"
            disabled={rejectReason.trim().length < 3 || busy === `${e.id}:reject`}
            onClick={() => onConfirmReject(e.id)}
            className="inline-flex h-9 items-center gap-1 rounded-xl bg-[var(--data-error-600)] px-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            {e.status === "validado" ? "Confirmar anulación" : "Confirmar rechazo"}
          </button>
          <button
            type="button"
            onClick={onCancelReject}
            className="inline-flex h-9 items-center rounded-xl border-2 border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-primary)]"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  // En la tabla mandan los íconos: cuatro botones con texto por fila medían más
  // que las columnas de datos y empujaban todo al scroll horizontal. La única
  // que conserva palabra es Validar — es la acción del día a día, y en verde
  // sólido se encuentra sin buscarla. La card de móvil sigue con texto (`block`).
  if (!block) {
    return (
      <div className="inline-flex items-center gap-1">
        <IconAction icon={Eye} label="Ver ficha completa" onClick={() => onDetail(e)} />
        {onChain && (e.status === "validado" || e.status === "procesado") && (
          <IconAction
            icon={Share2}
            tone="info"
            label="Cadena: a dónde fue esta madera (corridas y despachos)"
            onClick={() => onChain(e)}
          />
        )}
        {e.status === "pendiente" && (
          <>
            <button
              type="button"
              disabled={busy === `${e.id}:validate`}
              onClick={() => onValidate(e.id)}
              title="Validar ingreso"
              className="inline-flex h-9 items-center gap-1 rounded-xl bg-[var(--data-success-600)] px-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
            >
              <ThumbsUp className="h-3.5 w-3.5" />
              Validar
            </button>
            <IconAction icon={ThumbsDown} tone="danger" label="Rechazar el ingreso" onClick={() => onStartReject(e.id)} />
          </>
        )}
        {e.status === "validado" && (
          <IconAction
            icon={XCircle}
            tone="danger"
            label="Anular ingreso validado (corrección con motivo)"
            onClick={() => onStartReject(e.id)}
          />
        )}
      </div>
    );
  }

  // block → cada botón crece a partes iguales (grow) para llenar la card.
  const btn = block ? "grow justify-center" : "";
  return (
    <div className={`inline-flex items-center gap-2 ${block ? "flex w-full" : ""}`}>
      <button
        type="button"
        onClick={() => onDetail(e)}
        title="Ver ficha completa"
        className={`inline-flex h-9 items-center gap-1 rounded-xl border-2 border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] ${btn}`}
      >
        <Eye className="h-3.5 w-3.5" />
        Ver
      </button>
      {onChain && (e.status === "validado" || e.status === "procesado") && (
        <button
          type="button"
          onClick={() => onChain(e)}
          title="Cadena: a dónde fue esta madera (corridas y despachos)"
          className={`inline-flex h-9 items-center gap-1 rounded-xl border-2 border-[var(--data-info-500)] bg-[var(--data-info-50)] px-3 text-sm font-bold text-[var(--data-info-700)] hover:bg-[var(--data-info-100)] ${btn}`}
        >
          <Share2 className="h-3.5 w-3.5" />
          Cadena
        </button>
      )}
      {e.status === "pendiente" && (
        <>
          <button
            type="button"
            disabled={busy === `${e.id}:validate`}
            onClick={() => onValidate(e.id)}
            title="Validar ingreso"
            className={`inline-flex h-9 items-center gap-1 rounded-xl bg-[var(--data-success-600)] px-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50 ${btn}`}
          >
            <ThumbsUp className="h-3 w-3" />
            Validar
          </button>
          <button
            type="button"
            onClick={() => onStartReject(e.id)}
            title="Rechazar"
            className={`inline-flex h-9 items-center gap-1 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-3 text-sm font-bold text-[var(--data-error-700)] hover:bg-[var(--data-error-100)] ${btn}`}
          >
            <ThumbsDown className="h-3 w-3" />
            Rechazar
          </button>
        </>
      )}
      {e.status === "validado" && (
        <button
          type="button"
          onClick={() => onStartReject(e.id)}
          title="Anular ingreso validado (corrección con motivo)"
          className={`inline-flex h-9 items-center gap-1 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-3 text-sm font-bold text-[var(--data-error-700)] hover:bg-[var(--data-error-100)] ${btn}`}
        >
          <XCircle className="h-3.5 w-3.5" />
          Anular
        </button>
      )}
    </div>
  );
}
