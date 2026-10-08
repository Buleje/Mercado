"use client";

/**
 * Gente por hora — barras del día, de 06 a 19 h (más las horas de fuera de ese
 * rango que tuvieron fotos: una visita de madrugada no se esconde).
 *
 * Cada barra es el MÁXIMO de personas visto en UNA foto de esa hora, no un
 * conteo continuo: la cámara manda fotos por evento. Una hora sin fotos no
 * dibuja un 0 —no se sabe cuánta gente hubo—, deja el lugar vacío con una raya.
 *
 * La usan «Hoy en el patio» (fotos de la cámara) y «Personas» (fotos del
 * detector del mosaico). En «Personas» la barra se toca: filtra la grilla a
 * esa hora (`onElegirHora`).
 */

import { useId } from "react";
import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { BLOQUE, type ResumenDelDia } from "./camaras-ui";

const DESDE = 6;
const HASTA = 19;

const INFO_GENTE = {
  what: "Cada barra es la foto con MÁS personas de esa hora.",
  affects:
    "La cámara manda fotos cuando detecta algo, no todo el tiempo: es lo más que se vio junto, no un conteo seguido. Una hora sin fotos queda vacía, no en cero.",
  example: "«4» a las 10 h: en la foto con más gente de las 10 había 4 personas.",
};

interface Props {
  filas: ResumenDelDia["personasPorHora"];
  titulo?: string;
  info?: { what: string; affects: string; example: string };
  vacio?: string;
  /** Hora tocada (`null` = ninguna). Con `onElegirHora`, las barras son botones. */
  horaElegida?: number | null;
  onElegirHora?: (hora: number | null) => void;
  /** Más baja: cuando las barras acompañan a algo más importante (la grilla de fotos). */
  compacta?: boolean;
}

export default function GentePorHora({
  filas,
  titulo = "Gente por hora",
  info = INFO_GENTE,
  vacio = "Ese día no hay fotos para contar gente.",
  horaElegida = null,
  onElegirHora,
  compacta = false,
}: Props) {
  const tituloId = useId();
  const porHora = new Map(filas.map((f) => [f.hora, f]));
  const horas = filas.map((f) => f.hora);
  const primera = Math.min(DESDE, ...horas);
  const ultima = Math.max(HASTA, ...horas);
  const rango = Array.from({ length: ultima - primera + 1 }, (_, i) => primera + i);
  const tope = Math.max(1, ...filas.map((f) => f.max));

  return (
    <section className={BLOQUE} aria-labelledby={tituloId}>
      <div className="mb-3 flex items-center gap-1.5">
        <CardTitle as="h3" id={tituloId} className="text-base font-bold">
          {titulo}
        </CardTitle>
        <InfoTip title={titulo} what={info.what} affects={info.affects} example={info.example} />
      </div>
      {filas.length === 0 ? (
        <p className="py-4 text-sm text-[var(--text-tertiary)]">{vacio}</p>
      ) : (
        <ol className={`flex ${compacta ? "h-28" : "h-44"} gap-0.5 pt-5 sm:gap-1`} aria-label={titulo}>
          {rango.map((h) => {
            const f = porHora.get(h);
            const alto = f && f.max > 0 ? Math.max(6, Math.round((f.max / tope) * 100)) : 3;
            const etiquetaVisible = h % 3 === 0;
            const texto = f
              ? `${String(h).padStart(2, "0")} h: hasta ${f.max} ${f.max === 1 ? "persona" : "personas"} en ${f.fotos} ${f.fotos === 1 ? "foto" : "fotos"}`
              : `${String(h).padStart(2, "0")} h: sin fotos`;
            const apagada = horaElegida !== null && horaElegida !== h;
            const contenido = (
              <>
                <span className="sr-only">{texto}</span>
                {/* El área de la barra: la barra crece desde abajo y su cifra va encima. */}
                <div aria-hidden className={`flex w-full flex-1 items-end ${apagada ? "opacity-40" : ""}`}>
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
                  className={`text-xs tabular-nums ${horaElegida === h ? "font-bold text-[var(--text-primary)]" : "text-[var(--text-tertiary)]"} ${etiquetaVisible || horaElegida === h ? "" : "max-sm:invisible"}`}
                >
                  {String(h).padStart(2, "0")}
                </span>
              </>
            );
            if (onElegirHora && f) {
              return (
                <li key={h} className="relative flex h-full min-w-0 flex-1">
                  <button
                    type="button"
                    title={texto}
                    aria-pressed={horaElegida === h}
                    onClick={() => onElegirHora(horaElegida === h ? null : h)}
                    className="flex h-full w-full flex-col items-center gap-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  >
                    {contenido}
                  </button>
                </li>
              );
            }
            return (
              <li
                key={h}
                className="relative flex h-full min-w-0 flex-1 flex-col items-center gap-1"
                title={texto}
              >
                {contenido}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
