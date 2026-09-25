"use client";

/**
 * Recibir varias guías en un acto — sin que sea un tilde a ciegas.
 *
 * Medido el 2026-09-15 en el tenant forestal: **10 de 11 guías** (21 asientos,
 * 181,11 m³) llevaban 7 días sin recepcionar, y por eso 153 de sus 160 trozas
 * no se podían llevar a la sierra. De a una son diez fichas y diez
 * confirmaciones; en bloque es un acto.
 *
 * Cada guía lleva SU fecha de llegada (ADR-434). Antes había una sola, con hoy
 * propuesto: en Blas dejó 7 guías de 10-HUA recibidas el 23/09 cuando la sierra
 * las usaba desde el 07/09, y T3 trabó 18 corridas. Ahora cada fila propone la
 * fecha de su guía y dice, antes de guardar, qué implica (`revisarLlegada`).
 *
 * Las reglas del bloque —tilde por guía que arranca en cero, observación
 * obligatoria cuando el papel no cuadra— viven en
 * `lib/forestal/recepcion-bloque.ts`; las de la fecha, en `fecha-de-llegada.ts`.
 */

import { useMemo, useState } from "react";
import { Loader2, PackageCheck } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import {
  marcaDe,
  problemasDelBloque,
  repartirCosto,
  resumenDelBloque,
  type GuiaDelBloque,
  type MarcaDeGuia,
  type Marcas,
} from "@/lib/forestal/recepcion-bloque";
import {
  diaDelLibro,
  problemaDeLlegada,
  propuestaDeLlegada,
  revisarLlegada,
  type PropuestaDeLlegada,
  type RevisionDeLlegada,
} from "@/lib/forestal/fecha-de-llegada";
import { useRecepcionBloque, type ResultadoBloque } from "@/hooks/use-recepcion-bloque";
import { useContextoDeLlegada } from "@/hooks/use-contexto-de-llegada";
import { Btn, ModalBody, ModalFooter } from "./ctp-shared";
import { formatCurrency } from "@/lib/format";
import CtpRecepcionBloqueFila from "./CtpRecepcionBloqueFila";

/** Una guía como la ve este modal: la del libro más su papel y su fecha. */
export interface GuiaParaBloque extends GuiaDelBloque {
  providerName: string;
  entryDate: string | Date;
  /** La fecha del papel: de ella sale la propuesta y antes de ella no pudo llegar. */
  gtfDate?: string | Date | null;
  status: string;
  trozasCount: number;
  trozasDecididas: number;
  lineas: readonly { id: string; volumeM3?: number | string | null; fechaRecepcion?: string | null }[];
}

/** La recepción que ya tiene la guía (una a medio recibir): la más vieja de sus asientos. */
const recepcionDe = (g: GuiaParaBloque): string | null =>
  g.lineas
    .map((l) => diaDelLibro(l.fechaRecepcion))
    .filter((d): d is string => Boolean(d))
    .sort()[0] ?? null;

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
  const [marcas, setMarcas] = useState<Marcas>({});
  const [intentado, setIntentado] = useState(false);
  const { enviando, hechas, recibir } = useRecepcionBloque();
  const { hoy, contextoDe, cargando } = useContextoDeLlegada(useMemo(() => guias.map((g) => g.gtfNumber), [guias]));

  const tocar = (clave: string, parche: Partial<MarcaDeGuia>) =>
    setMarcas((prev) => ({ ...prev, [clave]: { ...marcaDe(prev, clave), ...parche } }));

  const propuestas = useMemo(
    () =>
      new Map<string, PropuestaDeLlegada | null>(
        guias.map((g) => [
          g.clave,
          propuestaDeLlegada({ guia: g.gtfDate, asiento: g.entryDate, recepcion: recepcionDe(g) }, hoy),
        ]),
      ),
    [guias, hoy],
  );

  /** La misma revisión que hace el servidor; sin contexto todavía, lo que se sabe sin él. */
  const revisar = (g: GuiaDelBloque & { gtfDate?: string | Date | null }, fecha: string): RevisionDeLlegada => {
    const ctx = contextoDe(g.gtfNumber);
    if (ctx) return revisarLlegada(fecha, ctx, hoy, "recibir");
    const p = problemaDeLlegada(fecha, g.gtfDate, hoy);
    return { bloqueo: p ? { codigo: "VALIDACION", mensaje: p } : null, avisos: [] };
  };

  const resumen = useMemo(() => resumenDelBloque(guias, marcas), [guias, marcas]);
  const problemas = problemasDelBloque(guias, marcas, (g, f) => revisar(g, f).bloqueo?.mensaje ?? null);
  const listo = resumen.guias > 0 && problemas.length === 0;

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
          fecha: m.fecha,
        };
      });
    onListo(await recibir(pedidos));
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
            intentado && problemas.length > 0
              ? `Falta resolver ${problemas.length}: ${problemas.map((p) => `${p.gtfNumber} — ${p.motivo}`).join(" · ")}`
              : null
          }
          nota={
            <span className="font-mono tabular-nums">
              {enviando
                ? `Enviando ${hechas} de ${resumen.guias}…`
                : `${resumen.guias} guía${resumen.guias === 1 ? "" : "s"} · ${resumen.asientos} asiento${resumen.asientos === 1 ? "" : "s"} · ${fmtM3(resumen.m3)} m³ · ${resumen.trozasAFechar} troza${resumen.trozasAFechar === 1 ? "" : "s"} a fechar` +
                  (resumen.conCosto > 0 ? ` · ${formatCurrency(resumen.soles)} en ${resumen.conCosto}` : "")}
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
        <p className="flex flex-wrap items-center gap-1.5 text-sm text-[var(--text-secondary)]">
          Marca las que miraste: cada guía lleva su propia fecha de llegada.
          <InfoTip
            icono="ayuda"
            title="Qué declara el tilde"
            what="Que la madera de esa guía bajó en la planta el día que dice su fila. Se propone la fecha de la guía; cámbiala si llegó otro día."
            affects="Sus trozas quedan con esa fecha: una corrida anterior no puede usarlas. Queda en el rastro del libro, a tu nombre."
            example="Guía del 02/09 que bajó el 03/09: marca y pon 03/09."
          />
          {cargando && <Loader2 className="h-4 w-4 animate-spin text-[var(--text-tertiary)]" aria-label="Leyendo las corridas del permiso" />}
        </p>

        <ul className="space-y-2">
          {guias.map((g) => {
            const m = marcaDe(marcas, g.clave);
            return (
              <CtpRecepcionBloqueFila
                key={g.clave}
                guia={g}
                marca={m}
                propuesta={propuestas.get(g.clave) ?? null}
                revision={m.marcada ? revisar(g, m.fecha) : null}
                hoy={hoy}
                enviando={enviando}
                intentado={intentado}
                onTocar={(parche) => tocar(g.clave, parche)}
              />
            );
          })}
        </ul>

        <p className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
          Recién recibida, la madera aparece en Consumos.
          <InfoTip icono="ayuda" title="Qué hace «Recibir»" what="Fecha el ingreso y sus trozas, y valida los asientos que estuvieran pendientes. Recién ahí la madera aparece en Consumos para llevarla a la sierra." />
        </p>
      </ModalBody>
    </AdminModal>
  );
}
