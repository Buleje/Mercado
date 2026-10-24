"use client";

/**
 * DarAdelantoModal — «a veces piden plata» (Brandon 24-10). Anota el adelanto
 * en SU cuenta de Mi Plata como descuento por planilla: el pago del sábado lo
 * resta solo. Si todavía no tiene cuenta, el servidor le vincula la persona
 * con su mismo documento o le abre una.
 *
 * La clave del intento nace al abrir: doble clic o reintento no dan dos
 * adelantos. La caja sólo se mueve con la fecha de hoy.
 */

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { HandCoins, Loader2 } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { Field } from "@/components/admin/shared/Field";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { csrfHeaders } from "@/lib/csrf-client";
import { limaDateKey } from "@/lib/utils";
import { BOTON, CLASE_CAMPO } from "../rrhh-form";
import { formatearPEN } from "../rrhh-ui";

const FORM_ID = "rrhh-form-dar-adelanto";

export interface PersonaParaAdelanto {
  id: string;
  nombre: string;
  /** Lo que ya se le dio esta semana (sólo se muestra). */
  yaDado?: number;
}

interface Props {
  personas: readonly PersonaParaAdelanto[];
  /** La persona ya elegida (desde su ficha o su fila). */
  colaboradorId?: string;
  onClose: () => void;
  onDado: () => void;
  aboveModals?: boolean;
}

type Caja = "" | "efectivo" | "yape" | "plin" | "transferencia";

function claveNueva(): string {
  return `rrhh-adl-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

export default function DarAdelantoModal({ personas, colaboradorId, onClose, onDado, aboveModals }: Props) {
  const hoy = limaDateKey();
  const [quien, setQuien] = useState(colaboradorId ?? (personas.length === 1 ? personas[0].id : ""));
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(hoy);
  const [nota, setNota] = useState("");
  const [caja, setCaja] = useState<Caja>("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Una clave por ventana abierta: el reintento tras un corte no da dos adelantos, y
  // si el primero sí llegó y cambiaste el monto, el servidor lo dice (422) en vez de anotar otro.
  const [clave] = useState(claveNueva);

  const persona = personas.find((p) => p.id === quien);
  const esHoy = fecha === hoy;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    const n = Number(monto.replace(",", "."));
    if (!quien) return setError("Elige a quién le das el adelanto.");
    if (!Number.isFinite(n) || n <= 0) return setError("Escribe cuánto le das.");
    if (fecha > hoy) return setError("Un adelanto se anota el día que se dio, no antes.");
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/rrhh/colaboradores/${quien}/adelanto`, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({
          monto: n,
          fecha: esHoy ? undefined : fecha,
          nota: nota.trim() || undefined,
          metodoCaja: esHoy && caja ? caja : null,
          idempotencyKey: clave,
        }),
      });
      if (!res.ok) {
        const cuerpo = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
        setError(cuerpo.message ?? (res.status === 403 ? "Tu usuario no puede dar adelantos." : "No se pudo anotar. Intenta de nuevo."));
        return;
      }
      const r = (await res.json()) as { cuenta?: { origen?: string } };
      const cuentaNueva =
        r.cuenta?.origen === "creada" ? " Se le abrió su cuenta en Mi Plata." : r.cuenta?.origen === "vinculada" ? " Quedó unida a su cuenta de Mi Plata (mismo documento)." : "";
      toast.success(`Adelanto de ${formatearPEN(n)} a ${persona?.nombre ?? "la persona"}: se descuenta el sábado.${cuentaNueva}`);
      onDado();
    } catch {
      setError("Sin conexión: revisa tu internet e intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <AdminModal
      open
      onClose={onClose}
      title="Dar adelanto"
      description={persona?.nombre}
      icon={HandCoins}
      size="sm"
      aboveModals={aboveModals}
      footer={
        <ModalFooter error={error}>
          <button type="button" onClick={onClose} className={BOTON.fantasma}>
            Cancelar
          </button>
          <button type="submit" form={FORM_ID} disabled={guardando} className={BOTON.primario}>
            {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
            Dar adelanto
          </button>
        </ModalFooter>
      }
    >
      <form id={FORM_ID} onSubmit={(e) => void enviar(e)} noValidate className={`${MODAL_BODY} space-y-4`}>
        {!colaboradorId && (
          <Field label="A quién">
            {(id) => (
              <select id={id} value={quien} onChange={(e) => setQuien(e.target.value)} className={CLASE_CAMPO}>
                <option value="">Elige a la persona</option>
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        <Field
          label="Cuánto (S/)"
          hint={persona?.yaDado ? `Esta semana ya le diste ${formatearPEN(persona.yaDado)}.` : "Se le descuenta de su pago del sábado."}
        >
          {(id) => (
            <input
              id={id}
              inputMode="decimal"
              autoFocus
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="0.00"
              className={`${CLASE_CAMPO} tabular-nums`}
            />
          )}
        </Field>
        <Field label="Fecha">
          {(id) => <input id={id} type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} className={CLASE_CAMPO} />}
        </Field>
        <Field label="Sale de la caja" hint={esHoy ? "Si salió del cajón, queda anotado en la caja abierta." : "Sólo lo que se da hoy sale de la caja abierta."}>
          {(id) => (
            <select id={id} value={esHoy ? caja : ""} disabled={!esHoy} onChange={(e) => setCaja(e.target.value as Caja)} className={CLASE_CAMPO}>
              <option value="">No mover la caja</option>
              <option value="efectivo">Efectivo</option>
              <option value="yape">Yape</option>
              <option value="plin">Plin</option>
              <option value="transferencia">Transferencia</option>
            </select>
          )}
        </Field>
        <Field label="Nota (opcional)">
          {(id) => <input id={id} value={nota} maxLength={500} onChange={(e) => setNota(e.target.value)} placeholder="Para el pasaje, medicinas…" className={CLASE_CAMPO} />}
        </Field>
      </form>
    </AdminModal>
  );
}
