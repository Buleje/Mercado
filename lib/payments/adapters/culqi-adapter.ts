/**
 * lib/payments/adapters/culqi-adapter.ts
 *
 * Adapter para Culqi — pasarela de pagos peruana.
 * Ref: https://docs.culqi.com/
 *
 * Firma de webhook: header "x-culqi-signature" contiene un HMAC-SHA256
 * del body raw firmado con el Culqi-secret-key del negocio.
 * Ref: https://docs.culqi.com/es/documentacion/pagos/notificaciones/
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

export class CulqiProvider implements PaymentProvider {
  readonly id = "culqi" as const;
  readonly displayName = "Culqi";
  readonly supportsCurrencies = ["PEN", "USD"] as const;
  readonly supportsMethods = ["card"] as const;

  /** API key privada (sk_live_* o sk_test_*) */
  private readonly secretKey: string;
  /** Secret para verificar webhooks */
  private readonly webhookSecret: string;

  constructor() {
    // Leer desde env — nunca hardcodear. Fallar late (cuando se invoca) en dev.
    this.secretKey = process.env.CULQI_SECRET_KEY ?? "";
    this.webhookSecret = process.env.CULQI_WEBHOOK_SECRET ?? "";
  }

  async charge(input: ChargeInput): Promise<ChargeResult> {
    // Validación básica: monto 0 → fallo inmediato
    if (input.amountCents === 0) {
      return {
        status: "failed",
        reason: "El monto no puede ser cero",
        providerCode: "ZERO_AMOUNT",
      };
    }

    if (!this.secretKey) {
      return {
        status: "failed",
        reason: "CULQI_SECRET_KEY no configurada",
        providerCode: "CONFIG_ERROR",
      };
    }

    // TODO: real HTTP call a https://api.culqi.com/v2/charges
    // const response = await fetch("https://api.culqi.com/v2/charges", {
    //   method: "POST",
    //   headers: {
    //     "Authorization": `Bearer ${this.secretKey}`,
    //     "Content-Type": "application/json",
    //   },
    //   body: JSON.stringify({
    //     amount: input.amountCents,
    //     currency_code: input.currency,
    //     email: input.customer.email,
    //     source_id: input.sourceToken,
    //     metadata: { order_id: input.orderId, store_slug: input.storeSlug },
    //   }),
    // });

    // Brandon 2026-05-28 P0 (auditoría seguridad/code-quality):
    // CulqiProvider era un STUB registrado en lib/payments/registry.ts como
    // proveedor real. Si un tenant seleccionaba Culqi, el stub retornaba
    // `status: "succeeded"` sin hacer HTTP — pagos "confirmados" al cliente
    // sin cobro real. Ahora falla explícito hasta implementar el HTTP real.
    throw new Error(
      "CulqiProvider no implementado todavía. Use Yape, MercadoPago o Stripe. " +
        "Para activar: ver TODO en lib/payments/adapters/culqi-adapter.ts (charge/refund).",
    );
  }

  async refund(_input: RefundInput): Promise<RefundResult> {
    if (!this.secretKey) {
      return {
        refundId: "",
        status: "failed",
        amountCents: 0,
        providerResponse: { error: "CULQI_SECRET_KEY no configurada" },
      };
    }

    // TODO: real HTTP call a https://api.culqi.com/v2/refunds
    // const response = await fetch("https://api.culqi.com/v2/refunds", { ... });

    // Brandon 2026-05-28 P0: idem charge — el stub retornaba "succeeded" sin
    // hacer HTTP a Culqi. Falla explícito hasta implementar la integración.
    throw new Error(
      "CulqiProvider.refund no implementado todavía. Para activar: implementar HTTP " +
        "real contra https://api.culqi.com/v2/refunds.",
    );
  }

  async verifyWebhook(req: WebhookRequest): Promise<WebhookVerification> {
    const signature = req.headers["x-culqi-signature"] ?? "";

    // TODO: verify signature
    // Culqi envía x-culqi-signature = HMAC-SHA256(rawBody, webhookSecret) en hex
    if (this.webhookSecret && signature) {
      const expected = crypto
        .createHmac("sha256", this.webhookSecret)
        .update(req.rawBody)
        .digest("hex");

      let valid = false;
      try {
        valid = crypto.timingSafeEqual(
          Buffer.from(expected, "hex"),
          Buffer.from(signature, "hex"),
        );
      } catch {
        valid = false;
      }

      if (!valid) {
        return {
          valid: false,
          eventType: "unknown",
          payload: null,
          externalId: "",
        };
      }
    } else {
      // Sin secret configurado: aceptar en dev, rechazar en prod
      if (process.env.NODE_ENV === "production") {
        return {
          valid: false,
          eventType: "unknown",
          payload: null,
          externalId: "",
        };
      }
      // TODO: verify signature — en dev retornamos valid: true como stub
    }

    const body = req.body as Record<string, unknown>;
    const dataObj = body?.data as Record<string, unknown> | undefined;
    const externalId = String(body?.id ?? dataObj?.id ?? "");
    const eventType = String(body?.type ?? body?.object ?? "charge");

    return {
      valid: true,
      eventType,
      payload: body,
      externalId,
    };
  }

  async getPaymentStatus(externalId: string): Promise<PaymentStatus> {
    if (!this.secretKey) {
      return {
        externalId,
        status: "failed",
        amountCents: 0,
        currency: "PEN",
        providerResponse: { error: "CULQI_SECRET_KEY no configurada" },
      };
    }

    // TODO: real HTTP call a https://api.culqi.com/v2/charges/{id}
    // const response = await fetch(`https://api.culqi.com/v2/charges/${externalId}`, {
    //   headers: { "Authorization": `Bearer ${this.secretKey}` },
    // });

    console.log("[CulqiProvider.getPaymentStatus] stub — no HTTP real", { externalId });

    return {
      externalId,
      status: "succeeded",
      amountCents: 0,
      currency: "PEN",
      providerResponse: { stub: true },
    };
  }
}
