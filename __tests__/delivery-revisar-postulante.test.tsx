/**
 * Revisar a un postulante (17-10, P23): confirmar manda un WhatsApp real al
 * postulante, así que la ventana tiene que frenar lo que no corresponde ANTES
 * de llamar al servidor: rechazar sin motivo y aprobar con documentos faltantes.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RevisarPostulanteModal } from "@/components/admin/delivery-partners/RevisarPostulanteModal";

afterEach(cleanup);

function confirmar() {
  fireEvent.click(document.querySelector("[data-qa=confirmar-revision-postulante]") as HTMLElement);
}

describe("RevisarPostulanteModal", () => {
  it("rechazar sin motivo no llama al servidor; con motivo manda el texto recortado", async () => {
    const onConfirmar = vi.fn().mockResolvedValue(undefined);
    render(<RevisarPostulanteModal nombre="Juan" decision="reject" faltan={[]} onClose={vi.fn()} onConfirmar={onConfirmar} />);
    confirmar();
    expect(await screen.findByText(/Escribe el motivo/)).toBeTruthy();
    expect(onConfirmar).not.toHaveBeenCalled();

    fireEvent.change(document.querySelector("[data-qa=motivo-revision-postulante]") as HTMLElement, {
      target: { value: "  El SOAT está vencido  " },
    });
    confirmar();
    await waitFor(() => expect(onConfirmar).toHaveBeenCalledWith("El SOAT está vencido"));
  });

  it("aprobar con documentos faltantes queda bloqueado y dice qué falta", () => {
    const onConfirmar = vi.fn();
    render(<RevisarPostulanteModal nombre="Rosa" decision="approve" faltan={["SOAT", "Licencia"]} onClose={vi.fn()} onConfirmar={onConfirmar} />);
    const boton = document.querySelector("[data-qa=confirmar-revision-postulante]") as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    expect(screen.getByText(/Le falta: SOAT · Licencia/)).toBeTruthy();
    confirmar();
    expect(onConfirmar).not.toHaveBeenCalled();
  });

  it("aprobar completo no exige nota; el error del servidor queda a la vista y re-habilita el botón", async () => {
    const onConfirmar = vi.fn().mockRejectedValue(new Error("Solo un administrador puede revisar postulaciones."));
    render(<RevisarPostulanteModal nombre="Rosa" decision="approve" faltan={[]} onClose={vi.fn()} onConfirmar={onConfirmar} />);
    expect(screen.getByText(/Le llega un WhatsApp de bienvenida/)).toBeTruthy();
    confirmar();
    expect(await screen.findByText(/Solo un administrador/)).toBeTruthy();
    expect(onConfirmar).toHaveBeenCalledWith("");
    expect((document.querySelector("[data-qa=confirmar-revision-postulante]") as HTMLButtonElement).disabled).toBe(false);
  });
});
