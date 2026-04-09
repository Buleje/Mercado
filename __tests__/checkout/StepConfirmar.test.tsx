import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  StepConfirmar,
  StepConfirmarFooter,
} from "@/components/checkout/steps/StepConfirmar";
import { INITIAL_CHECKOUT_STATE } from "@/components/checkout/hooks/useCheckoutState";
import type { CheckoutState } from "@/components/checkout/types";
import type { CartItem } from "@/contexts/cart-context";
import type { Customer } from "@/contexts/customer-context";
import { LazyMotion, domAnimation } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Tests unitarios del paso Confirmar del CheckoutModal.
 *
 * Cubre:
 *  - Render de las 5 cards de resumen (datos, dirección, pago, items, totales)
 *  - Pantalla con dirección vacía (card de dirección no aparece)
 *  - Botón "Editar" en card dirección — callback se dispara
 *  - Footer CTA con total formateado
 *  - Footer con submitting=true → botón deshabilitado + "Procesando"
 *  - Footer con submitError → error visible
 */

// framer-motion necesita LazyMotion + domAnimation para hidratar `m.div`
function Wrap({ children }: { children: ReactNode }) {
  return <LazyMotion features={domAnimation}>{children}</LazyMotion>;
}

// ── Factories de estado del checkout ──────────────────────────────────
function buildState(overrides: Partial<CheckoutState> = {}): CheckoutState {
  return {
    ...INITIAL_CHECKOUT_STATE,
    step: "confirmar",
    customer: {
      ...INITIAL_CHECKOUT_STATE.customer,
      name: "María Pérez",
      phone: "999888777",
      dni: "12345678",
    },
    address: {
      ...INITIAL_CHECKOUT_STATE.address,
      location: "Jr. Progreso 123, Pucallpa",
      reference: "Frente al parque",
    },
    payment: {
      ...INITIAL_CHECKOUT_STATE.payment,
      method: "yape",
      yapeOpNumber: "123456",
      tip: 0,
    },
    ...overrides,
  };
}

function buildItems(): CartItem[] {
  return [
    {
      id: 1,
      name: "Arroz Costeño 5kg",
      category: "abarrotes",
      price: 22.5,
      image: "/arroz.jpg",
      unit: "bolsa",
      quantity: 2,
    },
    {
      id: 2,
      name: "Aceite Primor 1L",
      category: "abarrotes",
      price: 12.9,
      image: "/aceite.jpg",
      unit: "botella",
      quantity: 1,
    },
  ];
}

const DUMMY_CUSTOMER: Customer | null = null;

// ── Tests del contenido scrolleable ────────────────────────────────────
describe("StepConfirmar (content cards)", () => {
  it("renderiza el encabezado + las 5 cards de resumen", () => {
    render(
      <Wrap>
        <StepConfirmar
          state={buildState()}
          items={buildItems()}
          finalTotal={57.9}
          cartTotal={57.9}
          discount={0}
          effectiveCustomer={DUMMY_CUSTOMER}
        />
      </Wrap>
    );

    // Encabezado
    expect(
      screen.getByRole("heading", { name: /revisa tu pedido/i })
    ).toBeInTheDocument();

    // Card 1 — datos cliente
    expect(screen.getByText(/tus datos/i)).toBeInTheDocument();
    expect(screen.getByText("María Pérez")).toBeInTheDocument();
    expect(screen.getByText("999888777")).toBeInTheDocument();
    expect(screen.getByText(/dni: 12345678/i)).toBeInTheDocument();

    // Card 2 — dirección
    expect(screen.getByText(/entregaremos en/i)).toBeInTheDocument();
    expect(
      screen.getByText("Jr. Progreso 123, Pucallpa")
    ).toBeInTheDocument();
    expect(screen.getByText(/ref: frente al parque/i)).toBeInTheDocument();

    // Card 3 — método de pago
    expect(screen.getByText(/método de pago/i)).toBeInTheDocument();
    expect(screen.getByText("Yape")).toBeInTheDocument();
    expect(screen.getByText(/op: 123456/i)).toBeInTheDocument();

    // Card 4 — items (2 productos)
    expect(screen.getByText(/2 productos/i)).toBeInTheDocument();
    expect(screen.getByText(/arroz costeño 5kg/i)).toBeInTheDocument();
    expect(screen.getByText(/aceite primor 1l/i)).toBeInTheDocument();

    // Card 5 — totales (label + total)
    expect(screen.getByText(/total a pagar/i)).toBeInTheDocument();
  });

  it("omite la card de dirección cuando no hay location", () => {
    render(
      <Wrap>
        <StepConfirmar
          state={buildState({
            address: {
              ...INITIAL_CHECKOUT_STATE.address,
              location: "",
              reference: "",
            },
          })}
          items={buildItems()}
          finalTotal={10}
          cartTotal={10}
          discount={0}
          effectiveCustomer={DUMMY_CUSTOMER}
        />
      </Wrap>
    );

    expect(screen.queryByText(/entregaremos en/i)).not.toBeInTheDocument();
  });

  it("llama onEditAddress al apretar el botón Editar de la card dirección", async () => {
    const onEditAddress = vi.fn();
    const user = userEvent.setup();

    render(
      <Wrap>
        <StepConfirmar
          state={buildState()}
          items={buildItems()}
          finalTotal={57.9}
          cartTotal={57.9}
          discount={0}
          effectiveCustomer={DUMMY_CUSTOMER}
          onEditAddress={onEditAddress}
        />
      </Wrap>
    );

    const editBtn = screen.getByTestId("confirmar-editar-direccion");
    await user.click(editBtn);

    expect(onEditAddress).toHaveBeenCalledTimes(1);
  });

  it("no renderiza el botón Editar si no se pasa onEditAddress", () => {
    render(
      <Wrap>
        <StepConfirmar
          state={buildState()}
          items={buildItems()}
          finalTotal={57.9}
          cartTotal={57.9}
          discount={0}
          effectiveCustomer={DUMMY_CUSTOMER}
        />
      </Wrap>
    );

    expect(
      screen.queryByTestId("confirmar-editar-direccion")
    ).not.toBeInTheDocument();
  });

  it("muestra descuento + cupón + propina cuando aplican", () => {
    render(
      <Wrap>
        <StepConfirmar
          state={buildState({
            coupon: {
              ...INITIAL_CHECKOUT_STATE.coupon,
              code: "BIENVENIDA10",
              discount: 5.5,
              applied: true,
              msg: "ok",
            },
            payment: {
              ...INITIAL_CHECKOUT_STATE.payment,
              method: "efectivo",
              tip: 3,
            },
          })}
          items={buildItems()}
          finalTotal={55.4}
          cartTotal={57.9}
          discount={0}
          effectiveCustomer={DUMMY_CUSTOMER}
        />
      </Wrap>
    );

    expect(screen.getByText(/subtotal/i)).toBeInTheDocument();
    expect(screen.getByText(/cupón/i)).toBeInTheDocument();
    expect(screen.getByText(/propina/i)).toBeInTheDocument();
    expect(screen.getByText("Efectivo")).toBeInTheDocument();
  });
});

// ── Tests del footer CTA ───────────────────────────────────────────────
describe("StepConfirmarFooter (CTA sticky)", () => {
  it("muestra 'Confirmar pedido' + total formateado cuando no está enviando", () => {
    render(
      <StepConfirmarFooter
        submitting={false}
        submitError=""
        finalTotal={57.9}
        onBack={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    const cta = screen.getByRole("button", {
      name: /confirmar pedido.*s\/\s*57\.90/i,
    });
    expect(cta).toBeInTheDocument();
    expect(cta).toBeEnabled();
  });

  it("muestra 'Procesando' y deshabilita botones si submitting=true", () => {
    render(
      <StepConfirmarFooter
        submitting={true}
        submitError=""
        finalTotal={57.9}
        onBack={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    expect(screen.getByText(/procesando/i)).toBeInTheDocument();

    const allButtons = screen.getAllByRole("button");
    allButtons.forEach((btn) => {
      expect(btn).toBeDisabled();
    });
  });

  it("muestra el submitError en rojo cuando lo hay", () => {
    render(
      <StepConfirmarFooter
        submitting={false}
        submitError="Falta seleccionar método de pago"
        finalTotal={10}
        onBack={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    expect(
      screen.getByText(/falta seleccionar método de pago/i)
    ).toBeInTheDocument();
  });

  it("llama onBack al apretar el botón atrás", async () => {
    const onBack = vi.fn();
    const user = userEvent.setup();

    render(
      <StepConfirmarFooter
        submitting={false}
        submitError=""
        finalTotal={10}
        onBack={onBack}
        onConfirm={vi.fn()}
      />
    );

    await user.click(screen.getByLabelText(/volver al paso de pago/i));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("llama onConfirm al apretar el CTA principal", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();

    render(
      <StepConfirmarFooter
        submitting={false}
        submitError=""
        finalTotal={100}
        onBack={vi.fn()}
        onConfirm={onConfirm}
      />
    );

    await user.click(
      screen.getByRole("button", { name: /confirmar pedido/i })
    );
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("renderiza los trust badges", () => {
    render(
      <StepConfirmarFooter
        submitting={false}
        submitError=""
        finalTotal={10}
        onBack={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    expect(screen.getByText(/compra segura/i)).toBeInTheDocument();
    expect(screen.getByText(/delivery rápido/i)).toBeInTheDocument();
    expect(screen.getByText(/compra con confianza/i)).toBeInTheDocument();
  });
});
