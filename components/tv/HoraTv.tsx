"use client";

/** La hora que corre, sola: un `setInterval` por reloj y sólo re-dibuja su texto. */

import { useEffect, useState } from "react";
import { formatTime } from "@/lib/format";

export default function HoraTv({ segundos = false, className }: { segundos?: boolean; className?: string }) {
  const [ahora, setAhora] = useState<number | null>(null);
  useEffect(() => {
    setAhora(Date.now());
    const id = setInterval(() => setAhora(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className={className} suppressHydrationWarning>
      {ahora === null ? "" : formatTime(ahora, { segundos })}
    </span>
  );
}
