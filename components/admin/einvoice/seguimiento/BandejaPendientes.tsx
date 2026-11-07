"use client";

/**
 * Bandeja de pendientes (N02 / F56 / M58): todo lo que quedó a medias en los
 * papeles del negocio, ordenado por urgencia. Cada fila lleva a su origen y se
 * cierra sola cuando el origen cambia (la boleta aceptada, la nota emitida):
 * no hay «descartar» que esconda un pendiente sin resolverlo. Los mensajes de
 * SUNAT se agrupan por causa con su salida, y una respuesta que no llegó nunca
 * se confunde con un rechazo (reenviarla duplicaría el comprobante).
 */
import { useMemo, useState } from "react";
import { CardTitle, DataTable, LoadingState } from "@buleje/design-system";
import { ArrowRight, CheckCircle2, FolderOpen } from "@buleje/design-system/icons";
import { BarraFiltrosTabla, SinCoincidenciasFila, useFiltrosTabla, type ColumnaFiltro } from "@/components/admin/forestal/filtros-tabla-forestal";
import { presetsPendientes } from "@/components/admin/shared/vistas-de-fabrica";
import { ThColumna } from "@/components/admin/shared/th-columna";
import { useOrdenColumna, type AccesorOrden } from "@/components/admin/shared/use-orden-columna";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { hrefDeDestino } from "@/lib/admin/enlaces-panel";
import { cn } from "@/lib/utils";
import { diasDesde, textoDiaCorto, textoFecha } from "@/lib/comprobantes/periodo";
import { diaDeVigencia, diasParaVencer } from "@/lib/cotizaciones/vigencia";
import { contarPorCausa, ROTULO_CAUSA, type CausaPendiente, type Pendiente, type TipoRespuesta } from "@/lib/comprobantes/pendientes";
import { abrirExpediente } from "../expediente/expediente-url";
import { fmt } from "../tipos";
import { CHIP, CHIP_TONO, ROTULO_GRAVEDAD, TONO_GRAVEDAD, type Tono } from "../tonos";
import type { CargaPendientes } from "./use-pendientes";

const RESPUESTA: Record<TipoRespuesta, { rotulo: string; tono: Tono }> = {
  captura: { rotulo: "Error de captura", tono: "aviso" },
  rechazo: { rotulo: "Rechazo confirmado", tono: "error" },
  desconocida: { rotulo: "Respuesta desconocida", tono: "info" },
};

/** Filtros de columna: la bandeja llega entera (no se pagina en el servidor). La causa sigue en los chips de arriba. */
const COLUMNAS: readonly ColumnaFiltro<Pendiente>[] = [
  { id: "prioridad", label: "Prioridad", tipo: "multi", valor: (p) => ROTULO_GRAVEDAD[p.gravedad], soloConVarios: true },
  { id: "documento", label: "Qué falta", tipo: "texto", valor: (p) => [p.documento, ROTULO_CAUSA[p.causa]] },
  { id: "cliente", label: "Cliente", tipo: "texto", valor: (p) => p.cliente || null },
  { id: "importe", label: "Importe", tipo: "rango", numero: (p) => p.importe, unidad: "S/", paso: 0.01 },
  { id: "responsable", label: "Responsable", tipo: "multi", valor: (p) => p.responsable ?? null, soloConVarios: true },
  { id: "desde", label: "Desde", tipo: "fecha", numero: (p) => diaDeVigencia(p.fecha) },
];

const PESO_GRAVEDAD = { alta: 3, media: 2, baja: 1 } as const;
const ORDEN: Record<string, AccesorOrden<Pendiente>> = {
  prioridad: { valor: (p) => PESO_GRAVEDAD[p.gravedad] },
  documento: { valor: (p) => p.documento, texto: true },
  cliente: { valor: (p) => p.cliente, texto: true },
  importe: { valor: (p) => p.importe },
  responsable: { valor: (p) => p.responsable, texto: true },
  desde: { valor: (p) => diaDeVigencia(p.fecha) },
};

const CHIP_FILTRO = "inline-flex h-12 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition-colors";

function irAlOrigen(p: Pendiente) {
  irAEnlace(hrefDeDestino({ tab: "facturacion", params: { vista: p.ir.vista, ...(p.ir.params ?? {}) } }));
}

/** Los mensajes técnicos agrupados por causa, con cuántos son y qué hacer. */
function PorCausa({ lista }: { lista: readonly Pendiente[] }) {
  const grupos = useMemo(() => {
    const m = new Map<string, { grupo: string; tipo: TipoRespuesta; sugerencia: string; cantidad: number }>();
    for (const p of lista) {
      if (!p.grupo || !p.tipoRespuesta) continue;
      const g = m.get(p.grupo) ?? { grupo: p.grupo, tipo: p.tipoRespuesta, sugerencia: p.siguiente, cantidad: 0 };
      g.cantidad += 1;
      m.set(p.grupo, g);
    }
    return [...m.values()].sort((a, b) => b.cantidad - a.cantidad);
  }, [lista]);
  if (grupos.length === 0) return null;
  return (
    <section aria-labelledby="seg-por-causa" className="rounded-xl border border-[var(--rule-base)] p-4">
      <div className="mb-2 flex items-center gap-2">
        <CardTitle id="seg-por-causa">Respuestas de SUNAT por causa</CardTitle>
        <InfoTip
          what="Los mensajes técnicos agrupados: «Error de captura» = un dato mal puesto que corriges tú; «Rechazo confirmado» = SUNAT lo rechazó; «Respuesta desconocida» = no llegó respuesta."
          affects="Una respuesta desconocida NO es un rechazo: si reenvías, SUNAT puede terminar con dos comprobantes iguales. Espera o consulta su estado."
          example="3 boletas «Datos del cliente»: el DNI tiene 7 dígitos; corrígelo en el pedido y emite de nuevo."
        />
      </div>
      <ul className="grid gap-2">
        {grupos.map((g) => (
          <li key={g.grupo} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="font-bold tabular-nums text-[var(--text-primary)]">{g.cantidad}</span>
            <span className="font-semibold text-[var(--text-primary)]">{g.grupo}</span>
            <span className={cn(CHIP, CHIP_TONO[RESPUESTA[g.tipo].tono])}>{RESPUESTA[g.tipo].rotulo}</span>
            <span className="basis-full text-[var(--text-secondary)] sm:basis-auto">{g.sugerencia}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * La fecha de la fila y su «hace…». Una cotización por vencer trae su día de
 * vigencia (futuro, guardado a medianoche UTC): se lee como día y «vence en…»,
 * no «hoy» ni el día anterior en Lima.
 */
function cuandoDe(p: Pendiente, ahora: number): { dia: string; relativo: string } {
  if (p.causa === "cotizacion-por-vencer") {
    const dia = diaDeVigencia(p.fecha);
    const n = diasParaVencer(p.fecha, ahora);
    const relativo = n == null ? "" : n <= 0 ? "vence hoy" : n === 1 ? "vence mañana" : `vence en ${n} días`;
    return { dia: dia ? textoDiaCorto(dia) : "—", relativo };
  }
  const d = diasDesde(p.fecha, ahora);
  return { dia: textoFecha(p.fecha), relativo: d === 0 ? "hoy" : d === 1 ? "hace 1 día" : `hace ${d} días` };
}

function FilaPendiente({ p, ahora }: { p: Pendiente; ahora: number }) {
  const tono = TONO_GRAVEDAD[p.gravedad];
  const cuando = cuandoDe(p, ahora);
  return (
    <tr data-qa={`pendiente-${p.causa}`}>
      <td>
        <span className={cn(CHIP, CHIP_TONO[tono])}>{ROTULO_GRAVEDAD[p.gravedad]}</span>
      </td>
      <td>
        <span className="font-semibold text-[var(--text-primary)]">{p.documento}</span>
        {!p.confirmado && <span className={cn(CHIP, CHIP_TONO.info, "ml-2")}>Sin confirmar</span>}
        <br />
        <span className="text-sm text-[var(--text-secondary)]">{ROTULO_CAUSA[p.causa]}</span>
        {p.tipoRespuesta && <span className={cn(CHIP, CHIP_TONO[RESPUESTA[p.tipoRespuesta].tono], "ml-2")}>{RESPUESTA[p.tipoRespuesta].rotulo}</span>}
        <p className="text-sm text-[var(--text-tertiary)]">{p.siguiente}</p>
      </td>
      <td>{p.cliente || "—"}</td>
      <td className="whitespace-nowrap font-bold tabular-nums">{p.importe == null ? "—" : fmt(p.importe)}</td>
      <td title={p.responsable ? undefined : "El comprobante no guarda quién lo emitió"}>{p.responsable ?? "—"}</td>
      <td className="whitespace-nowrap text-[var(--text-secondary)]">
        {cuando.dia}
        <br />
        <span className="text-sm">{cuando.relativo}</span>
      </td>
      <td>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => irAlOrigen(p)}
            data-qa="pendiente-ir"
            className="inline-flex h-12 items-center gap-1 rounded-xl px-3 text-sm font-bold text-primary hover:bg-[var(--surface-sunken)]"
          >
            Ir <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
          {p.operacion && (
            <button
              type="button"
              onClick={() => p.operacion && abrirExpediente(p.operacion)}
              aria-label={`Expediente de ${p.documento}`}
              title="Ver el expediente de la operación"
              className="inline-flex h-12 w-12 items-center justify-center rounded-xl text-primary hover:bg-[var(--surface-sunken)]"
            >
              <FolderOpen className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

export function BandejaPendientes({ carga, ahora }: { carga: CargaPendientes; ahora: number }) {
  const [causa, setCausa] = useState<CausaPendiente | null>(null);
  const lista = carga.fase === "listo" ? carga.pendientes : carga.fase === "cargando" ? (carga.previa ?? []) : [];
  const cuentas = useMemo(() => contarPorCausa(lista), [lista]);
  const visibles = useMemo(() => (causa ? lista.filter((p) => p.causa === causa) : lista), [lista, causa]);
  const f = useFiltrosTabla(visibles, COLUMNAS);
  const ord = useOrdenColumna(ORDEN);
  const filas = ord.ordenar(f.filtradas);

  if (carga.fase === "error") {
    return <p role="alert" className="text-sm font-semibold text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]">{carga.mensaje}</p>;
  }
  if (carga.fase === "cargando" && !carga.previa) return <LoadingState message="Revisando tus papeles…" />;
  if (lista.length === 0) {
    return (
      <p className="flex items-center gap-2 py-6 text-sm font-semibold text-[var(--data-success-ink)] dark:text-[var(--data-success-500)]">
        <CheckCircle2 className="h-5 w-5" aria-hidden /> Todo en orden: no hay papeles pendientes.
      </p>
    );
  }

  const elegido = (c: CausaPendiente | null) => causa === c;
  const claseChip = (activo: boolean) =>
    cn(CHIP_FILTRO, activo ? "border-primary bg-primary/10 text-[var(--text-primary)]" : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]");

  return (
    <div className="space-y-4" aria-busy={carga.fase === "cargando"}>
      <div role="group" aria-label="Filtrar por causa" className="flex flex-wrap gap-2">
        <button type="button" aria-pressed={elegido(null)} onClick={() => setCausa(null)} className={claseChip(elegido(null))}>
          Todo <span className="tabular-nums">{lista.length}</span>
        </button>
        {cuentas.map((c) => (
          <button key={c.causa} type="button" aria-pressed={elegido(c.causa)} onClick={() => setCausa(elegido(c.causa) ? null : c.causa)} className={claseChip(elegido(c.causa))}>
            {ROTULO_CAUSA[c.causa]} <span className="tabular-nums">{c.cantidad}</span>
          </button>
        ))}
      </div>

      <PorCausa lista={f.filtradas} />

      <BarraFiltrosTabla excel="Comprobantes pendientes" vistas="comprobantes-pendientes" presets={presetsPendientes()} f={f} />

      <DataTable className="min-w-[720px]">
        <thead>
          <tr>
            <ThColumna label="Prioridad" ids={["prioridad"]} f={f} orden={ord} ordenId="prioridad" />
            <ThColumna label="Qué falta" ids={["documento"]} f={f} orden={ord} ordenId="documento" />
            <ThColumna label="Cliente" ids={["cliente"]} f={f} orden={ord} ordenId="cliente" />
            <ThColumna label="Importe" ids={["importe"]} f={f} orden={ord} ordenId="importe" />
            <ThColumna label="Responsable" ids={["responsable"]} f={f} orden={ord} ordenId="responsable" />
            <ThColumna label="Desde" ids={["desde"]} f={f} orden={ord} ordenId="desde" />
            <th>
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {filas.length === 0 && <SinCoincidenciasFila colSpan={7} />}
          {filas.map((p) => (
            <FilaPendiente key={p.id} p={p} ahora={ahora} />
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}
