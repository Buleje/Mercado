/**
 * La celda «Recibo» de la tabla (23-10): firma, huella y foto, y si el recibo
 * se mandó (el enlace por WhatsApp o el PDF compartido desde el celular).
 *
 * Cada ícono es un BOTÓN de 48 px aunque el dibujo sea chico: lo que falta se
 * registra ahí mismo (firmar, la huella, la foto) y lo que ya está se mira con
 * su hora (y se rehace según las reglas del registro). En un adelanto anulado
 * lo que falta sale apagado: no se registra nada (el servidor también lo frena).
 * `stopPropagation`: la fila entera abre la ficha.
 */

import type { ComponentType } from "react";
import { Camera, Fingerprint, PenLine } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import type { DbAdelanto } from "@/lib/db/adelantos.db";
import { type EstadoRecibo, celularLegible, fechaCortaLima, momentoDeLaFoto } from "@/lib/adelantos/recibo-whatsapp";
import type { CargaRecibos } from "./use-estado-recibos";

/** `null` = falta; `""` = hay, sin hora conocida; ISO = hay, con su hora. */
type Cuando = string | null;
export type TipoRecibo = "firma" | "huella" | "foto";

const PARA_REGISTRAR: Record<TipoRecibo, string> = { firma: "Firmar", huella: "Registrar huella", foto: "Tomar foto" };
const NOMBRE: Record<TipoRecibo, string> = { firma: "Firma", huella: "Huella", foto: "Foto" };
/** El botón de sólo ícono del DS (48 × 48); el cuadrito de adentro dice si está o falta. */
const BOTON = button({ variant: "ghost", size: "icon", className: "group shrink-0 rounded-xl" });

export default function CeldaRecibo({
  adelanto: a,
  estado,
  carga,
  onMarca,
}: {
  adelanto: DbAdelanto;
  estado: EstadoRecibo;
  carga: CargaRecibos;
  /** Tocó un ícono: `hay` = ya estaba registrado (se mira), si no, se registra. */
  onMarca: (tipo: TipoRecibo, hay: boolean) => void;
}) {
  const firma: Cuando = estado.firma ?? (a.firmas?.firma ? "" : null);
  const huella: Cuando = estado.huella ?? (a.firmas?.huella ? "" : null);
  const foto: Cuando = a.comprobanteUrl ? (momentoDeLaFoto(a.comprobanteUrl)?.toISOString() ?? "") : null;
  const anulado = a.status === "CANCELADO";
  const envio = estado.envio;
  const marca = (tipo: TipoRecibo, icono: Icono, cuando: Cuando) => (
    <Marca tipo={tipo} icono={icono} cuando={cuando} anulado={anulado} onMarca={onMarca} />
  );
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="-ml-2 flex items-center">
        {marca("firma", PenLine, firma)}
        {marca("huella", Fingerprint, huella)}
        {marca("foto", Camera, foto)}
      </span>
      {envio ? (
        <span
          className="break-words text-xs font-semibold leading-tight text-[var(--data-success-ink)]"
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

type Icono = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

function Marca({
  tipo,
  icono: Icono,
  cuando,
  anulado,
  onMarca,
}: {
  tipo: TipoRecibo;
  icono: Icono;
  cuando: Cuando;
  anulado: boolean;
  onMarca: (tipo: TipoRecibo, hay: boolean) => void;
}) {
  const hay = cuando !== null;
  const hora = cuando ? ` · ${fechaCortaLima(cuando)}` : "";
  const texto = hay
    ? `Ver ${tipo === "foto" ? "la foto" : `la ${NOMBRE[tipo].toLowerCase()}`}${hora}`
    : anulado
      ? `${NOMBRE[tipo]}: falta. Anulado: no se registra.`
      : PARA_REGISTRAR[tipo];
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onMarca(tipo, hay);
      }}
      disabled={!hay && anulado}
      aria-label={texto}
      title={texto}
      data-recibo-marca={tipo}
      data-hay={hay || undefined}
      className={BOTON}
    >
      <span
        className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border-2 transition-colors ${
          hay
            ? "border-[var(--data-success)]/30 bg-[var(--data-success)]/12 text-[var(--data-success-ink)] group-hover:border-[var(--data-success)]"
            : anulado
              ? "border-dashed border-[var(--rule-base)] text-[var(--text-tertiary)]"
              : "border-dashed border-[var(--rule-base)] text-[var(--text-tertiary)] group-hover:border-solid group-hover:border-primary group-hover:text-[var(--text-primary)]"
        }`}
      >
        <Icono className="h-4 w-4" aria-hidden />
      </span>
    </button>
  );
}
