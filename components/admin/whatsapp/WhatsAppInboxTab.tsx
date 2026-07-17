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
  Plus,
  X,
  Archive,
  MailOpen,
  Volume2,
  VolumeX,
  Download,
  Timer,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import WaConversationList from "./inbox/WaConversationList";
import WaChatView from "./inbox/WaChatView";
import WaCustomerCard from "./inbox/WaCustomerCard";
import WaNoteBar from "./inbox/WaNoteBar";
import { WaLabelPicker } from "./inbox/WaLabels";
import { useWhatsAppInbox, type WaMessage } from "./inbox/useWhatsAppInbox";

/** Exporta el hilo como .txt (respaldo/reclamos) — client-side, sin server. */
function exportThreadTxt(customerName: string, phone: string, messages: WaMessage[]) {
  const lines = messages.map((m) => {
    const who = m.direction === "in" ? customerName : m.sentBy === "ai" ? "Bot IA" : "Negocio";
    const ts = new Date(m.createdAt).toLocaleString("es-PE");
    return `[${ts}] ${who}: ${m.body}${m.status === "failed" ? " (no se envió)" : ""}`;
  });
  const blob = new Blob(
    [`Conversación WhatsApp — ${customerName} (+${phone})\n\n${lines.join("\n")}\n`],
    { type: "text/plain;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `whatsapp-${phone}-${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

/** "519xxxxxxxx" → "+51 9xx xxx xxx". */
function prettyPhone(phone: string): string {
  if (phone.startsWith("51") && phone.length === 11) {
    return `+51 ${phone.slice(2, 5)} ${phone.slice(5, 8)} ${phone.slice(8)}`;
  }
  return `+${phone}`;
}

/**
 * Normaliza el teléfono tipeado a E.164 sin + (formato del webhook).
 * "917013738" (9 dígitos PE) → "51917013738"; internacional se acepta tal cual.
 */
function normalizePhoneInput(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 9 && digits.startsWith("9")) return `51${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return digits;
  return null;
}

/**
 * Altura del inbox medida en runtime: viewport − offset real del contenedor.
 * El calc() fijo fallaba según banners/zoom y el composer quedaba bajo el fold
 * (bug reportado por Brandon 2026-07-16).
 *
 * v2: ResizeObserver sobre <body> — el banner de alertas del admin se monta
 * ~3s tarde (fetch con delay inicial) y corría el offset DESPUÉS de las
 * re-mediciones a tiempo fijo → composer cortado. Ahora CUALQUIER cambio de
 * layout re-mide al instante. Se usa el offset ABSOLUTO del documento
 * (rect.top + scrollY): invariante al scroll → sin feedback loop, y la página
 * entera queda sin scroll (el hilo scrollea adentro).
 */
function useFillHeight(minPx = 420) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = ref.current;
        if (!el) return;
        // Corrección por delta: mover el borde INFERIOR del contenedor hasta
        // el borde del viewport. Funciona igual scrollee la ventana o un
        // contenedor interno (ej. el auto-scroll del hash #whatsapp-inbox),
        // y converge en 1 paso tras cada cambio de layout.
        const rect = el.getBoundingClientRect();
        const vh = window.visualViewport?.height ?? window.innerHeight;
        const delta = Math.floor(vh - 16 - rect.bottom);
        if (Math.abs(delta) < 2) return; // ya está clavado — evitar re-renders
        // Clamp: nunca más alto que el viewport (medición con página scrolleada)
        setHeight(Math.min(vh - 32, Math.max(minPx, el.offsetHeight + delta)));
      });
    };
    measure();

    // Cualquier cambio de tamaño del body (banners que aparecen/desaparecen,
    // headers que cargan tarde) re-mide al instante. Los timeouts cubren el
    // auto-scroll del hash de la URL, que no dispara ResizeObserver.
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    const t1 = setTimeout(measure, 1000);
    const t2 = setTimeout(measure, 3500);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t1);
      clearTimeout(t2);
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
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
    archivedPhones,
    toggleArchive,
    labelsMap,
    toggleLabel,
    markUnreadAndClose,
    notesMap,
    saveNote,
    stats,
    soundOn,
    toggleSound,
    customerContext,
    draftContact,
    startConversation,
  } = useWhatsAppInbox();

  // Vista de archivadas (toggle en la lista)
  const [showArchived, setShowArchived] = useState(false);
  const visibleConversations = useMemo(
    () =>
      conversations.filter((c) =>
        showArchived
          ? archivedPhones.includes(c.customerPhone)
          : !archivedPhones.includes(c.customerPhone),
      ),
    [conversations, archivedPhones, showArchived],
  );

  // Bug fix: altura real disponible (el calc fijo escondía el composer)
  const { ref: fillRef, height: fillHeight } = useFillHeight();

  // Mobile: mostrar lista o chat (no ambos)
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");

  // Form "nueva conversación" (➕): teléfono + nombre
  const [showNewChat, setShowNewChat] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhoneError, setNewPhoneError] = useState(false);

  const selected = useMemo(() => {
    const found = conversations.find((c) => c.customerPhone === selectedPhone);
    if (found) return found;
    // Conversación nueva sin mensajes aún: hilo sintético desde el borrador
    if (draftContact && draftContact.phone === selectedPhone) {
      return {
        customerPhone: draftContact.phone,
        customerName: draftContact.name,
        phoneNumberId: numbers.find((n) => n.isActive)?.phoneNumberId ?? "",
        lastMessage: "",
        lastDirection: "out" as const,
        lastSentBy: "admin" as const,
        lastAt: "",
        unread: 0,
      };
    }
    return null;
  }, [conversations, selectedPhone, draftContact, numbers]);

  function handleStartNewChat() {
    const phone = normalizePhoneInput(newPhone);
    if (!phone) {
      setNewPhoneError(true);
      return;
    }
    setNewPhoneError(false);
    startConversation(phone, newName);
    setShowNewChat(false);
    setNewPhone("");
    setNewName("");
    setMobileView("chat");
  }
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
          <button
            type="button"
            onClick={toggleSound}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full border-2 transition",
              soundOn
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-slate-200 text-slate-400 dark:border-slate-700",
            )}
            title={soundOn ? "Sonido de mensaje nuevo: activado" : "Sonido de mensaje nuevo: apagado"}
            aria-label="Alternar sonido de notificación"
          >
            {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
          {connected && (
            <button
              type="button"
              onClick={() => setShowNewChat((s) => !s)}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-sm font-bold text-white transition hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              Nueva conversación
            </button>
          )}
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

      {/* Mini-dashboard del día */}
      {stats && (stats.recibidos > 0 || stats.porBot + stats.porHumano > 0) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-200 bg-white px-4 py-1.5 text-[length:var(--ts-xs)] font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
          <span className="font-bold text-slate-700 dark:text-slate-200">Hoy:</span>
          <span>📥 {stats.recibidos} recibidos</span>
          <span>💬 {stats.respondidos} respondidos</span>
          <span>🤖 {stats.porBot} bot · 🙋 {stats.porHumano} tú</span>
          <span>👥 {stats.chatsActivos} chats</span>
          {stats.respPromedioMin !== null && (
            <span className="inline-flex items-center gap-1">
              <Timer className="h-3.5 w-3.5" aria-hidden />
              resp. ~{stats.respPromedioMin} min
            </span>
          )}
        </div>
      )}

      {/* Form nueva conversación (➕) */}
      {showNewChat && (
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
          <div className="min-w-[220px] flex-1">
            <label htmlFor="wa-new-phone" className="mb-1 block text-[length:var(--ts-xs)] font-bold text-slate-500">
              Número de WhatsApp
            </label>
            <input
              id="wa-new-phone"
              type="tel"
              value={newPhone}
              onChange={(e) => { setNewPhone(e.target.value); setNewPhoneError(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") handleStartNewChat(); }}
              placeholder="917 013 738 (agrega 51 si no es Perú)"
              className={cn(
                "h-12 w-full rounded-2xl border-2 bg-white px-4 text-base text-slate-900 outline-none transition focus:border-primary dark:bg-slate-950 dark:text-white",
                newPhoneError
                  ? "border-[var(--data-error-500)]"
                  : "border-slate-200 dark:border-slate-700",
              )}
            />
            {newPhoneError && (
              <p className="mt-1 text-[length:var(--ts-xs)] font-semibold text-[var(--data-error-500)]">
                Número inválido — 9 dígitos (Perú) o internacional con código de país
              </p>
            )}
          </div>
          <div className="min-w-[180px] flex-1">
            <label htmlFor="wa-new-name" className="mb-1 block text-[length:var(--ts-xs)] font-bold text-slate-500">
              Nombre (opcional)
            </label>
            <input
              id="wa-new-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleStartNewChat(); }}
              placeholder="Juan Pérez"
              className="h-12 w-full rounded-2xl border-2 border-slate-200 bg-white px-4 text-base text-slate-900 outline-none transition focus:border-primary dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>
          <button
            type="button"
            onClick={handleStartNewChat}
            className="inline-flex h-12 items-center gap-2 rounded-2xl bg-primary px-5 text-base font-bold text-white transition hover:opacity-90"
          >
            <MessageCircle className="h-5 w-5" />
            Abrir chat
          </button>
          <button
            type="button"
            onClick={() => setShowNewChat(false)}
            className="flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-slate-200 text-slate-500 transition hover:border-slate-300 dark:border-slate-700"
            aria-label="Cerrar nueva conversación"
          >
            <X className="h-5 w-5" />
          </button>
          <p className="w-full text-[length:var(--ts-xs)] text-slate-500">
            💡 Si esta persona nunca te escribió, WhatsApp exige iniciar con una <strong>plantilla</strong> (botón 📄 del chat). Con el número de prueba de Meta solo puedes escribir a tus contactos registrados.
          </p>
        </div>
      )}

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

      {/* Layout 2 columnas (desktop) / alternado (mobile).
          grid-rows-[minmax(0,1fr)]: sin esto la fila implícita se dimensiona
          al CONTENIDO (mensajes largos) y desborda el contenedor → composer
          clipeado por overflow-hidden (bug real de Brandon, medido en consola). */}
      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] overflow-hidden md:grid-cols-[340px_1fr]">
        <aside
          className={cn(
            "h-full min-h-0 overflow-hidden border-r border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/40",
            mobileView === "chat" && "hidden md:block",
          )}
        >
          <WaConversationList
            conversations={visibleConversations}
            selectedPhone={selectedPhone}
            onSelect={handleSelect}
            loading={loadingConvs}
            archivedCount={archivedPhones.length}
            showArchived={showArchived}
            onToggleShowArchived={() => setShowArchived((s) => !s)}
            labelsMap={labelsMap}
          />
        </aside>

        <main
          className={cn(
            "flex h-full min-h-0 flex-col overflow-hidden",
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
                {/* Exportar conversación (.txt) */}
                <button
                  type="button"
                  onClick={() => exportThreadTxt(selected.customerName, selected.customerPhone, messages)}
                  className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-slate-200 text-slate-500 transition hover:border-primary/50 hover:text-primary dark:border-slate-700 dark:text-slate-400"
                  title="Descargar la conversación (.txt)"
                  aria-label="Exportar conversación"
                >
                  <Download className="h-4 w-4" />
                </button>
                {/* Dejar como no leída (recordatorio de volver) */}
                <button
                  type="button"
                  onClick={() => {
                    void markUnreadAndClose(selected.customerPhone);
                    setMobileView("list");
                  }}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-slate-200 text-slate-500 transition hover:border-primary/50 hover:text-primary dark:border-slate-700 dark:text-slate-400"
                  title="Dejar como no leída (queda resaltada en la bandeja)"
                  aria-label="Dejar como no leída"
                >
                  <MailOpen className="h-4 w-4" />
                </button>
                {/* Archivar / desarchivar el hilo */}
                {(() => {
                  const archived = archivedPhones.includes(selected.customerPhone);
                  return (
                    <button
                      type="button"
                      onClick={() => {
                        void toggleArchive(selected.customerPhone, !archived);
                        if (!archived) setMobileView("list");
                      }}
                      className={cn(
                        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border-2 px-3 text-sm font-bold transition",
                        archived
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-slate-200 text-slate-500 hover:border-primary/50 hover:text-primary dark:border-slate-700 dark:text-slate-400",
                      )}
                      title={archived ? "Volver a la bandeja principal" : "Archivar conversación (sigue recibiendo mensajes)"}
                    >
                      <Archive className="h-4 w-4" />
                      {archived ? "Archivada" : "Archivar"}
                    </button>
                  );
                })()}
                {/* Pausar/reanudar el bot IA en ESTE hilo */}
                {(() => {
                  const paused = pausedPhones.includes(selected.customerPhone);
                  return (
                    <button
                      type="button"
                      onClick={() => void toggleBotPause(selected.customerPhone, !paused)}
                      className={cn(
                        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border-2 px-3 text-sm font-bold transition",
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
              {/* Etiquetas de triage del hilo (compartidas entre cajeros) */}
              <div className="border-b border-slate-200 bg-white px-4 py-1.5 dark:border-slate-700 dark:bg-slate-900">
                <WaLabelPicker
                  value={labelsMap[selected.customerPhone] ?? []}
                  onToggle={(id) => void toggleLabel(selected.customerPhone, id)}
                />
              </div>
              {/* Ficha CRM: pedidos + fiado del cliente (best-effort) */}
              <WaCustomerCard context={customerContext} />
              {/* Nota interna del equipo */}
              <WaNoteBar
                phone={selected.customerPhone}
                note={notesMap[selected.customerPhone] ?? ""}
                onSave={(phone, note) => void saveNote(phone, note)}
              />
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
