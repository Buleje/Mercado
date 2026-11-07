"use client";

/**
 * Plegable — el bloque plegable y RECORDADO del panel (contrato de diseño,
 * ADR-489; ley de la vista, regla 3).
 *
 * - Se recuerda en el navegador (`hooks/use-local-storage`), como los
 *   indicadores del Libro TH (`forestal/LothSeccionKpis`) y los bloques de Ajustes.
 * - Plegado NO esconde el dato: `resumen` —la cifra en una línea— sigue a la
 *   vista («3 líneas · 12,40 m³ · 0 fuera de plazo»).
 * - Lo de adentro se monta recién al abrir (`montarAlAbrir`, por defecto): un
 *   bloque pesado plegado no pide datos. Con `montarAlAbrir={false}` queda
 *   montado y oculto, para lo que guarda estado propio (un formulario a medias).
 * - Es el patrón acordeón: el título es un encabezado y adentro está el botón
 *   (`aria-expanded` + `aria-controls`). Las `acciones` van fuera del botón.
 *
 * Dos aspectos:
 * - `tarjeta` (por defecto): caja con borde, toda la cabecera es el botón y el
 *   resumen va debajo del título (el de Ajustes).
 * - `franja`: sin caja, para una franja de indicadores encima de una tabla:
 *   título ▾ · resumen (sólo plegado) · acciones a la derecha.
 *
 * Uso: `<Plegable clave="inicio:resumen:kpis" titulo="Indicadores" resumen="S/ 1 240 hoy · 18 ventas">…</Plegable>`
 * Reemplaza a los `<details>` nativos y a los bloques apilados (olas 2-4).
 */
import { useId } from "react";
import { CardTitle } from "@buleje/design-system";
import { ChevronDown } from "@buleje/design-system/icons";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { cn } from "@/lib/utils";

export interface PlegableProps {
  /** Clave COMPLETA en localStorage («modulo:bloque»). La misma clave = la misma preferencia. */
  clave: string;
  titulo: React.ReactNode;
  /** La cifra en una línea. Plegado se ve siempre; abierto, según `resumenAbierto`. */
  resumen?: React.ReactNode;
  /** ¿El resumen sigue a la vista con el bloque abierto? Por defecto: sí en `tarjeta`, no en `franja`. */
  resumenAbierto?: boolean;
  /** Cómo arranca la primera vez (después manda lo recordado). */
  abiertoAlInicio?: boolean;
  /** Montar el contenido recién al abrir (por defecto `true`). */
  montarAlAbrir?: boolean;
  variante?: "tarjeta" | "franja";
  /** Botones a la derecha de la cabecera (fuera del botón que pliega). */
  acciones?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export default function Plegable({
  clave,
  titulo,
  resumen,
  resumenAbierto,
  abiertoAlInicio = false,
  montarAlAbrir = true,
  variante = "tarjeta",
  acciones,
  className,
  children,
}: PlegableProps) {
  const [abierto, setAbierto] = useLocalStorage<boolean>(clave, abiertoAlInicio);
  const idPanel = `${useId()}-panel`;
  const tarjeta = variante === "tarjeta";
  const verResumen = resumen != null && resumen !== "" && (!abierto || (resumenAbierto ?? tarjeta));
  const flecha = (
    <ChevronDown
      aria-hidden="true"
      className={cn(
        "h-4 w-4 shrink-0 text-[var(--text-tertiary)] transition-transform duration-[var(--dur-fast)]",
        abierto && "rotate-180",
      )}
    />
  );
  const panel = (
    <div
      id={idPanel}
      hidden={!abierto}
      className={tarjeta ? "px-5 pb-5 pt-4 border-t border-[var(--rule-soft)]" : undefined}
    >
      {(abierto || !montarAlAbrir) && children}
    </div>
  );

  if (tarjeta) {
    return (
      <div className={cn("bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl overflow-hidden", className)}>
        <div className="flex items-center">
          <CardTitle className="min-w-0 flex-1 text-sm font-bold">
            <button
              type="button"
              aria-expanded={abierto}
              aria-controls={idPanel}
              onClick={() => setAbierto((v) => !v)}
              className="w-full flex items-center gap-3 px-5 min-h-14 py-2 text-left hover:bg-[var(--surface-sunken)] transition-colors duration-[var(--dur-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
            >
              <span className="flex-1 min-w-0">
                <span className="block">{titulo}</span>
                {verResumen && (
                  <span className="block text-xs font-normal tabular-nums text-[var(--text-secondary)]">{resumen}</span>
                )}
              </span>
              {flecha}
            </button>
          </CardTitle>
          {acciones && <div className="flex shrink-0 items-center gap-2 pr-4">{acciones}</div>}
        </div>
        {panel}
      </div>
    );
  }

  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <CardTitle className="text-sm font-bold">
          <button
            type="button"
            aria-expanded={abierto}
            aria-controls={idPanel}
            onClick={() => setAbierto((v) => !v)}
            className="-mx-2 inline-flex min-h-12 items-center gap-2 rounded-lg px-2 hover:bg-[var(--surface-sunken)] transition-colors duration-[var(--dur-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            {titulo}
            {flecha}
          </button>
        </CardTitle>
        {verResumen && <p className="min-w-0 text-sm tabular-nums text-[var(--text-secondary)]">{resumen}</p>}
        {acciones && <div className="ml-auto flex items-center gap-2">{acciones}</div>}
      </div>
      {panel}
    </section>
  );
}
