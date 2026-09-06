"use client";

/**
 * TelegramPanel — enganchar el bot que anota por chat.
 *
 * Lo que tiene que resolver esta pantalla es un emparejamiento: el bot vive en
 * Telegram y el negocio vive acá, y algo tiene que decir «este chat es de este
 * negocio». Se resuelve con un código de 15 minutos que se tipea en el chat —
 * como el código de un cajero— y no con un token permanente, porque un código
 * que se ve en la pantalla del celular y se reenvía sin pensar no puede valer
 * para siempre: con él, cualquiera engancha su Telegram y escribe en los libros.
 */

import { useCallback, useEffect, useState } from "react";
import { Send, Trash2, Copy, Check, Link2, Loader2, RefreshCw } from "@buleje/design-system/icons";
import { CardTitle, InfoAlert, WarningAlert, BadgeStatus, PrimaryButton } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import { useCopiar } from "./shared";

interface Chat { chatId: number; nombre: string; vinculadoEn: string; ultimoUso?: string | null }
interface Estado {
  configurado: boolean;
  bot: { username?: string; first_name?: string } | null;
  webhook: { url?: string; pending_update_count?: number; last_error_message?: string } | null;
  chats: Chat[];
  codigo: { codigo: string; quedanSegundos: number } | null;
  urlWebhookSugerida: string;
}

const API = "/api/admin/telegram";
const fecha = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es-PE", { day: "numeric", month: "short" }) : "—";

export default function TelegramPanel() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [quedan, setQuedan] = useState(0);
  const { copiado, copiar } = useCopiar();

  const cargar = useCallback(async () => {
    try {
      const r = await fetch(API);
      if (!r.ok) throw new Error("No se pudo leer el estado del bot");
      const json = (await r.json()) as Estado;
      setEstado(json);
      setQuedan(json.codigo?.quedanSegundos ?? 0);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  // La cuenta regresiva del código: sin ella, «el código venció» se descubre
  // recién cuando el bot lo rechaza, con el celular ya en la mano.
  useEffect(() => {
    if (quedan <= 0) return;
    const t = setInterval(() => setQuedan((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [quedan]);

  const accion = useCallback(
    async (body: unknown, metodo: "POST" | "DELETE" = "POST") => {
      setOcupado(true);
      setError(null);
      try {
        const r = await fetch(API, {
          method: metodo,
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(body),
        });
        const json = (await r.json().catch(() => ({}))) as Record<string, unknown>;
        if (!r.ok) throw new Error(String(json.error ?? "Falló la operación"));
        await cargar();
        return json;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return null;
      } finally {
        setOcupado(false);
      }
    },
    [cargar],
  );

  if (cargando) return null;

  const codigoVivo = estado?.codigo && quedan > 0 ? estado.codigo.codigo : null;
  const enlaceBot = estado?.bot?.username ? `https://t.me/${estado.bot.username}` : null;

  return (
    <section className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Send className="h-4 w-4 text-[var(--text-secondary)]" />
        <CardTitle className="font-extrabold">Bot de Telegram</CardTitle>
        {estado?.bot?.username && (
          <BadgeStatus variant="success" size="sm" label={`@${estado.bot.username}`} />
        )}
        {estado?.configurado && !estado.webhook?.url && (
          <BadgeStatus variant="warning" size="sm" label="Webhook sin registrar" />
        )}
      </div>

      {error && <WarningAlert>{error}</WarningAlert>}

      {!estado?.configurado ? (
        <InfoAlert>
          Falta el bot. Escribile a <strong>@BotFather</strong> en Telegram, mandale{" "}
          <code className="font-mono">/newbot</code>, y pegá el token que te da en{" "}
          <code className="font-mono">TELEGRAM_BOT_TOKEN</code> del <code className="font-mono">.env</code>.
          Después recargá esta pantalla.
        </InfoAlert>
      ) : (
        <>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            Le hablás al bot —escribiendo o con un <strong>audio</strong>— y te muestra qué se va a
            anotar con los botones <strong>Confirmar</strong> y <strong>Cancelar</strong>. Recién
            cuando tocás Confirmar queda en los libros.
          </p>

          {/* ── Vincular ─────────────────────────────────────────────────── */}
          {codigoVivo ? (
            <div className="rounded-lg border-2 border-[var(--data-success-500)]/40 bg-[var(--data-success-50)] p-4 space-y-2">
              <p className="text-[length:var(--ts-xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Mandale esto al bot
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <code className="rounded-lg bg-[var(--surface-raised)] border border-[var(--rule-base)] px-3 py-2 font-mono text-base font-bold tracking-widest text-[var(--text-primary)]">
                  /vincular {codigoVivo}
                </code>
                <button
                  type="button"
                  onClick={() => copiar(`/vincular ${codigoVivo}`, "codigo")}
                  aria-label="Copiar el comando"
                  className="h-11 w-11 inline-flex items-center justify-center rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  {copiado === "codigo" ? <Check className="h-4 w-4 text-[var(--data-success-500)]" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-[length:var(--ts-xs)] text-[var(--text-secondary)]">
                Vence en <strong className="tabular-nums">{Math.floor(quedan / 60)}:{String(quedan % 60).padStart(2, "0")}</strong>
                {enlaceBot && (
                  <>
                    {" · "}
                    <a href={enlaceBot} target="_blank" rel="noreferrer" className="font-semibold underline">
                      abrir el bot
                    </a>
                  </>
                )}
              </p>
            </div>
          ) : (
            <PrimaryButton
              type="button"
              size="lg"
              disabled={ocupado}
              onClick={() => void accion({ accion: "codigo" })}
              leftIcon={ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            >
              Vincular Telegram
            </PrimaryButton>
          )}

          {/* ── Chats vinculados ─────────────────────────────────────────── */}
          {estado.chats.length > 0 && (
            <ul className="space-y-2">
              {estado.chats.map((c) => (
                <li
                  key={c.chatId}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[var(--text-primary)] truncate">{c.nombre}</p>
                    <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
                      Desde {fecha(c.vinculadoEn)} · {c.ultimoUso ? `usado ${fecha(c.ultimoUso)}` : "sin usar todavía"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`¿Desvincular el chat de ${c.nombre}? Deja de poder anotar al instante.`)) {
                        void accion({ chatId: c.chatId }, "DELETE");
                      }
                    }}
                    aria-label={`Desvincular ${c.nombre}`}
                    className="shrink-0 h-11 w-11 inline-flex items-center justify-center rounded-lg border border-[var(--rule-soft)] text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] hover:border-[var(--data-error-500)]/40 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* ── Webhook ──────────────────────────────────────────────────── */}
          <details className="rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-sunken)]">
            <summary className="cursor-pointer px-3 py-2.5 text-[length:var(--ts-xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              Conexión con Telegram (avanzado)
            </summary>
            <div className="px-3 pb-3 space-y-2">
              <p className="text-[length:var(--ts-xs)] text-[var(--text-secondary)] leading-relaxed">
                Telegram tiene que poder alcanzar este servidor. En producción es el dominio; en
                desarrollo hace falta un túnel público (ngrok, cloudflared) — Telegram no llega a{" "}
                <code className="font-mono">localhost</code>.
              </p>
              <code className="block truncate rounded-lg bg-[var(--surface-raised)] border border-[var(--rule-soft)] px-3 py-2 font-mono text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">
                {estado.webhook?.url || "(sin registrar)"}
              </code>
              {estado.webhook?.last_error_message && (
                <p className="text-[length:var(--ts-xs)] text-[var(--data-error-500)]">
                  Último error de Telegram: {estado.webhook.last_error_message}
                </p>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => void accion({ accion: "webhook", url: estado.urlWebhookSugerida })}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--rule-soft)] px-3 py-2 text-[length:var(--ts-xs)] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--rule-base)] transition-colors min-h-[44px] disabled:opacity-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Registrar en {new URL(estado.urlWebhookSugerida).host}
                </button>
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => void accion({ accion: "webhook", url: null })}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--rule-soft)] px-3 py-2 text-[length:var(--ts-xs)] font-semibold text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] transition-colors min-h-[44px] disabled:opacity-50"
                >
                  Desconectar
                </button>
              </div>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
