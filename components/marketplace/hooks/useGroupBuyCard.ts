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
import { formatCountdown } from "@/lib/junta/countdown";

type JuntaStatus = "OPEN" | "COMPLETE" | "EXPIRED";

interface Args {
  code: string;
  productLabel?: string;
  initialCount: number;
  target: number;
  initialStatus: JuntaStatus;
  windowEnd?: string;
  couponCode?: string;
}

export function useGroupBuyCard({
  code,
  productLabel,
  initialCount,
  target,
  initialStatus,
  windowEnd,
  couponCode,
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
        })
        .catch((err) => console.warn("[junta] refresh falló", err));
    }
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, [code]);

  const countdownLabel =
    remainingMs !== null && !isComplete && !isExpired
      ? formatCountdown(remainingMs)
      : null;

  const shareUrl = useCallback(() => {
    if (typeof window === "undefined") return `/junta/${code}`;
    return `${window.location.origin}/junta/${code}`;
  }, [code]);

  const handleShopForJunta = useCallback(() => {
    setActiveJunta(code);
    router.push("/");
  }, [code, router]);

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
      const res = await fetch(`/api/juntas/${code}/join`, { method: "POST" });
      const data = await res.json().catch((err) => {
        console.warn("[junta] join: respuesta no-JSON", err);
        return null;
      });
      if (!res.ok) {
        setError(data?.error ?? "No te pudiste unir");
        return;
      }
      setJoined(true);
      if (data?.junta) {
        setCount(data.junta.memberCount ?? count);
        setStatus(data.junta.status ?? status);
      }
    } catch {
      setError("Error de red al unirte");
    } finally {
      setJoining(false);
    }
  }, [code, count, status]);

  return {
    count,
    remaining,
    progress,
    isComplete,
    isExpired,
    countdownLabel,
    bumped,
    joining,
    joined,
    error,
    copied,
    couponCopied,
    handleShopForJunta,
    handleCopy,
    handleCopyCoupon,
    handleWhatsApp,
    handleNativeShare,
    handleJoin,
  };
}
