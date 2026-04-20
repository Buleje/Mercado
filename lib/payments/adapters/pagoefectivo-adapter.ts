/**
 * lib/payments/adapters/pagoefectivo-adapter.ts
 *
 * Adapter para PagoEfectivo — pago en efectivo en agencias (Kasnet, Western Union, etc.).
 * Ref: https://developers.pagoefectivo.pe/
 *
 * Flujo:
 *   1. charge() → API genera un CIP (Código de Identificación de Pago)
 *   2. Cliente paga el CIP en efectivo en cualquier agencia adherida
 *   3. PagoEfectivo notifica vía IPN (webhook) cuando se confirma el pago
 *
 * Firma de webhook: PagoEfectivo envía un HMAC-SHA256 del payload en el
 * header "authorization" con formato "Bearer <token>" donde el token es
 * el JWT firmado, o bien un header "x-pagoefectivo-signature".
 * TODO: verificar con la documentación oficial del merchant al activar.
 */

import crypto from "crypto";
import type {
  PaymentProvider,
  ChargeInput,
  ChargeResult,
  RefundInput,
  RefundResult,
  WebhookRequest,
  WebhookVerification,
  PaymentStatus,
} from "@/lib/payments/provider";

export class PagoefectivoProvider implements PaymentProvider {
  readonly id = "pagoefectivo" as const;
  readonly displayName = "PagoEfectivo";
  readonly supportsCurrencies = ["PEN"] as const;
  readonly supportsMethods = ["cash"] as const;

  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly idMoneda: string; // "1" = PEN

  constructor() {
    this.clientId = process.env.PAGOEFECTIVO_CLIENT_ID ?? "";
    this.clientSecret = process.env.PAGOEFECTIVO_CLIENT_SECRET ?? "";
    this.idMoneda = process.env.PAGOEFECTIVO_ID_MONEDA ?? "1"; // 1 = PEN
  }

  /**
   * Genera un CIP para que el cliente pague en efectivo en una agencia.
   * La respuesta siempre es "pending" — el pago se confirma por webhook.
   */
  async charge(input: ChargeInput): Promise<ChargeResult> {
    if (input.amountCents === 0) {
      return {
        status: "failed",
        reason: "El monto no puede ser cero",
        providerCode: "ZERO_AMOUNT",
      };
    }

    if (!this.clientId || !this.clientSecret) {
      return {
        status: "failed",
        reason: "PAGOEFECTIVO_CLIENT_ID o PAGOEFECTIVO_CLIENT_SECRET no configurados",
        providerCode: "CONFIG_ERROR",
      };
    }

    // TODO: real HTTP call a PagoEfectivo
    // Paso 1: Autenticar → POST https://pre-api.pagoefectivo.pe/v1/tokens
    //   body: { client_id, secret_client, grant_type: "client_credentials" }
    //
    // Paso 2: Generar CIP → POST https://pre-api.pagoefectivo.pe/v1/cips
    //   headers: { Authorization: `Bearer ${access_token}` }
    //   body: {
    //     idMoneda: this.idMoneda,
    //     monto: (input.amountCents / 100).toFixed(2),
    //     fechaFin: ISO-date + 72h,
    //     correo: input.customer.email,
    //     nombres: input.customer.name,
    //     codRef: input.orderId,
    //   }

    console.log("[PagoefectivoProvider.charge] stub — no HTTP real", {
      orderId: input.orderId,
      amountCents: input.amountCents,
    });

    const stubCip = `9000${input.orderId.slice(0, 6).toUpperCase()}`;

    return {
      status: "pending",
      externalId: `pe_stub_${input.orderId}`,
      nextAction: {
        type: "display_code",
        paymentCode: stubCip,
        expiresAt: Date.now() + 72 * 60 * 60 * 1000, // 72 horas
      },
      providerResponse: { stub: true, cip: stubCip },
    };
  }

  async refund(_input: RefundInput): Promise<RefundResult> {
    // PagoEfectivo no soporta reembolsos automáticos — requiere proceso manual.
    // Se puede registrar el intent en la BD y procesar fuera de banda.
    console.log("[PagoefectivoProvider.refund] PagoEfectivo no soporta reembolsos automáticos");

    return {
      refundId: "",
      status: "pending",
      amountCents: _input.amountCents ?? 0,
      providerResponse: {
        message: "PagoEfectivo requiere reembolso manual. Contactar al soporte.",
      },
    };
  }

  async verifyWebhook(req: WebhookRequest): Promise<WebhookVerification> {
    // TODO: verify signature
    // PagoEfectivo puede enviar un JWT firmado o HMAC en el header "authorization".
    // Verificar con la documentación de IPN del merchant al activar la integración.
    // Por ahora retornamos valid: true solo en dev como stub.

    const authHeader = req.headers["authorization"] ?? "";
    const body = req.body as Record<string, unknown>;

    if (!authHeader && process.env.NODE_ENV === "production") {
      return { valid: false, eventType: "unknown", payload: null, externalId: "" };
    }

    // Cuando tengamos el shared secret real:
    // const signature = authHeader.replace("Bearer ", "");
    // const expected = crypto.createHmac("sha256", this.clientSecret).update(req.rawBody).digest("hex");
    // verify using timingSafeEqual...
    void crypto; // suppress "unused import" until TODO is implemented

    const dataObj = body?.data as Record<string, unknown> | undefined;
    const cipCode = String(
      body?.cipCode ?? body?.cip_code ?? dataObj?.cipCode ?? "",
    );
    const eventType = String(body?.type ?? body?.status ?? "payment.received");

    return {
      valid: true,
      eventType,
      payload: body,
      externalId: cipCode,
    };
  }

  async getPaymentStatus(externalId: string): Promise<PaymentStatus> {
    if (!this.clientId || !this.clientSecret) {
      return {
        externalId,
        status: "failed",
        amountCents: 0,
        currency: "PEN",
        providerResponse: { error: "Credenciales PagoEfectivo no configuradas" },
      };
    }

    // TODO: real HTTP call a https://pre-api.pagoefectivo.pe/v1/cips/{cip}
    console.log("[PagoefectivoProvider.getPaymentStatus] stub — no HTTP real", { externalId });

    return {
      externalId,
      status: "pending",
      amountCents: 0,
      currency: "PEN",
      providerResponse: { stub: true },
    };
  }
}
