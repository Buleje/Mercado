"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect } from "react";
import { MapPin, Loader2, AlertCircle, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────────────────────

type Customer = {
  phone: string;
  name: string;
  location?: string;
  reference?: string;
};

type ZoneData = {
  zone: string;
  count: number;
  customers: string[];
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const ZONE_KEYWORDS: Record<string, string[]> = {
  "Zona Centro": ["centro", "plaza", "jiron", "jr.", "av. san martin", "san martin"],
  "Zona Norte": ["norte", "yarinacocha", "campo verde", "nuevo requena"],
  "Zona Sur": ["sur", "manantay", "nueva requena", "alexander"],
  "Zona Este": ["este", "pucallpillo", "nazareth"],
  "Zona Oeste": ["oeste", "calleria", "villa"],
  "Sin ubicacion": [],
};

function inferZone(customer: Customer): string {
  const raw = `${customer.location ?? ""} ${customer.reference ?? ""}`.toLowerCase();
  if (!raw.trim()) return "Sin ubicacion";
  for (const [zone, keywords] of Object.entries(ZONE_KEYWORDS)) {
    if (zone === "Sin ubicacion") continue;
    if (keywords.some((kw) => raw.includes(kw))) return zone;
  }
  return "Sin ubicacion";
}

const ZONE_COLORS = [
  "bg-primary",
  "bg-primary-light",
  "bg-[#2dd4bf]",
  "bg-[#74c69d]",
  "bg-[#95d5b2]",
  "bg-gray-400",
];

const ZONE_TEXT_COLORS = [
  "text-primary",
  "text-primary-light",
  "text-[#2dd4bf]",
  "text-[#74c69d]",
  "text-[#95d5b2]",
  "text-gray-400",
];

// ── Component ────────────────────────────────────────────────────────────────

export default function CustomerHeatmap() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [zones, setZones] = useState<ZoneData[]>([]);
  const [expandedZone, setExpandedZone] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch("/api/customers?limit=500")
      .then((r) => r.json())
      .then((data) => {
        const list: Customer[] = Array.isArray(data)
          ? data
          : (data.customers ?? data.data ?? []);
        setCustomers(list);

        // Group by zone
        const zoneMap: Record<string, string[]> = {};
        list.forEach((c) => {
          const z = inferZone(c);
          if (!zoneMap[z]) zoneMap[z] = [];
          zoneMap[z].push(c.name);
        });

        const sorted = Object.entries(zoneMap)
          .map(([zone, customers]) => ({ zone, count: customers.length, customers }))
          .sort((a, b) => b.count - a.count);
        setZones(sorted);
      })
      .catch(() => setError("No se pudieron cargar los clientes."))
      .finally(() => setLoading(false));
  }, []);

  const total = customers.length;
  const topZone = zones[0];
  const topPct = total > 0 ? Math.round((topZone?.count / total) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-gray-900">
          Mapa de Calor de Clientes
        </h2>
        <p className="text-sm text-gray-500">
          Distribucion de clientes por zona de Pucallpa
        </p>
      </div>

      {/* Insight banner */}
      {!loading && topZone && (
        <div className="flex items-center gap-3 rounded-xl bg-primary/10 px-4 py-3">
          <TrendingUp className="h-5 w-5 shrink-0 text-primary" />
          <p className="text-sm font-medium text-primary">
            El {topPct}% de tus clientes estan en {topZone.zone} ({topZone.count}{" "}
            clientes)
          </p>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-2xl font-bold text-primary">{total}</p>
          <p className="text-xs text-gray-500">
            Total clientes
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-2xl font-bold text-primary">
            {zones.filter((z) => z.zone !== "Sin ubicacion").length}
          </p>
          <p className="text-xs text-gray-500">Zonas</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-2xl font-bold text-primary">
            {zones.find((z) => z.zone === "Sin ubicacion")?.count ?? 0}
          </p>
          <p className="text-xs text-gray-500">
            Sin ubicacion
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="h-5 w-5 text-red-500" />
          <p className="text-sm text-red-600">{error}</p>
        </div>
      ) : (
        /* Horizontal bar chart */
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="mb-4 text-sm font-semibold text-gray-800">
            Clientes por zona
          </h3>
          {zones.length === 0 ? (
            <p className="text-center text-sm text-gray-400">
              No hay datos suficientes para mostrar zonas.
            </p>
          ) : (
            <div className="space-y-6">
              {zones.map((z, idx) => {
                const pct = total > 0 ? Math.round((z.count / total) * 100) : 0;
                const colorBar = ZONE_COLORS[idx % ZONE_COLORS.length];
                const colorText = ZONE_TEXT_COLORS[idx % ZONE_TEXT_COLORS.length];
                const isExpanded = expandedZone === z.zone;

                return (
                  <div key={z.zone}>
                    <div className="mb-1 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <MapPin className={cn("h-3.5 w-3.5", colorText)} />
                        <span className="text-sm font-medium text-gray-700">
                          {z.zone}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-500">
                          {z.count} clientes ({pct}%)
                        </span>
                        <button
                          onClick={() =>
                            setExpandedZone(isExpanded ? null : z.zone)
                          }
                          className="text-xs text-primary underline-offset-2 hover:underline"
                        >
                          {isExpanded ? "Ocultar" : "Ver lista"}
                        </button>
                      </div>
                    </div>
                    <div className="relative h-6 w-full overflow-hidden rounded-full bg-gray-100">
                      <div
                        className={cn(
                          "flex h-full items-center justify-end pr-2 transition-all duration-500",
                          colorBar
                        )}
                        style={{ width: `${Math.max(pct, 4)}%` }}
                      >
                        {pct >= 12 && (
                          <span className="text-xs font-bold text-white">
                            {pct}%
                          </span>
                        )}
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="mt-2 flex flex-wrap gap-1.5 rounded-lg bg-gray-50 p-3">
                        {z.customers.map((name, i) => (
                          <span
                            key={i}
                            className="rounded-full bg-white px-2.5 py-0.5 text-xs text-gray-700 "
                          >
                            {name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
