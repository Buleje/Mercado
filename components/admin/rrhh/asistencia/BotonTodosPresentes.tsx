/**
 * «Todos presentes (n)» de la hoja del día, en la fila del título. Angosto
 * (<76rem del encabezado): ícono + cuántos («✓✓ 6») con la frase en el
 * tooltip — regla 6: se compacta el botón antes que partir la fila.
 */
import { CheckCheck } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { BOTON } from "../rrhh-form";

export default function BotonTodosPresentes({ n, disabled, onClick }: { n: number; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(BOTON.primario, "px-3 @min-[76rem]/enc:px-4")}
      title={`Todos presentes (${n}): marca Presente a quien todavía no tiene marca`}
      aria-label={`Todos presentes (${n})`}
    >
      <CheckCheck className="h-4 w-4" aria-hidden />
      <span className="hidden @min-[76rem]/enc:inline">Todos presentes ({n})</span>
      <span className="tabular-nums @min-[76rem]/enc:hidden">{n}</span>
    </button>
  );
}
