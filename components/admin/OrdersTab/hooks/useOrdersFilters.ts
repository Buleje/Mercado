"use client";

import { useReducer } from "react";
import type { OrderStatus } from "@/lib/jsondb";
import type { OrderFilters, FiltersAction } from "../types";

const initialFilters: OrderFilters = {
  statuses: new Set<OrderStatus>(),
  paymentMethod: "",
  source: "",
  dateFrom: "",
  dateTo: "",
  amountMin: "",
  amountMax: "",
  customerSearch: "",
  hasDebt: false,
  hasAdminNotes: false,
};

function filtersReducer(state: OrderFilters, action: FiltersAction): OrderFilters {
  switch (action.type) {
    case "SET_STATUSES":
      return { ...state, statuses: action.statuses };
    case "SET_PAYMENT_METHOD":
      return { ...state, paymentMethod: action.value };
    case "SET_SOURCE":
      return { ...state, source: action.value };
    case "SET_DATE_FROM":
      return { ...state, dateFrom: action.value };
    case "SET_DATE_TO":
      return { ...state, dateTo: action.value };
    case "SET_AMOUNT_MIN":
      return { ...state, amountMin: action.value };
    case "SET_AMOUNT_MAX":
      return { ...state, amountMax: action.value };
    case "SET_CUSTOMER_SEARCH":
      return { ...state, customerSearch: action.value };
    case "SET_HAS_DEBT":
      return { ...state, hasDebt: action.value };
    case "SET_HAS_ADMIN_NOTES":
      return { ...state, hasAdminNotes: action.value };
    case "CLEAR":
      return { ...initialFilters, statuses: new Set<OrderStatus>() };
    default:
      return state;
  }
}

export function useOrdersFilters() {
  const [filters, dispatch] = useReducer(filtersReducer, initialFilters);

  const activeFiltersCount =
    filters.statuses.size +
    (filters.paymentMethod ? 1 : 0) +
    (filters.source ? 1 : 0) +
    (filters.dateFrom ? 1 : 0) +
    (filters.dateTo ? 1 : 0) +
    (filters.amountMin ? 1 : 0) +
    (filters.amountMax ? 1 : 0) +
    (filters.customerSearch ? 1 : 0) +
    (filters.hasDebt ? 1 : 0) +
    (filters.hasAdminNotes ? 1 : 0);

  return { filters, dispatch, activeFiltersCount };
}
