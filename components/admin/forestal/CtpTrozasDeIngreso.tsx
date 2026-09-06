"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowDownRight, Check, ClipboardList, FileText, Loader2, PackageCheck, PackageOpen, Pencil, Scissors, Search } from "@buleje/design-system/icons";
import { CardTitle, DataTable } from "@buleje/design-system";
import CtpRetrozarModal, { type TrozaParaCortar } from "./CtpRetrozarModal";
import CtpRecepcionTrozas from "./CtpRecepcionTrozas";
import CtpDocumentoVisor from "./CtpDocumentoVisor";
import CtpTrozasImportModal from "./CtpTrozasImportModal";
import type { TrozaImportada } from "@/lib/forestal/trozas-import";
import { csrfHeaders } from "@/lib/csrf-client";
import { CSS_LISTA_TROZAS, htmlListaTrozas } from "@/lib/forestal/ctp-lista-trozas";
import { documentoHtml } from "@/lib/forestal/ctp-documento-print";
import { balanceRecepcion } from "@/lib/forestal/recepcion-trozas";
import { cuadreDeIngreso, descuadra } from "@/lib/forestal/cuadre-trozas";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";

/**
 * La lista de trozas que amparó este ingreso (ADR-312).
 *
 * Vive aparte del modal porque se pide por red y sólo existe para los ingresos
 * cargados desde SERFOR: si la sección viviera adentro, el modal tendría que
 * cargar siempre algo que la mitad de los ingresos no tiene.
 *
 * Cuando no hay trozas casi no renderiza nada —ni un "sin datos"—: un ingreso
 * viejo cargado a mano no tiene por qué mostrar un hueco. La excepción es el
 * ingreso PENDIENTE, donde ofrece pegar la lista del proveedor (ADR-320): ahí
 * el vacío sí se puede resolver, y sin esa puerta la única salida era anular el
 * ingreso y volver a cargarlo entero.
 */

type Troza = {
  id: string;
  orden: number;
  codificacion: string | null;
  especieComun: string | null;
  /** El endpoint la devuelve; el tipo local no la declaraba y la lista de
   *  trozas —que la imprime en su columna— no podía leerla. */
  especieCientifica?: string | null;
  dimensiones: string | null;
  largoM: number | null;
  diametroCm: number | null;
  d1Cm?: number | null;
  d2Cm?: number | null;
  cantidad: number | null;
  volumenM3: number | null;
  descarte?: boolean;
  observaciones?: string | null;
  /** Recepción física en patio (ADR-325). */
  parcela?: string | null;
  codigoPlanta?: string | null;
  noRecepcionada?: boolean;
  recepcionObs?: string | null;
  trozaOrigenId?: string | null;
  /** Los pedazos en que se cortó (ADR-313). Cuelgan de su madre, no van sueltos. */
  retrozos?: Troza[];
};

export default function CtpTrozasDeIngreso({
  entryId,
  volumenDelIngreso = null,
  gtfNumber = null,
  productType = null,
  titular = null,
  status = null,
  especie = null,
  especieCientifica = null,
  onIngresoCambiado,
}: {
  entryId: string;
  /** m³ con que está registrado el ingreso, para contrastarlo con lo recibido. */
  volumenDelIngreso?: number | null;
  /** Datos del ingreso para encabezar la LISTA DE TROZAS: el N° de la lista es
   *  el de la guía —así el casillero (35) de la GTF le apunta— y el producto y
   *  el titular son del ingreso, no de cada pieza. */
  gtfNumber?: string | null;
  productType?: string | null;
  titular?: string | null;
  /** Sólo un ingreso `pendiente` se corrige (lo impone la DB, no la pantalla):
   *  sin esto los botones de arreglo se ofrecerían para fallar con un 422. */
  status?: string | null;
  /** Con qué especie se precargan las piezas que se importen. */
  especie?: string | null;
  especieCientifica?: string | null;
  /** Recargar la lista del libro: corregir el volumen cambia la fila de la tabla. */
  onIngresoCambiado?: () => void;
}) {
  const [trozas, setTrozas] = useState<Troza[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [cortando, setCortando] = useState<TrozaParaCortar | null>(null);
  const [recibiendo, setRecibiendo] = useState(false);
  /** La lista de trozas como documento: se mira antes de imprimir o archivar. */
  const [viendoLista, setViendoLista] = useState(false);
  /** Filtro por pieza. Una guía trae hasta ochenta trozas y el fiscalizador
   *  pregunta por UNA: sin esto había que buscarla scrolleando a ojo. */
  const [filtro, setFiltro] = useState("");
  /** Import de la lista desde el Excel del proveedor. */
  const [importando, setImportando] = useState(false);
  const [arreglando, setArreglando] = useState(false);
  const [errorArreglo, setErrorArreglo] = useState<string | null>(null);

  /** Corregir sólo se puede mientras el ingreso está pendiente (guard de la DB). */
  const editable = status === "pendiente";

  const cargar = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/forestal/trozas?woodEntryId=${encodeURIComponent(entryId)}`, { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setTrozas(((await r.json()).trozas ?? []) as Troza[]);
    } catch {
      setTrozas([]);
    } finally {
      setCargando(false);
    }
  }, [entryId]);

  useEffect(() => { void cargar(); }, [cargar]);

  /**
   * Las dos salidas del descuadre, que son las dos causas reales:
   *  · faltan piezas por cargar   → `agregarPiezas` (el Excel del proveedor)
   *  · el volumen se tipeó mal    → `corregirVolumen`
   *
   * No se ofrece una sola: "ajustar el volumen a lo que suman las piezas" como
   * único camino enseñaría a tapar una lista incompleta cambiando el número que
   * declara la guía, que es exactamente el dato que el libro NO puede inventar.
   */
  const corregirVolumen = useCallback(
    async (nuevo: number) => {
      setArreglando(true);
      setErrorArreglo(null);
      try {
        const r = await fetch(`/api/admin/forestal/wood-entries/${encodeURIComponent(entryId)}`, {
          method: "PATCH",
          credentials: "include",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ action: "update", fields: { volumeM3: nuevo } }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.message || j?.error || `HTTP ${r.status}`);
        onIngresoCambiado?.();
      } catch (e) {
        setErrorArreglo(e instanceof Error ? e.message : "No se pudo corregir el volumen.");
      } finally {
        setArreglando(false);
      }
    },
    [entryId, onIngresoCambiado],
  );

  const agregarPiezas = useCallback(
    async (nuevas: TrozaImportada[]) => {
      setArreglando(true);
      setErrorArreglo(null);
      try {
        const r = await fetch(`/api/admin/forestal/wood-entries/${encodeURIComponent(entryId)}`, {
          method: "PATCH",
          credentials: "include",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            action: "trozas",
            trozas: nuevas.map((t) => ({
              codificacion: t.codificacion ?? null,
              especieComun: t.especieComun ?? null,
              especieCientifica: t.especieCientifica ?? null,
              dimensiones: t.dimensiones ?? null,
              largoM: t.largoM ?? null,
              diametroCm: t.diametroCm ?? null,
              d1Cm: t.d1Cm ?? null,
              d2Cm: t.d2Cm ?? null,
              cantidad: t.cantidad ?? null,
              volumenM3: t.volumenM3 ?? null,
            })),
          }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.message || j?.error || `HTTP ${r.status}`);
        setImportando(false);
        // Las repetidas no son un error: se avisan y se sigue. Re-subir el mismo
        // archivo es lo que hace cualquiera que no está seguro de haber guardado.
        if (j?.repetidas?.length) {
          setErrorArreglo(
            `Se agregaron ${j.agregadas}. ${j.repetidas.length} ya estaban en la lista y se saltaron.`,
          );
        }
        await cargar();
        onIngresoCambiado?.();
      } catch (e) {
        setErrorArreglo(e instanceof Error ? e.message : "No se pudieron agregar las piezas.");
      } finally {
        setArreglando(false);
      }
    },
    [entryId, cargar, onIngresoCambiado],
  );

  if (cargando) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-4 py-3 text-sm text-[var(--text-tertiary)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Buscando la lista de trozas…
      </div>
    );
  }
  /**
   * Sin lista de piezas.
   *
   * Antes esto era `return null` a secas y estaba bien pensado —un ingreso viejo
   * cargado a mano no tiene por qué mostrar un hueco—, pero dejaba sin salida el
   * caso que sí importa: el ingreso PENDIENTE al que todavía se le puede pegar
   * la lista. Se ofrece sólo ahí, en una línea, y el ingreso cerrado sigue sin
   * mostrar nada.
   */
  if (!trozas || trozas.length === 0) {
    if (!editable) return null;
    return (
      <>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-canvas)] px-4 py-3">
          <p className="text-sm text-[var(--text-secondary)]">
            Este ingreso no tiene lista de piezas. Sin ella no se puede consumir por troza ni cruzar
            contra el POA.
          </p>
          <button
            type="button"
            onClick={() => setImportando(true)}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)]"
          >
            <ClipboardList className="h-4 w-4" aria-hidden /> Pegar la lista del proveedor
          </button>
        </div>
        {errorArreglo && (
          <p className="mt-2 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{errorArreglo}</p>
        )}
        {importando && (
          <CtpTrozasImportModal
            especie={especie}
            especieCientifica={especieCientifica}
            volumenDeclarado={volumenDelIngreso ?? undefined}
            onAceptar={(t) => void agregarPiezas(t)}
            onClose={() => setImportando(false)}
          />
        )}
      </>
    );
  }

  if (recibiendo) {
    return (
      <CtpRecepcionTrozas
        entryId={entryId}
        trozas={trozas}
        volumenDelIngreso={volumenDelIngreso}
        onCerrar={() => setRecibiendo(false)}
        onGuardado={() => { setRecibiendo(false); void cargar(); }}
      />
    );
  }

  const total = trozas.reduce((a, t) => a + (t.volumenM3 ?? 0), 0);
  const balance = balanceRecepcion(trozas);

  /** Coincide con codificación, código de planta, parcela o especie: son los
   *  cuatro campos por los que alguien pregunta por una pieza. */
  const norm = (v: string) => v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const q = norm(filtro.trim());
  const visibles = q
    ? trozas.filter((t) =>
        [t.codificacion, t.codigoPlanta, t.parcela, t.especieComun]
          .some((c) => c && norm(String(c)).includes(q)),
      )
    : trozas;

  // La MISMA regla que usa la tabla del libro: si cada pantalla la calculara por
  // su cuenta, una diría «cuadra» y la otra «faltan 5 m³» del mismo ingreso.
  const cuadre = cuadreDeIngreso(volumenDelIngreso, total, trozas.length);

  return (
    <section className="@container overflow-hidden rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--rule-soft)] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
            <PackageOpen className="h-4 w-4" />
          </span>
          <CardTitle as="h3" className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-secondary)]">
            Lista de trozas · {trozas.length} pieza{trozas.length === 1 ? "" : "s"}
          </CardTitle>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {balance.faltantes > 0 && (
            <span className="rounded-lg bg-[var(--data-error-50)] px-2 py-1 text-xs font-bold text-[var(--data-error-700)] dark:bg-transparent dark:text-[var(--data-error-500)]">
              {balance.faltantes} no llegó al patio
            </span>
          )}
          <span className="flex items-baseline gap-1.5">
            <span className="font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">{fmtM3(total)} m³</span>
            {cuadre.estado === "cuadra" && (
              <span
                title={`Las piezas suman lo mismo que el volumen declarado del ingreso (${volumenDelIngreso != null ? fmtM3(volumenDelIngreso) : "—"} m³).`}
                className="inline-flex items-center gap-1 rounded-lg bg-[var(--data-success-500)]/15 px-2 py-0.5 text-xs font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
              >
                <Check className="h-3 w-3" strokeWidth={3} /> cuadra
              </span>
            )}
            {descuadra(cuadre) && (
              <span
                title={`El ingreso declara ${volumenDelIngreso != null ? fmtM3(volumenDelIngreso) : "—"} m³ y las piezas suman ${fmtM3(total)} m³. O falta cargar trozas, o el volumen del ingreso no es el de la guía.`}
                className="inline-flex items-center gap-1 rounded-lg bg-[var(--data-warning-500)]/15 px-2 py-0.5 text-xs font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
              >
                <AlertTriangle className="h-3 w-3" />
                {cuadre.aviso}
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={() => setRecibiendo(true)}
            className="flex h-9 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] px-3 text-xs font-bold text-[var(--text-primary)] hover:border-primary"
            title="Anotar código de planta, parcela de corta y qué trozas no llegaron"
          >
            <PackageCheck className="h-3.5 w-3.5" aria-hidden /> Recepción
          </button>
          <button
            type="button"
            onClick={() => setViendoLista(true)}
            className="flex h-9 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] px-3 text-xs font-bold text-[var(--text-primary)] hover:border-primary"
            title="Ver la LISTA DE TROZAS A MOVILIZAR para imprimirla o guardarla"
          >
            <FileText className="h-3.5 w-3.5" aria-hidden /> Lista de trozas
          </button>
        </div>
      </div>

      {/* El descuadre con sus dos salidas. El chip de arriba AVISA; acá se
          resuelve, que es lo que faltaba: hasta ahora había que salir del
          detalle, abrir el editor y tipear el volumen a mano. */}
      {descuadra(cuadre) && editable && (
        <div className="border-b border-[var(--rule-soft)] bg-[var(--data-warning-500)]/8 px-4 py-3">
          <p className="text-sm text-[var(--text-secondary)]">
            El ingreso declara{" "}
            <strong className="font-mono tabular-nums text-[var(--text-primary)]">
              {volumenDelIngreso != null ? fmtM3(volumenDelIngreso) : "—"} m³
            </strong>{" "}
            y las {trozas.length} piezas suman{" "}
            <strong className="font-mono tabular-nums text-[var(--text-primary)]">
              {fmtM3(total)} m³
            </strong>
            . O falta cargar piezas, o el volumen no es el de la guía.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {cuadre.estado === "faltan" && (
              <button
                type="button"
                disabled={arreglando}
                onClick={() => setImportando(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-xs font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)] disabled:opacity-60"
              >
                <ClipboardList className="h-3.5 w-3.5" aria-hidden /> Cargar las piezas que faltan
              </button>
            )}
            <button
              type="button"
              disabled={arreglando}
              /* Confirmación explícita: el volumen del ingreso es el que declara
                 la GTF. Bajarlo para que "cuadre" con una lista incompleta es
                 falsear el libro, así que se dice antes de hacerlo. */
              onClick={() => {
                if (
                  window.confirm(
                    `El volumen del ingreso pasará de ${volumenDelIngreso != null ? fmtM3(volumenDelIngreso) : "—"} a ${fmtM3(total)} m³.\n\n` +
                      `Hacelo sólo si el volumen estaba mal tipeado. Si lo que falta son piezas por cargar, este cambio haría que el libro declare menos madera de la que ampara la guía.`,
                  )
                ) {
                  void corregirVolumen(Number(total.toFixed(4)));
                }
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-xs font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)] disabled:opacity-60"
            >
              {arreglando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pencil className="h-3.5 w-3.5" aria-hidden />}
              Corregir el volumen a {fmtM3(total)} m³
            </button>
          </div>
          {errorArreglo && (
            <p className="mt-2 text-sm font-medium text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
              {errorArreglo}
            </p>
          )}
        </div>
      )}

      {trozas.length > 8 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--rule-soft)] px-4 py-2.5">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              type="search"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Buscar una pieza por código, parcela o especie…"
              aria-label="Buscar una troza de esta guía"
              className="h-9 w-full rounded-xl border-[1.5px] border-[var(--rule-base)] bg-[var(--surface-raised)] pl-9 pr-3 text-sm text-[var(--text-primary)] outline-none transition-[border-color] focus:border-[var(--accent)]"
            />
          </div>
          <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
            {visibles.length} de {trozas.length}
          </span>
        </div>
      )}

      {/* Un filtro sin resultados no puede verse igual que "esta guía no trae
          trozas": lo segundo es un problema del registro, lo primero un typo. */}
      {q && visibles.length === 0 && (
        <p className="border-b border-[var(--rule-soft)] px-4 py-6 text-center text-sm text-[var(--text-tertiary)]">
          Ninguna de las {trozas.length} piezas de esta guía coincide con «{filtro.trim()}».
        </p>
      )}

      {/* 9 columnas necesitan ~56rem. El umbral se mide contra el CONTENEDOR y no
          contra el viewport porque esto vive dentro del modal de detalle del
          ingreso: en una tablet a 768px el modal deja ~700px y `sm:` (640px)
          mostraba igual la tabla, apretada. */}
      <div className="hidden overflow-x-auto @4xl:block">
        <DataTable className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--rule-soft)] text-left text-[length:var(--ts-2xs)] uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              <th className="px-4 py-2 font-bold">Codificación</th>
              <th className="px-4 py-2 font-bold">Cód. planta</th>
              <th className="px-4 py-2 font-bold">Parcela</th>
              <th className="px-4 py-2 font-bold">Especie</th>
              <th className="px-4 py-2 font-bold">Dimensiones (guía)</th>
              <th className="px-4 py-2 text-right font-bold">Largo</th>
              <th className="px-4 py-2 text-right font-bold">Diám.</th>
              <th className="px-4 py-2 text-right font-bold">Volumen</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {visibles.map((t) => {
              const pedazos = t.retrozos ?? [];
              const cortado = pedazos.reduce((a, r) => a + (r.volumenM3 ?? 0), 0);
              const libre = (t.volumenM3 ?? 0) - cortado;
              return (
                <Fragment key={t.id}>
                  <tr className="border-b border-[var(--rule-soft)]">
                    <td className="px-4 py-2.5 font-mono font-bold text-[var(--text-primary)]">
                      {t.codificacion ?? "—"}
                      {t.noRecepcionada && (
                        <span
                          title={t.recepcionObs ?? "Declarada en la guía pero no llegó al patio"}
                          className="ml-1.5 rounded bg-[var(--data-error-100)] px-1 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)] dark:bg-transparent dark:text-[var(--data-error-500)]"
                        >
                          NO LLEGÓ
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[var(--text-secondary)]">{t.codigoPlanta ?? "—"}</td>
                    <td className="px-4 py-2.5 font-mono text-[var(--text-secondary)]">{t.parcela ?? "—"}</td>
                    <td className="px-4 py-2.5 text-[var(--text-secondary)]">{t.especieComun ?? "—"}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-[var(--text-tertiary)]">{t.dimensiones ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                      {t.largoM != null ? `${t.largoM.toFixed(2)} m` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                      {t.diametroCm != null ? `${t.diametroCm.toFixed(1)} cm` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">
                      {t.volumenM3 != null ? `${fmtM3(t.volumenM3)} m³` : "—"}
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      {/* Sólo se ofrece cortar si queda madera: con la troza ya
                          repartida el botón abriría un modal que sólo puede fallar. */}
                      {libre > 0.001 && (
                        <button
                          type="button"
                          onClick={() => setCortando({
                            id: t.id, codificacion: t.codificacion, especieComun: t.especieComun,
                            dimensiones: t.dimensiones, largoM: t.largoM, diametroCm: t.diametroCm,
                            d1Cm: t.d1Cm ?? t.diametroCm, d2Cm: t.d2Cm ?? t.diametroCm,
                            volumenM3: t.volumenM3,
                            retrozos: pedazos.map((r) => ({ volumenM3: r.volumenM3, largoM: r.largoM, descarte: r.descarte })),
                          })}
                          title={`Cortar ${t.codificacion ?? "la troza"} en pedazos`}
                          className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--rule-base)] px-2 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:border-primary hover:text-[var(--text-primary)]"
                        >
                          <Scissors className="h-3.5 w-3.5" /> Retrozar
                        </button>
                      )}
                    </td>
                  </tr>

                  {pedazos.map((r) => (
                    <tr key={r.id} className="border-b border-[var(--rule-soft)] bg-[var(--surface-sunken)]/60">
                      <td className="py-2 pl-8 pr-4 font-mono text-xs font-bold text-[var(--text-secondary)]">
                        <ArrowDownRight className="mr-1 inline h-3 w-3 text-[var(--text-tertiary)]" aria-hidden />
                        {r.codificacion ?? "—"}
                        {r.descarte && (
                          <span className="ml-2 rounded-full bg-[var(--data-warning-500)]/15 px-1.5 py-0.5 text-[length:var(--ts-2xs,11px)] font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                            descarte
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs text-[var(--text-tertiary)]">{r.observaciones ?? ""}</td>
                      <td className="px-4 py-2 font-mono text-xs text-[var(--text-tertiary)]">{r.dimensiones ?? "—"}</td>
                      <td className="px-4 py-2 text-right font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
                        {r.largoM != null ? `${r.largoM.toFixed(2)} m` : "—"}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
                        {r.diametroCm != null ? `${r.diametroCm.toFixed(1)} cm` : "—"}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs font-bold tabular-nums text-[var(--text-secondary)]">
                        {r.volumenM3 != null ? `${fmtM3(r.volumenM3)} m³` : "—"}
                      </td>
                      <td />
                    </tr>
                  ))}

                  {pedazos.length > 0 && (
                    <tr className="border-b border-[var(--rule-soft)] last:border-0">
                      <td colSpan={9} className="px-4 py-1.5 pl-8 text-xs text-[var(--text-tertiary)]">
                        Cortado {fmtM3(cortado)} m³ · quedan {fmtM3(Math.max(0, libre))} m³ sin cortar
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </DataTable>
      </div>

      <ul className="divide-y divide-[var(--rule-soft)] @4xl:hidden">
        {visibles.map((t) => (
          <li key={t.id} className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono font-bold text-[var(--text-primary)]">{t.codificacion ?? "—"}</span>
              <span className="font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">
                {t.volumenM3 != null ? `${fmtM3(t.volumenM3)} m³` : "—"}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{t.especieComun ?? "—"}</p>
            <p className="mt-0.5 font-mono text-xs text-[var(--text-tertiary)]">{t.dimensiones ?? "—"}</p>
          </li>
        ))}
      </ul>
      {cortando && (
        <CtpRetrozarModal
          troza={cortando}
          onClose={() => setCortando(null)}
          onSaved={() => { setCortando(null); void cargar(); }}
        />
      )}

      {importando && (
        <CtpTrozasImportModal
          especie={especie}
          especieCientifica={especieCientifica}
          volumenDeclarado={volumenDelIngreso ?? undefined}
          onAceptar={(t) => void agregarPiezas(t)}
          onClose={() => setImportando(false)}
        />
      )}

      {viendoLista && (() => {
        const pieLista = gtfNumber ? `Lista de trozas · Anexo de la GTF ${gtfNumber}` : "Lista de trozas del ingreso";
        return (
        <CtpDocumentoVisor
          documentos={[{
            nombre: gtfNumber ? `Lista de trozas ${gtfNumber}` : "Lista de trozas",
            etiqueta: `${trozas.length} pieza(s) · anexo del (35)`,
            pieCorrido: pieLista,
            html: documentoHtml({
              titulo: gtfNumber ? `Lista de trozas ${gtfNumber}` : "Lista de trozas",
              css: CSS_LISTA_TROZAS,
              pieCorrido: pieLista,
              cuerpo: htmlListaTrozas({
                titular: titular || "Centro de Transformación Primaria",
                subtitulo: gtfNumber ? `Guía ${gtfNumber}` : undefined,
                guia: gtfNumber || undefined,
                // El N° de la lista es el de la guía: el casillero (35) de la
                // GTF apunta acá, y un fragmento de id interno no le sirve a
                // nadie en un puesto de control.
                numero: gtfNumber || entryId.slice(-7),
                // Sólo las madres: un retrozo viaja dentro de su troza y
                // listarlo aparte contaría la misma madera dos veces (ADR-313).
                trozas: trozas.map((t) => ({
                  codificacion: t.codificacion ?? null,
                  especieComun: t.especieComun ?? null,
                  especieCientifica: t.especieCientifica ?? null,
                  producto: productType,
                  d1Cm: t.d1Cm ?? null,
                  d2Cm: t.d2Cm ?? null,
                  largoM: t.largoM ?? null,
                  cantidad: t.cantidad ?? 1,
                  volumenM3: t.volumenM3 ?? null,
                })),
              }),
            }),
          }]}
          activo={0}
          onActivo={() => {}}
          onArchivar={() => ({
            etiquetas: ["forestal", "lista de trozas", gtfNumber, titular].filter(
              (t): t is string => Boolean(t && t.trim()),
            ),
            descripcion:
              `Lista de trozas${gtfNumber ? ` de la GTF ${gtfNumber}` : ""} — ` +
              `${trozas.length} pieza(s), ${fmtM3(total)} m³${titular ? `, ${titular}` : ""}.`,
          })}
          onClose={() => setViendoLista(false)}
        />
        );
      })()}
    </section>
  );
}
