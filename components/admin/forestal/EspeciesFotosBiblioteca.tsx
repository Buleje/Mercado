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
import { AlertTriangle, ChevronDown, Loader2, Upload } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { csrfHeaders } from "@/lib/csrf-client";
import { especiesSinFoto, type FotoEspecie } from "@/lib/forestal/especies-fotos";
import { useEspeciesFotos } from "./hooks/use-especies-fotos";
import { Btn } from "./ctp-shared";
import { CtpEspeciesBoton, useEspeciesConCatalogo } from "./ctp-especie-campo";
import EspecieFotoTarjeta from "./EspecieFotoTarjeta";

/** Chips «sin foto» a la vista antes de «Ver las N restantes»: tres filas a 1280 px. */
const SIN_FOTO_VISIBLES = 12;

export default function EspeciesFotosBiblioteca() {
  const { fotos, indice, cargando, recargar } = useEspeciesFotos();
  /* Una sola fuente para las dos listas: el catálogo de la planta y lo que el
     libro ya tiene escrito, con su científico. */
  const catalogo = useEspeciesConCatalogo({ conLibro: true });
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nueva, setNueva] = useState("");
  const [todasSinFoto, setTodasSinFoto] = useState(false);
  /* Quitar pide confirmación (11-10): antes el tacho la borraba de un clic. */
  const [aQuitar, setAQuitar] = useState<FotoEspecie | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const objetivo = useRef<{ nombre: string; cientifico: string } | null>(null);

  /* Qué falta: las del catálogo (la que llega mañana) Y las que el libro nombra
     aunque no estén en el catálogo (la foto sirve en el patio igual). */
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

      {/* Una fila: cuántas hay y faltan (ⓘ) · otra especie + Subir + catálogo. Sin título: la cabina ya lo dice. */}
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-[var(--text-secondary)]">
          {/* Mientras carga no se dice «0 con foto»: se leería como el dato real. */}
          <span className={cargando ? "invisible" : undefined}>
            <strong className="font-mono tabular-nums text-[var(--text-primary)]">{fotos.length}</strong>{" "}
            {fotos.length === 1 ? "especie con foto" : "especies con foto"}
            {faltan.length > 0 && (
              <>
                {" · "}
                <strong className="font-mono tabular-nums text-[var(--text-primary)]">{faltan.length}</strong> sin foto
              </>
            )}
          </span>
          <InfoTip
            title="Fotos de referencia por especie"
            what="La foto aparece al lado del nombre en Ingresos y Trozas."
            affects="Sirve para que quien recibe la madera no confunda dos especies parecidas — no reemplaza la identificación del documento."
            example="Tornillo y Shihuahuaco se confunden en trozas recién taladas: la foto de referencia ayuda a distinguirlas."
          />
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            placeholder="Otra especie…"
            aria-label="Nombre de otra especie para subirle foto"
            className="h-12 w-48 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
          />
          <button
            type="button"
            disabled={!nueva.trim() || subiendo !== null}
            onClick={() => pedirArchivo(nueva.trim(), cientificoDe(nueva.trim()))}
            className="flex h-12 items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] disabled:opacity-40"
          >
            <Upload className="h-4 w-4" aria-hidden /> Subir
          </button>
          {/* El catálogo, desde acá: la foto y el nombre son la misma especie,
              y corregir uno no puede costar cambiar de pantalla. */}
          <CtpEspeciesBoton onClick={catalogo.abrir} className="h-12! rounded-xl! px-4! text-sm! text-[var(--text-primary)]!" />
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
          <p className="mb-2 text-sm font-bold text-[var(--text-secondary)]">
            {/* La lista no es sólo lo cargado: una especie dada de alta y todavía
                sin madera también va acá. La cuenta ya está en la fila de arriba. */}
            Sin foto · primero las que más recibes
          </p>
          <div className="flex flex-wrap gap-2">
            {(todasSinFoto ? faltan : faltan.slice(0, SIN_FOTO_VISIBLES)).map((e) => (
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
                className="flex min-h-12 items-center gap-1.5 rounded-xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-secondary)] hover:border-primary hover:text-[var(--text-primary)] disabled:opacity-40"
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
                  <span className="font-mono text-sm font-bold tabular-nums text-[var(--text-tertiary)]">
                    {e.usos}
                  </span>
                )}
              </button>
            ))}
            {faltan.length > SIN_FOTO_VISIBLES && (
              <button
                type="button"
                onClick={() => setTodasSinFoto((v) => !v)}
                aria-expanded={todasSinFoto}
                className="inline-flex min-h-12 items-center gap-1.5 rounded-xl px-3 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
              >
                {todasSinFoto ? "Ver menos" : `Ver las ${faltan.length - SIN_FOTO_VISIBLES} restantes`}
                <ChevronDown className={`h-4 w-4 transition-transform ${todasSinFoto ? "rotate-180" : ""}`} aria-hidden />
              </button>
            )}
          </div>
        </div>
      )}

      {cargando ? (
        <div className="flex items-center gap-2 px-1 py-6 text-sm text-[var(--text-secondary)]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cargando la biblioteca…
        </div>
      ) : fotos.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--rule-base)] px-4 py-6 text-center text-sm text-[var(--text-secondary)]">
          Todavía no hay fotos cargadas. Empieza por las especies que más recibes.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {fotos.map((f) => (
            <EspecieFotoTarjeta
              key={f.clave}
              f={f}
              ocupado={subiendo !== null}
              onReemplazar={(x) => pedirArchivo(x.nombre, x.cientifico)}
              onQuitar={setAQuitar}
            />
          ))}
        </ul>
      )}

      <AdminModal
        open={Boolean(aQuitar)}
        onClose={() => setAQuitar(null)}
        title="Quitar la foto"
        description={aQuitar?.nombre}
        variant="centered-sm"
        footer={
          <div className="flex justify-end gap-2">
            <Btn variant="secondary" onClick={() => setAQuitar(null)}>Cancelar</Btn>
            <Btn
              variant="danger"
              onClick={() => {
                if (aQuitar) void quitar(aQuitar.nombre);
                setAQuitar(null);
              }}
            >
              Quitar
            </Btn>
          </div>
        }
      >
        <p className={`${MODAL_BODY} text-sm text-[var(--text-secondary)]`}>
          Ingresos y Trozas dejan de mostrarla al lado del nombre. Puedes subir otra cuando quieras.
        </p>
      </AdminModal>
    </div>
  );
}
