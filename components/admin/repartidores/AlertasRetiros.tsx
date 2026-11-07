"use client";

import { useState, type FormEvent } from "react";
import { CardTitle } from "@buleje/design-system";
import { AlertTriangle, CheckCircle2, Eye, Loader2, MessageSquare, MoreHorizontal, Undo2 } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { Field } from "@/components/admin/shared/Field";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { BOTON, CLASE_AREA } from "@/components/admin/rrhh/rrhh-form";
import { formatDateTimeShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AlertaRetiro } from "@/lib/delivery/retiros-conciliacion";

/**
 * Coincidencias para revisar en los retiros (17-10, P36): el mismo N.° de
 * operación en dos pagos, el mismo monto al mismo repartidor en 24 h, retiros
 * esperando más de 3 días y pagos por Yape o transferencia sin N.° de operación.
 * Sólo AVISAN: no bloquean, no borran ni cambian ningún retiro. Quien resuelve
 * (admin o dueño) puede anotar por qué está bien; queda con su nombre y fecha.
 */

const FORM_ID = "form-justificar-alerta";
const MINIMO = 5;

interface Props {
  alertas: AlertaRetiro[];
  puedeResolver: boolean;
  onVer: (a: AlertaRetiro) => void;
  onJustificar: (clave: string, motivo: string | null) => Promise<void>;
}

export function AlertasRetiros({ alertas, puedeResolver, onVer, onJustificar }: Props) {
  const [justificando, setJustificando] = useState<AlertaRetiro | null>(null);
  const [quitando, setQuitando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (alertas.length === 0) return null;

  const pendientes = alertas.filter((a) => !a.revisada);
  const orden = [...pendientes, ...alertas.filter((a) => a.revisada)];

  async function quitar(a: AlertaRetiro) {
    setQuitando(a.clave);
    setError(null);
    try {
      await onJustificar(a.clave, null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setQuitando(null);
    }
  }

  function acciones(a: AlertaRetiro): MenuAccion[] {
    if (!puedeResolver) return [];
    return a.revisada
      ? [{ id: "quitar", label: "Quitar justificación", hint: "Vuelve a «para revisar»", icon: Undo2, busy: quitando === a.clave, onSelect: () => void quitar(a) }]
      : [{ id: "justificar", label: "Justificar", hint: "Anota por qué está bien", icon: MessageSquare, onSelect: () => setJustificando(a) }];
  }

  return (
    <section className="space-y-2" aria-labelledby="alertas-retiros" data-qa="alertas-retiros">
      <div className="flex flex-wrap items-center gap-2">
        <CardTitle id="alertas-retiros">Para revisar</CardTitle>
        <span className="text-sm tabular-nums text-[var(--text-secondary)]">
          {pendientes.length} sin revisar{alertas.length > pendientes.length ? ` · ${alertas.length - pendientes.length} justificadas` : ""}
        </span>
        <InfoTip
          title="Coincidencias, no errores"
          what="Avisos sobre los pagos de los últimos 90 días y lo que sigue por pagar: el mismo N.° de operación en dos pagos, el mismo monto al mismo repartidor en 24 horas, retiros que esperan más de 3 días y pagos sin N.° de operación."
          affects="Un aviso no bloquea, no borra ni cambia ningún retiro. Si está bien (dos pedidos distintos del mismo monto, por ejemplo), lo justificas y queda con tu nombre y la fecha."
          example="Juan cobró S/ 50 a las 10:00 y S/ 50 a las 18:00 por dos semanas distintas: lo justificas con «dos semanas distintas»."
        />
      </div>
      {error && <p className="text-sm text-[var(--data-error-700)]">{error}</p>}
      <ul className="divide-y divide-[var(--rule-base)] rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
        {orden.map((a) => (
          <li key={a.clave} className={cn("flex flex-wrap items-center gap-3 p-3", a.revisada && "opacity-80")}>
            {a.revisada ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-[var(--data-success-700)]" aria-hidden />
            ) : (
              <AlertTriangle className="h-5 w-5 shrink-0 text-[var(--data-warning-700)]" aria-hidden />
            )}
            <div className="min-w-0 flex-[1_1_16rem]">
              <p className="text-sm font-semibold text-[var(--text-primary)]">{a.titulo}</p>
              <p className="text-sm text-[var(--text-secondary)]">{a.detalle}</p>
              {a.revisada && (
                <p className="text-sm text-[var(--text-tertiary)]">
                  Revisó {a.revisada.por} el {formatDateTimeShort(a.revisada.en)} · {a.revisada.motivo}
                </p>
              )}
            </div>
            <button type="button" onClick={() => onVer(a)} className={cn(BOTON.secundario, "h-12")}>
              <Eye className="h-4 w-4" aria-hidden /> Ver filas
            </button>
            {puedeResolver && <ActionMenu label="Más acciones" icon={MoreHorizontal} soloIcono className="w-12" actions={acciones(a)} />}
          </li>
        ))}
      </ul>
      {justificando && (
        <JustificarAlertaModal
          alerta={justificando}
          onClose={() => setJustificando(null)}
          onGuardar={async (motivo) => {
            await onJustificar(justificando.clave, motivo);
            setJustificando(null);
          }}
        />
      )}
    </section>
  );
}

function JustificarAlertaModal({
  alerta,
  onClose,
  onGuardar,
}: {
  alerta: AlertaRetiro;
  onClose: () => void;
  onGuardar: (motivo: string) => Promise<void>;
}) {
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (motivo.trim().length < MINIMO) {
      setError("Escribe por qué está bien (al menos 5 letras): queda con tu nombre.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await onGuardar(motivo.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setGuardando(false);
    }
  }

  return (
    <AdminModal
      open
      onClose={onClose}
      title="Justificar aviso"
      icon={MessageSquare}
      footer={
        <ModalFooter error={error}>
          <button type="button" onClick={onClose} className={BOTON.fantasma}>
            Cancelar
          </button>
          <button type="submit" form={FORM_ID} disabled={guardando} className={BOTON.primario}>
            {guardando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Guardar justificación
          </button>
        </ModalFooter>
      }
    >
      <form id={FORM_ID} onSubmit={enviar} noValidate className={cn(MODAL_BODY, "space-y-4")}>
        <div className="rounded-xl bg-[var(--surface-sunken)] p-3">
          <p className="text-sm font-semibold text-[var(--text-primary)]">{alerta.titulo}</p>
          <p className="text-sm text-[var(--text-secondary)]">{alerta.detalle}</p>
        </div>
        <Field label="¿Por qué está bien?" required hint="No cambia ningún retiro: sólo deja anotado quién lo revisó y por qué.">
          {(id) => (
            <textarea
              id={id}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={300}
              rows={3}
              placeholder="Ej. Son dos semanas distintas; revisé su Yape."
              className={CLASE_AREA}
            />
          )}
        </Field>
      </form>
    </AdminModal>
  );
}
