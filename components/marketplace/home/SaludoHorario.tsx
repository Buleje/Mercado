"use client";

/**
 * SaludoHorario — franja de saludo dinámico según hora local.
 *
 * Franjas:
 *   00–05  Buenas noches    Moon
 *   06–11  Buenos días · ¿Desayuno?   Sunrise
 *   12–18  Buenas tardes · ¿Almuerzo?  Sun
 *   19–23  Buenas noches · ¿Cena?     Sunset
 *
 * Usa useEffect para leer getHours() en cliente y evitar hydration mismatch.
 * Se renderiza nulo en SSR (sin skeleton — la franja es sutil y no reserva espacio).
 */

import { useEffect, useState } from "react";
import { Moon, Sunrise, Sun, Sunset } from "@buleje/design-system/icons";

type Franja = {
  label: string;
  Icon: React.ElementType;
};

function getFragja(hour: number): Franja {
  if (hour >= 0 && hour <= 5) {
    return { label: "Buenas noches", Icon: Moon };
  }
  if (hour >= 6 && hour <= 11) {
    return { label: "Buenos días · ¿Desayuno?", Icon: Sunrise };
  }
  if (hour >= 12 && hour <= 18) {
    return { label: "Buenas tardes · ¿Almuerzo?", Icon: Sun };
  }
  return { label: "Buenas noches · ¿Cena?", Icon: Sunset };
}

export default function SaludoHorario() {
  const [franja, setFragja] = useState<Franja | null>(null);

  useEffect(() => {
    setFragja(getFragja(new Date().getHours()));
  }, []);

  if (!franja) return null;

  const { label, Icon } = franja;

  return (
    <div className="mx-auto max-w-[1600px] px-3 sm:px-4 lg:px-6 pt-3 sm:pt-4">
      <p className="flex items-center gap-1.5 text-sm font-medium text-[var(--text-secondary)]">
        <Icon
          className="h-4 w-4 shrink-0 text-[var(--accent)]"
          strokeWidth={1.75}
          aria-hidden
        />
        {label}
      </p>
    </div>
  );
}
