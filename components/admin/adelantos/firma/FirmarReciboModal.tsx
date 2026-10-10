"use client";

/**
 * «Firmar recibo» de un adelanto (08-10): la persona firma con el dedo en el
 * celular (o con el mouse) y queda guardado en el adelanto, con su nombre, su
 * DNI y la hora de Lima. Antes no había forma: en Blas, 0 de 8 adelantos
 * tenían foto o recibo.
 *
 * Se abre encima de la ficha del adelanto o al terminar el alta: va en
 * `z-modal-2` con `useModalAccesible`, como «Anular». En el celular es una hoja
 * que sube desde abajo, a lo ancho: el lienzo necesita todo el ancho del dedo.
 *
 * Arriba de la firma, lo que se firma (monto en número y letras, quién da y
 * quién recibe): nadie debería firmar sin verlo.
 */

import { useRef } from "react";
import { CardTitle } from "@buleje/design-system";
import { AlertTriangle, Check, Download, FileSignature, Loader2, X } from "@buleje/design-system/icons";
import LienzoFirma from "@/components/ui-system/LienzoFirma";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { rotuloDocumento } from "@/lib/adelantos/comprobante";
import { esReciboFirmado, fechaHoraLima, limpiarDocumento } from "@/lib/adelantos/recibo-firmado";
import type { DbAdelanto } from "@/lib/db/adelantos.db";
import { useFirmarRecibo, type FirmarRecibo } from "./use-firmar-recibo";

const INPUT =
  "h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-base text-[var(--text-primary)] outline-none focus:border-primary focus:ring-2 focus:ring-[var(--accent-muted)]";
const SECUNDARIO =
  "inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-[var(--rule-base)] px-4 text-base font-semibold text-[var(--text-secondary)] transition-colors hover:border-primary hover:text-[var(--text-primary)] disabled:opacity-50";
const PRIMARIO =
  /* `sm:flex-1`, no `flex-1`: en la columna del celular la base 0 aplastaba el botón a 24 px (QA 400). */
  "inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary sm:flex-1 px-4 text-base font-semibold text-white shadow-[var(--shadow-sm)] transition-colors hover:bg-primary-dark disabled:opacity-50 disabled:shadow-none";

export default function FirmarReciboModal({
  adelantoId,
  adelanto,
  onClose,
  onGuardado,
}: {
  adelantoId: string;
  adelanto?: DbAdelanto | null;
  onClose: () => void;
  onGuardado?: (url: string) => void;
}) {
  const f = useFirmarRecibo({ adelantoId, adelanto, onGuardado });
  const ref = useRef<HTMLDivElement>(null);
  const ocupado = f.fase === "guardando";
  /* Siempre con `onCerrar`: sin él, el Escape seguía de largo y cerraba la ficha de abajo a mitad del guardado. */
  useModalAccesible(ref, { onCerrar: () => !ocupado && onClose() });
  /* Mientras llega el nombre del negocio (la ruta del membrete puede tardar), «tu negocio»
     y no «—»; la hoja que se guarda espera el nombre de verdad. */
  const vista = f.lineas(fechaHoraLima(new Date()), f.negocio ?? "tu negocio");

  return (
    <div
      className="fixed inset-0 z-modal-2 flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      role="presentation"
      /* Tocar afuera cierra sólo sin firma a medio hacer: un dedo que se pasa del lienzo no la borra. */
      onClick={(e) => e.target === e.currentTarget && !ocupado && f.trazos.length === 0 && onClose()}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="firmar-recibo-titulo"
        tabIndex={-1}
        data-firmar-recibo
        className="flex max-h-[100dvh] w-full max-w-[40rem] flex-col overflow-hidden rounded-t-2xl bg-[var(--surface-raised)] shadow-[var(--shadow-xl)] sm:max-h-[92vh] sm:rounded-2xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-2 pt-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[var(--accent-ink)] dark:text-[var(--accent)]">
              <FileSignature className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <CardTitle id="firmar-recibo-titulo" className="font-display text-base sm:text-lg font-semibold tracking-tight text-[var(--text-primary)]">
                Firmar el recibo
              </CardTitle>
              <p className="truncate font-mono text-sm text-[var(--text-tertiary)]">{f.a?.codigoOperacion ?? "—"}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={ocupado}
            aria-label="Cerrar"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-4 sm:px-6">
          {f.noCargo ? (
            <p role="alert" className="text-base text-[var(--data-error)]">No se pudo leer el adelanto. Ciérralo y vuelve a abrirlo.</p>
          ) : !f.a || !vista ? (
            <div className="h-48 animate-pulse rounded-2xl bg-[var(--surface-sunken)]" aria-label="Cargando el adelanto" />
          ) : f.fase === "guardado" ? (
            <Guardado f={f} />
          ) : (
            <Formulario f={f} vista={vista} ocupado={ocupado} />
          )}
          {f.error && (
            <p role="alert" className="flex items-start gap-2 text-sm font-semibold text-[var(--data-error)]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {f.error}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 bg-[var(--surface-sunken)] px-5 py-4 sm:flex-row sm:px-6">
          {f.fase === "guardado" ? (
            <>
              <button type="button" onClick={() => void f.bajarSinGuardar()} className={SECUNDARIO}>
                <Download className="h-4 w-4" aria-hidden /> Bajar el recibo
              </button>
              <button type="button" onClick={onClose} className={PRIMARIO}>
                <Check className="h-5 w-5" aria-hidden /> Listo
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => void f.bajarSinGuardar()} disabled={ocupado || !f.a} className={SECUNDARIO} title="El PDF con la firma, sin guardarla en el adelanto">
                <Download className="h-4 w-4" aria-hidden /> Sólo bajar el PDF
              </button>
              <button type="button" onClick={() => void f.guardar()} disabled={ocupado || !f.a} data-guardar-firma className={PRIMARIO}>
                {ocupado ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <FileSignature className="h-5 w-5" aria-hidden />}
                {ocupado ? (f.paso ?? "Guardando…") : "Guardar firma y bajar el recibo"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Lo que se firma, quién firma y el lienzo. */
function Formulario({ f, vista, ocupado }: { f: FirmarRecibo; vista: NonNullable<ReturnType<FirmarRecibo["lineas"]>>; ocupado: boolean }) {
  const anterior = f.a?.comprobanteUrl ?? null;
  return (
    <>
      <div className="rounded-2xl bg-[var(--surface-sunken)] px-4 py-3">
        <p className="text-2xl font-extrabold tabular-nums text-[var(--text-primary)]">{vista.monto}</p>
        <p className="text-sm text-[var(--text-secondary)]">{vista.letras}</p>
        <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{vista.quien}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]">
        <label className="block space-y-1">
          <span className="text-sm font-bold text-[var(--text-secondary)]">Nombre de quien firma</span>
          <input value={f.nombre} onChange={(e) => f.setNombre(e.target.value)} disabled={ocupado} autoComplete="off" className={INPUT} data-firma-nombre />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-bold text-[var(--text-secondary)]">DNI</span>
          <input
            value={f.documento}
            onChange={(e) => f.setDocumento(e.target.value)}
            disabled={ocupado}
            inputMode="text"
            autoComplete="off"
            maxLength={16}
            placeholder="8 números"
            className={`${INPUT} font-mono tabular-nums`}
            data-firma-dni
          />
        </label>
      </div>

      <LienzoFirma trazos={f.trazos} onCambio={f.setTrazos} etiqueta={`Firma de ${f.nombre || "quien recibe"}`} deshabilitado={ocupado} />

      <p className="text-sm text-[var(--text-tertiary)]">
        {vista.cuando} · queda guardada como la foto del adelanto
        {anterior ? (esReciboFirmado(anterior) ? ", con la hoja firmada anterior arriba." : ", con la foto que ya tenía (el voucher) arriba.") : "."}
      </p>
      {f.falta && (
        <p role="status" className="text-sm font-semibold text-[var(--data-warning-ink)]">
          {f.falta}
        </p>
      )}
    </>
  );
}

/** Ya guardado: qué quedó y dónde. */
function Guardado({ f }: { f: FirmarRecibo }) {
  return (
    <div role="status" className="flex items-start gap-3 rounded-2xl bg-[var(--data-success)]/10 px-4 py-4" data-firma-guardada>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--data-success)]/15 text-[var(--data-success)]">
        <Check className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-base font-extrabold text-[var(--text-primary)]">Firma guardada en el adelanto</p>
        <p className="text-sm text-[var(--text-secondary)]">
          {f.nombre.trim()} · {rotuloDocumento(limpiarDocumento(f.documento))}. La hoja firmada es ahora la foto del comprobante; el PDF se bajó con la firma en su línea.
        </p>
      </div>
    </div>
  );
}
