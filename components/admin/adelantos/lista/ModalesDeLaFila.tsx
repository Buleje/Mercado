"use client";

/**
 * Lo que abre el menú ⋯ de una fila (un solo modal a la vez). Antes vivía en
 * la tabla; con el recibo (firmar, mandar, foto, WhatsApp) se mudó acá para
 * que la tabla sólo dibuje filas.
 */

import { useRef, useState } from "react";
import { Camera, Send } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { csrfHeaders } from "@/lib/csrf-client";
import { archivoDeLocal } from "@/lib/adelantos/adjunto-local";
import { leerDireccion } from "@/lib/adelantos/modos-alta";
import { leerJson } from "@/lib/errores/sin-dato";
import { logger } from "@/lib/logger";
import type { DbAdelanto } from "@/lib/db/adelantos.db";
import CapturaFoto from "../CapturaFoto";
import EnviarEnlaceFirma from "../firma/EnviarEnlaceFirma";
import FirmarReciboModal from "../firma/FirmarReciboModal";
import RegistrarHuellaModal from "../firma/RegistrarHuellaModal";
import { fmtMon } from "../shared";
import AnularAdelantoModal from "./AnularAdelantoModal";
import type { TipoRecibo } from "./CeldaRecibo";
import EditarNotasModal from "./EditarNotasModal";
import EnviarReciboWhatsApp from "./EnviarReciboWhatsApp";
import type { AccionFila } from "./FilaAcciones";
import VerRegistrado from "./VerRegistrado";

export interface AccionAbierta {
  /** `ver` = lo ya registrado de la columna «Recibo» (23-10), con su `tipo`. */
  accion: Exclude<AccionFila, "pdf"> | "ver";
  adelanto: DbAdelanto;
  tipo?: TipoRecibo;
}

export default function ModalesDeLaFila({
  abierta,
  onCerrar,
  onCambio,
  onRecibo,
  onCambiarA,
}: {
  abierta: AccionAbierta | null;
  onCerrar: () => void;
  /** Algo de la fila cambió (anulado, notas, firma, foto, celular): la lista se vuelve a leer. */
  onCambio: () => void;
  /** Cambió el estado del recibo (firma o envío): la columna «Recibo» se vuelve a leer. */
  onRecibo: () => void;
  /** Pasar a otra ventana de la misma fila (de «ver la firma» a «firmar de nuevo»). */
  onCambiarA: (siguiente: AccionAbierta) => void;
}) {
  if (!abierta) return null;
  const { accion, adelanto: a } = abierta;
  const persona = a.beneficiario?.nombre ?? "—";
  const listo = () => {
    onCerrar();
    onCambio();
    onRecibo();
  };

  switch (accion) {
    case "anular":
      return (
        <AnularAdelantoModal
          adelantoId={a.id}
          persona={persona}
          monto={a.montoAdelantado}
          moneda={a.moneda}
          recibido={leerDireccion(a).direccion === "RECIBIDO"}
          onClose={onCerrar}
          onAnulado={listo}
        />
      );
    case "notas":
      return <EditarNotasModal adelantoId={a.id} notasActuales={a.notas ?? null} onClose={onCerrar} onGuardado={listo} />;
    case "firmar":
      /* Al cerrar se relee: la firma o la huella pudo quedar aunque no se bajara el PDF. */
      return <FirmarReciboModal adelantoId={a.id} adelanto={a} onClose={listo} />;
    case "mandar":
      return (
        <AdminModal
          open
          onClose={listo}
          title="Mandar para firmar"
          description={`${persona} firma o pone su huella desde su celular. El enlace sirve una vez y vence en 48 horas.`}
          icon={Send}
          aboveModals
          claveVentana="adelanto-mandar-firma"
          footer={
            <ModalFooter>
              <button type="button" onClick={listo} className={button({ variant: "secondary" })}>
                Cerrar
              </button>
            </ModalFooter>
          }
        >
          <div className={MODAL_BODY}>
            <EnviarEnlaceFirma
              adelantoId={a.id}
              persona={persona}
              codigo={a.codigoOperacion ?? null}
              montoTexto={fmtMon(a.montoAdelantado, a.moneda)}
              onFirmado={() => {
                onCambio();
                onRecibo();
              }}
            />
          </div>
        </AdminModal>
      );
    case "huella":
      /* Al cerrar se relee: el enlace pudo usarse en su celular aunque no se guardara nada aquí. */
      return <RegistrarHuellaModal adelanto={a} onCerrar={listo} onGuardada={listo} />;
    case "ver":
      return (
        <VerRegistrado
          adelanto={a}
          tipo={abierta.tipo ?? "firma"}
          onCerrar={onCerrar}
          onRehacer={(tipo) => onCambiarA({ accion: tipo === "firma" ? "firmar" : "huella", adelanto: a })}
        />
      );
    case "foto":
      return <TomarFoto adelanto={a} onCerrar={onCerrar} onGuardada={listo} />;
    case "whatsapp":
      return (
        <EnviarReciboWhatsApp
          adelanto={a}
          onClose={onCerrar}
          onEnviado={() => {
            onCambio();
            onRecibo();
          }}
        />
      );
  }
}

/**
 * La foto del adelanto (ADR-491 V, privada): la cámara y después la subida,
 * con su estado. Una por adelanto: si ya tenía, el servidor contesta 409.
 */
function TomarFoto({ adelanto: a, onCerrar, onGuardada }: { adelanto: DbAdelanto; onCerrar: () => void; onGuardada: () => void }) {
  const [fase, setFase] = useState<"camara" | "subiendo" | "error">("camara");
  const [error, setError] = useState<string | null>(null);
  const tomada = useRef<string | null>(null);

  const subir = async () => {
    const jpeg = tomada.current;
    if (!jpeg) return;
    setFase("subiendo");
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", await archivoDeLocal(jpeg, "voucher"));
      const res = await fetch(`/api/adelantos/${encodeURIComponent(a.id)}/voucher`, { method: "POST", headers: csrfHeaders(), credentials: "include", body: fd });
      if (res.ok) return onGuardada();
      const j = await leerJson<{ error?: string }>(res);
      setError(res.status === 409 ? "Este adelanto ya tenía foto: no se cambia." : (j?.error ?? "La foto no se guardó. Vuelve a intentarlo."));
    } catch (e) {
      logger.error("[adelantos] no se pudo guardar la foto desde la tabla", { error: String(e) });
      setError("La foto no se guardó. Revisa la conexión y vuelve a intentarlo.");
    }
    setFase("error");
  };

  if (fase === "camara") {
    return (
      <CapturaFoto
        /* CapturaFoto llama a onFoto y enseguida a onCerrar: el ref dice si hubo foto. */
        onFoto={(jpeg) => {
          tomada.current = jpeg;
        }}
        onCerrar={() => (tomada.current ? void subir() : onCerrar())}
      />
    );
  }
  return (
    <AdminModal
      open
      onClose={fase === "subiendo" ? () => undefined : onCerrar}
      title="Foto del adelanto"
      icon={Camera}
      aboveModals
      claveVentana="adelanto-foto-tabla"
      footer={
        <ModalFooter error={error}>
          <button type="button" onClick={onCerrar} disabled={fase === "subiendo"} className={button({ variant: "secondary" })}>
            Cerrar
          </button>
          {fase === "error" && (
            <button type="button" onClick={() => void subir()} className={button({ variant: "primary" })}>
              Reintentar
            </button>
          )}
        </ModalFooter>
      }
    >
      <div className={MODAL_BODY}>
        <p className="text-sm text-[var(--text-secondary)]">{fase === "subiendo" ? "Guardando la foto…" : "La foto no se guardó."}</p>
      </div>
    </AdminModal>
  );
}
