"use client";

/**
 * CtpDespachoViaje — el viaje de un despacho, dentro de su ficha.
 *
 * Un camión con tres permisos sale con tres GTF, pero SUNAT ampara todo con
 * UNA guía de remisión (GRE) y el cliente paga UNA factura por el viaje
 * (Blas, 28-10: GTF 69, 70 y 71 con la GRE EG07-189 y la factura E001-318).
 * Aquí se anota la GRE una vez para todo el viaje y se le pone el precio,
 * que el servidor reparte en cada línea por volumen.
 *
 * El viaje lo decide el servidor (`ForestCtpDespachoDB.viajeDe`): mismo día
 * y misma placa o mismo destinatario.
 */

import { useCallback, useEffect, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { Banknote, Loader2, Truck } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { csrfHeaders } from "@/lib/csrf-client";
import { formatNumber } from "@/lib/format";
import { diaCorto, gtfCorta, type GreEnLinea, type ViajeDeDespacho } from "@/lib/forestal/despacho-viaje";
import { Btn, I } from "./ctp-shared";
import CtpDespachoViajePrecioModal from "./CtpDespachoViajePrecioModal";

/** «S/» y la cifra nunca se parten en dos renglones (espacio duro). */
const soles = (n: number) => `S/\u00a0${formatNumber(n, 2)}`;
const lista = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);

/** Lo que pasó con la GRE en las demás líneas, en una frase. */
function resumenGre(numero: string, lineas: GreEnLinea[] | undefined): string {
  if (!lineas) return `Guía de remisión ${numero} anotada.`;
  const puestas = lineas.filter((l) => l.estado === "anotada" || l.estado === "ya_estaba").length;
  const otras = lineas.filter((l) => l.estado === "tenia_otra" || l.estado === "no_se_pudo");
  const base = `Guía de remisión ${numero} en ${puestas} de ${lineas.length} líneas del viaje.`;
  if (!otras.length) return base;
  return `${base} No se tocó ${lista(otras.map((l) => `#${l.lineNo}${l.estado === "tenia_otra" ? ` (ya tiene ${l.actual})` : ""}`))}.`;
}

export default function CtpDespachoViaje({ despachoId, gtfNumber }: { despachoId: string; gtfNumber: string | null }) {
  const [viaje, setViaje] = useState<ViajeDeDespacho | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gre, setGre] = useState("");
  const [todoElViaje, setTodoElViaje] = useState(true);
  const [anotando, setAnotando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [precioAbierto, setPrecioAbierto] = useState(false);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch(`/api/admin/forestal/ctp?viaje=${encodeURIComponent(despachoId)}`, { credentials: "include" });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json.message ?? `HTTP ${r.status}`);
      setViaje(json.viaje ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }, [despachoId]);
  useEffect(() => { void cargar(); }, [cargar]);

  if (cargando) {
    return (
      <p className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Buscando las demás salidas del viaje…
      </p>
    );
  }
  if (!viaje) return error ? <p className="text-sm font-bold text-[var(--data-error-700)]">{error}</p> : null;

  const propia = viaje.lineas.find((l) => l.id === despachoId);
  const otrasGuias = viaje.guias.filter((g) => g !== (gtfNumber ?? "").trim());
  const otrasLineas = viaje.lineas.length - 1;
  const conGre = viaje.lineas.filter((l) => l.gre).length;
  const conPrecio = viaje.lineas.filter((l) => l.valorVenta != null);
  const totalPuesto = conPrecio.reduce((t, l) => t + Math.round((l.valorVenta ?? 0) * 100), 0) / 100;
  const ptTotal = viaje.lineas.reduce((t, l) => t + (l.pt ?? 0), 0);
  const m3Total = viaje.lineas.reduce((t, l) => t + (l.m3 ?? 0), 0);
  const greActual = propia?.gre ?? "";

  async function anotar() {
    const numero = gre.trim();
    if (!numero) return setError("Escribe el N.º de la guía de remisión (por ejemplo EG07-189).");
    setAnotando(true);
    setError(null);
    setAviso(null);
    try {
      const r = await fetch("/api/admin/forestal/ctp", {
        method: "PATCH",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ id: despachoId, action: "guia_remision", numero, todoElViaje: todoElViaje && otrasLineas > 0 }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json.message ?? `HTTP ${r.status}`);
      setAviso(resumenGre(json.guiaRemisionNro ?? numero, json.lineas));
      setGre("");
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAnotando(false);
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-4">
      <div className="flex items-center gap-2">
        <Truck className="h-4 w-4 text-[var(--text-tertiary)]" />
        <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">Viaje del {diaCorto(viaje.dia)}</CardTitle>
        <InfoTip
          what="Las salidas que van en el mismo camión: mismo día y misma placa, o el mismo cliente."
          affects="La guía de remisión y el precio se ponen una vez y quedan en todas las líneas del viaje."
          example="GTF 69, 70 y 71 del 28-10 van con una sola guía de remisión, EG07-189."
        />
      </div>
      <p className="text-sm text-[var(--text-secondary)]">
        {viaje.guias.length ? `GTF ${lista(viaje.guias.map(gtfCorta))}` : "Sin GTF"} · {viaje.lineas.length} {viaje.lineas.length === 1 ? "línea" : "líneas"}
        {ptTotal > 0 && <> · <span className="font-mono tabular-nums">{formatNumber(ptTotal, 2)}</span> PT</>}
        {m3Total > 0 && <> · <span className="font-mono tabular-nums">{formatNumber(m3Total, 3)}</span> m³</>}
      </p>

      {/* Guía de remisión */}
      <div className="space-y-2 border-t border-[var(--rule-soft)] pt-3">
        <p className="text-sm text-[var(--text-secondary)]">
          Guía de remisión:{" "}
          {greActual ? <strong className="font-mono text-[var(--text-primary)]">{greActual}</strong> : <span className="text-[var(--text-tertiary)]">sin anotar</span>}
          {viaje.lineas.length > 1 && <span className="text-[var(--text-tertiary)]"> · en {conGre} de {viaje.lineas.length} líneas</span>}
        </p>
        <div className="flex gap-2">
          <input
            className={I}
            value={gre}
            onChange={(e) => setGre(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void anotar(); }}
            placeholder={greActual || "EG07-189"}
            aria-label="N.º de la guía de remisión"
            maxLength={24}
          />
          <Btn variant="primary" disabled={anotando || !gre.trim()} onClick={() => void anotar()}>
            {anotando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Anotar
          </Btn>
        </div>
        {otrasLineas > 0 && (
          <label className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={todoElViaje} onChange={(e) => setTodoElViaje(e.target.checked)} />
            <span>
              {otrasGuias.length
                ? `Anotar también en ${otrasGuias.length === 1 ? "la otra guía" : `las otras ${otrasGuias.length} guías`} de este viaje (GTF ${lista(otrasGuias.map(gtfCorta))})`
                : `Anotar también en ${otrasLineas === 1 ? "la otra línea" : `las otras ${otrasLineas} líneas`} de esta guía`}
            </span>
          </label>
        )}
      </div>

      {/* Precio del viaje */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--rule-soft)] pt-3">
        <p className="text-sm text-[var(--text-secondary)]">
          <Banknote className="mr-1 inline h-4 w-4 text-[var(--text-tertiary)]" />
          {conPrecio.length ? (
            <>
              Precio: <strong className="font-mono tabular-nums text-[var(--text-primary)]">{soles(totalPuesto)}</strong>
              {conPrecio.length < viaje.lineas.length && <> en {conPrecio.length} de {viaje.lineas.length} líneas</>}
              {ptTotal > 0 && <> · {soles(totalPuesto / ptTotal)} por PT</>}
              {propia?.comprobante && <> · {propia.comprobante}</>}
            </>
          ) : (
            <span className="text-[var(--text-tertiary)]">Sin precio de venta</span>
          )}
        </p>
        <Btn variant="secondary" size="sm" onClick={() => setPrecioAbierto(true)}>
          {conPrecio.length ? "Cambiar el precio" : "Poner precio a este viaje"}
        </Btn>
      </div>

      {error && <p role="alert" className="text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</p>}
      {aviso && <p className="text-sm font-medium text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">{aviso}</p>}

      {precioAbierto && (
        <CtpDespachoViajePrecioModal
          despachoId={despachoId}
          viaje={viaje}
          onClose={() => setPrecioAbierto(false)}
          onGuardado={(texto) => { setAviso(texto); setPrecioAbierto(false); void cargar(); }}
        />
      )}
    </section>
  );
}
