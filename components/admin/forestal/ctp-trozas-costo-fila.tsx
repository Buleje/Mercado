"use client";

/**
 * Una guía sin costo dentro de «Cargar costos» (patio de trozas → Valor parado):
 * total de la guía ⇄ S/ por m³ —uno calcula el otro— y guardar.
 *
 * Guarda por la MISMA puerta que Ingresos → «Plata de la guía» (ADR-437):
 * `usePlataDeGuia` → PUT `/api/admin/forestal/guias/plata`, UNA transacción por
 * guía que deja el acta del costo (`costoDetalle`, modo «total de la factura»).
 * Las reglas viven allá y acá sólo se muestran: sólo admin/dueño escribe, mes
 * cerrado y costo congelado no se tocan, la madera de servicio no lleva costo y,
 * si otro la costeó mientras mirabas, 409. Se descartó el PATCH `set_costo`
 * suelto: un total repartido en N PATCH no es atómico ni deja acta (la cáscara
 * de `CtpCostoGuiaModal` cuenta por qué se retiró).
 *
 * El reparto entre las especies de la guía es `repartoDeGuia` (puro, con tests).
 */

import { useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowLeftRight, CheckCircle2, Loader2 } from "@buleje/design-system/icons";
import { formatCurrency } from "@/lib/format";
import { aNumero } from "@/lib/forestal/trozas-import";
import { repartoDeGuia, type GuiaSinCosto, type RepartoDeGuia } from "@/lib/forestal/trozas-patio-kpis";
import type { GuardarCompraInput, PlataDeGuiaDTO } from "@/lib/forestal/plata-de-guia";
import { usePlataDeGuia } from "@/hooks/use-plata-de-guia";
import { Btn } from "./ctp-shared";
import { n2 } from "./ctp-trozas-ui";

/** Lo que la fila le deja al modal para «Guardar todo». */
export interface FilaRegistrada {
  listo: boolean;
  /** Tiene proveedor enlazado: sólo entonces «anotar en la cuenta» hace algo. */
  conProveedor: boolean;
  guardar: () => Promise<boolean>;
}

/** «18,400» es dieciocho mil (así lo escribe la tienda); el resto, como lo lee la importación. */
const monto = (s: string): number | null =>
  /^\s*\d{1,3}(,\d{3})+\s*$/.test(s) ? Number(s.replace(/[,\s]/g, "")) : aNumero(s);

const INPUT =
  "h-11 w-32 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-8 pr-2 text-sm tabular-nums text-[var(--text-primary)] focus:border-[var(--accent)] disabled:opacity-50";

/** El cuerpo del PUT de «Plata de la guía» con el costo repartido por m³. */
function cuerpoDe(dto: PlataDeGuiaDTO, r: RepartoDeGuia, anotar: boolean): GuardarCompraInput {
  /* Igual que el borrador de Ingresos: sólo un proveedor SEGURO se anota solo; y
     si la guía ya estaba en una cuenta, se actualiza en vez de borrarse. */
  const proveedorId = dto.proveedor?.seguro ? dto.proveedor.parteId : (dto.cuenta?.parteId ?? null);
  return {
    tipo: "compra",
    gtfNumber: dto.gtfNumber,
    proveedorParteId: proveedorId,
    totalFactura: r.total,
    anotarEnCuenta: Boolean(proveedorId) && (anotar || dto.cuenta != null),
    vistos: dto.lineas.map((l) => ({ id: l.id, antes: l.costoTotal })),
    lineas: dto.lineas.map((l) => ({
      woodEntryId: l.id,
      costoTotal: r.lineas.find((x) => x.id === l.id)?.costoTotal ?? 0,
      detalle: {
        v: 1 as const,
        modo: "total" as const,
        unidad: "m3" as const,
        precio: r.porM3 > 0 && r.porM3 <= 100_000 ? r.porM3 : null,
        cantidadFactura: null,
        ptDerivado: Math.max(0, l.ptDerivado),
        totalFactura: r.total,
        ptUsado: null,
      },
    })),
  };
}

export default function FilaCostoGuia({
  guia,
  anotar,
  reportar,
  onGuardado,
}: {
  guia: GuiaSinCosto;
  /** Anotar la guía en la cuenta de su proveedor (lo que le debes), como en Ingresos. */
  anotar: boolean;
  reportar: (gtf: string, fila: FilaRegistrada | null) => void;
  /** Costo por asiento que el servidor aceptó: la tarjeta cambia sin releer el patio. */
  onGuardado: (costos: ReadonlyMap<string, number>) => void;
}) {
  const plata = usePlataDeGuia(guia.gtfNumber);
  const { dto } = plata;
  const [de, setDe] = useState<"total" | "m3">("total");
  const [texto, setTexto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recien, setRecien] = useState(false);

  const lineas = dto?.lineas ?? [];
  const m3Guia = dto ? lineas.reduce((a, l) => a + l.volumeM3, 0) : null;
  const costeadas = lineas.filter((l) => l.costoTotal != null);
  const completa = dto?.tipo === "compra" && lineas.length > 0 && costeadas.length === lineas.length;
  const freno = !dto
    ? null
    : dto.tipo === "servicio"
      ? "Es madera de servicio: no se compró y no lleva costo."
      : dto.bloqueo
        ? dto.bloqueo.mensaje
        : costeadas.length > 0 && !completa
          ? `Ya tiene costo en ${costeadas.map((l) => l.speciesCommonName).join(", ")}: complétala en Ingresos → Plata de la guía, con precio por especie.`
          : null;
  const valor = monto(texto);
  const reparto =
    dto && valor != null ? repartoDeGuia({ de, valor }, lineas.map((l) => ({ id: l.id, volumeM3: l.volumeM3 }))) : null;
  const listo = Boolean(reparto) && !freno && !completa && !guardando;
  const conProveedor = Boolean(dto?.proveedor?.seguro);

  async function guardar(): Promise<boolean> {
    if (!dto || !reparto || freno || completa) return false;
    setGuardando(true);
    setError(null);
    const r = await plata.guardar(cuerpoDe(dto, reparto, anotar));
    setGuardando(false);
    if (!r.ok) {
      setError(r.mensaje);
      return false;
    }
    setRecien(true);
    setTexto("");
    onGuardado(new Map(reparto.lineas.map((l) => [l.id, l.costoTotal])));
    return true;
  }

  /* «Guardar todo» llama a la versión más nueva, no a la del render en que se registró. */
  const guardarRef = useRef(guardar);
  useEffect(() => {
    guardarRef.current = guardar;
  });
  useEffect(() => {
    reportar(guia.gtfNumber, { listo, conProveedor, guardar: () => guardarRef.current() });
  }, [guia.gtfNumber, listo, conProveedor, reportar]);
  useEffect(() => () => reportar(guia.gtfNumber, null), [guia.gtfNumber, reportar]);

  const campo = (cual: "total" | "m3", label: string) => {
    const propio = de === cual;
    const derivado = reparto ? (cual === "total" ? reparto.total : reparto.porM3).toFixed(2) : "";
    return (
      <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--text-secondary)]">
        {label}
        <span className="relative">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-[var(--text-tertiary)]">S/</span>
          <input
            inputMode="decimal"
            value={propio ? texto : derivado}
            disabled={guardando}
            onChange={(e) => {
              setDe(cual);
              setTexto(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void guardar();
              }
              /* Con algo tipeado, Escape lo borra y NO cierra el modal. */
              if (e.key === "Escape" && texto) {
                e.stopPropagation();
                setTexto("");
              }
            }}
            placeholder={cual === "total" ? "factura" : "precio"}
            aria-label={`${cual === "total" ? "Total" : "S/ por m³"} de la guía ${guia.gtfNumber}`}
            className={INPUT}
          />
        </span>
      </label>
    );
  };

  const total = dto?.totalMadera ?? null;
  const pz = `${guia.piezas} ${guia.piezas === 1 ? "pieza" : "piezas"}`;
  return (
    <li className="space-y-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <p className="min-w-0 text-sm font-bold text-[var(--text-primary)]">
          <span className="font-mono">{guia.gtfNumber}</span>
          <span className="font-normal text-[var(--text-secondary)]"> · {guia.proveedor ?? "sin proveedor"}</span>
        </p>
        <p className="text-xs font-semibold text-[var(--text-secondary)]">{guia.especies.join(" · ") || "sin especie"}</p>
      </div>
      <p className="text-xs tabular-nums text-[var(--text-tertiary)]">
        {n2(guia.m3Patio)} m³ en patio ({pz}) de {m3Guia == null ? "…" : n2(m3Guia)} m³ de la guía
        {guia.diasMax != null ? ` · ${guia.diasMax} d parada` : ""}
      </p>

      {!dto && plata.error ? (
        <p className="flex flex-wrap items-center gap-2 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {plata.error}
          <Btn size="sm" onClick={() => void plata.cargar()}>Reintentar</Btn>
        </p>
      ) : !dto ? (
        <p className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Leyendo la guía…
        </p>
      ) : completa ? (
        <p className="flex items-center gap-1.5 text-sm font-semibold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          {recien ? "Guardado" : "Ya tiene costo"}: {formatCurrency(total)}
          {total != null && m3Guia ? ` · ${formatCurrency(total / m3Guia)} por m³` : ""}
        </p>
      ) : freno ? (
        <p className="flex items-start gap-1.5 text-sm text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {freno}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-2">
            {campo("total", "Total de la guía")}
            <ArrowLeftRight className="mb-3.5 h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
            {campo("m3", "S/ por m³")}
            <Btn variant="primary" onClick={() => void guardar()} disabled={!listo} className="h-11">
              {guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
              Guardar
            </Btn>
          </div>
          {reparto && lineas.length > 1 && (
            <p className="text-xs tabular-nums text-[var(--text-secondary)]">
              Se reparte por m³:{" "}
              {lineas
                .map((l) => `${l.speciesCommonName} ${n2(l.volumeM3)} m³ → ${formatCurrency(reparto.lineas.find((x) => x.id === l.id)?.costoTotal ?? 0)}`)
                .join(" · ")}
            </p>
          )}
          {/* Sin proveedor enlazado no se anota en ninguna cuenta: no hace falta decirlo en cada fila. */}
          {dto.proveedor?.seguro && (
            <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
              {anotar || dto.cuenta
                ? `Se anota en la cuenta de ${dto.proveedor.nombre} (lo que le debes).`
                : `No se anota en la cuenta de ${dto.proveedor.nombre}.`}
            </p>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="flex items-start gap-1.5 text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          No se guardó: {error}
        </p>
      )}
    </li>
  );
}
