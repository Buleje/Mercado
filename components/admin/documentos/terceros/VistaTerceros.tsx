"use client";

import { useCallback, useEffect, useState } from "react";
import { FolderOpen, UserPlus } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { filtrarTerceros, type TipoTercero } from "@/lib/documentos/terceros-vinculo";
import { CargandoVista } from "../archivo/perezosos";
import type { ModeloArchivo } from "../archivo/use-archivo";
import { useTerceros } from "./use-terceros";
import ListaTerceros from "./ListaTerceros";
import DetalleTercero from "./DetalleTercero";

/**
 * Archivo › Terceros (`?sub=terceros`, Brandon 23-10): las carpetas vinculadas
 * a una persona, proveedor, cliente, colaborador, comunidad o titular, por
 * quién son. A la izquierda los terceros (lo más usado primero, por tipo y con
 * buscador); a la derecha sus carpetas con sus papeles. El elegido viaja en
 * `?tercero=<clave>` para que el enlace y la recarga vuelvan al mismo.
 */

const PARAM = "tercero";

/**
 * Las dos columnas dependen del ancho de la vista, no de la pantalla: con el
 * panel del Archivo abierto, 1280 px de pantalla dejan ~710 px y la tabla de
 * papeles quedaba en 376 px con scroll de lado (medido 23-10). Por debajo,
 * lista o detalle (con «volver»), como en el celular.
 */
const ANCHO_DOS_COLUMNAS = 840;

/** Ancho del contenedor con ResizeObserver (ref de React 19 con limpieza). */
function useAnchoDelContenedor(): [(el: HTMLDivElement | null) => (() => void) | undefined, number] {
  const [ancho, setAncho] = useState(0);
  const ref = useCallback((el: HTMLDivElement | null) => {
    if (!el) return undefined;
    setAncho(Math.round(el.getBoundingClientRect().width));
    const ro = new ResizeObserver(([e]) => setAncho(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, ancho];
}

function leerDeLaUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URL(window.location.href).searchParams.get(PARAM);
}

function escribirEnLaUrl(clave: string | null): void {
  const url = new URL(window.location.href);
  if (clave) url.searchParams.set(PARAM, clave);
  else url.searchParams.delete(PARAM);
  if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url.toString());
}

export default function VistaTerceros({ arch }: { arch: ModeloArchivo }) {
  const { folders, documents, loading, irAVista } = arch;
  const { terceros, cargando, error } = useTerceros(folders, documents);
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState<TipoTercero | null>(null);
  const [clave, setClaveEstado] = useState<string | null>(leerDeLaUrl);
  const [refVista, anchoVista] = useAnchoDelContenedor();
  const dosColumnas = anchoVista >= ANCHO_DOS_COLUMNAS;

  const setClave = useCallback((c: string | null) => {
    setClaveEstado(c);
    escribirEnLaUrl(c);
  }, []);
  // Al salir de la pestaña el `?tercero=` no queda colgado en la dirección.
  useEffect(() => () => escribirEnLaUrl(null), []);

  const lista = filtrarTerceros(terceros, q, tipo);
  // A dos columnas, sin elegir, se abre el más usado: la derecha nunca queda en blanco.
  // Angosto (celular o panel del Archivo abierto) la lista va primero y el detalle ocupa todo.
  const elegido = terceros.find((t) => t.clave === clave) ?? (dosColumnas ? lista[0] ?? null : null);

  if ((loading && documents.length === 0 && folders.length === 0) || (cargando && terceros.length === 0 && folders.length === 0)) {
    return <CargandoVista />;
  }

  if (terceros.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-6 py-12 text-center" data-qa="terceros-vacio">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-muted)]">
          <UserPlus className="h-6 w-6 text-[var(--accent-ink)] dark:text-[var(--accent)]" />
        </span>
        <p className="flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
          Todavía no vinculaste carpetas a nadie.
          <InfoTip
            what="Clic derecho en una carpeta (o su «⋯» en el panel) › «Vincular a un tercero…»."
            affects="La carpeta y sus subcarpetas aparecen acá, bajo la persona, el proveedor o la comunidad que elijas."
            example="«Contrato del local» → Juana Pérez; «Guías 2026» → Comunidad Nativa Callería."
          />
        </p>
        <button type="button" onClick={() => irAVista("all")} className={cn(button({ variant: "secondary" }), "gap-2")}>
          <FolderOpen className="h-4 w-4" /> Ir a mis carpetas
        </button>
      </div>
    );
  }

  return (
    <div
      ref={refVista}
      className={cn("grid gap-4", dosColumnas && "grid-cols-[18rem_minmax(0,1fr)]")}
      data-qa="vista-terceros"
      data-columnas={dosColumnas ? 2 : 1}
    >
      <aside className={cn("min-w-0", dosColumnas ? "sticky top-4 self-start" : elegido && "hidden")}>
        <ListaTerceros
          todos={terceros}
          lista={lista}
          q={q}
          setQ={setQ}
          tipo={tipo}
          setTipo={setTipo}
          elegida={elegido?.clave ?? null}
          onElegir={setClave}
        />
        {error && (
          <p className="mt-3 text-xs text-[var(--data-warning-ink)]" role="status">
            No cargaron los nombres ({error}); los ves como «sin ficha».
          </p>
        )}
      </aside>
      {elegido && (
        <div className="min-w-0 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
          <DetalleTercero key={elegido.clave} tercero={elegido} arch={arch} onVolver={dosColumnas ? undefined : () => setClave(null)} />
        </div>
      )}
    </div>
  );
}
