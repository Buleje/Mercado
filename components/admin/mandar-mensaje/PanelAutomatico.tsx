"use client";

/**
 * Mandar mensaje › «Automático»: lo que era «Nueva campaña» (Crecimiento ›
 * Campañas), en línea y sin ventana. El mensaje y el grupo son los de arriba
 * (los mismos de «Uno por uno»); acá va sólo cómo sale: nombre, canal y cuándo.
 * Lo manda el servidor (`listDueWhatsApp`), que sólo cambia {nombre} y sólo
 * arma los grupos con `auto`: con otro grupo o con {deuda}/{ultimaCompra} en el
 * texto no deja enviar (nunca mandar a «todos» ni un «{deuda}» literal).
 */
import { useId, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { AlertTriangle, CheckCheck, Loader2, Send } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { aTextoDelServidor, variablesSinCambiarEnAutomatico, type GrupoMensaje } from "@/lib/admin/grupos-mensaje";
import { cn } from "@/lib/utils";
import { CANALES_AUTOMATICOS, CHANNEL_META, type ChannelAutomatico } from "@/components/admin/crecimiento/campanas/tipos";
import type { AltaCampana } from "@/components/admin/crecimiento/campanas/use-campanas";

type Cuando = "ahora" | "programar" | "borrador";
const CUANDO: readonly (readonly [Cuando, string])[] = [["ahora", "Ahora"], ["programar", "Programar"], ["borrador", "Borrador"]];

/** datetime-local con la hora local actual (sin segundos). */
const ahoraLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

const CAMPO = "h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-primary";
const ROTULO = "text-sm font-semibold text-[var(--text-secondary)]";

export function PanelAutomatico({
  grupo,
  texto,
  nombrePorDefecto,
  alcance,
  crear,
  onUnoPorUno,
}: {
  grupo: GrupoMensaje;
  /** El mensaje del editor, con {nombre}. */
  texto: string;
  nombrePorDefecto: string;
  /** Cuántos arma el servidor en ese grupo (`undefined`/`null` = calculando). */
  alcance: number | null | undefined;
  crear: (alta: AltaCampana) => Promise<string | null>;
  /** Pasar a «Uno por uno» (si lo ve). */
  onUnoPorUno?: () => void;
}) {
  const [nombre, setNombre] = useState("");
  const [canal, setCanal] = useState<ChannelAutomatico>("whatsapp");
  const [cuando, setCuando] = useState<Cuando>("ahora");
  const [programada, setProgramada] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const ids = { nombre: useId(), canal: useId(), fecha: useId() };

  const sinCambiar = variablesSinCambiarEnAutomatico(texto);
  const bloqueo = !grupo.auto
    ? `«${grupo.rotulo}» no se arma en automático: elige otro grupo${onUnoPorUno ? " o mándalo uno por uno" : ""}.`
    : sinCambiar.length > 0
      ? `${sinCambiar.join(" y ")} no se cambia${sinCambiar.length > 1 ? "n" : ""} en automático (sólo {nombre}): quíta${sinCambiar.length > 1 ? "las" : "la"}${onUnoPorUno ? " o mándalo uno por uno" : ""}.`
      : null;

  const enviar = async () => {
    setError(null);
    setHecho(null);
    if (!grupo.auto || bloqueo) return;
    if (!texto.trim()) {
      setError("Escribe el mensaje.");
      return;
    }
    const scheduledAt = cuando === "programar" ? programada : cuando === "ahora" ? ahoraLocal() : null;
    if (cuando === "programar" && !scheduledAt) {
      setError("Elige fecha y hora para programar.");
      return;
    }
    const name = (nombre.trim() || nombrePorDefecto).slice(0, 200);
    setGuardando(true);
    const fallo = await crear({
      name,
      message: aTextoDelServidor(texto.trim()),
      segment: grupo.auto,
      channel: canal,
      status: cuando === "borrador" ? "borrador" : "programada",
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
    });
    setGuardando(false);
    if (fallo) {
      setError(fallo);
      return;
    }
    setNombre("");
    setHecho(`«${name}» ${cuando === "borrador" ? "quedó en borrador" : cuando === "programar" ? "quedó programado" : "sale ahora"}.`);
  };

  const accion = cuando === "borrador" ? "Guardar borrador" : cuando === "programar" ? "Programar" : "Enviar ahora";
  const cuantos = typeof alcance === "number" ? ` a ${alcance}` : "";

  return (
    <section aria-labelledby="mm-automatico" className="space-y-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <div className="flex items-center gap-2">
        <CardTitle id="mm-automatico" className="text-sm font-bold text-[var(--text-primary)]">Cómo sale</CardTitle>
        <InfoTip
          title="Automático"
          what="Lo manda el WhatsApp del negocio (o la app) solo, ahora o a la hora que elijas, y cuenta a cuántos les llegó."
          affects="Sólo llega a quienes aceptaron promociones (Ley 29733). Sólo cambia {nombre}: {deuda} y {ultimaCompra} van uno por uno."
          example="«Hola {nombre}, hoy 20% en arroz» a «No compran hace más de 30 días», programado para el sábado 9:00."
        />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_minmax(0,18rem)]">
        <div className="space-y-1.5">
          <label htmlFor={ids.nombre} className={ROTULO}>Nombre (para encontrarlo después)</label>
          <input id={ids.nombre} value={nombre} maxLength={200} onChange={(e) => setNombre(e.target.value)} placeholder={nombrePorDefecto} className={CAMPO} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={ids.canal} className={ROTULO}>Por dónde</label>
          <select id={ids.canal} value={canal} onChange={(e) => setCanal(e.target.value as ChannelAutomatico)} className={CAMPO}>
            {CANALES_AUTOMATICOS.map((c) => (
              <option key={c} value={c}>{CHANNEL_META[c].label}</option>
            ))}
          </select>
        </div>
        <fieldset className="space-y-1.5">
          <legend className={ROTULO}>Cuándo</legend>
          <div className="grid grid-cols-3 gap-2">
            {CUANDO.map(([m, rotulo]) => (
              <button
                key={m}
                type="button"
                aria-pressed={cuando === m}
                onClick={() => setCuando(m)}
                className={cn(
                  "h-12 rounded-xl border text-sm font-semibold transition-colors",
                  cuando === m
                    ? "border-primary bg-primary/5 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                    : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]",
                )}
              >
                {rotulo}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
      {cuando === "programar" && (
        <div className="space-y-1.5 md:max-w-xs">
          <label htmlFor={ids.fecha} className={ROTULO}>Fecha y hora de envío</label>
          <input id={ids.fecha} type="datetime-local" value={programada} min={ahoraLocal()} onChange={(e) => setProgramada(e.target.value)} className={CAMPO} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {bloqueo && (
          <p role="alert" className="flex min-w-0 flex-[1_1_16rem] items-start gap-2 text-sm text-[var(--data-warning-ink)]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{bloqueo}</span>
          </p>
        )}
        {error && <p role="alert" className="min-w-0 flex-[1_1_16rem] text-sm font-semibold text-[var(--data-error-ink)]">{error}</p>}
        {hecho && !error && (
          <p role="status" className="flex min-w-0 flex-[1_1_16rem] items-center gap-2 text-sm text-[var(--data-success-ink)]">
            <CheckCheck className="h-4 w-4 shrink-0" aria-hidden /> {hecho}
          </p>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {bloqueo && onUnoPorUno && (
            <button type="button" onClick={onUnoPorUno} className={button({ variant: "ghost", className: "h-12 rounded-xl px-4 text-sm" })}>
              Mandar uno por uno
            </button>
          )}
          <button
            type="button"
            onClick={() => void enviar()}
            disabled={guardando || Boolean(bloqueo) || !texto.trim()}
            className={button({ variant: "primary", className: "h-12 gap-1.5 rounded-xl px-4 text-sm disabled:opacity-60" })}
          >
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
            {cuando === "borrador" ? accion : `${accion}${cuantos}`}
          </button>
        </div>
      </div>
    </section>
  );
}
