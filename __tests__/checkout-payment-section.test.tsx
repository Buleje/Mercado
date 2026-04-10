import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domAnimation } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Unit tests for components/checkout/CheckoutPaymentSection.tsx.
 *
 * Scope: black-box test of a purely presentational component. CheckoutPaymentSection
 * owns no internal state — every interaction flows through callback props and the
 * parent is the source of truth. These tests verify:
 *   - Payment method tabs render based on enabled flags (yape + efectivo only;
 *     Plin is NOT a payment method in this component).
 *   - Clicking tabs fires onPaymentMethodChange with the right value.
 *   - The Yape panel and CashChangeCalculator render only for the active method.
 *   - Validation hint text (showPaymentHint) reflects the correct state.
 *   - Tip buttons + coupon flow (apply, enter key, validating spinner, applied state, remove).
 *   - Totals row rendering with promo / coupon / tier discount / tip.
 *   - Submit button state machine (submitting toggles label + disabled).
 *   - Parent form onSubmit fires when clicking the type=submit CTA.
 *   - submitError is displayed without crashing.
 *   - Back button fires onBack.
 *   - Loyalty points preview visibility.
 *
 * Child components YapePaymentPanel and CashChangeCalculator are mocked so we
 * isolate the unit under test and avoid their intervals / focus side effects.
 */

// ── Mocks ───────────────────────────────────────────────────────────────
// Mock the child panels so we can assert "rendered" without dragging in their
// internal state (YapePaymentPanel has a setInterval + setTimeout focus hook).
vi.mock("@/components/checkout/YapePaymentPanel", () => ({
  YapePaymentPanel: ({
    finalTotal,
    yapeOpNumber,
    onOpNumberChange,
  }: {
    finalTotal: number;
    yapeOpNumber: string;
    onOpNumberChange: (v: string) => void;
  }) => (
    <div data-testid="yape-panel-mock">
      <span data-testid="yape-panel-total">{finalTotal.toFixed(2)}</span>
      <input
        data-testid="yape-panel-input"
        value={yapeOpNumber}
        onChange={(e) => onOpNumberChange(e.target.value)}
      />
    </div>
  ),
}));

vi.mock("@/components/checkout/CashChangeCalculator", () => ({
  CashChangeCalculator: ({ finalTotal }: { finalTotal: number }) => (
    <div data-testid="cash-calc-mock">
      <span data-testid="cash-calc-total">{finalTotal.toFixed(2)}</span>
    </div>
  ),
}));

import {
  CheckoutPaymentSection,
  type CheckoutPaymentSectionProps,
} from "@/components/checkout/CheckoutPaymentSection";

// ── Helpers ─────────────────────────────────────────────────────────────
function Wrap({ children }: { children: ReactNode }) {
  return <LazyMotion features={domAnimation}>{children}</LazyMotion>;
}

function buildProps(
  overrides: Partial<CheckoutPaymentSectionProps> = {}
): CheckoutPaymentSectionProps {
  return {
    tip: 0,
    onTipChange: vi.fn(),
    couponCode: "",
    onCouponCodeChange: vi.fn(),
    couponApplied: false,
    couponDiscount: 0,
    couponMsg: "",
    validatingCoupon: false,
    onValidateCoupon: vi.fn(),
    onRemoveCoupon: vi.fn(),
    total: 50,
    finalTotal: 50,
    discount: 0,
    promo: null,
    tierDiscount: 0,
    tierDiscountPct: 0,
    loyaltyTier: null,
    paymentMethod: null,
    onPaymentMethodChange: vi.fn(),
    yapeEnabled: true,
    cashEnabled: true,
    yape: { enabled: true, name: "Bodega SM", phone: "999000111" },
    yapeOpNumber: "",
    onYapeOpNumberChange: vi.fn(),
    showPaymentHint: false,
    submitting: false,
    submitError: "",
    onBack: vi.fn(),
    ...overrides,
  };
}

function renderSection(overrides: Partial<CheckoutPaymentSectionProps> = {}) {
  const props = buildProps(overrides);
  const utils = render(
    <Wrap>
      <CheckoutPaymentSection {...props} />
    </Wrap>
  );
  return { props, ...utils };
}

function renderInForm(
  overrides: Partial<CheckoutPaymentSectionProps> = {},
  onFormSubmit: (e: React.FormEvent) => void = () => {}
) {
  const props = buildProps(overrides);
  const utils = render(
    <Wrap>
      <form
        data-testid="checkout-form"
        onSubmit={(e) => {
          e.preventDefault();
          onFormSubmit(e);
        }}
      >
        <CheckoutPaymentSection {...props} />
      </form>
    </Wrap>
  );
  return { props, ...utils };
}

// ── Payment method selection ────────────────────────────────────────────
describe("CheckoutPaymentSection — payment method selection", () => {
  it("renders both Yape and Efectivo tabs when both are enabled", () => {
    renderSection({ yapeEnabled: true, cashEnabled: true });
    expect(screen.getByTestId("payment-yape")).toBeInTheDocument();
    expect(screen.getByTestId("payment-efectivo")).toBeInTheDocument();
  });

  it("hides Yape tab when yapeEnabled=false", () => {
    renderSection({ yapeEnabled: false, cashEnabled: true });
    expect(screen.queryByTestId("payment-yape")).not.toBeInTheDocument();
    expect(screen.getByTestId("payment-efectivo")).toBeInTheDocument();
  });

  it("hides Efectivo tab when cashEnabled=false", () => {
    renderSection({ yapeEnabled: true, cashEnabled: false });
    expect(screen.getByTestId("payment-yape")).toBeInTheDocument();
    expect(screen.queryByTestId("payment-efectivo")).not.toBeInTheDocument();
  });

  it("calls onPaymentMethodChange('yape') when clicking the Yape tab", async () => {
    const user = userEvent.setup();
    const { props } = renderSection();
    await user.click(screen.getByTestId("payment-yape"));
    expect(props.onPaymentMethodChange).toHaveBeenCalledTimes(1);
    expect(props.onPaymentMethodChange).toHaveBeenCalledWith("yape");
  });

  it("calls onPaymentMethodChange('efectivo') when clicking the Efectivo tab", async () => {
    const user = userEvent.setup();
    const { props } = renderSection();
    await user.click(screen.getByTestId("payment-efectivo"));
    expect(props.onPaymentMethodChange).toHaveBeenCalledTimes(1);
    expect(props.onPaymentMethodChange).toHaveBeenCalledWith("efectivo");
  });

  it("reflects aria-checked on the selected tab", () => {
    renderSection({ paymentMethod: "yape" });
    expect(screen.getByTestId("payment-yape")).toHaveAttribute(
      "aria-checked",
      "true"
    );
    expect(screen.getByTestId("payment-efectivo")).toHaveAttribute(
      "aria-checked",
      "false"
    );
  });

  it("renders the Yape panel when paymentMethod='yape'", () => {
    renderSection({ paymentMethod: "yape", finalTotal: 42.5 });
    expect(screen.getByTestId("yape-panel-mock")).toBeInTheDocument();
    expect(screen.getByTestId("yape-panel-total")).toHaveTextContent("42.50");
    expect(screen.queryByTestId("cash-calc-mock")).not.toBeInTheDocument();
  });

  it("renders the cash change calculator when paymentMethod='efectivo'", () => {
    renderSection({ paymentMethod: "efectivo", finalTotal: 87.9 });
    expect(screen.getByTestId("cash-calc-mock")).toBeInTheDocument();
    expect(screen.getByTestId("cash-calc-total")).toHaveTextContent("87.90");
    expect(screen.queryByTestId("yape-panel-mock")).not.toBeInTheDocument();
  });

  it("renders no panel when paymentMethod is null", () => {
    renderSection({ paymentMethod: null });
    expect(screen.queryByTestId("yape-panel-mock")).not.toBeInTheDocument();
    expect(screen.queryByTestId("cash-calc-mock")).not.toBeInTheDocument();
  });

  it("does not render the Yape panel if yapeEnabled=false (guards against stale state)", () => {
    renderSection({ paymentMethod: "yape", yapeEnabled: false });
    expect(screen.queryByTestId("yape-panel-mock")).not.toBeInTheDocument();
  });

  it("forwards yapeOpNumber and onYapeOpNumberChange to the Yape panel", async () => {
    const user = userEvent.setup();
    const { props } = renderSection({
      paymentMethod: "yape",
      yapeOpNumber: "1234",
    });
    const input = screen.getByTestId("yape-panel-input");
    expect(input).toHaveValue("1234");
    await user.type(input, "5");
    // onChange fires per keystroke with the new value
    expect(props.onYapeOpNumberChange).toHaveBeenCalled();
  });
});

// ── Validation hints ────────────────────────────────────────────────────
describe("CheckoutPaymentSection — validation hints", () => {
  it("shows 'Selecciona un metodo de pago' when showPaymentHint and no method picked", () => {
    renderSection({ showPaymentHint: true, paymentMethod: null });
    expect(
      screen.getByText(/selecciona un metodo de pago para continuar/i)
    ).toBeInTheDocument();
  });

  it("shows the Yape operation-number hint when showPaymentHint and method=yape", () => {
    renderSection({ showPaymentHint: true, paymentMethod: "yape" });
    expect(
      screen.getByText(/ingresa el numero de operacion de yape para continuar/i)
    ).toBeInTheDocument();
  });

  it("does not render any hint when showPaymentHint=false", () => {
    renderSection({ showPaymentHint: false, paymentMethod: null });
    expect(
      screen.queryByText(/selecciona un metodo de pago para continuar/i)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/ingresa el numero de operacion de yape/i)
    ).not.toBeInTheDocument();
  });
});

// ── Tip ─────────────────────────────────────────────────────────────────
describe("CheckoutPaymentSection — tip", () => {
  it("renders the 0 / 1 / 2 / 5 tip buttons", () => {
    renderSection();
    expect(screen.getByRole("button", { name: /sin\s*propina/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^s\/1$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^s\/2$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^s\/5$/i })).toBeInTheDocument();
  });

  it("calls onTipChange with the clicked amount", async () => {
    const user = userEvent.setup();
    const { props } = renderSection();
    await user.click(screen.getByRole("button", { name: /^s\/2$/i }));
    expect(props.onTipChange).toHaveBeenCalledWith(2);
    await user.click(screen.getByRole("button", { name: /^s\/5$/i }));
    expect(props.onTipChange).toHaveBeenCalledWith(5);
  });

  it("renders a tip row in the totals summary when tip > 0", () => {
    renderSection({ tip: 3 });
    // Two "Propina" labels exist when tip>0: the selector header "Propina para
    // el repartidor" and the totals row label "Propina". Match the row amount
    // uniquely instead.
    expect(screen.getByText(/\+s\/3\.00/i)).toBeInTheDocument();
    // And make sure the exact "Propina" row label is present (not just the header).
    const propinaLabels = screen.getAllByText(/^propina$/i);
    expect(propinaLabels.length).toBe(1);
  });

  it("does not render a tip row when tip = 0", () => {
    renderSection({ tip: 0 });
    // "Propina para el repartidor" label exists (tip selector header), but not
    // the totals row label "Propina" alone. Guard with getAllByText.
    const matches = screen.queryAllByText(/^propina$/i);
    expect(matches.length).toBe(0);
  });
});

// ── Coupon ──────────────────────────────────────────────────────────────
describe("CheckoutPaymentSection — coupon", () => {
  it("renders the coupon input + Aplicar button when no coupon is applied", () => {
    renderSection({ couponApplied: false });
    expect(screen.getByPlaceholderText(/codigo/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /aplicar/i })).toBeInTheDocument();
  });

  it("disables the Aplicar button when couponCode is empty", () => {
    renderSection({ couponCode: "" });
    expect(screen.getByRole("button", { name: /aplicar/i })).toBeDisabled();
  });

  it("enables the Aplicar button when couponCode is non-empty", () => {
    renderSection({ couponCode: "BIENVENIDA" });
    expect(screen.getByRole("button", { name: /aplicar/i })).toBeEnabled();
  });

  it("calls onValidateCoupon when clicking Aplicar", async () => {
    const user = userEvent.setup();
    const { props } = renderSection({ couponCode: "BIENVENIDA" });
    await user.click(screen.getByRole("button", { name: /aplicar/i }));
    expect(props.onValidateCoupon).toHaveBeenCalledTimes(1);
  });

  it("calls onValidateCoupon when pressing Enter inside the input", async () => {
    const user = userEvent.setup();
    const { props } = renderSection({ couponCode: "BIENVENIDA" });
    const input = screen.getByPlaceholderText(/codigo/i);
    input.focus();
    await user.keyboard("{Enter}");
    expect(props.onValidateCoupon).toHaveBeenCalledTimes(1);
  });

  it("uppercases typed characters via onCouponCodeChange", async () => {
    const user = userEvent.setup();
    const { props } = renderSection({ couponCode: "" });
    const input = screen.getByPlaceholderText(/codigo/i);
    await user.type(input, "a");
    expect(props.onCouponCodeChange).toHaveBeenCalledWith("A");
  });

  it("shows a spinner + disables the button when validatingCoupon=true", () => {
    renderSection({ couponCode: "X", validatingCoupon: true });
    const btn = screen.getByRole("button", { name: /aplicar|^$/i });
    expect(btn).toBeDisabled();
  });

  it("shows the applied state with message + Quitar button when couponApplied=true", () => {
    renderSection({
      couponApplied: true,
      couponCode: "BIENVENIDA10",
      couponMsg: "Cupon aplicado: -10%",
    });
    expect(screen.getByText(/cupon aplicado: -10%/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /quitar/i })).toBeInTheDocument();
  });

  it("calls onRemoveCoupon when clicking Quitar", async () => {
    const user = userEvent.setup();
    const { props } = renderSection({
      couponApplied: true,
      couponCode: "X",
      couponMsg: "ok",
    });
    await user.click(screen.getByRole("button", { name: /quitar/i }));
    expect(props.onRemoveCoupon).toHaveBeenCalledTimes(1);
  });

  it("shows the coupon error message below the input when not applied and msg is set", () => {
    renderSection({
      couponApplied: false,
      couponCode: "BAD",
      couponMsg: "Cupon invalido",
    });
    expect(screen.getByText(/cupon invalido/i)).toBeInTheDocument();
  });
});

// ── Totals rendering ────────────────────────────────────────────────────
describe("CheckoutPaymentSection — totals rendering", () => {
  it("always renders the subtotal row", () => {
    renderSection({ total: 99.9 });
    expect(screen.getByText(/subtotal/i)).toBeInTheDocument();
    expect(screen.getByText("S/99.90")).toBeInTheDocument();
  });

  it("renders the promo row when discount > 0 and promo is set", () => {
    renderSection({
      discount: 5,
      promo: { id: "p1", discountPercent: 10 },
    });
    expect(screen.getByText(/promo 10% off/i)).toBeInTheDocument();
    expect(screen.getByText(/−s\/5\.00/i)).toBeInTheDocument();
  });

  it("does not render the promo row when promo is null", () => {
    renderSection({ discount: 5, promo: null });
    expect(screen.queryByText(/promo .* off/i)).not.toBeInTheDocument();
  });

  it("renders the coupon discount row when couponApplied and couponDiscount > 0", () => {
    renderSection({
      couponApplied: true,
      couponDiscount: 4.5,
      couponCode: "BIENVENIDA",
      couponMsg: "ok",
    });
    expect(screen.getByText(/cupon bienvenida/i)).toBeInTheDocument();
    expect(screen.getByText(/−s\/4\.50/i)).toBeInTheDocument();
  });

  it("renders the tier discount row when tierDiscount > 0 and loyaltyTier is set", () => {
    renderSection({
      tierDiscount: 2.25,
      tierDiscountPct: 5,
      loyaltyTier: "Gold",
    });
    expect(screen.getByText(/tier gold \(5%\)/i)).toBeInTheDocument();
    expect(screen.getByText(/−s\/2\.25/i)).toBeInTheDocument();
  });

  it("renders the final total value", () => {
    renderSection({ finalTotal: 123.45 });
    expect(screen.getByText(/total a pagar/i)).toBeInTheDocument();
    expect(screen.getByText("S/123.45")).toBeInTheDocument();
  });
});

// ── Submit / back ───────────────────────────────────────────────────────
describe("CheckoutPaymentSection — submit + back", () => {
  it("renders the submit CTA with 'Finalizar pedido' when not submitting", () => {
    renderSection({ submitting: false });
    const cta = screen.getByTestId("pago-submit");
    expect(cta).toBeInTheDocument();
    expect(cta).toBeEnabled();
    expect(cta).toHaveTextContent(/finalizar pedido/i);
  });

  it("disables the submit CTA and shows 'Enviando...' when submitting=true", () => {
    renderSection({ submitting: true });
    const cta = screen.getByTestId("pago-submit");
    expect(cta).toBeDisabled();
    expect(cta).toHaveTextContent(/enviando/i);
  });

  it("fires the parent form onSubmit when clicking the submit CTA inside a form", async () => {
    const user = userEvent.setup();
    const onFormSubmit = vi.fn();
    renderInForm({ submitting: false }, onFormSubmit);
    await user.click(screen.getByTestId("pago-submit"));
    expect(onFormSubmit).toHaveBeenCalledTimes(1);
  });

  it("does not fire onSubmit when submitting=true (button is disabled)", async () => {
    const user = userEvent.setup();
    const onFormSubmit = vi.fn();
    renderInForm({ submitting: true }, onFormSubmit);
    await user.click(screen.getByTestId("pago-submit"));
    expect(onFormSubmit).not.toHaveBeenCalled();
  });

  it("calls onBack when clicking the Volver button", async () => {
    const user = userEvent.setup();
    const { props } = renderSection();
    await user.click(screen.getByRole("button", { name: /volver/i }));
    expect(props.onBack).toHaveBeenCalledTimes(1);
  });
});

// ── Errors ──────────────────────────────────────────────────────────────
describe("CheckoutPaymentSection — server error", () => {
  it("displays submitError when present", () => {
    renderSection({ submitError: "Stock insuficiente para un item" });
    expect(
      screen.getByText(/stock insuficiente para un item/i)
    ).toBeInTheDocument();
  });

  it("does not display an error container when submitError is empty", () => {
    renderSection({ submitError: "" });
    // No red card rendered. The absence is tested by a unique error string.
    expect(
      screen.queryByText(/stock insuficiente/i)
    ).not.toBeInTheDocument();
  });

  it("renders a long server error without crashing", () => {
    const longErr = "E".repeat(500);
    renderSection({ submitError: longErr });
    expect(screen.getByText(longErr)).toBeInTheDocument();
  });
});

// ── Points preview ──────────────────────────────────────────────────────
describe("CheckoutPaymentSection — loyalty points preview", () => {
  it("renders the points preview when finalTotal > 0", () => {
    renderSection({ finalTotal: 50 });
    // floor(50/10)*5 = 25 points
    expect(screen.getByText(/\+25 puntos/i)).toBeInTheDocument();
    expect(
      screen.getByText(/ganaras puntos por este pedido/i)
    ).toBeInTheDocument();
  });

  it("hides the points preview when finalTotal = 0", () => {
    renderSection({ finalTotal: 0 });
    expect(screen.queryByText(/puntos/i)).not.toBeInTheDocument();
  });
});

// ── Delivery ETA panel (smoke) ──────────────────────────────────────────
describe("CheckoutPaymentSection — delivery ETA panel", () => {
  it("renders the delivery estimate block label", () => {
    renderSection();
    expect(screen.getByText(/entrega estimada/i)).toBeInTheDocument();
  });

  it("renders either the open ETA or the next-morning message (time dependent)", () => {
    renderSection();
    // The component computes time at render — both branches are valid. We just
    // assert one of the two strings exists, so the test is stable regardless
    // of the host clock.
    const openEta = screen.queryByText(/~30 minutos/i);
    const closedEta = screen.queryByText(/manana de 8:00 a 10:00 am/i);
    expect(openEta !== null || closedEta !== null).toBe(true);
  });
});

// Silence unused import warnings for `within` in case future expansions need it.
void within;
