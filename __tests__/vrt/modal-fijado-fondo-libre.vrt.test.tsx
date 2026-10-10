/**
 * Un modal FIJADO deja usar la página de atrás (ADR-420, radar 09-15).
 *
 * «Fijar» es «lo dejo abierto y sigo trabajando atrás». Hasta el 2026-10-08 la
 * página de atrás se podía mirar pero no scrollear (`RemoveScroll` de Radix),
 * un clic en un campo de atrás devolvía el foco al modal (trampa de
 * `FocusScope`) y el Tab daba vueltas adentro. Nada de eso se ve en `tsc` ni en
 * una captura: hay que mover la rueda, hacer clic y tipear en un navegador.
 *
 * Lo que se comprueba, en `AdminModal` (Radix) y en un modal a mano
 * (`useModalAccesible` + `useVentanaDeModal`):
 *   · fijado: la rueda scrollea la página, el clic y el tipeo de atrás llegan,
 *     el Tab sale del modal y Escape con el foco atrás NO lo cierra;
 *   · lo tipeado en el modal sobrevive a fijar y desfijar (no se remonta);
 *   · desfijado: vuelve el velo, el scroll bloqueado y el foco atrapado;
 *   · cerrar estando fijado no deja la página sin clics ni escondida.
 *
 * Correr con `npm run test:vrt`.
 */
import "@/app/globals.css";
import { useEffect, useRef, useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import AdminModal from "@/components/admin/shared/AdminModal";
import { ControlesDeVentana, TiradorDeVentana } from "@/components/admin/shared/modal-controles-ventana";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { escapeDeLaPaginaConFijado, useVentanaDeModal } from "@/hooks/use-ventana-de-modal";

const TITULO = "Ficha larga (prueba de fijado)";
const FIJAR = /^Fija el modal/;
const SOLTAR = /^Suelta el modal/;

let montajes = 0;
let clicsAtras = 0;
/* Los módulos con «Escape cierra el modal abierto» propio en `document` (Fiados, Préstamos…). */
let escapesCentrales = 0;

beforeEach(() => {
  montajes = 0;
  clicsAtras = 0;
  escapesCentrales = 0;
  window.scrollTo(0, 0);
});

afterEach(() => {
  /* La ventana recuerda el fijado en localStorage: que no se filtre a otro test. */
  for (const k of Object.keys(localStorage)) if (k.startsWith("buleje:ventana-modal:")) localStorage.removeItem(k);
});

/** Un campo con estado PROPIO: si el modal se remonta, lo tipeado se pierde. */
function CampoConEstado() {
  const [valor, setValor] = useState("");
  useEffect(() => {
    montajes += 1;
  }, []);
  return <input aria-label="Nota del modal" data-testid="nota-modal" value={valor} onChange={(e) => setValor(e.target.value)} />;
}

/** La pantalla de atrás: una columna angosta a la izquierda (fuera del modal) y 2400 px de alto. */
function PaginaDeAtras({ onAbrir }: { onAbrir?: () => void }) {
  return (
    <div data-testid="zona-atras" style={{ width: 150, height: 2400, padding: 8 }}>
      <button type="button" data-testid="boton-atras" onClick={() => (clicsAtras += 1)}>
        Botón de atrás
      </button>
      <input aria-label="Campo de atrás" data-testid="campo-atras" style={{ width: 120 }} />
      {onAbrir && (
        <button type="button" data-testid="abrir" onClick={onAbrir}>
          Abrir ficha
        </button>
      )}
    </div>
  );
}

function PantallaConAdminModal({ onClose }: { onClose: () => void }) {
  const [abierto, setAbierto] = useState(true);
  useEffect(() => {
    const alEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || escapeDeLaPaginaConFijado()) return;
      escapesCentrales += 1;
    };
    document.addEventListener("keydown", alEscape);
    return () => document.removeEventListener("keydown", alEscape);
  }, []);
  return (
    <>
      <PaginaDeAtras onAbrir={() => setAbierto(true)} />
      <AdminModal
        open={abierto}
        onClose={() => {
          onClose();
          setAbierto(false);
        }}
        title={TITULO}
      >
        <div className="space-y-3 p-5">
          <CampoConEstado />
          <input aria-label="Otro campo" />
        </div>
      </AdminModal>
    </>
  );
}

function dialogo(nombre = "dialog"): HTMLElement {
  const d = document.querySelector(`[role="${nombre}"]`);
  if (!d) throw new Error("no se montó el diálogo");
  return d as HTMLElement;
}

/** ¿La página de atrás está escondida para el lector de pantalla? */
const atrasEscondida = () => document.querySelector('[data-testid="zona-atras"]')?.closest('[aria-hidden="true"]') != null;

/** Una rueda sintética sobre la página: `RemoveScroll` la cancela si el scroll está bloqueado. */
function ruedaCancelada(): boolean {
  const ev = new WheelEvent("wheel", { deltaY: 120, bubbles: true, cancelable: true });
  document.querySelector('[data-testid="zona-atras"]')?.dispatchEvent(ev);
  return ev.defaultPrevented;
}

/** El primer enfocable del modal (el asa de la ventana) y un Shift+Tab desde ahí. */
async function shiftTabDesdeElPrimero(caja: HTMLElement): Promise<boolean> {
  const primero = caja.querySelector<HTMLElement>('[data-ventana-asa], button, input');
  primero?.focus();
  await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
  return caja.contains(document.activeElement);
}

test("AdminModal fijado: la página de atrás scrollea, recibe clics y tipeo; desfijado vuelve a bloquear y lo tipeado sigue", async () => {
  const onClose = vi.fn();
  render(<PantallaConAdminModal onClose={onClose} />);
  await expect.element(page.getByRole("button", { name: FIJAR })).toBeVisible();

  await page.getByTestId("nota-modal").fill("hola fijado");

  /* Desfijado: modal de siempre. */
  expect(document.querySelector(".modal-backdrop")).not.toBeNull();
  expect(getComputedStyle(document.body).pointerEvents).toBe("none");
  expect(ruedaCancelada()).toBe(true);
  expect(await shiftTabDesdeElPrimero(dialogo())).toBe(true);
  expect(atrasEscondida()).toBe(true);

  await page.getByRole("button", { name: FIJAR }).click();
  await vi.waitFor(() => expect(atrasEscondida()).toBe(false));

  /* Fijado: sin velo, sin bloqueo de puntero ni de scroll. */
  expect(document.querySelector(".modal-backdrop")).toBeNull();
  expect(getComputedStyle(document.body).pointerEvents).not.toBe("none");
  expect(ruedaCancelada()).toBe(false);

  /* Clic atrás: con velo, Playwright no lo daría (el velo recibe el clic). */
  await page.getByTestId("boton-atras").click();
  expect(clicsAtras).toBe(1);

  /* El clic se llevó el foco al botón de atrás y ahí se quedó: la trampa de
     Radix lo habría devuelto al modal. */
  expect(document.activeElement?.getAttribute("data-testid")).toBe("boton-atras");

  /* Tipear atrás con el foco viniendo de un campo DEL MODAL: la trampa de
     Radix lo devolvía al modal en el `focusout`. */
  page.getByTestId("nota-modal").element().focus();
  expect(dialogo().contains(document.activeElement)).toBe(true);
  const campoAtras = page.getByRole("textbox", { name: "Campo de atrás" });
  await campoAtras.click();
  await userEvent.keyboard("abc");
  await expect.element(campoAtras).toHaveValue("abc");
  expect(document.activeElement?.getAttribute("data-testid")).toBe("campo-atras");

  /* Escape con el foco atrás es de la página: el modal fijado sigue. */
  await userEvent.keyboard("{Escape}");
  expect(onClose).not.toHaveBeenCalled();
  expect(escapesCentrales).toBe(0);
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();

  /* El Tab sale del modal como en cualquier página. */
  expect(await shiftTabDesdeElPrimero(dialogo())).toBe(false);

  /* La rueda de verdad mueve la página. */
  await userEvent.wheel(page.getByTestId("boton-atras"), { delta: { y: 400 } });
  await vi.waitFor(() => expect(window.scrollY).toBeGreaterThan(0));

  /* Desfijar: vuelve a ser modal, y el contenido es el mismo (no se remontó). */
  await page.getByRole("button", { name: SOLTAR }).click();
  await vi.waitFor(() => expect(document.querySelector(".modal-backdrop")).not.toBeNull());
  await expect.element(page.getByTestId("nota-modal")).toHaveValue("hola fijado");
  expect(montajes).toBe(1);
  expect(getComputedStyle(document.body).pointerEvents).toBe("none");
  expect(ruedaCancelada()).toBe(true);
  await vi.waitFor(() => expect(atrasEscondida()).toBe(true));
  expect(await shiftTabDesdeElPrimero(dialogo())).toBe(true);

  /* Y Escape vuelve a cerrar. */
  page.getByTestId("nota-modal").element().focus();
  await userEvent.keyboard("{Escape}");
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(escapesCentrales).toBe(1);
});

test("AdminModal: cerrar estando fijado no deja la página sin clics ni escondida; reabrir sigue fijado y sin trampa", async () => {
  render(<PantallaConAdminModal onClose={() => {}} />);
  await page.getByRole("button", { name: FIJAR }).click();
  await vi.waitFor(() => expect(atrasEscondida()).toBe(false));

  /* Fijado, Escape con el foco ADENTRO cierra: fijar no encierra a nadie. */
  page.getByTestId("nota-modal").element().focus();
  await userEvent.keyboard("{Escape}");
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());

  expect(getComputedStyle(document.body).pointerEvents).not.toBe("none");
  expect(getComputedStyle(document.body).overflow).not.toBe("hidden");
  expect(atrasEscondida()).toBe(false);
  await page.getByTestId("boton-atras").click();
  expect(clicsAtras).toBe(1);

  /* Reabrir: fijado se recuerda, y la pausa de foco se monta DESPUÉS del contenido nuevo. */
  await page.getByTestId("abrir").click();
  await expect.element(page.getByRole("button", { name: SOLTAR })).toBeVisible();
  await vi.waitFor(() => expect(atrasEscondida()).toBe(false));
  expect(await shiftTabDesdeElPrimero(dialogo())).toBe(false);
  await page.getByTestId("boton-atras").click();
  expect(clicsAtras).toBe(2);
});

test("AdminModal que abre ya fijado (memoria) deja usar la página desde el primer momento", async () => {
  localStorage.setItem(
    `buleje:ventana-modal:titulo:${TITULO}`,
    JSON.stringify({ x: 0, y: 0, ancho: null, alto: null, fijado: true }),
  );
  render(<PantallaConAdminModal onClose={() => {}} />);
  await expect.element(page.getByRole("button", { name: SOLTAR })).toBeVisible();
  await vi.waitFor(() => expect(atrasEscondida()).toBe(false));

  expect(document.querySelector(".modal-backdrop")).toBeNull();
  expect(getComputedStyle(document.body).pointerEvents).not.toBe("none");
  await page.getByTestId("boton-atras").click();
  expect(clicsAtras).toBe(1);
  await page.getByTestId("campo-atras").click();
  await userEvent.keyboard("xyz");
  await expect.element(page.getByTestId("campo-atras")).toHaveValue("xyz");
});

/** Un modal escrito a mano, cableado como los del Libro (velo propio, los dos hooks). */
function ModalAMano({ onCerrar }: { onCerrar: () => void }) {
  const cajaRef = useRef<HTMLDivElement>(null);
  useModalAccesible(cajaRef, { onCerrar });
  const ventana = useVentanaDeModal(true, { ref: cajaRef, aplicarTranslate: true });
  return (
    <div
      className="modal-backdrop fixed inset-0 z-modal-2 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !ventana.fijado) onCerrar();
      }}
    >
      <div
        ref={cajaRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Modal a mano"
        className="relative w-full max-w-[28rem] rounded-2xl bg-[var(--surface-raised)]"
      >
        <header {...ventana.asaProps} className="flex items-center justify-between px-5 py-4">
          <h2>Modal a mano</h2>
          <div className="flex">
            <ControlesDeVentana ventana={ventana} />
            <button type="button" aria-label="Cerrar" onClick={onCerrar}>
              ×
            </button>
          </div>
        </header>
        <div className="p-5">
          <CampoConEstado />
        </div>
        <TiradorDeVentana ventana={ventana} />
      </div>
    </div>
  );
}

test("modal a mano fijado: suelta el scroll, el Tab y el Escape de atrás; desfijado los vuelve a tomar", async () => {
  const onCerrar = vi.fn();
  render(
    <>
      <PaginaDeAtras />
      <ModalAMano onCerrar={onCerrar} />
    </>,
  );
  await expect.element(page.getByRole("button", { name: FIJAR })).toBeVisible();
  await page.getByTestId("nota-modal").fill("a mano");
  const caja = dialogo();
  const velo = caja.parentElement as HTMLElement;

  expect(document.body.style.overflow).toBe("hidden");
  expect(await shiftTabDesdeElPrimero(caja)).toBe(true);

  await page.getByRole("button", { name: FIJAR }).click();
  await vi.waitFor(() => expect(document.body.style.overflow).not.toBe("hidden"));
  expect(caja.getAttribute("aria-modal")).toBe("false");
  expect(getComputedStyle(velo).pointerEvents).toBe("none");
  expect(getComputedStyle(velo).backgroundColor).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);

  await page.getByTestId("boton-atras").click();
  expect(clicsAtras).toBe(1);
  await page.getByTestId("campo-atras").click();
  await userEvent.keyboard("abc");
  await expect.element(page.getByTestId("campo-atras")).toHaveValue("abc");
  await userEvent.keyboard("{Escape}");
  expect(onCerrar).not.toHaveBeenCalled();
  expect(await shiftTabDesdeElPrimero(caja)).toBe(false);
  await userEvent.wheel(page.getByTestId("boton-atras"), { delta: { y: 400 } });
  await vi.waitFor(() => expect(window.scrollY).toBeGreaterThan(0));

  await page.getByRole("button", { name: SOLTAR }).click();
  await vi.waitFor(() => expect(document.body.style.overflow).toBe("hidden"));
  expect(caja.getAttribute("aria-modal")).toBe("true");
  expect(getComputedStyle(velo).pointerEvents).not.toBe("none");
  await expect.element(page.getByTestId("nota-modal")).toHaveValue("a mano");
  expect(montajes).toBe(1);
  expect(await shiftTabDesdeElPrimero(caja)).toBe(true);

  page.getByTestId("nota-modal").element().focus();
  await userEvent.keyboard("{Escape}");
  expect(onCerrar).toHaveBeenCalledTimes(1);
});
