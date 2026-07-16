"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  MessageCircle,
  ArrowLeft,
  Phone,
  CheckCircle2,
  AlertCircle,
  Settings,
  Bot,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import WaConversationList from "./inbox/WaConversationList";
import WaChatView from "./inbox/WaChatView";
import { useWhatsAppInbox } from "./inbox/useWhatsAppInbox";

/** "519xxxxxxxx" → "+51 9xx xxx xxx". */
function prettyPhone(phone: string): string {
  if (phone.startsWith("51") && phone.length === 11) {
    return `+51 ${phone.slice(2, 5)} ${phone.slice(5, 8)} ${phone.slice(8)}`;
  }
  return `+${phone}`;
}

/**
 * Altura del inbox medida en runtime: viewport − offset real del contenedor.
 * El calc() fijo fallaba según banners/zoom y el composer quedaba bajo el fold
 * (bug reportado por Brandon 2026-07-16).
 */
function useFillHeight(minPx = 420) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const measure = () => {
      const el = ref.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      setHeight(Math.max(minPx, window.innerHeight - top - 12));
    };
    measure();
    // Re-medir: banners de alerta y headers cargan tarde y corren el offset
    const t1 = setTimeout(measure, 500);
    const t2 = setTimeout(measure, 2000);
    window.addEventListener("resize", measure);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener("resize", measure);
    };
  }, [minPx]);

  return { ref, height };
}

interface Props {
  /** Navega al sub-tab de configuración del bot (conectar número). */
  onGoToConfig?: () => void;
}

/**
 * WhatsAppInboxTab — inbox de WhatsApp del negocio (Meta Cloud API).
 *
 * Los mensajes entran por el webhook (app/api/whatsapp/webhook) que los
 * persiste en WhatsAppMessage (migración 310); acá se listan, se leen y se
 * responde directo desde el panel. Layout responsive igual que ChatTab:
 * desktop 2 columnas, mobile lista O conversación.
 */
export default function WhatsAppInboxTab({ onGoToConfig }: Props) {
  const {
    conversations,
    connection,
    numbers,
    numberFilter,
    setNumberFilter,
    loadingConvs,
    convsError,
    selectedPhone,
    selectConversation,
    messages,
    loadingMsgs,
    sendMessage,
    sendTemplate,
    sending,
    sendError,
    sendErrorCode,
    pausedPhones,
    toggleBotPause,
  } = useWhatsAppInbox();

  // Bug fix: altura real disponible (el calc fijo escondía el composer)
  const { ref: fillRef, height: fillHeight } = useFillHeight();

  // Mobile: mostrar lista o chat (no ambos)
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");

  const selected = useMemo(
    () => conversations.find((c) => c.customerPhone === selectedPhone) ?? null,
    [conversations, selectedPhone],
  );
  const totalUnread = useMemo(
    () => conversations.reduce((acc, c) => acc + c.unread, 0),
    [conversations],
  );

  const connected = connection?.connected && connection.active;
  // Etiqueta legible de un número del negocio (para chips y header del hilo)
  const numberLabel = (phoneNumberId: string) => {
    const n = numbers.find((x) => x.phoneNumberId === phoneNumberId);
    return n?.label || n?.businessName || `Nº ${phoneNumberId.slice(-4)}`;
  };

  function handleSelect(phone: string) {
    selectConversation(phone);
    setMobileView("chat");
  }

  return (
    <div
      ref={fillRef}
      style={fillHeight ? { height: `${fillHeight}px` } : undefined}
      className="flex min-h-[420px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/20"
    >
      {/* Header: estado de conexión + no leídos */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-primary" />
          <span className="text-base font-bold text-slate-900 dark:text-white">
            WhatsApp del negocio
          </span>
          {totalUnread > 0 && (
            <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-2 text-[length:var(--ts-xs)] font-bold text-white">
              {totalUnread}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {connected ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--data-success-100)] px-3 py-1 text-[length:var(--ts-xs)] font-bold text-[var(--data-success-700)]">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Número conectado
            </span>
          ) : (
            <button
              type="button"
              onClick={onGoToConfig}
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--data-warning-100)] px-3 py-1 text-[length:var(--ts-xs)] font-bold text-[var(--data-warning-700)] transition hover:opacity-80"
            >
              <AlertCircle className="h-3.5 w-3.5" />
              Sin conectar — configurar
            </button>
          )}
        </div>
      </header>

      {/* Banner: no conectado */}
      {!loadingConvs && !connected && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--data-warning-500)]/30 bg-[var(--data-warning-50)] px-4 py-3 dark:bg-[var(--data-warning-500)]/10">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Conecta tu número de WhatsApp para recibir y responder mensajes desde acá.
          </p>
          <button
            type="button"
            onClick={onGoToConfig}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white transition hover:opacity-90"
          >
            <Settings className="h-4 w-4" />
            Conectar mi número
          </button>
        </div>
      )}

      {convsError && (
        <div className="flex items-center gap-2 border-b border-[var(--data-error-500)]/30 bg-[var(--data-error-50)] px-4 py-2 dark:bg-[var(--data-error-500)]/10">
          <AlertCircle className="h-4 w-4 text-[var(--data-error-500)]" />
          <p className="text-sm font-medium text-[var(--data-error-500)]">
            No se pudo cargar el inbox. Reintentando…
          </p>
        </div>
      )}

      {/* Filtro por número del negocio (solo con 2+ números conectados) */}
      {numbers.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2.5 dark:border-slate-700 dark:bg-slate-900">
          <button
            type="button"
            onClick={() => setNumberFilter(null)}
            className={cn(
              "h-9 rounded-full border-2 px-3.5 text-sm font-bold transition",
              numberFilter === null
                ? "border-primary bg-primary/10 text-primary"
                : "border-slate-200 text-slate-600 hover:border-primary/50 dark:border-slate-700 dark:text-slate-300",
            )}
          >
            Todos
          </button>
          {numbers.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setNumberFilter(n.phoneNumberId)}
              className={cn(
                "h-9 rounded-full border-2 px-3.5 text-sm font-bold transition",
                numberFilter === n.phoneNumberId
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-slate-200 text-slate-600 hover:border-primary/50 dark:border-slate-700 dark:text-slate-300",
                !n.isActive && "opacity-50",
              )}
            >
              {n.label || n.businessName || `Nº ${n.phoneNumberId.slice(-4)}`}
            </button>
          ))}
        </div>
      )}

      {/* Layout 2 columnas (desktop) / alternado (mobile) */}
      <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-[340px_1fr]">
        <aside
          className={cn(
            "h-full overflow-hidden border-r border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/40",
            mobileView === "chat" && "hidden md:block",
          )}
        >
          <WaConversationList
            conversations={conversations}
            selectedPhone={selectedPhone}
            onSelect={handleSelect}
            loading={loadingConvs}
          />
        </aside>

        <main
          className={cn(
            "flex h-full flex-col overflow-hidden",
            mobileView === "list" && "hidden md:flex",
          )}
        >
          {selected ? (
            <>
              {/* Header del hilo */}
              <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5 dark:border-slate-700 dark:bg-slate-900">
                <button
                  type="button"
                  onClick={() => setMobileView("list")}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 md:hidden dark:hover:bg-slate-800"
                  aria-label="Volver a la lista"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900 dark:text-white">
                    {selected.customerName !== "Cliente"
                      ? selected.customerName
                      : prettyPhone(selected.customerPhone)}
                  </p>
                  <span className="flex items-center gap-2">
                    <a
                      href={`tel:+${selected.customerPhone}`}
                      className="inline-flex items-center gap-1 text-[length:var(--ts-xs)] text-slate-500 underline-offset-2 hover:text-primary hover:underline"
                    >
                      <Phone className="h-3 w-3" />
                      {prettyPhone(selected.customerPhone)}
                    </a>
                    {numbers.length > 1 && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-primary">
                        vía {numberLabel(selected.phoneNumberId)}
                      </span>
                    )}
                  </span>
                </div>
                {/* Pausar/reanudar el bot IA en ESTE hilo */}
                {(() => {
                  const paused = pausedPhones.includes(selected.customerPhone);
                  return (
                    <button
                      type="button"
                      onClick={() => void toggleBotPause(selected.customerPhone, !paused)}
                      className={cn(
                        "ml-auto inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border-2 px-3 text-sm font-bold transition",
                        paused
                          ? "border-[var(--data-warning-500)] bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/10"
                          : "border-[var(--data-success-500)]/40 bg-[var(--data-success-100)] text-[var(--data-success-700)]",
                      )}
                      title={paused
                        ? "El bot NO responde en este hilo — click para reactivarlo"
                        : "El bot responde solo — click para pausarlo y atender vos"}
                    >
                      <Bot className="h-4 w-4" />
                      {paused ? "Bot pausado" : "Bot activo"}
                    </button>
                  );
                })()}
              </div>
              {pausedPhones.includes(selected.customerPhone) && (
                <div className="border-b border-[var(--data-warning-500)]/30 bg-[var(--data-warning-50)] px-4 py-1.5 text-[length:var(--ts-xs)] font-semibold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/10">
                  🤖💤 Bot pausado en este hilo — los mensajes llegan pero respondés vos
                </div>
              )}
              <WaChatView
                messages={messages}
                loading={loadingMsgs}
                canSend={Boolean(connected)}
                sending={sending}
                sendError={sendError}
                sendErrorCode={sendErrorCode}
                phoneNumberId={selected.phoneNumberId}
                customerName={selected.customerName}
                onSend={sendMessage}
                onSendTemplate={sendTemplate}
              />
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <MessageCircle className="h-8 w-8 text-primary" />
              </span>
              <p className="text-base font-semibold text-slate-700 dark:text-slate-200">
                Elige una conversación
              </p>
              <p className="max-w-sm text-sm text-slate-500">
                Acá ves los mensajes que llegan al WhatsApp de tu negocio y respondes
                directo, sin salir del panel.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
