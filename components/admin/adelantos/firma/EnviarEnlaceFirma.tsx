"use client";

/**
 * «Firmar desde su celular» (ADR-491): en la ficha del adelanto, el dueño
 * genera un enlace de UN uso (48 h), lo manda por WhatsApp o lo copia, y la
 * persona firma el recibo en su teléfono. Se ve el estado (pendiente, firmado,
 * vencido, revocado) y el pendiente se puede revocar.
 *
 * El botón de WhatsApp es un enlace (`<a>`), no un `window.open` después de
 * esperar al servidor: el navegador bloquea las ventanas que no salen de un
 * toque directo. Sin teléfono en la ficha, abre WhatsApp para elegir el contacto.
 */

import { useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { AlertTriangle, Ban, Copy, Link2, MessageCircle, RefreshCw } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import type { EnlaceFirmaAdmin, EstadoEnlace } from "@/lib/adelantos/entregar-tipos";
import { fechaHoraLima } from "@/lib/adelantos/recibo-firmado";
import { logger } from "@/lib/logger";
import { useEnlaceFirma } from "./use-enlace-firma";

/* `primary` (negro en claro, blanco en oscuro) y no turquesa: blanco sobre turquesa da 3,2:1 a 14 px. */
const PRIMARIO = button({ variant: "primary", className: "rounded-xl px-4" });
const SECUNDARIO =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--rule-base)] px-4 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:border-primary hover:text-[var(--text-primary)] disabled:opacity-50";

const ESTADO: Record<EstadoEnlace, { texto: string; clase: string }> = {
  pendiente: { texto: "Pendiente", clase: "bg-[var(--data-warning)]/12 text-[var(--data-warning-ink)]" },
  usado: { texto: "Firmado", clase: "bg-[var(--data-success)]/12 text-[var(--data-success-ink)]" },
  vencido: { texto: "Vencido", clase: "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]" },
  revocado: { texto: "Revocado", clase: "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]" },
  anulado: { texto: "Anulado", clase: "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]" },
};

function Estado({ estado }: { estado: EstadoEnlace }) {
  const e = ESTADO[estado];
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${e.clase}`}>{e.texto}</span>;
}

const cuando = (iso: string) => fechaHoraLima(new Date(iso));

export default function EnviarEnlaceFirma({
  adelantoId,
  persona,
  codigo,
  montoTexto,
  onFirmado,
}: {
  adelantoId: string;
  persona: string;
  codigo: string | null;
  /** «S/ 120.00», para el mensaje cuando no hay teléfono. */
  montoTexto: string;
  /** La persona firmó con el enlace: la ficha vuelve a leer el registro. */
  onFirmado?: () => void;
}) {
  const e = useEnlaceFirma(adelantoId, onFirmado);
  const [pideHuella, setPideHuella] = useState(false);
  const [copiado, setCopiado] = useState<"si" | "no" | null>(null);
  const pendiente = e.enlaces?.find((x) => x.estado === "pendiente") ?? null;
  const pasados = (e.enlaces ?? []).filter((x) => x.estado !== "pendiente").slice(0, 3);
  const creado = e.creado;
  const mensaje = creado
    ? `Hola ${persona.split(/\s+/)[0] ?? ""}, firma el recibo del adelanto${codigo ? ` ${codigo}` : ""} de ${montoTexto} desde tu celular: ${creado.url}`
    : "";
  const whatsapp = creado ? (creado.whatsapp ?? `https://wa.me/?text=${encodeURIComponent(mensaje)}`) : null;

  const copiar = async () => {
    if (!creado) return;
    try {
      await navigator.clipboard.writeText(creado.url);
      setCopiado("si");
    } catch (err) {
      logger.warn("[adelantos] no se pudo copiar el enlace de firma", { error: String(err) });
      setCopiado("no");
    }
  };

  return (
    <section data-enviar-enlace-firma className="space-y-3 rounded-2xl border border-[var(--rule-soft)] px-4 py-3">
      <div className="flex items-center gap-1.5">
        <CardTitle className="text-sm font-bold text-[var(--text-primary)]">Firmar desde su celular</CardTitle>
        <InfoTip
          title="Enlace para firmar"
          what="Le mandas un enlace; la persona ve el monto, firma con el dedo y su firma queda en el registro de este adelanto."
          affects="Sirve una sola vez y vence en 48 h. Generar otro anula el anterior. Si su ficha tiene DNI, se lo pide y tiene que coincidir."
          example="Juan no está en el local: le mandas el enlace por WhatsApp y firma desde su casa."
        />
      </div>

      {creado ? (
        <div className="space-y-2 rounded-xl bg-[var(--surface-sunken)] px-3 py-3" data-enlace-creado>
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            <Estado estado="pendiente" /> Vence el {cuando(creado.venceEn)}
            {creado.pideHuella ? " · pide huella" : ""}
          </p>
          <p className="break-all font-mono text-sm text-[var(--text-secondary)]" data-enlace-url>
            {creado.url}
          </p>
          <div className="flex flex-wrap gap-2">
            {whatsapp && (
              <a href={whatsapp} target="_blank" rel="noopener noreferrer" data-enlace-whatsapp className={PRIMARIO}>
                <MessageCircle className="h-4 w-4" aria-hidden /> {creado.whatsapp ? "Mandar por WhatsApp" : "Elegir el contacto en WhatsApp"}
              </a>
            )}
            <button type="button" onClick={() => void copiar()} className={SECUNDARIO}>
              <Copy className="h-4 w-4" aria-hidden /> {copiado === "si" ? "Copiado" : "Copiar enlace"}
            </button>
            <button type="button" onClick={() => void e.revocar(creado.id)} disabled={e.ocupado} className={SECUNDARIO}>
              <Ban className="h-4 w-4" aria-hidden /> Revocar
            </button>
          </div>
          <p className="text-sm text-[var(--text-tertiary)]">
            {copiado === "no" ? "No se pudo copiar: selecciona el enlace y cópialo a mano. " : ""}Se muestra una sola vez: si lo pierdes, genera otro.
          </p>
        </div>
      ) : pendiente ? (
        <Pendiente enlace={pendiente} ocupado={e.ocupado} onRevocar={() => void e.revocar(pendiente.id)} />
      ) : null}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="button" onClick={() => void e.generar(pideHuella)} disabled={e.ocupado} data-generar-enlace className={creado || pendiente ? SECUNDARIO : PRIMARIO}>
          <Link2 className="h-4 w-4" aria-hidden /> {creado || pendiente ? "Generar otro enlace" : "Generar enlace para firmar"}
        </button>
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]">
          <input type="checkbox" checked={pideHuella} onChange={(ev) => setPideHuella(ev.target.checked)} className="h-5 w-5 accent-[var(--accent)]" />
          Pedir también la huella
        </label>
      </div>

      {e.error && (
        <p role="alert" className="flex items-start gap-2 text-sm font-semibold text-[var(--data-error)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {e.error}
        </p>
      )}
      {e.fallo && (
        <p role="alert" className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--data-error)]">
          No se pudieron leer los enlaces.
          <button type="button" onClick={e.reintentar} className="inline-flex min-h-11 items-center gap-1.5 font-bold text-[var(--text-secondary)] hover:underline">
            <RefreshCw className="h-4 w-4" aria-hidden /> Reintentar
          </button>
        </p>
      )}

      {pasados.length > 0 && (
        <ul className="space-y-1" aria-label="Enlaces anteriores">
          {pasados.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
              <Estado estado={x.estado} />
              {x.estado === "usado" && x.usadoEn ? `firmó el ${cuando(x.usadoEn)}` : `enviado el ${cuando(x.creadoEn)}`}
              {x.pideHuella ? " · con huella" : ""}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** El pendiente de antes: la URL ya no se puede mostrar (la base sólo guarda su sha256). */
function Pendiente({ enlace, ocupado, onRevocar }: { enlace: EnlaceFirmaAdmin; ocupado: boolean; onRevocar: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[var(--surface-sunken)] px-3 py-2 text-sm text-[var(--text-secondary)]" data-enlace-pendiente>
      <Estado estado="pendiente" />
      <span className="min-w-0 flex-1">
        Enviado por {enlace.creadoPor} · vence el {cuando(enlace.venceEn)}
        {enlace.pideHuella ? " · pide huella" : ""}
      </span>
      <button type="button" onClick={onRevocar} disabled={ocupado} className={SECUNDARIO}>
        <Ban className="h-4 w-4" aria-hidden /> Revocar
      </button>
    </div>
  );
}
