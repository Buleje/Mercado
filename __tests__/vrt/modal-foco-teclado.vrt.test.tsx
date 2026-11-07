/**
 * Un modal escrito a mano, manejado sólo con el teclado.
 *
 * Los doce modales a mano del Libro no atrapaban el foco: al abrirlos el foco
 * se quedaba en el botón de atrás, Tab se iba a la pantalla de abajo y Escape
 * no cerraba. `useModalAccesible` lo arregla, pero eso no se ve en `tsc` ni en
 * una captura — hay que pulsar las teclas.
 *
 * Esto no compara imágenes: corre en el mismo navegador de verdad que las VRT
 * porque el foco y el Tab nativo no existen en jsdom.
 *
 * Correr con `npm run test:vrt`.
 */
import "@/app/globals.css";
import { useCallback, useState } from "react";
import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import LothCoordsModal from "@/components/admin/forestal/LothCoordsModal";

/** Lo enfocable de verdad, en el orden en que lo tabula el navegador. */
const ENFOCABLES =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function dialogo() {
  const d = document.querySelector('[role="dialog"]');
  if (!d) throw new Error("no se montó el diálogo");
  return d as HTMLElement;
}

test("al abrir, el foco entra al modal y no se queda en la pantalla de atrás", async () => {
  /* El botón que lo abre vive FUERA del modal: es donde quedaba el foco antes
     y adonde tiene que volver al cerrar. */
  render(
    <>
      <button type="button" data-testid="atras">
        Un control de la pantalla de atrás
      </button>
      <LothCoordsModal open zonaDefault="18" onClose={() => {}} onApply={() => {}} />
    </>,
  );

  await vi.waitFor(() => {
    expect(dialogo().contains(document.activeElement)).toBe(true);
  });
});

test("Tab cicla dentro del modal — no se escapa a lo de abajo", async () => {
  render(
    <>
      <button type="button" data-testid="atras">
        Un control de la pantalla de atrás
      </button>
      <LothCoordsModal open zonaDefault="18" onClose={() => {}} onApply={() => {}} />
    </>,
  );
  await vi.waitFor(() => expect(dialogo().contains(document.activeElement)).toBe(true));

  const caja = dialogo();
  const dentro = [...caja.querySelectorAll(ENFOCABLES)];
  expect(dentro.length).toBeGreaterThan(1);

  /* Una vuelta entera y una de más: si la trampa no existe, en alguno de estos
     saltos el foco se va al botón de atrás (o al chrome del navegador). */
  for (let i = 0; i < dentro.length + 2; i++) {
    await userEvent.keyboard("{Tab}");
    expect(caja.contains(document.activeElement)).toBe(true);
  }

  /* Y en el otro sentido, que es donde suele fallar una trampa a medias. */
  for (let i = 0; i < 3; i++) {
    await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
    expect(caja.contains(document.activeElement)).toBe(true);
  }
});

test("Escape cierra", async () => {
  const onClose = vi.fn();
  render(<LothCoordsModal open zonaDefault="18" onClose={onClose} onApply={() => {}} />);
  await vi.waitFor(() => expect(dialogo().contains(document.activeElement)).toBe(true));

  await userEvent.keyboard("{Escape}");
  expect(onClose).toHaveBeenCalled();
});

function PantallaConBoton() {
  const [abierto, setAbierto] = useState(false);
  /* Estable a propósito: con una flecha inline `onCerrar` cambia de identidad
     en cada render y el efecto del hook se re-ejecuta solo, tapando el bug que
     este test tiene que ver. */
  const cerrar = useCallback(() => setAbierto(false), []);
  return (
    <>
      <button type="button" data-testid="abrir" onClick={() => setAbierto(true)}>
        Cargar coordenadas
      </button>
      <LothCoordsModal open={abierto} zonaDefault="18" onClose={cerrar} onApply={() => {}} />
    </>
  );
}

test("si se abre DESPUÉS de montado, el foco entra igual", async () => {
  /* El caso que rompe de verdad, y el que se parece a la pantalla: el padre
     deja el modal montado y sólo le cambia `open`. El efecto del hook corre
     una vez —con el ref todavía vacío— y sin `activo` no vuelve a mirar
     cuando el diálogo aparece. */
  render(<PantallaConBoton />);
  expect(document.querySelector('[role="dialog"]')).toBeNull();

  await page.getByTestId("abrir").click();

  await vi.waitFor(() => {
    expect(dialogo().contains(document.activeElement)).toBe(true);
  });
});
