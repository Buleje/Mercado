"use client";

/**
 * Biblioteca de fotos de referencia de las especies.
 *
 * Del ERP forestal de referencia (módulo `baseimg`), acotado a lo que sirve: una
 * foto por especie, subida por el propio CTP. Ellos también buscaban imágenes en
 * internet con un flujo de sugerencias y aprobación; una foto de origen
 * desconocido al lado de un nombre científico en un libro oficial es peor que no
 * tener foto.
 *
 * La lista de "especies sin foto" sale del propio libro Y del catálogo de la
 * planta (ADR-410): la biblioteca dice qué falta en vez de esperar que uno se
 * acuerde. Son la MISMA lista de especies vista desde otro lado — por eso la
 * foto se pide contra el catálogo, el científico sale de ahí, y el botón para
 * crear o corregir una especie está en esta pantalla y no en otra.
 *
 * Antes esto se armaba trayendo 5.000 ingresos y todas las corridas sólo para
 * mirarles la columna «especie»: media biblioteca de datos para catorce
 * nombres. Ahora lo resuelve el endpoint del catálogo, que ya los agrupa.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { AlertTriangle, Loader2, Trash2, Trees, Upload } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { especiesSinFoto } from "@/lib/forestal/especies-fotos";
import { useEspeciesFotos } from "./hooks/use-especies-fotos";
import { CtpEspeciesBoton, useEspeciesConCatalogo } from "./ctp-especie-campo";

export default function EspeciesFotosBiblioteca() {
  const { fotos, indice, cargando, recargar } = useEspeciesFotos();
  /* Una sola fuente para las dos listas: el catálogo de la planta y lo que el
     libro ya tiene escrito, con su científico. */
  const catalogo = useEspeciesConCatalogo({ conLibro: true });
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nueva, setNueva] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const objetivo = useRef<{ nombre: string; cientifico: string } | null>(null);

  /* Qué falta: las del catálogo Y las que el libro nombra. Una especie que la
     planta dio de alta pero todavía no cargó merece su foto igual —es la que
     va a llegar mañana— y una que está en el libro y no en el catálogo también:
     la foto sirve en el patio aunque la lista esté incompleta. */
  /**
   * Qué falta, **ordenado por cuánto entra de cada una**.
   *
   * Alfabético mandaba a empezar por «Ana Caspi» (4 filas en el libro) y dejaba
   * «Cachimbo» —16 filas, la que de verdad baja del camión— para el final. La
   * foto sirve en el patio, y el patio no está ordenado alfabéticamente.
   */
  const faltan = useMemo(() => {
    const nombres = especiesSinFoto(indice, [
      ...catalogo.nombres,
      ...catalogo.delLibro.map((e) => e.nombre),
    ]);
    const usosDe = (n: string) =>
      catalogo.delLibro.find((e) => e.nombre === n)?.usos ?? 0;
    return nombres
      .map((nombre) => ({ nombre, usos: usosDe(nombre) }))
      .sort((a, b) => b.usos - a.usos || a.nombre.localeCompare(b.nombre, "es"));
  }, [indice, catalogo.nombres, catalogo.delLibro]);
  const cientificoDe = useCallback(
    (comun: string) =>
      catalogo.cientificoDe(comun) ??
      catalogo.delLibro.find((e) => e.nombre === comun)?.cientifico ??
      "",
    [catalogo],
  );

  const pedirArchivo = (nombre: string, cientifico: string) => {
    setError(null);
    objetivo.current = { nombre, cientifico };
    inputRef.current?.click();
  };

  const subir = async (file: File) => {
    const destino = objetivo.current;
    if (!destino) return;
    setSubiendo(destino.nombre);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "image-bank");
      // El POST pasa por el guard CSRF del middleware: sin el header es 403.
      const up = await fetch("/api/upload", {
        method: "POST",
        credentials: "include",
        headers: csrfHeaders(),
        body: fd,
      });
      const upBody = (await up.json()) as { url?: string; error?: string };
      if (!up.ok || !upBody.url) throw new Error(upBody.error ?? "No se pudo subir la imagen.");

      const r = await fetch("/api/admin/forestal/especies-fotos", {
        method: "POST",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ nombre: destino.nombre, cientifico: destino.cientifico, url: upBody.url }),
      });
      const body = (await r.json()) as { error?: string; message?: string };
      if (!r.ok) throw new Error(body.message ?? body.error ?? "No se pudo guardar la foto.");
      await recargar();
      setNueva("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubiendo(null);
      objetivo.current = null;
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const quitar = async (nombre: string) => {
    setError(null);
    try {
      const r = await fetch(`/api/admin/forestal/especies-fotos?especie=${encodeURIComponent(nombre)}`, {
        method: "DELETE",
        credentials: "include",
        headers: csrfHeaders(),
      });
      if (!r.ok) throw new Error("No se pudo quitar la foto.");
      await recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void subir(f);
        }}
      />

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3 ">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Trees className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <CardTitle as="h3" className="text-base font-bold text-[var(--text-primary)]">
            Fotos de referencia por especie
          </CardTitle>
          <p className="text-sm text-[var(--text-secondary)]">
            La foto aparece al lado del nombre en Ingresos y Trozas. Sirve para que quien recibe la madera no
            confunda dos especies parecidas — no reemplaza la identificación del documento.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            placeholder="Otra especie…"
            className="h-12 w-48 rounded-2xl border border-[var(--rule-base)] bg-transparent px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
          />
          <button
            type="button"
            disabled={!nueva.trim() || subiendo !== null}
            onClick={() => pedirArchivo(nueva.trim(), cientificoDe(nueva.trim()))}
            className="flex h-12 items-center gap-2 rounded-2xl border border-[var(--rule-base)] px-4 text-sm font-semibold text-[var(--text-primary)] disabled:opacity-40"
          >
            <Upload className="h-4 w-4" aria-hidden /> Subir
          </button>
          {/* El catálogo, desde acá: la foto y el nombre son la misma especie,
              y corregir uno no puede costar cambiar de pantalla. */}
          <CtpEspeciesBoton onClick={catalogo.abrir} className="h-12 rounded-2xl px-4 text-sm" />
        </div>
      </div>

      {catalogo.modal}

      {error && (
        <div className="flex items-start gap-2 rounded-2xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-4 py-3 text-sm text-[var(--data-error-700)] dark:bg-transparent dark:text-[var(--data-error-500)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      {faltan.length > 0 && (
        <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-3">
          <p className="mb-2 text-sm font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            {/* Dice «y del catálogo» porque la lista dejó de ser sólo lo cargado:
                una especie dada de alta y todavía sin madera también va acá. */}
            Especies sin foto ({faltan.length}) · primero las que más recibís
          </p>
          <div className="flex flex-wrap gap-2">
            {faltan.map((e) => (
              <button
                key={e.nombre}
                type="button"
                disabled={subiendo !== null}
                onClick={() => pedirArchivo(e.nombre, cientificoDe(e.nombre))}
                title={
                  e.usos > 0
                    ? `${e.nombre} aparece en ${e.usos} fila${e.usos === 1 ? "" : "s"} del libro`
                    : `${e.nombre} está en el catálogo y todavía no entró al libro`
                }
                className="flex items-center gap-1.5 rounded-xl border border-dashed border-[var(--rule-base)] px-3 min-h-10 text-sm text-[var(--text-secondary)] hover:border-primary hover:text-[var(--text-primary)] disabled:opacity-40"
              >
                {subiendo === e.nombre ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Upload className="h-4 w-4" aria-hidden />
                )}
                {e.nombre}
                {/* El número dice por dónde empezar: es cuántas filas del libro
                    la nombran, no un adorno. */}
                {e.usos > 0 && (
                  <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">
                    {e.usos}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {cargando ? (
        <div className="flex items-center gap-2 px-1 py-6 text-sm text-[var(--text-secondary)]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cargando la biblioteca…
        </div>
      ) : fotos.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--rule-base)] px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
          Todavía no hay fotos cargadas. Empezá por las especies que más recibís.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {fotos.map((f) => (
            <li
              key={f.clave}
              className="overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] "
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url} alt={`Foto de ${f.nombre}`} className="h-32 w-full object-cover" loading="lazy" />
              <div className="p-3">
                <p className="truncate text-sm font-bold text-[var(--text-primary)]">{f.nombre}</p>
                {f.cientifico && (
                  <p className="truncate text-sm italic text-[var(--text-secondary)]">{f.cientifico}</p>
                )}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="truncate text-[length:var(--ts-2xs,11px)] text-[var(--text-tertiary)]">
                    {f.actualizadoPor}
                  </span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => pedirArchivo(f.nombre, f.cientifico)}
                      className="rounded-xl p-1.5 text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
                      title="Reemplazar la foto"
                    >
                      <Upload className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => void quitar(f.nombre)}
                      className="rounded-xl p-1.5 text-[var(--text-secondary)] hover:bg-[var(--data-error-50)] hover:text-[var(--data-error-700)] dark:hover:bg-transparent dark:hover:text-[var(--data-error-500)]"
                      title="Quitar la foto"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
