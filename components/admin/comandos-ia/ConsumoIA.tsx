"use client";

/**
 * Medidor de IA del mes (Comandos IA, 2026-10-09). Lee `/api/admin/ai-costs`,
 * que usa el MISMO plan y tope que `canSpend` (lib/ai/cost-control.ts): lo que
 * se ve acá es el tope que de verdad frena a la IA.
 *
 * - `compacto` (default): la franja de una línea del hub «Asistente IA», UNA
 *   sola para Chat, Comandos y Automatizaciones (10-10: antes cada pestaña
 *   ponía la suya y el chat contaba otra cosa en el navegador).
 * - `TarjetaConsumoIA`: la cifra dentro de los «Indicadores» de «Lo que hizo
 *   la IA». Mientras esa vista está montada (`useMedidorEnLaVista`) la franja
 *   se calla: dos medidores en la misma pantalla = repetido.
 * Sólo admin/dueño: el resto (o un 403) no ve nada.
 *
 * Sin «~N papeles más» (10-10): prometía 33.329 papeles aunque la IA de
 * visión no estuviera conectada. La cuenta de un papel queda en el ⓘ.
 */

import { useEffect, useState, useSyncExternalStore } from "react";
import { AlertTriangle, Sparkles } from "@buleje/design-system/icons";
import { cachedJson } from "@/lib/client-cache-fetch";
import { cn } from "@/lib/utils";
import { useMiRol } from "@/hooks/use-mi-rol";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { usd } from "./historial/use-recibos";

export interface AiCosts {
  spentUsd: number;
  capUsd: number;
  percentUsed: number;
  remainingUsd: number;
  plan: string;
  planEnTabla?: boolean;
}

/**
 * Lo que cuesta, como MÁXIMO, leer un papel con IA (sólo para el ejemplo del ⓘ).
 * Sale de papel/entender/route.ts: (6.000 caracteres ÷ 3 + 900 de respuesta) =
 * 2.900 tokens × US$0,000001 = US$0,0029, redondeado hacia arriba.
 */
const USD_POR_PAPEL = 0.003;

// ── ¿Hay una vista que ya dice la cifra? ────────────────────────────────────
let grandes = 0;
const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach((f) => f());
const suscribir = (f: () => void) => {
  oyentes.add(f);
  return () => {
    oyentes.delete(f);
  };
};
const hayGrande = () => grandes > 0;

/** Mientras la vista que lo llama está montada, la franja compacta (la del hub) no se dibuja. */
export function useMedidorEnLaVista(): void {
  useEffect(() => {
    grandes += 1;
    avisar();
    return () => {
      grandes -= 1;
      avisar();
    };
  }, []);
}

/** `undefined` = todavía leyendo; `null` = nada que mostrar (sin permiso o sin dato). */
export function useConsumoIA(): AiCosts | null | undefined {
  const rol = useMiRol();
  const puede = rol === "admin" || rol === "owner";
  const [datos, setDatos] = useState<AiCosts | null | undefined>(undefined);
  useEffect(() => {
    if (!puede) return;
    let vivo = true;
    void cachedJson<AiCosts>("/api/admin/ai-costs", 60_000).then((d) => {
      if (vivo) setDatos(d && typeof d.capUsd === "number" ? d : null);
    });
    return () => {
      vivo = false;
    };
  }, [puede]);
  return puede ? datos : null;
}

function nivel(pct: number): "ok" | "ambar" | "rojo" {
  if (pct >= 90) return "rojo";
  if (pct >= 75) return "ambar";
  return "ok";
}

const BARRA: Record<ReturnType<typeof nivel>, string> = {
  ok: "bg-[var(--accent)]",
  ambar: "bg-[var(--data-warning-500)]",
  rojo: "bg-[var(--data-error-500)]",
};

function Info({ d }: { d: AiCosts }) {
  return (
    <InfoTip
      title="IA este mes"
      what="Suma de lo que gastó la IA de tu negocio desde el día 1: leer papeles, redactar mensajes, entender órdenes, el chat. Se reinicia cada mes."
      affects={`Tu plan (${d.plan}) tiene un tope de ${usd(d.capUsd)} al mes${
        d.planEnTabla === false ? ": tu plan usa el tope de free" : ""
      }; te queda ${usd(d.remainingUsd)}. Al llegar, la IA se pausa y los mensajes salen con la plantilla de siempre.`}
      example={`Leer un papel ≈ ${usd(USD_POR_PAPEL)} · redactar 10 mensajes ≈ $0.001.`}
      side="bottom"
      className="shrink-0"
    />
  );
}

function Barra({ pct, alto }: { pct: number; alto: string }) {
  return (
    <div
      className={`overflow-hidden rounded-full bg-[var(--surface-sunken)] ${alto}`}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="IA usada este mes"
    >
      <div
        className={`h-full rounded-full ${BARRA[nivel(pct)]}`}
        style={{ width: `${Math.min(100, Math.max(pct > 0 ? 2 : 0, pct))}%` }}
      />
    </div>
  );
}

function AvisoPoco({ d }: { d: AiCosts }) {
  if (nivel(d.percentUsed) !== "rojo") return null;
  const agotado = d.percentUsed >= 100 || d.remainingUsd <= 0;
  return (
    <p className="flex items-start gap-1.5 text-sm font-medium text-[var(--data-error)]">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      {agotado
        ? "Se acabó el tope de este mes: los mensajes salen con la plantilla de siempre."
        : "Te queda poco: los mensajes saldrán con la plantilla de siempre."}
    </p>
  );
}

/** La cifra del mes como una tarjeta de «Indicadores» (todo en 14 px o más). */
export function TarjetaConsumoIA({ d }: { d: AiCosts }) {
  return (
    <div className="flex h-full flex-col gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3">
      <span className="flex items-center justify-between gap-2 text-sm font-semibold text-[var(--text-secondary)]">
        <span className="inline-flex items-center gap-1">
          IA este mes <Info d={d} />
        </span>
        <Sparkles className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
      </span>
      <span className="text-2xl font-bold tabular-nums text-[var(--text-primary)]">{usd(d.spentUsd)}</span>
      <Barra pct={d.percentUsed} alto="h-2 w-full" />
      <span className="text-sm text-[var(--text-secondary)]">
        de {usd(d.capUsd)} · {Math.round(d.percentUsed)} % · plan {d.plan}
      </span>
      <AvisoPoco d={d} />
    </div>
  );
}

/** La franja de una línea (hub). `compacto` se conserva: el hub la monta así. */
export default function ConsumoIA({ compacto = true }: { compacto?: boolean }) {
  const d = useConsumoIA();
  const enLaVista = useSyncExternalStore(suscribir, hayGrande, () => false);
  if (!d) return null;
  if (!compacto) return <TarjetaConsumoIA d={d} />;
  if (enLaVista) return null;
  // Vive en la banda del hub, al lado de las pestañas: se acorta según el
  // ancho de la BANDA (`@container/banda`), no del viewport, para no partirla
  // en otra fila (10-10: a 1280 bajaba debajo de las pestañas y a 400 ocupaba
  // una fila propia). Celular: «✦ 1 % ⓘ» sin caja; desde 30rem, lo gastado y
  // el tope (o el aviso, si queda poco); la barra desde 64rem y la etiqueta
  // desde 68rem. El aviso largo de `AvisoPoco` haría la banda tan ancha como
  // la frase: acá va corto y en rojo, y el detalle en el ⓘ.
  const rojo = nivel(d.percentUsed) === "rojo";
  const agotado = d.percentUsed >= 100 || d.remainingUsd <= 0;
  const Icono = rojo ? AlertTriangle : Sparkles;
  return (
    <div
      className={cn(
        // La caja sólo desde 30rem y por variante: `.bg-[var(--surface-raised)]`
        // y `.border-[var(--rule-base)]` pelados los pisa el oscuro del admin
        // (globals.css ~1353) y en el celular quedaba una caja sin querer.
        "flex min-w-0 items-center gap-1 rounded-xl py-1.5 text-sm",
        "@min-[30rem]/banda:gap-1.5 @min-[30rem]/banda:border @min-[30rem]/banda:bg-[var(--surface-raised)] @min-[30rem]/banda:px-2.5",
        rojo
          ? "text-[var(--data-error-ink)] @min-[30rem]/banda:border-[var(--data-error)]"
          : "text-[var(--text-secondary)] @min-[30rem]/banda:border-[var(--rule-base)]",
      )}
    >
      <Icono className={cn("h-4 w-4 shrink-0", !rojo && "text-[var(--accent)]")} aria-hidden />
      <span className="min-w-0 truncate">
        <span className="hidden @min-[68rem]/banda:inline">IA este mes: </span>
        <span className="sr-only @min-[68rem]/banda:hidden">IA este mes: </span>
        <span className={cn("font-semibold tabular-nums", !rojo && "text-[var(--text-primary)]")}>
          <span className="@min-[30rem]/banda:hidden">{Math.round(d.percentUsed)} %</span>
          <span className="hidden @min-[30rem]/banda:inline">{usd(d.spentUsd)}</span>
        </span>
        <span className="hidden @min-[30rem]/banda:inline">
          {rojo ? (agotado ? " · Se acabó el tope" : " · Te queda poco") : ` de ${usd(d.capUsd)}`}
        </span>
      </span>
      <Barra pct={d.percentUsed} alto="hidden h-1.5 w-16 shrink-0 @min-[64rem]/banda:block" />
      <Info d={d} />
    </div>
  );
}
