/**
 * ADR-504 · el escáner con un código que está en dos permisos: cada opción
 * dice «código · permiso · GTF · especie»; con «Solo este permiso» toma la
 * del libro y lo dice. Nunca «la primera».
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const libro = vi.hoisted(() => ({ activo: null as null | { id: string; codigo: string; titular: string | null }, soloEste: false }));
vi.mock("@/contexts/contrato-activo-context", () => ({
  useContratoActivo: () => ({ ...libro, contratoId: libro.activo?.id ?? null, contratoFiltro: libro.soloEste ? libro.activo?.id ?? null : null }),
}));

import EscanerTrozas from "@/components/admin/forestal/EscanerTrozas";
import type { TrozaDelEscaner } from "@/components/admin/forestal/escaner-trozas-partes";

const P017 = "19-SEC/REG-PLT-2021-017";
const P020 = "19-SEC/REG-PLT-2021-020";
const TROZAS: TrozaDelEscaner[] = [
  { id: "cmfTroza17000001", codigoPlanta: "12", especieComun: "Tornillo", gtfNumber: "4", permiso: P017 },
  { id: "cmfTroza20000002", codigoPlanta: "12", especieComun: "Cumala", gtfNumber: "4", permiso: P020 },
];

function escanear(texto: string) {
  const campo = screen.getByPlaceholderText("Escanear o tipear código");
  fireEvent.change(campo, { target: { value: texto } });
  fireEvent.keyDown(campo, { key: "Enter" });
}
const aviso = () => document.querySelector("[data-escaner-resultado]");

describe("EscanerTrozas · un código en dos permisos", () => {
  beforeEach(() => {
    libro.activo = null;
    libro.soloEste = false;
  });

  it("sin permiso en el libro: pregunta y cada opción lleva su permiso", () => {
    const onTroza = vi.fn();
    render(<EscanerTrozas trozas={TROZAS} onTroza={onTroza} />);
    escanear("12");
    expect(aviso()?.getAttribute("data-escaner-resultado")).toBe("varias");
    expect(aviso()?.textContent).toContain("El código 12 está en 2 permisos: elige cuál.");
    expect(screen.getByText("12 · permiso 017")).toBeTruthy();
    expect(screen.getByText("GTF 4 · Tornillo")).toBeTruthy();
    expect(screen.getByText("12 · permiso 020")).toBeTruthy();
    expect(onTroza).not.toHaveBeenCalled();
    fireEvent.click(document.querySelector('[data-candidata-troza="cmfTroza20000002"]')!);
    expect(onTroza).toHaveBeenCalledWith(TROZAS[1]);
  });

  it("con «Solo este permiso»: toma la del libro y lo dice", () => {
    libro.activo = { id: "c20", codigo: P020, titular: null };
    libro.soloEste = true;
    const onTroza = vi.fn();
    render(<EscanerTrozas trozas={TROZAS} onTroza={onTroza} />);
    escanear("12");
    expect(onTroza).toHaveBeenCalledWith(TROZAS[1]);
    expect(aviso()?.getAttribute("data-escaner-resultado")).toBe("ok");
    expect(aviso()?.textContent).toContain("la del permiso 020, el del libro (hay otra en el permiso 017)");
  });

  it("con el chip sin «solo este»: no elige, la del libro primero y marcada", () => {
    libro.activo = { id: "c20", codigo: P020, titular: null };
    const onTroza = vi.fn();
    render(<EscanerTrozas trozas={TROZAS} onTroza={onTroza} />);
    escanear("12");
    expect(onTroza).not.toHaveBeenCalled();
    const botones = [...document.querySelectorAll("[data-candidata-troza]")];
    expect(botones[0]?.getAttribute("data-candidata-troza")).toBe("cmfTroza20000002");
    expect(botones[0]?.textContent).toContain("el del libro");
  });
});
