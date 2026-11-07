"use client";

/**
 * Chip «N guías de tu Libro TH por ingresar» junto a «Nuevo ingreso»
 * (Libro CTP › Ingresos). Cuenta sólo las que se pueden traer con todo; abre el
 * alta directo en «Desde tu Libro TH» (ADR-481). Sin guías, o si no se pudo
 * leer, no se pinta: es un atajo, no puede estorbar. El cajero ni lo pide (la
 * lista es de admin, almacenero y dueño: su 403 ensuciaba la consola).
 */

import { FileStack } from "@buleje/design-system/icons";
import { useMiRol } from "@/hooks/use-mi-rol";
import { ROLES_PAPELES_GUIA } from "@/lib/forestal/documentos-guia";
import { useGuiasThPorIngresar } from "./hooks/use-guias-th-por-ingresar";
import { contarGuiasTh, detalleChipGuiasTh, textoChipGuiasTh } from "@/lib/forestal/aviso-guias-th";

const PUEDE_VER: ReadonlySet<string> = new Set(ROLES_PAPELES_GUIA);

export default function CtpAvisoGuiasTh({ onAbrir }: { onAbrir: () => void }) {
  const rol = useMiRol();
  const { guias, error } = useGuiasThPorIngresar(rol !== null && PUEDE_VER.has(rol));
  if (error || !guias) return null;
  const conteo = contarGuiasTh(guias);
  if (conteo.listas === 0) return null;
  return (
    <button
      type="button"
      onClick={onAbrir}
      title={detalleChipGuiasTh(conteo)}
      className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-2xl border border-[var(--accent)] bg-[var(--accent-soft)] px-3 text-sm font-semibold text-[var(--accent-ink)] transition hover:bg-[var(--accent-muted)] dark:text-[var(--accent)]"
    >
      <FileStack className="h-4 w-4 shrink-0" aria-hidden />
      <span>{textoChipGuiasTh(conteo.listas)}</span>
    </button>
  );
}
