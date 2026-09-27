"use client";

/**
 * El buscador del patio: se tipea el número de la testa y contesta si esa pieza
 * se puede mandar a la sierra.
 *
 * Sale de `PatioModo` porque el módulo pasó a coordinar tres bloques y este solo
 * traía su propio estado, su fetch y la ficha de resultado.
 *
 * El veredicto lo arma `fichaDeTroza()`, que a su vez reusa `motivoBloqueo()`:
 * las reglas de qué se puede consumir viven en un solo lugar y el servidor las
 * espeja al guardar (T1, ADR-326).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Camera, History, Loader2, Search, WifiOff, X } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { fichaDeTroza, type TonoPatio } from "@/lib/forestal/patio-vista";
import { antiguedad, buscarLocal, esViejo, guardar, leer } from "@/lib/forestal/patio-cache";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import {
  VENTANA_FICHA_MS,
  consumibleDeFicha,
  esFichaDeTroza,
  esLineaDeFicha,
  exactasPrimero,
  leerEscaneo,
  type FichaTrozaJson,
} from "@/lib/forestal/leer-escaneo-troza";
import { CamaraEscaneo } from "./EscanerTrozas";
import FichaTrozaResumen from "./FichaTrozaResumen";
import CtpTrozaFichaModal from "./CtpTrozaFichaModal";

/** El tono decide el color de TODA la ficha: se lee de lejos, no en detalle. */
const TONO: Record<TonoPatio, { caja: string; chip: string }> = {
  libre: {
    caja: "border-[var(--data-success-500)] bg-[var(--data-success-50)] dark:bg-[var(--data-success-500)]/10",
    chip: "bg-[var(--data-success-500)] text-white",
  },
  bloqueada: {
    caja: "border-[var(--rule-strong)] bg-[var(--surface-sunken)]",
    chip: "bg-[var(--text-tertiary)] text-white",
  },
  ausente: {
    caja: "border-[var(--data-error-500)] bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/10",
    chip: "bg-[var(--data-error-500)] text-white",
  },
};


export default function PatioBuscador() {
  const [q, setQ] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [hallazgos, setHallazgos] = useState<TrozaConsumible[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Cuándo se guardó lo que se está mostrando. `null` = vino del servidor. */
  const [desdeCache, setDesdeCache] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [camara, setCamara] = useState(false);
  /** La troza cuya historia completa se está mirando (`CtpTrozaFichaModal`). */
  const [ficha, setFicha] = useState<string | null>(null);
  /** La última búsqueda pedida. Dos lecturas seguidas con mala señal: la
   *  respuesta de la PRIMERA puede llegar después y pisar la ficha de la
   *  segunda. Sólo pinta la que sigue siendo la última. */
  const pedidoRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  /** Lo último que se buscó: vuelve al campo si la pistola tipea una línea suelta de la ficha. */
  const ultimaBusquedaRef = useRef("");
  /** Hasta cuándo lo que llega es el resto de una ficha que la pistola sigue tipeando. */
  const fichaHastaRef = useRef(0);

  // Se abre enfocado: la primera acción del patio es tipear un número.
  useEffect(() => {
    inputRef.current?.focus();
    return () => abortRef.current?.abort();
  }, []);

  /**
   * Busca lo tipeado o lo escaneado (2026-09-26). La pistola lectora es un
   * teclado: tipea en este mismo campo y da Enter. Un QR de etiqueta trae el
   * id de la troza —se pide su ficha—; un código de barras o un tipeo, el
   * código, y la pieza EXACTA sale arriba de sus parecidas.
   */
  const buscar = useCallback(async (entrada?: string) => {
    const crudo = (entrada ?? q).trim();
    if (!crudo) return;
    /* La pistola 2D tipea la ficha del QR grande línea por línea: `TROZA 118`
       ya buscó; `Titular: …` y las demás no son códigos y no pueden pisar esa
       búsqueda con «ninguna troza» (revisión 26-09, reproducido). */
    if (esLineaDeFicha(crudo)) {
      fichaHastaRef.current = Date.now() + VENTANA_FICHA_MS;
      return;
    }
    const lectura = leerEscaneo(crudo);
    /* Sin sus íconos (una pistola que no tipea emoji), `Cachimbo` o `2.412 m³`
       llegan como si fueran un código: dentro de la ventana de la ficha se
       callan, salvo otra ficha o el QR chico de otra troza. */
    if (Date.now() < fichaHastaRef.current && !esFichaDeTroza(crudo) && lectura?.tipo !== "id") {
      fichaHastaRef.current = Date.now() + VENTANA_FICHA_MS;
      setQ(ultimaBusquedaRef.current);
      return;
    }
    if (esFichaDeTroza(crudo)) fichaHastaRef.current = Date.now() + VENTANA_FICHA_MS;
    ultimaBusquedaRef.current = crudo;
    if (!lectura) {
      setError(esFichaDeTroza(crudo) ? "Esa troza no tiene código: escanea su QR chico." : "Eso no es el código de una troza.");
      setHallazgos(null);
      return;
    }
    if (lectura.tipo === "codigo" && entrada != null) setQ(lectura.codigo);
    const n = ++pedidoRef.current;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const vigente = () => n === pedidoRef.current;
    setBuscando(true);
    setError(null);
    setDesdeCache(null);
    try {
      let normalizadas: TrozaConsumible[];
      if (lectura.tipo === "id") {
        const r = await fetch(`/api/admin/forestal/trozas/ficha?id=${encodeURIComponent(lectura.id)}`, {
          credentials: "include",
          signal: ac.signal,
        });
        if (!vigente()) return;
        if (r.status === 404) {
          setQ("");
          setHallazgos([]);
          return;
        }
        if (!r.ok) throw new Error(`El servidor respondió ${r.status}`);
        const t = consumibleDeFicha((await r.json()) as FichaTrozaJson);
        if (!vigente()) return;
        setQ(t.codigoPlanta || t.codificacion || "");
        normalizadas = [t];
      } else {
        const r = await fetch(
          `/api/admin/forestal/trozas?codificacion=${encodeURIComponent(lectura.codigo)}&limite=20`,
          { credentials: "include", signal: ac.signal },
        );
        if (!vigente()) return;
        if (!r.ok) throw new Error(`El servidor respondió ${r.status}`);
        const d = (await r.json()) as {
          trozas?: (TrozaConsumible & {
            ingreso?: {
              gtfNumber?: string | null;
              libroNro?: number | null;
              serforNumeroRegistro?: string | null;
              originCode?: string | null;
              providerName?: string | null;
              entryDate?: string | null;
            };
          })[];
        };
        if (!vigente()) return;
        // El buscador devuelve la guía anidada en `ingreso`; el endpoint del patio
        // la manda plana. Se normaliza acá y no se toca el contrato: hay otras
        // vistas leyendo `ingreso`, y sin esto la ficha mostraba "Guía —" teniendo
        // el dato — que en el patio es justo lo que hace falta para ir a buscarla.
        normalizadas = exactasPrimero(
          (d.trozas ?? []).map((t) => ({
            ...t,
            gtfNumber: t.gtfNumber ?? t.ingreso?.gtfNumber ?? null,
            libroNro: t.libroNro ?? t.ingreso?.libroNro ?? null,
            constanciaSniffs: t.constanciaSniffs ?? t.ingreso?.serforNumeroRegistro ?? null,
            /* Lo que la ficha muestra (2026-09-26): permiso, titular y fecha de la guía. */
            permiso: t.permiso ?? t.ingreso?.originCode ?? null,
            proveedor: t.proveedor ?? t.ingreso?.providerName ?? null,
            fechaIngreso: t.fechaIngreso ?? t.ingreso?.entryDate ?? null,
          })),
          lectura.codigo,
        );
      }
      setHallazgos(normalizadas);
      // Se acumula lo consultado para poder responder lo mismo sin señal. Se
      // fusiona por id: cada búsqueda trae un pedacito del patio y pisar el
      // caché con la última dejaría al operario con una sola pieza consultable.
      void (async () => {
        const previo = (await leer<TrozaConsumible>("trozas"))?.datos ?? [];
        const porId = new Map(previo.map((t) => [t.id, t]));
        for (const t of normalizadas) porId.set(t.id, t);
        await guardar("trozas", [...porId.values()]);
      })();
    } catch {
      // Cancelada por una lectura más nueva: esa es la que pinta.
      if (!vigente()) return;
      // El servidor no contestó: se busca en lo último que se alcanzó a ver.
      // No es un error que tape la pantalla — es el caso normal en el patio.
      const cache = await leer<TrozaConsumible>("trozas");
      if (!vigente()) return;
      if (!cache || cache.datos.length === 0) {
        setError("Sin señal y sin nada guardado todavía. Conéctate una vez para poder consultar después.");
        setHallazgos(null);
      } else {
        setHallazgos(
          lectura.tipo === "id"
            ? cache.datos.filter((t) => t.id === lectura.id)
            : exactasPrimero(buscarLocal(cache.datos, lectura.codigo), lectura.codigo),
        );
        setDesdeCache(cache.guardadoEn);
      }
    } finally {
      if (vigente()) setBuscando(false);
    }
  }, [q]);

  return (
    <>
      <section className="space-y-3">
        <label htmlFor="patio-buscar" className="block text-base font-bold text-[var(--text-primary)]">
          ¿Qué troza estás mirando?
        </label>
        <div className="flex gap-2">
          <div className="flex h-14 flex-1 items-center gap-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent-muted)]">
            <Search className="h-5 w-5 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
            <input
              id="patio-buscar"
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                const campo = e.currentTarget;
                if (esLineaDeFicha(campo.value)) {
                  /* Una línea suelta de la ficha: el campo vuelve a lo buscado. */
                  setQ(ultimaBusquedaRef.current);
                  requestAnimationFrame(() => inputRef.current?.select());
                  return;
                }
                /* Con la pistola, la próxima lectura REEMPLAZA a ésta (no se pega
                   detrás). Se selecciona YA, en el Enter: hacerlo cuando volvía la
                   búsqueda seleccionaba media línea que la pistola seguía tipeando. */
                void buscar();
                campo.select();
              }}
              inputMode="search"
              placeholder="Escanea o tipea: 118"
              className="w-full bg-transparent dark:bg-transparent text-lg text-[var(--text-primary)] outline-none focus-visible:[box-shadow:none]! focus-visible:outline-none!"
            />
            {q && (
              <button
                type="button"
                onClick={() => {
                  /* Lo que estaba en vuelo ya no es de nadie: no puede volver a pintar. */
                  pedidoRef.current += 1;
                  abortRef.current?.abort();
                  setBuscando(false);
                  setQ("");
                  setHallazgos(null);
                  inputRef.current?.focus();
                }}
                aria-label="Borrar la búsqueda"
                className="shrink-0 rounded-full p-1 text-[var(--text-tertiary)]"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setCamara(true)}
            aria-label="Escanear la etiqueta con la cámara"
            className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] transition-colors hover:border-[var(--accent)]"
          >
            <Camera className="h-6 w-6" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => void buscar()}
            disabled={buscando || !q.trim()}
            className="inline-flex h-14 shrink-0 items-center gap-2 rounded-2xl bg-linear-to-br from-[var(--accent)] to-[var(--accent-dark)] px-5 text-base font-semibold text-white disabled:opacity-40"
          >
            {buscando ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Search className="h-5 w-5" aria-hidden />}
            Buscar
          </button>
        </div>

        {/* Una lectura, un veredicto: la cámara se cierra y la ficha queda a la vista. */}
        {camara && (
          <CamaraEscaneo
            onLectura={(texto) => {
              setCamara(false);
              void buscar(texto);
            }}
            onCerrar={() => {
              setCamara(false);
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
          />
        )}

        {error && (
          <p className="flex items-start gap-2 rounded-2xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-4 py-3 text-base text-[var(--data-error-700)] dark:bg-transparent dark:text-[var(--data-error-500)]">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /> {error}
          </p>
        )}

        {hallazgos?.length === 0 && (
          <p className="rounded-2xl bg-[var(--surface-sunken)] px-4 py-6 text-center text-base text-[var(--text-secondary)]">
            Ninguna troza con ese número. Prueba con la codificación de la guía.
          </p>
        )}

        {/* Sin esto el patio mostraría una pieza como libre sin aclarar que el
            dato puede ser de ayer — y esa troza pudo consumirse hace dos horas
            en otra tablet. El aviso sube de tono pasadas las dos horas. */}
        {desdeCache && (
          <p
            className={cn(
              "flex items-start gap-2 rounded-2xl border-2 px-4 py-3 text-base font-bold",
              esViejo(desdeCache, new Date())
                ? "border-[var(--data-error-500)] bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/10 dark:text-[var(--data-error-500)]"
                : "border-[var(--data-warning-500)] bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/10 dark:text-[var(--data-warning-500)]",
            )}
          >
            <WifiOff className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <span>
              Sin señal — esto es lo último guardado, {antiguedad(desdeCache, new Date())}.
              {esViejo(desdeCache, new Date()) && " Puede haber cambiado: confirma antes de aserrar."}
            </span>
          </p>
        )}

        <ul className="space-y-2" aria-live="polite">
          {(hallazgos ?? []).map((t) => {
            const f = fichaDeTroza(t);
            const tono = TONO[f.tono];
            return (
              <li key={t.id} className={cn("rounded-2xl border-2 p-4", tono.caja)}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-mono text-2xl font-bold text-[var(--text-primary)]">{f.codigo}</span>
                  <span className={cn("rounded-full px-3 py-1 text-base font-bold", tono.chip)}>{f.titulo}</span>
                </div>
                {f.detalle && <p className="mt-1 text-base text-[var(--text-secondary)]">{f.detalle}</p>}
                {/* Todo lo que se pregunta frente al tronco (Brandon, 2026-09-26):
                    guía, permiso, m³, medidas, fechas, lote. La historia
                    —corrida, despacho, pedazos— es la ficha, a un toque. */}
                <FichaTrozaResumen troza={t} className="mt-2" />
                <button
                  type="button"
                  onClick={() => setFicha(t.id)}
                  className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-base font-semibold text-[var(--text-primary)] hover:border-[var(--accent)]"
                >
                  <History className="h-5 w-5" aria-hidden /> Ver su historia completa
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      {ficha && <CtpTrozaFichaModal trozaId={ficha} onClose={() => setFicha(null)} onVerOtra={setFicha} />}
    </>
  );
}
