"use client";

/**
 * Revisar una factura leída antes de registrarla como compra: proveedor, N.º
 * del comprobante (con el aviso «ya está cargada»), y por fila el producto de
 * tu catálogo, la cantidad y el costo. Guarda por `POST /api/purchases`.
 */

import { useEffect, useMemo, useState } from "react";
import { Receipt, Trash2, AlertTriangle } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatDate } from "@/lib/format";
import { type CamposFactura, type PropuestaPapel, type RespuestaEntender } from "@/lib/admin/comandos-ia/papel";
import type { Papel } from "./use-leer-papel";
import { MarcoPapel } from "./MarcoPapel";
import { SelectorProducto } from "./SelectorProducto";
import { anotarRecibo, buscarCompraConNumero, guardarCompra, type CompraYaCargada, type FilaCompraBorrador } from "./guardar-papel";
import { CAMPO, SIN_PERMISO, soles, permite } from "./formato";

type PropuestaCompra = Extract<PropuestaPapel, { destino: "compra" }>;

const ETIQUETA = "text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]";
/** Producto | Cantidad | Costo c/u: la misma plantilla en la cabecera y en cada fila. */
const COLUMNAS = "sm:grid-cols-[minmax(0,1fr)_6rem_7rem]";

export function RevisarCompra({ papel, resultado: r, rol, onCerrar, onDescartar, onGuardado }: {
  papel: Papel;
  resultado: RespuestaEntender;
  rol: string | null;
  onCerrar: () => void;
  onDescartar: () => void;
  onGuardado: (resumen: string) => void;
}) {
  const campos = r.campos as CamposFactura;
  const propuesta = r.propuesta as PropuestaCompra;
  const [proveedor, setProveedor] = useState(propuesta.proveedor.nombre);
  const [numero, setNumero] = useState(campos.numero ?? "");
  const [filas, setFilas] = useState<FilaCompraBorrador[]>(() =>
    propuesta.filas.map((f, i) => ({ clave: `f${i}`, nombre: f.nombre, cantidad: f.cantidad, costoUnitario: f.costoUnitario, producto: f.producto, alternativas: f.alternativas })),
  );
  const [yaCargada, setYaCargada] = useState<CompraYaCargada | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const puede = permite(rol, "compra");
  const esBoleta = /boleta/i.test(papel.texto);

  useEffect(() => {
    if (!puede) return;
    let vivo = true;
    const t = setTimeout(() => {
      buscarCompraConNumero(numero).then((c) => { if (vivo) setYaCargada(c); }).catch(() => { if (vivo) setYaCargada(null); });
    }, 400);
    return () => { vivo = false; clearTimeout(t); };
  }, [numero, puede]);

  const sumaFilas = useMemo(() => filas.reduce((s, f) => s + f.cantidad * f.costoUnitario, 0), [filas]);
  const sinProducto = filas.filter((f) => !f.producto).length;
  /* Contra el total impreso: igual (costos con IGV) o ×1.18 (costos sin IGV, el IGV va
     abajo). Ninguna de las dos, por más de S/ 0.10 = alguna fila se leyó mal. */
  const total = campos.total;
  const cuadraConIgv = total != null && Math.abs(sumaFilas - total) <= 0.1;
  const igvAparte = total != null && !cuadraConIgv && Math.abs(sumaFilas * 1.18 - total) <= 0.1;
  const noCuadra = total != null && !cuadraConIgv && !igvAparte;
  const cambiar = (clave: string, cambio: Partial<FilaCompraBorrador>) =>
    setFilas((fs) => fs.map((f) => (f.clave === clave ? { ...f, ...cambio } : f)));

  const motivo = !puede ? SIN_PERMISO.compra
    : filas.length === 0 ? "No quedan productos: descarta el papel o vuelve a leerlo."
    : sinProducto ? `Elige el producto de ${sinProducto} ${sinProducto === 1 ? "fila" : "filas"}.`
    : filas.some((f) => f.cantidad <= 0) ? "Hay una fila con cantidad 0: pon cuántas llegaron o quítala."
    : null;

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      const nombreProv = proveedor.trim() || "Proveedor sin nombre";
      const po = await guardarCompra({
        supplierId: proveedor === propuesta.proveedor.nombre ? propuesta.proveedor.supplierId : null,
        supplierName: nombreProv,
        invoiceNumber: numero,
        invoiceType: esBoleta ? "boleta" : "factura",
        igvIncluido: !igvAparte,
        filas,
        idempotencyKey: papel.id,
      });
      anotarRecibo({ tipo: "compra", resumen: `Compra de ${nombreProv} · ${filas.length} productos · ${soles(po.total)}`, filas: filas.length, costoIaUsd: r.costoIaUsd, refId: po.id });
      onGuardado(`Compra guardada · ${soles(po.total)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la compra.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <MarcoPapel
      abierto
      onCerrar={onCerrar}
      titulo="Revisar factura"
      icono={Receipt}
      costoIaUsd={r.costoIaUsd}
      error={error}
      motivo={motivo}
      onDescartar={onDescartar}
      textoLeido={papel.texto}
      accion={puede ? { texto: yaCargada ? "Guardar otra vez" : "Guardar compra", onClick: () => void guardar(), deshabilitada: !!motivo, ocupada: guardando } : null}
    >
      {yaCargada && (
        <p role="status" className="flex items-start gap-2 rounded-lg border border-[var(--data-warning-500)] bg-[var(--surface-sunken)] px-3 py-2 text-sm text-[var(--text-primary)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-warning-500)]" aria-hidden />
          <span>Esta factura ya está cargada: {yaCargada.proveedor || "compra"} del {formatDate(yaCargada.fecha)} por {soles(yaCargada.total)}.</span>
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className={ETIQUETA}>Proveedor · leído, revisa</span>
          <input value={proveedor} onChange={(e) => setProveedor(e.target.value)} className={CAMPO} maxLength={200} />
          <span className="block text-xs text-[var(--text-tertiary)]">
            {propuesta.proveedor.supplierId && proveedor === propuesta.proveedor.nombre ? "Está en tu lista de proveedores" : "Se guarda solo el nombre"}
            {propuesta.proveedor.ruc ? ` · RUC ${propuesta.proveedor.ruc}` : ""}
          </span>
        </label>
        <label className="block space-y-1">
          <span className={ETIQUETA}>N.º de {esBoleta ? "boleta" : "factura"} · leído, revisa</span>
          <input value={numero} onChange={(e) => setNumero(e.target.value)} className={CAMPO} maxLength={60} placeholder="F001-00001234" />
        </label>
      </div>

      <div className="space-y-2">
        {/* Una sola fila de rótulos: «Productos (n) ⓘ» y, en la compu, las columnas de cada fila. */}
        <div className={`grid items-center gap-2 sm:px-3 ${COLUMNAS}`}>
          <span className="flex items-center gap-1.5">
            <span className={ETIQUETA}>Productos ({filas.length})</span>
            <InfoTip
              title="Stock y costo"
              what="La compra queda pendiente: el stock sube y el costo se promedia cuando la recibes en Compras."
              example="Arroz: 108 → 110 al recibir 2 bolsas."
              side="bottom"
            />
          </span>
          <span aria-hidden className={`${ETIQUETA} hidden sm:block`}>Cantidad</span>
          <span aria-hidden className={`${ETIQUETA} hidden sm:block`}>Costo c/u</span>
        </div>
        <ul className="space-y-2">
          {filas.map((f) => (
            <li key={f.clave} className="space-y-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 text-xs text-[var(--text-tertiary)]">Leído: <span className="text-[var(--text-secondary)]">{f.nombre}</span></p>
                <button
                  type="button"
                  onClick={() => setFilas((fs) => fs.filter((x) => x.clave !== f.clave))}
                  aria-label={`Quitar ${f.nombre}`}
                  className="-m-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--data-error-500)]"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <div className={`grid grid-cols-2 gap-2 ${COLUMNAS}`}>
                <div className="col-span-2 sm:col-span-1">
                  <SelectorProducto valor={f.producto} alternativas={f.alternativas} leido={f.nombre} onCambiar={(p) => cambiar(f.clave, { producto: p })} />
                </div>
                {/* El rótulo visible sólo en el celular: en la compu lo pone la cabecera de columnas. */}
                <label className="block space-y-1">
                  <span className={`${ETIQUETA} sm:hidden`}>Cantidad</span>
                  <input type="number" inputMode="decimal" min={0} step="any" value={f.cantidad} aria-label={`Cantidad de ${f.nombre}`}
                    onChange={(e) => cambiar(f.clave, { cantidad: Math.max(0, Number(e.target.value) || 0) })} className={`${CAMPO} tabular-nums`} />
                </label>
                <label className="block space-y-1">
                  <span className={`${ETIQUETA} sm:hidden`}>Costo c/u</span>
                  <input type="number" inputMode="decimal" min={0} step="0.01" value={f.costoUnitario} aria-label={`Costo por unidad de ${f.nombre}`}
                    onChange={(e) => cambiar(f.clave, { costoUnitario: Math.max(0, Number(e.target.value) || 0) })} className={`${CAMPO} tabular-nums`} />
                </label>
              </div>
              {f.producto && (
                <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums text-[var(--text-secondary)]">
                  <span>Stock {f.producto.stock ?? "—"} → <b className="text-[var(--text-primary)]">{f.producto.stock != null ? f.producto.stock + f.cantidad : "—"}</b> {f.producto.unidad}</span>
                  <span>Costo {f.producto.costo != null ? soles(f.producto.costo) : "—"} → <b className="text-[var(--text-primary)]">{soles(f.costoUnitario)}</b></span>
                </p>
              )}
            </li>
          ))}
        </ul>
        <p className="flex flex-wrap items-center justify-end gap-x-1.5 text-right text-sm tabular-nums text-[var(--text-secondary)]">
          {noCuadra && <AlertTriangle className="h-4 w-4 text-[var(--data-warning-500)]" aria-hidden />}
          <span>Tus filas suman <b className="text-[var(--text-primary)]">{soles(sumaFilas)}</b></span>
          {total != null && (
            <span className={noCuadra ? "font-semibold text-[var(--text-primary)]" : ""}>
              · el papel dice {soles(total)}{igvAparte ? " con IGV" : ""}
            </span>
          )}
        </p>
      </div>
    </MarcoPapel>
  );
}
