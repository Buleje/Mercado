import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OrderStats, OrderStatsLoading } from "../components/OrderStats";

describe("OrderStats", () => {
  const mockProps = {
    totalOrders: 150,
    totalRevenue: 12500.50,
    pendingOrders: 12,
    completedOrders: 138,
    averageOrderValue: 83.34,
    conversionRate: 25.5,
    periodLabel: "Este mes",
  };

  it("should render all stats correctly", () => {
    render(<OrderStats {...mockProps} />);

    expect(screen.getByText("150")).toBeInTheDocument();
    expect(screen.getByText("S/12500.50")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("138")).toBeInTheDocument();
    expect(screen.getByText("S/83.34")).toBeInTheDocument();
    expect(screen.getByText("25.5%")).toBeInTheDocument();
  });

  it("should render period label", () => {
    render(<OrderStats {...mockProps} />);

    expect(screen.getByText("Este mes")).toBeInTheDocument();
  });

  it("should render stat labels", () => {
    render(<OrderStats {...mockProps} />);

    expect(screen.getByText("Total Pedidos")).toBeInTheDocument();
    expect(screen.getByText("Ingresos")).toBeInTheDocument();
    expect(screen.getByText("Pendientes")).toBeInTheDocument();
    expect(screen.getByText("Completados")).toBeInTheDocument();
    expect(screen.getByText("Ticket Promedio")).toBeInTheDocument();
    expect(screen.getByText("Tasa Conversión")).toBeInTheDocument();
  });

  it("should show comparison with positive change", () => {
    render(
      <OrderStats
        {...mockProps}
        previousPeriodComparison={{ orders: 15.5, revenue: 12.3 }}
      />
    );

    expect(screen.getByText("+15.5%")).toBeInTheDocument();
    expect(screen.getByText("+12.3%")).toBeInTheDocument();
  });

  it("should show comparison with negative change", () => {
    render(
      <OrderStats
        {...mockProps}
        previousPeriodComparison={{ orders: -8.2, revenue: -5.1 }}
      />
    );

    expect(screen.getByText("-8.2%")).toBeInTheDocument();
    expect(screen.getByText("-5.1%")).toBeInTheDocument();
  });

  it("should render in compact mode", () => {
    render(<OrderStats {...mockProps} compact />);

    // Should only show first 4 stats in compact mode
    expect(screen.getByText("Total Pedidos")).toBeInTheDocument();
    expect(screen.getByText("Ingresos")).toBeInTheDocument();
    expect(screen.getByText("Pendientes")).toBeInTheDocument();
    expect(screen.getByText("Completados")).toBeInTheDocument();

    // Should not show Ticket Promedio and Tasa Conversión
    expect(screen.queryByText("Ticket Promedio")).not.toBeInTheDocument();
    expect(screen.queryByText("Tasa Conversión")).not.toBeInTheDocument();
  });

  it("should not render conversion rate when not provided", () => {
    const { conversionRate: _conversionRate, ...propsWithoutConversion } = mockProps;
    render(<OrderStats {...propsWithoutConversion} />);

    expect(screen.queryByText("Tasa Conversión")).not.toBeInTheDocument();
  });

  it("should handle zero values", () => {
    render(
      <OrderStats
        totalOrders={0}
        totalRevenue={0}
        pendingOrders={0}
        completedOrders={0}
        averageOrderValue={0}
      />
    );

    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("S/0.00")).toBeInTheDocument();
  });
});

describe("OrderStatsLoading", () => {
  it("should render loading state", () => {
    const { container } = render(<OrderStatsLoading />);

    // Should have 6 skeleton cards in full mode
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("should render compact loading state", () => {
    const { container } = render(<OrderStatsLoading compact />);

    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });
});
