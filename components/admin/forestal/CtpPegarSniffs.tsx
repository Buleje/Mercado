"use client";

/**
 * «Traer del SNIFFS»: pegar la pantalla del SNIFFS y que los productos entren
 * solos al formulario de producción (ADR-397).
 *
 * El operador ya declaró la corrida en el sistema de SERFOR y tiene a la vista
 * el «Detalle de la programación de producción». Antes la volvía a tipear acá,
 * producto por producto — y ahí es donde el libro y lo declarado dejan de
 * cuadrar. Ahora pega la captura (Ctrl+V) o el texto copiado de la tabla, se
 * lee EN SU NAVEGADOR (sin subir nada, sin clave de IA, funciona sin internet)
 * y aparecen las filas para revisar: producto ya mapeado al catálogo del
 * LO-CTP, volumen y % aprovechado. Recién al confirmar entran como paquetes.
 *
 * Lo que lee se COTEJA contra el material de esta corrida —especie, volumen
 * consumido, margen bajo el tope del 56 %— y las diferencias se dicen. Nada se
 * corrige solo: una captura de otro lote tiene que saltar a la vista, no
 * entrar callada.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, ClipboardPaste, Loader2, ScanText, X } from "@buleje/design-system/icons";
import { TIPOS_PRODUCTO_SALIDA } from "@/lib/forestal/loctp-catalogos";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { PaqueteBorrador } from "@/lib/forestal/produccion-paquetes";
import {
  interpretarDetalleProduccionSniffs,
  mismaEspecie,
  paquetesDesdeSniffs,
  pareceDetalleSniffs,
  type DetalleProduccionSniffs,
  type ProductoSniffs,
} from "@/lib/forestal/sniffs-produccion-parse";
import { leerTextoDeImagen, liberarOcr, type ProgresoOcr } from "@/lib/ocr/ocr-navegador";
import { Btn } from "./ctp-shared";
import { TablaCtp, TbodyCtp, TheadCtp } from "./ctp-tabla";

const CAMPO =
  "h-9 w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

const fmtDia = (iso: string | null) => {
  if (!iso) return null;
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
};

interface FilaRevisar {
  id: string;
  incluir: boolean;
  productType: string | null;
  /** Editable: lo que se va a agregar. Lo leído queda en `leida` para cotejar. */
  volumenM3: string;
  leida: ProductoSniffs;
}

type Fase =
  | { tipo: "idle" }
  | { tipo: "leyendo"; progreso: ProgresoOcr }
  | { tipo: "revisar"; detalle: DetalleProduccionSniffs; fuente: "captura" | "texto" };

export default function CtpPegarSniffs({
  material,
  margenM3,
  siguienteCodigo,
  onAgregar,
  onUsarFecha,
  compacto = false,
}: {
  /** Contra qué se coteja lo leído. */
  material: { especie: string; volumenM3: number };
  /** Lo que todavía entra bajo el tope del 56 %. */
  margenM3: number;
  /** El próximo código libre de la serie de la planta, esquivando `ocupados`. */
  siguienteCodigo: (ocupados: readonly string[]) => string;
  onAgregar: (paquetes: PaqueteBorrador[], detalle: DetalleProduccionSniffs) => void;
  /** Si se pasa, la fecha de inicio leída se ofrece como fecha de la corrida. */
  onUsarFecha?: (iso: string) => void;
  /** Con paquetes ya cargados, la zona ocupa un renglón. */
  compacto?: boolean;
}) {
  const [fase, setFase] = useState<Fase>({ tipo: "idle" });
  const [filas, setFilas] = useState<FilaRevisar[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [miniatura, setMiniatura] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const leyendo = fase.tipo === "leyendo";

  /* La miniatura es un object URL: se suelta al reemplazarla y al desmontar. */
  useEffect(() => () => { if (miniatura) URL.revokeObjectURL(miniatura); }, [miniatura]);
  /* El worker del OCR pesa ~50 MB: se suelta con el modal. */
  useEffect(() => () => { void liberarOcr(); }, []);

  const procesarTexto = useCallback(
    (texto: string, fuente: "captura" | "texto") => {
      const detalle = interpretarDetalleProduccionSniffs(texto, { consumidoM3: material.volumenM3 });
      if (detalle.productos.length === 0) {
        setError(
          fuente === "captura"
            ? "Leí la captura pero no encontré la tabla «Resumen de Producción por PMF y Producto». Probá con una captura donde se vea entera, o copiá el texto de la tabla y pegalo acá."
            : (detalle.avisos[0] ?? "No encontré filas de producto en lo que pegaste."),
        );
        setFase({ tipo: "idle" });
        return;
      }
      setError(null);
      setFilas(
        detalle.productos.map((p, i) => ({
          id: `${i}-${p.productoCrudo}`,
          incluir: true,
          productType: p.productType,
          volumenM3: String(p.volumenM3),
          leida: p,
        })),
      );
      setFase({ tipo: "revisar", detalle, fuente });
    },
    [material.volumenM3],
  );

  const procesarImagen = useCallback(
    async (archivo: Blob) => {
      setError(null);
      setMiniatura(URL.createObjectURL(archivo));
      setFase({ tipo: "leyendo", progreso: { etapa: "Preparando la imagen", progreso: 0 } });
      try {
        const { texto } = await leerTextoDeImagen(archivo, (progreso) => setFase({ tipo: "leyendo", progreso }));
        procesarTexto(texto, "captura");
      } catch (e) {
        setError(
          `No pude leer la captura (${e instanceof Error ? e.message : String(e)}). ` +
            "Copiá el texto de la tabla en el SNIFFS (seleccionarla y Ctrl+C) y pegalo acá.",
        );
        setFase({ tipo: "idle" });
      }
    },
    [procesarTexto],
  );

  /**
   * Ctrl+V en cualquier parte del modal.
   *
   * Una imagen se lee siempre: ningún campo del formulario la puede recibir.
   * Un texto sólo si parece esta pantalla y, con el foco en un campo, sólo si
   * además es una tabla (tabs o varias líneas) — pegar «Tornillo» en una
   * observación no tiene que disparar una importación.
   */
  useEffect(() => {
    const alPegar = (e: ClipboardEvent) => {
      if (leyendo) return;
      const dt = e.clipboardData;
      if (!dt) return;
      const imagen = Array.from(dt.items)
        .find((it) => it.kind === "file" && it.type.startsWith("image/"))
        ?.getAsFile();
      if (imagen) {
        e.preventDefault();
        void procesarImagen(imagen);
        return;
      }
      const texto = dt.getData("text/plain");
      if (!texto || !pareceDetalleSniffs(texto)) return;
      const t = e.target as HTMLElement | null;
      const enCampo =
        t != null && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if (enCampo && !/[\t\n]/.test(texto.trim())) return;
      e.preventDefault();
      procesarTexto(texto, "texto");
    };
    document.addEventListener("paste", alPegar);
    return () => document.removeEventListener("paste", alPegar);
  }, [leyendo, procesarImagen, procesarTexto]);

  const detalle = fase.tipo === "revisar" ? fase.detalle : null;
  const incluidas = useMemo(() => filas.filter((f) => f.incluir), [filas]);
  const suma = useMemo(() => r4(incluidas.reduce((a, f) => a + (Number(f.volumenM3) || 0), 0)), [incluidas]);
  const sinProducto = incluidas.filter((f) => !f.productType).length;
  const sinVolumen = incluidas.filter((f) => !(Number(f.volumenM3) > 0)).length;

  /** Lo que no cuadra entre la captura y este material. Se dice, no se arregla. */
  const cotejos = useMemo(() => {
    const lista: { tono: "aviso" | "error"; texto: string }[] = [];
    if (!detalle) return lista;
    if (detalle.especieComun && !mismaEspecie(material.especie, detalle.especieComun)) {
      lista.push({
        tono: "aviso",
        texto: `La captura es de ${detalle.especieComun} y este material es ${material.especie.toUpperCase()}. ¿Es el lote correcto?`,
      });
    }
    if (
      detalle.volumenConsumidoM3 != null &&
      material.volumenM3 > 0 &&
      Math.abs(detalle.volumenConsumidoM3 - material.volumenM3) > 0.0005
    ) {
      lista.push({
        tono: "aviso",
        texto: `El SNIFFS declara ${fmtM3(detalle.volumenConsumidoM3)} m³ consumidos y acá entraron ${fmtM3(material.volumenM3)} m³.`,
      });
    }
    if (material.volumenM3 > 0 && suma > margenM3 + 1e-9) {
      lista.push({
        tono: "error",
        texto: `Las filas suman ${fmtM3(suma)} m³ y bajo el tope del 56 % quedan ${fmtM3(margenM3)} m³: se agregan igual, pero no vas a poder guardar hasta ajustar.`,
      });
    }
    for (const a of detalle.avisos) lista.push({ tono: "aviso", texto: a });
    return lista;
  }, [detalle, material.especie, material.volumenM3, suma, margenM3]);

  function descartar() {
    setFase({ tipo: "idle" });
    setFilas([]);
    setError(null);
    setMiniatura(null);
  }

  function confirmar() {
    if (!detalle || incluidas.length === 0 || sinProducto > 0 || sinVolumen > 0) return;
    const nuevos = paquetesDesdeSniffs(
      incluidas.map((f) => ({ productType: f.productType as string, volumenM3: Number(f.volumenM3) })),
      { siguienteCodigo, lote: detalle.lote },
    );
    onAgregar(nuevos, detalle);
    descartar();
  }

  const editarFila = (id: string, cambio: Partial<FilaRevisar>) =>
    setFilas((prev) => prev.map((f) => (f.id === id ? { ...f, ...cambio } : f)));

  // ── Leyendo ──
  if (fase.tipo === "leyendo") {
    const pct = Math.round(fase.progreso.progreso * 100);
    return (
      <div className="mb-3 flex items-center gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2">
        {miniatura && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={miniatura} alt="" className="h-12 w-20 shrink-0 rounded-lg object-cover object-left-top" />
        )}
        <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[var(--accent)]" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[var(--text-primary)]">
            {fase.progreso.etapa}… <span className="font-mono tabular-nums text-[var(--text-tertiary)]">{pct} %</span>
          </p>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--surface-raised)]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-[var(--accent)] transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">Se lee en tu navegador: la captura no se sube a ningún lado.</p>
        </div>
      </div>
    );
  }

  // ── Revisar ──
  if (fase.tipo === "revisar" && detalle) {
    const puedeAgregar = incluidas.length > 0 && sinProducto === 0 && sinVolumen === 0;
    const cabecera = [
      detalle.lote ? `lote ${detalle.lote}` : null,
      detalle.fechaInicio ? `${fmtDia(detalle.fechaInicio)}${detalle.fechaFin ? ` → ${fmtDia(detalle.fechaFin)}` : ""}` : null,
      detalle.especieCientifica || detalle.especieComun
        ? [detalle.especieCientifica, detalle.especieComun].filter(Boolean).join(" · ")
        : null,
      detalle.volumenConsumidoM3 != null ? `consumido ${fmtM3(detalle.volumenConsumidoM3)} m³` : null,
    ].filter(Boolean);
    return (
      <div className="mb-3 rounded-xl border-2 border-[var(--accent)] bg-[var(--surface-raised)]">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-t-xl bg-primary/10 px-3 py-2 text-sm">
          <ScanText className="h-4 w-4 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden />
          <b className="text-[var(--text-primary)]">
            {fase.fuente === "captura" ? "Leído de la captura" : "Leído del texto pegado"}
          </b>
          {cabecera.length > 0 && (
            <span className="min-w-0 flex-1 truncate font-mono text-xs tabular-nums text-[var(--text-secondary)]">
              {cabecera.join(" · ")}
            </span>
          )}
          {onUsarFecha && detalle.fechaInicio && (
            <button
              type="button"
              onClick={() => onUsarFecha(detalle.fechaInicio as string)}
              className="shrink-0 text-xs font-bold text-[var(--accent-ink)] underline-offset-2 hover:underline dark:text-[var(--accent)]"
            >
              usar {fmtDia(detalle.fechaInicio)} como fecha de producción
            </button>
          )}
        </div>

        {cotejos.length > 0 && (
          <ul className="space-y-1 px-3 pt-2">
            {cotejos.map((c) => (
              <li
                key={c.texto}
                className={`flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-sm font-bold ${
                  c.tono === "error"
                    ? "bg-[var(--data-error-500)]/12 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
                    : "bg-[var(--data-warning-500)]/12 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
                }`}
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>{c.texto}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex gap-3 p-3">
          {miniatura && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={miniatura}
              alt="La captura que se leyó"
              className="hidden h-24 w-36 shrink-0 rounded-lg border border-[var(--rule-base)] object-cover object-left-top sm:block"
            />
          )}
          <div className="min-w-0 flex-1">
            <TablaCtp altoMax="max-h-[30vh]">
              <TheadCtp>
                <tr>
                  <th className="w-10 px-2 py-2">
                    <span className="sr-only">Incluir</span>
                  </th>
                  <th className="px-3 py-2 font-bold">Producto (catálogo LO-CTP)</th>
                  <th className="w-36 px-3 py-2 text-right font-bold">Volumen (m³)</th>
                  <th className="w-24 px-3 py-2 text-right font-bold" title="Como lo declara el SNIFFS">
                    % aprov.
                  </th>
                  <th className="px-3 py-2 font-bold">Leído</th>
                </tr>
              </TheadCtp>
              <TbodyCtp>
                {filas.map((f) => (
                  <tr
                    key={f.id}
                    className={
                      !f.incluir
                        ? "opacity-50"
                        : f.leida.dudoso || !f.productType
                          ? "bg-[var(--data-warning-500)]/10"
                          : "hover:bg-[var(--surface-sunken)]"
                    }
                  >
                    <td className="px-2 py-1.5 text-center">
                      <input
                        type="checkbox"
                        checked={f.incluir}
                        onChange={(e) => editarFila(f.id, { incluir: e.target.checked })}
                        aria-label={`Incluir ${f.leida.productoCrudo}`}
                        className="h-4 w-4 accent-[var(--accent)]"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <select
                        value={f.productType ?? ""}
                        onChange={(e) => editarFila(f.id, { productType: e.target.value || null })}
                        aria-label={`Producto de ${f.leida.productoCrudo}`}
                        className={CAMPO}
                      >
                        <option value="">— elegí el producto —</option>
                        {TIPOS_PRODUCTO_SALIDA.map((t) => (
                          <option key={t.valor} value={t.valor} title={t.label}>
                            {t.valor}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        type="number"
                        min={0}
                        step="0.0001"
                        value={f.volumenM3}
                        onChange={(e) => editarFila(f.id, { volumenM3: e.target.value })}
                        aria-label={`Volumen de ${f.leida.productoCrudo}`}
                        className={`${CAMPO} text-right font-mono tabular-nums`}
                      />
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                      {f.leida.pctAprovechado != null ? `${f.leida.pctAprovechado} %` : "—"}
                    </td>
                    <td className="max-w-[16rem] truncate px-3 py-1.5 font-mono text-xs text-[var(--text-tertiary)]" title={`${f.leida.productoCrudo} · ${f.leida.volumenLeido}`}>
                      {f.leida.productoCrudo} · {f.leida.volumenLeido}
                      {f.leida.dudoso && <b className="ml-1 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">revisar</b>}
                    </td>
                  </tr>
                ))}
              </TbodyCtp>
            </TablaCtp>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--rule-soft)] px-3 py-2">
          <span className="font-mono text-sm tabular-nums text-[var(--text-secondary)]">
            {incluidas.length} fila{incluidas.length === 1 ? "" : "s"} · <b className="text-[var(--text-primary)]">{fmtM3(suma)} m³</b>
            {sinProducto > 0 && (
              <span className="ml-2 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                · {sinProducto} sin producto
              </span>
            )}
          </span>
          <div className="flex items-center gap-2">
            <Btn variant="secondary" onClick={descartar}>
              <X className="h-4 w-4" /> Descartar
            </Btn>
            <Btn
              variant="primary"
              onClick={confirmar}
              disabled={!puedeAgregar}
              title={sinProducto > 0 ? "Elegí el producto de cada fila incluida (o desmarcala)" : undefined}
            >
              <Check className="h-4 w-4" /> Agregar {incluidas.length} paquete{incluidas.length === 1 ? "" : "s"}
            </Btn>
          </div>
        </div>
      </div>
    );
  }

  // ── Idle: la zona para pegar ──
  return (
    <div className="mb-3">
      <div
        onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          const archivo = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/"));
          if (archivo) void procesarImagen(archivo);
        }}
        className={`flex flex-wrap items-center gap-3 rounded-xl border-2 border-dashed px-3 ${compacto ? "py-1.5" : "py-2.5"} transition-colors ${
          arrastrando ? "border-[var(--accent)] bg-primary/10" : "border-[var(--rule-base)] bg-[var(--surface-sunken)]"
        }`}
      >
        <ScanText className="h-5 w-5 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden />
        <p className="min-w-0 flex-1 text-sm text-[var(--text-secondary)]">
          <b className="text-[var(--text-primary)]">Traer del SNIFFS</b> · pegá la captura del «Detalle de la programación
          de producción» (<kbd className="rounded border border-[var(--rule-base)] px-1 font-mono text-xs">Ctrl+V</kbd>) o el
          texto copiado de su tabla{compacto ? "" : ". Los productos y sus m³ entran solos, para revisar antes de agregar"}.
        </p>
        <Btn variant="secondary" onClick={() => inputRef.current?.click()}>
          <ClipboardPaste className="h-4 w-4" /> Elegir imagen
        </Btn>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const archivo = e.target.files?.[0];
            e.target.value = "";
            if (archivo) void procesarImagen(archivo);
          }}
        />
      </div>
      {error && (
        <p className="mt-2 flex items-start gap-2 rounded-xl bg-[var(--data-warning-500)]/12 px-3 py-2 text-sm font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
