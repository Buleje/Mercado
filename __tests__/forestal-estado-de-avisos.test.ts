/**
 * Si el aviso no llegó, la pantalla tiene que decirlo — y decir qué hacer.
 *
 * El caso real: el cron corre todos los días, la campana del panel muestra el
 * aviso, y el correo vuelve rechazado por dominio sin verificar mientras el
 * WhatsApp da 401. Los dos fallan y nadie se entera sin abrir el log.
 */

import { describe, expect, it } from "vitest";
import {
  comoArreglar,
  estadoDeAvisos,
  hayQueMostrarEstado,
  type EnvioDeAviso,
} from "@/lib/forestal/estado-de-avisos";

const envio = (canal: string, status: string, message: string, recipient = "51999888777"): EnvioDeAviso => ({
  type: `ctp_plazos_${canal}`,
  recipient,
  message,
  status,
  createdAt: "2026-09-12T22:24:49.854Z",
});

describe("estadoDeAvisos", () => {
  it("un canal sin registros es «sin datos», no «falló»", () => {
    /* El cron todavía no corrió con ese canal: decir que falló sería acusar a
       algo que no pasó. */
    const [wa, mail] = estadoDeAvisos([]);
    expect(wa!.sinDatos).toBe(true);
    expect(wa!.llego).toBe(false);
    expect(mail!.sinDatos).toBe(true);
    /* Y sin datos no hay nada que mostrar: la pantalla no grita sin motivo. */
    expect(hayQueMostrarEstado([wa!, mail!])).toBe(false);
  });

  it("cuando los dos salieron, no hay nada que mostrar", () => {
    /* Un cartel verde permanente que dice «todo bien» es ruido que se aprende
       a ignorar; el aviso en sí ya se ve en la campana. */
    const estados = estadoDeAvisos([
      envio("whatsapp", "sent", "1 guía pasada de plazo"),
      envio("email", "sent", "1 guía pasada de plazo", "dueño@maderera.pe"),
    ]);
    expect(estados.every((e) => e.llego)).toBe(true);
    expect(hayQueMostrarEstado(estados)).toBe(false);
  });

  it("traduce el rechazo del proveedor a algo que se pueda hacer", () => {
    const estados = estadoDeAvisos([
      envio("email", "failed", "The buleje.pe domain is not verified. Please, add and verify your domain", "d@m.pe"),
      envio("whatsapp", "failed", 'WhatsApp API error: 401 {"error":{"message":"Invalid OAuth access token"}}'),
    ]);
    expect(hayQueMostrarEstado(estados)).toBe(true);

    const mail = estados.find((e) => e.canal === "email")!;
    expect(mail.llego).toBe(false);
    expect(mail.motivo).toContain("not verified");
    expect(mail.comoArreglar).toContain("resend.com/domains");

    const wa = estados.find((e) => e.canal === "whatsapp")!;
    expect(wa.comoArreglar).toContain("token de WhatsApp");
  });

  it("cuando falta el dato del negocio, no se muestra un destino inventado", () => {
    /* El cron registra «—» como destino cuando no hay teléfono ni correo: eso
       no es un destinatario y no se pinta como tal. */
    const [wa] = estadoDeAvisos([
      envio("whatsapp", "failed", "El negocio no tiene WhatsApp cargado (Ajustes → Datos del negocio).", "—"),
    ]);
    expect(wa!.destino).toBeNull();
    expect(wa!.comoArreglar).toContain("Ajustes");
  });

  it("un motivo que no se reconoce se muestra crudo, sin inventar un consejo", () => {
    const [, mail] = estadoDeAvisos([envio("email", "failed", "algo raro del proveedor", "d@m.pe")]);
    expect(mail!.motivo).toBe("algo raro del proveedor");
    expect(mail!.comoArreglar).toBe("Revisa la configuración de correo del sistema.");
  });

  it("sin motivo no hay consejo", () => {
    expect(comoArreglar("email", null)).toBeNull();
    expect(comoArreglar("email", "")).toBeNull();
  });
});
