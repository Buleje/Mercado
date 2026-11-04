/**
 * Qué pasó con el archivo SIRE de ventas: cuántas entraron y, si alguna quedó fuera,
 * por qué (una línea por motivo con hasta 3 ejemplos). El conteo viene del servidor.
 */
import { AlertTriangle, CheckCircle2 } from "@buleje/design-system/icons";
import type { AvisoDeSire } from "./use-libros-contador";

const plural = (n: number) => (n === 1 ? "venta" : "ventas");

export function AvisoSire({ resumen }: { resumen: AvisoDeSire }) {
  if (resumen.bloqueadas === 0) {
    return (
      <p role="status" className="inline-flex items-center gap-2 text-sm font-medium text-[var(--data-success-700)]">
        <CheckCircle2 className="h-4 w-4" aria-hidden />
        El archivo SIRE lleva {resumen.lineas} {plural(resumen.lineas)}. Súbelo en el SIRE como reemplazo de la propuesta.
      </p>
    );
  }
  return (
    <div role="alert" className="space-y-1 rounded-xl border border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-4 py-3 text-sm text-[var(--text-primary)]">
      <p className="inline-flex items-center gap-2 font-medium">
        <AlertTriangle className="h-4 w-4 text-[var(--data-warning-700)]" aria-hidden />
        {resumen.bloqueadas} {plural(resumen.bloqueadas)} no entraron al archivo SIRE
        {resumen.lineas > 0 ? ` (sí entraron ${resumen.lineas})` : ""}:
      </p>
      <ul className="list-disc space-y-0.5 pl-10">
        {resumen.motivos.map((m) => (
          <li key={m.motivo}>
            {m.motivo}: {m.cantidad}
            {m.ejemplos.length > 0 ? ` (ej. ${m.ejemplos.join(", ")})` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
