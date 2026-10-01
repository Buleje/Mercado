/**
 * __tests__/fotochecks-vista.test.tsx
 *
 * La vista de fotochecks (Brandon 2026-09-15: «que la tabla cambie a formato de
 * fotocheck y luego aparezca el botón para descargar en PDF»). Lo que se cuida:
 *
 * 1. Se arma una tarjeta por persona y el botón de descargar dice a cuántas va.
 * 2. Destildar a alguien lo saca del PDF y recalcula las hojas A4 (3 por hoja,
 *    el `POR_HOJA` de fotocheck-pdf.ts): 3 personas = 1 hoja, 4 = 2.
 * 3. Sin foto se avisa ANTES de imprimir, que es para lo que existe el preview.
 *
 * El membrete y el QR se simulan: acá se prueba la lista, no la red ni el canvas.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/membrete-cliente", () => ({
  leerMembrete: async () => ({ nombre: "Maderera Blas", logoUrl: null, telefono: "961234567", direccion: null }),
  logoParaPdf: async () => null,
}));
vi.mock("qrcode", () => ({ default: { toDataURL: async () => "data:image/png;base64,QR" } }));

import FotochecksVista from "@/components/admin/rrhh/personal/FotochecksVista";
import type { ColaboradorDTO } from "@/lib/rrhh/tipos";

const persona = (id: string, nombre: string, extra: Partial<ColaboradorDTO> = {}): ColaboradorDTO =>
  ({
    id,
    nombre,
    apodo: null,
    estado: "ACTIVO",
    puesto: { id: "p1", nombre: "Operario" },
    fechaIngreso: "2025-01-15",
    fechaCese: null,
    tipoDocumento: "DNI",
    documento: "70123456",
    celular: null,
    direccion: null,
    contactoEmergencia: { nombre: null, celular: null },
    observaciones: null,
    motivoCese: null,
    fotoUrl: "https://ejemplo.test/foto.jpg",
    beneficiarioId: null,
    adminUserId: null,
    creadoEn: "2025-01-15T00:00:00.000Z",
    actualizadoEn: "2025-01-15T00:00:00.000Z",
    ...extra,
  }) as ColaboradorDTO;

describe("FotochecksVista", () => {
  it("arma una tarjeta por persona y descarga a todas por defecto", async () => {
    const gente = [persona("1", "Rosa Huamán"), persona("2", "Juan Pérez"), persona("3", "Elena Ríos")];
    render(<FotochecksVista colaboradores={gente} onVolver={() => {}} />);

    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    expect(screen.getByRole("button", { name: /Descargar PDF \(3\)/ })).toBeTruthy();
    // 3 por hoja: tres personas entran en una sola.
    await waitFor(() => expect(screen.getByText(/1 hoja A4/)).toBeTruthy());
  });

  it("destildar a alguien lo saca del PDF y recalcula las hojas", () => {
    const gente = [persona("1", "Rosa Huamán"), persona("2", "Juan Pérez"), persona("3", "Elena Ríos"), persona("4", "Ana Vela")];
    render(<FotochecksVista colaboradores={gente} onVolver={() => {}} />);

    expect(screen.getByText(/2 hojas A4/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Incluir a Ana Vela en el PDF"));

    expect(screen.getByRole("button", { name: /Descargar PDF \(3\)/ })).toBeTruthy();
    expect(screen.getByText(/1 hoja A4/)).toBeTruthy();
  });

  it("avisa quién va a salir sin foto antes de imprimir", () => {
    const gente = [persona("1", "Rosa Huamán"), persona("2", "Juan Pérez", { fotoUrl: null })];
    render(<FotochecksVista colaboradores={gente} onVolver={() => {}} />);

    expect(screen.getByText(/sin foto: el fotocheck sale con las iniciales/)).toBeTruthy();
  });

  it("los cesados que el filtro dejó fuera se dicen, no se esconden", () => {
    render(<FotochecksVista colaboradores={[persona("1", "Rosa Huamán")]} cesadosOmitidos={2} onVolver={() => {}} />);
    expect(screen.getByText(/2 cesados fuera/)).toBeTruthy();
  });
});
