"use client";

/**
 * Resumen del cliente al crear un fiado (Mejora M1): historial, deuda actual,
 * su límite REAL de crédito y si está bloqueado. Salió de FiadosModule.
 */
import { useEffect, useState } from "react";
import { sinDato } from "@/lib/errores/sin-dato";
import { computeReliabilityScore } from "@/lib/fiados/reliability";
import type { Fiado } from "./tipos";

export type ClienteResumen = {
  nombre: string; score: number; pagados: number; total: number;
  deudaActual: number; limite: number; promedioDias: number;
  bloqueado: boolean;
};

export function useClienteResumen(customerId: string, abierto: boolean, fiados: Fiado[]) {
  const [clienteResumen, setClienteResumen] = useState<ClienteResumen | null>(null);
  const [clienteResumenLoading, setClienteResumenLoading] = useState(false);
  const [clienteEsNuevo, setClienteEsNuevo] = useState(false);

  useEffect(() => {
    const cid = customerId.trim();
    if (cid.length < 6 || !abierto) {
      setClienteResumen(null);
      setClienteEsNuevo(false);
      return;
    }
    const timer = setTimeout(async () => {
      setClienteResumenLoading(true);
      try {
        // Buscar fiados del cliente en los datos ya cargados
        const clientFiados = fiados.filter(f => f.customerId === cid);
        if (clientFiados.length === 0) {
          // Audit 2026-08-26: acá había un fetch a /api/customers/[cid] cuyo
          // resultado (res.ok) nunca se usaba — las dos ramas del if/else
          // hacían exactamente lo mismo. Sólo agregaba un round-trip de red
          // que retrasaba el aviso "Cliente nuevo" sin aportar nada.
          setClienteEsNuevo(true);
          setClienteResumen(null);
        } else {
          setClienteEsNuevo(false);
          const score = computeReliabilityScore(clientFiados);
          const activos = clientFiados.filter(f => f.status === "ACTIVO" || f.status === "VENCIDO");
          const deudaActual = activos.reduce((s, f) => s + f.saldo, 0);
          const pagados = clientFiados.filter(f => f.status === "PAGADO").length;
          const nombre = clientFiados[0]?.customerName || cid;
          // Brandon 2026-06-17: límite REAL del Customer (antes hardcoded 500).
          // creditLimit 0 = sin tope configurado → la UI lo muestra como "Sin tope".
          let limite = 0;
          try {
            const cRes = await fetch(`/api/customers/${encodeURIComponent(cid)}`).catch(sinDato("fiados límite del cliente"));
            if (cRes && cRes.ok) {
              const cData = await cRes.json();
              limite = Number(cData?.creditLimit ?? 0) || 0;
            }
          } catch {
            /* fallback limite=0 = sin tope; el lookup es best-effort */
          }
          // Detectar bloqueo: algun fiado vencido > 60 dias
          const now = new Date();
          now.setHours(0, 0, 0, 0);
          const bloqueado = activos.some(f => {
            if (!f.fechaVence) return false;
            const vence = new Date(f.fechaVence);
            return vence.getTime() < now.getTime() - 60 * 24 * 60 * 60 * 1000;
          });
          setClienteResumen({
            nombre,
            score: score.score,
            pagados,
            total: clientFiados.length,
            deudaActual,
            limite,
            promedioDias: Math.round(score.diasPromedioPago),
            bloqueado,
          });
        }
      } catch (err) {
        // Audit 2026-05-17 P2-4: antes silent; ahora console.warn para que el
        // dueño no tenga el log en blanco si el customer-resumen falla en prod.
        // El fallback (cliente nuevo) es intencional cuando no existe historial.
        console.warn("[FiadosModule] cliente-resumen lookup failed, treating as nuevo", err);
        setClienteResumen(null);
        setClienteEsNuevo(true);
      } finally {
        setClienteResumenLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [customerId, abierto, fiados]);

  return { clienteResumen, clienteResumenLoading, clienteEsNuevo };
}
