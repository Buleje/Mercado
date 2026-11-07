/**
 * La cabecera de la Ficha de la guía: QUÉ guía es, de quién, bajo qué permiso,
 * en qué estado —en pastillas que se leen de un vistazo— y los atajos a los
 * otros papeles de la guía.
 *
 * Es el único elemento «héroe» de la ficha (skill del DS §7: uno por vista):
 * franja de marca arriba, greca amazónica en tinta tenue a la derecha y el N°
 * de guía grande. El resto de los bloques respira sobre la superficie normal.
 *
 * Los atajos NO repiten el menú «Más» de la fila: son los cinco papeles que se
 * miran con la guía abierta. Corregir, duplicar o anular siguen en la fila.
 */

import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  Coins,
  FileText,
  FolderOpen,
  UserCheck,
  QrCode,
  ScrollText,
  Truck,
} from "@buleje/design-system/icons";
import { TOTAL_CASILLEROS } from "@/lib/forestal/documentos-guia";
import type { ResumenTrozas } from "@/lib/forestal/ficha-guia-resumen";
import type { GuiaIngreso } from "@/lib/forestal/ingresos-por-guia";
import type { PlataDeGuiaDTO } from "@/lib/forestal/plata-de-guia";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";
import { StatusBadge, type WoodEntry, type WoodEntryStatus } from "../ctp-shared";
import { diaCorto, soles } from "../costo-guia/comun";
import { BOTON_BLOQUE, Pastilla } from "./comun";

export interface AtajosDeFicha {
  onVerDocumento: () => void;
  onPlata?: () => void;
  onDocumentos?: () => void;
  onEtiquetas?: () => void;
  onFotos?: () => void;
}

/** Greca shipibo (la del carnet de Socio): identidad, no información. */
function Greca() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-y-0 right-0 h-full w-1/2 text-[var(--accent)] opacity-[0.08] [mask-image:linear-gradient(to_left,black,transparent)]"
      preserveAspectRatio="xMaxYMid slice"
      viewBox="0 0 520 260"
    >
      <defs>
        <pattern id="ficha-guia-greca" width="26" height="26" patternUnits="userSpaceOnUse">
          <path d="M0 13h6.5V6.5H13V13h6.5v6.5H13V26H6.5v-6.5H0z" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </pattern>
      </defs>
      <rect width="520" height="260" fill="url(#ficha-guia-greca)" />
    </svg>
  );
}

export default function FichaCabecera({
  guia,
  ptAserrable,
  trozas,
  plata,
  docsLlenos,
  fotos,
  llego,
  alerta,
  atajos,
  ocupado,
}: {
  guia: GuiaIngreso<WoodEntry>;
  /** ≈ pt aserrable de la guía (el mismo cálculo que «Plata de la guía»). */
  ptAserrable: number;
  trozas: ResumenTrozas | null;
  plata: PlataDeGuiaDTO | null;
  /** Casilleros de papeles con archivo (ADR-438); `null` = sin medir. */
  docsLlenos: number | null;
  fotos: number;
  /** Día `AAAA-MM-DD` en que llegó la madera, o `null`. */
  llego: string | null;
  /** Una alerta de fecha para la pastilla de llegada («después de vencer»). */
  alerta: string | null;
  atajos: AtajosDeFicha;
  ocupado: boolean;
}) {
  const primera = guia.lineas[0];
  const folio =
    guia.libroDesde == null
      ? null
      : guia.libroHasta && guia.libroHasta !== guia.libroDesde
        ? `${guia.libroDesde}–${guia.libroHasta}`
        : String(guia.libroDesde);
  const servicio = plata?.tipo === "servicio" || guia.lineas.some((l) => l.maderaDeTercero === true);
  const dueno = plata?.dueno?.nombre ?? primera?.duenoNombre ?? null;
  const estadoPago = plata?.pago?.estado ?? null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] motion-safe:animate-[megaIn_var(--motion-slow)_var(--ease-editorial)_both]">
      <div aria-hidden className="h-1 bg-linear-to-r from-[var(--accent)] via-[var(--accent-dark)] to-transparent" />
      <Greca />

      <div className="relative flex flex-col gap-4 px-4 pb-3 pt-4 sm:px-5 @min-[56rem]/ficha:flex-row @min-[56rem]/ficha:items-end @min-[56rem]/ficha:justify-between">
        <div className="min-w-0 space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-[var(--ls-wider)] text-[var(--text-secondary)]">
            {guia.docType === "GRR" ? "Guía de remisión" : "Guía de transporte forestal"}
            {guia.gtfSeries ? ` · serie ${guia.gtfSeries}` : ""}
            {folio ? ` · folio ${folio}` : ""}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="font-display text-[length:var(--ts-libro-title)] leading-none tabular-nums tracking-tight text-[var(--text-primary)]">
              {guia.gtfNumber}
            </p>
            {guia.statusMixto ? (
              <Pastilla tono="neutro">Asientos en {Object.keys(guia.porEstado).length} estados</Pastilla>
            ) : (
              <StatusBadge status={guia.status as WoodEntryStatus} />
            )}
          </div>
          <p className="truncate text-base font-semibold text-[var(--text-primary)]" title={guia.providerName}>
            {guia.providerName}
          </p>
          {(guia.originCode || guia.originSourceNumber) && (
            <p className="flex min-w-0 items-center gap-1.5 text-sm text-[var(--text-secondary)]">
              <ScrollText className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
              <span className="shrink-0 font-semibold">Permiso</span>
              <span className="truncate font-mono tabular-nums" title={[guia.originCode, guia.originSourceNumber].filter(Boolean).join(" · ")}>
                {guia.originCode ?? "—"}
              </span>
            </p>
          )}
        </div>

        {/* Las cuatro cifras de la guía: lo que se mira antes de recibirla. */}
        <dl className="grid shrink-0 grid-cols-4 gap-x-4 gap-y-1 @min-[56rem]/ficha:gap-x-6">
          {[
            { v: fmtM3(guia.volumenM3), r: "m³ declarados" },
            { v: `≈${formatNumber(ptAserrable)}`, r: "pt aserrable" },
            { v: trozas ? formatNumber(trozas.total) : "…", r: trozas?.total === 1 ? "troza" : "trozas" },
            { v: formatNumber(guia.especies.length), r: guia.especies.length === 1 ? "especie" : "especies" },
          ].map((c) => (
            <div key={c.r} className="flex min-w-0 flex-col-reverse">
              <dt className="text-xs font-semibold text-[var(--text-tertiary)]">{c.r}</dt>
              <dd className="font-mono text-lg font-bold tabular-nums leading-tight text-[var(--text-primary)] sm:text-xl">{c.v}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* El estado en pastillas: ícono + palabra, nunca sólo color. */}
      <ul className="relative flex flex-wrap gap-1.5 px-4 pb-3 sm:px-5" aria-label="Estado de la guía">
        <li>
          {llego ? (
            <Pastilla tono={alerta ? "aviso" : "exito"} icono={alerta ? AlertTriangle : CheckCircle2} title={alerta ?? undefined}>
              Llegó {diaCorto(llego)}
            </Pastilla>
          ) : (
            <Pastilla tono={alerta ? "error" : "aviso"} icono={alerta ? AlertTriangle : Clock}>
              {alerta ? "Por recibir · vencida" : "Por recibir"}
            </Pastilla>
          )}
        </li>
        <li>
          {servicio ? (
            <Pastilla tono="info" icono={UserCheck}>Servicio{dueno ? ` de ${dueno}` : ""}</Pastilla>
          ) : estadoPago ? (
            <Pastilla tono={estadoPago === "pagada" ? "exito" : estadoPago === "parcial" ? "aviso" : "error"} icono={Coins}>
              {estadoPago === "pagada"
                ? "Pagada"
                : `${estadoPago === "parcial" ? "Pago parcial" : "Sin pagar"} · ${soles(plata?.pago?.pendiente ?? null)}`}
            </Pastilla>
          ) : plata && plata.totalMadera == null ? (
            <Pastilla tono="aviso" icono={Coins}>Sin costo</Pastilla>
          ) : plata ? (
            <Pastilla tono="neutro" icono={Coins}>Compra · {soles(plata.totalMadera)}</Pastilla>
          ) : null}
        </li>
        {docsLlenos != null && (
          <li>
            <Pastilla tono={docsLlenos >= TOTAL_CASILLEROS ? "exito" : docsLlenos > 0 ? "info" : "neutro"} icono={FolderOpen}>
              {docsLlenos}/{TOTAL_CASILLEROS} docs
            </Pastilla>
          </li>
        )}
        <li>
          <Pastilla tono={fotos > 0 ? "info" : "neutro"} icono={Camera}>
            {fotos === 0 ? "Sin fotos" : `${fotos} foto${fotos === 1 ? "" : "s"}`}
          </Pastilla>
        </li>
        {trozas && trozas.total > 0 && (
          <li>
            <Pastilla tono={trozas.etiquetadas >= trozas.total ? "exito" : "neutro"} icono={QrCode}>
              {trozas.etiquetadas}/{trozas.total} etiquetadas
            </Pastilla>
          </li>
        )}
        {plata && plata.fletes.length > 0 && (
          <li>
            <Pastilla tono="neutro" icono={Truck}>
              {plata.fletes.length} flete{plata.fletes.length === 1 ? "" : "s"}
            </Pastilla>
          </li>
        )}
      </ul>

      {/* Los papeles de la guía, a un toque. */}
      <nav aria-label="Papeles de la guía" className="relative flex gap-2 overflow-x-auto border-t [scrollbar-width:none] @min-[40rem]/ficha:flex-wrap @min-[40rem]/ficha:overflow-visible [&>button]:shrink-0 border-[var(--rule-soft)] bg-[var(--surface-raised)]/60 px-4 py-2.5 sm:px-5">
        <button type="button" onClick={atajos.onVerDocumento} disabled={ocupado} className={BOTON_BLOQUE}>
          <FileText className="h-4 w-4" aria-hidden /> Documento
        </button>
        {atajos.onPlata && (
          <button type="button" onClick={atajos.onPlata} disabled={ocupado} className={BOTON_BLOQUE}>
            <Coins className="h-4 w-4" aria-hidden /> Plata
          </button>
        )}
        {atajos.onDocumentos && (
          <button type="button" onClick={atajos.onDocumentos} disabled={ocupado} className={BOTON_BLOQUE}>
            <FolderOpen className="h-4 w-4" aria-hidden /> Documentos
            {docsLlenos != null && (
              <span className="font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
                {docsLlenos}/{TOTAL_CASILLEROS}
              </span>
            )}
          </button>
        )}
        {atajos.onEtiquetas && (
          <button type="button" onClick={atajos.onEtiquetas} disabled={ocupado} className={BOTON_BLOQUE}>
            <QrCode className="h-4 w-4" aria-hidden /> Etiquetas
          </button>
        )}
        {atajos.onFotos && (
          <button type="button" onClick={atajos.onFotos} disabled={ocupado} className={BOTON_BLOQUE}>
            <Camera className="h-4 w-4" aria-hidden /> Fotos
          </button>
        )}
      </nav>
    </div>
  );
}
