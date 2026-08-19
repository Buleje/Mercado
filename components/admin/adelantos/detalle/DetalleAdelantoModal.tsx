"use client";

/**
 * La ficha de un adelanto ya dado.
 *
 * Salió de `AdelantosModule` porque creció: además de registrar entregas, ahora
 * tiene que RESPONDER las preguntas que llegan por teléfono («¿de cuándo es?»,
 * «¿para qué era?», «¿cómo quedamos?»). Antes mostraba sólo el código, tres
 * cifras y el historial: la fecha, la modalidad, el motivo escrito al darlo y el
 * plan pactado estaban en la base y no se veían en ninguna pantalla.
 */

import { useCallback, useEffect, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { Ban, CheckCircle, FileText, Package } from "@buleje/design-system/icons";
import { formatCurrency } from "@/lib/currency";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import { descargarComprobante } from "@/lib/adelantos/comprobante";
import type { DbAdelanto, DbEntregaPactada } from "@/lib/db/adelantos.db";
import { MODALIDAD_LABEL, MiniStat, ModalShell, STATUS_BADGE, SkeletonGrid, fmtMon, inputCls } from "../shared";
import FichaAdelanto from "./FichaAdelanto";
import PlanPactado from "./PlanPactado";

const jsonHeaders = () => csrfHeaders({ "Content-Type": "application/json" });

export default function DetalleAdelantoModal({
  adelantoId,
  onClose,
  onChange,
}: {
  adelantoId: string;
  onClose: () => void;
  onChange: () => void;
}) {
  const [a, setA] = useState<DbAdelanto | null>(null);
  const [loading, setLoading] = useState(true);
  // form entrega
  const [tipo, setTipo] = useState<"LIBRE" | "PRODUCTO">("LIBRE");
  const [descripcion, setDescripcion] = useState("");
  const [valor, setValor] = useState("");
  const [productId, setProductId] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [sumarAStock, setSumarAStock] = useState(false);
  const [entregaComp, setEntregaComp] = useState<string | null>(null);
  /** La cuota que se está liquidando: viaja como `pactadaId` y la marca cumplida. */
  const [pactada, setPactada] = useState<DbEntregaPactada | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [productos, setProductos] = useState<{ id: number; name: string; price: number; stock?: number }[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/adelantos/${adelantoId}`, { credentials: "include" });
    setA(res.ok ? await res.json() : null);
    setLoading(false);
  }, [adelantoId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch("/api/products", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d: unknown) =>
        setProductos(
          Array.isArray(d)
            ? d.map((p: { id: number; name: string; price?: number; stock?: number }) => ({
                id: p.id,
                name: p.name,
                price: Number(p.price ?? 0),
                stock: p.stock,
              }))
            : [],
        ),
      )
      .catch((e) => logger.warn("[adelantos] /api/products falló", { error: String(e) }));
  }, []);

  const prodSel = productos.find((p) => String(p.id) === productId);

  /** Prellenar desde una cuota: el texto y el monto ya estaban pactados. */
  const cumplirCuota = (p: DbEntregaPactada) => {
    setPactada(p);
    setTipo("LIBRE");
    setDescripcion(p.descripcionEsperada);
    setValor(String(p.valorEsperado));
    setErr(null);
  };

  const limpiar = () => {
    setDescripcion(""); setValor(""); setProductId(""); setCantidad("");
    setSumarAStock(false); setEntregaComp(null); setPactada(null);
  };

  const registrar = async () => {
    setErr(null);
    const body: Record<string, unknown> = {
      tipo,
      notas: descripcion.trim() || undefined,
      comprobanteUrl: entregaComp || undefined,
      /* Cierra la cuota en la misma operación: sin esto la entrega queda suelta
         y el plan sigue diciendo que la persona no cumplió. */
      pactadaId: pactada?.id,
    };
    if (tipo === "LIBRE") {
      const v = Number(valor);
      if (!descripcion.trim() || !v || v <= 0) { setErr("Describí la entrega y poné un valor."); return; }
      body.descripcion = descripcion.trim();
      body.valorManual = v;
    } else {
      const pid = Number(productId);
      if (!pid) { setErr("Elegí un producto del catálogo."); return; }
      body.productId = pid;
      body.descripcion = descripcion.trim() || undefined;
      if (cantidad) body.cantidad = Number(cantidad);
      if (valor) body.valorManual = Number(valor);
      body.sumarAStock = sumarAStock;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/adelantos/${adelantoId}/entregas`, {
        method: "POST",
        headers: jsonHeaders(),
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (res.ok) {
        limpiar();
        await load();
        onChange();
        return;
      }
      const j = await res.json().catch(() => null);
      setErr(j?.error ?? "No se pudo registrar la entrega.");
    } catch (e) {
      logger.error("[adelantos] no se pudo registrar la entrega", { error: String(e) });
      setErr("No se pudo registrar la entrega. Revisá la conexión.");
    } finally {
      setSaving(false);
    }
  };

  const cancelar = async () => {
    if (!confirm("¿Cancelar este adelanto? No se borra el historial.")) return;
    await fetch(`/api/adelantos/${adelantoId}`, {
      method: "PATCH", headers: jsonHeaders(), credentials: "include", body: JSON.stringify({ cancelar: true }),
    });
    await load();
    onChange();
  };

  const badge = a ? STATUS_BADGE[a.status] : null;
  const bloqueado = !a || a.status === "CANCELADO";

  return (
    <ModalShell
      title={a ? `Adelanto · ${a.beneficiario?.nombre ?? ""}` : "Adelanto"}
      subtitle={a ? `${a.codigoOperacion ?? "sin código"} · ${MODALIDAD_LABEL[a.modalidad] ?? a.modalidad}` : undefined}
      onClose={onClose}
      size="md"
    >
      {loading || !a ? (
        <SkeletonGrid />
      ) : (
        <div className="space-y-5">
          {/* Lo que se pide por teléfono, arriba de todo. */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[var(--surface-sunken)] px-4 py-3">
            <div className="min-w-0">
              <p className="font-mono text-base font-extrabold text-[var(--text-primary)]">
                {a.codigoOperacion ?? "— sin código —"}
              </p>
              {a.reciboManual && (
                <p className="font-mono text-sm text-[var(--text-tertiary)]">Recibo de papel {a.reciboManual}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => void descargarComprobante({
                codigoOperacion: a.codigoOperacion,
                reciboManual: a.reciboManual,
                persona: a.beneficiario?.nombre ?? "—",
                documento: a.beneficiario?.documento,
                telefono: a.beneficiario?.telefono,
                monto: a.montoAdelantado,
                moneda: a.moneda,
                fecha: a.fechaAdelanto,
                modalidad: a.modalidad,
                notas: a.notas,
              })}
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-primary hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]"
            >
              <FileText className="h-4 w-4" /> Comprobante para firmar
            </button>
          </div>

          {/* Fecha, modalidad, persona y el motivo con el que se dio. */}
          <FichaAdelanto adelanto={a} />

          <div className="grid grid-cols-3 gap-3">
            <MiniStat label="Adelantado" value={fmtMon(a.montoAdelantado, a.moneda)} />
            <MiniStat label="Entregado" value={fmtMon(a.totalEntregado, a.moneda)} tone="success" />
            <MiniStat label="Saldo" value={fmtMon(a.saldoPendiente, a.moneda)} tone={a.saldoPendiente > 0 ? "warning" : "neutral"} />
          </div>

          <div className="flex items-center gap-2">
            <span className={`inline-block rounded-full px-3 py-1 text-sm font-bold ${badge?.className ?? ""}`}>{badge?.label}</span>
            {a.comprobanteUrl && (
              <a href={a.comprobanteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline">
                {/* eslint-disable-next-line @next/next/no-img-element -- thumbnail comprobante */}
                <img src={a.comprobanteUrl} alt="comprobante" className="h-7 w-7 rounded-md border border-[var(--rule-base)] object-cover" /> Comprobante
              </a>
            )}
            {a.status !== "CANCELADO" && (
              <button onClick={cancelar} className="ml-auto inline-flex items-center gap-1.5 text-sm font-bold text-[var(--data-error)] hover:underline">
                <Ban className="h-4 w-4" /> Cancelar adelanto
              </button>
            )}
          </div>

          <PlanPactado pactadas={a.entregasPactadas} moneda={a.moneda} bloqueado={bloqueado} onCumplir={cumplirCuota} />

          {a.status !== "CANCELADO" && (
            <div className="space-y-3 rounded-2xl border-2 border-[var(--rule-base)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base font-extrabold text-[var(--text-primary)]">Registrar entrega</CardTitle>
                {pactada && (
                  <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
                    Cumple la cuota {pactada.numero}
                    <button type="button" onClick={limpiar} aria-label="Desvincular la cuota" className="font-extrabold hover:underline">
                      ×
                    </button>
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(["LIBRE", "PRODUCTO"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTipo(t)}
                    className={`h-12 rounded-2xl border-2 text-base font-bold transition-colors ${
                      tipo === t
                        ? "border-primary bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                        : "border-[var(--rule-base)] text-[var(--text-secondary)]"
                    }`}
                  >
                    {t === "LIBRE" ? "Servicio / libre" : "Producto"}
                  </button>
                ))}
              </div>
              <input
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder={tipo === "LIBRE" ? "Ej: reparación del local" : "Descripción (opcional)"}
                aria-label="Descripción de la entrega"
                className={inputCls}
              />
              {tipo === "PRODUCTO" && (
                <div className="grid grid-cols-2 gap-2">
                  <select value={productId} onChange={(e) => setProductId(e.target.value)} aria-label="Producto" className={inputCls}>
                    <option value="">Elegí un producto…</option>
                    {productos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {formatCurrency(p.price)}{p.stock != null ? ` · stock ${p.stock}` : ""}
                      </option>
                    ))}
                  </select>
                  <input type="number" min={1} value={cantidad} onChange={(e) => setCantidad(e.target.value)} placeholder="Cantidad" aria-label="Cantidad" className={`${inputCls} tabular-nums`} />
                </div>
              )}
              {tipo === "PRODUCTO" && prodSel && cantidad && Number(cantidad) > 0 && !valor && (
                <p className="text-sm text-[var(--text-secondary)]">
                  Valor estimado: <strong className="text-[var(--text-primary)]">{formatCurrency(prodSel.price * Number(cantidad))}</strong> ({Number(cantidad)} × {formatCurrency(prodSel.price)})
                </p>
              )}
              <input
                type="number"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder={tipo === "LIBRE" ? "Valor en S/" : "Valor S/ (vacío = precio × cantidad)"}
                aria-label="Valor de la entrega"
                className={`${inputCls} tabular-nums`}
              />
              {tipo === "PRODUCTO" && (
                <label className="flex items-center gap-2 text-base font-semibold text-[var(--text-secondary)]">
                  <input type="checkbox" checked={sumarAStock} onChange={(e) => setSumarAStock(e.target.checked)} className="h-5 w-5" />
                  Sumar al stock del inventario
                </label>
              )}
              <ComprobanteUpload url={entregaComp} onChange={setEntregaComp} />
              {err && <p className="text-base font-semibold text-[var(--data-error)]">{err}</p>}
              <button
                onClick={registrar}
                disabled={saving}
                className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[var(--data-success)] px-5 text-base font-bold text-white transition hover:opacity-90 disabled:opacity-50"
              >
                <CheckCircle className="h-5 w-5" /> {saving ? "Registrando…" : "Registrar entrega"}
              </button>
            </div>
          )}

          <div>
            <CardTitle className="mb-2 text-base font-extrabold text-[var(--text-primary)]">
              Historial de entregas ({a.entregas.length})
            </CardTitle>
            {a.entregas.length === 0 ? (
              <p className="text-base text-[var(--text-tertiary)]">Todavía no hay entregas.</p>
            ) : (
              <ul className="space-y-2">
                {a.entregas.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 rounded-2xl border-2 border-[var(--rule-soft)] px-4 py-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--data-success)]/10 text-[var(--data-success)]">
                      {e.tipo === "PRODUCTO" ? <Package className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-bold text-[var(--text-primary)]">
                        {e.descripcion || (e.tipo === "PRODUCTO" ? `Producto #${e.productId}` : "Entrega")}
                      </p>
                      <p className="text-sm tabular-nums text-[var(--text-tertiary)]">
                        {new Date(e.fecha).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })}
                        {e.cantidad != null && ` · ${e.cantidad} u.`}
                        {e.sumadoAStock && " · sumado al stock"}
                      </p>
                    </div>
                    {e.comprobanteUrl && (
                      <a href={e.comprobanteUrl} target="_blank" rel="noopener noreferrer" title="Ver comprobante" className="shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element -- thumbnail comprobante */}
                        <img src={e.comprobanteUrl} alt="comprobante" className="h-9 w-9 rounded-lg border border-[var(--rule-base)] object-cover" />
                      </a>
                    )}
                    <span className="shrink-0 text-base font-extrabold tabular-nums text-[var(--data-success)]">{fmtMon(e.valor, a.moneda)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </ModalShell>
  );
}

/** Comprobante de una entrega: se adjunta desde el disco. */
function ComprobanteUpload({ url, onChange }: { url: string | null; onChange: (u: string | null) => void }) {
  const [up, setUp] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    setUp(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("folder", "media");
    try {
      const res = await fetch("/api/upload", { method: "POST", headers: csrfHeaders(), credentials: "include", body: fd });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.url) onChange(j.url);
      else setErr(j?.error ?? "No se pudo subir la imagen.");
    } catch (e2) {
      logger.error("[adelantos] fallo la subida del comprobante", { error: String(e2) });
      setErr("No se pudo subir la imagen.");
    } finally {
      setUp(false);
    }
  };
  return (
    <div>
      {url ? (
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- thumbnail desde Supabase Storage */}
          <img src={url} alt="comprobante" className="h-12 w-12 rounded-lg border border-[var(--rule-base)] object-cover" />
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-primary hover:underline">Ver</a>
          <button type="button" onClick={() => onChange(null)} className="text-sm font-bold text-[var(--data-error)] hover:underline">Quitar</button>
        </div>
      ) : (
        <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-primary hover:text-primary">
          <FileText className="h-4 w-4" /> {up ? "Subiendo…" : "Adjuntar comprobante"}
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handle} className="hidden" disabled={up} />
        </label>
      )}
      {err && <p className="mt-1 text-sm text-[var(--data-error)]">{err}</p>}
    </div>
  );
}
