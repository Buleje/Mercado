"use client";
import type { ReactNode } from "react";
import { CardTitle } from "@buleje/design-system";
import { AlertCircle, CheckCircle, ChevronDown, Rocket } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { cn } from "@/lib/utils";
import type { ListaPublicar } from "@/lib/marketplace/lista-publicar";

interface Punto {
  id: string;
  ok: boolean;
  /** «a medias»: hecho a la mitad (p. ej. ubicación marcada solo en Ajustes). */
  aMedias?: boolean;
  titulo: string;
  detalle: string;
  info?: { what: string; affects: string; example?: string };
  accion?: { label: string; href?: string; anclaId?: string; alHacer?: () => void };
}

function armarPuntos(l: ListaPublicar, onUsarUbicacion: () => void): Punto[] {
  const p = l.productos;
  const sinFoto = p.activos - p.conFoto;
  const sinStock = p.activos - p.conStock;
  return [
    {
      id: "logo",
      ok: l.logo,
      titulo: "Logo",
      detalle: l.logo ? "Tu tarjeta muestra tu logo." : "Sin logo tu tarjeta muestra solo las iniciales.",
      accion: l.logo ? undefined : { label: "Subir logo", anclaId: "tienda-imagen" },
    },
    {
      id: "ubicacion",
      ok: l.ubicacion === "tienda",
      aMedias: l.ubicacion === "solo-ajustes",
      titulo: "Ubicación en el mapa",
      detalle:
        l.ubicacion === "tienda"
          ? "Apareces en «Cerca de ti» y en el mapa."
          : l.ubicacion === "solo-ajustes"
            ? "La marcaste en Ajustes; falta pasarla a tu tienda."
            : "Sin ubicación no apareces en «Cerca de ti» ni en el mapa.",
      info: {
        what: "El punto exacto de tu local que usa el marketplace para medir la distancia al vecino.",
        affects: "«Cerca de ti», el mapa de tiendas y el costo de delivery por distancia.",
        example: "Si ya la marcaste en Ajustes, «Usarla en mi tienda» la copia. También se copia al guardar o publicar.",
      },
      accion:
        l.ubicacion === "tienda"
          ? undefined
          : l.ubicacion === "solo-ajustes"
            ? { label: "Usarla en mi tienda", alHacer: onUsarUbicacion }
            : { label: "Marcar en el mapa", href: "/admin?tab=config&vista=negocio" },
    },
    {
      id: "horario",
      ok: l.horario,
      titulo: "Horario de atención",
      detalle: l.horario ? "Tu tarjeta dice si estás abierto." : "Sin horario no podemos decir si estás abierto.",
      accion: l.horario ? undefined : { label: "Poner horario", anclaId: "tienda-horario" },
    },
    {
      id: "productos",
      ok: p.listos >= l.minimoListos,
      titulo: "Productos con foto y stock",
      detalle:
        p.activos === 0
          ? "Todavía no tienes productos en la tienda."
          : `${p.listos} de ${p.activos} listos` +
            (sinFoto > 0 || sinStock > 0
              ? ` · ${[sinFoto > 0 ? `${sinFoto} sin foto` : "", sinStock > 0 ? `${sinStock} sin stock` : ""].filter(Boolean).join(" · ")}`
              : ""),
      info: {
        what: `Un producto se ve en el marketplace si tiene foto y stock. Pedimos al menos ${l.minimoListos}.`,
        affects: "Con menos, tu vitrina de Inicio y tu página de tienda se ven vacías.",
        example: "52 de 56 listos · 4 sin foto.",
      },
      accion: p.listos >= l.minimoListos ? undefined : { label: "Completar productos", href: "/admin?tab=productos" },
    },
  ];
}

function irAAncla(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  el.querySelector<HTMLElement>("input, button")?.focus({ preventScroll: true });
}

const BOTON =
  "inline-flex items-center justify-center h-10 px-4 rounded-xl border border-[var(--rule-base)] text-sm font-semibold text-[var(--text-primary)] hover:border-primary hover:text-primary whitespace-nowrap";

/**
 * «Lista para publicar»: lo que le falta a tu tienda para verse completa en el
 * marketplace, con un botón por punto. Plegable y recordado; plegada sigue
 * diciendo «3 de 4 listos».
 */
export function ListaParaPublicar({
  lista,
  publicada,
  publicando,
  onPublicar,
  onUsarUbicacion,
}: {
  lista: ListaPublicar;
  publicada: boolean;
  publicando: boolean;
  onPublicar: () => void;
  /** Guarda la tienda: el PUT copia la ubicación de Ajustes si la tienda no tiene. */
  onUsarUbicacion: () => void;
}) {
  const [plegada, setPlegada] = useLocalStorage<boolean>("admin:mkt-tienda:lista-plegada", false);
  const puntos = armarPuntos(lista, onUsarUbicacion);
  const listos = puntos.filter((p) => p.ok).length;
  const todo = listos === puntos.length;
  // «A medias» (ubicación solo en Ajustes) no frena: publicar guarda y la copia.
  const puedePublicar = puntos.every((p) => p.ok || p.aMedias);

  let botonPublicar: ReactNode = null;
  if (!publicada) {
    botonPublicar = (
      <button
        type="button"
        onClick={onPublicar}
        disabled={!puedePublicar || publicando}
        title={puedePublicar ? undefined : "Completa los puntos de la lista para publicar desde aquí"}
        className="inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-primary text-white text-base font-semibold hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Rocket className="h-4 w-4" aria-hidden />
        {publicando ? "Publicando…" : "Publicar mi tienda"}
      </button>
    );
  }

  return (
    <section
      aria-labelledby="lista-publicar-titulo"
      className={cn(
        "rounded-2xl border bg-[var(--surface-raised)] overflow-hidden",
        todo ? "border-[var(--rule-base)]" : "border-2 border-[var(--data-warning)]/50",
      )}
    >
      <header className="flex flex-wrap items-center gap-3 px-5 py-4">
        <CardTitle id="lista-publicar-titulo" className="text-sm font-bold text-[var(--text-primary)]">
          Lista para publicar
        </CardTitle>
        <InfoTip
          what="Lo que el vecino necesita ver para confiar en tu tienda: logo, ubicación, horario y productos con foto y stock."
          affects="Una tienda incompleta aparece más abajo y vende menos."
        />
        <span
          className={cn(
            "inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-sm font-bold tabular-nums",
            todo ? "bg-[var(--data-success-50)] text-[var(--data-success-ink)]" : "bg-[var(--data-warning-50)] text-[var(--data-warning-ink)]",
          )}
        >
          {listos} de {puntos.length} listos
        </span>
        <span className="ml-auto inline-flex items-center gap-2">
          {botonPublicar}
          <button
            type="button"
            onClick={() => setPlegada((v) => !v)}
            aria-expanded={!plegada}
            aria-controls="lista-publicar-puntos"
            aria-label={plegada ? "Mostrar la lista" : "Plegar la lista"}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
          >
            <ChevronDown className={cn("h-5 w-5 transition-transform", plegada && "-rotate-90")} aria-hidden />
          </button>
        </span>
      </header>

      {!plegada && (
        <ul id="lista-publicar-puntos" className="border-t-2 border-[var(--rule-base)] divide-y divide-[var(--rule-soft)]">
          {puntos.map((p) => {
            const Icono = p.ok ? CheckCircle : AlertCircle;
            const tono = p.ok ? "text-[var(--data-success)]" : p.aMedias ? "text-[var(--data-warning-700)]" : "text-[var(--data-error)]";
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3">
                <Icono className={cn("h-5 w-5 shrink-0", tono)} aria-hidden />
                <span className="sr-only">{p.ok ? "Listo:" : "Falta:"}</span>
                <span className="min-w-0 flex-1 basis-56">
                  <span className="flex items-center gap-1.5 text-base font-semibold text-[var(--text-primary)]">
                    {p.titulo}
                    {p.info && <InfoTip what={p.info.what} affects={p.info.affects} example={p.info.example} />}
                  </span>
                  <span className="block text-sm text-[var(--text-secondary)]">{p.detalle}</span>
                </span>
                {p.accion?.href && (
                  <a href={p.accion.href} className={BOTON}>
                    {p.accion.label}
                  </a>
                )}
                {p.accion?.alHacer && (
                  <button type="button" onClick={p.accion.alHacer} disabled={publicando} className={cn(BOTON, "disabled:opacity-50")}>
                    {publicando ? "Guardando…" : p.accion.label}
                  </button>
                )}
                {p.accion?.anclaId && (
                  <button type="button" onClick={() => irAAncla(p.accion!.anclaId!)} className={BOTON}>
                    {p.accion.label}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
