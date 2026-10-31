"use client";

/**
 * «Confirma la hoja» de una tarjeta del monte (16-10): la foto de la guía ya
 * impresa y el N° PREIMPRESO de la hoja del talonario. El N° es obligatorio;
 * la IA lo propone desde la foto cuando hay lector. Si no coincide con la guía
 * se avisa ANTES de confirmar, y al confirmar queda «Observada» con el porqué
 * (la oficina lo ve en la fila de la guía).
 */

import { useId, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { Camera, CheckCircle2, Sparkles } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import { controlarHoja, correlativoDeGuia } from "@/lib/forestal/gtf-cola-monte";
import type { TrabajoImpresion } from "@/lib/forestal/gtf-salida-tipos";
import type { FotoHojaMonte } from "./hooks/use-foto-hoja-monte";
import { botonMonte, srcFotoHoja } from "./gtf-cola-monte-ui";

/** El `<label>` que abre la cámara trasera: el mismo para «Subir foto» y «Otra foto». */
export function BotonFoto({ foto, texto, className }: { foto: FotoHojaMonte; texto: string; className?: string }) {
  const id = useId();
  return (
    <>
      <label htmlFor={id} className={cn(botonMonte("claro"), "cursor-pointer", className)} data-qa="subir-foto-monte">
        <Camera className="h-5 w-5 shrink-0" aria-hidden /> {texto}
      </label>
      <input
        id={id}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void foto.tomar(f);
        }}
      />
    </>
  );
}

export default function ConfirmarHojaMonte({
  t,
  foto,
  onConfirmar,
}: {
  t: TrabajoImpresion;
  foto: FotoHojaMonte;
  /** Devuelve el error en palabras, o `null` si se guardó. */
  onConfirmar: (numeroHoja: string) => Promise<string | null>;
}) {
  const idNumero = useId();
  const [numero, setNumero] = useState(t.numeroHoja ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const control = numero.trim() ? controlarHoja(t.numeroGuia, numero) : null;
  const src = foto.vista ?? (t.fotoDocId ? srcFotoHoja(t.numeroGuia, t.fotoDocId) : null);

  const confirmar = async () => {
    if (!/\d/.test(numero)) return setError("Escribe el N° de la hoja.");
    setGuardando(true);
    setError(null);
    const e = await onConfirmar(numero.trim());
    setGuardando(false);
    if (e) setError(e);
  };

  return (
    <section className="space-y-3 rounded-xl border border-[var(--rule-base)] p-3" aria-labelledby={`${idNumero}-t`}>
      <div className="flex items-center gap-1.5">
        <CardTitle id={`${idNumero}-t`}>Confirma la hoja</CardTitle>
        <InfoTip
          title="Foto y N° de la hoja"
          what="La foto queda en los papeles de la guía (casillero GTF). El N° es el que trae impreso la hoja del talonario."
          affects="Si no coincide con la guía, queda «Observada» y la oficina lo ve en la fila."
        />
      </div>
      {src ? (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- foto local o documento privado de la guía */}
          <img src={src} alt="Foto de la hoja impresa" className="h-24 w-20 shrink-0 rounded-lg border border-[var(--rule-base)] object-cover" data-qa="miniatura-hoja-monte" />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-sm text-[var(--text-secondary)]" aria-live="polite">
              {foto.subiendo ? "Subiendo la foto…" : foto.leyendo ? "Buscando el N° en la foto…" : "Foto guardada en los papeles de la guía."}
            </p>
            <BotonFoto foto={foto} texto="Otra foto" className="min-h-12" />
          </div>
        </div>
      ) : (
        <BotonFoto foto={foto} texto="Tomar foto de la hoja" />
      )}
      {foto.propuesta && foto.propuesta.numero !== numero && (
        <button
          type="button"
          onClick={() => setNumero(foto.propuesta?.numero ?? "")}
          className="flex min-h-12 w-full items-center gap-2 rounded-xl bg-[var(--accent)]/10 px-3 text-left text-sm font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]"
          data-qa="usar-propuesta-monte"
        >
          <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
          En la foto dice N° <span className="font-mono">{foto.propuesta.numero}</span>
          <span className="ml-auto underline">Usar</span>
        </button>
      )}
      <div className="space-y-1.5">
        <label htmlFor={idNumero} className="block text-sm font-bold text-[var(--text-primary)]">N° impreso en la hoja</label>
        <input
          id={idNumero}
          inputMode="numeric"
          autoComplete="off"
          maxLength={20}
          placeholder={correlativoDeGuia(t.numeroGuia) ?? ""}
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
          className="h-14 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 font-mono text-2xl font-bold tabular-nums text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)]"
          data-qa="numero-hoja-monte"
        />
        {control && (
          <p
            className={cn(
              "text-sm font-bold",
              control.coincide ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" : "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
            )}
            data-qa="control-hoja-monte"
          >
            {control.coincide ? "Coincide con la guía." : `${control.observacion}: si confirmas, queda observada.`}
          </p>
        )}
      </div>
      {(error ?? foto.error) && (
        <p role="alert" className="text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error ?? foto.error}</p>
      )}
      <button type="button" onClick={() => void confirmar()} disabled={guardando || foto.subiendo || !numero.trim()} className={botonMonte("marca")} data-qa="confirmar-hoja-monte">
        <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden /> {guardando ? "Guardando…" : "Confirmar"}
      </button>
    </section>
  );
}
