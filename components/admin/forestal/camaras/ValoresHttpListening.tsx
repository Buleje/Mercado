"use client";

/**
 * Los valores para «HTTP Listening» de la cámara, campo por campo y cada uno
 * con su botón de copiar (2026-10-05). Salen de la MISMA dirección que copia
 * «Copiar dirección» (`useDireccionPublica`): fija, túnel o dominio del panel.
 *
 * El token se muestra recortado: la dirección deja subir fotos como si fuera
 * la cámara. «Copiar» lleva el valor entero; el ojo lo muestra para tipearlo
 * a mano en otra PC.
 */

import { useState } from "react";
import { Check, Copy, Eye, EyeOff } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { CHIP_BASE, CHIP_TONO, SOLO_ADMIN_DIRECCION, type EstadoDireccion } from "./camaras-ui";
import { valoresParaCamara } from "./hik-connect";

const COMANDO_TUNEL = "npm run camaras:tunel";

function recortarToken(url: string): string {
  return url.replace(/([?&]k=)([^&]{6})[^&]*([^&]{4})/, "$1$2…$3");
}

function Copiable({
  valor,
  mostrar,
  onErrorCopia,
}: {
  valor: string;
  mostrar?: string;
  onErrorCopia: () => void;
}) {
  const [listo, setListo] = useState(false);
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <code className="min-w-0 break-all rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 font-mono text-xs text-[var(--text-primary)]">
        {mostrar ?? valor}
      </code>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(valor).then(
            () => {
              setListo(true);
              setTimeout(() => setListo(false), 2000);
            },
            () => onErrorCopia(),
          );
        }}
        aria-label={`Copiar ${mostrar ?? valor}`}
        title="Copiar"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--rule-base)] text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
      >
        {listo ? (
          <Check className="h-4 w-4 text-[var(--data-success-ink)]" aria-hidden />
        ) : (
          <Copy className="h-4 w-4" aria-hidden />
        )}
      </button>
    </span>
  );
}

interface Props {
  direccion: string;
  estado: EstadoDireccion;
  /** Sin token = quien mira no es admin ni dueño. */
  conToken: boolean;
  onErrorCopia: () => void;
}

export default function ValoresHttpListening({ direccion, estado, conToken, onErrorCopia }: Props) {
  const [verToken, setVerToken] = useState(false);
  const v = valoresParaCamara(direccion);

  if (!conToken)
    return <p className="text-sm text-[var(--text-tertiary)]">{SOLO_ADMIN_DIRECCION}.</p>;
  if (!v) {
    if (estado.tipo === "cargando")
      return (
        <p className="text-sm text-[var(--text-tertiary)]">Averiguando la dirección pública…</p>
      );
    return (
      <div className={cn(CHIP_BASE, CHIP_TONO.aviso, "flex-wrap whitespace-normal py-1.5 text-sm")}>
        <span>
          {estado.tipo === "tunel-caido"
            ? "El túnel está cerrado."
            : "Esta PC no tiene dirección pública."}{" "}
          Ábrelo con
        </span>
        <Copiable valor={COMANDO_TUNEL} onErrorCopia={onErrorCopia} />
        <span>y deja la PC prendida: los valores aparecen acá.</span>
      </div>
    );
  }

  const filas: { campo: string; valor: string; mostrar?: string; copiar: boolean }[] = [
    { campo: "Protocolo", valor: v.protocolo, copiar: false },
    { campo: "Dirección IP de destino o nombre de host", valor: v.host, copiar: true },
    { campo: "Puerto", valor: String(v.puerto), copiar: true },
    { campo: "URL", valor: v.url, mostrar: verToken ? v.url : recortarToken(v.url), copiar: true },
  ];

  return (
    <div className="space-y-1.5">
      <dl className="grid gap-x-3 gap-y-1.5 sm:grid-cols-[minmax(10rem,auto)_1fr]">
        {filas.map((f) => (
          <div key={f.campo} className="contents">
            <dt className="text-xs font-bold text-[var(--text-tertiary)] sm:pt-1.5">{f.campo}</dt>
            <dd className="flex min-w-0 items-center gap-1.5">
              {f.copiar ? (
                <Copiable valor={f.valor} mostrar={f.mostrar} onErrorCopia={onErrorCopia} />
              ) : (
                <b className="text-sm text-[var(--text-primary)]">{f.valor}</b>
              )}
              {f.campo === "URL" && (
                <button
                  type="button"
                  onClick={() => setVerToken((x) => !x)}
                  aria-pressed={verToken}
                  aria-label={verToken ? "Recortar la URL" : "Ver la URL completa"}
                  title={verToken ? "Recortar" : "Ver completa para escribirla a mano"}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--text-tertiary)] transition hover:text-[var(--text-primary)]"
                >
                  {verToken ? (
                    <EyeOff className="h-4 w-4" aria-hidden />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden />
                  )}
                </button>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {v.alternativa && (
        <p className="text-xs text-[var(--text-tertiary)]">
          ¿El menú no ofrece HTTPS? Protocolo <b>HTTP</b> y puerto <b>{v.alternativa.puerto}</b>,
          mismo host y URL. La prueba del paso 5 dice si así llega.
        </p>
      )}
    </div>
  );
}
