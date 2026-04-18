"use client";

import { useEffect, useState } from "react";

/**
 * usePersonalizedGreeting — saludo dinamico segun hora + nombre del usuario.
 *
 * Devuelve:
 *   "Buenos días Brandon" (5-12)
 *   "Buenas tardes Brandon" (12-19)
 *   "Buenas noches Brandon" (19-5)
 *
 * Si no hay nombre, omite el vocativo.
 *
 * @example
 * const greeting = usePersonalizedGreeting(customer?.name);
 * <h1>{greeting}</h1>
 */

export function usePersonalizedGreeting(name?: string | null): string {
  const [greeting, setGreeting] = useState(() => getGreeting(name));

  useEffect(() => {
    setGreeting(getGreeting(name));

    // Update cada minuto para capturar cambio de tramo horario
    const interval = setInterval(() => {
      setGreeting(getGreeting(name));
    }, 60 * 1000);

    return () => clearInterval(interval);
  }, [name]);

  return greeting;
}

function getGreeting(name?: string | null): string {
  const hour = new Date().getHours();
  let base: string;
  if (hour >= 5 && hour < 12) base = "Buenos días";
  else if (hour >= 12 && hour < 19) base = "Buenas tardes";
  else base = "Buenas noches";

  return name ? `${base}, ${name}` : base;
}

/**
 * getTimeOfDayContext — devuelve "mañana", "tarde", "noche" para UI conditional.
 */
export function getTimeOfDayContext(): "morning" | "afternoon" | "evening" | "night" {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  if (hour >= 18 && hour < 22) return "evening";
  return "night";
}
