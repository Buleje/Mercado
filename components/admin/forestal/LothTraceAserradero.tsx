/**
 * LothTraceAserradero — «Del bosque al aserradero» en la ventana de un árbol
 * (backlog L13, 08-10).
 *
 * Arriba, la línea de tiempo corta: talado → trozado → despachado (GTF) →
 * recibido en el CTP → aserrado (corrida N). Abajo, cada troza del Trozado con
 * lo que el Libro CTP dice de ella: el MISMO chip de estado del patio, el día
 * en que bajó del camión, su ingreso, su lote, su corrida y el producto, y el
 * enlace a su ficha en el CTP.
 *
 * Los pasos salen de `pasosDelArbol` y las piezas de `destinoDelArbol`
 * (`lib/forestal/loth-trace-aserradero`): acá sólo se dibuja. Una troza sin
 * pieza en el CTP no se busca por código: se dice lo que su despacho del Libro
 * TH permite —sin despacho «—», desde el 29-09 «por recibir», antes «sin
 * enlace»— con su ⓘ.
 */

import Link from "next/link";
import { Axe, CheckCircle2, Circle, ExternalLink, Package, Scissors, Truck, Warehouse } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { TraceOperation } from "@/lib/forestal/loth-trace";
import {
  etiquetaDeEstado,
  fraseDeEstados,
  fraseSinPieza,
  NOTA_FUENTE,
  pasosDelArbol,
  POR_RECIBIR,
  SIN_DESPACHO,
  SIN_ENLACE,
  type ClavePasoArbol,
  type DestinoArbol,
  type PiezaCtp,
  type TrozaSinPieza,
} from "@/lib/forestal/loth-trace-aserradero";
import { ESTADO_META } from "@/lib/forestal/trozas-patio";
import { rutaFichaDeTroza } from "@/lib/forestal/ctp-troza-url";
import { CHIP_TONO_CTP, fmtFecha } from "./loth-trace-ui";
import type { EstadoAserradero } from "./hooks/use-loth-trace-aserradero";

const ICONO: Record<ClavePasoArbol, typeof Axe> = {
  talado: Axe,
  trozado: Scissors,
  despachado: Truck,
  recibido: Warehouse,
  aserrado: Package,
};

const AVISO: Record<Exclude<EstadoAserradero, "listo">, string> = {
  cargando: "Preguntando al Libro CTP…",
  error: "No se pudo leer el Libro CTP. Cierra y vuelve a abrir la vista.",
  sin_ctp: "Este negocio no lleva el Libro CTP.",
};

export default function LothTraceAserradero({
  op,
  destino,
  estado,
}: {
  op: TraceOperation;
  destino: DestinoArbol | undefined;
  estado: EstadoAserradero;
}) {
  const pasos = pasosDelArbol(op, destino);
  const piezasDe = (trozadoId: string) => destino?.piezas.filter((p) => p.trozadoId === trozadoId) ?? [];

  return (
    <div className="space-y-3" data-arbol-aserradero>
      <ol className="grid gap-2 sm:grid-cols-5" aria-label="Del bosque al aserradero">
        {pasos.map((p) => {
          const Icono = ICONO[p.clave];
          return (
            <li
              key={p.clave}
              className={`rounded-lg border-t-4 bg-[var(--surface-sunken)] px-3 py-2 ${
                p.hecho ? "border-[var(--data-success-500)]" : "border-dashed border-[var(--rule-base)]"
              }`}
            >
              <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[var(--text-secondary)]">
                <Icono className="h-4 w-4 shrink-0" aria-hidden />
                {p.titulo}
                {p.hecho ? (
                  <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" aria-hidden />
                ) : (
                  <Circle className="ml-auto h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
                )}
              </span>
              <span className="mt-1 block text-sm font-semibold text-[var(--text-primary)]">
                {p.dia ? fmtFecha(p.dia) : p.hecho ? "—" : "Todavía no"}
                <span className="sr-only">{p.hecho ? " (hecho)" : " (pendiente)"}</span>
              </span>
              {(p.detalle || p.nota) && (
                <span className="mt-0.5 flex items-start gap-1 text-xs text-[var(--text-tertiary)]">
                  <span>{p.detalle}</span>
                  {p.nota && <InfoTip title={p.titulo} what={p.nota} side="left" ariaLabel={`Sobre «${p.titulo}»`} />}
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {!destino ? (
        <p className="text-sm text-[var(--text-tertiary)]">{estado === "listo" ? AVISO.cargando : AVISO[estado]}</p>
      ) : destino.enlazadas > 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">
          <b className="text-[var(--text-primary)]">
            {destino.enlazadas} de {destino.trozadas}
          </b>{" "}
          trozas en el Libro CTP: {fraseDeEstados(destino.porEstado)}
          {fraseSinPieza(destino.sinPieza) && `; ${fraseSinPieza(destino.sinPieza)}`}
        </p>
      ) : null}

      <ul className="divide-y divide-[var(--rule-soft)] rounded-lg border border-[var(--rule-base)]">
        {op.trozado.map((t) => {
          const piezas = piezasDe(t.id);
          return (
            <li key={t.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2 text-sm">
              <span className="w-24 shrink-0 font-mono font-bold text-[var(--text-primary)]">{t.trozaCode ?? "s/código"}</span>
              {!destino ? (
                <span className="text-[var(--text-tertiary)]">—</span>
              ) : piezas.length === 0 ? (
                <SinPieza que={destino.sinPiezaPorTrozado[t.id] ?? "sin_enlace"} codigo={t.trozaCode} />
              ) : (
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  {piezas.map((p) => (
                    <LineaPieza key={p.id} p={p} codigoTh={t.trozaCode} />
                  ))}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Una troza del Trozado sin pieza en el CTP, por su despacho en el Libro TH. */
function SinPieza({ que, codigo }: { que: TrozaSinPieza; codigo: string | null }) {
  if (que === "sin_despacho") {
    return (
      <span className="text-[var(--text-tertiary)]" title={SIN_DESPACHO}>
        —<span className="sr-only">{SIN_DESPACHO}</span>
      </span>
    );
  }
  const porRecibir = que === "por_recibir";
  return (
    <span className="inline-flex items-center gap-1 text-[var(--text-tertiary)]">
      {porRecibir ? "Por recibir en el CTP" : "Sin enlace en el CTP"}
      <InfoTip
        title={porRecibir ? "Por recibir" : "Sin enlace"}
        what={porRecibir ? POR_RECIBIR : SIN_ENLACE}
        ariaLabel={`Por qué la troza ${codigo ?? ""} no está en el Libro CTP`}
      />
    </span>
  );
}

/** Una pieza del CTP: chip de estado, cuándo llegó y por qué ingreso, dónde terminó y su ficha. */
function LineaPieza({ p, codigoTh }: { p: PiezaCtp; codigoTh: string | null }) {
  const partes: string[] = [];
  if (p.llegada) partes.push(`llegó ${fmtFecha(p.llegada.dia)}`);
  partes.push(`ingreso N° ${p.ingreso.libroNro ?? "s/n"} · GTF ${p.ingreso.gtf}`);
  if (p.lote && !p.corrida) partes.push(`lote ${p.lote}`);
  if (p.corrida) {
    partes.push(`corrida N° ${p.corrida.lineNo} (${fmtFecha(p.corrida.dia)})${p.corrida.producto ? `: ${p.corrida.producto}` : ""}`);
  }
  if (p.despacho) partes.push(`salió entera ${fmtFecha(p.despacho.dia)}${p.despacho.gtf ? ` · GTF ${p.despacho.gtf}` : ""}`);
  const nota = p.llegada ? NOTA_FUENTE[p.llegada.fuente] : null;
  const meta = ESTADO_META[p.estado];

  return (
    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      {p.codigo && p.codigo !== codigoTh && <span className="font-mono text-xs text-[var(--text-secondary)]">{p.codigo}</span>}
      <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${CHIP_TONO_CTP[meta.tono]}`} title={meta.hint}>
        {etiquetaDeEstado(p.estado)}
      </span>
      <span className="text-[var(--text-secondary)]">{partes.join(" · ")}</span>
      {p.m3 != null && <span className="font-mono text-xs tabular-nums text-[var(--text-tertiary)]">{p.m3.toFixed(3)} m³</span>}
      {nota && <InfoTip title="Día de llegada" what={`Es el ${nota}: la pieza no guarda el suyo.`} ariaLabel="De dónde sale el día de llegada" />}
      <Link
        href={rutaFichaDeTroza(p.id)}
        className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--data-info-700)] underline-offset-2 hover:underline dark:text-[var(--data-info-500)]"
      >
        Ficha en el CTP
        <ExternalLink className="h-3 w-3" aria-hidden />
      </Link>
    </span>
  );
}
