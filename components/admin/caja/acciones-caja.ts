/**
 * El menú «Más» de Caja: lo que no es de uso constante (arqueos, imprimir,
 * exportar, WhatsApp, tolerancia, refrescar). Salió de CashRegisterTab para
 * que el orquestador no pase de 300 líneas; las acciones son las mismas.
 */
import { Calculator, Download, MessageCircle, Printer, RefreshCw, Scan, Settings } from "@buleje/design-system/icons";
import type { MenuAccion } from "@/components/admin/shared/action-menu";
import type { ParteDelDia } from "@/lib/caja/parte-del-dia";
import { enviarParteWhatsApp, exportarMovimientosCsv, imprimirParte } from "./acciones-parte";
import type { CashRegister, ModalCaja } from "./tipos";

interface Entrada {
  caja: CashRegister | null;
  parte: ParteDelDia | null;
  nombreNegocio?: string;
  tolerancia: number;
  abrirModal: (m: ModalCaja) => void;
  avisar: (texto: string) => void;
  recargar: () => void;
}

export function accionesDeCaja({ caja, parte, nombreNegocio, tolerancia, abrirModal, avisar, recargar }: Entrada): MenuAccion[] {
  const conCaja = (a: Omit<MenuAccion, "disabled">): MenuAccion => ({
    ...a,
    disabled: !caja,
    hint: caja ? a.hint : "Abre una caja primero",
  });
  return [
    conCaja({ id: "arqueo", seccion: "Contar", label: "Arqueo express", hint: "Cuenta el cajón sin cerrar", icon: Scan, onSelect: () => abrirModal("arqueo") }),
    conCaja({ id: "guiado", seccion: "Contar", label: "Arqueo guiado", hint: "Billetes, monedas y vouchers; cierra la caja", icon: Calculator, onSelect: () => abrirModal("guiado") }),
    conCaja({
      id: "imprimir",
      seccion: "Parte del día",
      label: "Imprimir parte",
      hint: "Hoja de 80 mm para la impresora térmica",
      icon: Printer,
      onSelect: () => {
        if (caja && !imprimirParte(caja, parte, nombreNegocio))
          avisar("Tu navegador bloqueó la ventana de impresión: permite las ventanas emergentes de este sitio.");
      },
    }),
    conCaja({
      id: "csv",
      seccion: "Parte del día",
      label: "Exportar movimientos (CSV)",
      hint: "Se abre en Excel, con el origen de cada uno",
      icon: Download,
      onSelect: () => caja && exportarMovimientosCsv(caja),
    }),
    {
      id: "whatsapp",
      seccion: "Parte del día",
      label: "Enviar parte por WhatsApp",
      hint: parte ? "Esperado, retiros y cuadre con ventas" : "Abre una caja primero",
      icon: MessageCircle,
      disabled: !parte || !caja,
      onSelect: () => parte && enviarParteWhatsApp(parte),
    },
    { id: "tolerancia", seccion: "Ajustes", label: "Tolerancia de diferencia", meta: `±S/${tolerancia}`, icon: Settings, onSelect: () => abrirModal("tolerancia") },
    { id: "refrescar", seccion: "Ajustes", label: "Refrescar", hint: "Se refresca solo cada 30 s", icon: RefreshCw, onSelect: recargar },
  ];
}
