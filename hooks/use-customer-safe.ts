"use client";

import { useCustomer } from "@/contexts/customer-context";
import type { Customer } from "@/contexts/customer-context";

/**
 * Safe accessor for customer context. Returns null when provider is absent.
 */
export function useCustomerSafe(): Customer | null {
  try {
    return useCustomer().customer;
  } catch {
    return null;
  }
}
