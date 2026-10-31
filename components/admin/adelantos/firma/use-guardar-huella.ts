"use client";

/**
 * Guardar SÓLO la huella escaneada (23-10) en el registro de firmas del
 * adelanto: `POST /api/adelantos/<id>/firmas` con `datos` + `huella`, sin
 * firma. Quién la puso (nombre y DNI, de la ficha y editables) y el «acepto»
 * de la persona (Ley 29733: la huella es un dato sensible) son obligatorios.
 *
 * Una clave por intento, como en «Firmar recibo»: ante un corte se reintenta
 * con la misma y el servidor devuelve la que ya guardó; cambia tras guardar o
 * cuando el servidor dijo que NO guardó.
 */

import { useRef, useState } from "react";
import { FirmarDatosSchema } from "@/lib/adelantos/entregar-schema";
import { VERSION_CONSENTIMIENTO_HUELLA } from "@/lib/adelantos/entregar-tipos";
import { limpiarDocumento, validarFirmante } from "@/lib/adelantos/recibo-firmado";
import { csrfHeaders } from "@/lib/csrf-client";
import type { DbAdelanto } from "@/lib/db/adelantos.db";
import { leerJson } from "@/lib/errores/sin-dato";
import { idAleatorio } from "@/lib/id-aleatorio";
import { logger } from "@/lib/logger";

type Respuesta = { huella?: { guardada: boolean } | null; error?: string; message?: string; code?: string };

export function useGuardarHuella(a: DbAdelanto, onGuardada: () => void) {
  const [nombre, setNombre] = useState(a.beneficiario?.nombre ?? "");
  const [documento, setDocumento] = useState(limpiarDocumento(a.beneficiario?.documento));
  const [huella, setHuella] = useState<Blob | null>(null);
  const [consentido, setConsentido] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clave = useRef("");
  if (!clave.current) clave.current = idAleatorio();

  const falta =
    (huella ? null : "Falta la huella: escanéala o elige una foto.") ??
    validarFirmante({ nombre, documento })?.replace("firma", "pone la huella") ??
    (consentido ? null : "Marca que la persona acepta que se guarde su huella.");

  const guardar = async () => {
    if (falta || !huella) return setError(falta);
    const v = FirmarDatosSchema.safeParse({
      firmante: { nombre: nombre.trim(), documento: limpiarDocumento(documento) },
      consentimientoHuella: VERSION_CONSENTIMIENTO_HUELLA,
      idempotencyKey: clave.current,
    });
    if (!v.success) return setError(v.error.issues[0]?.message ?? "Revisa el nombre y el DNI.");
    setGuardando(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("datos", JSON.stringify(v.data));
      fd.append("huella", new File([huella], "huella.jpg", { type: huella.type || "image/jpeg" }));
      const res = await fetch(`/api/adelantos/${encodeURIComponent(a.id)}/firmas`, { method: "POST", headers: csrfHeaders(), credentials: "include", body: fd });
      const j = await leerJson<Respuesta>(res);
      if (res.ok && j?.huella?.guardada) {
        clave.current = idAleatorio();
        return onGuardada();
      }
      if (res.status >= 400 && res.status < 500) clave.current = idAleatorio();
      /* El cajero sólo guarda la huella junto con la firma de SU entrega (el servidor lo frena con 400). */
      if (j?.code === "firma_obligatoria") return setError("Tu rol guarda la huella junto con la firma: usa «Firmar» y ahí pon la huella.");
      const frase = [j?.message, j?.error].find((t) => !!t && /\s/.test(t));
      setError(frase ?? (res.status === 403 ? "Tu rol no puede registrar huellas: pídeselo al dueño o a un administrador." : "La huella no se guardó. Vuelve a intentarlo."));
    } catch (e) {
      logger.error("[adelantos] no se pudo guardar la huella", { error: String(e) });
      setError("La huella no se guardó. Revisa la conexión y vuelve a intentarlo.");
    } finally {
      setGuardando(false);
    }
  };

  return { nombre, setNombre, documento, setDocumento, huella, setHuella, consentido, setConsentido, guardando, error, falta, guardar };
}
