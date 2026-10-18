"use client";

import Link from "next/link";
import { ChevronDown, ChevronRight, Store } from "@buleje/design-system/icons";
import { cn } from "@buleje/design-system";
import type { AvisoBandeja, Nivel } from "@/lib/superadmin/nivel-aviso";
import { CATEGORIA_META, NIVEL_META, haceCuanto } from "./meta";
import { DetallePedido, MiniaturaArticulo } from "./DetallePedido";

/** La etiqueta del nivel: color + ícono + texto (nunca sólo color). */
export function EtiquetaNivel({ nivel, motivo, className }: { nivel: Nivel; motivo?: string; className?: string }) {
  const m = NIVEL_META[nivel];
  const Icono = m.icon;
  return (
    <span
      title={motivo}
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-semibold ring-1 ring-inset",
        m.tag,
        className,
      )}
    >
      <Icono className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {m.etiqueta}
    </span>
  );
}

/** Ancho fijo de la etiqueta en desktop: los títulos arrancan todos en la misma vertical. */
const COLUMNA_NIVEL = "hidden sm:inline-flex sm:w-28";

const FILA =
  "group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--surface-sunken)] focus-visible:bg-[var(--surface-sunken)] focus-visible:outline-none sm:grid-cols-[auto_minmax(0,1fr)_auto]";

/** Lo que va en el medio de la fila: título + detalle arriba; categoría, tienda y por qué, abajo. */
function CuerpoAviso({ aviso }: { aviso: AvisoBandeja }) {
  const cat = CATEGORIA_META[aviso.categoria];
  const IconoCat = cat.icon;
  return (
    <div className="min-w-0">
      <p className="flex min-w-0 items-center gap-2">
        <EtiquetaNivel nivel={aviso.nivel} className="sm:hidden" />
        <span className="truncate text-sm font-semibold text-[var(--text-primary)]">{aviso.title}</span>
        <span className="hidden shrink-0 text-xs tabular-nums text-[var(--text-tertiary)] md:inline">{aviso.subtitle}</span>
      </p>
      <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
        <IconoCat className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="shrink-0 font-medium text-[var(--text-secondary)]">{cat.corta}</span>
        {aviso.tienda && (
          <>
            <span aria-hidden>·</span>
            <Store className="h-3 w-3 shrink-0" aria-hidden />
            <span className="max-w-[14rem] shrink-0 truncate">{aviso.tienda}</span>
          </>
        )}
        <span aria-hidden>·</span>
        <span className="truncate">{aviso.motivo}</span>
      </p>
    </div>
  );
}

function Hace({ aviso }: { aviso: AvisoBandeja }) {
  if (!aviso.createdAt) return null;
  return (
    <time dateTime={aviso.createdAt} className="text-xs font-semibold tabular-nums text-[var(--text-tertiary)]">
      {haceCuanto(aviso.createdAt)}
    </time>
  );
}

/** Un aviso que lleva a su pantalla. */
export function FilaAviso({ aviso, onIr }: { aviso: AvisoBandeja; onIr: () => void }) {
  return (
    <li>
      <Link href={aviso.href} onClick={onIr} className={FILA}>
        <EtiquetaNivel nivel={aviso.nivel} motivo={aviso.motivo} className={COLUMNA_NIVEL} />
        <CuerpoAviso aviso={aviso} />
        <span className="flex items-center gap-2">
          <Hace aviso={aviso} />
          <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-[var(--accent-ink)] dark:text-[var(--accent)]">
            <span className="hidden sm:inline">Abrir</span>
            <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </span>
        </span>
      </Link>
    </li>
  );
}

/** Un pedido sin atender: se despliega con sus artículos (acordeón, uno a la vez). */
export function FilaPedido({
  aviso,
  abierto,
  onAlternar,
  onIr,
}: {
  aviso: AvisoBandeja;
  abierto: boolean;
  onAlternar: () => void;
  onIr: () => void;
}) {
  const pedido = aviso.order;
  if (!pedido) return <FilaAviso aviso={aviso} onIr={onIr} />;
  const vista = pedido.items.slice(0, 3);
  return (
    <li className={abierto ? "bg-[var(--surface-sunken)]/40" : undefined}>
      <button type="button" onClick={onAlternar} aria-expanded={abierto} className={FILA}>
        <EtiquetaNivel nivel={aviso.nivel} motivo={aviso.motivo} className={COLUMNA_NIVEL} />
        <CuerpoAviso aviso={aviso} />
        <span className="flex items-center gap-2">
          <span className="hidden -space-x-2 lg:flex" aria-hidden>
            {vista.map((it) => (
              <span key={it.id} className="rounded-lg ring-2 ring-[var(--surface-raised)]">
                <MiniaturaArticulo src={it.image} alt="" size="h-7 w-7" />
              </span>
            ))}
          </span>
          <Hace aviso={aviso} />
          <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-[var(--accent-ink)] dark:text-[var(--accent)]">
            <span className="hidden sm:inline">{pedido.itemsCount} art.</span>
            <ChevronDown className={cn("h-4 w-4 transition-transform", abierto && "rotate-180")} aria-hidden />
          </span>
        </span>
      </button>
      {abierto && <DetallePedido pedido={pedido} href={aviso.href} onIr={onIr} />}
    </li>
  );
}
