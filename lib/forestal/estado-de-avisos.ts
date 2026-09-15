/**
 * ¿El último aviso del Libro llegó a alguien?
 *
 * El cron de plazos manda por la campana del panel, por WhatsApp y por correo.
 * Los dos últimos pueden volver rechazados —un dominio sin verificar en Resend,
 * un token de WhatsApp vencido— y hasta ahora eso **sólo se veía en el log del
 * servidor**: desde el panel el aviso parecía haber salido.
 *
 * Un aviso que falla en silencio es un aviso que no existe. Peor: hace creer
 * que el sistema está mirando cuando no está avisando a nadie.
 *
 * Medido en el tenant real (2026-09-12): el correo vuelve con «The buleje.pe
 * domain is not verified» y el WhatsApp con 401. Ninguno de los dos llegó, y
 * nadie podía saberlo sin abrir una terminal.
 *
 * PURO y client-safe: la lectura la hace `NotificationLogsDB`.
 */

export interface EnvioDeAviso {
  type: string;
  recipient: string;
  message: string;
  /** `"sent"` o `"failed"`, como lo guarda `NotificationLog`. */
  status: string;
  createdAt: string;
}

export type CanalAviso = "whatsapp" | "email";

export interface EstadoCanal {
  canal: CanalAviso;
  /** Cómo se llama el canal en pantalla. */
  nombre: string;
  llego: boolean;
  /** Sin ningún envío registrado: el cron todavía no corrió con este canal. */
  sinDatos: boolean;
  cuando: string | null;
  destino: string | null;
  /** Por qué no llegó, tal como lo devolvió el proveedor. */
  motivo: string | null;
  /** Qué hacer para arreglarlo, cuando se puede decir. */
  comoArreglar: string | null;
}

const NOMBRE: Record<CanalAviso, string> = { whatsapp: "WhatsApp", email: "Correo" };

/**
 * Traducir el rechazo del proveedor a algo accionable.
 *
 * Los mensajes vienen en inglés y hablan de dominios y tokens: quien los lee es
 * un aserradero, no el que configuró Resend. Cuando el motivo no se reconoce se
 * muestra crudo — inventar un consejo sería peor que no darlo.
 */
export function comoArreglar(canal: CanalAviso, motivo: string | null): string | null {
  const m = (motivo ?? "").toLowerCase();
  if (!m) return null;
  if (m.includes("no tiene correo cargado") || m.includes("no tiene whatsapp cargado")) {
    return "Carga el dato en Ajustes → Datos del negocio.";
  }
  if (m.includes("domain is not verified") || m.includes("not verified")) {
    return "El dominio del remitente no está verificado en Resend: verifícalo en resend.com/domains.";
  }
  if (m.includes("oauth") || m.includes("access token") || m.includes("401")) {
    return "El token de WhatsApp venció o es inválido: renovalo en la configuración de WhatsApp.";
  }
  if (m.includes("429") || m.includes("rate")) {
    return "El proveedor está limitando los envíos: se reintenta en la próxima corrida.";
  }
  return canal === "email"
    ? "Revisa la configuración de correo del sistema."
    : "Revisa la configuración de WhatsApp del sistema.";
}

/** El estado de cada canal a partir de lo que quedó registrado. */
export function estadoDeAvisos(envios: readonly EnvioDeAviso[]): EstadoCanal[] {
  return (["whatsapp", "email"] as CanalAviso[]).map((canal) => {
    const e = envios.find((x) => x.type === `ctp_plazos_${canal}`);
    if (!e) {
      return {
        canal,
        nombre: NOMBRE[canal],
        llego: false,
        sinDatos: true,
        cuando: null,
        destino: null,
        motivo: null,
        comoArreglar: null,
      };
    }
    const llego = e.status === "sent";
    return {
      canal,
      nombre: NOMBRE[canal],
      llego,
      sinDatos: false,
      cuando: e.createdAt,
      /* El destino sólo cuando salió: en un fallo lo que importa es el motivo,
         y un teléfono al lado de «no llegó» se lee como si el problema fuera
         ese número. */
      destino: llego ? e.recipient : e.recipient === "—" ? null : e.recipient,
      motivo: llego ? null : e.message,
      comoArreglar: llego ? null : comoArreglar(canal, e.message),
    };
  });
}

/**
 * ¿Hay algo que decirle a la persona?
 *
 * Si los dos canales salieron bien, no se muestra nada: un cartel verde
 * permanente que dice «todo bien» es ruido que se aprende a ignorar, y el
 * aviso en sí ya se ve en la campana.
 */
export function hayQueMostrarEstado(estados: readonly EstadoCanal[]): boolean {
  return estados.some((e) => !e.sinDatos && !e.llego);
}
