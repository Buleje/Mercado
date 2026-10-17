"use client";

/**
 * «Emitir comprobante» (auditoría de comprobantes p1, 17-10): antes era un
 * formulario a mano titulado siempre «Emitir comprobante SUNAT», con el id
 * técnico del pedido a copiar y un botón que no decía qué se creaba. Ahora:
 *
 *   1. Elegir el pedido con buscador (los que ya tienen comprobante vivo no se
 *      eligen: el servidor devolvería el mismo).
 *   2. Revisar: qué se crea (oficial, prueba o nada), quién emite y con qué
 *      serie, el cliente validado y las líneas y el total del pedido.
 *   3. Resultado según la respuesta real, con «Revisar el pedido» si no se
 *      sabe si quedó.
 *
 * Todos los botones son `type="button"` y no hay `<form>`: Enter no emite.
 */
import { useEffect, useMemo } from "react";
import { Loader2, Send } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { modoDeEmision } from "@/components/admin/sunat/requisitos-emision";
import { estadoDe, type CargaEstadoSunat } from "@/components/admin/sunat/use-estado-sunat";
import { AvisoModoEmision } from "./AvisoModoEmision";
import { EmitirPasoOrigen } from "./EmitirPasoOrigen";
import { EmitirPasoRevisar } from "./EmitirPasoRevisar";
import { EmitirResultado } from "./EmitirResultado";
import { validarCliente } from "./emision-reglas";
import type { EDocument } from "./tipos";
import type { Emision } from "./use-emision";
import { usePedidosParaEmitir } from "./use-pedidos-para-emitir";

const PASOS = { origen: "Paso 1 de 3 · Elige el pedido", revisar: "Paso 2 de 3 · Revisa antes de emitir", resultado: "Paso 3 de 3 · Resultado" } as const;
const PRIMARIO = button({ variant: "primary", className: "rounded-xl" });
const SECUNDARIO = button({ variant: "secondary", className: "rounded-xl" });

interface Props {
  emision: Emision;
  docs: readonly EDocument[];
  sunat: CargaEstadoSunat;
}

export function ModalEmitirComprobante({ emision, docs, sunat }: Props) {
  const estado = estadoDe(sunat);
  const lectura = modoDeEmision(estado);
  const pedidos = usePedidosParaEmitir(emision.abierto, docs, emision.preelegido);
  const { paso, pedido, datos, resultado, elegir } = emision;
  const falta = useMemo(() => (pedido ? validarCliente(datos, pedido.total) : null), [pedido, datos]);

  // Abierta desde otra pantalla con `?emitir=<id>`: salta a Revisar; si ese
  // pedido ya tiene comprobante, queda a la vista con el motivo.
  const preelegido = pedidos.preelegido;
  const { setBusqueda } = pedidos;
  useEffect(() => {
    if (paso !== "origen" || !preelegido) return;
    if (preelegido.bloqueo === null) elegir(preelegido);
    else setBusqueda(preelegido.codigo);
  }, [paso, preelegido, elegir, setBusqueda]);

  const puedeConfirmar = sunat.fase !== "cargando" && lectura.puedeEmitir && falta === null && !emision.enviando;

  const pie =
    paso === "origen" ? (
      <ModalFooter nota={pedidos.fase === "lista" ? `${pedidos.total} pedidos recientes` : undefined}>
        <button type="button" onClick={emision.cerrar} className={SECUNDARIO}>Cancelar</button>
      </ModalFooter>
    ) : paso === "revisar" ? (
      <ModalFooter nota="Sólo documenta el pedido: no cobra otra vez ni descuenta stock.">
        <button type="button" onClick={emision.volverAlOrigen} disabled={emision.enviando} className={SECUNDARIO}>Atrás</button>
        <button type="button" onClick={emision.confirmar} disabled={!puedeConfirmar} data-qa="emitir-confirmar" className={PRIMARIO}>
          {emision.enviando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
          {emision.enviando ? "Emitiendo…" : lectura.accion}
        </button>
      </ModalFooter>
    ) : (
      <ModalFooter>
        {resultado?.revisarAntes && (
          <button type="button" onClick={emision.revisar} disabled={emision.revisando} className={PRIMARIO}>
            {emision.revisando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Revisar el pedido
          </button>
        )}
        {resultado?.puedeReintentar && (
          <button type="button" onClick={emision.corregir} className={SECUNDARIO}>Corregir y reintentar</button>
        )}
        <button type="button" onClick={emision.volverAlOrigen} className={SECUNDARIO}>Emitir otro</button>
        <button type="button" onClick={emision.cerrar} className={SECUNDARIO}>Listo</button>
      </ModalFooter>
    );

  return (
    <AdminModal
      open={emision.abierto}
      onClose={emision.cerrar}
      title={lectura.titulo}
      description={PASOS[paso]}
      icon={Send}
      size="lg"
      claveVentana="efactura-emitir"
      footer={pie}
    >
      <div className={`${MODAL_BODY} space-y-4`}>
        {paso !== "resultado" && <AvisoModoEmision estado={estado} lectura={lectura} />}
        {paso === "origen" && <EmitirPasoOrigen pedidos={pedidos} onElegir={elegir} />}
        {paso === "revisar" && pedido && (
          <EmitirPasoRevisar
            pedido={pedido}
            datos={datos}
            setDatos={emision.setDatos}
            emisor={estado?.emisor ?? null}
            falta={falta}
            onCambiarPedido={emision.volverAlOrigen}
          />
        )}
        {paso === "resultado" && resultado && <EmitirResultado resultado={resultado} />}
      </div>
    </AdminModal>
  );
}
