"use client";

/**
 * «Ver el espejo de otra PC» (24-10): en el equipo que NO espeja, el último
 * cuadro que manda la PC con scrcpy (mismo usuario). Las consultas viven en
 * `hooks/use-visor-espejo.ts`.
 */

import { useRef } from "react";
import { CardTitle, cn } from "@buleje/design-system";
import { Maximize2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import type { VisorEspejo } from "@/hooks/use-visor-espejo";

export default function VisorEspejoRemoto({
  v,
  className,
}: {
  v: VisorEspejo;
  className?: string;
}) {
  const marcoRef = useRef<HTMLDivElement | null>(null);
  const pantallaCompleta = () => {
    const marco = marcoRef.current;
    if (!marco) return;
    if (document.fullscreenElement === marco) void document.exitFullscreen?.();
    else void marco.requestFullscreen?.();
  };

  return (
    <section
      aria-labelledby="espejo-remoto-titulo"
      className={cn(
        "min-w-0 space-y-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4",
        className,
      )}
      data-testid="espejo-remoto"
      data-hay={v.hayCuadro ? "si" : "no"}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex items-center gap-1.5">
          <CardTitle id="espejo-remoto-titulo">Ver el espejo de otra PC</CardTitle>
          <InfoTip
            title="El espejo de otra PC"
            side="bottom"
            what="Lo que muestra la PC donde está conectado tu celular, si ahí prendiste «Que también lo vean otros equipos». Sólo con tu mismo usuario."
            affects="Llega 1 cuadro cada 1,5 s. Si esa PC lo apaga o se corta, la imagen se quita: no se queda a la vista."
            example="Con la pestaña escondida no pregunta nada: vuelve a mirar al abrirla."
          />
        </div>
        <p
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 text-sm text-[var(--text-secondary)]"
          data-testid="espejo-remoto-estado"
        >
          <span
            aria-hidden
            className={cn(
              "h-2.5 w-2.5 rounded-full",
              v.tono === "ok" && "bg-[var(--data-success-500)]",
              v.tono === "aviso" && "bg-[var(--data-warning-500)]",
              v.tono === "neutro" && "bg-[var(--rule-strong)]",
            )}
          />
          {v.texto}
        </p>
      </div>

      {v.url && (
        <>
          <div
            ref={marcoRef}
            className="flex min-h-[20rem] items-center justify-center overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-2 [&:fullscreen]:rounded-none [&:fullscreen]:border-0 [&:fullscreen]:p-0 [&:fullscreen_img]:h-full [&:fullscreen_img]:max-h-full"
          >
            {/* blob: del último cuadro: next/image no aplica. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={v.url}
              alt="La pantalla del celular, desde la otra PC"
              data-testid="espejo-remoto-img"
              className="max-h-[max(20rem,calc(100dvh-21rem))] w-auto max-w-full rounded-md object-contain"
            />
          </div>
          <button
            type="button"
            onClick={pantallaCompleta}
            className={button({ variant: "secondary", className: "gap-1.5" })}
          >
            <Maximize2 className="h-4 w-4" aria-hidden /> Pantalla completa
          </button>
        </>
      )}
      {v.error && (
        <p role="alert" className="text-sm text-[var(--data-error-ink)]">
          {v.error}
        </p>
      )}
    </section>
  );
}
