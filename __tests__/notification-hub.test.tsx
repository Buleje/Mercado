/**
 * Centro de notificaciones como modal central (10-10): clasificado por
 * categoría real, «No leídas», «Marcar todas leídas», «Para atender ahora»
 * con destinos que existen, y el gate de rol de /api/admin/stats (09-14).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import NotificationHub from "@/components/notifications/NotificationHub";
import type { NotificationItem } from "@/components/notifications/useNotificationCenter";

// El hub pide /api/admin/stats sólo si el rol puede (roles-rutas-panel). Los
// tests de siempre corren como admin; los de abajo cambian el rol.
const rolMock = vi.hoisted(() => ({ valor: "admin" as string | null }));
vi.mock("@/hooks/use-mi-rol", () => ({ useMiRol: () => rolMock.valor }));

// Desde 1280 px «Para atender ahora» va en su columna (jsdom no trae matchMedia).
const anchoMock = vi.hoisted(() => ({ ancho: false }));
vi.mock("@/hooks/use-media-query", () => ({ useMediaQuery: () => anchoMock.ancho }));

const irAEnlace = vi.hoisted(() => vi.fn());
vi.mock("@/components/admin/shared/ir-a-enlace", () => ({ irAEnlace }));

vi.mock("@/components/notifications/NotificationItem", () => ({
  default: ({ notification }: { notification: NotificationItem }) => (
    <div data-testid={`notif-${notification.id}`}>{notification.title}</div>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi
    .fn()
    .mockResolvedValue({ ok: false, json: async () => ({}) }) as unknown as typeof fetch;
});

const aviso = (id: string, type: string, title: string): NotificationItem => ({
  id,
  tenantId: "t",
  type,
  severity: "MEDIUM",
  title,
  body: "",
  createdAt: new Date().toISOString(),
});

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

const categorias = () => within(screen.getByRole("group", { name: "Categoría" }));

describe("NotificationHub — modal", () => {
  it("abre un diálogo con el título «Notificaciones»", () => {
    render(<NotificationHub {...defaultProps} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Notificaciones" })).toBeInTheDocument();
  });

  it("cerrado no dibuja nada", () => {
    render(<NotificationHub {...defaultProps} open={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("Escape cierra", () => {
    const onClose = vi.fn();
    render(<NotificationHub {...defaultProps} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("la X cierra", () => {
    const onClose = vi.fn();
    render(<NotificationHub {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("sin nada dice «Todo al día»; cargando, esqueleto", () => {
    const { rerender } = render(<NotificationHub {...defaultProps} />);
    expect(screen.getByText("Todo al día")).toBeInTheDocument();
    rerender(<NotificationHub {...defaultProps} isLoading />);
    expect(document.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("si la lectura falló lo dice (no «Todo al día») y «Reintentar» relee", () => {
    const refetch = vi.fn();
    render(<NotificationHub {...defaultProps} cargaFallida refetch={refetch} />);
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron traer los avisos.");
    expect(screen.queryByText("Todo al día")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("«Actualizar» relee los avisos y las alertas", async () => {
    const refetch = vi.fn();
    render(<NotificationHub {...defaultProps} refetch={refetch} />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const antes = vi.mocked(global.fetch).mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Actualizar" }));
    expect(refetch).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(vi.mocked(global.fetch).mock.calls.length).toBeGreaterThan(antes));
  });
});

describe("NotificationHub — clasificado", () => {
  const avisos = [
    aviso("a1", "ADELANTO_VENCIDO", "Adelantos vencidos por cobrar"),
    aviso("a2", "marketplace_order", "Pedido nuevo del marketplace"),
    aviso("a3", "CACAO_BENEFICIO_ATENCION", "Lote de cacao en fermentado"),
    aviso("a4", "TIPO_QUE_NO_EXISTE", "Algo nuevo"),
  ];

  it("una pestaña por categoría con avisos, con su conteo; las vacías no se muestran", () => {
    render(<NotificationHub {...defaultProps} notifications={avisos} />);
    const fila = categorias();
    expect(fila.getByRole("button", { name: /Todas\s*4/ })).toBeInTheDocument();
    expect(fila.getByRole("button", { name: /Caja y plata\s*1/ })).toBeInTheDocument();
    expect(fila.getByRole("button", { name: /Pedidos y clientes\s*1/ })).toBeInTheDocument();
    expect(fila.getByRole("button", { name: /Forestal y cacao\s*1/ })).toBeInTheDocument();
    expect(fila.getByRole("button", { name: /Sistema\s*1/ })).toBeInTheDocument();
    expect(fila.queryByRole("button", { name: /Inventario/ })).not.toBeInTheDocument();
  });

  it("elegir una categoría deja sólo sus avisos", () => {
    render(<NotificationHub {...defaultProps} notifications={avisos} />);
    fireEvent.click(categorias().getByRole("button", { name: /Pedidos y clientes/ }));
    expect(screen.getByTestId("notif-a2")).toBeInTheDocument();
    expect(screen.queryByTestId("notif-a1")).not.toBeInTheDocument();
    expect(categorias().getByRole("button", { name: /Pedidos y clientes/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("«No leídas» pide el filtro unread del endpoint", () => {
    const setFilter = vi.fn();
    const { rerender } = render(<NotificationHub {...defaultProps} setFilter={setFilter} />);
    fireEvent.click(screen.getByRole("button", { name: "No leídas" }));
    expect(setFilter).toHaveBeenCalledWith("unread");
    rerender(<NotificationHub {...defaultProps} setFilter={setFilter} filter="unread" />);
    expect(screen.getByRole("button", { name: "No leídas" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("«Marcar todas leídas» llama a markAllRead; sin nada sin leer no hace nada", () => {
    const markAllRead = vi.fn();
    const { rerender } = render(
      <NotificationHub {...defaultProps} markAllRead={markAllRead} unreadCount={0} />,
    );
    const boton = screen.getByRole("button", { name: "Marcar todas como leídas" });
    expect(boton).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(boton);
    expect(markAllRead).not.toHaveBeenCalled();
    rerender(
      <NotificationHub
        {...defaultProps}
        markAllRead={markAllRead}
        unreadCount={3}
        notifications={avisos}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Marcar todas como leídas" }));
    expect(markAllRead).toHaveBeenCalledTimes(1);
  });
});

describe("NotificationHub — Para atender ahora", () => {
  it("el stock bajo lleva a Inventario › Stock (antes `alertas-stock`, que no existe) y cierra", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ lowStockProducts: 3, pendingOrders: 0, overduePayables: 0 }),
    }) as unknown as typeof fetch;
    const onClose = vi.fn();
    render(<NotificationHub {...defaultProps} onClose={onClose} />);
    expect(await screen.findByText("3 productos con stock bajo")).toBeInTheDocument();
    expect(categorias().getByRole("button", { name: /Inventario\s*1/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Ver stock/ }));
    expect(irAEnlace).toHaveBeenCalledWith("/admin?tab=inventario&vista=stock");
    expect(onClose).toHaveBeenCalled();
  });

  it("en pantalla ancha va en su columna, una sola vez (no repetida arriba de la lista)", async () => {
    anchoMock.ancho = true;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ lowStockProducts: 3, pendingOrders: 0, overduePayables: 0 }),
    }) as unknown as typeof fetch;
    render(<NotificationHub {...defaultProps} />);
    expect(await screen.findByText("3 productos con stock bajo")).toBeInTheDocument();
    expect(screen.getAllByText("Para atender ahora")).toHaveLength(1);
    anchoMock.ancho = false;
  });
});

describe("NotificationHub — gate de rol de /api/admin/stats (2026-09-14)", () => {
  const pidioStats = (fetchMock: ReturnType<typeof vi.fn>) =>
    fetchMock.mock.calls.some(([url]) => String(url).includes("/api/admin/stats"));

  it("el almacenero abre el centro sin pedir /api/admin/stats (le daba 403)", async () => {
    rolMock.valor = "almacenero";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    global.fetch = fetchMock as unknown as typeof fetch;
    render(<NotificationHub {...defaultProps} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(pidioStats(fetchMock)).toBe(false);
    rolMock.valor = "admin";
  });

  it("el admin sí pide /api/admin/stats", async () => {
    rolMock.valor = "admin";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    global.fetch = fetchMock as unknown as typeof fetch;
    render(<NotificationHub {...defaultProps} />);
    await waitFor(() => expect(pidioStats(fetchMock)).toBe(true));
  });
});
