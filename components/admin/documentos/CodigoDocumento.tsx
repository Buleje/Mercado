"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Hash, Undo2 } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { codigoFisicoPendiente, formatoCodigoDocumento } from "@/lib/documentos/codigo-documento";
import type { DbDocument } from "@/lib/types/documents";
import { fechaLarga } from "./explorador/propiedades-explorador";

/**
 * ADR-516 — El código único del papel (`DOC-000123`) y si ya se anotó en el
 * papel físico (Brandon 24-10: «ese código lo pondré en mi archivo físico… y lo
 * colocaré como ya ingresado»). Sin código (fotos de las cámaras, papeles de
 * un negocio que todavía no numera) no se dibuja nada.
 */

type ConCodigo = Pick<DbDocument, "codigo" | "codigoFisicoAt" | "codigoFisicoPor" | "deletedAt">;

/** Copiar al portapapeles y avisar un momento con «Copiado». */
function useCopiar(texto: string | null) {
  const [copiado, setCopiado] = useState(false);
  useEffect(() => {
    if (!copiado) return;
    const t = setTimeout(() => setCopiado(false), 1500);
    return () => clearTimeout(t);
  }, [copiado]);
  const copiar = () => {
    if (!texto) return;
    navigator.clipboard?.writeText(texto)
      .then(() => setCopiado(true))
      .catch((err) => console.warn("[documentos] no pude copiar el código", err));
  };
  return { copiado, copiar };
}

/** Cuándo y quién lo marcó, en una frase. */
export function textoCodigoPuesto(doc: ConCodigo): string {
  if (!doc.codigoFisicoAt) return "Todavía no está en el papel físico";
  const quien = doc.codigoFisicoPor ? ` · ${doc.codigoFisicoPor}` : "";
  return `En el papel físico desde el ${fechaLarga(doc.codigoFisicoAt)}${quien}`;
}

/**
 * La pastilla con el código, para la tarjeta y la fila: clic = copiarlo. En
 * coral mientras falta anotarlo en el físico; con ✓ cuando ya está.
 */
export function CodigoChip({ doc, className }: { doc: ConCodigo; className?: string }) {
  const codigo = formatoCodigoDocumento(doc.codigo);
  const { copiado, copiar } = useCopiar(codigo);
  if (!codigo) return null;
  const pendiente = codigoFisicoPendiente(doc);
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); copiar(); }}
      onDoubleClick={(e) => e.stopPropagation()}
      title={`${codigo} — ${pendiente ? "falta anotarlo en el papel físico" : textoCodigoPuesto(doc)}. Clic para copiarlo.`}
      aria-label={`Código ${codigo}${pendiente ? ", falta anotarlo en el papel físico" : ", ya está en el papel físico"}. Copiar`}
      data-qa="codigo-doc"
      data-pendiente={pendiente || undefined}
      className={button({
        variant: "ghost",
        size: "xs",
        className: cn(
          "h-auto shrink-0 gap-1 rounded-md px-1.5 py-0.5 font-mono text-xs tabular-nums",
          pendiente
            ? "bg-[var(--data-warning-100)] text-[var(--data-warning-700)] hover:bg-[var(--data-warning-100)] hover:brightness-95 dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]"
            : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]",
          className,
        ),
      })}
    >
      {copiado ? <Check className="h-3.5 w-3.5" aria-hidden /> : pendiente ? <Hash className="h-3.5 w-3.5" aria-hidden /> : <Check className="h-3.5 w-3.5 text-[var(--data-success-600)] dark:text-[var(--data-success-500)]" aria-hidden />}
      {copiado ? "Copiado" : codigo}
    </button>
  );
}

/**
 * El bloque del detalle: el código grande para copiarlo y «Ya lo puse en el
 * físico» (o, si ya está, cuándo y quién, con deshacer).
 */
export function CodigoFisicoControl({ doc, onMarcar, className }: {
  doc: ConCodigo;
  /** Guarda el cambio; si falla, lanza (se muestra el motivo). */
  onMarcar: (puesto: boolean) => Promise<unknown>;
  className?: string;
}) {
  const codigo = formatoCodigoDocumento(doc.codigo);
  const { copiado, copiar } = useCopiar(codigo);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!codigo) return null;
  const pendiente = codigoFisicoPendiente(doc);
  const marcar = async (puesto: boolean) => {
    setGuardando(true);
    setError(null);
    try {
      await onMarcar(puesto);
    } catch (err) {
      console.warn("[documentos] no pude marcar el código en el físico", err);
      setError("No se pudo guardar. Prueba otra vez.");
    } finally {
      setGuardando(false);
    }
  };
  return (
    <section
      aria-label={`Código ${codigo}`}
      data-qa="codigo-fisico"
      data-pendiente={pendiente || undefined}
      className={cn("space-y-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3", className)}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-lg font-bold tabular-nums text-[var(--text-primary)]">{codigo}</span>
        <button
          type="button"
          onClick={copiar}
          title="Copiar el código"
          aria-label={`Copiar ${codigo}`}
          className={button({ variant: "ghost", size: "icon" })}
        >
          {copiado ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
        </button>
        {pendiente ? (
          <button
            type="button"
            onClick={() => void marcar(true)}
            disabled={guardando}
            title="Ya le escribiste este código al papel físico"
            className={cn(button({ variant: "primary" }), "ml-auto gap-2")}
            data-qa="codigo-fisico-marcar"
          >
            <Check className="h-4 w-4 shrink-0" aria-hidden /> {guardando ? "Guardando…" : "Ya lo puse en el físico"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void marcar(false)}
            disabled={guardando}
            title="Volver a dejarlo como pendiente"
            className={cn(button({ variant: "ghost" }), "ml-auto gap-2")}
            data-qa="codigo-fisico-deshacer"
          >
            <Undo2 className="h-4 w-4 shrink-0" aria-hidden /> {guardando ? "Guardando…" : "Deshacer"}
          </button>
        )}
      </div>
      <p className={cn("text-sm", pendiente ? "font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" : "text-[var(--text-secondary)]")}>
        {pendiente ? "Falta escribirlo en el papel físico." : textoCodigoPuesto(doc)}
      </p>
      {error && <p role="alert" className="text-sm font-bold text-[var(--data-error-600)] dark:text-[var(--data-error-500)]">{error}</p>}
    </section>
  );
}
