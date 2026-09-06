"use client";

/**
 * CtpTrozaFichaModal — la historia de una troza, de la guía hasta dónde terminó.
 *
 * La pregunta del que está parado frente al tronco: «este palo, ¿de dónde salió
 * y adónde fue?». El libro sabía contestarla por guía, por lote y por despacho,
 * nunca por pieza.
 *
 * Se lee como una línea de tiempo porque eso ES: cada hito ocurrió o no ocurrió
 * todavía, y los que faltan se muestran apagados en vez de esconderse — que un
 * paso no haya pasado es información (una pieza sin recepción es una pieza que
 * la guía declara y nadie vio bajar del camión).
 */

import { useEffect, useState } from "react";
import {
  FileText, Flame, Layers, Loader2, PackageCheck, PackageOpen, Scissors, Truck,
  type LucideIcon,
} from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { usePlantaUbicacion } from "./hooks/use-planta-ubicacion";

const fecha = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : null;
const n = (v: number | null | undefined, d = 4) => (v == null ? "—" : v.toFixed(d));

interface Ficha {
  troza: {
    id: string; codificacion: string | null; codigoPlanta: string | null; parcela: string | null;
    especieComun: string | null; especieCientifica: string | null; dimensiones: string | null;
    d1Cm: number | null; d2Cm: number | null; diametroCm: number | null; largoM: number | null;
    volumenM3: number | null; noRecepcionada: boolean; fechaRecepcion: string | null;
    recepcionObs: string | null; descarte: boolean; observaciones: string | null;
    fechaRetrozo: string | null; fechaConsumo: string | null; fechaDespacho: string | null;
  };
  ingreso: {
    id: string; libroNro: number | null; gtfNumber: string; proveedor: string; entryDate: string;
    fechaRecepcion: string | null; status: string; permiso: string | null; resolucion: string | null;
    volumenM3: number | null;
  };
  madre: { id: string; codificacion: string | null; codigoPlanta: string | null; volumenM3: number | null } | null;
  retrozos: { id: string; codificacion: string | null; codigoPlanta: string | null; volumenM3: number | null; largoM: number | null; d1Cm: number | null; d2Cm: number | null; descarte: boolean; usada: boolean }[];
  lote: { id: string; code: string; status: string; speciesCommon: string | null } | null;
  corrida: { id: string; lineNo: number; entryDate: string; vigente: boolean; producto: string | null; presentacion: string | null; cantidad: number | null; unidad: string | null; rendimientoPct: number | null; linea: string | null; volumenEntradaM3: number | null } | null;
  despacho: { id: string; lineNo: number; entryDate: string; vigente: boolean; docType: string | null; gtfNumber: string | null; cantidad: number | null; unidad: string | null } | null;
}

export interface CtpTrozaFichaModalProps {
  trozaId: string;
  onClose: () => void;
  /** Para saltar de un pedazo a su madre sin cerrar y volver a buscar. */
  onVerOtra?: (id: string) => void;
}

export default function CtpTrozaFichaModal({ trozaId, onClose, onVerOtra }: CtpTrozaFichaModalProps) {
  const [f, setF] = useState<Ficha | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canchas = usePlantaUbicacion();

  useEffect(() => {
    let vivo = true;
    setF(null); setError(null);
    fetch(`/api/admin/forestal/trozas/ficha?id=${encodeURIComponent(trozaId)}`, { credentials: "include" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error === "not_found" ? "Esa pieza ya no está en el libro" : (j.error ?? `HTTP ${r.status}`));
        return j as Ficha;
      })
      .then((j) => { if (vivo) setF(j); })
      .catch((e) => { if (vivo) setError(e instanceof Error ? e.message : String(e)); });
    return () => { vivo = false; };
  }, [trozaId]);

  const t = f?.troza;
  const titulo = t?.codificacion ?? t?.codigoPlanta ?? "Troza";
  /* El MISMO criterio que usa el patio para decidir qué madera está disponible
     (ADR-339): la fecha de la pieza, la del ingreso, o el visto bueno. */
  const recibida = Boolean(
    t?.fechaRecepcion || f?.ingreso.fechaRecepcion || f?.ingreso.status === "validado",
  );

  return (
    <AdminModal
      open
      onClose={onClose}
      title={titulo}
      description={f ? `${t?.especieComun ?? "Sin especie"} · ${n(t?.volumenM3)} m³` : "Buscando su historia…"}
      icon={PackageOpen}
      className="max-w-3xl"
    >
      {!f && !error && (
        <p className="flex items-center justify-center gap-2 p-10 text-sm text-[var(--text-secondary)]">
          <Loader2 className="h-5 w-5 animate-spin" /> Buscando su historia…
        </p>
      )}
      {error && (
        <p className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm font-bold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
          {error}
        </p>
      )}

      {f && t && (
        <div className="space-y-3">
          {/* ── Lo que mide ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Dato label="Volumen" valor={`${n(t.volumenM3)} m³`} fuerte />
            <Dato label="D1 · D2" valor={t.d1Cm != null || t.d2Cm != null ? `${n(t.d1Cm, 0)} · ${n(t.d2Cm, 0)} cm` : "—"} />
            <Dato label="Largo" valor={t.largoM != null ? `${n(t.largoM, 2)} m` : "—"} />
            <Dato label="Ø para cubicar" valor={t.diametroCm != null ? `${n(t.diametroCm, 1)} cm` : "—"} />
          </div>

          <ol className="space-y-2">
            {/* 1 · De dónde salió */}
            <Hito icono={FileText} ocurrio titulo={`Entró con la GTF ${f.ingreso.gtfNumber}`} cuando={fecha(f.ingreso.entryDate)}>
              <Linea k="Proveedor" v={f.ingreso.proveedor} />
              <Linea k="Título habilitante" v={f.ingreso.permiso} mono />
              <Linea k="Resolución" v={f.ingreso.resolucion} mono />
              <Linea k="Parcela de corta" v={t.parcela} mono />
              {f.ingreso.libroNro != null && <Linea k="Asiento del libro" v={`N° ${f.ingreso.libroNro}`} mono />}
            </Hito>

            {/* 2 · Si bajó del camión.
                TRES estados, no dos: «no llegó» es distinto de «no consta que
                haya llegado». Sin la fecha propia, ni la del ingreso, ni el
                visto bueno del operador (ADR-339), nadie registró la descarga
                — decir «se recibió» ahí sería afirmar algo que el libro no
                dice, que es justo lo que una fiscalización revisa. */}
            <Hito
              icono={PackageCheck}
              ocurrio={!t.noRecepcionada && recibida}
              tono={t.noRecepcionada ? "warn" : "ok"}
              titulo={t.noRecepcionada ? "Nunca bajó del camión" : recibida ? "Se recibió en planta" : "Sin constancia de recepción"}
              cuando={fecha(t.fechaRecepcion ?? f.ingreso.fechaRecepcion)}
            >
              {t.noRecepcionada
                ? <p className="text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">La guía la declara, pero el centro no la recibió: no cuenta como madera disponible.</p>
                : !recibida
                  ? <p>Nadie registró la descarga de esta carga: no hay fecha de recepción ni está validada en el libro.</p>
                  : <Linea k="Código de planta" v={t.codigoPlanta ?? "sin marcar"} mono />}
              <Linea k="Observación" v={t.recepcionObs} />
              {/* El mapa de planta ubica GUÍAS, no piezas: se dice «su carga»
                  para no prometer una precisión que el dato no tiene. */}
              {canchas[f.ingreso.id] && (
                <p>
                  <span className="text-[var(--text-secondary)]">Su carga está apilada en: </span>
                  <span className="font-medium text-[var(--text-primary)]">{canchas[f.ingreso.id].nombre}</span>
                </p>
              )}
            </Hito>

            {/* 3 · Si se cortó (o si es un pedazo) */}
            {f.madre && (
              <Hito icono={Scissors} ocurrio titulo="Es un pedazo de otra troza" cuando={fecha(t.fechaRetrozo)}>
                <p>
                  Salió de{" "}
                  <button
                    type="button"
                    onClick={() => onVerOtra?.(f.madre!.id)}
                    className="font-mono font-bold text-[var(--accent-ink)] underline dark:text-[var(--accent)]"
                  >
                    {f.madre.codificacion ?? f.madre.codigoPlanta ?? "la madre"}
                  </button>
                  {f.madre.volumenM3 != null && <> ({n(f.madre.volumenM3)} m³)</>}
                </p>
              </Hito>
            )}
            {f.retrozos.length > 0 && (
              <Hito icono={Scissors} ocurrio titulo={`Se cortó en ${f.retrozos.length} ${f.retrozos.length === 1 ? "pedazo" : "pedazos"}`} cuando={fecha(t.fechaRetrozo)}>
                <p className="mb-1">Su madera siguió viaje en estas piezas — por eso la troza entera ya no se puede consumir.</p>
                <ul className="space-y-1">
                  {f.retrozos.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-baseline gap-x-2 rounded-lg bg-[var(--surface-sunken)] px-2 py-1">
                      <button
                        type="button"
                        onClick={() => onVerOtra?.(r.id)}
                        className="font-mono text-xs font-bold text-[var(--accent-ink)] underline dark:text-[var(--accent)]"
                      >
                        {r.codificacion ?? r.codigoPlanta ?? "pedazo"}
                      </button>
                      <span className="font-mono text-[length:var(--ts-2xs)] tabular-nums text-[var(--text-secondary)]">
                        {n(r.volumenM3)} m³ · {n(r.d1Cm, 0)}·{n(r.d2Cm, 0)} cm · {n(r.largoM, 2)} m
                      </span>
                      {r.descarte && <span className="rounded bg-[var(--data-warning-500)]/18 px-1.5 text-[length:var(--ts-2xs)] font-bold text-[var(--text-primary)]">descarte</span>}
                      {r.usada && <span className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">ya se usó</span>}
                    </li>
                  ))}
                </ul>
              </Hito>
            )}

            {/* 4 · Si se apartó */}
            <Hito
              icono={Layers}
              ocurrio={Boolean(f.lote)}
              titulo={f.lote ? `Apartada en el lote ${f.lote.code}` : "Sin apartar en ningún lote"}
            >
              {f.lote
                ? <Linea k="Estado del lote" v={f.lote.status === "abierto" ? "abierto — todavía no entró a la sierra" : f.lote.status} />
                : <p>Está suelta en el patio: cualquier corrida puede tomarla.</p>}
            </Hito>

            {/* 5 · Cómo terminó */}
            {f.corrida && (
              <Hito
                icono={Flame}
                ocurrio={f.corrida.vigente}
                tono={f.corrida.vigente ? "ok" : "warn"}
                titulo={f.corrida.vigente ? `Se aserró en la corrida #${f.corrida.lineNo}` : `Estuvo en la corrida #${f.corrida.lineNo}, que se anuló`}
                cuando={fecha(t.fechaConsumo ?? f.corrida.entryDate)}
              >
                {!f.corrida.vigente && <p className="text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">La corrida se anuló, así que esta madera volvió al patio.</p>}
                <Linea k="Producto" v={[f.corrida.producto, f.corrida.presentacion].filter(Boolean).join(" · ") || null} />
                <Linea k="Declarado" v={f.corrida.cantidad != null ? `${n(f.corrida.cantidad)} ${f.corrida.unidad ?? ""}`.trim() : null} mono />
                <Linea k="Rendimiento" v={f.corrida.rendimientoPct != null ? `${n(f.corrida.rendimientoPct, 2)} %` : null} mono />
                <Linea k="Línea" v={f.corrida.linea === "LRE" ? "LRE — recuperación" : f.corrida.linea} />
              </Hito>
            )}
            {f.despacho && (
              <Hito
                icono={Truck}
                ocurrio={f.despacho.vigente}
                tono={f.despacho.vigente ? "ok" : "warn"}
                titulo={f.despacho.vigente ? "Salió entera, sin aserrar" : `Estuvo en el despacho #${f.despacho.lineNo}, que se anuló`}
                cuando={fecha(t.fechaDespacho ?? f.despacho.entryDate)}
              >
                {!f.despacho.vigente && <p className="text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">El despacho se anuló: la troza volvió al patio.</p>}
                <Linea k={f.despacho.docType ?? "Guía de salida"} v={f.despacho.gtfNumber} mono />
                <Linea k="Cantidad" v={f.despacho.cantidad != null ? `${n(f.despacho.cantidad)} ${f.despacho.unidad ?? ""}`.trim() : null} mono />
              </Hito>
            )}
            {!f.corrida && !f.despacho && f.retrozos.length === 0 && (
              <Hito icono={PackageOpen} ocurrio={false} titulo="Todavía está en el patio">
                <p>No entró a ninguna corrida ni salió con ninguna guía.</p>
              </Hito>
            )}
          </ol>

          {(t.observaciones || t.dimensiones) && (
            <div className="rounded-xl bg-[var(--surface-sunken)] p-2.5 text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">
              {t.dimensiones && <p>Como lo publica SERFOR: <span className="font-mono">{t.dimensiones}</span></p>}
              {t.observaciones && <p>{t.observaciones}</p>}
            </div>
          )}
        </div>
      )}
    </AdminModal>
  );
}

function Dato({ label, valor, fuerte }: { label: string; valor: string; fuerte?: boolean }) {
  return (
    <div className="rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-2.5 py-1.5">
      <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-secondary)]">{label}</p>
      <p className={`font-mono tabular-nums text-[var(--text-primary)] ${fuerte ? "text-base font-bold" : "text-sm"}`}>{valor}</p>
    </div>
  );
}

/** Un hito de la historia. Los que no ocurrieron se muestran apagados, no se esconden. */
function Hito({ icono: Icono, ocurrio, tono = "ok", titulo, cuando, children }: {
  icono: LucideIcon; ocurrio: boolean; tono?: "ok" | "warn"; titulo: string;
  cuando?: string | null; children?: React.ReactNode;
}) {
  const color = !ocurrio ? "var(--rule-strong)" : tono === "warn" ? "var(--data-warning-500)" : "var(--data-success-500)";
  return (
    <li className={`flex gap-2.5 rounded-xl border-2 p-2.5 ${ocurrio ? "border-[var(--rule-base)] bg-[var(--surface-raised)]" : "border-dashed border-[var(--rule-base)]"}`}>
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: `color-mix(in oklab, ${color} 16%, transparent)` }}>
        <Icono className="h-4 w-4" style={{ color }} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-bold text-[var(--text-primary)]">{titulo}</span>
          {cuando && <span className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">{cuando}</span>}
        </p>
        <div className="mt-0.5 space-y-0.5 text-xs text-[var(--text-secondary)]">{children}</div>
      </div>
    </li>
  );
}

/** Una línea «campo: valor» que desaparece si no hay valor: un «—» por fila es ruido. */
function Linea({ k, v, mono }: { k: string; v: string | null | undefined; mono?: boolean }) {
  if (!v) return null;
  return (
    <p>
      <span className="text-[var(--text-secondary)]">{k}: </span>
      <span className={`font-medium text-[var(--text-primary)] ${mono ? "font-mono" : ""}`}>{v}</span>
    </p>
  );
}
