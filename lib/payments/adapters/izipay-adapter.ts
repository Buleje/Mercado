/**
 * lib/payments/adapters/izipay-adapter.ts
 *
 * Adapter para Izipay (ex-Lyra) — pasarela BCP / Visa acquirer para Perú.
 * Ref: https://secure.micuentaweb.pe/doc/
 *
 * Firma de webhook: header "kr-hash" = HMAC-SHA256 de kr-answer firmado
 * con la "Password" (HMAC key) del shop. Izipay también puede usar
 * "kr-hash-algorithm" para indicar el algoritmo.
 * Ref: https://secure.micuentaweb.pe/doc/es-PE/rest/V4.0/api/get_started/payment_IPN.html
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

export class IzipayProvider implements PaymentProvider {
  readonly id = "izipay" as const;
  readonly displayName = "Izipay";
  readonly supportsCurrencies = ["PEN", "USD"] as const;
  readonly supportsMethods = ["card", "transfer"] as const;

  private readonly username: string;   // Shop ID (número)
  private readonly password: string;   // HMAC password (32 chars hex)
  private readonly publicKey: string;  // Para el SDK JS del frontend

  constructor() {
    this.username = process.env.IZIPAY_USERNAME ?? "";
    this.password = process.env.IZIPAY_PASSWORD ?? "";
    this.publicKey = process.env.IZIPAY_PUBLIC_KEY ?? "";
  }

  async charge(input: ChargeInput): Promise<ChargeResult> {
    if (input.amountCents === 0) {
      return {
        status: "failed",
        reason: "El monto no puede ser cero",
        providerCode: "ZERO_AMOUNT",
      };
    }

    if (!this.username || !this.password) {
      return {
        status: "failed",
        reason: "IZIPAY_USERNAME o IZIPAY_PASSWORD no configurados",
        providerCode: "CONFIG_ERROR",
      };
    }

    // TODO: real HTTP call a la API REST de Izipay (Lyra)
    // const credentials = Buffer.from(`${this.username}:${this.password}`).toString("base64");
    // const response = await fetch("https://api.micuentaweb.pe/api-payment/V4/Charge/CreatePayment", {
    //   method: "POST",
    //   headers: {
    //     "Authorization": `Basic ${credentials}`,
    //     "Content-Type": "application/json",
    //   },
    //   body: JSON.stringify({
    //     amount: input.amountCents,
    //     currency: "604", // ISO 4217 numeric: 604 = PEN, 840 = USD
    //     orderId: input.orderId,
    //     customer: { email: input.customer.email },
    //     formAction: "PAYMENT",
    //   }),
    // });

    console.log("[IzipayProvider.charge] stub — no HTTP real", {
      orderId: input.orderId,
      amountCents: input.amountCents,
    });

    return {
      status: "pending",
      externalId: `izipay_stub_${input.orderId}`,
      nextAction: {
        type: "redirect",
        redirectUrl: input.returnUrl ?? "https://secure.micuentaweb.pe/checkout",
        expiresAt: Date.now() + 30 * 60 * 1000,
      },
      providerResponse: { stub: true },
    };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    if (!this.username || !this.password) {
      return {
        refundId: "",
        status: "failed",
        amountCents: 0,
        providerResponse: { error: "IZIPAY_USERNAME o IZIPAY_PASSWORD no configurados" },
      };
    }

    // TODO: real HTTP call a /V4/Transaction/CancelOrRefund
    console.log("[IzipayProvider.refund] stub — no HTTP real", {
      externalId: input.externalId,
    });

    return {
      refundId: `izipay_refund_stub_${input.externalId}`,
      status: "succeeded",
      amountCents: input.amountCents ?? 0,
      providerResponse: { stub: true },
    };
  }

  async verifyWebhook(req: WebhookRequest): Promise<WebhookVerification> {
    // Izipay envía kr-hash = HMAC-SHA256(krAnswer, password)
    // donde krAnswer = req.body["kr-answer"] (string JSON)
    const krHash = req.headers["kr-hash"] ?? "";
    const krAnswer = (req.body as Record<string, unknown>)?.["kr-answer"] as string | undefined;

    if (this.password && krHash && krAnswer) {
      const expected = crypto
        .createHmac("sha256", this.password)
        .update(krAnswer)
        .digest("hex");

      let valid = false;
      try {
        valid = crypto.timingSafeEqual(
          Buffer.from(expected, "hex"),
          Buffer.from(krHash, "hex"),
        );
      } catch {
        valid = false;
      }

      if (!valid) {
        return { valid: false, eventType: "unknown", payload: null, externalId: "" };
      }
    } else {
      // TODO: verify signature — stub en dev
      if (process.env.NODE_ENV === "production") {
        return { valid: false, eventType: "unknown", payload: null, externalId: "" };
      }
    }

    let parsedAnswer: Record<string, unknown> = {};
    try {
      parsedAnswer = JSON.parse(krAnswer ?? "{}") as Record<string, unknown>;
    } catch {
      parsedAnswer = req.body as Record<string, unknown>;
    }

    const transactions = (parsedAnswer?.transactions as Array<Record<string, unknown>>) ?? [];
    const firstTx = transactions[0] ?? {};
    const externalId = String(firstTx?.uuid ?? firstTx?.transactionId ?? "");
    const eventType = String(firstTx?.status ?? "UNKNOWN");

    return {
      valid: true,
      eventType,
      payload: parsedAnswer,
      externalId,
    };
  }

  async getPaymentStatus(externalId: string): Promise<PaymentStatus> {
    if (!this.username || !this.password) {
      return {
        externalId,
        status: "failed",
        amountCents: 0,
        currency: "PEN",
        providerResponse: { error: "Credenciales Izipay no configuradas" },
      };
    }

    // TODO: real HTTP call a /V4/Transaction/Get
    console.log("[IzipayProvider.getPaymentStatus] stub — no HTTP real", { externalId });

    return {
      externalId,
      status: "succeeded",
      amountCents: 0,
      currency: "PEN",
      providerResponse: { stub: true },
    };
  }
}
