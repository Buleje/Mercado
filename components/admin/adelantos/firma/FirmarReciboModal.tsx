"use client";

/**
 * «Firmar recibo» de un adelanto (08-10 → ADR-491): la persona firma con el
 * dedo en el celular (o con el mouse) y, si quiere, se le toma la foto de la
 * huella. Queda en el REGISTRO de firmas del adelanto, con su nombre, su DNI y
 * la hora de Lima; firmar de nuevo no borra la anterior. Antes no había forma:
 * en Blas, 0 de 8 adelantos tenían foto o recibo.
 *
 * Se abre encima de la ficha del adelanto o al terminar el alta: va en
 * un `AdminModal` con `aboveModals` (11-10, antes overlay a mano). En el celular es una hoja
 * que sube desde abajo, a lo ancho: el lienzo necesita todo el ancho del dedo.
 *
 * Arriba de la firma, lo que se firma (monto en número y letras, quién da y
 * quién recibe): nadie debería firmar sin verlo.
 */

import {
  AlertTriangle,
  Check,
  Download,
  FileSignature,
  Loader2,
} from "@buleje/design-system/icons";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import LienzoFirma from "@/components/ui-system/LienzoFirma";
import { button } from "@/components/ui-system/button-variants";
import { rotuloDocumento } from "@/lib/adelantos/comprobante";
import { fechaHoraLima, limpiarDocumento } from "@/lib/adelantos/recibo-firmado";
import type { DbAdelanto } from "@/lib/db/adelantos.db";
import CapturaHuella from "./CapturaHuella";
import { useFirmarRecibo, type FirmarRecibo } from "./use-firmar-recibo";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";

const INPUT =
  "h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-base text-[var(--text-primary)] outline-none focus:border-primary focus:ring-2 focus:ring-[var(--accent-muted)]";
const SECUNDARIO =
  "inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-[var(--rule-base)] px-4 text-base font-semibold text-[var(--text-secondary)] transition-colors hover:border-primary hover:text-[var(--text-primary)] disabled:opacity-50";
/* `sm:flex-1`, no `flex-1`: en la columna del celular la base 0 aplastaba el botón a 24 px (QA 400).
   `primary` (negro en claro, blanco en oscuro): blanco sobre turquesa daba 3,2:1. */
const PRIMARIO = button({
  variant: "primary",
  size: "xl",
  className: "rounded-xl whitespace-normal px-4 sm:flex-1",
});

export default function FirmarReciboModal({
  adelantoId,
  adelanto,
  onClose,
  onGuardado,
}: {
  adelantoId: string;
  adelanto?: DbAdelanto | null;
  onClose: () => void;
  onGuardado?: () => void;
}) {
  const f = useFirmarRecibo({ adelantoId, adelanto, onGuardado });
  const ocupado = f.fase === "guardando";
  /* Cerrar (X, Escape o tocar afuera) nunca a mitad del guardado, y con una firma a medio
     hacer pregunta antes: un dedo que se pasa del lienzo o un Escape no borran la firma
     (antes el clic afuera se ignoraba en silencio y Escape la perdía sin aviso). */
  const { confirm } = useConfirm();
  const pedirCierre = async () => {
    if (ocupado) return;
    if (f.trazos.length > 0 && f.fase !== "guardado") {
      const descartar = await confirm({
        title: "¿Descartar la firma?",
        description: "La firma que dibujaste se borra y el recibo queda sin firmar.",
        intent: "danger",
        confirmLabel: "Descartar",
        cancelLabel: "Seguir firmando",
      });
      if (!descartar) return;
    }
    onClose();
  };

  /* Mientras llega el nombre del negocio (la ruta del membrete puede tardar), «tu negocio»
     y no «—»; la hoja que se guarda espera el nombre de verdad. */
  const vista = f.lineas(fechaHoraLima(new Date()), f.negocio ?? "tu negocio");

  return (
    <>
      <AdminModal
        open
        onClose={() => void pedirCierre()}
        title="Firmar el recibo"
        description={f.a?.codigoOperacion ?? "—"}
        icon={FileSignature}
        size="lg"
        aboveModals
        claveVentana="adelantos-firmar-recibo"
        footer={
          <ModalFooter>
            {f.fase === "guardado" ? (
              <>
                <button type="button" onClick={() => void f.bajarGuardado()} className={SECUNDARIO}>
                  <Download className="h-4 w-4" aria-hidden /> Bajar el recibo
                </button>
                <button type="button" onClick={onClose} className={PRIMARIO}>
                  <Check className="h-5 w-5" aria-hidden /> Listo
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void f.bajarSinGuardar()}
                  disabled={ocupado || !f.a}
                  className={SECUNDARIO}
                  title="El PDF con la firma, sin guardarla en el adelanto"
                >
                  <Download className="h-4 w-4" aria-hidden /> Sólo bajar el PDF
                </button>
                <button
                  type="button"
                  onClick={() => void f.guardar()}
                  disabled={ocupado || !f.a}
                  data-guardar-firma
                  className={PRIMARIO}
                >
                  {ocupado ? (
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  ) : (
                    <FileSignature className="h-5 w-5" aria-hidden />
                  )}
                  {ocupado ? (f.paso ?? "Guardando…") : "Guardar firma y bajar el recibo"}
                </button>
              </>
            )}
          </ModalFooter>
        }
      >
        <div className={`space-y-4 ${MODAL_BODY}`} data-firmar-recibo>
          {f.noCargo ? (
            <p role="alert" className="text-base text-[var(--data-error)]">
              No se pudo leer el adelanto. Ciérralo y vuelve a abrirlo.
            </p>
          ) : !f.a || !vista ? (
            <div
              className="h-48 animate-pulse rounded-2xl bg-[var(--surface-sunken)]"
              aria-label="Cargando el adelanto"
            />
          ) : f.fase === "guardado" ? (
            <Guardado f={f} />
          ) : (
            <Formulario f={f} vista={vista} ocupado={ocupado} />
          )}
          {f.error && (
            <p
              role="alert"
              className="flex items-start gap-2 text-sm font-semibold text-[var(--data-error)]"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {f.error}
            </p>
          )}
        </div>
      </AdminModal>
    </>
  );
}

/** Lo que se firma, quién firma y el lienzo. */
function Formulario({
  f,
  vista,
  ocupado,
}: {
  f: FirmarRecibo;
  vista: NonNullable<ReturnType<FirmarRecibo["lineas"]>>;
  ocupado: boolean;
}) {
  return (
    <>
      <div className="rounded-2xl bg-[var(--surface-sunken)] px-4 py-3">
        <p className="text-2xl font-extrabold tabular-nums text-[var(--text-primary)]">
          {vista.monto}
        </p>
        <p className="text-sm text-[var(--text-secondary)]">{vista.letras}</p>
        <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{vista.quien}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]">
        <label className="block space-y-1">
          <span className="text-sm font-bold text-[var(--text-secondary)]">
            Nombre de quien firma
          </span>
          <input
            value={f.nombre}
            onChange={(e) => f.setNombre(e.target.value)}
            disabled={ocupado}
            autoComplete="off"
            className={INPUT}
            data-firma-nombre
          />
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

      <LienzoFirma
        trazos={f.trazos}
        onCambio={f.setTrazos}
        etiqueta={`Firma de ${f.nombre || "quien recibe"}`}
        deshabilitado={ocupado}
      />

      {/* La huella, opcional: plegada ya es un solo botón (QA 400: un «mostrar» delante era un toque de más). */}
      <CapturaHuella
        valor={f.huella}
        onCambio={f.setHuella}
        consentido={f.consentido}
        onConsentir={f.setConsentido}
        deshabilitado={ocupado}
      />

      <p className="text-sm text-[var(--text-tertiary)]">
        {vista.cuando} · queda en el registro de firmas del adelanto. Si ya tenía una, la anterior
        no se borra: queda abajo como reemplazada.
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
    <div
      role="status"
      className="flex items-start gap-3 rounded-2xl bg-[var(--data-success)]/10 px-4 py-4"
      data-firma-guardada
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--data-success)]/15 text-[var(--data-success)]">
        <Check className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-base font-extrabold text-[var(--text-primary)]">
          {f.huellaGuardada ? "Firma y huella guardadas" : "Firma guardada"} en el adelanto
        </p>
        <p className="text-sm text-[var(--text-secondary)]">
          {f.nombre.trim()} · {rotuloDocumento(limpiarDocumento(f.documento))}. Quedó en su registro
          de firmas; el PDF se bajó con la firma en su línea.
        </p>
      </div>
    </div>
  );
}
