"use client";

/** «⌘K» en Mac, «Ctrl+K» en Windows y Linux: el contenido de un `<kbd>` de atajo (H12/M05). */
import { useTeclaMod } from "@/hooks/use-tecla-mod";

export function AtajoMod({ tecla, claseSimbolo }: { tecla: string; claseSimbolo?: string }) {
  const mod = useTeclaMod();
  if (mod === "⌘") {
    return (
      <>
        <span className={claseSimbolo}>⌘</span>
        {tecla}
      </>
    );
  }
  return <>Ctrl+{tecla}</>;
}
