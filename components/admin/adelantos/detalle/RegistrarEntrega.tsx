"use client";

/**
 * «Registrar entrega» en la ficha de un adelanto — o «Registrar lo que le
 * diste» cuando la plata la RECIBISTE (ADR-448): ahí el que entrega es el
 * negocio, y si devuelve en plata la caja da un egreso, no un ingreso.
 */

import { useEffect, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { AlertTriangle, CheckCircle, FileText } from "@buleje/design-system/icons";
import { formatCurrency } from "@/lib/currency";
import { ACEPTA_ADJUNTO, archivoDeLocal, leerAdjuntoLocal, subirAdjuntoPrivado } from "@/lib/adelantos/adjunto-local";
import { logger } from "@/lib/logger";
import { Field, inputCls } from "../shared";
import { OrigenCaja } from "../crear-adelanto/campos-monto";
import type { RegistroEntrega } from "./use-registrar-entrega";

export default function RegistrarEntrega({
  entrega: f,
  recibido,
  aserrioSeCobraSolo = false,
}: {
  entrega: RegistroEntrega;
  recibido: boolean;
  /**
   * Adelanto por servicio de una persona vinculada al directorio forestal: su
   * aserrío ya se cobra en cada corrida. Anotarlo acá también lo cobraría dos veces.
   */
  aserrioSeCobraSolo?: boolean;
}) {
  const prodSel = f.productos.find((p) => String(p.id) === f.productId);
  const titulo = recibido ? "Registrar lo que le diste" : "Registrar entrega";
  /* Lo recibido se devuelve con el servicio, madera descrita o plata: pagarlo
     con producto del negocio llega en la fase 2 (hoy el servidor da 400). */
  const { tipo, setTipo } = f;
  useEffect(() => {
    if (recibido && tipo !== "LIBRE") setTipo("LIBRE");
  }, [recibido, tipo, setTipo]);
  return (
    <div className="space-y-3 rounded-2xl border border-[var(--rule-base)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-sm font-bold text-[var(--text-primary)]">{titulo}</CardTitle>
        {f.pactada && (
          <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-bold text-[var(--accent-ink)]">
            Cumple la cuota {f.pactada.numero}
            <button type="button" onClick={f.limpiar} aria-label="Desvincular la cuota" className="font-extrabold hover:underline">
              ×
            </button>
          </span>
        )}
      </div>
      {aserrioSeCobraSolo && (
        <p className="flex items-start gap-2 rounded-xl bg-[var(--data-warning-500)]/10 px-3 py-2 text-sm font-semibold text-[var(--data-warning-ink)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          El aserrío ya se cobra en cada corrida: no lo anotes a mano. Acá va sólo si le devuelves plata.
        </p>
      )}
      {!recibido && (
      <div className="grid grid-cols-2 gap-2">
        {(["LIBRE", "PRODUCTO"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => f.setTipo(t)}
            className={`h-12 rounded-2xl border-2 text-base font-semibold transition-colors ${
              f.tipo === t ? "border-primary bg-primary/10 text-[var(--accent-ink)]" : "border-[var(--rule-base)] text-[var(--text-secondary)]"
            }`}
          >
            {t === "LIBRE" ? "Servicio / libre" : "Producto"}
          </button>
        ))}
      </div>
      )}
      <input
        value={f.descripcion}
        onChange={(e) => f.setDescripcion(e.target.value)}
        placeholder={f.tipo === "LIBRE" ? (recibido ? "Ej: aserrío de 3 462 pt, o devolución en plata" : "Ej: reparación del local") : "Descripción (opcional)"}
        aria-label="Descripción de la entrega"
        className={inputCls}
      />
      {f.tipo === "PRODUCTO" && (
        <div className="grid grid-cols-2 gap-2">
          <select value={f.productId} onChange={(e) => f.setProductId(e.target.value)} aria-label="Producto" className={inputCls}>
            <option value="">Elige un producto…</option>
            {f.productos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {formatCurrency(p.price)}
                {p.stock != null ? ` · stock ${p.stock}` : ""}
              </option>
            ))}
          </select>
          <input type="number" min={1} value={f.cantidad} onChange={(e) => f.setCantidad(e.target.value)} placeholder="Cantidad" aria-label="Cantidad" className={`${inputCls} tabular-nums`} />
        </div>
      )}
      {f.tipo === "PRODUCTO" && prodSel && f.cantidad && Number(f.cantidad) > 0 && !f.valor && (
        <p className="text-sm text-[var(--text-secondary)]">
          Valor estimado: <strong className="text-[var(--text-primary)]">{formatCurrency(prodSel.price * Number(f.cantidad))}</strong> ({Number(f.cantidad)} × {formatCurrency(prodSel.price)})
        </p>
      )}
      <input
        type="number"
        value={f.valor}
        onChange={(e) => f.setValor(e.target.value)}
        placeholder={f.tipo === "LIBRE" ? "Valor en S/" : "Valor S/ (vacío = precio × cantidad)"}
        aria-label="Valor de la entrega"
        className={`${inputCls} tabular-nums`}
      />
      {/* Lo recibido se paga con producto del negocio: sumarlo al stock sería una compra. */}
      {f.tipo === "PRODUCTO" && !recibido && (
        <label className="flex items-center gap-2 text-base font-semibold text-[var(--text-secondary)]">
          <input type="checkbox" checked={f.sumarAStock} onChange={(e) => f.setSumarAStock(e.target.checked)} className="h-5 w-5" />
          Sumar al stock del inventario
        </label>
      )}
      {f.tipo === "LIBRE" && (
        <Field
          grupo
          label={recibido ? "Si le devolviste plata, ¿de dónde salió?" : "Si te pagó con plata, ¿a dónde entró?"}
          info={{
            what: recibido ? "Anota el egreso en la caja abierta." : "Anota el ingreso en la caja abierta, para que el arqueo cuadre.",
            affects: "«No mover la caja» no anota nada: úsalo si te pagó con trabajo o madera.",
          }}
        >
          <OrigenCaja metodo={f.metodoCaja} onCambiar={f.setMetodoCaja} />
        </Field>
      )}
      <ComprobanteUpload adelantoId={f.adelantoId} url={f.comprobante} onChange={f.setComprobante} />
      {f.err && <p className="text-base font-semibold text-[var(--data-error-ink)]">{f.err}</p>}
      <button
        onClick={f.registrar}
        disabled={f.saving}
        className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[var(--accent-dark)] px-5 text-base font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
      >
        <CheckCircle className="h-5 w-5" /> {f.saving ? "Registrando…" : titulo}
      </button>
    </div>
  );
}

/**
 * Comprobante de una entrega: se adjunta desde el disco, foto o PDF.
 * (10-10, Ley 29733) Va PRIVADO a la carpeta del adelanto (`POST …/adjunto`) y
 * la entrega guarda `priv:<ruta>`; antes subía a `/api/upload` (bucket
 * público). La miniatura sale del archivo local: lo privado no tiene URL.
 */
function ComprobanteUpload({ adelantoId, url, onChange }: { adelantoId: string; url: string | null; onChange: (u: string | null) => void }) {
  const [up, setUp] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [vista, setVista] = useState<{ src: string; pdf: boolean } | null>(null);
  const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErr(null);
    setUp(true);
    try {
      const local = await leerAdjuntoLocal(file);
      if (!local.ok) {
        setErr(local.error);
        return;
      }
      const r = await subirAdjuntoPrivado(adelantoId, await archivoDeLocal(local.dataUrl, "comprobante"));
      if (r.ok) {
        setVista({ src: local.dataUrl, pdf: local.pdf });
        onChange(r.comprobanteUrl);
      } else setErr(r.error);
    } catch (e2) {
      logger.error("[adelantos] fallo la subida del comprobante", { error: String(e2) });
      setErr("No se pudo guardar el comprobante.");
    } finally {
      setUp(false);
    }
  };
  const quitar = () => {
    setVista(null);
    onChange(null);
  };
  return (
    <div>
      {url ? (
        <div className="flex items-center gap-2">
          {vista && !vista.pdf ? (
            /* eslint-disable-next-line @next/next/no-img-element -- miniatura del archivo local (data URL) */
            <img src={vista.src} alt="comprobante" className="h-12 w-12 rounded-lg border border-[var(--rule-base)] object-cover" />
          ) : (
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
              <FileText className="h-5 w-5" />
            </span>
          )}
          <span className="text-sm font-semibold text-[var(--text-secondary)]">Guardado privado</span>
          <button type="button" onClick={quitar} className="text-sm font-bold text-[var(--data-error)] hover:underline">Quitar</button>
        </div>
      ) : (
        <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-primary hover:text-primary">
          <FileText className="h-4 w-4" /> {up ? "Guardando…" : "Adjuntar comprobante"}
          <input type="file" accept={ACEPTA_ADJUNTO} onChange={handle} className="hidden" disabled={up} />
        </label>
      )}
      {err && <p className="mt-1 text-sm text-[var(--data-error)]">{err}</p>}
    </div>
  );
}
