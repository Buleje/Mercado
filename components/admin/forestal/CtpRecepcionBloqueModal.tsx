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
  aplicarMismaFecha,
  marcaDe,
  marcasIniciales,
  problemasDelBloque,
  repartirCosto,
  resumenDelBloque,
  tocarMarca,
  type GuiaDelBloque,
  type MarcaDeGuia,
  type Marcas,
} from "@/lib/forestal/recepcion-bloque";
import {
  confirmaVencida,
  diaDelLibro,
  propuestaDeLlegada,
  revisarLlegada,
  revisarSinContexto,
  vencimientoDeGuia,
  type LineaConPapel,
  type PropuestaDeLlegada,
  type RevisionDeLlegada,
} from "@/lib/forestal/fecha-de-llegada";
import { useRecepcionBloque, type ResultadoBloque } from "@/hooks/use-recepcion-bloque";
import { useContextoDeLlegada } from "@/hooks/use-contexto-de-llegada";
import { Btn, ModalBody, ModalFooter } from "./ctp-shared";
import { formatCurrency } from "@/lib/format";
import CtpRecepcionBloqueFila from "./CtpRecepcionBloqueFila";
import { CampoFechaDeLlegada } from "./CtpFechaDeLlegada";

/** Una guía como la ve este modal: la del libro más su papel y su fecha. */
export interface GuiaParaBloque extends GuiaDelBloque {
  providerName: string;
  entryDate: string | Date;
  /** La fecha del papel: de ella sale la propuesta y antes de ella no pudo llegar. */
  gtfDate?: string | Date | null;
  status: string;
  trozasCount: number;
  trozasDecididas: number;
  /** Con su papel (`serforGtf`, `gtfDatos`): de ahí salen la expedición y el vencimiento. */
  lineas: readonly ({ id: string; volumeM3?: number | string | null; fechaRecepcion?: string | null } & LineaConPapel)[];
}

/** La recepción que ya tiene la guía (una a medio recibir): la más vieja de sus asientos. */
const recepcionDe = (g: GuiaParaBloque): string | null =>
  g.lineas
    .map((l) => diaDelLibro(l.fechaRecepcion))
    .filter((d): d is string => Boolean(d))
    .sort()[0] ?? null;

export default function CtpRecepcionBloqueModal({
  guias,
  preseleccion,
  onListo,
  onClose,
}: {
  /** Las guías del período a las que todavía les falta recibir madera. */
  guias: readonly GuiaParaBloque[];
  /**
   * Las claves que se tildaron en la tabla (2026-09-26): el bloque arranca con
   * ellas marcadas y cada una con SU fecha propuesta. Sin esto, arranca en cero.
   */
  preseleccion?: readonly string[];
  /** Cuántas entraron y cuáles no — la vista recarga y avisa. */
  onListo: (r: ResultadoBloque) => void;
  onClose: () => void;
}) {
  const [intentado, setIntentado] = useState(false);
  const { enviando, hechas, recibir } = useRecepcionBloque();
  const { hoy, contextoDe, cargando } = useContextoDeLlegada(useMemo(() => guias.map((g) => g.gtfNumber), [guias]));

  /* La vigencia sale del papel de la fila (ADR-434 §Vencimiento): la propuesta
     queda entre la expedición y el vencimiento, y el aviso aparece sin esperar la red. */
  const vigencias = useMemo(() => new Map(guias.map((g) => [g.clave, vencimientoDeGuia(g.lineas)])), [guias]);
  const propuestas = useMemo(
    () =>
      new Map<string, PropuestaDeLlegada | null>(
        guias.map((g) => [
          g.clave,
          propuestaDeLlegada(
            { guia: g.gtfDate, asiento: g.entryDate, recepcion: recepcionDe(g), vigencia: vigencias.get(g.clave) },
            hoy,
          ),
        ]),
      ),
    [guias, hoy, vigencias],
  );

  const [marcas, setMarcas] = useState<Marcas>(() =>
    marcasIniciales(preseleccion ?? [], (clave) => propuestas.get(clave)?.dia ?? null),
  );
  /** «Misma fecha para todas»: vacío = cada guía con la suya. */
  const [mismaFecha, setMismaFecha] = useState("");

  /* La regla vive en `tocarMarca`: la guía marcada DESPUÉS de la fecha común
     entra con ella, y la fecha corregida en su fila ya no la pisa la común. */
  const tocar = (clave: string, parche: Partial<MarcaDeGuia>) =>
    setMarcas((prev) => tocarMarca(prev, clave, parche, mismaFecha));

  /* Vaciar el campo devuelve cada guía (no corregida a mano) a SU propuesta. */
  const ponerMismaFecha = (v: string) => {
    setMismaFecha(v);
    setMarcas((prev) => aplicarMismaFecha(prev, v, (clave) => propuestas.get(clave)?.dia ?? null));
  };
  /* Las marcadas que se corrigieron en su fila: la fecha común las respeta. */
  const aMano = guias.filter((g) => {
    const m = marcaDe(marcas, g.clave);
    return m.marcada && m.fechaAMano;
  }).length;

  /** La misma revisión que hace el servidor; sin contexto todavía, lo que se sabe del papel. */
  const revisar = (g: GuiaDelBloque & { gtfDate?: string | Date | null }, m: MarcaDeGuia): RevisionDeLlegada => {
    const ctx = contextoDe(g.gtfNumber);
    if (ctx) return revisarLlegada(m.fecha, ctx, hoy, "recibir", m);
    return revisarSinContexto(m.fecha, g.gtfDate, vigencias.get(g.clave) ?? null, hoy, m);
  };

  const resumen = useMemo(() => resumenDelBloque(guias, marcas), [guias, marcas]);
  /* La vencida sin confirmar no va a la lista de «falta resolver»: tiene su
     propia casilla en la fila y apaga el botón hasta que se tilde con motivo. */
  const problemas = problemasDelBloque(guias, marcas, (g) => {
    const b = revisar(g, marcaDe(marcas, g.clave)).bloqueo;
    return b && b.codigo !== "GUIA_VENCIDA" ? b.mensaje : null;
  });
  const sinConfirmar = guias.filter((g) => {
    const m = marcaDe(marcas, g.clave);
    return m.marcada && revisar(g, m).vencida != null && !confirmaVencida(m);
  });
  const listo = resumen.guias > 0 && problemas.length === 0 && sinConfirmar.length === 0;
  /* Lo que la fecha común dejó para mirar: cada fila lo dice abajo; acá, cuántas. */
  const conAviso = mismaFecha
    ? guias.filter((g) => {
        const m = marcaDe(marcas, g.clave);
        if (!m.marcada) return false;
        const r = revisar(g, m);
        return Boolean(r.bloqueo) || r.vencida != null || r.avisos.length > 0;
      }).length
    : 0;

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
          /* Sólo si esa fecha cae después del vencimiento: el servidor lo audita aparte. */
          ...(revisar(g, m).vencida ? { vencida: { motivo: m.motivoVencida } } : {}),
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
      description={`${guias.length} guía${guias.length === 1 ? "" : "s"} ${
        preseleccion?.length ? "elegida" + (guias.length === 1 ? "" : "s") + " en la tabla" : "del período esperan recepción"
      } · ${fmtM3(guias.reduce((a, g) => a + g.volumenM3, 0))} m³`}
      footer={
        <ModalFooter
          error={
            intentado && problemas.length > 0
              ? `Falta resolver ${problemas.length}: ${problemas.map((p) => `${p.gtfNumber} — ${p.motivo}`).join(" · ")}`
              : sinConfirmar.length > 0
                ? `${sinConfirmar.map((g) => g.gtfNumber).join(", ")}: llega después del vencimiento de su guía. Confírmalo con el motivo, o pon una fecha dentro de su vigencia.`
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
          <Btn variant="primary" onClick={() => void enviar()} disabled={enviando || resumen.guias === 0 || sinConfirmar.length > 0}>
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

        {guias.length > 1 && (
          <div className="grid gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3 sm:grid-cols-[12rem_1fr] sm:items-start">
            <CampoFechaDeLlegada
              id="llegada-misma-fecha"
              rotulo="Misma fecha para todas"
              valor={mismaFecha}
              onCambio={ponerMismaFecha}
              propuesta={null}
              max={hoy}
              disabled={enviando}
              invalido={mismaFecha > hoy}
              nota={
                mismaFecha
                  ? `puesta en ${resumen.guias - aMano} marcada${resumen.guias - aMano === 1 ? "" : "s"}` +
                    (aMano > 0 ? ` · ${aMano} corregida${aMano === 1 ? "" : "s"} a mano, sin tocar` : "")
                  : "opcional"
              }
            />
            <p className="text-sm text-[var(--text-secondary)] sm:pt-7" aria-live="polite">
              {!mismaFecha
                ? "Pisa la fecha de cada guía marcada; después corriges cualquiera en su fila."
                : conAviso > 0
                  ? `${conAviso} de ${resumen.guias} con aviso: míralo en su fila antes de recibir.`
                  : resumen.guias === 1
                    ? "La marcada llega ese día. Puedes corregirla en su fila."
                    : `Las ${resumen.guias} marcadas llegan el mismo día. Puedes corregir cualquiera en su fila.`}
            </p>
          </div>
        )}

        <ul className="space-y-2">
          {guias.map((g) => {
            const m = marcaDe(marcas, g.clave);
            return (
              <CtpRecepcionBloqueFila
                key={g.clave}
                guia={g}
                marca={m}
                propuesta={propuestas.get(g.clave) ?? null}
                revision={m.marcada ? revisar(g, m) : null}
                vencimiento={vigencias.get(g.clave)?.vencimiento ?? contextoDe(g.gtfNumber)?.vencimiento ?? null}
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
