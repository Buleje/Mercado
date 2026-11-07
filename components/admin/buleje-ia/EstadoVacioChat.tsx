"use client";

/**
 * Chat vacío: qué se le puede pedir, con 4 ejemplos que se tocan y quedan en
 * el campo para completarlos (no se mandan solos: el de la cotización y el de
 * la reunión tienen un «…» que llenar). El del combustible va primero: es el
 * pedido literal de Brandon.
 */
import { CalendarClock, FileText, Fuel, Sparkles, TrendingDown } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";

export const EJEMPLOS_CHAT = [
  {
    Icono: Fuel,
    texto: "Anótame: tanqueé 12 gal de petróleo para mi camión blanco N12, total S/ 200, recibo E242",
    nota: "y adjunta la foto del recibo",
  },
  { Icono: TrendingDown, texto: "¿Cuánto gasté en combustible este mes?" },
  { Icono: FileText, texto: "Hazme una cotización para …" },
  { Icono: CalendarClock, texto: "Agéndame reunión con … el viernes 10 am" },
] as const;

export function EstadoVacioChat({ onElegir }: { onElegir: (texto: string) => void }) {
  return (
    <div className="py-6 text-center">
      <Sparkles className="mx-auto h-8 w-8 text-[var(--accent)]" aria-hidden />
      <p className="mt-3 text-base font-semibold text-[var(--text-primary)]">Anota, pregunta o pide un papel, como si le hablaras a tu asistente.</p>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">Antes de cambiar algo en tu negocio, te pide que confirmes.</p>
      <ul className="mx-auto mt-5 grid max-w-2xl gap-2 text-left sm:grid-cols-2">
        {EJEMPLOS_CHAT.map(({ Icono, texto, ...resto }) => (
          <li key={texto}>
            <button
              type="button"
              onClick={() => onElegir(texto)}
              className={button({
                variant: "secondary",
                fullWidth: true,
                className: "h-auto min-h-12 items-start justify-start gap-3 whitespace-normal rounded-xl px-4 py-3 text-left font-medium",
              })}
            >
              <Icono className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)]" aria-hidden />
              <span className="text-sm">
                {texto}
                {"nota" in resto && <span className="block text-xs text-[var(--text-tertiary)]">{resto.nota}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
