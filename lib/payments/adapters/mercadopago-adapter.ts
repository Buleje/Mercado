/**
 * lib/payments/adapters/mercadopago-adapter.ts
 *
 * Adapter para Mercado Pago — reutiliza la lógica ya existente en
 * lib/mercadopago.ts (verifyMPWebhookSignature, getMercadoPagoPayment).
 *
 * Firma de webhook:
 *   x-signature: ts=<timestamp>,v1=<hmac-sha256>
 *   x-request-id: <uuid>
 *   Manifest: "id:<dataId>;request-id:<requestId>;ts:<ts>;"
 * Ref: https://www.mercadopago.com.pe/developers/es/docs/your-integrations/notifications/webhooks
 */

import { verifyMPWebhookSignature } from "@/lib/mercadopago";
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

export class MercadopagoProvider implements PaymentProvider {
  readonly id = "mercadopago" as const;
  readonly displayName = "Mercado Pago";
  readonly supportsCurrencies = ["PEN"] as const;
  readonly supportsMethods = ["card", "wallet", "cash", "transfer"] as const;

  private readonly accessToken: string;
  private readonly webhookSecret: string;
  private readonly baseUrl: string;

  constructor() {
    this.accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN ?? "";
    this.webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET ?? "";
    this.baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://buleje.pe";
  }

  async charge(input: ChargeInput): Promise<ChargeResult> {
    if (input.amountCents === 0) {
      return {
        status: "failed",
        reason: "El monto no puede ser cero",
        providerCode: "ZERO_AMOUNT",
      };
    }

    if (!this.accessToken) {
      return {
        status: "failed",
        reason: "MERCADOPAGO_ACCESS_TOKEN no configurado",
        providerCode: "CONFIG_ERROR",
      };
    }

    // TODO: real HTTP call — crear una Preference en Mercado Pago.
    // En la implementación real usar el route existente:
    //   POST /api/marketplace/payment/mercadopago/create-preference
    // o llamar directamente a la API de MP con el SDK.
    //
    // const { Preference } = await import("mercadopago");
    // const { mpClient } = await import("@/lib/mercadopago");
    // const preference = new Preference(mpClient);
    // const result = await preference.create({ body: { ... } });

    console.log("[MercadopagoProvider.charge] stub — no HTTP real", {
      orderId: input.orderId,
      amountCents: input.amountCents,
      storeSlug: input.storeSlug,
    });

    const stubExternalId = `mp_stub_${input.orderId}`;
    const checkoutUrl = `https://www.mercadopago.com.pe/checkout/v1/redirect?pref_id=${stubExternalId}`;

    return {
      status: "pending",
      externalId: stubExternalId,
      nextAction: {
        type: "redirect",
        redirectUrl: checkoutUrl,
        expiresAt: Date.now() + 30 * 60 * 1000, // 30 minutos
      },
      providerResponse: { stub: true },
    };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    if (!this.accessToken) {
      return {
        refundId: "",
        status: "failed",
        amountCents: 0,
        providerResponse: { error: "MERCADOPAGO_ACCESS_TOKEN no configurado" },
      };
    }

    // TODO: real HTTP call a https://api.mercadopago.com/v1/payments/{id}/refunds
    // const url = `https://api.mercadopago.com/v1/payments/${input.externalId}/refunds`;
    // const body = input.amountCents ? { amount: input.amountCents / 100 } : undefined;
    // const res = await fetch(url, {
    //   method: "POST",
    //   headers: { Authorization: `Bearer ${this.accessToken}`, "Content-Type": "application/json" },
    //   body: body ? JSON.stringify(body) : undefined,
    // });

    console.log("[MercadopagoProvider.refund] stub — no HTTP real", {
      externalId: input.externalId,
    });

    return {
      refundId: `mp_refund_stub_${input.externalId}`,
      status: "succeeded",
      amountCents: input.amountCents ?? 0,
      providerResponse: { stub: true },
    };
  }

  async verifyWebhook(req: WebhookRequest): Promise<WebhookVerification> {
    const body = req.body as Record<string, unknown>;
    const dataObj = body?.data as Record<string, unknown> | undefined;
    const dataId = String(dataObj?.id ?? body?.id ?? "");

    // Reutilizamos la función ya implementada y auditada en lib/mercadopago.ts
    if (this.webhookSecret && dataId) {
      const xSignature = req.headers["x-signature"] ?? "";
      const xRequestId = req.headers["x-request-id"] ?? "";

      const isValid = verifyMPWebhookSignature({
        xSignature,
        xRequestId: xRequestId ?? "",
        dataId,
        secret: this.webhookSecret,
      });

      if (!isValid) {
        return { valid: false, eventType: "unknown", payload: null, externalId: "" };
      }
    } else {
      // TODO: verify signature — stub en dev
      if (process.env.NODE_ENV === "production") {
        return { valid: false, eventType: "unknown", payload: null, externalId: "" };
      }
    }

    const eventType = body?.type === "payment"
      ? (body?.action as string ?? "payment.update")
      : String(body?.type ?? "unknown");

    return {
      valid: true,
      eventType,
      payload: body,
      externalId: dataId,
    };
  }

  async getPaymentStatus(externalId: string): Promise<PaymentStatus> {
    if (!this.accessToken) {
      return {
        externalId,
        status: "failed",
        amountCents: 0,
        currency: "PEN",
        providerResponse: { error: "MERCADOPAGO_ACCESS_TOKEN no configurado" },
      };
    }

    // TODO: real HTTP call — reutilizar getMercadoPagoPayment de lib/mercadopago.ts
    // const { getMercadoPagoPayment } = await import("@/lib/mercadopago");
    // const payment = await getMercadoPagoPayment(externalId);
    // Mapear payment.status → PaymentStatus.status

    console.log("[MercadopagoProvider.getPaymentStatus] stub — no HTTP real", { externalId });

    return {
      externalId,
      status: "succeeded",
      amountCents: 0,
      currency: "PEN",
      providerResponse: { stub: true },
    };
  }
}
