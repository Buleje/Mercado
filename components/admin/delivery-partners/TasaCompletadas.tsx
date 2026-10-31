/**
 * La pastilla «Completadas» del ranking (17-10, P38): sin pedidos cerrados
 * dice «Sin datos» en gris (antes, 0 % en rojo para alguien recién llegado) y
 * con pocos muestra la muestra («2 de 3») en vez de un porcentaje engañoso.
 */
import { cn } from "@/lib/utils";
import { MUESTRA_CHICA } from "@/lib/delivery/ranking-reparto";

type Tono = "ok" | "alerta" | "error" | undefined;

/** Con muestra chica no se pinta de rojo/verde: no hay cómo juzgar. */
export function tonoTasa(tasa: number | null, cerradas: number): Tono {
  if (tasa == null || cerradas < MUESTRA_CHICA) return undefined;
  return tasa >= 0.85 ? "ok" : tasa >= 0.5 ? "alerta" : "error";
}

const CLASE: Record<NonNullable<Tono> | "neutro", string> = {
  ok: "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
  alerta: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]",
  error: "bg-[var(--data-error-100)] text-[var(--data-error-500)]",
  neutro: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
};

export function TasaCompletadas({ tasa, cerradas }: { tasa: number | null; cerradas: number }) {
  const tono = tonoTasa(tasa, cerradas);
  const entregadas = tasa == null ? 0 : Math.round(tasa * cerradas);
  const texto =
    tasa == null ? "Sin datos" : cerradas < MUESTRA_CHICA ? `${entregadas} de ${cerradas}` : `${Math.round(tasa * 100)}%`;
  const titulo =
    tasa == null
      ? "Todavía no tiene pedidos cerrados en el período"
      : `${entregadas} entregados de ${cerradas} cerrados`;
  return (
    <span
      title={titulo}
      className={cn(
        "inline-flex items-center justify-center h-9 px-3 rounded-full text-sm font-extrabold tabular-nums whitespace-nowrap",
        CLASE[tono ?? "neutro"],
      )}
    >
      {texto}
    </span>
  );
}
