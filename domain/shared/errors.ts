// Errores del dominio como valores — sin throw.
// Cada tipo lleva suficiente contexto para logging y mensajes de UI.

export type DomainErrorKind =
  | "INVALID_ORDER_STATE"
  | "INVALID_MONEY"
  | "NEGATIVE_QUANTITY"
  | "MIXED_CURRENCY"
  | "INVALID_TOTALS"
  | "MISSING_ITEMS"
  | "INVALID_PRODUCT";

export interface DomainError {
  kind: DomainErrorKind;
  message: string;
}

export interface InvalidOrderStateError extends DomainError {
  kind: "INVALID_ORDER_STATE";
  from: string;
  to: string;
}

export interface InvalidMoneyError extends DomainError {
  kind: "INVALID_MONEY";
  amount: number;
}

export interface NegativeQuantityError extends DomainError {
  kind: "NEGATIVE_QUANTITY";
  quantity: number;
}

export interface MixedCurrencyError extends DomainError {
  kind: "MIXED_CURRENCY";
  expected: string;
  received: string;
}

export interface InvalidTotalsError extends DomainError {
  kind: "INVALID_TOTALS";
  expected: number;
  received: number;
}

export interface MissingItemsError extends DomainError {
  kind: "MISSING_ITEMS";
}

export interface InvalidProductError extends DomainError {
  kind: "INVALID_PRODUCT";
  field: string;
}

export type OrderError =
  | InvalidOrderStateError
  | InvalidMoneyError
  | NegativeQuantityError
  | MixedCurrencyError
  | InvalidTotalsError
  | MissingItemsError;

export type ProductError = InvalidProductError | InvalidMoneyError | NegativeQuantityError;
