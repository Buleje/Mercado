"use client";

/**
 * «Guardar en el archivador» con el celular (Brandon 31-10): eliges en qué
 * archivador (o separador) estás guardando, escaneas el sticker de cada papel
 * y queda registrado (ADR-516); si el papel va en otro lado, suena distinto y
 * lo dice. Al final, «20 de 20 en su sitio».
 *
 * La cámara va DENTRO del panel (no la del celular, que abriría la dirección
 * del QR: los stickers del lote 1 apuntan a producción, que es de julio): se
 * lee el id del QR sea cual sea el servidor. Necesita https (por Tailscale);
 * sin eso, o sin lector de QR, se escribe el número del sticker.
 */

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, QrCode } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import type { Destino } from "@/lib/documentos/archivador-celular";
import { prepararSonido } from "./aviso-lectura";
import ElegirArchivador from "./ElegirArchivador";
import EscanearArchivador from "./EscanearArchivador";
import { useModoArchivador } from "./use-modo-archivador";

const papelesTexto = (n: number) => (n === 1 ? "1 papel" : `${n} papeles`);

export default function ModoArchivador({ onCerrar }: { onCerrar: (cambios: number) => void }) {
  const m = useModoArchivador();
  const [cerrando, setCerrando] = useState(false);
  const registradosEnLaVuelta = m.lecturas.filter((l) => l.envio === "cola" || l.envio === "enviando" || l.envio === "listo").length;

  /** Manda lo que quedó en cola y cierra. Sin conexión, se queda abierto (salvo `forzar`: la X). */
  const terminar = async (forzar: boolean) => {
    /* «Terminar» en curso: la X, Escape o un clic afuera no cierran dos veces. */
    if (cerrando) return;
    setCerrando(true);
    const r = await m.terminar();
    setCerrando(false);
    if (r.pendientes > 0) {
      toast.error(`${papelesTexto(r.pendientes)} sin guardar: revisa la conexión${forzar ? " y vuelve a escanearlos" : " y toca Terminar otra vez"}`);
      if (!forzar) return;
    } else if (registradosEnLaVuelta > 0) {
      toast.success(`Registraste ${papelesTexto(registradosEnLaVuelta)}`);
    }
    onCerrar(r.cambios);
  };

  const elegir = (d: Destino) => {
    prepararSonido();
    m.setDestino(d);
  };

  let cuerpo: React.ReactNode;
  if (m.error) {
    cuerpo = (
      <div className="space-y-3" role="alert">
        <p className="text-sm text-[var(--text-secondary)]">No pude traer los papeles del Archivo.</p>
        <button type="button" onClick={m.cargar} className={button({ variant: "secondary" })}>Reintentar</button>
      </div>
    );
  } else if (!m.papeles) {
    cuerpo = (
      <p role="status" className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Trayendo los papeles…
      </p>
    );
  } else if (!m.destino) {
    cuerpo = <ElegirArchivador grupos={m.archivadores.grupos} sinLugar={m.archivadores.sinLugar} ultimo={m.ultimoDestino} onElegir={elegir} />;
  } else {
    cuerpo = <EscanearArchivador m={m} onCambiar={() => m.setDestino(null)} />;
  }

  const footer = m.destino ? (
    <ModalFooter
      error={m.fallo ? "Sin conexión: se vuelve a intentar solo" : null}
      nota={m.porGuardar > 0 ? `${papelesTexto(m.porGuardar)} por guardar…` : registradosEnLaVuelta > 0 ? `${papelesTexto(registradosEnLaVuelta)} en esta vuelta` : undefined}
    >
      <button type="button" onClick={() => void terminar(false)} disabled={cerrando} className={button({ variant: "primary" })} data-qa="terminar-archivador">
        {cerrando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Terminar
      </button>
    </ModalFooter>
  ) : undefined;

  return (
    <AdminModal open onClose={() => void terminar(true)} title="Guardar en el archivador" icon={QrCode} size="md" ventana={false} footer={footer}>
      <div className={MODAL_BODY}>{cuerpo}</div>
    </AdminModal>
  );
}
