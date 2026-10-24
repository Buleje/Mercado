"use client";

import { useEffect, useState } from "react";
import { Clock } from "@buleje/design-system/icons";
import { fmt, fmtSigno } from "./arqueo-shared";

type TurnoCerrado = {
  id: string;
  cajeroNombre?: string | null;
  esperado?: number | null;
  cierreEfectivo?: number | null;
  diferencia?: number | null;
  /** El cron guarda el esperado como cierre del turno olvidado: no es un conteo. */
  cerradoPorSistema?: boolean;
};

const SIN_DATO = "sin dato";

/**
 * «Viene del turno de …»: cuando Turnos manda a Cuadrar caja con `?turno=<id>`,
 * una línea con lo que ese turno esperaba, contó y le faltó/sobró. El parámetro
 * se borra solo al salir de la vista (`paramsDeVista` del hub).
 */
export default function DesdeTurno() {
  // El id se lee una vez: aunque la URL se limpie, la línea sigue mientras estés en la vista.
  const [turnoId] = useState(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("turno")));
  const [turno, setTurno] = useState<TurnoCerrado | null>(null);

  useEffect(() => {
    if (!turnoId) return;
    let cancelado = false;
    fetch("/api/turnos?status=CERRADO")
      .then((r) => (r.ok ? r.json() : []))
      .then((lista: TurnoCerrado[]) => { if (!cancelado) setTurno(lista.find((t) => t.id === turnoId) ?? null); })
      .catch((err) => console.warn("[DesdeTurno] turnos cerrados", err));
    return () => { cancelado = true; };
  }, [turnoId]);

  if (!turno) return null;
  const plata = (n: number | null | undefined, signo = false) => (n == null ? SIN_DATO : signo ? fmtSigno(n) : fmt(n));
  return (
    <p role="status" className="flex items-start gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2 text-sm text-[var(--text-secondary)]">
      <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
      <span>
        Viene del turno de <b className="text-[var(--text-primary)]">{turno.cajeroNombre || SIN_DATO}</b>: esperado{" "}
        <b className="tabular-nums text-[var(--text-primary)]">{plata(turno.esperado)}</b>, contado{" "}
        <b className="tabular-nums text-[var(--text-primary)]">{plata(turno.cerradoPorSistema ? null : turno.cierreEfectivo)}</b>, diferencia{" "}
        <b className="tabular-nums text-[var(--text-primary)]">{plata(turno.diferencia, true)}</b>.
      </span>
    </p>
  );
}
