/**
 * lib/fiados/ultimo-contacto.ts — el último contacto con quien te debe, leído
 * de las gestiones del fiado (noche 17-10, «Reclasificados: NO piden base»).
 *
 * «Último contacto: martes 14/10 por WhatsApp · prometió pagar el viernes 17/10».
 * Sale en la lista de Me deben y en la vista previa del recordatorio, y la
 * plantilla del mensaje lo ofrece como `{ultimo_contacto}` y `{promesa}`.
 * Sin gestiones del cliente no hay nada que decir: devuelve `null` y las
 * variables quedan vacías (el mensaje no dice «el  quedamos»).
 *
 * La promesa es la MÁS RECIENTE (misma regla que `promesasVigentes`) y se
 * calla si después se anotó un pago: ya no es lo que importa. PURO y client-safe.
 */
import { limaDateKey } from "@/lib/utils";
import { diaConNombre } from "@/lib/gastos/lista-gastos";
import { formatCurrency } from "@/lib/format";
import { diaDe, diasEntre, type Gestion } from "@/lib/fiados/gestion-cobranza";

export interface UltimoContacto {
  /** La línea para la pantalla, con la promesa. */
  linea: string;
  /** Sólo el contacto («Último contacto: martes 14/10 por WhatsApp»), para donde la promesa ya tiene su chip. */
  contacto: string;
  /** Frase para el mensaje al cliente: «Te escribí el martes 14/10.» */
  frase: string;
  /** Frase de la promesa para el mensaje: «Quedamos en que pagabas el viernes 17/10.» ('' si no hay). */
  promesa: string;
  /** La promesa sigue en pie, vence hoy o ya pasó. */
  estadoPromesa: "prometio" | "vence-hoy" | "incumplio" | null;
}

const HORA = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hour12: false });

/** Cómo fue el contacto, en lo que dice quien cobra («por WhatsApp», «no contestó»). */
function comoFue(g: Gestion): string {
  const nota = g.nota ?? "";
  switch (g.tipo) {
    case "RECORDATORIO":
      return /whatsapp/i.test(nota) ? "por WhatsApp" : /llam/i.test(nota) ? "por llamada" : "le escribiste";
    case "NO_CONTESTA":
      return "no contestó";
    case "REFINANCIAR":
      return "pidió más plazo";
    case "VISITA":
      return "en persona";
    case "PAGO":
      return "pagó";
    case "PROMESA":
      return "";
    default:
      return nota.trim() ? `«${nota.trim().slice(0, 40)}${nota.trim().length > 40 ? "…" : ""}»` : "anotaste algo";
  }
}

/** Lo que se le recuerda al cliente, según cómo fue el último contacto. */
function fraseParaCliente(g: Gestion, cuando: string): string {
  switch (g.tipo) {
    case "RECORDATORIO":
      return `Te escribí ${cuando}.`;
    case "VISITA":
      return `Pasé a verte ${cuando}.`;
    case "NO_CONTESTA":
      return `Te busqué ${cuando} y no pude ubicarte.`;
    default:
      return `Hablamos ${cuando}.`;
  }
}

/** Índice de clientes: su último contacto (cualquier tipo) y su última promesa con fecha. */
export function ultimosContactos(gestiones: readonly Gestion[], ahora: Date | number = Date.now()): Map<string, UltimoContacto> {
  const ultima = new Map<string, Gestion>();
  const promesa = new Map<string, Gestion>();
  const pago = new Map<string, Gestion>();
  for (const g of gestiones) {
    const previa = ultima.get(g.customerId);
    if (!previa || g.fecha > previa.fecha) ultima.set(g.customerId, g);
    if (g.tipo === "PROMESA" && diaDe(g.fechaPrometida)) {
      const p = promesa.get(g.customerId);
      if (!p || g.fecha > p.fecha) promesa.set(g.customerId, g);
    }
    if (g.tipo === "PAGO") {
      const p = pago.get(g.customerId);
      if (!p || g.fecha > p.fecha) pago.set(g.customerId, g);
    }
  }

  const hoy = limaDateKey(ahora);
  const out = new Map<string, UltimoContacto>();
  for (const [id, g] of ultima) {
    const dia = limaDateKey(g.fecha);
    const dias = diasEntre(dia, hoy);
    const cuandoLinea = dias <= 0 ? `hoy ${HORA.format(new Date(g.fecha))}` : dias === 1 ? `ayer (${diaConNombre(dia)})` : diaConNombre(dia);
    const cuandoFrase = dias <= 0 ? "hoy" : dias === 1 ? "ayer" : `el ${diaConNombre(dia)}`;

    let textoPromesa = "";
    let frasePromesa = "";
    let estadoPromesa: UltimoContacto["estadoPromesa"] = null;
    const p = promesa.get(id);
    const ultimoPago = pago.get(id);
    if (p && !(ultimoPago && ultimoPago.fecha >= p.fecha)) {
      const diaP = diaDe(p.fechaPrometida);
      const faltan = diasEntre(hoy, diaP);
      const monto = p.montoPrometido && p.montoPrometido > 0 ? ` ${formatCurrency(p.montoPrometido)}` : "";
      estadoPromesa = faltan > 0 ? "prometio" : faltan === 0 ? "vence-hoy" : "incumplio";
      const elDia = faltan === 0 ? "hoy" : `el ${diaConNombre(diaP)}`;
      textoPromesa = `prometió pagar${monto} ${elDia}${faltan < 0 ? " y no cumplió" : ""}`;
      frasePromesa = `Quedamos en que pagabas${monto} ${elDia}.`;
    }

    const como = comoFue(g);
    const partes = [`Último contacto: ${cuandoLinea}${como ? ` ${como}` : ""}`];
    if (textoPromesa) partes.push(textoPromesa);
    out.set(id, {
      linea: partes.join(" · "),
      contacto: partes[0],
      frase: fraseParaCliente(g, cuandoFrase),
      promesa: frasePromesa,
      estadoPromesa,
    });
  }
  return out;
}

/** El último contacto de UN cliente, o `null` si nunca se anotó nada. */
export function ultimoContactoDe(gestiones: readonly Gestion[], customerId: string, ahora: Date | number = Date.now()): UltimoContacto | null {
  const suyas = gestiones.filter((g) => g.customerId === customerId);
  return suyas.length ? (ultimosContactos(suyas, ahora).get(customerId) ?? null) : null;
}
