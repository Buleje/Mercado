"use client";

/**
 * «Nueva campaña»: nombre, mensaje, para quién, canal y cuándo. El conteo de
 * «para quién» es el de la fila de audiencias (un solo pedido por audiencia,
 * no uno más por cada cambio del select). Misma lógica y mismo endpoint que
 * antes de partir MarketingAutomationTab.
 */
import { useEffect, useId, useState } from "react";
import { Loader2, Megaphone, Send, Users } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { AUDIENCIAS, CHANNEL_META, type Channel, type Segment } from "./tipos";
import type { AltaCampana } from "./use-campanas";

type Modo = "ahora" | "programar" | "borrador";

/** datetime-local con la hora local actual (sin segundos). */
const ahoraLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

const CAMPO = "w-full h-12 px-3 text-sm rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] outline-none focus:border-primary";
const ROTULO = "text-sm font-semibold text-[var(--text-secondary)]";

export function ModalNuevaCampana({
  abierto,
  segmentoInicial,
  conteos,
  onCerrar,
  onCrear,
}: {
  abierto: boolean;
  segmentoInicial: Segment;
  conteos: Partial<Record<Segment, number | null>>;
  onCerrar: () => void;
  onCrear: (alta: AltaCampana) => Promise<string | null>;
}) {
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [segment, setSegment] = useState<Segment>(segmentoInicial);
  const [channel, setChannel] = useState<Channel>("whatsapp");
  const [modo, setModo] = useState<Modo>("ahora");
  const [programada, setProgramada] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const ids = { name: useId(), message: useId(), segment: useId(), channel: useId(), fecha: useId() };

  // Cada apertura arranca limpia y parada en la audiencia elegida.
  useEffect(() => {
    if (!abierto) return;
    setName("");
    setMessage("");
    setSegment(segmentoInicial);
    setChannel("whatsapp");
    setModo("ahora");
    setProgramada("");
    setError(null);
  }, [abierto, segmentoInicial]);

  const alcance = conteos[segment];

  const enviar = async () => {
    setError(null);
    if (!name.trim() || !message.trim()) {
      setError("Ponle nombre y mensaje a la campaña.");
      return;
    }
    const scheduledAt = modo === "programar" ? programada : modo === "ahora" ? ahoraLocal() : null;
    if (modo === "programar" && !scheduledAt) {
      setError("Elige fecha y hora para programar.");
      return;
    }
    setGuardando(true);
    const fallo = await onCrear({
      name: name.trim(),
      message: message.trim(),
      segment,
      channel,
      status: modo === "borrador" ? "borrador" : "programada",
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
    });
    setGuardando(false);
    if (fallo) setError(fallo);
    else onCerrar();
  };

  return (
    <AdminModal
      open={abierto}
      onClose={onCerrar}
      title="Nueva campaña"
      icon={Megaphone}
      variant="default"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onCerrar} className={button({ variant: "ghost", className: "rounded-xl px-4 text-sm" })}>
            Cancelar
          </button>
          <button type="button" onClick={enviar} disabled={guardando} className={button({ variant: "primary", className: "rounded-xl px-4 text-sm" })}>
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
            {modo === "borrador" ? "Guardar borrador" : modo === "programar" ? "Programar" : "Crear y enviar"}
          </button>
        </div>
      }
    >
      <div className={cn(MODAL_BODY, "space-y-4")}>
        <div className="space-y-1.5">
          <label htmlFor={ids.name} className={ROTULO}>Nombre</label>
          <input id={ids.name} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Oferta de fin de semana" className={CAMPO} />
        </div>

        <div className="space-y-1.5">
          <label htmlFor={ids.message} className={ROTULO}>Mensaje</label>
          <textarea
            id={ids.message}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            placeholder="Hola {{nombre}}, hoy tenemos 20% en arroz. ¡Pásate por la bodega!"
            className={cn(CAMPO, "h-auto py-2 resize-none")}
          />
          <p className="text-sm text-[var(--text-tertiary)]">
            <span className="font-mono font-semibold">{"{{nombre}}"}</span> se cambia por el nombre de cada cliente.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor={ids.segment} className={ROTULO}>Para quién</label>
            <select id={ids.segment} value={segment} onChange={(e) => setSegment(e.target.value as Segment)} className={CAMPO}>
              {AUDIENCIAS.map((a) => (
                <option key={a.id} value={a.id}>{a.rotulo}</option>
              ))}
            </select>
            <p className="inline-flex items-center gap-1 text-sm text-[var(--text-tertiary)]">
              <Users className="h-4 w-4" aria-hidden />
              {alcance === undefined || alcance === null ? "Calculando…" : `${alcance} cliente${alcance === 1 ? "" : "s"}`}
            </p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor={ids.channel} className={ROTULO}>Canal</label>
            <select id={ids.channel} value={channel} onChange={(e) => setChannel(e.target.value as Channel)} className={CAMPO}>
              {(Object.keys(CHANNEL_META) as Channel[]).map((c) => (
                <option key={c} value={c}>{CHANNEL_META[c].label}</option>
              ))}
            </select>
          </div>
        </div>

        <fieldset className="space-y-2">
          <legend className={ROTULO}>Cuándo</legend>
          <div className="grid grid-cols-3 gap-2">
            {([["ahora", "Ahora"], ["programar", "Programar"], ["borrador", "Borrador"]] as const).map(([m, rotulo]) => (
              <button
                key={m}
                type="button"
                aria-pressed={modo === m}
                onClick={() => setModo(m)}
                className={cn(
                  "h-12 rounded-xl border-2 text-sm font-semibold transition-colors",
                  modo === m
                    ? "border-primary bg-primary/5 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                    : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]",
                )}
              >
                {rotulo}
              </button>
            ))}
          </div>
          {modo === "programar" && (
            <>
              <label htmlFor={ids.fecha} className="sr-only">Fecha y hora de envío</label>
              <input id={ids.fecha} type="datetime-local" value={programada} min={ahoraLocal()} onChange={(e) => setProgramada(e.target.value)} className={CAMPO} />
            </>
          )}
        </fieldset>

        {error && <p role="alert" className="text-sm font-semibold text-[var(--data-error-ink)]">{error}</p>}
      </div>
    </AdminModal>
  );
}
