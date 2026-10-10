import { describe, it, expect } from "vitest";
import {
  NEGOCIO_POR_DEFECTO,
  esMarketplace,
  esTenantPorDefecto,
  esTenantProtegido,
} from "@/lib/tenancy/negocio-por-defecto";

describe("lib/tenancy — helpers con nombre (ADR-457)", () => {
  it("la constante única sigue siendo 'main' (misma semántica que antes)", () => {
    expect(NEGOCIO_POR_DEFECTO).toBe("main");
  });

  it.each([esMarketplace, esTenantPorDefecto, esTenantProtegido])(
    "%o: true sólo para main, exacto",
    (fn) => {
      expect(fn("main")).toBe(true);
      expect(fn("Main")).toBe(false);
      expect(fn("main ")).toBe(false);
      expect(fn("")).toBe(false);
      expect(fn(null)).toBe(false);
      expect(fn(undefined)).toBe(false);
      expect(fn("cmpxiv6p4000bohvzwl6bnfpv")).toBe(false);
      expect(fn("inversiones-agroforestales-blas-sociedad-anonima")).toBe(false);
    },
  );
});
