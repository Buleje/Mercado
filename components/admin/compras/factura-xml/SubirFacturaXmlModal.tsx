"use client";

/**
 * «Compra desde la factura XML»: el .xml del proveedor (o el .zip de SUNAT) →
 * vista previa → elegir el producto de cada línea → crear la compra. Queda
 * pendiente como cualquier orden: el stock entra al recibirla. El total lo
 * suma el servidor. Factura en dólares: se guarda en soles con el tipo de
 * cambio SUNAT del día de emisión (tarjeta `FacturaXmlDolar`).
 */
import { useState, type DragEvent } from "react";
import { CardTitle, ErrorAlert, InfoAlert, WarningAlert } from "@buleje/design-system";
import { FileUp, Loader2, Upload } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { CAMPO } from "@/components/admin/comandos-ia/papel/formato";
import type { VistaPreviaFacturaXml } from "@/lib/compras/factura-xml-cruce";
import FacturaXmlDolar from "./FacturaXmlDolar";
import FacturaXmlLineas from "./FacturaXmlLineas";
import FacturaXmlRucProveedor from "./FacturaXmlRucProveedor";
import { PROVEEDOR_NUEVO, useFacturaXml } from "./use-factura-xml";
import { FORMAS_DE_PAGO, compraEnSoles, fechaConDia, lineasSinProducto, monto, totalDeLasLineas, type FormaDePago } from "./compra-desde-factura";

const ACEPTA = ".xml,.zip,text/xml,application/xml,application/zip,application/x-zip-compressed";
const TARJETA = "space-y-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3";
const DATO = "text-sm text-[var(--text-primary)]";
const ETIQUETA = "text-xs text-[var(--text-secondary)]";

function avisosDe(v: VistaPreviaFacturaXml): string[] {
  const f = v.factura;
  const lista: string[] = [];
  if (!f.cuadre.cuadra) {
    lista.push(`Las líneas suman ${monto(f.cuadre.calculado, f.moneda)} y la factura dice ${monto(f.cuadre.declarado, f.moneda)}: revísala`);
  }
  if (f.totales.descuentos > 0) {
    lista.push(`Trae un descuento de ${monto(f.totales.descuentos, f.moneda)} que no se reparte en los productos`);
  }
  // «Los montos se muestran en esa moneda, no en soles» (del lector): ya no es así,
  // la tarjeta del tipo de cambio dice a cuánto equivale y se guarda en soles.
  return [...lista, ...f.avisos.filter((a) => !a.startsWith("La factura está en "))];
}

export default function SubirFacturaXmlModal({
  open,
  onClose,
  onCreada,
}: {
  open: boolean;
  onClose: () => void;
  onCreada: (po: { id: string; total: number }) => void;
}) {
  const x = useFacturaXml();
  const [arrastrando, setArrastrando] = useState(false);
  const v = x.vista;
  const f = v?.factura;
  const faltan = v ? lineasSinProducto(v.factura.lineas, x.elegidos, x.quitadas).length : 0;
  const todasQuitadas = Boolean(v && x.quitadas.length >= v.factura.lineas.length);
  const sinCambio = x.tipoCambio.necesita && !x.tipoCambio.cambio;
  const bloqueada = !v || faltan > 0 || todasQuitadas || sinCambio || Boolean(v.yaCargada) || x.guardando;
  const avisos = v ? avisosDe(v) : [];

  const soltar = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setArrastrando(false);
    const archivo = e.dataTransfer.files[0];
    if (archivo) void x.elegirArchivo(archivo);
  };
  const crear = async () => {
    const po = await x.crear();
    if (po) onCreada(po);
  };
  const nota = !v
    ? undefined
    : v.yaCargada
      ? "Esta factura ya está cargada"
      : todasQuitadas
        ? "Quitaste todas las líneas"
        : faltan > 0
          ? `Falta elegir ${faltan} ${faltan === 1 ? "producto" : "productos"}`
          : sinCambio
            ? x.tipoCambio.cargando
              ? "Buscando el tipo de cambio…"
              : "Falta el tipo de cambio para pasarla a soles"
            : "El total lo suma el sistema al guardar";

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      title="Compra desde la factura XML"
      icon={FileUp}
      size="xl"
      claveVentana="compra-factura-xml"
      footer={
        <ModalFooter error={v ? x.error : null} nota={nota}>
          {v && (
            <button type="button" onClick={x.reiniciar} disabled={x.guardando} className={button({ variant: "ghost" })}>
              Otro archivo
            </button>
          )}
          <button type="button" onClick={onClose} className={button({ variant: "secondary" })}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void crear()}
            disabled={bloqueada}
            className={button({ variant: "primary" })}
            data-factura-xml-crear
          >
            {x.guardando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Crear compra
          </button>
        </ModalFooter>
      }
    >
      <div className={`${MODAL_BODY} space-y-4`}>
        <input
          id="factura-xml-archivo"
          type="file"
          accept={ACEPTA}
          className="sr-only"
          data-factura-xml-archivo
          onChange={(e) => {
            const archivo = e.target.files?.[0];
            e.target.value = "";
            if (archivo) void x.elegirArchivo(archivo);
          }}
        />
        {!v && (
          <label
            htmlFor="factura-xml-archivo"
            onDragOver={(e) => {
              e.preventDefault();
              setArrastrando(true);
            }}
            onDragLeave={() => setArrastrando(false)}
            onDrop={soltar}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-10 text-center transition-colors ${
              arrastrando ? "border-[var(--accent)] bg-[var(--accent-muted)]" : "border-[var(--rule-base)] hover:border-[var(--accent)]"
            }`}
          >
            <Upload className={`h-6 w-6 text-[var(--accent)] ${x.leyendo ? "animate-pulse" : ""}`} aria-hidden />
            <span className="text-sm font-semibold text-[var(--text-primary)]">
              {x.leyendo ? `Leyendo ${x.archivo ?? "la factura"}…` : "Elige o arrastra la factura del proveedor"}
            </span>
            <span className={ETIQUETA}>El .xml que te mandó o el .zip que baja de SUNAT</span>
          </label>
        )}
        {!v && x.error && <ErrorAlert title={x.error} />}

        {v && f && (
          <>
            {v.yaCargada && (
              <WarningAlert
                title="Esta factura ya está cargada"
                description={`La compra de ${v.yaCargada.supplierName ?? "este proveedor"} por ${monto(Number(v.yaCargada.total), "PEN")} se guardó el ${fechaConDia(String(v.yaCargada.createdAt).slice(0, 10))}. No se crea otra.`}
              />
            )}
            {avisos.length > 0 && <WarningAlert title="Revisa antes de guardar" description={avisos.join(" · ")} />}
            {v.catalogoRecortado && (
              <InfoAlert title="Tu catálogo es grande: si no ves el producto en la lista, usa «Buscar otro…»." />
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className={TARJETA} data-factura-xml-proveedor>
                <CardTitle>Proveedor</CardTitle>
                <p className={`${DATO} font-semibold`}>{f.emisor.razonSocial}</p>
                <p className={ETIQUETA}>
                  RUC {f.emisor.ruc}
                  {f.emisor.nombreComercial ? ` · ${f.emisor.nombreComercial}` : ""}
                </p>
                <FacturaXmlRucProveedor ruc={f.emisor.ruc} fechaFactura={fechaConDia(f.fecha)} />
                {v.proveedor.existente ? (
                  <p className="text-xs font-semibold text-[var(--data-success-ink)]">Ya está en tus proveedores</p>
                ) : v.proveedor.parecidos.length > 0 ? (
                  <label className="block space-y-1">
                    <span className={ETIQUETA}>¿Es uno de tus proveedores?</span>
                    <select className={CAMPO} value={x.proveedor} onChange={(e) => x.setProveedor(e.target.value)}>
                      <option value={PROVEEDOR_NUEVO}>No, agrégalo como proveedor nuevo</option>
                      {v.proveedor.parecidos.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <p className="text-xs font-semibold text-[var(--data-warning-ink)]">Es nuevo: se agrega a tus proveedores al crear la compra</p>
                )}
              </div>
              <div className={TARJETA}>
                <CardTitle>
                  {f.tipo === "boleta" ? "Boleta" : "Factura"} {f.serieNumero}
                </CardTitle>
                <p className={DATO}>
                  Del {fechaConDia(f.fecha)}
                  {f.fechaVencimiento ? ` · vence el ${fechaConDia(f.fechaVencimiento)}` : ""}
                </p>
                <p className={DATO}>
                  Total del papel <span className="font-semibold tabular-nums">{monto(f.totales.total, f.moneda)}</span>{" "}
                  <span className={ETIQUETA}>(IGV {monto(f.totales.igv, f.moneda)})</span>
                </p>
                {x.quitadas.length > 0 && (
                  <p className={DATO} data-factura-xml-total-nuevo>
                    Con las líneas que quedan{" "}
                    <span className="font-semibold tabular-nums">{monto(totalDeLasLineas(f.lineas, x.quitadas), f.moneda)}</span>
                    {x.tipoCambio.cambio && f.moneda !== "PEN" && (
                      <span className={ETIQUETA}> = {monto(compraEnSoles(f.lineas, x.quitadas, x.tipoCambio.cambio.venta), "PEN")}</span>
                    )}
                  </p>
                )}
                <label className="block space-y-1">
                  <span className={ETIQUETA}>Forma de pago</span>
                  <select className={CAMPO} value={x.formaDePago} onChange={(e) => x.setFormaDePago(e.target.value as FormaDePago)}>
                    {FORMAS_DE_PAGO.map((o) => (
                      <option key={o.valor} value={o.valor}>
                        {o.etiqueta}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            {x.tipoCambio.necesita && <FacturaXmlDolar estado={x.tipoCambio} fecha={f.fecha} totalPapel={f.totales.total} descuentos={f.totales.descuentos} lineas={f.lineas} quitadas={x.quitadas} />}
            <FacturaXmlLineas
              lineas={f.lineas}
              sugerencias={v.lineas}
              elegidos={x.elegidos}
              moneda={f.moneda}
              tipoCambio={x.tipoCambio.cambio?.venta ?? null}
              quitadas={x.quitadas}
              onCambiar={x.cambiarProducto}
              onQuitar={x.alternarLinea}
            />
          </>
        )}
      </div>
    </AdminModal>
  );
}
