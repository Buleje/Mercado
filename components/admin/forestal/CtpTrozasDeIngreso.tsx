"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowDownRight, Check, FileText, Loader2, PackageCheck, PackageOpen, Scissors, Search } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import CtpRetrozarModal, { type TrozaParaCortar } from "./CtpRetrozarModal";
import CtpRecepcionTrozas from "./CtpRecepcionTrozas";
import CtpDocumentoVisor from "./CtpDocumentoVisor";
import { CSS_LISTA_TROZAS, htmlListaTrozas } from "@/lib/forestal/ctp-lista-trozas";
import { documentoHtml } from "@/lib/forestal/ctp-documento-print";
import { balanceRecepcion } from "@/lib/forestal/recepcion-trozas";

/**
 * La lista de trozas que amparó este ingreso (ADR-312).
 *
 * Vive aparte del modal porque se pide por red y sólo existe para los ingresos
 * cargados desde SERFOR: si la sección viviera adentro, el modal tendría que
 * cargar siempre algo que la mitad de los ingresos no tiene.
 *
 * Cuando no hay trozas no renderiza NADA —ni un "sin datos"—: un ingreso viejo
 * cargado a mano no tiene por qué mostrar un hueco.
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

  if (cargando) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-4 py-3 text-sm text-[var(--text-tertiary)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Buscando la lista de trozas…
      </div>
    );
  }
  if (!trozas || trozas.length === 0) return null;

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

  /**
   * ¿La lista cuadra con el ingreso?
   *
   * `volumenDelIngreso` llegaba como prop y sólo se pasaba hacia abajo: la
   * cabecera mostraba el total de las trozas AL LADO del volumen declarado del
   * ingreso sin decir nunca si coincidían. Con 5 m³ de trozas contra 10 m³
   * declarados —el caso que destapó esto— había que restar de memoria. Y es
   * justo lo que se contrasta pieza por pieza en una fiscalización: o falta
   * cargar trozas, o el volumen del ingreso está mal.
   *
   * Tolerancia de 0.001 m³: los volúmenes se guardan con 4 decimales y sumar
   * ochenta piezas arrastra centésimas de milésimo que no son una diferencia
   * real.
   */
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

  const cuadre = (() => {
    if (volumenDelIngreso == null || volumenDelIngreso <= 0) return null;
    const brecha = Number((volumenDelIngreso - total).toFixed(4));
    if (Math.abs(brecha) <= 0.001) return { ok: true as const, aviso: "" };
    // El texto se arma acá, donde `brecha` es un número recién calculado: en el
    // JSX sería `cuadre.brecha.toFixed()` sobre una propiedad de objeto, que es
    // justo lo que la regla del proyecto marca como frágil.
    const aviso =
      brecha > 0
        ? `faltan ${brecha.toFixed(4)} m³ por detallar`
        : `${Math.abs(brecha).toFixed(4)} m³ de más`;
    return { ok: false as const, aviso };
  })();

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
            <span className="font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">{total.toFixed(4)} m³</span>
            {cuadre?.ok && (
              <span
                title={`Las piezas suman lo mismo que el volumen declarado del ingreso (${volumenDelIngreso?.toFixed(4)} m³).`}
                className="inline-flex items-center gap-1 rounded-lg bg-[var(--data-success-500)]/15 px-2 py-0.5 text-xs font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
              >
                <Check className="h-3 w-3" strokeWidth={3} /> cuadra
              </span>
            )}
            {cuadre && !cuadre.ok && (
              <span
                title={`El ingreso declara ${volumenDelIngreso?.toFixed(4)} m³ y las piezas suman ${total.toFixed(4)} m³. O falta cargar trozas, o el volumen del ingreso no es el de la guía.`}
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
        <table className="w-full text-sm">
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
                      {t.volumenM3 != null ? `${t.volumenM3.toFixed(4)} m³` : "—"}
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
                        {r.volumenM3 != null ? `${r.volumenM3.toFixed(4)} m³` : "—"}
                      </td>
                      <td />
                    </tr>
                  ))}

                  {pedazos.length > 0 && (
                    <tr className="border-b border-[var(--rule-soft)] last:border-0">
                      <td colSpan={9} className="px-4 py-1.5 pl-8 text-xs text-[var(--text-tertiary)]">
                        Cortado {cortado.toFixed(4)} m³ · quedan {Math.max(0, libre).toFixed(4)} m³ sin cortar
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-[var(--rule-soft)] @4xl:hidden">
        {visibles.map((t) => (
          <li key={t.id} className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono font-bold text-[var(--text-primary)]">{t.codificacion ?? "—"}</span>
              <span className="font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">
                {t.volumenM3 != null ? `${t.volumenM3.toFixed(4)} m³` : "—"}
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
              `${trozas.length} pieza(s), ${total.toFixed(4)} m³${titular ? `, ${titular}` : ""}.`,
          })}
          onClose={() => setViendoLista(false)}
        />
        );
      })()}
    </section>
  );
}
