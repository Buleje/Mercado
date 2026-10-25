"use client";

/**
 * Completar el teléfono y el DNI/RUC de una persona sin abrir la ficha entera.
 *
 * En Blas ninguna de las 3 personas reales tenía teléfono: «Escribir» por
 * WhatsApp y los recordatorios en tanda no servían. Dos campos y listo; el
 * DNI/RUC consulta RENIEC/SUNAT solo (mismo hook que el alta). Si el padrón no
 * contesta (token vencido, sin red) lo dice y el campo se queda a mano.
 * Guarda por la ruta de siempre; el cuerpo lo arma `cuerpoPatch` para no
 * borrar el resto de la ficha.
 */

import { useCallback, useState } from "react";
import { AlertTriangle, CheckCircle, Loader2 } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { csrfHeaders } from "@/lib/csrf-client";
import { leerJson } from "@/lib/errores/sin-dato";
import { logger } from "@/lib/logger";
import { avisoDeSunat, normalizarNumero, type ResultadoDocumento } from "@/lib/documento/tipos";
import { revisarDocumento } from "@/lib/adelantos/persona-validacion";
import { avisoCelular } from "@/lib/adelantos/recibo-whatsapp";
import { cuerpoPatch } from "@/lib/adelantos/datos-persona";
import { useLookupDocumento } from "@/hooks/use-lookup-documento";
import { Field, ModalActions, ModalShell, inputCls } from "../shared";
import type { BeneficiarioConSaldo } from "../crear-adelanto/tipos";

type Hallado = Extract<ResultadoDocumento, { encontrado: true }>;

export default function CompletarDatosModal({
  persona,
  onClose,
  onGuardado,
}: {
  persona: BeneficiarioConSaldo;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [telefono, setTelefono] = useState(persona.telefono ?? "");
  const [documento, setDocumento] = useState(persona.documento ?? "");
  const [oficial, setOficial] = useState<Hallado | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const alEncontrar = useCallback((r: Hallado) => setOficial(r), []);
  const { estado, reintentar } = useLookupDocumento(documento, alEncontrar);

  const avisoDoc = revisarDocumento(documento);
  const avisoTel = avisoCelular(telefono);
  const avisoSunat = oficial ? avisoDeSunat(oficial) : null;

  const guardar = async () => {
    setErr(null);
    if (!telefono.trim() && !normalizarNumero(documento)) {
      setErr("Escribe el teléfono o el DNI/RUC.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/adelantos/beneficiarios/${persona.id}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify(
          cuerpoPatch(persona, {
            telefono,
            documento,
            padron: oficial
              ? {
                  tipo: oficial.tipo,
                  razonSocial: oficial.razonSocial ?? null,
                  direccion: oficial.direccion ?? null,
                  departamento: oficial.departamento ?? null,
                  provincia: oficial.provincia ?? null,
                  distrito: oficial.distrito ?? null,
                  estado: oficial.estado ?? null,
                  condicion: oficial.condicion ?? null,
                  demo: oficial.demo,
                }
              : undefined,
          }),
        ),
      });
      if (res.ok) {
        onGuardado();
        return;
      }
      const j = await leerJson<{ error?: string }>(res);
      setErr(j?.error ?? "No se pudo guardar.");
    } catch (e) {
      logger.error("[adelantos] no se pudo completar los datos de la persona", { error: String(e) });
      setErr("No se pudo guardar. Revisa la conexión.");
    } finally {
      setSaving(false);
    }
  };

  const noEncontrado = estado.fase === "listo" && !estado.resultado.encontrado ? estado.resultado : null;

  return (
    <ModalShell
      title={`Completar datos de ${persona.nombre}`}
      subtitle="Con el teléfono puedes escribirle por WhatsApp y mandarle recordatorios."
      onClose={onClose}
      size="md"
      footer={<ModalActions onClose={onClose} onSubmit={guardar} saving={saving} label="Guardar" />}
    >
      <Field label="Teléfono (celular)" hint={avisoTel ?? undefined}>
        <input
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          inputMode="tel"
          placeholder="9XX XXX XXX"
          aria-label="Teléfono"
          className={`${inputCls} tabular-nums ${avisoTel ? "border-[var(--data-warning)]" : ""}`}
        />
      </Field>

      <Field label="DNI o RUC" hint={avisoDoc ?? "8 dígitos consultan RENIEC · 11 consultan SUNAT"}>
        <div className="relative">
          <input
            value={documento}
            onChange={(e) => {
              setDocumento(e.target.value);
              setOficial(null);
            }}
            inputMode="numeric"
            placeholder="12345678"
            aria-label="DNI o RUC"
            className={`${inputCls} pr-12 tabular-nums ${avisoDoc ? "border-[var(--data-warning)]" : ""}`}
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2">
            {estado.fase === "consultando" ? (
              <Loader2 className="h-5 w-5 animate-spin text-[var(--text-tertiary)]" aria-label="Consultando" />
            ) : oficial ? (
              <CheckCircle className="h-5 w-5 text-[var(--data-success)]" aria-label="Encontrado" />
            ) : null}
          </span>
        </div>
      </Field>

      {oficial && (
        <p className="text-sm font-semibold text-[var(--data-success-ink)]">
          {oficial.demo ? "Dato de demostración (no se guarda como verificado): " : `${oficial.tipo} · `}
          {oficial.razonSocial ?? oficial.nombre}
        </p>
      )}
      {avisoSunat && <p className="text-sm font-semibold text-[var(--data-warning-ink)]">{avisoSunat}</p>}
      {noEncontrado && (
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--data-warning-ink)]">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          {noEncontrado.motivo} Puedes guardar el número a mano.
          <button type="button" onClick={reintentar} className={button({ variant: "ghost", className: "h-8 px-2 underline" })}>
            Reintentar
          </button>
        </p>
      )}
      {err && (
        <p role="alert" className="text-sm font-semibold text-[var(--data-error-ink)]">
          {err}
        </p>
      )}
    </ModalShell>
  );
}
