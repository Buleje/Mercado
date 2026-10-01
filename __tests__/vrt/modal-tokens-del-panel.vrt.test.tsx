/**
 * Un modal del panel se pinta con los tokens del PANEL, no con los de la tienda.
 *
 * `AdminModal` y la confirmación (`useConfirm`) van en portal a `<body>`, fuera
 * del wrapper que lleva el preset del admin. Medido 2026-09-12 sobre Productos:
 * el diálogo compartía 1 de 8 tokens con la pantalla de atrás (acento coral,
 * grises neutros, «advertencia» coral en vez de ámbar). `usePanelTokens` copia
 * los del elemento `[data-area="admin"]`.
 *
 * El test arma un panel con tokens inventados —imposibles de heredar por
 * casualidad— y comprueba que el diálogo los ve. Corre en navegador de verdad
 * porque el portal, `getComputedStyle` y las custom properties no existen de
 * verdad en jsdom.
 *
 * Correr con `npm run test:vrt`.
 */
import "@/app/globals.css";
import { act } from "react";
import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import AdminModal from "@/components/admin/shared/AdminModal";
import { ConfirmDialogProvider, useConfirm } from "@/components/admin/shared/ConfirmDialog";

/** Valores que la raíz jamás tiene: si el diálogo los lee, vienen del panel. */
const PANEL = {
  "--accent": "rgb(1, 102, 3)",
  "--text-secondary": "rgb(4, 5, 106)",
  "--data-warning-500": "rgb(107, 8, 9)",
};

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div style={PANEL as React.CSSProperties}>
      <div data-area="admin">{children}</div>
    </div>
  );
}

function leer(el: Element) {
  const cs = getComputedStyle(el);
  return Object.fromEntries(Object.keys(PANEL).map((k) => [k, cs.getPropertyValue(k).trim()]));
}

test("AdminModal lee los tokens del panel", async () => {
  render(
    <Panel>
      <AdminModal open onClose={() => {}} title="Nueva guía">
        <p>cuerpo</p>
      </AdminModal>
    </Panel>,
  );
  await vi.waitFor(() => {
    const d = document.querySelector('[role="dialog"]');
    if (!d) throw new Error("no se montó el diálogo");
    /* El diálogo vive fuera del panel en el DOM… */
    expect(document.querySelector('[data-area="admin"]')?.contains(d)).toBe(false);
    /* …y aun así ve sus tokens. */
    expect(leer(d)).toEqual(PANEL);
  });
});

test("la confirmación (useConfirm) lee los tokens del panel y queda por encima de un modal z-60", async () => {
  let api: ReturnType<typeof useConfirm> | null = null;
  function Captura() {
    api = useConfirm();
    return null;
  }
  render(
    <Panel>
      <ConfirmDialogProvider>
        <Captura />
        {/* Un modal escrito a mano del forestal: z-60 y a pantalla completa. */}
        <div role="dialog" aria-label="modal a mano" style={{ position: "fixed", inset: 0, zIndex: 60, background: "white" }} />
      </ConfirmDialogProvider>
    </Panel>,
  );
  await vi.waitFor(() => expect(api).not.toBeNull());
  act(() => {
    void api!.confirm({ title: "¿Eliminar?", confirmLabel: "Sí, eliminar" });
  });

  await vi.waitFor(() => {
    const d = document.querySelector('[role="alertdialog"]');
    if (!d) throw new Error("no se montó la confirmación");
    expect(leer(d)).toEqual(PANEL);
    /* El `confirm()` nativo siempre quedaba arriba: el del DS también. */
    const r = d.getBoundingClientRect();
    const arriba = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    expect(d.contains(arriba)).toBe(true);
    /* 28rem y no los 960px que da `max-w-md` en este repo. */
    expect(r.width).toBeLessThanOrEqual(448);
  });
});
