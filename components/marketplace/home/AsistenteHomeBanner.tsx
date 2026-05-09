/**
 * AsistenteHomeBanner — Banner CTA linkeando a /asistente con 3 preguntas ejemplo.
 *
 * Narrativa: "Preguntale al asistente". Invita al user a probar el asistente
 * con tres chips pre-armados que llevan a /asistente?q=... (el asistente lee
 * el param y ejecuta la query como primer turno).
 *
 * Usa SalamanderSaludando como ilustracion monoline (ADR-065) — mascotita
 * amigable consistente con el tono Buleje.
 */

import Link from "next/link";
import {
  ArrowRight,
  MessageCircleQuestion,
} from "@buleje/design-system/icons";
import { CardTitle, Caption, Kicker, Chip } from "@buleje/design-system";
import { SalamanderSaludando } from "@/components/ui-system/illustrations";
import { cn } from "@/lib/utils";

const EXAMPLE_QUESTIONS = [
  { label: "Que hago con 20 soles?", q: "Que puedo cocinar con 20 soles para 4 personas?" },
  { label: "Recetas con paiche", q: "Dame 3 recetas faciles con paiche" },
  { label: "Productos sin gluten", q: "Que bodegas tienen productos sin gluten cerca?" },
];

export default function AsistenteHomeBanner() {
  return (
    <section
      aria-labelledby="asistente-home-title"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6"
    >
      <div
        className={cn(
          "rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-canvas)]",
          "p-5 sm:p-6",
          "grid grid-cols-1 md:grid-cols-[1fr_auto] items-center gap-5",
        )}
      >
        <div className="flex items-start gap-4 min-w-0">
          <div className="hidden sm:block shrink-0 text-[var(--text-secondary)]">
            <SalamanderSaludando size={96} strokeWidth={1.5} aria-hidden />
          </div>
          <div className="min-w-0">
            <Kicker className="text-[var(--text-tertiary)]">
              Asistente Buleje
            </Kicker>
            <CardTitle
              id="asistente-home-title"
              className="mt-0.5 text-[length:var(--ts-xl)]"
            >
              Preguntale al asistente
            </CardTitle>
            <Caption className="mt-1 text-[var(--text-secondary)]">
              Busca recetas, compara precios o pide ideas con lo que tienes en
              casa. Responde en segundos.
            </Caption>

            <div className="mt-3 flex flex-wrap gap-2">
              {EXAMPLE_QUESTIONS.map((ex) => (
                <Link
                  key={ex.label}
                  href={`/asistente?q=${encodeURIComponent(ex.q)}`}
                  aria-label={`Preguntar al asistente: ${ex.q}`}
                >
                  <Chip size="sm">
                    <MessageCircleQuestion className="h-3 w-3" aria-hidden />
                    {ex.label}
                  </Chip>
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="md:pl-4">
          <Link
            href="/asistente"
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-5 py-3",
              "text-[length:var(--ts-sm)] font-bold",
              "bg-[var(--text-primary)] text-[var(--surface-canvas)]",
              "hover:opacity-90 transition-opacity",
            )}
          >
            Abrir asistente
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}
