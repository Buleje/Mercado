"use client";

/**
 * Gente por hora — barras del día, de 06 a 19 h (más las horas de fuera de ese
 * rango que tuvieron fotos: una visita de madrugada no se esconde).
 *
 * Cada barra es el MÁXIMO de personas visto en UNA foto de esa hora, no un
 * conteo continuo: la cámara manda fotos por evento. Una hora sin fotos no
 * dibuja un 0 —no se sabe cuánta gente hubo—, deja el lugar vacío con una raya.
 */

import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { BLOQUE, type ResumenDelDia } from "./camaras-ui";

const DESDE = 6;
const HASTA = 19;

export default function GentePorHora({ filas }: { filas: ResumenDelDia["personasPorHora"] }) {
  const porHora = new Map(filas.map((f) => [f.hora, f]));
  const horas = filas.map((f) => f.hora);
  const primera = Math.min(DESDE, ...horas);
  const ultima = Math.max(HASTA, ...horas);
  const rango = Array.from({ length: ultima - primera + 1 }, (_, i) => primera + i);
  const tope = Math.max(1, ...filas.map((f) => f.max));

  return (
    <section className={BLOQUE} aria-labelledby="camaras-gente-titulo">
      <div className="mb-3 flex items-center gap-1.5">
        <CardTitle as="h3" id="camaras-gente-titulo" className="text-base font-bold">
          Gente por hora
        </CardTitle>
        <InfoTip
          title="Gente por hora"
          what="Cada barra es la foto con MÁS personas de esa hora."
          affects="La cámara manda fotos cuando detecta algo, no todo el tiempo: es lo más que se vio junto, no un conteo seguido. Una hora sin fotos queda vacía, no en cero."
          example="«4» a las 10 h: en la foto con más gente de las 10 había 4 personas."
        />
      </div>
      {filas.length === 0 ? (
        <p className="py-4 text-sm text-[var(--text-tertiary)]">
          Ese día no hay fotos para contar gente.
        </p>
      ) : (
        <ol className="flex h-44 gap-0.5 pt-5 sm:gap-1" aria-label="Personas por hora">
          {rango.map((h) => {
            const f = porHora.get(h);
            const alto = f && f.max > 0 ? Math.max(6, Math.round((f.max / tope) * 100)) : 3;
            const etiquetaVisible = h % 3 === 0;
            const texto = f
              ? `${String(h).padStart(2, "0")} h: hasta ${f.max} ${f.max === 1 ? "persona" : "personas"} en ${f.fotos} ${f.fotos === 1 ? "foto" : "fotos"}`
              : `${String(h).padStart(2, "0")} h: sin fotos`;
            return (
              <li
                key={h}
                className="relative flex h-full min-w-0 flex-1 flex-col items-center gap-1"
                title={texto}
              >
                <span className="sr-only">{texto}</span>
                {/* El área de la barra: la barra crece desde abajo y su cifra va encima. */}
                <div aria-hidden className="flex w-full flex-1 items-end">
                  {f ? (
                    <div
                      className={`relative w-full rounded-t-md ${f.max > 0 ? "bg-[var(--accent)]" : "bg-[var(--rule-strong)]/30"}`}
                      style={{ height: `${alto}%` }}
                    >
                      <span className="absolute inset-x-0 -top-5 text-center text-xs font-bold tabular-nums text-[var(--text-primary)]">
                        {f.max}
                      </span>
                    </div>
                  ) : (
                    <div className="h-0.5 w-full rounded bg-[var(--rule-base)]" />
                  )}
                </div>
                <span
                  aria-hidden
                  className={`text-xs tabular-nums text-[var(--text-tertiary)] ${etiquetaVisible ? "" : "max-sm:invisible"}`}
                >
                  {String(h).padStart(2, "0")}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
