/**
 * __tests__/cubicador-atajo-pausa.test.ts
 *
 * Espacio pausa/reanuda el dictado del cubicador igual que la voz — pero sólo
 * cuando no le está robando la tecla a un campo de texto de verdad ni a otro
 * diálogo abierto encima (Brandon, 2026-09-23).
 */
import { describe, it, expect } from "vitest";
import {
  debeAlternarPausaCubicador,
  type ContextoAtajoPausa,
  type ElementoConFoco,
} from "@/lib/forestal/cubicador-atajo-pausa";

const evento = (extra: Partial<{ key: string; ctrlKey: boolean; metaKey: boolean; repeat: boolean }> = {}) => ({
  key: " ",
  ctrlKey: false,
  metaKey: false,
  repeat: false,
  ...extra,
});

const ctx = (extra: Partial<ContextoAtajoPausa> = {}): ContextoAtajoPausa => ({
  listening: true,
  foco: null,
  dialogoAjenoAbierto: false,
  ...extra,
});

const boton: ElementoConFoco = { tagName: "BUTTON" };
const celdaGrilla: ElementoConFoco = { tagName: "INPUT", type: "text", inputMode: "decimal" };
const celdaNumerica: ElementoConFoco = { tagName: "INPUT", type: "text", inputMode: "numeric" };
const observacion: ElementoConFoco = { tagName: "INPUT", type: "text" };
const codigo: ElementoConFoco = { tagName: "INPUT", type: "text", inputMode: null };
const textarea: ElementoConFoco = { tagName: "TEXTAREA" };
const editable: ElementoConFoco = { tagName: "DIV", isContentEditable: true };

describe("debeAlternarPausaCubicador — sin escuchar, no hace nada", () => {
  it("dictado apagado: Espacio no alterna aunque el resto de acuerdo", () => {
    expect(debeAlternarPausaCubicador(evento(), ctx({ listening: false }))).toBe(false);
    expect(debeAlternarPausaCubicador(evento({ ctrlKey: true }), ctx({ listening: false }))).toBe(false);
  });
});

describe("debeAlternarPausaCubicador — teclas que no son Espacio", () => {
  it("otra tecla no dispara nada", () => {
    expect(debeAlternarPausaCubicador(evento({ key: "p" }), ctx())).toBe(false);
    expect(debeAlternarPausaCubicador(evento({ key: "Enter" }), ctx())).toBe(false);
  });

  it("«Spacebar» (navegadores viejos) también cuenta como Espacio", () => {
    expect(debeAlternarPausaCubicador(evento({ key: "Spacebar" }), ctx())).toBe(true);
  });
});

describe("debeAlternarPausaCubicador — e.repeat se ignora entero", () => {
  it("tecla mantenida no alterna, ni siquiera con Ctrl", () => {
    expect(debeAlternarPausaCubicador(evento({ repeat: true }), ctx())).toBe(false);
    expect(debeAlternarPausaCubicador(evento({ repeat: true, ctrlKey: true }), ctx())).toBe(false);
  });
});

describe("debeAlternarPausaCubicador — sin foco puntual o en un elemento no textual", () => {
  it("nada con foco (body) o un botón: alterna e intercepta", () => {
    expect(debeAlternarPausaCubicador(evento(), ctx({ foco: null }))).toBe(true);
    expect(debeAlternarPausaCubicador(evento(), ctx({ foco: boton }))).toBe(true);
  });
});

describe("debeAlternarPausaCubicador — celdas de la grilla (numéricas) SÍ se interceptan", () => {
  it("inputMode decimal o numeric: Espacio no sirve ahí, así que alterna", () => {
    expect(debeAlternarPausaCubicador(evento(), ctx({ foco: celdaGrilla }))).toBe(true);
    expect(debeAlternarPausaCubicador(evento(), ctx({ foco: celdaNumerica }))).toBe(true);
  });
});

describe("debeAlternarPausaCubicador — campos de texto reales: Espacio escribe normal", () => {
  it("Observación, Código, textarea y contenteditable NO alternan", () => {
    expect(debeAlternarPausaCubicador(evento(), ctx({ foco: observacion }))).toBe(false);
    expect(debeAlternarPausaCubicador(evento(), ctx({ foco: codigo }))).toBe(false);
    expect(debeAlternarPausaCubicador(evento(), ctx({ foco: textarea }))).toBe(false);
    expect(debeAlternarPausaCubicador(evento(), ctx({ foco: editable }))).toBe(false);
  });

  it("un <select> tampoco es un campo de texto: Espacio ahí sí alterna", () => {
    expect(debeAlternarPausaCubicador(evento(), ctx({ foco: { tagName: "SELECT" } }))).toBe(true);
  });
});

describe("debeAlternarPausaCubicador — diálogo ajeno abierto encima", () => {
  it("con Dueños/Especies/Declarar encima, la tecla es suya, no nuestra", () => {
    expect(debeAlternarPausaCubicador(evento(), ctx({ dialogoAjenoAbierto: true }))).toBe(false);
    expect(debeAlternarPausaCubicador(evento(), ctx({ dialogoAjenoAbierto: true, foco: boton }))).toBe(false);
  });
});

describe("debeAlternarPausaCubicador — Ctrl+Espacio (o Cmd) se salta las dos excepciones", () => {
  it("dentro de Observación, con Ctrl, igual alterna", () => {
    expect(debeAlternarPausaCubicador(evento({ ctrlKey: true }), ctx({ foco: observacion }))).toBe(true);
  });

  it("con un diálogo ajeno encima, Ctrl+Espacio también alterna", () => {
    expect(debeAlternarPausaCubicador(evento({ ctrlKey: true }), ctx({ dialogoAjenoAbierto: true }))).toBe(true);
  });

  it("metaKey (Cmd en mac) vale igual que ctrlKey", () => {
    expect(debeAlternarPausaCubicador(evento({ metaKey: true }), ctx({ foco: codigo }))).toBe(true);
  });
});
