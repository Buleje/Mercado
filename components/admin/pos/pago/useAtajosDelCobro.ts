import { useEffect, useRef } from "react";
import { esCodigoDeBarras } from "@/components/admin/pos/usePOSLectorCodigo";
import type { PagoModal } from "@/components/admin/pos/pago/usePagoModal";

const MODAL = '[data-modal-variante="pos"]';
/** Donde Enter ya hace algo propio (activar un botón, elegir un cliente, abrir un select). */
const CONTROLES =
  'input, textarea, select, button, a[href], [role="radio"], [role="menuitem"], [role="option"], [role="combobox"], [contenteditable=""], [contenteditable="true"]';

/**
 * Lleva el foco al buscador de clientes del cobro (Fiado lo exige). Scrollea
 * sólo el cuerpo del modal: `scrollIntoView` movía también la página de atrás,
 * y con ella la ventana entera.
 */
export function enfocarBuscarCliente(): void {
  const modal = document.querySelector<HTMLElement>(MODAL);
  const input = modal?.querySelector<HTMLInputElement>("[data-pago-buscar-cliente] input");
  if (!modal || !input) return;
  input.focus({ preventScroll: true });
  let caja = input.parentElement;
  while (caja && caja !== modal && !(caja.scrollHeight > caja.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(caja).overflowY))) {
    caja = caja.parentElement;
  }
  if (!caja || caja === modal) return;
  const a = caja.getBoundingClientRect();
  const b = input.getBoundingClientRect();
  caja.scrollBy({ top: b.top - a.top - (a.height - b.height) / 2, behavior: "smooth" });
}

/**
 * Atajos del cobro, sólo teclado y foco (la venta la arma `usePagoModal`):
 *
 * - **Enter cobra** — llama a `handleConfirm()`, que no hace nada si
 *   `canConfirm` es falso. Corre desde «Recibido»/«Monto» (`data-pago-enter`) o
 *   con el foco fuera de un control; en un botón, el buscador o un select Enter
 *   sigue haciendo lo suyo. Callado con la lista de clientes, «Dividir cuenta»,
 *   el QR grande o el alta de cliente abiertos, y si lo tipeado parece un código
 *   de barras (el lector escribe dígitos + Enter: no puede cobrar por error).
 * - **Fiado sin cliente** → el foco salta al buscador de clientes.
 */
export function useAtajosDelCobro(p: PagoModal): void {
  const actual = useRef(p);
  useEffect(() => {
    actual.current = p;
  });

  useEffect(() => {
    const alPresionar = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.repeat || e.isComposing || e.defaultPrevented) return;
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const cobro = actual.current;
      if (cobro.processing || cobro.showCustomerList || cobro.showSplit || cobro.qrAbierto || cobro.showNewCustomer) return;
      const destino = e.target instanceof HTMLElement ? e.target : null;
      const modal = document.querySelector(MODAL);
      if (!destino || !modal?.contains(destino)) return;
      if (destino.closest(CONTROLES) && !destino.closest("[data-pago-enter]")) return;
      if (destino instanceof HTMLInputElement && esCodigoDeBarras(destino.value)) return;
      e.preventDefault();
      cobro.handleConfirm();
    };
    document.addEventListener("keydown", alPresionar);
    return () => document.removeEventListener("keydown", alPresionar);
  }, []);

  const { isFiado, customerPhone } = p;
  useEffect(() => {
    if (isFiado && !customerPhone) enfocarBuscarCliente();
    // Sólo al pasar a Fiado: elegir y quitar un cliente no tiene que mover el foco.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFiado]);
}
