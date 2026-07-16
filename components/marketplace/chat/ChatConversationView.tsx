"use client";

/**
 * ChatConversationView — conversación 1:1 con una tienda, estilo WhatsApp.
 *
 * v2 (Brandon 2026-06-06) — sistema D2 (threads) con:
 *   - ✓ enviado · ✓✓ leído por la tienda (readBySellerAt) estilo WhatsApp
 *   - Tarjeta de PEDIDO para mensajes order_link (el resumen del checkout)
 *   - Mensajes de sistema centrados
 *   - Quick replies cuando la conversación está vacía
 *   - Thread se crea al primer mensaje (action=open) si aún no existe
 *
 * Polling 5s mientras está abierta; el GET ya marca leído al buyer.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft, Send, Store as StoreIcon, Loader2, ArrowRight, Check, CheckCheck,
  ReceiptText, Smile, Undo2, X, ShoppingCart, Wallet, Copy, Bot, Paperclip, MapPin, Star, Mic, Square, Trash2,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";
import { useMarketplaceCart, modifierHashOf } from "@/hooks/use-marketplace-cart";
import { parseSharedProduct, parseSubstitution, parseChatOrder, parseChatPayment, parseReviewRequest, fmtSoles, type SharedChatProduct, type ChatSubstitution, type ChatOrder, type ChatPayment } from "@/lib/chat/shared-product";
import { parseOrderContext, orderStatusMeta, type ChatOrderContext } from "@/lib/chat/order-context";
import { parseChatLocation, osmTile, googleMapsUrl } from "@/lib/chat/location";
import { parseChatVoice, fmtDuration } from "@/lib/chat/voice";
import { VoiceNotePlayer } from "./VoiceNotePlayer";

const POLL_MS = 5_000;

interface ThreadMsg {
  id: string;
  senderType: "buyer" | "seller" | "system";
  senderName: string;
  body: string;
  messageType: string;
  attachmentUrl: string | null;
  /** Tanda 1: lleva reactions + replyTo (cita) en JSON. */
  metadataJson: string | null;
  readBySellerAt: string | null;
  createdAt: string;
}

// ── Tanda 1 (Brandon 2026-06-11): reacciones + cita + emoji ──────────────────
interface MsgReaction { emoji: string; by: "buyer" | "seller" }
interface MsgReply { id: string; body: string; senderType: "buyer" | "seller" | "system"; senderName: string }

/** Emojis de reacción rápida (la barra que sale al tocar un mensaje). */
const REACTION_EMOJIS = ["❤️", "👍", "😂", "🔥", "🙏", "😮"];
/** Set del selector de emoji del composer. */
const COMPOSER_EMOJIS = [
  "😀", "😅", "😂", "😍", "😘", "🤔", "😎", "🥳",
  "👍", "🙏", "🔥", "🎉", "❤️", "😮", "😢", "👏",
  "🙌", "🛵", "💰", "✅", "📦", "🍗", "🍕", "🥤",
];

/** Parsea metadataJson de un mensaje a reactions + replyTo + autoReply. */
function parseMeta(raw: string | null): { reactions: MsgReaction[]; replyTo: MsgReply | null; autoReply: boolean } {
  if (!raw) return { reactions: [], replyTo: null, autoReply: false };
  try {
    const m = JSON.parse(raw) as { reactions?: MsgReaction[]; replyTo?: MsgReply; autoReply?: boolean };
    return {
      reactions: Array.isArray(m.reactions) ? m.reactions : [],
      replyTo: m.replyTo ?? null,
      autoReply: m.autoReply === true,
    };
  } catch {
    return { reactions: [], replyTo: null, autoReply: false };
  }
}

interface Props {
  threadId: string | null;
  storeId: string;
  storeName: string;
  storeSlug: string | null;
  storeLogo: string | null;
  customerPhone: string;
  customerName: string;
  onBack: () => void;
  onActivity?: () => void;
  /** Avisa al padre el threadId real cuando se crea en el primer mensaje. */
  onThreadCreated?: (threadId: string) => void;
}

const QUICK_REPLIES = [
  "Hola, ¿están atendiendo?",
  "¿Hacen delivery a mi zona?",
  "¿Qué me recomiendan hoy?",
];

// Increment 2: presencia de la tienda en el header.
interface ChatPresence { typing: boolean; online: boolean; lastSeen: number | null }

/** "hace un momento · hace 5 min · hace 2 h · hace 3 d" para "Visto …". */
function relativeSeen(ts: number): string {
  const m = Math.floor((Date.now() - ts) / 60_000);
  if (m < 1) return "hace un momento";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
}

/** "Hoy" · "Ayer" · "12 may" — separadores de día como WhatsApp. */
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(today);
  yest.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(d, today)) return "Hoy";
  if (same(d, yest)) return "Ayer";
  return d.toLocaleDateString("es-PE", { day: "numeric", month: "short" });
}

export default function ChatConversationView({
  threadId: threadIdProp, storeId, storeName, storeSlug, storeLogo,
  customerPhone, customerName, onBack, onActivity, onThreadCreated,
}: Props) {
  const [threadId, setThreadId] = useState<string | null>(threadIdProp);
  const [messages, setMessages] = useState<ThreadMsg[]>([]);
  const [loading, setLoading] = useState(!!threadIdProp);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [locating, setLocating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Tanda 4: grabación de nota de voz.
  const [recording, setRecording] = useState(false);
  const [recordSecs, setRecordSecs] = useState(0);
  const [sendingVoice, setSendingVoice] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordStartRef = useRef(0);
  const cancelRecordRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  // Brandon 2026-06-07: si el hilo ya no existe o no es tuyo (GET 404 por
  // ownership / thread borrado, o 403 por sesión que no coincide), marcamos
  // "no disponible" → cortamos el polling (evita el spam de 404 en consola) y
  // deshabilitamos el envío (evita el POST 403).
  const [unavailable, setUnavailable] = useState(false);
  // Tanda 1: cita activa, mensaje con barra de acciones abierta, selector emoji.
  const [replyTo, setReplyTo] = useState<MsgReply | null>(null);
  const [activeMsgId, setActiveMsgId] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  // Increment 2: presencia de la tienda (en línea / escribiendo / visto).
  const [presence, setPresence] = useState<ChatPresence | null>(null);
  // Tanda 4: contexto del pedido fijado arriba (si el hilo nació de un pedido).
  const [orderContext, setOrderContext] = useState<ChatOrderContext | null>(null);
  const lastTypingPingRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(0);
  // Tanda 2: agregar al carrito un producto compartido por la tienda.
  const { addItem } = useMarketplaceCart();
  const [addedProductId, setAddedProductId] = useState<string | null>(null);
  // Tanda 2: sustituciones ya respondidas (oculta los botones Sí/No).
  const [respondedSubs, setRespondedSubs] = useState<Set<string>>(new Set());

  const addSharedToCart = useCallback((p: SharedChatProduct) => {
    addItem({
      storeId: p.storeId,
      storeName: p.storeName,
      storeSlug: p.storeSlug,
      storeProductId: p.storeProductId,
      productId: p.productId,
      name: p.name,
      price: p.price,
      basePrice: p.price,
      image: p.image,
      unit: p.unit,
      modifiers: [],
      modifierHash: modifierHashOf([]),
      quantity: 1,
    });
    setAddedProductId(p.storeProductId);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try { navigator.vibrate(30); } catch { /* sin soporte */ }
    }
    window.setTimeout(() => setAddedProductId(null), 1800);
  }, [addItem]);

  const fetchMessages = useCallback(async () => {
    if (!threadId || !storeSlug) return;
    try {
      const res = await fetch(
        `/api/chat/public?threadId=${encodeURIComponent(threadId)}&storeSlug=${encodeURIComponent(storeSlug)}&customerPhone=${encodeURIComponent(customerPhone)}`,
        { credentials: "include" },
      );
      // Hilo inaccesible (borrado / ownership / sesión) → cortar polling.
      if (res.status === 404 || res.status === 403) { setUnavailable(true); return; }
      if (!res.ok) return;
      const j = (await res.json()) as { data: ThreadMsg[]; presence?: ChatPresence; orderContext?: unknown };
      setMessages(j.data ?? []);
      setPresence(j.presence ?? null);
      setOrderContext(parseOrderContext(j.orderContext));
    } catch {
      /* polling no crítico */
    }
  }, [threadId, storeSlug, customerPhone]);

  // Carga inicial + polling "en vivo".
  useEffect(() => {
    if (!threadId || unavailable) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      await fetchMessages();
      if (!cancelled) setLoading(false);
    })();
    const interval = window.setInterval(fetchMessages, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [threadId, fetchMessages, unavailable]);

  // Autoscroll al fondo cuando llegan mensajes nuevos.
  useEffect(() => {
    if (messages.length !== lastCountRef.current) {
      lastCountRef.current = messages.length;
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      onActivity?.();
    }
  }, [messages.length, onActivity]);

  /** Tanda 1: toggle de reacción emoji (optimista + server). */
  const react = useCallback(async (messageId: string, emoji: string) => {
    if (!threadId || !storeSlug || unavailable) return;
    setActiveMsgId(null);
    // Optimista: replicar la lógica toggle del server localmente.
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const { reactions, replyTo: rt } = parseMeta(m.metadataJson);
        const mine = reactions.find((r) => r.by === "buyer");
        let next = reactions.filter((r) => r.by !== "buyer");
        if (!mine || mine.emoji !== emoji) next = [...next, { emoji, by: "buyer" as const }];
        return { ...m, metadataJson: JSON.stringify({ ...(rt ? { replyTo: rt } : {}), reactions: next }) };
      }),
    );
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try { navigator.vibrate(15); } catch { /* sin soporte */ }
    }
    try {
      await fetch("/api/chat/public?action=react", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ threadId, storeSlug, customerPhone, messageId, emoji }),
      });
    } catch { /* el próximo poll reconcilia */ }
  }, [threadId, storeSlug, customerPhone, unavailable]);

  /** Increment 2: avisa "escribiendo…" a la tienda (throttle ~3.5s). */
  const pingTyping = useCallback(() => {
    if (!threadId || !storeSlug || unavailable) return;
    const now = Date.now();
    if (now - lastTypingPingRef.current < 3500) return;
    lastTypingPingRef.current = now;
    fetch("/api/chat/public?action=typing", {
      method: "POST",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      credentials: "include",
      body: JSON.stringify({ threadId, storeSlug, customerPhone }),
    }).catch(() => { /* efímero, no crítico */ });
  }, [threadId, storeSlug, customerPhone, unavailable]);

  const send = async (raw?: string) => {
    const trimmed = (raw ?? text).trim();
    if (!trimmed || sending || !storeSlug || unavailable) return;
    setSending(true);
    setError(null);
    try {
      let res: Response;
      if (!threadId) {
        // Primer mensaje → abre el thread con firstMessage.
        res = await fetch("/api/chat/public?action=open", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify({
            storeSlug,
            customerPhone,
            customerName,
            firstMessage: trimmed,
          }),
        });
      } else {
        res = await fetch("/api/chat/public?action=send", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify({
            threadId,
            storeSlug,
            customerPhone,
            customerName,
            body: trimmed,
            // Tanda 1: cita (reply) — snapshot del mensaje citado.
            ...(replyTo
              ? { replyTo: { ...replyTo, body: replyTo.body.slice(0, 200) } }
              : {}),
          }),
        });
      }
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setError(
          res.status === 429
            ? "Muy rápido — esperá un momento."
            : (j?.error ?? "No se pudo enviar. Probá de nuevo."),
        );
        return;
      }
      // action=open devuelve { data: { threadId } }.
      const newThreadId: string | undefined = j?.data?.threadId;
      if (!threadId && newThreadId) {
        setThreadId(newThreadId);
        onThreadCreated?.(newThreadId);
      }
      setText("");
      setReplyTo(null);
      setEmojiOpen(false);
      // Refresca al toque para ver el mensaje persistido (y sus checks).
      window.setTimeout(() => { void fetchMessages(); }, 300);
    } catch {
      setError("Sin conexión. Probá de nuevo.");
    } finally {
      setSending(false);
    }
  };

  /** Tanda 4: el cliente adjunta una foto (comprobante de Yape/Plin) al hilo.
      Sube la imagen y manda un mensaje con attachmentUrl + messageType image. */
  const sendImage = async (file: File) => {
    if (!file || sending || uploading || unavailable || !storeSlug) return;
    if (!threadId) { setError("Mandá un mensaje primero para abrir el chat."); return; }
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      // CSRF: el proxy exige x-csrf-token en POST. NO seteamos Content-Type:
      // el browser pone el boundary del multipart solo.
      const up = await fetch("/api/chat/public/upload", {
        method: "POST",
        headers: csrfHeaders(),
        body: fd,
        credentials: "include",
      });
      const uj = await up.json().catch(() => null);
      if (!up.ok || !uj?.url) {
        setError(uj?.error ?? "No se pudo subir la imagen.");
        return;
      }
      const res = await fetch("/api/chat/public?action=send", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({
          threadId, storeSlug, customerPhone, customerName,
          body: "📷 Comprobante",
          attachmentUrl: uj.url,
          messageType: "image",
        }),
      });
      if (!res.ok) { setError("No se pudo enviar la imagen."); return; }
      window.setTimeout(() => { void fetchMessages(); }, 300);
    } catch {
      setError("Sin conexión. Probá de nuevo.");
    } finally {
      setUploading(false);
    }
  };

  /** Tanda 4: el cliente comparte su ubicación GPS (one-shot) para coordinar la
      entrega. Va en metadataJson.location (lo arma el server desde campos validados). */
  const shareLocation = () => {
    if (sending || uploading || locating || unavailable || !storeSlug) return;
    if (!threadId) { setError("Mandá un mensaje primero para abrir el chat."); return; }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Tu dispositivo no soporta ubicación."); return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch("/api/chat/public?action=send", {
            method: "POST",
            headers: csrfHeaders({ "Content-Type": "application/json" }),
            credentials: "include",
            body: JSON.stringify({
              threadId, storeSlug, customerPhone, customerName,
              body: "📍 Mi ubicación",
              location: { lat: pos.coords.latitude, lng: pos.coords.longitude },
            }),
          });
          if (!res.ok) { setError("No se pudo enviar la ubicación."); return; }
          window.setTimeout(() => { void fetchMessages(); }, 300);
        } catch {
          setError("Sin conexión. Probá de nuevo.");
        } finally {
          setLocating(false);
        }
      },
      () => { setError("No pudimos obtener tu ubicación. Activá el GPS."); setLocating(false); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  /** Tanda 4: sube el audio grabado y lo manda como nota de voz. */
  const sendVoice = async (blob: Blob, durationSec: number) => {
    if (!threadId || !storeSlug) return;
    setSendingVoice(true);
    setError(null);
    try {
      const ext = blob.type.includes("mp4") ? "mp4" : "webm";
      const fd = new FormData();
      fd.append("file", new File([blob], `nota.${ext}`, { type: blob.type }));
      const up = await fetch("/api/chat/public/upload-audio", {
        method: "POST",
        headers: csrfHeaders(),
        body: fd,
        credentials: "include",
      });
      const uj = await up.json().catch(() => null);
      if (!up.ok || !uj?.url) { setError(uj?.error ?? "No se pudo subir la nota de voz."); return; }
      const res = await fetch("/api/chat/public?action=send", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({
          threadId, storeSlug, customerPhone, customerName,
          body: "🎤 Nota de voz",
          voice: { url: uj.url, durationSec },
        }),
      });
      if (!res.ok) { setError("No se pudo enviar la nota de voz."); return; }
      window.setTimeout(() => { void fetchMessages(); }, 300);
    } catch {
      setError("Sin conexión. Probá de nuevo.");
    } finally {
      setSendingVoice(false);
    }
  };

  /** Tanda 4: arranca a grabar (pide permiso de micrófono). */
  const startRecording = async () => {
    if (recording || sendingVoice || unavailable) return;
    if (!threadId) { setError("Mandá un mensaje primero para abrir el chat."); return; }
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Tu navegador no soporta grabar audio."); return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      audioChunksRef.current = [];
      cancelRecordRef.current = false;
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
        const secs = Math.round((Date.now() - recordStartRef.current) / 1000);
        setRecording(false);
        setRecordSecs(0);
        if (cancelRecordRef.current) return;
        const blob = new Blob(audioChunksRef.current, { type: mr.mimeType || "audio/webm" });
        if (blob.size > 256 && secs >= 1) void sendVoice(blob, secs);
      };
      mediaRecorderRef.current = mr;
      recordStartRef.current = Date.now();
      mr.start();
      setRecording(true);
      setRecordSecs(0);
      setError(null);
      recordTimerRef.current = setInterval(() => {
        const s = Math.round((Date.now() - recordStartRef.current) / 1000);
        setRecordSecs(s);
        if (s >= 120) stopRecording(true); // tope 2 min
      }, 250);
    } catch {
      setError("No pudimos acceder al micrófono. Dale permiso.");
    }
  };

  /** Tanda 4: detiene la grabación (send=true manda, false descarta). */
  const stopRecording = (send: boolean) => {
    const mr = mediaRecorderRef.current;
    if (!mr || mr.state === "inactive") return;
    cancelRecordRef.current = !send;
    mr.stop();
  };

  useEffect(() => () => {
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") { cancelRecordRef.current = true; mr.stop(); }
  }, []);

  /** Tanda 2: el cliente acepta (agrega el reemplazo al carrito) o rechaza una
      sustitución propuesta por la tienda; en ambos casos avisa por el chat. */
  const respondSubstitution = async (messageId: string, sub: ChatSubstitution, accept: boolean) => {
    setRespondedSubs((prev) => new Set(prev).add(messageId));
    if (accept) {
      addSharedToCart(sub.replacement);
      await send(`✅ Dale, mandame ${sub.replacement.name} en lugar de "${sub.originalName}".`);
    } else {
      await send(`❌ No, gracias. Mejor sacá "${sub.originalName}" del pedido.`);
    }
  };

  /** Tanda 2: el cliente confirma un pedido armado por la tienda → se le agrega
      TODO al carrito y avisa por el chat (el checkout normal sigue después). */
  const confirmOrder = async (messageId: string, order: ChatOrder) => {
    setRespondedSubs((prev) => new Set(prev).add(messageId));
    for (const it of order.items) {
      addItem({
        storeId: it.storeId,
        storeName: it.storeName,
        storeSlug: it.storeSlug,
        storeProductId: it.storeProductId,
        productId: it.productId,
        name: it.name,
        price: it.price,
        basePrice: it.price,
        image: it.image,
        unit: it.unit,
        modifiers: [],
        modifierHash: modifierHashOf([]),
        quantity: it.quantity,
      });
    }
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try { navigator.vibrate(40); } catch { /* sin soporte */ }
    }
    await send(`✅ Confirmo el pedido (${fmtSoles(order.total)}). Lo agregué al carrito.`);
  };

  /** Tanda 2: el cliente marca que ya pagó un cobro Yape/Plin (confirmación
      manual; el comprobante va por el flujo existente). */
  const markPaid = async (messageId: string, payment: ChatPayment) => {
    setRespondedSubs((prev) => new Set(prev).add(messageId));
    const methodLabel = payment.method === "plin" ? "Plin" : "Yape";
    await send(`✅ Ya pagué ${fmtSoles(payment.amount)} por ${methodLabel}. Te paso el comprobante.`);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header — tienda + volver + ir a la tienda */}
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 py-2.5">
        <button
          type="button"
          onClick={onBack}
          aria-label="Volver a chats"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] active:scale-95"
        >
          <ArrowLeft className="h-4.5 w-4.5" strokeWidth={2.5} aria-hidden />
        </button>
        <span className="relative inline-flex h-9 w-9 shrink-0 overflow-hidden rounded-full border border-[var(--rule-soft)] bg-[var(--surface-sunken)]">
          {storeLogo ? (
            <Image src={storeLogo} alt="" fill sizes="36px" className="object-cover" />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-[var(--accent)]">
              <StoreIcon className="h-4.5 w-4.5" strokeWidth={2} aria-hidden />
            </span>
          )}
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-extrabold text-[var(--text-primary)]">{storeName}</p>
          <p
            className={cn(
              "truncate text-[length:var(--ts-2xs)] font-bold",
              presence?.typing ? "text-[var(--accent)]" : "text-[var(--data-success-500)]",
            )}
          >
            {presence?.typing
              ? "Escribiendo…"
              : presence?.online
                ? "En línea"
                : presence?.lastSeen
                  ? `Visto ${relativeSeen(presence.lastSeen)}`
                  : "La tienda responde por acá o WhatsApp"}
          </p>
        </div>
        {storeSlug && (
          <Link
            href={`/marketplace/${storeSlug}`}
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2.5 py-1.5 text-[length:var(--ts-2xs)] font-black uppercase tracking-wider text-[var(--accent)] transition-colors hover:bg-[var(--accent)] hover:text-white"
            aria-label={`Ir a la tienda ${storeName}`}
          >
            Ver tienda
            <ArrowRight className="h-3 w-3" strokeWidth={2.75} aria-hidden />
          </Link>
        )}
      </div>

      {/* Contexto del pedido fijado (Tanda 4) — de qué pedido hablamos */}
      {orderContext && (
        <div className="shrink-0 border-b border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-black uppercase tracking-wider text-[var(--text-secondary)]">
              <ReceiptText className="h-3.5 w-3.5 text-[var(--accent)]" aria-hidden />
              Pedido #{orderContext.shortCode}
            </span>
            <span className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold",
              orderStatusMeta(orderContext.status).chip,
            )}>
              {orderStatusMeta(orderContext.status).label}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="truncate text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
              {orderContext.items.map((it) => `${it.quantity}× ${it.name}`).join(" · ")}
              {orderContext.itemCount > orderContext.items.reduce((a, i) => a + i.quantity, 0) && " …"}
            </span>
            <span className="shrink-0 text-sm font-black tabular-nums text-[var(--accent)]">
              {fmtSoles(orderContext.total)}
            </span>
          </div>
        </div>
      )}

      {/* Mensajes */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto bg-[var(--surface-canvas)] px-3 py-3">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm font-bold text-[var(--text-tertiary)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Cargando mensajes…
          </div>
        ) : messages.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm font-extrabold text-[var(--text-primary)]">
              Escribile a {storeName}
            </p>
            <p className="mt-1 text-sm font-medium text-[var(--text-tertiary)]">
              Preguntá por productos, precios o tu pedido — te responden en vivo.
            </p>
            {/* Quick replies — un tap y arranca la conversación */}
            <div className="mt-4 flex flex-col items-center gap-2">
              {QUICK_REPLIES.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => void send(q)}
                  disabled={sending}
                  className="rounded-full border-2 border-[var(--accent)]/40 bg-[var(--accent-soft)] px-4 py-2 text-sm font-bold text-[var(--accent)] transition-all hover:border-[var(--accent)] hover:bg-[var(--accent)] hover:text-white active:scale-95"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const newDay = !prev || dayLabel(prev.createdAt) !== dayLabel(m.createdAt);
              const mine = m.senderType === "buyer";
              const isSystem = m.senderType === "system";
              const isOrder = m.messageType === "order_link";
              const meta = parseMeta(m.metadataJson);
              const sharedProduct = parseSharedProduct(m.metadataJson);
              const substitution = parseSubstitution(m.metadataJson);
              const chatOrder = parseChatOrder(m.metadataJson);
              const chatPayment = parseChatPayment(m.metadataJson);
              const location = parseChatLocation(m.metadataJson);
              const tile = location ? osmTile(location.lat, location.lng) : null;
              const reviewReq = parseReviewRequest(m.metadataJson);
              const voice = parseChatVoice(m.metadataJson);
              const active = activeMsgId === m.id;

              return (
                <li key={m.id}>
                  {newDay && (
                    <div className="my-2.5 flex items-center justify-center">
                      <span className="rounded-full bg-[var(--surface-sunken)] px-2.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">
                        {dayLabel(m.createdAt)}
                      </span>
                    </div>
                  )}

                  {isSystem ? (
                    <div className="my-1.5 flex justify-center">
                      <span className="max-w-[85%] rounded-xl bg-[var(--surface-sunken)] px-3 py-1.5 text-center text-[length:var(--ts-xs)] font-bold text-[var(--text-tertiary)]">
                        {m.body}
                      </span>
                    </div>
                  ) : (
                    <div className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
                      {/* Burbuja — tap/click abre la barra de acciones (reaccionar/responder) */}
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setActiveMsgId((id) => (id === m.id ? null : m.id))}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setActiveMsgId((id) => (id === m.id ? null : m.id)); } }}
                        aria-label="Tocá para reaccionar o responder"
                        className={cn(
                          "max-w-[80%] cursor-pointer rounded-2xl shadow-sm outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40",
                          isOrder && "w-full max-w-[88%]",
                          active && "ring-2 ring-[var(--accent)]/40",
                          mine
                            ? "rounded-br-md bg-[var(--accent)] text-white"
                            : "rounded-bl-md border border-[var(--rule-soft)] bg-[var(--surface-raised)] text-[var(--text-primary)]",
                        )}
                      >
                        {/* Cita (reply) — snapshot del mensaje citado */}
                        {meta.replyTo && (
                          <div
                            className={cn(
                              "mx-2 mt-2 rounded-lg border-l-[3px] px-2 py-1",
                              mine
                                ? "border-white/70 bg-white/15"
                                : "border-[var(--accent)] bg-[var(--accent-soft)]",
                            )}
                          >
                            <p className={cn(
                              "text-[length:var(--ts-2xs)] font-black",
                              mine ? "text-white/90" : "text-[var(--accent)]",
                            )}>
                              {meta.replyTo.senderType === "buyer" ? "Vos" : storeName}
                            </p>
                            <p className={cn(
                              "truncate text-[length:var(--ts-xs)] font-medium",
                              mine ? "text-white/80" : "text-[var(--text-secondary)]",
                            )}>
                              {meta.replyTo.body}
                            </p>
                          </div>
                        )}
                        {/* Tarjeta de PRODUCTO compartido por la tienda (Tanda 2) */}
                        {sharedProduct && (
                          <div className={cn(
                            "m-2 overflow-hidden rounded-xl border bg-[var(--surface-canvas)]",
                            mine ? "border-white/30" : "border-[var(--rule-base)]",
                          )}>
                            <div className="flex items-center gap-2.5 p-2.5">
                              <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-white">
                                {sharedProduct.image ? (
                                  <Image src={sharedProduct.image} alt="" fill sizes="56px" className="object-contain p-1" />
                                ) : (
                                  <span className="absolute inset-0 flex items-center justify-center text-[var(--text-tertiary)]">
                                    <ShoppingCart className="h-5 w-5" aria-hidden />
                                  </span>
                                )}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-bold text-[var(--text-primary)]">{sharedProduct.name}</p>
                                <p className="text-base font-black tabular-nums text-[var(--accent)]">
                                  {fmtSoles(sharedProduct.price)}
                                  {sharedProduct.unit && (
                                    <span className="text-[length:var(--ts-xs)] font-medium text-[var(--text-tertiary)]"> /{sharedProduct.unit}</span>
                                  )}
                                </p>
                              </div>
                            </div>
                            {!mine && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); addSharedToCart(sharedProduct); }}
                                className="flex w-full items-center justify-center gap-1.5 border-t border-[var(--rule-soft)] py-2 text-sm font-bold text-[var(--accent)] transition-colors hover:bg-[var(--accent-soft)]"
                              >
                                {addedProductId === sharedProduct.storeProductId ? (
                                  <><Check className="h-4 w-4" strokeWidth={2.5} aria-hidden /> Agregado ✓</>
                                ) : (
                                  <><ShoppingCart className="h-4 w-4" strokeWidth={2.25} aria-hidden /> Agregar al carrito</>
                                )}
                              </button>
                            )}
                          </div>
                        )}
                        {/* Pedido armado por la tienda (Tanda 2) */}
                        {chatOrder && (
                          <div className={cn(
                            "m-2 overflow-hidden rounded-xl border bg-[var(--surface-canvas)]",
                            mine ? "border-white/30" : "border-[var(--rule-base)]",
                          )}>
                            <div className="flex items-center gap-2 border-b border-[var(--rule-soft)] bg-[var(--accent-soft)] px-3 py-2">
                              <ReceiptText className="h-4 w-4 text-[var(--accent)]" aria-hidden />
                              <span className="text-[length:var(--ts-2xs)] font-black uppercase tracking-wider text-[var(--accent)]">
                                Pedido armado por la tienda
                              </span>
                            </div>
                            <ul>
                              {chatOrder.items.map((it, i) => (
                                <li key={`${it.storeProductId}-${i}`} className="flex items-center justify-between gap-2 border-b border-[var(--rule-soft)] px-3 py-1.5 last:border-b-0">
                                  <span className="min-w-0 truncate text-sm font-medium text-[var(--text-primary)]">{it.quantity}× {it.name}</span>
                                  <span className="shrink-0 text-sm font-bold tabular-nums text-[var(--text-primary)]">{fmtSoles(it.price * it.quantity)}</span>
                                </li>
                              ))}
                            </ul>
                            <div className="flex items-center justify-between border-t border-[var(--rule-soft)] px-3 py-2">
                              <span className="text-sm font-bold text-[var(--text-secondary)]">Total</span>
                              <span className="text-base font-black tabular-nums text-[var(--accent)]">{fmtSoles(chatOrder.total)}</span>
                            </div>
                            {!mine && (
                              respondedSubs.has(m.id) ? (
                                <p className="border-t border-[var(--rule-soft)] py-2 text-center text-[length:var(--ts-xs)] font-bold text-[var(--text-tertiary)]">
                                  Confirmado ✓ — está en tu carrito
                                </p>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); void confirmOrder(m.id, chatOrder); }}
                                  className="flex w-full items-center justify-center gap-1.5 border-t border-[var(--rule-soft)] bg-[var(--accent)] py-2.5 text-sm font-bold text-white transition-[filter] hover:brightness-110"
                                >
                                  <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden /> Confirmar y agregar al carrito
                                </button>
                              )
                            )}
                          </div>
                        )}
                        {/* Sustitución de faltante (Tanda 2) — la tienda propone un cambio */}
                        {substitution && (
                          <div className={cn(
                            "m-2 overflow-hidden rounded-xl border bg-[var(--surface-canvas)]",
                            mine ? "border-white/30" : "border-[var(--rule-base)]",
                          )}>
                            <div className="px-3 pt-2.5">
                              <p className="text-[length:var(--ts-2xs)] font-black uppercase tracking-wider text-[var(--data-warning-700)]">
                                Cambio de producto
                              </p>
                              <p className="mt-0.5 text-sm font-medium text-[var(--text-primary)]">
                                No hay <strong>{substitution.originalName}</strong>. La tienda propone:
                              </p>
                            </div>
                            <div className="mt-2 flex items-center gap-2.5 border-t border-[var(--rule-soft)] px-3 py-2">
                              <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-white">
                                {substitution.replacement.image ? (
                                  <Image src={substitution.replacement.image} alt="" fill sizes="48px" className="object-contain p-1" />
                                ) : (
                                  <span className="absolute inset-0 flex items-center justify-center text-[var(--text-tertiary)]">
                                    <ShoppingCart className="h-4 w-4" aria-hidden />
                                  </span>
                                )}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-bold text-[var(--text-primary)]">{substitution.replacement.name}</p>
                                <p className="text-base font-black tabular-nums text-[var(--accent)]">{fmtSoles(substitution.replacement.price)}</p>
                              </div>
                            </div>
                            {!mine && (
                              respondedSubs.has(m.id) ? (
                                <p className="border-t border-[var(--rule-soft)] py-2 text-center text-[length:var(--ts-xs)] font-bold text-[var(--text-tertiary)]">
                                  Respuesta enviada ✓
                                </p>
                              ) : (
                                <div className="flex border-t border-[var(--rule-soft)]">
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); void respondSubstitution(m.id, substitution, true); }}
                                    className="flex flex-1 items-center justify-center gap-1.5 py-2 text-sm font-bold text-[var(--accent)] transition-colors hover:bg-[var(--accent-soft)]"
                                  >
                                    <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden /> Sí, dale
                                  </button>
                                  <span className="w-px bg-[var(--rule-soft)]" aria-hidden />
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); void respondSubstitution(m.id, substitution, false); }}
                                    className="flex flex-1 items-center justify-center gap-1.5 py-2 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)]"
                                  >
                                    <X className="h-4 w-4" strokeWidth={2.5} aria-hidden /> No, gracias
                                  </button>
                                </div>
                              )
                            )}
                          </div>
                        )}
                        {/* Cobro Yape/Plin (Tanda 2) — la tienda pide un pago manual */}
                        {chatPayment && (
                          <div className={cn(
                            "m-2 overflow-hidden rounded-xl border bg-[var(--surface-canvas)]",
                            mine ? "border-white/30" : "border-[var(--rule-base)]",
                          )}>
                            <div className="flex items-center justify-between gap-2 bg-[var(--accent-soft)] px-3 py-2">
                              <span className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-black uppercase tracking-wider text-[var(--accent)]">
                                <Wallet className="h-4 w-4" aria-hidden /> Cobro por {chatPayment.method === "plin" ? "Plin" : "Yape"}
                              </span>
                              <span className="text-lg font-black tabular-nums text-[var(--accent)]">{fmtSoles(chatPayment.amount)}</span>
                            </div>
                            {chatPayment.number && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(chatPayment.number!).catch(() => { /* clipboard sin permiso: el número igual está visible */ }); }}
                                className="flex w-full items-center justify-between gap-2 border-t border-[var(--rule-soft)] px-3 py-2 text-left transition-colors hover:bg-[var(--surface-sunken)]"
                              >
                                <span className="min-w-0">
                                  <span className="block text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">
                                    {chatPayment.method === "plin" ? "Plinéale al" : "Yapéale al"}
                                  </span>
                                  <span className="block truncate text-sm font-bold tabular-nums text-[var(--text-primary)]">{chatPayment.number}</span>
                                </span>
                                <span className="inline-flex shrink-0 items-center gap-1 text-[length:var(--ts-xs)] font-bold text-[var(--accent)]">
                                  <Copy className="h-3.5 w-3.5" aria-hidden /> Copiar
                                </span>
                              </button>
                            )}
                            {chatPayment.note && (
                              <p className="border-t border-[var(--rule-soft)] px-3 py-1.5 text-[length:var(--ts-xs)] text-[var(--text-secondary)]">{chatPayment.note}</p>
                            )}
                            {!mine && (
                              respondedSubs.has(m.id) ? (
                                <p className="border-t border-[var(--rule-soft)] py-2 text-center text-[length:var(--ts-xs)] font-bold text-[var(--text-tertiary)]">
                                  Marcado como pagado ✓
                                </p>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); void markPaid(m.id, chatPayment); }}
                                  className="flex w-full items-center justify-center gap-1.5 border-t border-[var(--rule-soft)] bg-[var(--accent)] py-2.5 text-sm font-bold text-white transition-[filter] hover:brightness-110"
                                >
                                  <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden /> Ya pagué
                                </button>
                              )
                            )}
                          </div>
                        )}
                        {/* Pedido de reseña post-entrega (Tanda 4) */}
                        {reviewReq && (
                          <div className={cn(
                            "m-2 overflow-hidden rounded-xl border bg-[var(--surface-canvas)]",
                            mine ? "border-white/30" : "border-[var(--rule-base)]",
                          )}>
                            <div className="flex flex-col items-center gap-1 px-3 pt-3">
                              <div className="flex items-center gap-0.5">
                                {[0, 1, 2, 3, 4].map((i) => (
                                  <Star key={i} className="h-5 w-5 fill-[var(--data-warning-500)] text-[var(--data-warning-500)]" aria-hidden />
                                ))}
                              </div>
                              <p className="text-center text-sm font-bold text-[var(--text-primary)]">
                                ¿Cómo estuvo tu pedido?
                              </p>
                              <p className="text-center text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
                                Tu opinión ayuda a {reviewReq.storeName ?? storeName}
                              </p>
                            </div>
                            {!mine && (
                              <Link
                                href={`/marketplace/${reviewReq.storeSlug}#store-reviews-heading`}
                                onClick={(e) => e.stopPropagation()}
                                className="mt-2 flex w-full items-center justify-center gap-1.5 border-t border-[var(--rule-soft)] bg-[var(--accent)] py-2.5 text-sm font-bold text-white transition-[filter] hover:brightness-110"
                              >
                                <Star className="h-4 w-4 fill-white" strokeWidth={2} aria-hidden /> Dejar mi reseña
                              </Link>
                            )}
                          </div>
                        )}
                        {/* Tarjeta de pedido — order_link del checkout */}
                        {isOrder && (
                          <div className={cn(
                            "flex items-center gap-2 rounded-t-2xl px-3 py-2",
                            mine ? "bg-white/15" : "bg-[var(--accent-soft)]",
                          )}>
                            <ReceiptText
                              className={cn("h-4 w-4 shrink-0", mine ? "text-white" : "text-[var(--accent)]")}
                              strokeWidth={2.25}
                              aria-hidden
                            />
                            <span className={cn(
                              "text-[length:var(--ts-2xs)] font-black uppercase tracking-wider",
                              mine ? "text-white" : "text-[var(--accent)]",
                            )}>
                              Pedido enviado a la tienda
                            </span>
                          </div>
                        )}
                        <div className="px-3 py-2">
                          {/* Bot AI-first (Tanda 3) — honestidad: el cliente sabe que es automático */}
                          {meta.autoReply && !mine && (
                            <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-black uppercase tracking-wide text-[var(--accent)]">
                              <Bot className="h-3 w-3" aria-hidden /> Asistente
                            </span>
                          )}
                          {/* Comprobante/foto en el hilo (Tanda 4) */}
                          {m.messageType === "image" && m.attachmentUrl && (
                            <a
                              href={m.attachmentUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="mb-1 block overflow-hidden rounded-xl"
                            >
                              <Image
                                src={m.attachmentUrl}
                                alt="Comprobante adjunto"
                                width={240}
                                height={240}
                                className="h-auto max-h-64 w-full max-w-[240px] object-cover"
                              />
                            </a>
                          )}
                          {/* Ubicación compartida (Tanda 4) — mini-mapa + Maps */}
                          {location && tile && (
                            <a
                              href={googleMapsUrl(location.lat, location.lng)}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="mb-1 block overflow-hidden rounded-xl border border-[var(--rule-base)]"
                            >
                              <span className="relative block h-28 w-full max-w-[240px] overflow-hidden bg-[var(--surface-sunken)]">
                                <Image src={tile.url} alt="Mapa de la ubicación" fill sizes="240px" className="object-cover" unoptimized />
                                <MapPin
                                  className="absolute h-7 w-7 -translate-x-1/2 -translate-y-full text-[var(--data-error-500)] drop-shadow-md"
                                  style={{ left: `${tile.pinXPct}%`, top: `${tile.pinYPct}%` }}
                                  strokeWidth={2.5}
                                  aria-hidden
                                />
                              </span>
                              <span className="flex items-center justify-between gap-2 px-2.5 py-1.5">
                                <span className="truncate text-[length:var(--ts-xs)] font-bold text-[var(--text-primary)]">
                                  {location.label ?? "Ubicación compartida"}
                                </span>
                                <span className="shrink-0 text-[length:var(--ts-2xs)] font-black uppercase tracking-wide text-[var(--accent)]">
                                  Abrir en Maps →
                                </span>
                              </span>
                            </a>
                          )}
                          {/* Nota de voz (Tanda 4) */}
                          {voice && (
                            <div className="min-w-[180px] max-w-[240px]">
                              <VoiceNotePlayer
                                url={voice.url}
                                durationSec={voice.durationSec}
                                seed={m.id}
                                variant={mine ? "onAccent" : "onSurface"}
                              />
                            </div>
                          )}
                          {!chatOrder && !chatPayment && !location && !reviewReq && !voice && m.messageType !== "image" && (
                            <p className="whitespace-pre-wrap break-words text-sm font-medium leading-snug">
                              {m.body}
                            </p>
                          )}
                          <p
                            className={cn(
                              "mt-0.5 flex items-center justify-end gap-1 text-[length:var(--ts-2xs)] font-bold tabular-nums",
                              mine ? "text-white/75" : "text-[var(--text-tertiary)]",
                            )}
                          >
                            {hhmm(m.createdAt)}
                            {/* ✓ enviado · ✓✓ leído por la tienda (estilo WhatsApp) */}
                            {mine && (
                              m.readBySellerAt ? (
                                <CheckCheck
                                  className="h-3.5 w-3.5 text-white"
                                  strokeWidth={3}
                                  aria-label="Leído por la tienda"
                                />
                              ) : (
                                <Check
                                  className="h-3 w-3"
                                  strokeWidth={3}
                                  aria-label="Enviado"
                                />
                              )
                            )}
                          </p>
                        </div>
                      </div>

                      {/* Barra de acciones — reaccionar (emojis) + responder */}
                      {active && (
                        <div className="z-10 mt-1 flex items-center gap-0.5 rounded-full border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-1.5 py-1 shadow-md">
                          {REACTION_EMOJIS.map((e) => (
                            <button
                              key={e}
                              type="button"
                              onClick={() => void react(m.id, e)}
                              aria-label={`Reaccionar ${e}`}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-base transition-transform hover:scale-125 active:scale-95"
                            >
                              {e}
                            </button>
                          ))}
                          <span className="mx-0.5 h-5 w-px bg-[var(--rule-soft)]" aria-hidden />
                          <button
                            type="button"
                            onClick={() => {
                              setReplyTo({ id: m.id, body: m.body.slice(0, 200), senderType: m.senderType, senderName: m.senderName });
                              setActiveMsgId(null);
                            }}
                            aria-label="Responder a este mensaje"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
                          >
                            <Undo2 className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                          </button>
                        </div>
                      )}

                      {/* Reacciones — pills bajo la burbuja. Tap en la propia la quita. */}
                      {meta.reactions.length > 0 && (
                        <div className={cn("mt-0.5 flex flex-wrap gap-1", mine ? "justify-end pr-1" : "justify-start pl-1")}>
                          {meta.reactions.map((r, idx) => (
                            <button
                              key={`${r.by}-${idx}`}
                              type="button"
                              onClick={() => { if (r.by === "buyer") void react(m.id, r.emoji); }}
                              aria-label={`Reacción ${r.emoji}${r.by === "buyer" ? " (tuya, tocá para quitar)" : " de la tienda"}`}
                              className={cn(
                                "inline-flex items-center rounded-full border px-1.5 py-0.5 text-xs leading-none shadow-sm",
                                r.by === "buyer"
                                  ? "border-[var(--accent)]/40 bg-[var(--accent-soft)]"
                                  : "border-[var(--rule-soft)] bg-[var(--surface-raised)]",
                              )}
                            >
                              {r.emoji}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-[var(--rule-soft)] bg-[var(--surface-raised)] p-2.5">
        {unavailable ? (
          <p role="status" className="px-2 py-2 text-center text-sm font-semibold text-[var(--text-tertiary)]">
            Esta conversación ya no está disponible.
          </p>
        ) : (
          <>
            {/* Tira "Respondiendo a…" — cita activa (Tanda 1) */}
            {replyTo && (
              <div className="mb-1.5 flex items-center gap-2 rounded-xl border-l-[3px] border-[var(--accent)] bg-[var(--accent-soft)] px-2.5 py-1.5">
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="text-[length:var(--ts-2xs)] font-black text-[var(--accent)]">
                    Respondiendo a {replyTo.senderType === "buyer" ? "vos" : storeName}
                  </p>
                  <p className="truncate text-[length:var(--ts-xs)] font-medium text-[var(--text-secondary)]">
                    {replyTo.body}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyTo(null)}
                  aria-label="Cancelar respuesta"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
                >
                  <X className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                </button>
              </div>
            )}

            {/* Selector de emoji (Tanda 1) */}
            {emojiOpen && (
              <div className="mb-2 grid grid-cols-8 gap-1 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-2">
                {COMPOSER_EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setText((t) => (t + e).slice(0, 1000))}
                    aria-label={`Insertar ${e}`}
                    className="inline-flex h-9 items-center justify-center rounded-lg text-xl transition-transform hover:scale-110 hover:bg-[var(--surface-sunken)]"
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}

            {error && (
              <p role="alert" className="mb-1.5 px-1 text-sm font-bold text-[var(--data-error-500)]">
                {error}
              </p>
            )}
            {recording ? (
              /* Tanda 4: barra de grabación */
              <div className="flex items-center gap-3 rounded-full border-2 border-[var(--data-error-500)]/40 bg-[var(--surface-canvas)] px-3 py-1.5">
                <button
                  type="button"
                  onClick={() => stopRecording(false)}
                  aria-label="Cancelar grabación"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--data-error-500)]"
                >
                  <Trash2 className="h-5 w-5" aria-hidden />
                </button>
                <span className="flex flex-1 items-center gap-2">
                  <span className="h-3 w-3 shrink-0 animate-pulse rounded-full bg-[var(--data-error-500)]" aria-hidden />
                  <span className="text-sm font-bold tabular-nums text-[var(--text-primary)]">{fmtDuration(recordSecs)}</span>
                  <span className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">Grabando…</span>
                </span>
                <button
                  type="button"
                  onClick={() => stopRecording(true)}
                  aria-label="Enviar nota de voz"
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-md transition-all hover:brightness-110 active:scale-95"
                >
                  <Send className="h-5 w-5" strokeWidth={2.5} aria-hidden />
                </button>
              </div>
            ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEmojiOpen((o) => !o)}
                aria-label="Emojis"
                aria-pressed={emojiOpen}
                className={cn(
                  "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-colors",
                  emojiOpen
                    ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]",
                )}
              >
                <Smile className="h-6 w-6" strokeWidth={2} aria-hidden />
              </button>
              {/* Tanda 4: adjuntar comprobante/foto */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void sendImage(f);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || sending || !threadId}
                aria-label="Adjuntar comprobante o foto"
                title="Adjuntar comprobante o foto"
                className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] disabled:opacity-50"
              >
                {uploading
                  ? <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
                  : <Paperclip className="h-6 w-6" strokeWidth={2} aria-hidden />}
              </button>
              {/* Tanda 4: compartir ubicación */}
              <button
                type="button"
                onClick={shareLocation}
                disabled={locating || sending || !threadId}
                aria-label="Compartir mi ubicación"
                title="Compartir mi ubicación"
                className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] disabled:opacity-50"
              >
                {locating
                  ? <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
                  : <MapPin className="h-6 w-6" strokeWidth={2} aria-hidden />}
              </button>
              <input
                type="text"
                value={text}
                onChange={(e) => { setText(e.target.value.slice(0, 1000)); if (error) setError(null); pingTyping(); }}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
                placeholder={`Escribile a ${storeName}…`}
                aria-label={`Mensaje para ${storeName}`}
                className="block h-12 min-w-0 flex-1 rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-4 text-sm font-medium text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
              />
              {text.trim() ? (
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={sending}
                  aria-label="Enviar mensaje"
                  className={cn(
                    "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-all active:scale-95",
                    !sending
                      ? "bg-[var(--accent)] text-white shadow-md hover:brightness-110"
                      : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] cursor-not-allowed",
                  )}
                >
                  {sending
                    ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                    : <Send className="h-5 w-5" strokeWidth={2.5} aria-hidden />}
                </button>
              ) : (
                /* Tanda 4: nota de voz — botón micrófono cuando no hay texto */
                <button
                  type="button"
                  onClick={() => void startRecording()}
                  disabled={sendingVoice || !threadId}
                  aria-label="Grabar nota de voz"
                  title="Grabar nota de voz"
                  className={cn(
                    "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-all active:scale-95",
                    "bg-[var(--accent)] text-white shadow-md hover:brightness-110 disabled:opacity-50",
                  )}
                >
                  {sendingVoice
                    ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                    : <Mic className="h-5 w-5" strokeWidth={2.25} aria-hidden />}
                </button>
              )}
            </div>
          )}
          </>
        )}
      </div>
    </div>
  );
}
