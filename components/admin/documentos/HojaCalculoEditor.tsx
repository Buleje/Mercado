"use client";

/**
 * HojaCalculoEditor — abre una planilla del drive, la deja editar y la guarda
 * de vuelta en el panel como una VERSIÓN NUEVA del mismo documento.
 *
 * Antes, para corregir un precio en una lista había que: descargar, abrir
 * Excel, editar, guardar, volver al panel y subirla otra vez (perdiendo el
 * hilo de versiones si le cambiabas el nombre). Ahora se edita en la pestaña y
 * al guardar queda en su lugar, con historial.
 *
 * Guarda con Ctrl+S y también solo, a los 30 s de la última tecla. El archivo
 * original NUNCA se pisa: cada guardado es una versión más, así que siempre se
 * puede volver atrás desde la ficha del documento.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, Columns3, Loader2, Rows3, Save, Table, Trash2 } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  escribirXlsx, formatoDe, generarCsv, leerXlsx, parsearCsv, rectangular,
  type HojaDatos,
} from "@/lib/documentos/hoja-calculo";

type Estado = "cargando" | "listo" | "guardando" | "error";

/**
 * Cada autoguardado crea una versión y consume presupuesto de rate limit
 * (20 / 5 min en el endpoint). A 30 s, una sesión larga de edición se topaba
 * con el límite justo mientras se trabajaba; a 2 min entra cómodo y sigue
 * siendo una red de seguridad razonable. Para guardar ya, está Ctrl+S.
 */
const AUTOGUARDADO_MS = 120_000;

export default function HojaCalculoEditor({
  docId, nombre, mimeType,
}: {
  docId: string;
  nombre: string;
  mimeType: string;
}) {
  const [hojas, setHojas] = useState<HojaDatos[]>([]);
  const [activa, setActiva] = useState(0);
  const [estado, setEstado] = useState<Estado>("cargando");
  const [error, setError] = useState<string | null>(null);
  const [sucio, setSucio] = useState(false);
  const [guardadoEn, setGuardadoEn] = useState<Date | null>(null);
  const formato = useMemo(() => formatoDe(mimeType, nombre), [mimeType, nombre]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Cargar ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        // `no-store`: si el navegador sirviera una copia cacheada, el editor
        // abriría una versión anterior y el próximo guardado PISARÍA cambios
        // que ya estaban guardados.
        const r = await fetch(`/api/admin/documents/${docId}/raw`, { credentials: "include", cache: "no-store" });
        if (!r.ok) throw new Error(`No se pudo abrir el archivo (HTTP ${r.status})`);
        const buf = await r.arrayBuffer();
        const leidas = formato === "csv"
          ? [{ nombre: "Hoja1", filas: rectangular(parsearCsv(new TextDecoder().decode(buf))), tieneFormulas: false }]
          : await leerXlsx(buf);
        if (cancelado) return;
        setHojas(leidas);
        setEstado("listo");
      } catch (e) {
        if (cancelado) return;
        setError(e instanceof Error ? e.message : String(e));
        setEstado("error");
      }
    })();
    return () => { cancelado = true; };
  }, [docId, formato]);

  // ── Guardar ───────────────────────────────────────────────────────────────
  const guardar = useCallback(async () => {
    if (estado === "guardando" || hojas.length === 0) return;
    setEstado("guardando");
    setError(null);
    try {
      const blob = formato === "csv"
        ? new Blob([generarCsv(hojas[0].filas)], { type: "text/csv" })
        : await escribirXlsx(hojas);

      const fd = new FormData();
      fd.append("file", new File([blob], nombre, { type: blob.type }));
      fd.append("changeNote", "Editado desde el panel");

      const r = await fetch(`/api/admin/documents/${docId}/versions`, {
        method: "POST",
        headers: csrfHeaders(),
        credentials: "include",
        body: fd,
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        // El 429 no pierde nada: lo editado sigue en pantalla y el próximo
        // intento lo guarda. Decirlo evita que el usuario crea que se borró.
        if (r.status === 429) {
          const seg = Number(j.retryAfter) || 60;
          throw new Error(`Demasiados guardados seguidos. Tus cambios siguen acá: probá de nuevo en ${Math.ceil(seg / 60)} min.`);
        }
        throw new Error(j.error === "too_large" ? "El archivo quedó demasiado grande." : (j.message ?? `No se pudo guardar (HTTP ${r.status})`));
      }
      setSucio(false);
      setGuardadoEn(new Date());
      setEstado("listo");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setEstado("listo");
    }
  }, [docId, estado, formato, hojas, nombre]);

  // Autoguardado: 30 s después de la última tecla, no mientras se escribe.
  useEffect(() => {
    if (!sucio || estado !== "listo") return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { void guardar(); }, AUTOGUARDADO_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [sucio, estado, guardar]);

  // Ctrl+S / Cmd+S — el reflejo de cualquiera que edita una planilla.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void guardar();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [guardar]);

  // Cerrar con cambios sin guardar avisa (el autoguardado puede no haber corrido).
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (sucio) e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [sucio]);

  // ── Edición ───────────────────────────────────────────────────────────────
  const editarCelda = (f: number, c: number, v: string) => {
    setHojas((prev) => prev.map((h, i) => {
      if (i !== activa) return h;
      const filas = h.filas.map((fila, fi) => (fi === f ? fila.map((cel, ci) => (ci === c ? v : cel)) : fila));
      return { ...h, filas };
    }));
    setSucio(true);
  };

  const agregarFila = () => {
    setHojas((prev) => prev.map((h, i) => (i === activa ? { ...h, filas: [...h.filas, new Array(h.filas[0]?.length ?? 1).fill("")] } : h)));
    setSucio(true);
  };
  const agregarColumna = () => {
    setHojas((prev) => prev.map((h, i) => (i === activa ? { ...h, filas: h.filas.map((f) => [...f, ""]) } : h)));
    setSucio(true);
  };
  const borrarFila = (f: number) => {
    setHojas((prev) => prev.map((h, i) => (i === activa && h.filas.length > 1 ? { ...h, filas: h.filas.filter((_, fi) => fi !== f) } : h)));
    setSucio(true);
  };

  /**
   * Moverse como en una planilla: Enter/flechas bajan, suben y cruzan de
   * columna. Sin esto hay que ir con el mouse celda por celda, que es
   * justamente lo que hace lenta la carga de una lista de precios.
   * (Tab ya lo resuelve el navegador.)
   */
  const navegar = (e: React.KeyboardEvent<HTMLInputElement>, f: number, c: number) => {
    const salto: Record<string, [number, number]> = {
      Enter: [1, 0], ArrowDown: [1, 0], ArrowUp: [-1, 0],
    };
    // Las flechas laterales sólo saltan de celda si el cursor ya está en el
    // borde del texto; si no, se usan para mover el cursor dentro de la celda.
    const inp = e.currentTarget;
    if (e.key === "ArrowLeft" && inp.selectionStart === 0) salto.ArrowLeft = [0, -1];
    if (e.key === "ArrowRight" && inp.selectionStart === inp.value.length) salto.ArrowRight = [0, 1];

    const mov = salto[e.key];
    if (!mov) return;
    const destino = document.querySelector<HTMLInputElement>(`[data-celda="${f + mov[0]}-${c + mov[1]}"]`);
    if (!destino) return;
    e.preventDefault();
    destino.focus();
    destino.select();
  };

  const hoja = hojas[activa];

  if (estado === "cargando") {
    return <div className="p-16 text-center text-[var(--text-tertiary)]"><Loader2 className="mx-auto h-6 w-6 animate-spin" /><p className="mt-2 text-sm">Abriendo la planilla…</p></div>;
  }
  if (estado === "error" && !hoja) {
    return (
      <div className="m-6 rounded-2xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-6 text-sm text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
        <AlertTriangle className="mb-2 h-6 w-6" /> {error}
      </div>
    );
  }
  if (!hoja) return null;

  return (
    <div className="flex h-screen flex-col bg-[var(--surface-canvas)]">
      {/* Barra: qué archivo es, en qué estado está y cómo guardarlo. */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          {/* La pestaña se abre suelta: sin esto, la única vuelta al panel es
              el botón atrás del navegador (que además dispara el aviso de
              cambios sin guardar). */}
          <a
            href="/admin?tab=documentos#documentos"
            title="Volver a Documentación"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)] hover:text-[var(--text-primary)]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            <span className="sr-only">Volver a Documentación</span>
          </a>
          <Table className="hidden h-5 w-5 shrink-0 text-[var(--accent)] sm:block" aria-hidden />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-[var(--text-primary)]">{nombre}</p>
            <p className="text-xs text-[var(--text-tertiary)]">
              {sucio ? "Cambios sin guardar" : guardadoEn ? `Guardado ${guardadoEn.toLocaleTimeString("es-PE")} · nueva versión en tu panel` : "Sin cambios"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* En pantalla chica queda el ícono solo: el título del archivo y el
              estado de guardado importan más que las etiquetas. */}
          <button type="button" onClick={agregarFila} title="Agregar una fila" className="inline-flex h-10 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]">
            <Rows3 className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Fila</span><span className="sr-only sm:hidden">Agregar fila</span>
          </button>
          <button type="button" onClick={agregarColumna} title="Agregar una columna" className="inline-flex h-10 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]">
            <Columns3 className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Columna</span><span className="sr-only sm:hidden">Agregar columna</span>
          </button>
          <button
            type="button"
            onClick={() => void guardar()}
            disabled={estado === "guardando" || !sucio}
            title="Guardar en el panel (Ctrl+S)"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-white hover:bg-[var(--accent-600)] disabled:opacity-50"
          >
            {estado === "guardando" ? <Loader2 className="h-4 w-4 animate-spin" /> : sucio ? <Save className="h-4 w-4" /> : <Check className="h-4 w-4" />}
            {estado === "guardando" ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </header>

      {error && (
        <p className="border-b-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-4 py-2 text-sm font-semibold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">{error}</p>
      )}
      {hoja.tieneFormulas && (
        <p className="border-b-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-4 py-2 text-xs font-semibold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
          Esta planilla tiene fórmulas. Acá ves su resultado, y al guardar se guarda ese resultado —no la fórmula—. El archivo anterior queda como versión por si lo necesitás.
        </p>
      )}

      {hojas.length > 1 && (
        <div className="flex gap-1 overflow-x-auto border-b-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-1.5">
          {hojas.map((h, i) => (
            <button key={h.nombre + i} type="button" onClick={() => setActiva(i)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold transition ${i === activa ? "bg-[var(--accent)] text-white" : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"}`}>
              {h.nombre}
            </button>
          ))}
        </div>
      )}

      {/* Grilla */}
      <div className="min-h-0 flex-1 overflow-auto p-3">
        <table className="border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-20 w-10 border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-1" />
              {hoja.filas[0]?.map((_, c) => (
                <th key={c} className="sticky top-0 z-10 min-w-[8rem] border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-2 py-1 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">
                  {columnaLabel(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {hoja.filas.map((fila, f) => (
              <tr key={f}>
                <td className="sticky left-0 z-10 border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-1 text-center">
                  <button type="button" onClick={() => borrarFila(f)} title={`Borrar la fila ${f + 1}`}
                    className="group flex h-7 w-8 items-center justify-center text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] hover:text-[var(--data-error-600)]">
                    <span className="group-hover:hidden">{f + 1}</span>
                    <Trash2 className="hidden h-3.5 w-3.5 group-hover:block" />
                  </button>
                </td>
                {fila.map((celda, c) => (
                  <td key={c} className="border border-[var(--rule-base)] p-0">
                    <input
                      value={celda}
                      onChange={(e) => editarCelda(f, c, e.target.value)}
                      onKeyDown={(e) => navegar(e, f, c)}
                      data-celda={`${f}-${c}`}
                      aria-label={`${columnaLabel(c)}${f + 1}`}
                      className="h-9 w-full min-w-[8rem] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-primary)] outline-none focus:bg-[var(--accent-soft)] focus:ring-2 focus:ring-inset focus:ring-[var(--accent)] dark:focus:bg-[var(--accent)]/12"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** 0 → A, 25 → Z, 26 → AA (como Excel). */
function columnaLabel(i: number): string {
  let s = "";
  let n = i;
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
}
