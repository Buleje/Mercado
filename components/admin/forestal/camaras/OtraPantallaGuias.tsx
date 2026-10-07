"use client";

/**
 * Pestañas «En tu celular» y «Duplicar la pantalla» de «Ver en otra pantalla».
 *
 *  · Celular: el QR de ESTA vista; el celular entra con su propio usuario (no
 *    se comparte la sesión: cada uno con su usuario, y queda en «Quién miró»).
 *  · Duplicar: lo que ya trae cada aparato para mandar la pantalla al TV. Una
 *    línea por aparato; el detalle, en la ⓘ.
 */

import { useState } from "react";
import { Check, Copy, Laptop, Smartphone, Tv } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import QrImagen from "@/components/tv/QrImagen";
import { logger } from "@/lib/logger";
import { BTN } from "./camaras-ui";
import { RUTA_VISTA_CAMARAS } from "./otra-pantalla-ui";

export function OtraPantallaCelular({ origen }: { origen: string }) {
  const url = `${origen}${RUTA_VISTA_CAMARAS}`;
  const [copiado, setCopiado] = useState<"si" | "no" | null>(null);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado("si");
    } catch (err) {
      logger.info("[camaras.tv] el navegador no dejó copiar", { error: String(err) });
      setCopiado("no");
    }
  };

  return (
    <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:items-start sm:text-left">
      {origen && (
        <QrImagen texto={url} lado={200} alt="QR de la vista de cámaras para tu celular" className="h-44 w-44 shrink-0 rounded-xl" />
      )}
      <div className="min-w-0 space-y-2">
        <p className="text-sm text-[var(--text-primary)]">
          Escanéalo con la cámara de tu celular e inicia sesión con tu usuario: ves las mismas cámaras que aquí.
        </p>
        <p className="break-all rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-2 py-1.5 font-mono text-xs text-[var(--text-secondary)]">
          {url}
        </p>
        <button type="button" onClick={() => void copiar()} className={BTN}>
          {copiado === "si" ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          {copiado === "si" ? "Copiado" : "Copiar el link"}
        </button>
        {copiado === "no" && (
          <p className="text-xs text-[var(--text-tertiary)]">El navegador no dejó copiar: selecciona el link a mano.</p>
        )}
      </div>
    </div>
  );
}

const PASOS = [
  {
    icono: Smartphone,
    aparato: "Android",
    corto: "Desliza desde arriba → «Transmitir», «Smart View» o «Duplicar pantalla» → elige tu TV.",
    detalle: "El nombre cambia por marca: Samsung dice «Smart View», Xiaomi «Transmitir», Motorola «Duplicar pantalla». El celular y el TV tienen que estar en el mismo wifi.",
  },
  {
    icono: Smartphone,
    aparato: "iPhone",
    corto: "Centro de control → «Duplicar pantalla» → elige tu TV (AirPlay).",
    detalle: "Funciona con Apple TV y con los Smart TV que traen AirPlay (Samsung, LG y Sony recientes). Mismo wifi.",
  },
  {
    icono: Laptop,
    aparato: "PC con Chrome",
    corto: "Menú ⋮ → «Transmitir…» → «Fuentes: transmitir pestaña» → elige tu TV.",
    detalle: "Necesita un Chromecast o un TV con Chromecast integrado (Android TV, Google TV). El video de Hik-Connect se ve igual porque se manda la pestaña entera.",
  },
  {
    icono: Tv,
    aparato: "Smart TV sin Chromecast ni AirPlay",
    corto: "Usa la pestaña «En el televisor»: el TV las muestra solo, sin celular de por medio.",
    detalle: "Es lo más estable para dejarlo prendido todo el turno: si el celular se apaga o sale una llamada, el TV sigue mostrando las cámaras.",
  },
] as const;

export function OtraPantallaDuplicar() {
  return (
    <ul className="space-y-2">
      {PASOS.map(({ icono: Icono, aparato, corto, detalle }) => (
        <li key={aparato} className="flex items-start gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2">
          <Icono className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden />
          <p className="min-w-0 flex-1 text-sm text-[var(--text-primary)]">
            <span className="font-bold">{aparato}:</span> {corto}
          </p>
          <InfoTip title={aparato} what={detalle} side="left" />
        </li>
      ))}
    </ul>
  );
}
