"use client";

/**
 * use-dar-adelanto — el estado y el guardado de «Dar adelanto» (RRHH, 24-10 →
 * 25-10 con todos los campos: motivo, cómo se le dio, caja, recibo de papel,
 * foto y firma).
 *
 *  - Una clave por ventana abierta (`idempotencyKey`): doble clic o reintento
 *    tras un corte no dan dos adelantos.
 *  - El sábado del descuento lo pone el servidor (`fechaVencimiento`); acá sólo
 *    se previsualiza con la MISMA función pura y los números del pago del
 *    sábado (`vistaPreviaDelPago`) — sólo para el dueño, que es quien los ve.
 *  - La foto queda en el navegador hasta que el adelanto existe; después va
 *    PRIVADA por la misma ruta que Mi Plata (`guardarVoucher`). Si no se guarda,
 *    el adelanto sí: se avisa aparte.
 *  - «Firmar el recibo al guardar» se recuerda, como en Mi Plata.
 */

import { useState } from "react";
import { toast } from "sonner";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { csrfHeaders } from "@/lib/csrf-client";
import { limaDateKey } from "@/lib/utils";
import { semanaDe } from "@/lib/rrhh/fechas";
import { hrefDeDestino } from "@/lib/admin/enlaces-panel";
import { destinoDelAdelanto } from "@/lib/adelantos/enlace-adelanto";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { guardarVoucher } from "@/components/admin/adelantos/hooks/use-guardar-alta";
import {
  descuentoDelAdelanto,
  primerSabadoDesde,
  vistaPreviaDelPago,
  type DescuentoDelAdelanto,
  type MetodoAdelanto,
  type MotivoAdelanto,
  type VistaPreviaDelPago,
} from "@/lib/rrhh/adelanto-rrhh";
import type { PagoSemanaDTO } from "@/lib/rrhh/pago-semana";
import { formatearPEN } from "../rrhh-ui";

export interface PersonaParaAdelanto {
  id: string;
  nombre: string;
  /** Lo que ya se le dio esta semana (sólo se muestra). */
  yaDado?: number;
}

export interface FormDarAdelanto {
  quien: string;
  monto: string;
  fecha: string;
  motivo: MotivoAdelanto | "";
  detalle: string;
  metodo: MetodoAdelanto;
  saleDeCaja: boolean;
  recibo: string;
  /** La foto o el PDF todavía en el navegador (data URL). */
  foto: string | null;
}

interface Respuesta {
  adelanto?: { id: string; codigoOperacion?: string | null; repetido?: boolean };
  cuenta?: { origen?: string };
  descuento?: { texto?: string } | null;
  message?: string;
}

const CLAVE_FIRMAR = "buleje:rrhh-adelanto-firmar";

function claveNueva(): string {
  return `rrhh-adl-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

/** Mi Plata › Adelantos › Lista (abiertos), con el adelanto resaltado si se sabe cuál. */
export function hrefEnMiPlata(codigo: string | null | undefined): string {
  const destino = destinoDelAdelanto(codigo);
  if (!destino) return "/admin?tab=plata&vista=adelantos&sub=lista&estado=abierto";
  return hrefDeDestino({ ...destino, params: { ...destino.params, estado: "abierto" } });
}

export function useDarAdelanto({
  personas,
  colaboradorId,
  pago,
  onDado,
}: {
  personas: readonly PersonaParaAdelanto[];
  colaboradorId?: string;
  pago?: PagoSemanaDTO | null;
  onDado: () => void;
}) {
  const hoy = limaDateKey();
  const [form, setForm] = useState<FormDarAdelanto>(() => ({
    quien: colaboradorId ?? (personas.length === 1 ? personas[0].id : ""),
    monto: "",
    fecha: hoy,
    motivo: "",
    detalle: "",
    metodo: "efectivo",
    saleDeCaja: false,
    recibo: "",
    foto: null,
  }));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [firmar, setFirmar] = useLocalStorage<boolean>(CLAVE_FIRMAR, false);
  /** El adelanto recién dado, para firmarle el recibo. */
  const [aFirmar, setAFirmar] = useState<string | null>(null);
  const [clave] = useState(claveNueva);

  const cambiar = <K extends keyof FormDarAdelanto>(k: K, v: FormDarAdelanto[K]) => setForm((f) => ({ ...f, [k]: v }));
  const persona = personas.find((p) => p.id === form.quien);
  const esHoy = form.fecha === hoy;
  const n = Number(form.monto.replace(",", "."));
  const montoValido = Number.isFinite(n) && n > 0 ? n : 0;

  // La vista previa sólo con los números de ESTA semana (los que trae el pago del sábado).
  const fila = pago && pago.desde === semanaDe(hoy).desde ? (pago.filas.find((f) => f.colaboradorId === form.quien) ?? null) : null;
  // «Ya se le pagó» sólo cuenta si el sábado del descuento es de ESTA semana (el domingo ya es de la otra).
  const sabado = primerSabadoDesde(hoy);
  const sabadoEnEstePago = Boolean(pago && sabado >= pago.desde && sabado <= pago.hasta);
  const descuento: DescuentoDelAdelanto | null = fila
    ? descuentoDelAdelanto({ hoy, tipo: fila.tipo, semanaPagada: sabadoEnEstePago && Boolean(fila.pagado) })
    : null;
  const caeEstaSemana = Boolean(descuento && pago && descuento.fecha >= pago.desde && descuento.fecha <= pago.hasta);
  const vista: VistaPreviaDelPago | null = fila && caeEstaSemana ? vistaPreviaDelPago(fila, montoValido, `${form.fecha}T17:00:00.000Z`) : null;

  const enviar = async () => {
    if (!form.quien) return setError("Elige a quién le das el adelanto.");
    if (montoValido <= 0) return setError("Escribe cuánto le das.");
    if (form.fecha > hoy) return setError("Un adelanto se anota el día que se dio, no antes.");
    if (form.motivo === "otro" && !form.detalle.trim()) return setError("Con «Otro», escribe para qué fue.");
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/rrhh/colaboradores/${encodeURIComponent(form.quien)}/adelanto`, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({
          monto: montoValido,
          fecha: esHoy ? undefined : form.fecha,
          motivo: form.motivo || undefined,
          detalle: form.detalle.trim() || undefined,
          metodo: form.metodo,
          saleDeCaja: esHoy && form.saleDeCaja,
          reciboManual: form.recibo.trim() || undefined,
          idempotencyKey: clave,
        }),
      });
      const r = (await res.json().catch(() => ({}))) as Respuesta;
      if (!res.ok || !r.adelanto) {
        setError(r.message ?? (res.status === 403 ? "Tu usuario no puede dar adelantos." : "No se pudo anotar. Intenta de nuevo."));
        return;
      }
      const { id, codigoOperacion, repetido } = r.adelanto;
      // La foto, con el adelanto ya creado (privada, como en Mi Plata). Un alta repetida no la pisa.
      const avisoFoto = form.foto && !repetido ? await guardarVoucher(id, form.foto) : null;
      const cuentaNueva =
        r.cuenta?.origen === "creada" ? " Se le abrió su cuenta en Mi Plata." : r.cuenta?.origen === "vinculada" ? " Quedó unida a su cuenta de Mi Plata (mismo documento)." : "";
      const cuando = r.descuento?.texto ? `${r.descuento.texto}.` : "Se descuenta en su pago del sábado.";
      const quien = persona?.nombre ?? "la persona";
      toast.success(
        `${repetido ? "Ya estaba anotado: " : ""}${codigoOperacion ?? "Adelanto"} · ${formatearPEN(montoValido)} a ${quien}. ${cuando}${cuentaNueva}`,
        { duration: 10_000, action: { label: "Ver en Mi Plata", onClick: () => void irAEnlace(hrefEnMiPlata(codigoOperacion)) } },
      );
      if (avisoFoto) toast.warning(avisoFoto);
      if (firmar && !repetido) setAFirmar(id);
      else onDado();
    } catch {
      setError("Sin conexión: revisa tu internet e intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  };

  return { form, cambiar, persona, esHoy, hoy, montoValido, descuento, vista, guardando, error, enviar, firmar, setFirmar, aFirmar };
}
