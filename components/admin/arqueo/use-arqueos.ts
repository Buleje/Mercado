"use client";

import { useCallback, useEffect, useMemo, useRef, useState, startTransition } from "react";
import { resumirArqueos, type ArqueoEstado } from "@/lib/caja/arqueo-veredicto";
import { mapRegisterToAudit, type CashAudit, type CashRegisterRaw, type QuienPorCaja } from "./arqueo-shared";

type EntradaHistorial = { action: string; entity: string; entityId: string | null; user: string; createdAt: string };

/**
 * Datos de «Cuadrar caja»: las cajas (`/api/cash-registers`, con sus
 * movimientos) y quién abrió y cerró cada una (`/api/cash-registers/historial`).
 *
 * Antes la columna «Cajero/a» salía de `notes.split(" (")[0]`: el cierre pisa
 * la nota, así que mostraba «Cierre automático del sistema» o lo que se haya
 * escrito al cerrar. El registro de auditoría sí guarda quién abrió la caja.
 */
export function useArqueos() {
  const [rawRegisters, setRawRegisters] = useState<CashRegisterRaw[]>([]);
  const [quien, setQuien] = useState<QuienPorCaja>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inflightRef = useRef<AbortController | null>(null);

  const reload = useCallback(() => {
    inflightRef.current?.abort();
    const ctrl = new AbortController();
    inflightRef.current = ctrl;
    startTransition(() => { setLoading(true); setError(null); });

    const cajas = fetch("/api/cash-registers", { signal: ctrl.signal }).then(async (r) => {
      if (!r.ok) throw new Error(r.status === 403 ? "No tienes permiso para ver las cajas." : `No se pudieron cargar las cajas (error ${r.status}).`);
      const data: unknown = await r.json();
      return Array.isArray(data) ? (data as CashRegisterRaw[]) : [];
    });
    // El historial y los nombres son un extra: si fallan, la tabla sale igual.
    // Se pide el de LAS cajas de la tabla (las 200 más nuevas: el servidor las
    // manda de la más nueva a la más vieja), sólo aperturas y cierres. Con las
    // «últimas 200 filas» de todo el rastro, los ingresos/egresos manuales
    // empujaban fuera a las cajas viejas y quedaban sin «quién abrió».
    const historial = cajas
      .then(
        (registers) => {
          const ids = registers.slice(0, 200).map((r) => r.id).filter(Boolean);
          if (ids.length === 0) return [] as EntradaHistorial[];
          const qs = new URLSearchParams({ entity: "caja", registerIds: ids.join(",") });
          return fetch(`/api/cash-registers/historial?${qs.toString()}`, { signal: ctrl.signal })
            .then((r) => (r.ok ? r.json() : { entries: [] }))
            .then((d: { entries?: EntradaHistorial[] }) => d.entries ?? []);
        },
        // Si las cajas fallan, el error lo muestra `Promise.all`: acá no se repite.
        () => [] as EntradaHistorial[],
      )
      .catch((err) => { if (!(err instanceof DOMException)) console.warn("[useArqueos] historial", err); return [] as EntradaHistorial[]; });
    const nombres = fetch("/api/admin-users", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : []))
      .then((u: unknown) => (Array.isArray(u) ? (u as { username: string; name?: string }[]) : []))
      .catch((err) => { if (!(err instanceof DOMException)) console.warn("[useArqueos] admin-users", err); return [] as { username: string; name?: string }[]; });

    Promise.all([cajas, historial, nombres])
      .then(([registers, entries, users]) => {
        if (inflightRef.current !== ctrl) return;
        const nombre = new Map(users.map((u) => [u.username, u.name || u.username]));
        const q: QuienPorCaja = {};
        // El historial viene del más nuevo al más viejo: el primer «Abrir» y
        // el primer «Cerrar» de cada caja son los que valen.
        for (const e of entries) {
          if (e.entity !== "caja" || !e.entityId) continue;
          const fila = (q[e.entityId] ??= {});
          const quienFue = nombre.get(e.user) ?? e.user;
          if (e.action === "Abrir" && !fila.abrio) fila.abrio = quienFue;
          if (e.action === "Cerrar" && !fila.cerro) fila.cerro = quienFue;
        }
        startTransition(() => {
          setRawRegisters(registers);
          setQuien(q);
          setLoading(false);
        });
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (inflightRef.current !== ctrl) return;
        startTransition(() => {
          setError(err instanceof Error ? err.message : "Sin conexión con el servidor.");
          setLoading(false);
        });
      });
  }, []);

  useEffect(() => {
    reload();
    return () => { inflightRef.current?.abort(); };
  }, [reload]);

  const audits = useMemo<CashAudit[]>(
    () => rawRegisters.map((r) => mapRegisterToAudit(r, quien)).sort((a, b) => b.openedAt.localeCompare(a.openedAt)),
    [rawRegisters, quien],
  );

  /**
   * Los totales salen de `resumirArqueos`: sólo cuentan los arqueos donde
   * alguien contó de verdad (ni los cierres sin conteo ni los imposibles).
   */
  const resumen = useMemo(
    () => resumirArqueos(audits.map((a) => ({ estado: a.status as ArqueoEstado, difference: a.difference }))),
    [audits],
  );

  // Caja ABIERTA para el conteo: el «Esperado» es `efectivoEsperado`, que el
  // backend calcula con la fórmula del cierre.
  const openRegister = useMemo(() => rawRegisters.find((r) => r.status === "abierta") ?? null, [rawRegisters]);
  const openAudit = useMemo(() => audits.find((a) => a.abierta) ?? null, [audits]);
  const openExpectedAmount = openRegister?.efectivoEsperado ?? openRegister?.expectedAmount ?? openRegister?.openingAmount ?? 0;

  return { audits, resumen, loading, error, reload, openRegister, openAudit, openExpectedAmount };
}
