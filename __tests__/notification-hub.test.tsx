import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import NotificationHub from "@/components/notifications/NotificationHub";
import type { NotificationItem } from "@/components/notifications/useNotificationCenter";

// Mock framer-motion to avoid animation issues in tests
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { initial: _i, animate: _a, exit: _e, transition: _t, ...rest } = props;
      return <div {...rest}>{children}</div>;
    },
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

// Mock NotificationItem component
vi.mock("@/components/notifications/NotificationItem", () => ({
  default: ({ notification }: { notification: NotificationItem }) => (
    <div data-testid={`notif-${notification.id}`}>{notification.title}</div>
  ),
}));

// Mock fetch for alerts
beforeEach(() => {
  vi.restoreAllMocks();
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    json: async () => ({}),
  });
});

const mockNotification: NotificationItem = {
  id: "n1",
  tenantId: "test",
  type: "STOCK_CRITICO",
  severity: "HIGH",
  title: "Stock bajo en arroz",
  body: "Solo quedan 2 unidades de arroz",
  createdAt: new Date().toISOString(),
};

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  notifications: [] as NotificationItem[],
  unreadCount: 0,
  isLoading: false,
  filter: "all" as const,
  setFilter: vi.fn(),
  markAsRead: vi.fn(),
  markAllRead: vi.fn(),
  refetch: vi.fn(),
};

describe("NotificationHub", () => {
  it("should render when open is true", () => {
    render(<NotificationHub {...defaultProps} />);
    expect(screen.getByText("Centro de Notificaciones")).toBeInTheDocument();
  });

  it("should not render when open is false", () => {
    render(<NotificationHub {...defaultProps} open={false} />);
    expect(screen.queryByText("Centro de Notificaciones")).not.toBeInTheDocument();
  });

  it("should show empty state when no notifications or alerts", () => {
    render(<NotificationHub {...defaultProps} />);
    expect(screen.getByText("Todo al día")).toBeInTheDocument();
  });

  it("should display notification items", () => {
    render(
      <NotificationHub
        {...defaultProps}
        notifications={[mockNotification]}
        unreadCount={1}
      />
    );
    expect(screen.getByTestId("notif-n1")).toBeInTheDocument();
    expect(screen.getByText("Stock bajo en arroz")).toBeInTheDocument();
  });

  it("should render all hub tabs", () => {
    render(<NotificationHub {...defaultProps} />);
    expect(screen.getByText("Todas")).toBeInTheDocument();
    expect(screen.getByText("Alertas")).toBeInTheDocument();
    expect(screen.getByText("Vencimientos")).toBeInTheDocument();
    expect(screen.getByText("Recordatorios")).toBeInTheDocument();
  });

  it("should switch tabs when clicked", async () => {
    render(<NotificationHub {...defaultProps} />);

    const alertasTab = screen.getByText("Alertas");
    fireEvent.click(alertasTab);

    // Wait for async alerts to finish loading, then show empty state
    await waitFor(() => {
      expect(screen.getByText("Sin alertas")).toBeInTheDocument();
    });
  });

  it("should call onClose when close button is clicked", () => {
    const onClose = vi.fn();
    render(<NotificationHub {...defaultProps} onClose={onClose} />);

    const closeBtn = screen.getByTitle("Cerrar (Esc)");
    fireEvent.click(closeBtn);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("should call refetch when refresh button is clicked", () => {
    const refetch = vi.fn();
    render(<NotificationHub {...defaultProps} refetch={refetch} />);

    const refreshBtn = screen.getByTitle("Actualizar todo");
    fireEvent.click(refreshBtn);

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("should close on Escape key", () => {
    const onClose = vi.fn();
    render(<NotificationHub {...defaultProps} onClose={onClose} />);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("should show loading skeletons", () => {
    render(<NotificationHub {...defaultProps} isLoading={true} />);
    // Skeletons have animate-pulse class
    const pulseElements = document.querySelectorAll(".animate-pulse");
    expect(pulseElements.length).toBeGreaterThan(0);
  });

  it("should show 'Leer todo' button when there are unread notifications and alerts loaded", async () => {
    // Need alerts + notifications for the divider with "Leer todo" to show
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ lowStockProducts: 3, pendingOrders: 0, overduePayables: 0 }),
    });

    render(
      <NotificationHub
        {...defaultProps}
        notifications={[mockNotification]}
        unreadCount={3}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Leer todo")).toBeInTheDocument();
    });
  });

  it("should call markAllRead when 'Leer todo' is clicked", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ lowStockProducts: 3, pendingOrders: 0, overduePayables: 0 }),
    });

    const markAllRead = vi.fn();
    render(
      <NotificationHub
        {...defaultProps}
        notifications={[mockNotification]}
        unreadCount={3}
        markAllRead={markAllRead}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Leer todo")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Leer todo"));
    expect(markAllRead).toHaveBeenCalledTimes(1);
  });

  it("should fetch alerts when opened", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ lowStockProducts: 5, pendingOrders: 2, overduePayables: 0 }),
    });
    global.fetch = fetchMock;

    render(<NotificationHub {...defaultProps} />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
  });

  it("should show vencimientos empty state when no expiring batches", async () => {
    render(<NotificationHub {...defaultProps} />);

    fireEvent.click(screen.getByText("Vencimientos"));

    await waitFor(() => {
      expect(screen.getByText("Sin vencimientos")).toBeInTheDocument();
    });
    expect(screen.getByText("Ningún producto está por vencer próximamente")).toBeInTheDocument();
  });

  it("should show recordatorios empty state", async () => {
    render(<NotificationHub {...defaultProps} />);

    fireEvent.click(screen.getByText("Recordatorios"));

    await waitFor(() => {
      expect(screen.getByText("Sin recordatorios")).toBeInTheDocument();
    });
  });
});
