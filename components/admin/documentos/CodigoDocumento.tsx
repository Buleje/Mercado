"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Hash, Undo2 } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { codigoFisicoPendiente, formatoCodigoDocumento } from "@/lib/documentos/codigo-documento";
import type { DbDocument } from "@/lib/types/documents";
import { ubicacionLimpia } from "@/lib/documentos/ubicacion-fisica";
import { patchDocument } from "@/hooks/use-documents";
import { fechaLarga } from "./explorador/propiedades-explorador";
import GuardadoEnEditable from "./GuardadoEnEditable";

/**
 * ADR-516 — El código único del papel (`DOC-000123`) y si ya se anotó en el
 * papel físico (Brandon 24-10: «ese código lo pondré en mi archivo físico… y lo
 * colocaré como ya ingresado»). Sin código (fotos de las cámaras, papeles de
 * un negocio que todavía no numera) no se dibuja nada.
 */

type ConCodigo = Pick<DbDocument, "codigo" | "codigoFisicoAt" | "codigoFisicoPor" | "deletedAt" | "ubicacionFisica">;

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

/**
 * Cuándo y quién lo registró, en una frase («Registrado el 25 oct · ana»), y
 * dónde está el original si se anotó (ADR-526: «… · guardado en Archivador Guías»).
 */
export function textoCodigoPuesto(doc: ConCodigo): string {
  if (!doc.codigoFisicoAt) return "Por registrar: todavía no está en el papel físico";
  const quien = doc.codigoFisicoPor ? ` · ${doc.codigoFisicoPor}` : "";
  const donde = ubicacionLimpia(doc.ubicacionFisica);
  return `Registrado el ${fechaLarga(doc.codigoFisicoAt)}${quien}${donde ? ` · guardado en ${donde}` : ""}`;
}

/** Estilo de la pastilla verde «Registrado» (tokens de éxito del DS, claro y oscuro). */
export const CLASE_REGISTRADO =
  "bg-[var(--data-success-100)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/15 dark:text-[var(--data-success-500)]";

/** La etiqueta verde «Registrado» (sólo se dibuja si el código ya está en el papel). */
export function EtiquetaRegistrado({ doc, className }: { doc: ConCodigo; className?: string }) {
  if (!formatoCodigoDocumento(doc.codigo) || codigoFisicoPendiente(doc)) return null;
  const texto = textoCodigoPuesto(doc);
  return (
    <span
      title={texto}
      aria-label={texto}
      data-qa="etiqueta-registrado"
      className={cn("inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-bold", CLASE_REGISTRADO, className)}
    >
      <Check className="h-3.5 w-3.5" aria-hidden /> Registrado
    </span>
  );
}

/**
 * La pastilla con el código, para la tarjeta y la fila: clic = copiarlo. En
 * coral mientras falta anotarlo en el físico; con ✓ cuando ya está.
 */
export function CodigoChip({ doc, className, onMarcar }: {
  doc: ConCodigo;
  className?: string;
  /**
   * Con esto, mientras falta, va al lado «Ya lo anoté»: copiar el código,
   * escribirlo en la hoja y marcarlo sin abrir el papel (Brandon 31-10).
   */
  onMarcar?: () => void;
}) {
  const codigo = formatoCodigoDocumento(doc.codigo);
  const { copiado, copiar } = useCopiar(codigo);
  if (!codigo) return null;
  const pendiente = codigoFisicoPendiente(doc);
  return (
    <>
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); copiar(); }}
      onDoubleClick={(e) => e.stopPropagation()}
      title={`${codigo} — ${pendiente ? "por registrar: falta anotarlo en el papel" : textoCodigoPuesto(doc)}. Clic para copiarlo.`}
      aria-label={`Código ${codigo}${pendiente ? ", por registrar" : ", registrado"}. Copiar`}
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
      {copiado ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Hash className="h-3.5 w-3.5" aria-hidden />}
      {copiado ? "Copiado" : codigo}
    </button>
    {pendiente && onMarcar ? (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); onMarcar(); }}
        onDoubleClick={(e) => e.stopPropagation()}
        title={`Clic cuando ya escribiste ${codigo} en la hoja física: pasa a «Registrado»`}
        aria-label={`Ya anoté ${codigo} en la hoja física`}
        data-qa="marcar-registrado"
        className={button({
          variant: "secondary",
          size: "xs",
          className: "h-auto shrink-0 gap-1 rounded-md px-1.5 py-0.5 text-xs font-bold",
        })}
      >
        <Check className="h-3.5 w-3.5" aria-hidden /> Ya lo anoté
      </button>
    ) : (
      <EtiquetaRegistrado doc={doc} />
    )}
    </>
  );
}

/**
 * El bloque del detalle: el código grande para copiarlo y «Ya lo puse en el
 * físico» (o, si ya está, cuándo y quién, con deshacer).
 */
export function CodigoFisicoControl({ doc, onMarcar, onUbicacion, className }: {
  doc: ConCodigo & { id?: string };
  /** Guarda el cambio; si falla, lanza (se muestra el motivo). */
  onMarcar: (puesto: boolean) => Promise<unknown>;
  /**
   * ADR-526 — guarda «Guardado en: …» (`null` = borrar). Sin esto, y con `id`,
   * va directo al PATCH del papel (el bloque muestra lo guardado al instante).
   */
  onUbicacion?: (texto: string | null) => Promise<unknown>;
  className?: string;
}) {
  const codigo = formatoCodigoDocumento(doc.codigo);
  const { copiado, copiar } = useCopiar(codigo);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!codigo) return null;
  const pendiente = codigoFisicoPendiente(doc);
  const id = doc.id;
  const guardarUbicacion = onUbicacion ?? (id ? (texto: string | null) => patchDocument(id, { ubicacionFisica: texto }) : null);
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
        {!pendiente && <EtiquetaRegistrado doc={doc} className="text-sm" />}
        {pendiente ? (
          <button
            type="button"
            onClick={() => void marcar(true)}
            disabled={guardando}
            title="Ya escribiste este código, con la palabra Registrado, en el papel"
            className={cn(button({ variant: "primary" }), "ml-auto gap-2")}
            data-qa="codigo-fisico-marcar"
          >
            <Check className="h-4 w-4 shrink-0" aria-hidden /> {guardando ? "Guardando…" : "Marcar como registrado"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void marcar(false)}
            disabled={guardando}
            title="Volver a dejarlo por registrar"
            className={cn(button({ variant: "ghost" }), "ml-auto gap-2")}
            data-qa="codigo-fisico-deshacer"
          >
            <Undo2 className="h-4 w-4 shrink-0" aria-hidden /> {guardando ? "Guardando…" : "Quitar registrado"}
          </button>
        )}
      </div>
      <p className={cn("text-sm", pendiente ? "font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" : "text-[var(--text-secondary)]")}>
        {pendiente ? "Por registrar: falta escribirlo en el papel." : textoCodigoPuesto({ ...doc, ubicacionFisica: null })}
      </p>
      {/* ADR-526 — dónde está el original: se ve (y se cambia) una vez registrado, o si ya se anotó. */}
      {guardarUbicacion && (!pendiente || ubicacionLimpia(doc.ubicacionFisica)) && (
        <GuardadoEnEditable valor={doc.ubicacionFisica} onGuardar={guardarUbicacion} />
      )}
      {pendiente && (
        <p className="text-sm text-[var(--text-secondary)]">
          Copia el código, escríbelo en el papel con la palabra Registrado y márcalo aquí.
        </p>
      )}
      {error && <p role="alert" className="text-sm font-bold text-[var(--data-error-600)] dark:text-[var(--data-error-500)]">{error}</p>}
    </section>
  );
}
