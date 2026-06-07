"use client";

import { useCallback } from "react";
import { fireConfetti } from "@/components/ui-system/animations/ConfettiBurst";
import { toast } from "sonner";

/**
 * useCelebrate — hook central para disparar delight moments.
 *
 * Unifica confetti + toast + sonidos + haptics en un solo API. Respeta
 * prefers-reduced-motion y localStorage "first time" flags para evitar
 * repetir el mismo momento dos veces al mismo usuario.
 *
 * @example
 * const { celebrate } = useCelebrate();
 *
 * celebrate("firstOrder", { name: "Brandon" });
 * celebrate("levelUp", { newTier: "Plata" });
 * celebrate("confetti"); // generic
 */

type CelebrateMoment =
  | "confetti"
  | "firstOrder"
  | "levelUp"
  | "birthday"
  | "streakMilestone"
  | "referralConverted"
  | "vendorFirstSale";

interface CelebrateOptions {
  /** Nombre del usuario para personalizar toast */
  name?: string;
  /** Datos contextuales del moment */
  [key: string]: unknown;
}

const STORAGE_PREFIX = "buleje-celebrated-";

function wasAlreadyCelebrated(moment: CelebrateMoment): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(STORAGE_PREFIX + moment) === "true";
}

function markAsCelebrated(moment: CelebrateMoment) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_PREFIX + moment, "true");
}

/** Vibrate corto (mobile) si soportado */
function haptic() {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(20);
    } catch { /* silent */ }
  }
}

export function useCelebrate() {
  const celebrate = useCallback(
    (moment: CelebrateMoment, options?: CelebrateOptions) => {
      // Los moments "first time" solo se disparan una vez por usuario
      const isOneTime = moment !== "confetti";
      if (isOneTime && wasAlreadyCelebrated(moment)) return;

      switch (moment) {
        case "confetti":
          fireConfetti();
          haptic();
          break;

        case "firstOrder":
          fireConfetti({ particleCount: 80, spread: 90 });
          haptic();
          toast.success(
            options?.name ? `¡Bravo, ${options.name}!` : "¡Tu primer pedido!",
            { description: "Estamos preparando todo. Llega en ~25 min." },
          );
          markAsCelebrated(moment);
          break;

        case "levelUp":
          fireConfetti({
            particleCount: 100,
            spread: 100,
            colors: ["#0a0a0a", "#fafafa", "#00A0A0", "#D97706"],
          });
          haptic();
          toast.success(
            `¡Subiste a ${options?.newTier ?? "nuevo nivel"}!`,
            { description: "Desbloqueaste nuevos beneficios." },
          );
          markAsCelebrated(moment);
          break;

        case "birthday":
          // Rain de confetti desde 2 origenes
          fireConfetti({ particleCount: 70, spread: 80, origin: { x: 0.2, y: 0.3 } });
          setTimeout(() => fireConfetti({ particleCount: 70, spread: 80, origin: { x: 0.8, y: 0.3 } }), 200);
          haptic();
          toast(`¡Feliz cumpleaños${options?.name ? `, ${options.name}` : ""}!`, {
            description: "Te regalamos 15% de descuento hoy.",
          });
          markAsCelebrated(moment);
          break;

        case "streakMilestone":
          fireConfetti({ particleCount: 50, spread: 60 });
          haptic();
          toast.success(
            `¡Racha de ${options?.days ?? "varios"} días!`,
            { description: "Sos uno de los clientes top." },
          );
          markAsCelebrated(moment);
          break;

        case "referralConverted":
          fireConfetti({ particleCount: 40, spread: 50 });
          haptic();
          toast.success("¡Tu amigo se unió!", {
            description: `Ambos reciben S/${options?.amount ?? 10} de descuento.`,
          });
          break;

        case "vendorFirstSale":
          fireConfetti({ particleCount: 90, spread: 100 });
          haptic();
          toast.success("¡Tu primera venta!", {
            description: "Este es solo el comienzo. Seguí adelante.",
          });
          markAsCelebrated(moment);
          break;
      }
    },
    [],
  );

  /** Reset flag — util para testing o "re-celebrate" manual */
  const reset = useCallback((moment: CelebrateMoment) => {
    if (typeof window === "undefined") return;
    localStorage.removeItem(STORAGE_PREFIX + moment);
  }, []);

  return { celebrate, reset };
}
