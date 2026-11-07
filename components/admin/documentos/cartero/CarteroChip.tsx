"use client";

/**
 * El cartero en el drive (Brandon 06-11): un papel que llegó sin dueño seguro pregunta «¿Es de Ronal?»
 * con ✓ y ✗. ✓ lo liga a ese cliente/proveedor; ✗ pasa al siguiente candidato y, si no quedan,
 * lo deja sin dueño. Ya resuelto, queda un chip «Ronal» de solo lectura. `nadie` o sin datos: nada.
 * El servidor decide; esto solo pregunta y muestra lo que éste respondió.
 */

import { useState, type SyntheticEvent } from "react";
import { toast } from "sonner";
import { Check, User, X } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { DbDocument, DecisionCartero } from "@/lib/types/documents";

interface Props {
  doc: DbDocument;
  /** `vincularEntidad` del hook de documentos: guarda y actualiza el papel en la lista. */
  onDecidir: (id: string, decision: DecisionCartero) => Promise<void>;
  /** Explorador (íconos y lista): letra chica y botones un poco más chicos. */
  compacto?: boolean;
  /** Íconos grandes/medianos: a lo ancho del ícono y centrado bajo el nombre. */
  centrado?: boolean;
  className?: string;
}

// Un clic acá no es de la tarjeta/fila: no abre la vista previa ni la ventana grande.
const aparte = (e: SyntheticEvent) => e.stopPropagation();

const BOTON = "inline-flex shrink-0 items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-wait disabled:opacity-50";

export default function CarteroChip({ doc, onDecidir, compacto = false, centrado = false, className }: Props) {
  const c = doc.cartero;
  const tamBoton = compacto ? "h-7 w-7" : "h-8 w-8";
  const [saltados, setSaltados] = useState(0);
  const [ocupado, setOcupado] = useState(false);
  if (!c) return null;

  const resuelto = c.decidido?.nombre ?? (c.estado === "seguro" ? c.candidatos[0]?.nombre : undefined);
  if (resuelto) {
    const porUsuario = c.decidido?.por === "usuario";
    return (
      <span
        data-qa="cartero-vinculado"
        title={porUsuario ? "Lo elegiste tú" : "Vinculado por el cartero"}
        className={cn(
          "inline-flex max-w-full items-center gap-1 rounded-md bg-[var(--surface-sunken)] px-1.5 py-0.5 font-bold text-[var(--text-secondary)]",
          compacto ? "text-xs" : "text-sm",
          className,
        )}
      >
        <User className="h-3 w-3 shrink-0" aria-hidden />
        {/* El nombre entero (06-11, Brandon: «Distribu…» no dice nada): se parte en líneas, nunca se recorta. */}
        <span className={cn("min-w-0 break-words", centrado ? "text-center" : "text-left")}>{resuelto}</span>
      </span>
    );
  }

  const candidato = c.estado === "duda" && !c.decidido ? c.candidatos[saltados] : undefined;
  if (!candidato) return null;

  const decidir = async (decision: DecisionCartero) => {
    setOcupado(true);
    try {
      await onDecidir(doc.id, decision);
    } catch (err) {
      console.warn("[cartero] no se pudo guardar la decisión", err);
      toast.error("No se pudo guardar. Prueba otra vez.");
    } finally {
      setOcupado(false);
    }
  };
  const no = () => {
    if (saltados + 1 < c.candidatos.length) setSaltados(saltados + 1);
    else void decidir({ tipo: "ninguno" });
  };

  return (
    <div
      role="group"
      aria-label={`El cartero pregunta si es de ${candidato.nombre}`}
      data-qa="cartero-chip"
      title={`${c.motivo} (${candidato.tipo === "cliente" ? "cliente" : "proveedor"})`}
      onClick={aparte}
      onDoubleClick={aparte}
      onKeyDown={aparte}
      className={cn(
        "inline-flex max-w-full flex-wrap items-center gap-x-1 gap-y-0.5 rounded-lg border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/12 dark:bg-[var(--data-warning-500)]/20",
        centrado ? "w-full justify-center px-1 py-1" : "py-0.5 pl-2 pr-0.5",
        className,
      )}
    >
      {/* El nombre entero: se parte en las líneas que haga falta en vez de «¿Es de Distribu…». */}
      <span
        className={cn(
          "min-w-0 max-w-full break-words font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
          compacto ? "text-xs leading-tight" : "text-sm",
          centrado && "w-full text-center",
        )}
      >
        ¿Es de {candidato.nombre}?
      </span>
      <span className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          data-qa="cartero-si"
          disabled={ocupado}
          aria-label={`Sí, es de ${candidato.nombre}`}
          title={`Sí, vincular a ${candidato.nombre}`}
          onClick={() => void decidir({ tipo: candidato.tipo, id: candidato.id })}
          className={cn(BOTON, tamBoton, "bg-[var(--data-success-500)]/15 text-[var(--data-success-700)] hover:bg-[var(--data-success-500)]/30 dark:text-[var(--data-success-500)]")}
        >
          <Check className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          data-qa="cartero-no"
          disabled={ocupado}
          aria-label={`No es de ${candidato.nombre}`}
          title="No es de él"
          onClick={no}
          className={cn(BOTON, tamBoton, "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]")}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </span>
    </div>
  );
}
