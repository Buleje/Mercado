"use client";

/**
 * «Probar recepción» y su resultado, paso por paso (2026-10-05). La prueba la
 * hace el servidor contra la dirección PÚBLICA —la misma que se pega en la
 * cámara— con un aviso Hikvision de verdad (alerta + foto) que no se guarda.
 */

import { CheckCircle2, Loader2, Send, XCircle } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import type { NombrePaso } from "@/lib/camaras/recepcion";
import { BTN, CHIP_BASE, CHIP_TONO } from "./camaras-ui";
import { useProbarRecepcion } from "./use-probar-recepcion";

const NOMBRE_PASO: Record<NombrePaso, string> = {
  llega: "Dirección",
  https: "HTTPS · 443",
  http: "HTTP · 80",
};

interface Props {
  camaraId: string | null;
  /** Por qué no se puede probar todavía (sin token, sin cámara). */
  bloqueo?: string | null;
}

export default function ProbarRecepcion({ camaraId, bloqueo }: Props) {
  const { probar, probando, resultado, error } = useProbarRecepcion(camaraId);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void probar()}
          disabled={!camaraId || Boolean(bloqueo) || probando}
          title={bloqueo ?? "Manda un aviso de prueba a la dirección de la cámara"}
          className={BTN}
        >
          {probando ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Send className="h-4 w-4" aria-hidden />
          )}
          {probando ? "Probando…" : "Probar recepción"}
        </button>
        <InfoTip
          title="Probar recepción"
          side="left"
          what="El servidor manda a la dirección de la cámara un aviso igual al de la Hikvision: la alerta de persona y una foto."
          affects="Es una prueba: no queda en «Fotos», no la lee la IA y no avisa por WhatsApp. Prueba HTTPS y también HTTP, por si tu cámara sólo ofrece uno."
          example="Si llega por HTTPS, pon en la cámara HTTPS y puerto 443."
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-[var(--data-error-ink)]">
          {error}
        </p>
      )}

      {resultado && (
        <div aria-live="polite" className="space-y-1.5" data-testid="resultado-recepcion">
          {resultado.bloqueo ? (
            <p className={cn(CHIP_BASE, CHIP_TONO.aviso, "whitespace-normal py-1 text-sm")}>
              <XCircle className="h-4 w-4 shrink-0 text-[var(--data-warning-ink)]" aria-hidden />
              {resultado.bloqueo === "tunel_caido"
                ? "El túnel está cerrado: ábrelo en esta PC y vuelve a probar."
                : "No hay dirección pública: la cámara no tiene a dónde mandar. Abre el túnel en esta PC."}
            </p>
          ) : (
            <>
              <ul className="space-y-1">
                {resultado.pasos.map((p) => (
                  <li
                    key={p.paso}
                    className="flex items-start gap-2 text-sm text-[var(--text-secondary)]"
                  >
                    {p.ok ? (
                      <CheckCircle2
                        className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-success-ink)]"
                        aria-hidden
                      />
                    ) : (
                      <XCircle
                        className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-error-ink)]"
                        aria-hidden
                      />
                    )}
                    <span className="min-w-0">
                      <b className="text-[var(--text-primary)]">{NOMBRE_PASO[p.paso]}</b>
                      {p.ms !== null && (
                        <span className="text-[var(--text-tertiary)]"> · {p.ms} ms</span>
                      )}
                      {" — "}
                      {p.detalle}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-sm font-bold text-[var(--text-primary)]">
                {resultado.protocolo === "https"
                  ? resultado.pasos.some((p) => p.paso === "http" && p.ok)
                    ? "Llega: en la cámara pon HTTPS y puerto 443 (o HTTP y 80 si no ofrece HTTPS)."
                    : "Llega por HTTPS: en la cámara pon HTTPS y puerto 443. Por HTTP no llega."
                  : resultado.protocolo === "http"
                    ? "Llega sólo por HTTP: en la cámara pon HTTP y puerto 80."
                    : "No llegó: mira el paso en rojo."}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
