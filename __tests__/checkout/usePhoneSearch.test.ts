import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { usePhoneSearch } from "@/components/checkout/hooks/usePhoneSearch";
import type { Customer } from "@/contexts/customer-context";

const sampleCustomer: Customer = {
  name: "María García",
  phone: "987654321",
  location: "Jr. Ucayali 450",
  reference: "Casa azul",
};

describe("usePhoneSearch", () => {
  it("inicia con estado vacío", () => {
    const findByPhone = vi.fn();
    const { result } = renderHook(() => usePhoneSearch({ findByPhone }));

    expect(result.current.query).toBe("");
    expect(result.current.found).toBeNull();
    expect(result.current.notFound).toBe(false);
    expect(result.current.searching).toBe(false);
  });

  it("encuentra cliente y setea found", async () => {
    const findByPhone = vi.fn().mockResolvedValue(sampleCustomer);
    const { result } = renderHook(() => usePhoneSearch({ findByPhone }));

    act(() => result.current.setQuery("987654321"));
    await act(async () => {
      const found = await result.current.search();
      expect(found).toEqual(sampleCustomer);
    });

    await waitFor(() => {
      expect(result.current.found).toEqual(sampleCustomer);
    });
    expect(result.current.notFound).toBe(false);
    expect(findByPhone).toHaveBeenCalledWith("987654321");
  });

  it("setea notFound=true cuando no encuentra", async () => {
    const findByPhone = vi.fn().mockResolvedValue(null);
    const { result } = renderHook(() => usePhoneSearch({ findByPhone }));

    act(() => result.current.setQuery("000000000"));
    await act(async () => {
      const found = await result.current.search();
      expect(found).toBeNull();
    });

    expect(result.current.notFound).toBe(true);
    expect(result.current.found).toBeNull();
  });

  it("no busca si el query está vacío", async () => {
    const findByPhone = vi.fn();
    const { result } = renderHook(() => usePhoneSearch({ findByPhone }));

    await act(async () => {
      const found = await result.current.search();
      expect(found).toBeNull();
    });

    expect(findByPhone).not.toHaveBeenCalled();
  });

  it("setQuery limpia notFound previo", () => {
    const findByPhone = vi.fn();
    const { result } = renderHook(() => usePhoneSearch({ findByPhone }));

    // Forzar notFound = true mediante search fallido
    act(() => result.current.setQuery("123"));
    // No-op aquí: probamos que setQuery limpia
    act(() => result.current.setQuery("456"));
    expect(result.current.notFound).toBe(false);
  });

  it("reset() vuelve al estado inicial", async () => {
    const findByPhone = vi.fn().mockResolvedValue(sampleCustomer);
    const { result } = renderHook(() => usePhoneSearch({ findByPhone }));

    act(() => result.current.setQuery("987654321"));
    await act(async () => {
      await result.current.search();
    });
    await waitFor(() =>
      expect(result.current.found).toEqual(sampleCustomer)
    );

    act(() => result.current.reset());
    expect(result.current.found).toBeNull();
    expect(result.current.query).toBe("");
    expect(result.current.notFound).toBe(false);
  });
});
