"use client";

/**
 * «¿Cuadran las medidas?» en Faltante y cierre (Brandon, 2026-10-19): cada
 * pieza que el reparto le dio a un bloque contra las trozas que lo respaldan.
 * Una pieza de 20 pies pide una troza de ~6 m; un 2×12″ pide ~31 cm de Ø (la
 * diagonal, ADR-505). Lo que no cuadra sale como ADVERTENCIA: no frena el
 * reparto ni el papel; con la regla activa el reparto ya no lo produce.
 * Las reglas y tolerancias viven en `lib/forestal/cuadre-medidas-rolliza.ts`.
 */

import { AlertTriangle, Check, Loader2, Ruler } from "@buleje/design-system/icons";
import {
  TOLERANCIA_DIAMETRO_CM,
  TOLERANCIA_LARGO_M,
  type CuadreBloqueMedidas,
  type EstadoCuadreMedidas,
} from "@/lib/forestal/cuadre-medidas-rolliza";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CuadreMedidasEstado } from "./hooks/use-cuadre-medidas";
import { bloqueEnPermiso, SIN_PERMISO, type PermisoDeRolliza } from "./hooks/use-permiso-de-rolliza";
import { SeccionResumen } from "./resumen-tabla";

const ORDEN: Record<EstadoCuadreMedidas, number> = { advertencia: 0, "sin-medidas": 1, cuadra: 2, "sin-piezas": 3 };
const m = (v: number) => formatNumber(v, 2);
const cm = (v: number) => formatNumber(v, 0);

const AYUDA = (
  <span>
    <b>Largo:</b> la pieza (pies × 0,3048 = m) no puede ser más larga que la troza más larga del bloque. Holgura de{" "}
    {TOLERANCIA_LARGO_M * 100} cm: una pieza de 20 pies (6,10 m) sale de una troza de 6,00 m, porque el pie comercial se redondea a 30 cm.
    <br />
    <b className="mt-1 inline-block">Diámetro:</b> la diagonal de la sección (√(ancho² + espesor²), pulgadas × 2,54 = cm) no puede pasar el
    Ø de la troza más gruesa, medido en la punta DELGADA (el menor entre D1 y D2), con {TOLERANCIA_DIAMETRO_CM} cm de holgura por la cinta.
    Ejemplo: un 6×12″ pide 34 cm de Ø, no 30,5.
    <br />
    <b className="mt-1 inline-block">La misma troza:</b> si las largas son delgadas y las gruesas cortas, la pieza tampoco pudo salir.
    <br />
    <b className="mt-1 inline-block">De dónde salen las trozas:</b> las que eligió el bloque, las de su lote, las del cubicador de trozas o
    las del Libro con su mismo permiso y especie. Desde el 20-10 el reparto ya respeta esta regla al distribuir: lo que queda acá es lo
    puesto a mano o un bloque marcado «sin respetar medidas». Es un aviso: no frena el reparto ni el Anexo 04.
    <br />
    <b className="mt-1 inline-block">Sin comprobar:</b> piezas que ninguna troza con medidas podía dar y el reparto puso en un bloque sin
    medidas de troza: no se sabe si cuadran.
  </span>
);

function Estado({ b }: { b: CuadreBloqueMedidas }) {
  if (b.estado === "advertencia")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--data-warning-500)]/15 px-2 py-0.5 text-xs font-bold text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> {b.piezasConAviso} {b.piezasConAviso === 1 ? "pieza no cuadra" : "piezas no cuadran"}
      </span>
    );
  if (b.estado === "cuadra")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--data-success-500)]/15 px-2 py-0.5 text-xs font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
        <Check className="h-3.5 w-3.5" aria-hidden /> Cuadra
      </span>
    );
  return (
    <span className="rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-xs font-bold text-[var(--text-secondary)]">
      {b.estado === "sin-medidas" ? "Sin medidas de troza para comparar" : "Sin piezas repartidas"}
    </span>
  );
}

function FilaBloque({ b }: { b: CuadreBloqueMedidas }) {
  const r = b.respaldo;
  return (
    <li className={cn("rounded-xl border p-3", b.estado === "advertencia" ? "border-[var(--data-warning-500)]/60" : "border-[var(--rule-soft)]")}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <b className="text-sm text-[var(--text-primary)]">{b.etiqueta.trim() || "Sin etiqueta"}</b>
        <span className="text-sm text-[var(--text-secondary)]">
          {b.especie || "Sin especie"}
          {b.permiso ? ` · ${b.permiso}` : ""}
        </span>
        <Estado b={b} />
      </div>
      {r.trozas > 0 && (
        <p className="mt-1 text-xs text-[var(--text-tertiary)]">
          Troza más larga <b className="font-mono tabular-nums text-[var(--text-secondary)]">{r.largoMaxM != null ? `${m(r.largoMaxM)} m` : "—"}</b>
          {" · "}más gruesa <b className="font-mono tabular-nums text-[var(--text-secondary)]">{r.diametroMaxCm != null ? `${cm(r.diametroMaxCm)} cm Ø` : "—"}</b>
          {b.fuente ? ` · ${b.fuente.startsWith("el ") ? `del ${b.fuente.slice(3)}` : `de ${b.fuente}`}` : ""}
        </p>
      )}
      {b.piezasSinComprobar > 0 && (
        <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)]">
          <Ruler className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
          {b.piezasSinComprobar} {b.piezasSinComprobar === 1 ? "pieza sin comprobar" : "piezas sin comprobar"}: el bloque no tiene medidas de troza
        </p>
      )}
      {b.avisos.length > 0 && (
        <ul className="mt-2 space-y-1">
          {b.avisos.map((a) => (
            <li key={a.medida} className="flex items-start gap-2 text-sm text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>{a.texto}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export default function RepartoCuadreMedidas({ estado, permiso }: { estado: CuadreMedidasEstado; permiso: PermisoDeRolliza }) {
  const { cuadre, cargando } = estado;
  const elegido = permiso.elegido;
  const visibles = cuadre.bloques
    .filter((b) => bloqueEnPermiso(b, elegido))
    .sort((a, b) => ORDEN[a.estado] - ORDEN[b.estado] || b.piezasConAviso - a.piezasConAviso);
  const conAviso = visibles.filter((b) => b.estado === "advertencia");
  const fuera = cuadre.bloques.filter((b) => b.estado === "advertencia" && !bloqueEnPermiso(b, elegido)).length;
  const sinMedidas = visibles.every((b) => b.estado === "sin-medidas" || b.estado === "sin-piezas");

  return (
    <SeccionResumen
      icon={Ruler}
      titulo="¿Cuadran las medidas?"
      ayuda={AYUDA}
      hint={
        cuadre.bloques.length === 0
          ? "Carga bloques de rolliza para comparar sus piezas con sus trozas."
          : conAviso.length > 0
            ? `${conAviso.reduce((s, b) => s + b.piezasConAviso, 0)} piezas en ${conAviso.length} ${conAviso.length === 1 ? "bloque" : "bloques"} no salen de ninguna troza del bloque`
            : sinMedidas
              ? "Sin medidas de troza para comparar"
              : cuadre.piezasSinComprobar > 0
                ? `Cada pieza cabe en alguna troza de su bloque · ${cuadre.piezasSinComprobar} sin comprobar`
                : "Cada pieza cabe en alguna troza de su bloque"
      }
      acciones={
        elegido ? (
          <button
            type="button"
            onClick={() => permiso.elegir("")}
            className="inline-flex h-12 items-center rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
          >
            Sólo {elegido === SIN_PERMISO ? "sin permiso" : elegido} · ver todos{fuera > 0 ? ` (${fuera} con aviso)` : ""}
          </button>
        ) : undefined
      }
    >
      {cargando && cuadre.bloques.every((b) => b.estado !== "advertencia") && (
        <p className="mb-2 inline-flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Leyendo las trozas del Libro…
        </p>
      )}
      {visibles.length > 0 && (
        <ul className="space-y-2" aria-label="Medidas de cada bloque contra sus trozas">
          {visibles.map((b) => (
            <FilaBloque key={b.bloqueId} b={b} />
          ))}
        </ul>
      )}
    </SeccionResumen>
  );
}
