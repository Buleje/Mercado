"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Route } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { slugKey } from "@/lib/forestal/sembrar-reparto";
import { permisosDelLote } from "@/lib/forestal/recorrido-pantalla";

/**
 * Aviso del cubicador (ADR-519, fase 4): si la madera del lote viene de un
 * permiso —el título habilitante de la ficha o un bloque de la Distribución
 * con permiso—, una línea que lleva a su recorrido. No cambia nada del lote.
 */

const RUTA = "/admin?tab=forestal-herramientas&vista=resumenes&sub=bloques";

type BloqueConPermiso = { id: string; permiso?: string | null };

function bloquesDelDispositivo(): BloqueConPermiso[] {
  try {
    const raw = localStorage.getItem(slugKey("-rolliza"));
    const lista: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(lista)
      ? lista.filter((b): b is BloqueConPermiso => typeof b === "object" && b !== null && typeof (b as { id?: unknown }).id === "string")
      : [];
  } catch {
    return [];
  }
}

export default function AvisoPermisoCubicador({ titulo }: { titulo?: string | null }) {
  /* Los bloques viven en el dispositivo: se leen al montar y cuando otra pestaña los cambia. */
  const [bloques, setBloques] = useState<BloqueConPermiso[]>([]);
  useEffect(() => {
    setBloques(bloquesDelDispositivo());
    const alCambiar = (e: StorageEvent) => {
      if (e.key === slugKey("-rolliza")) setBloques(bloquesDelDispositivo());
    };
    window.addEventListener("storage", alCambiar);
    return () => window.removeEventListener("storage", alCambiar);
  }, []);

  const { permisos, bloqueId } = permisosDelLote(titulo, bloques);
  if (permisos.length === 0) return null;
  const href = bloqueId ? `${RUTA}&recorrido=${encodeURIComponent(bloqueId)}` : RUTA;

  return (
    <p data-aviso-permiso className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-[var(--text-secondary)]">
      <Route className="h-4 w-4 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden />
      <span>
        Madera del permiso <span className="font-bold text-[var(--text-primary)]">{permisos.join(", ")}</span>
      </span>
      <Link href={href} className="font-bold text-[var(--accent-ink)] underline-offset-2 hover:underline dark:text-[var(--accent)]">
        Ver su recorrido
      </Link>
      <InfoTip
        title="Recorrido del permiso"
        what="La madera con permiso sigue seis pasos hasta salir: datos listos, trozas elegidas, lote, consumo y producción, Anexo 04 y la salida con su guía. El recorrido de cada bloque está en Resúmenes › Bloques."
        affects="Enviar este lote al Libro no reemplaza esos pasos: el lote y las jornadas del permiso se registran desde la Distribución."
        example="Permiso 25-UCA-PER-001 → Vas en el paso 3 de 6"
      />
    </p>
  );
}
