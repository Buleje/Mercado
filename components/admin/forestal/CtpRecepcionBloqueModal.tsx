"use client";

/**
 * Recibir varias guías en un acto — sin que sea un tilde a ciegas.
 *
 * Medido el 2026-09-15 en el tenant forestal: **10 de 11 guías** (21 asientos,
 * 181,11 m³) llevaban 7 días sin recepcionar, y por eso 153 de sus 160 trozas
 * no se podían llevar a la sierra. De a una son diez fichas y diez
 * confirmaciones; en bloque es un acto.
 *
 * Las reglas del bloque —fecha explícita, tilde por guía que arranca en cero,
 * observación obligatoria cuando el papel no cuadra— y su por qué viven en
 * `lib/forestal/recepcion-bloque.ts`. Acá sólo se dibujan.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, Coins, Loader2, PackageCheck } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import {
  avisoDeCuadre,
  marcaDe,
  noCuadra,
  problemaDeFecha,
  problemasDelBloque,
  repartirCosto,
  resumenDelBloque,
  type GuiaDelBloque,
  type Marcas,
} from "@/lib/forestal/recepcion-bloque";
import { loQueFaltaRecibir } from "@/lib/forestal/recepcion-guias";
import { useRecepcionBloque, type ResultadoBloque } from "@/hooks/use-recepcion-bloque";
import { Btn, ModalBody, ModalFooter, formatDate } from "./ctp-shared";
import { formatCurrency } from "@/lib/format";

/** Una guía como la ve este modal: la del libro más su papel y su fecha. */
export interface GuiaParaBloque extends GuiaDelBloque {
  providerName: string;
  entryDate: string | Date;
  status: string;
  trozasCount: number;
  trozasDecididas: number;
  lineas: readonly { id: string; volumeM3?: number | string | null; fechaRecepcion?: string | null }[];
}

const CAMPO =
  "h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] transition-colors focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";

const hoyLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const soles = (n: number) =>
  `${formatCurrency(n)}`;

export default function CtpRecepcionBloqueModal({
  guias,
  onListo,
  onClose,
}: {
  /** Las guías del período a las que todavía les falta recibir madera. */
  guias: readonly GuiaParaBloque[];
  /** Cuántas entraron y cuáles no — la vista recarga y avisa. */
  onListo: (r: ResultadoBloque) => void;
  onClose: () => void;
}) {
  const [fecha, setFecha] = useState(hoyLocal());
  const [marcas, setMarcas] = useState<Marcas>({});
  const [intentado, setIntentado] = useState(false);
  const { enviando, hechas, recibir } = useRecepcionBloque();

  const tocar = (clave: string, parche: Partial<(typeof marcas)[string]>) =>
    setMarcas((prev) => ({
      ...prev,
      [clave]: { ...marcaDe(prev, clave), ...parche },
    }));

  const resumen = useMemo(() => resumenDelBloque(guias, marcas), [guias, marcas]);
  const problemas = useMemo(() => problemasDelBloque(guias, marcas), [guias, marcas]);
  const errorFecha = problemaDeFecha(fecha);
  const listo = resumen.guias > 0 && problemas.length === 0 && !errorFecha;

  async function enviar() {
    setIntentado(true);
    if (!listo) return;
    const pedidos = guias
      .filter((g) => marcaDe(marcas, g.clave).marcada)
      .map((g) => {
        const m = marcaDe(marcas, g.clave);
        const total = Number(m.costoTotal.trim());
        return {
          clave: g.clave,
          gtfNumber: g.gtfNumber,
          ids: g.lineas.map((l) => l.id),
          costos: Number.isFinite(total) && total > 0 ? repartirCosto(g, total) : [],
          observacion: m.observacion,
        };
      });
    onListo(await recibir(pedidos, fecha));
  }

  return (
    <AdminModal
      open
      onClose={enviando ? () => {} : onClose}
      variant="info"
      icon={PackageCheck}
      title="Recibir la madera de varias guías"
      description={`${guias.length} guía${guias.length === 1 ? "" : "s"} del período esperan recepción · ${fmtM3(guias.reduce((a, g) => a + g.volumenM3, 0))} m³`}
      footer={
        <ModalFooter
          error={
            intentado && errorFecha
              ? errorFecha
              : intentado && problemas.length > 0
                ? `Falta resolver ${problemas.length}: ${problemas.map((p) => `${p.gtfNumber} — ${p.motivo}`).join(" · ")}`
                : null
          }
          nota={
            <span className="font-mono tabular-nums">
              {enviando
                ? `Enviando ${hechas} de ${resumen.guias}…`
                : `${resumen.guias} guía${resumen.guias === 1 ? "" : "s"} · ${resumen.asientos} asiento${resumen.asientos === 1 ? "" : "s"} · ${fmtM3(resumen.m3)} m³ · ${resumen.trozasAFechar} troza${resumen.trozasAFechar === 1 ? "" : "s"} a fechar` +
                  (resumen.conCosto > 0 ? ` · ${soles(resumen.soles)} en ${resumen.conCosto}` : "")}
            </span>
          }
        >
          <Btn variant="secondary" onClick={onClose} disabled={enviando}>
            Cerrar
          </Btn>
          <Btn variant="primary" onClick={() => void enviar()} disabled={enviando || resumen.guias === 0}>
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
            Recibir {resumen.guias > 0 ? resumen.guias : ""}
          </Btn>
        </ModalFooter>
      }
    >
      <ModalBody className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-[14rem_1fr] sm:items-start">
          <label className="block text-sm">
            <span className="mb-1 block font-bold text-[var(--text-secondary)]">¿Qué día bajó la madera?</span>
            <input
              type="date"
              value={fecha}
              max={hoyLocal()}
              onChange={(e) => setFecha(e.target.value)}
              disabled={enviando}
              className={CAMPO}
            />
          </label>
          <p className="self-center text-sm text-[var(--text-secondary)]">
            Esa fecha queda declarada en el libro para todas las guías que marques, y es la que llevan sus trozas.
            Marca sólo las que miraste: ninguna viene marcada, el tilde es tu declaración y queda firmada a tu
            nombre en el rastro del libro.
          </p>
        </div>

        <ul className="space-y-2">
          {guias.map((g) => {
            const m = marcaDe(marcas, g.clave);
            const aviso = avisoDeCuadre(g);
            const falta = loQueFaltaRecibir(g);
            const total = Number(m.costoTotal.trim());
            const porM3 = Number.isFinite(total) && total > 0 && g.volumenM3 > 0 ? total / g.volumenM3 : null;
            const pideObs = m.marcada && noCuadra(g) && m.observacion.trim().length < 3;
            return (
              <li
                key={g.clave}
                className={`rounded-xl border-2 p-3 transition-colors ${
                  m.marcada ? "border-[var(--accent)] bg-primary/5" : "border-[var(--rule-base)]"
                }`}
              >
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={m.marcada}
                    disabled={enviando}
                    onChange={(e) => tocar(g.clave, { marcada: e.target.checked })}
                    className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--brand-ink)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="font-mono text-base font-bold text-[var(--text-primary)]">{g.gtfNumber}</span>
                      <span className="truncate text-sm text-[var(--text-secondary)]">{g.providerName}</span>
                      <span className="text-sm text-[var(--text-tertiary)]">{formatDate(g.entryDate)}</span>
                    </span>
                    <span className="mt-0.5 block font-mono text-sm tabular-nums text-[var(--text-secondary)]">
                      {fmtM3(g.volumenM3)} m³ · {g.lineas.length} asiento{g.lineas.length === 1 ? "" : "s"}
                      {falta.length > 0 && (
                        <span className="font-sans text-[var(--text-tertiary)]"> · {falta.join(" · ")}</span>
                      )}
                    </span>
                  </span>
                </label>

                {aviso && (
                  <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-[var(--data-warning-500)]/15 px-2 py-1 text-sm font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <span>
                      No cuadra: {aviso}. Se puede recibir igual —la madera ya bajó— pero escribe qué viste.
                    </span>
                  </p>
                )}

                {m.marcada && (
                  <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_11rem]">
                    <label className="block text-sm">
                      <span className="mb-1 block font-bold text-[var(--text-secondary)]">
                        Observación de la recepción {noCuadra(g) ? "(obligatoria acá)" : "(si hace falta)"}
                      </span>
                      <input
                        type="text"
                        value={m.observacion}
                        disabled={enviando}
                        onChange={(e) => tocar(g.clave, { observacion: e.target.value })}
                        placeholder="ej: bajaron 4 de 6 trozas, el resto quedó en el monte"
                        aria-invalid={intentado && pideObs}
                        className={`${CAMPO} ${intentado && pideObs ? "border-[var(--data-error-500)]" : ""}`}
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block font-bold text-[var(--text-secondary)]">Total pagado (S/)</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={m.costoTotal}
                        disabled={enviando}
                        onChange={(e) => tocar(g.clave, { costoTotal: e.target.value })}
                        placeholder="0.00"
                        className={`${CAMPO} tabular-nums`}
                      />
                      <span className="mt-1 flex items-center gap-1 text-xs text-[var(--text-tertiary)]">
                        <Coins className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        {porM3 ? `${soles(porM3)} por m³` : "opcional — si no, queda sin valorizar"}
                      </span>
                    </label>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <p className="text-xs text-[var(--text-tertiary)]">
          Recibir fecha el ingreso y sus trozas, y valida los asientos que estuvieran pendientes. Recién ahí la
          madera aparece en Consumos para llevarla a la sierra.
        </p>
      </ModalBody>
    </AdminModal>
  );
}
