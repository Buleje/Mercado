import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { leerJson } from "@/lib/errores/sin-dato";
import { limaDateKey } from "@/lib/utils";
import { GRUPOS_ENTREGA, claveDeDia, diaCorto, esperaEntrega, grupoDeEntrega, type GrupoEntrega } from "@/lib/compras/ciclo-oc";
import type { OrdenOC } from "@/components/admin/ordenes-compra/oc-compartido";

export type GrupoDeEntregas = { id: GrupoEntrega; rotulo: string; ordenes: OrdenOC[] };

/** Prometida más vieja primero; sin fecha, la pedida antes primero. */
const porFecha = (a: OrdenOC, b: OrdenOC) =>
  (claveDeDia(a.deliveryDate) ?? "").localeCompare(claveDeDia(b.deliveryDate) ?? "") || a.createdAt.localeCompare(b.createdAt);

/**
 * C14 · Las órdenes que esperan mercadería agrupadas por cuándo llegan
 * (atrasadas, hoy, 7 días, más adelante, sin fecha). Cambiar la fecha
 * prometida deja rastro en el servidor y NO toca stock ni estado: la orden se
 * da por recibida sólo con «Recibir».
 */
export function useEntregasOc() {
  const [ordenes, setOrdenes] = useState<OrdenOC[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [recibiendo, setRecibiendo] = useState<OrdenOC | null>(null);
  const [guardandoFecha, setGuardandoFecha] = useState<string | null>(null);
  // Una carga que salió antes de cambiar una fecha traería la fecha vieja: se descarta.
  const ultima = useRef(0);

  const cargar = useCallback(async (silenciosa?: boolean) => {
    const esta = ++ultima.current;
    if (!silenciosa) setCargando(true);
    try {
      const res = await fetch("/api/purchases?seguimiento=1");
      if (esta !== ultima.current) return;
      if (!res.ok) {
        setError(`No se pudieron traer las órdenes (error ${res.status}).`);
        return;
      }
      const d: unknown = await res.json();
      if (esta !== ultima.current) return;
      const lista = Array.isArray(d) ? d : (d as { purchases?: unknown } | null)?.purchases;
      setOrdenes(Array.isArray(lista) ? (lista as OrdenOC[]) : []);
      setError(null);
    } catch {
      if (esta === ultima.current) setError("Sin conexión con el servidor: no se pudieron traer las órdenes.");
    } finally {
      if (esta === ultima.current) setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const hoy = limaDateKey();
  const grupos = useMemo<GrupoDeEntregas[]>(() => {
    const porGrupo = new Map<GrupoEntrega, OrdenOC[]>();
    for (const o of ordenes) {
      if (!esperaEntrega(o.status)) continue;
      const g = grupoDeEntrega(o.deliveryDate, hoy);
      porGrupo.set(g, [...(porGrupo.get(g) ?? []), o]);
    }
    return GRUPOS_ENTREGA.map((g) => ({ ...g, ordenes: (porGrupo.get(g.id) ?? []).sort(porFecha) })).filter((g) => g.ordenes.length > 0);
  }, [ordenes, hoy]);

  const cambiarFecha = useCallback(async (o: OrdenOC, fecha: string): Promise<boolean> => {
    setGuardandoFecha(o.id);
    setError(null);
    setAviso(null);
    try {
      const res = await fetch(`/api/purchases/${o.id}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ deliveryDate: fecha }),
      });
      if (!res.ok) {
        const d = await leerJson<{ error?: unknown }>(res);
        setError(typeof d?.error === "string" ? d.error : `No se cambió la fecha (error ${res.status}).`);
        return false;
      }
      ultima.current++;
      setCargando(false);
      setOrdenes((prev) => prev.map((x) => (x.id === o.id ? { ...x, deliveryDate: fecha || undefined } : x)));
      setAviso(fecha ? `${o.supplierName}: ahora llega el ${diaCorto(fecha)}.` : `${o.supplierName}: quedó sin fecha prometida.`);
      return true;
    } catch {
      setError("Sin conexión con el servidor: la fecha no se cambió.");
      return false;
    } finally {
      setGuardandoFecha(null);
    }
  }, []);

  const alRecibir = useCallback(() => {
    setRecibiendo(null);
    void cargar(true);
  }, [cargar]);

  return { cargando, error, aviso, setAviso, grupos, hoy, recibiendo, setRecibiendo, alRecibir, cambiarFecha, guardandoFecha, cargar };
}

export type EntregasOc = ReturnType<typeof useEntregasOc>;
