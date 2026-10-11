"use client";

/**
 * Datos de Crecimiento › Puntos: la lista de clientes (/api/customers, de a
 * 100), la ficha del elegido (/api/loyalty/[phone]), las cifras del programa
 * (/api/loyalty/metrics, que existía sin pantalla) y las tres escrituras que
 * ya tenía la vista: canjear, notas privadas y código de referido. Mismos
 * endpoints y mismos cuerpos que antes de partir LoyaltyTab.
 */
import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";

export interface ClientePuntos {
  phone: string;
  name: string;
  loyaltyPoints: number;
  loyaltyTier: string;
  totalSpent: number;
  privateNotes?: string | null;
  referralCode?: string | null;
}

export interface NivelPuntos {
  name: string;
  minSpent: number;
  pointsMultiplier?: number;
}

export interface MetricasPuntos {
  totalCustomers: number;
  activeMembers: number;
  totalPointsCirculating: number;
  pointsIssuedLast30d: number;
  pointsRedeemedLast30d: number;
  redeemTransactions: number;
}

const porGasto = (a: ClientePuntos, b: ClientePuntos) => (b.totalSpent ?? 0) - (a.totalSpent ?? 0);

async function pagina(cursor: string | null): Promise<{ data: ClientePuntos[]; cursor: string | null } | null> {
  const res = await fetch(`/api/customers?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
  if (!res.ok) return null;
  const data = ((await res.json()) as ClientePuntos[]).filter((c) => !!c.phone);
  return { data: data.sort(porGasto), cursor: res.headers.get("X-Next-Cursor") };
}

export function usePuntos() {
  const [clientes, setClientes] = useState<ClientePuntos[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [metricas, setMetricas] = useState<MetricasPuntos | null>(null);
  const [elegido, setElegido] = useState<ClientePuntos | null>(null);
  const [niveles, setNiveles] = useState<NivelPuntos[]>([]);

  const cargar = useCallback(async (vivo: () => boolean = () => true) => {
    setLoading(true);
    try {
      const [lista, m] = await Promise.all([
        pagina(null).catch(() => null),
        fetch("/api/loyalty/metrics").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      if (!vivo()) return;
      if (lista) {
        setClientes(lista.data);
        setCursor(lista.cursor);
        setError(false);
      } else {
        setError(true);
      }
      setMetricas((m as { summary?: MetricasPuntos } | null)?.summary ?? null);
    } finally {
      if (vivo()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let vivo = true;
    void cargar(() => vivo);
    return () => { vivo = false; };
  }, [cargar]);

  const cargarMas = async () => {
    if (!cursor || cargandoMas) return;
    setCargandoMas(true);
    try {
      const mas = await pagina(cursor);
      if (mas) {
        setClientes((prev) => [...prev, ...mas.data]);
        setCursor(mas.cursor);
      }
    } finally {
      setCargandoMas(false);
    }
  };

  /**
   * La ficha. Las notas salen de la LISTA: /api/loyalty/[phone] no las trae, y
   * antes la caja arrancaba vacía aunque hubiera notas guardadas —guardar
   * encima las borraba—.
   */
  const elegir = async (phone: string) => {
    const deLaLista = clientes.find((c) => c.phone === phone) ?? null;
    if (deLaLista) setElegido(deLaLista);
    const res = await fetch(`/api/loyalty/${encodeURIComponent(phone)}`);
    if (!res.ok) return;
    const d = (await res.json()) as Partial<ClientePuntos> & { tiers?: NivelPuntos[] };
    setElegido({
      phone: d.phone ?? phone,
      name: d.name ?? deLaLista?.name ?? "",
      loyaltyPoints: d.loyaltyPoints ?? 0,
      loyaltyTier: d.loyaltyTier ?? "bronce",
      totalSpent: d.totalSpent ?? 0,
      privateNotes: deLaLista?.privateNotes ?? null,
      referralCode: d.referralCode ?? null,
    });
    if (d.tiers) setNiveles(d.tiers);
  };

  const canjear = async (puntos: number): Promise<boolean> => {
    if (!elegido || puntos <= 0 || puntos > elegido.loyaltyPoints) return false;
    const phone = elegido.phone;
    const res = await fetch(`/api/loyalty/${encodeURIComponent(phone)}`, {
      method: "POST",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ action: "redeem", points: puntos }),
    });
    if (!res.ok) return false;
    setClientes((prev) => prev.map((c) => (c.phone === phone ? { ...c, loyaltyPoints: c.loyaltyPoints - puntos } : c)));
    await elegir(phone);
    return true;
  };

  const guardarNotas = async (privateNotes: string): Promise<boolean> => {
    if (!elegido) return false;
    const phone = elegido.phone;
    const res = await fetch(`/api/customers/${encodeURIComponent(phone)}`, {
      method: "PATCH",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ privateNotes }),
    });
    if (!res.ok) return false;
    setElegido((prev) => (prev && prev.phone === phone ? { ...prev, privateNotes } : prev));
    setClientes((prev) => prev.map((c) => (c.phone === phone ? { ...c, privateNotes } : c)));
    return true;
  };

  const generarReferido = async () => {
    if (!elegido) return;
    const letras = elegido.name.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, "X");
    const code = `${letras}${Math.floor(1000 + Math.random() * 9000)}`;
    const res = await fetch(`/api/customers/${encodeURIComponent(elegido.phone)}`, {
      method: "PATCH",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ referralCode: code }),
    });
    if (res.ok) setElegido((prev) => (prev ? { ...prev, referralCode: code } : prev));
  };

  return {
    clientes, loading, error, hayMas: !!cursor, cargandoMas, metricas, elegido, niveles,
    recargar: () => { void cargar(); },
    cargarMas, elegir, canjear, guardarNotas, generarReferido,
  };
}

export type Puntos = ReturnType<typeof usePuntos>;
