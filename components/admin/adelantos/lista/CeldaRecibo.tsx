/**
 * La celda «Recibo» de la tabla (23-10): firma, huella y foto (con su hora en
 * el `title`) y si el recibo se mandó (el enlace por WhatsApp o el PDF
 * compartido desde el celular). Sin interactividad: el
 * menú ⋯ de la fila es el que firma, saca la foto o manda.
 */

import type { ComponentType } from "react";
import { Camera, Fingerprint, PenLine } from "@buleje/design-system/icons";
import type { DbAdelanto } from "@/lib/db/adelantos.db";
import { type EstadoRecibo, celularLegible, fechaCortaLima, momentoDeLaFoto } from "@/lib/adelantos/recibo-whatsapp";
import type { CargaRecibos } from "./use-estado-recibos";

/** `null` = falta; `""` = hay, sin hora conocida; ISO = hay, con su hora. */
type Cuando = string | null;

export default function CeldaRecibo({ adelanto: a, estado, carga }: { adelanto: DbAdelanto; estado: EstadoRecibo; carga: CargaRecibos }) {
  const firma: Cuando = estado.firma ?? (a.firmas?.firma ? "" : null);
  const huella: Cuando = estado.huella ?? (a.firmas?.huella ? "" : null);
  const foto: Cuando = a.comprobanteUrl ? (momentoDeLaFoto(a.comprobanteUrl)?.toISOString() ?? "") : null;
  const envio = estado.envio;
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-1">
        <Marca icono={PenLine} nombre="Firma" cuando={firma} />
        <Marca icono={Fingerprint} nombre="Huella" cuando={huella} />
        <Marca icono={Camera} nombre="Foto" cuando={foto} />
      </span>
      {envio ? (
        <span
          className="text-xs font-semibold leading-tight text-[var(--data-success-ink)]"
          title={
            envio.via === "compartido"
              ? `Se compartió el PDF desde el celular para el ${celularLegible(envio.nueve)} (${envio.por}). No se sabe si llegó.`
              : `Se abrió WhatsApp con el recibo al ${celularLegible(envio.nueve)} (${envio.por}). WhatsApp no confirma la entrega.`
          }
          data-recibo-enviado={envio.via}
        >
          {envio.via === "compartido" ? "PDF compartido" : "Enviado por WhatsApp"}
          <span className="block tabular-nums">{fechaCortaLima(envio.en)}</span>
        </span>
      ) : carga === "listo" ? (
        <span className="text-xs leading-tight text-[var(--text-tertiary)]">Sin enviar</span>
      ) : carga === "error" ? (
        <span className="text-xs leading-tight text-[var(--text-tertiary)]" title="No se pudo leer si se mandó: recarga la página.">
          —
        </span>
      ) : (
        <span className="h-4 w-16 animate-pulse rounded bg-[var(--surface-sunken)]" aria-label="Cargando el envío" />
      )}
    </div>
  );
}

function Marca({ icono: Icono, nombre, cuando }: { icono: ComponentType<{ className?: string; "aria-hidden"?: boolean }>; nombre: string; cuando: Cuando }) {
  const hay = cuando !== null;
  const texto = hay ? `${nombre}: sí${cuando ? ` · ${fechaCortaLima(cuando)}` : ""}` : `${nombre}: falta`;
  return (
    <span
      role="img"
      aria-label={texto}
      title={texto}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border-2 ${
        hay
          ? "border-[var(--data-success)]/30 bg-[var(--data-success)]/12 text-[var(--data-success-ink)]"
          : "border-dashed border-[var(--rule-base)] text-[var(--text-tertiary)]"
      }`}
    >
      <Icono className="h-4 w-4" aria-hidden />
    </span>
  );
}
