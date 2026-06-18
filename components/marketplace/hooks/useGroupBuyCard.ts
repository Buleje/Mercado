"use client";

/**
 * useGroupBuyCard — estado e interacciones de la card de La Junta del Barrio.
 *
 * Aísla la lógica del componente (presentación) para mantenerlo por debajo del
 * límite de ~300 LOC. Cubre: cuenta regresiva en vivo, refresco del contador al
 * volver a la pestaña (con flash "+1 vecino"), unirse, comprar para la junta y
 * compartir (nativo → WhatsApp/copiar como fallback).
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { JUNTA_COUPON_PERCENT } from "@/lib/junta/constants";
import { setActiveJunta } from "@/lib/junta/active";
import { formatCountdown, countdownParts } from "@/lib/junta/countdown";
import { formatRelativeTime } from "@/lib/junta/relative";
import { csrfHeaders } from "@/lib/csrf-client";

type JuntaStatus = "OPEN" | "COMPLETE" | "EXPIRED";

interface Args {
  code: string;
  productLabel?: string;
  initialCount: number;
  target: number;
  initialStatus: JuntaStatus;
  windowEnd?: string;
  couponCode?: string;
  initialLastJoinedAt?: string;
}

export function useGroupBuyCard({
  code,
  productLabel,
  initialCount,
  target,
  initialStatus,
  windowEnd,
  couponCode,
  initialLastJoinedAt,
}: Args) {
  const [count, setCount] = useState(initialCount);
  const [status, setStatus] = useState<JuntaStatus>(initialStatus);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [couponCopied, setCouponCopied] = useState(false);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [bumped, setBumped] = useState(false);
  // Invitado sin sesión: revela el campo de WhatsApp si el server lo pide.
  const [needsPhone, setNeedsPhone] = useState(false);
  const [guestPhone, setGuestPhone] = useState("");
  // Prueba social en vivo: "se sumó un vecino hace X".
  const [lastJoinedAt, setLastJoinedAt] = useState(initialLastJoinedAt);
  const [lastJoinedLabel, setLastJoinedLabel] = useState<string | null>(null);
  const [pageUrl, setPageUrl] = useState("");
  const countRef = useRef(initialCount);
  const router = useRouter();

  const remaining = Math.max(0, target - count);
  const progress = Math.min(100, Math.round((count / target) * 100));
  const isComplete = status === "COMPLETE" || count >= target;
  const isExpired = status === "EXPIRED";

  useEffect(() => {
    countRef.current = count;
  }, [count]);

  // Cuenta regresiva en vivo. Estado inicial null (calculado post-mount) para
  // evitar mismatch de hidratación con el reloj del servidor.
  useEffect(() => {
    if (!windowEnd) return;
    const end = new Date(windowEnd).getTime();
    if (!Number.isFinite(end)) return;
    const tick = () => setRemainingMs(end - Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [windowEnd]);

  // Refresca el progreso cuando el vecino vuelve a la pestaña (tras compartir).
  // Si el contador creció, dispara un flash "+1 vecino".
  useEffect(() => {
    function refresh() {
      if (document.visibilityState !== "visible") return;
      fetch(`/api/juntas/${code}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          const next = data?.junta?.memberCount;
          if (typeof next !== "number") return;
          if (next > countRef.current) {
            setBumped(true);
            window.setTimeout(() => setBumped(false), 2500);
          }
          setCount(next);
          if (data.junta.status) setStatus(data.junta.status);
          if (data.junta.lastJoinedAt) setLastJoinedAt(data.junta.lastJoinedAt);
        })
        .catch((err) => console.warn("[junta] refresh falló", err));
    }
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, [code]);

  // URL absoluta para compartir/QR (solo disponible client-side).
  useEffect(() => {
    setPageUrl(`${window.location.origin}/junta/${code}`);
  }, [code]);

  // Refresca la etiqueta "hace X" del último vecino cada 30 s.
  useEffect(() => {
    if (!lastJoinedAt) {
      setLastJoinedLabel(null);
      return;
    }
    const update = () =>
      setLastJoinedLabel(formatRelativeTime(lastJoinedAt, Date.now()));
    update();
    const id = window.setInterval(update, 30_000);
    return () => window.clearInterval(id);
  }, [lastJoinedAt]);

  const liveCountdown = remainingMs !== null && !isComplete && !isExpired;
  const countdownLabel = liveCountdown ? formatCountdown(remainingMs) : null;
  const countdownTimer = liveCountdown ? countdownParts(remainingMs) : null;

  const shareUrl = useCallback(() => {
    if (typeof window === "undefined") return `/junta/${code}`;
    return `${window.location.origin}/junta/${code}`;
  }, [code]);

  const handleShopForJunta = useCallback(() => {
    setActiveJunta(code);
    router.push("/");
  }, [code, router]);

  // Junta vencida: arrancar una nueva sin atar la compra a la junta cerrada.
  const handleStartNew = useCallback(() => {
    router.push("/");
  }, [router]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("No se pudo copiar el link");
    }
  }, [shareUrl]);

  const handleCopyCoupon = useCallback(async () => {
    if (!couponCode) return;
    try {
      await navigator.clipboard.writeText(couponCode);
      setCouponCopied(true);
      setTimeout(() => setCouponCopied(false), 2000);
    } catch {
      setError("No se pudo copiar el cupón");
    }
  }, [couponCode]);

  const inviteText = useCallback(
    () =>
      `Vecinos, armé una junta en Buleje${productLabel ? ` para ${productLabel}` : ""}. ` +
      `Si juntamos ${target} de la cuadra, todos llevamos ${JUNTA_COUPON_PERCENT}% off. ` +
      `Faltan ${remaining} — súmate:`,
    [productLabel, target, remaining],
  );

  const handleWhatsApp = useCallback(() => {
    const msg = encodeURIComponent(`${inviteText()} ${shareUrl()}`);
    window.open(`https://wa.me/?text=${msg}`, "_blank", "noopener,noreferrer");
  }, [inviteText, shareUrl]);

  const handleNativeShare = useCallback(async () => {
    const url = shareUrl();
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: "La Junta del Barrio",
          text: inviteText(),
          url,
        });
        return;
      } catch (err) {
        // El usuario canceló el diálogo nativo: no es un error real.
        if ((err as Error)?.name === "AbortError") return;
      }
    }
    await handleCopy(); // sin share nativo → copiamos el link
  }, [shareUrl, inviteText, handleCopy]);

  const handleJoin = useCallback(async () => {
    setJoining(true);
    setError("");
    try {
      const phone = guestPhone.trim();
      const hasPhone = phone.length > 0;
      // El header CSRF es obligatorio en POST (proxy.ts) — sin él el server
      // responde 403. Mandamos el body solo cuando el invitado escribió su número.
      const res = await fetch(`/api/juntas/${code}/join`, {
        method: "POST",
        headers: hasPhone
          ? csrfHeaders({ "Content-Type": "application/json" })
          : csrfHeaders(),
        ...(hasPhone && { body: JSON.stringify({ phone }) }),
      });
      const data = await res.json().catch((err) => {
        console.warn("[junta] join: respuesta no-JSON", err);
        return null;
      });
      // 400 sin teléfono propio → el server pide el WhatsApp del invitado:
      // revelamos el campo en vez de mostrarlo como error.
      if (res.status === 400 && !hasPhone) {
        setNeedsPhone(true);
        return;
      }
      if (!res.ok) {
        setError(data?.error ?? "No te pudiste unir");
        return;
      }
      setJoined(true);
      setNeedsPhone(false);
      if (data?.junta) {
        setCount((c) => data.junta.memberCount ?? c);
        setStatus((s) => data.junta.status ?? s);
        if (data.junta.lastJoinedAt) setLastJoinedAt(data.junta.lastJoinedAt);
      }
    } catch {
      setError("Error de red al unirte");
    } finally {
      setJoining(false);
    }
  }, [code, guestPhone]);

  // "Solo falta 1" — momento de máxima urgencia para empujar el último share.
  const almostThere = remaining === 1 && !isComplete && !isExpired;

  return {
    count,
    remaining,
    progress,
    isComplete,
    isExpired,
    almostThere,
    countdownLabel,
    countdownTimer,
    bumped,
    joining,
    joined,
    error,
    copied,
    couponCopied,
    needsPhone,
    guestPhone,
    setGuestPhone,
    lastJoinedLabel,
    pageUrl,
    handleShopForJunta,
    handleStartNew,
    handleCopy,
    handleCopyCoupon,
    handleWhatsApp,
    handleNativeShare,
    handleJoin,
  };
}
