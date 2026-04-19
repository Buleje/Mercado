"use client";

import { useState } from "react";
import { MapPin, Check } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

/**
 * PucallpaZoneMap
 *
 * Mapa estilizado de las 7 zonas principales de Pucallpa.
 * Usa SVG paths simplificados — más liviano que Leaflet, sin mapa real
 * (no mostramos calles), pero con la forma aproximada del territorio.
 * Las zonas son tocables y se destacan al seleccionar.
 */

interface Zone {
  id: string;
  label: string;
  path: string; // SVG path
  labelX: number;
  labelY: number;
}

// Coordenadas aproximadas — NO es un mapa cartográfico real, es una
// representación visual con la posición relativa de cada zona.
const ZONES: Zone[] = [
  {
    id: "Yarinacocha",
    label: "Yarinacocha",
    path: "M 70,60 Q 130,40 180,80 L 190,130 Q 160,150 110,140 L 70,120 Z",
    labelX: 125,
    labelY: 100,
  },
  {
    id: "Callería",
    label: "Callería",
    path: "M 190,130 L 270,110 Q 300,150 280,200 L 220,210 L 190,170 Z",
    labelX: 240,
    labelY: 160,
  },
  {
    id: "Centro",
    label: "Centro",
    path: "M 190,170 L 220,210 L 210,260 L 160,260 L 150,220 Z",
    labelX: 185,
    labelY: 225,
  },
  {
    id: "Manantay",
    label: "Manantay",
    path: "M 150,220 L 160,260 L 210,260 L 220,310 L 160,330 L 120,290 Z",
    labelX: 170,
    labelY: 285,
  },
  {
    id: "Coronel Portillo",
    label: "Coronel Portillo",
    path: "M 220,210 L 280,200 Q 320,220 310,270 L 260,290 L 220,310 L 210,260 Z",
    labelX: 265,
    labelY: 245,
  },
  {
    id: "Pueblo Libre",
    label: "Pueblo Libre",
    path: "M 110,140 L 150,220 L 120,290 L 80,260 L 60,200 L 70,150 Z",
    labelX: 100,
    labelY: 210,
  },
  {
    id: "Ica Yanayacu",
    label: "Ica Yanayacu",
    path: "M 60,200 L 80,260 L 120,290 L 60,330 L 30,280 L 30,230 Z",
    labelX: 65,
    labelY: 275,
  },
];

interface Props {
  value: string;
  onChange: (zone: string) => void;
  className?: string;
}

export default function PucallpaZoneMap({ value, onChange, className }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div className={cn("space-y-4", className)}>
      <div className="relative bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 border border-emerald-100 dark:border-emerald-900 rounded-2xl overflow-hidden p-2">
        <svg
          viewBox="0 0 340 360"
          className="w-full h-auto max-h-[360px]"
          role="img"
          aria-label="Mapa estilizado de zonas de Pucallpa"
        >
          {/* Río en el costado derecho */}
          <path
            d="M 290,50 Q 320,140 310,230 Q 320,300 290,340"
            fill="none"
            stroke="#60a5fa"
            strokeWidth="14"
            strokeLinecap="round"
            opacity="0.35"
          />
          <text x="310" y="180" fontSize="8" fill="#3b82f6" fontWeight="700">
            Río Ucayali
          </text>

          {ZONES.map((z) => {
            const isActive = value === z.id;
            const isHovered = hovered === z.id;
            return (
              <g key={z.id}>
                <path
                  d={z.path}
                  fill={
                    isActive
                      ? "var(--color-primary)"
                      : isHovered
                      ? "rgba(0, 180, 166, 0.25)"
                      : "rgba(16, 185, 129, 0.12)"
                  }
                  stroke={isActive ? "var(--color-primary)" : "#10b981"}
                  strokeWidth={isActive ? "2" : "1"}
                  className="cursor-pointer transition-all duration-200"
                  onClick={() => onChange(z.id)}
                  onMouseEnter={() => setHovered(z.id)}
                  onMouseLeave={() => setHovered(null)}
                />
                <text
                  x={z.labelX}
                  y={z.labelY}
                  textAnchor="middle"
                  fontSize="9"
                  fontWeight="700"
                  fill={isActive ? "white" : "#064e3b"}
                  className="pointer-events-none select-none"
                >
                  {z.label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Leyenda */}
        <p className="absolute bottom-2 left-3 right-3 text-[length:var(--ts-2xs)] text-gray-500 dark:text-gray-400 text-center">
          Tocá una zona del mapa o seleccioná abajo
        </p>
      </div>

      {/* Lista de chips como alternativa táctil / mobile */}
      <div className="flex flex-wrap gap-2">
        {ZONES.map((z) => {
          const isActive = value === z.id;
          return (
            <button
              key={z.id}
              type="button"
              onClick={() => onChange(z.id)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all",
                isActive
                  ? "bg-primary text-white border-primary shadow-sm shadow-primary/20"
                  : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-primary/40",
              )}
            >
              {isActive ? (
                <Check className="h-3 w-3" />
              ) : (
                <MapPin className="h-3 w-3" />
              )}
              {z.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
