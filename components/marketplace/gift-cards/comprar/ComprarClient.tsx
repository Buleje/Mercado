"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { ArrowLeft } from "@buleje/design-system/icons";
import type { GiftCardDesign } from "@/lib/mocks/gift-cards.mock";
import { GIFT_CARD_DESIGNS } from "@/lib/mocks/gift-cards.mock";
import WizardStepper from "./WizardStepper";
import StepMontoDiseno from "./StepMontoDiseno";
import StepDestinatario from "./StepDestinatario";
import StepDedicatoria from "./StepDedicatoria";
import StepPreviewPago from "./StepPreviewPago";

type Step = 1 | 2 | 3 | 4;

function isGiftCardDesign(value: string): value is GiftCardDesign {
  return GIFT_CARD_DESIGNS.some((d) => d.id === value);
}

export default function ComprarClient() {
  const search = useSearchParams();
  const router = useRouter();

  const queryAmount = Number(search.get("amount") ?? "");
  const rawDesign = search.get("design") ?? "general";

  const [step, setStep] = useState<Step>(1);
  const [amount, setAmount] = useState<number>(
    Number.isFinite(queryAmount) && queryAmount > 0 ? queryAmount : 50,
  );
  const [design, setDesign] = useState<GiftCardDesign>(
    isGiftCardDesign(rawDesign) ? rawDesign : "general",
  );
  const [recipientName, setRecipientName] = useState("");
  const [recipientContact, setRecipientContact] = useState("");
  const [contactMethod, setContactMethod] = useState<"whatsapp" | "email">("whatsapp");
  const [message, setMessage] = useState("");
  const [senderName, setSenderName] = useState("");

  function goNext() {
    setStep((s) => (s < 4 ? ((s + 1) as Step) : s));
  }

  function goBack() {
    setStep((s) => (s > 1 ? ((s - 1) as Step) : s));
  }

  async function handleSubmit() {
    const res = await fetch("/api/gift-cards/purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount,
        design,
        message,
        recipientName,
        recipientContact,
        contactMethod,
        senderName,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "Error al procesar" }));
      throw new Error(data.error ?? "Error al procesar la compra");
    }

    // ADR-077: el plainCode solo viene UNA vez en este response. Lo pasamos
    // por query string a la confirmacion para que el sender pueda copiarlo /
    // compartirlo. La confirmacion debe mostrarlo una sola vez y limpiarlo
    // del history despues.
    const data = await res.json().catch(() => ({}) as { plainCode?: string });
    const plainCode = typeof data.plainCode === "string" ? data.plainCode : "";

    const params = new URLSearchParams({
      amount: String(amount),
      recipient: recipientName,
    });
    if (plainCode) params.set("code", plainCode);

    router.push(`/marketplace/gift-cards/confirmacion?${params.toString()}`);
  }

  return (
    <main className="min-h-screen bg-gray-50/60 py-8 dark:bg-gray-950 sm:py-12">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <header className="mb-6">
          <Link
            href="/marketplace/gift-cards"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Volver a tarjetas de regalo
          </Link>
        </header>

        <div className="mb-8">
          <WizardStepper currentStep={step} />
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 sm:p-10 dark:border-gray-800 dark:bg-gray-900">
          {step === 1 && (
            <StepMontoDiseno
              amount={amount}
              design={design}
              onChange={(next) => {
                setAmount(next.amount);
                setDesign(next.design);
              }}
              onNext={goNext}
            />
          )}
          {step === 2 && (
            <StepDestinatario
              recipientName={recipientName}
              recipientContact={recipientContact}
              contactMethod={contactMethod}
              onChange={(next) => {
                setRecipientName(next.recipientName);
                setRecipientContact(next.recipientContact);
                setContactMethod(next.contactMethod);
              }}
              onNext={goNext}
              onBack={goBack}
            />
          )}
          {step === 3 && (
            <StepDedicatoria
              message={message}
              senderName={senderName}
              onChange={(next) => {
                setMessage(next.message);
                setSenderName(next.senderName);
              }}
              onNext={goNext}
              onBack={goBack}
            />
          )}
          {step === 4 && (
            <StepPreviewPago
              amount={amount}
              design={design}
              message={message}
              recipientName={recipientName}
              recipientContact={recipientContact}
              contactMethod={contactMethod}
              senderName={senderName}
              onBack={goBack}
              onSubmit={handleSubmit}
            />
          )}
        </div>
      </div>
    </main>
  );
}
