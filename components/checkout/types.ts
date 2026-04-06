/**
 * Tipos compartidos por todo el flujo del CheckoutModal refactorizado.
 *
 * Centraliza los discriminadores del wizard y los shapes que cruzan
 * pasos / hooks. Nada de lógica aquí — solo tipos.
 */

import type { Step } from "./StepBar";

export type { Step };

export type PaymentMethod = "yape" | "efectivo";

export type DniLookupStatus = "idle" | "loading" | "success" | "error";

export type DniLookupState = {
  status: DniLookupStatus;
  message: string;
};

/** Datos personales del cliente que se piden en el paso "datos". */
export type CustomerInfoState = {
  dni: string;
  name: string;
  phone: string;
};

/** Dirección estructurada / referencia / detalle GPS. */
export type AddressState = {
  location: string;
  reference: string;
  notes: string;
  /** Coordenadas mostradas en el mapa interactivo. */
  mapLat: number;
  mapLon: number;
  /** Modo de captura: simple (free text) vs detallado (calle/num). */
  detailed: boolean;
  streetType: string;
  streetName: string;
  streetNumber: string;
  /** Selección de dirección guardada del cliente identificado. */
  selectedLocId: string | null;
  useNewAddress: boolean;
  /** Distancia haversine al local cuando hay GPS. */
  distanceKm: number | undefined;
};

export type CouponState = {
  code: string;
  discount: number;
  msg: string;
  applied: boolean;
  validating: boolean;
};

export type LoyaltyState = {
  points: number | null;
  tier: string | null;
};

export type PaymentState = {
  method: PaymentMethod | null;
  yapeOpNumber: string;
  showHint: boolean;
  tip: number;
};

export type DeliveryState = {
  slot: string;
  date: string;
  time: string;
  custom: boolean;
};

export type UiState = {
  submitting: boolean;
  orderId: string;
  submitError: string;
  dataError: string;
  loadingGeo: boolean;
  geoError: string;
  geoSuggested: boolean;
  showMap: boolean;
  refSuggestions: string[];
  showRefSuggestions: boolean;
  pendingOrdersCount: number;
  stockWarnings: string[];
};

/** Estado completo del wizard. */
export type CheckoutState = {
  step: Step;
  customer: CustomerInfoState;
  address: AddressState;
  coupon: CouponState;
  loyalty: LoyaltyState;
  payment: PaymentState;
  delivery: DeliveryState;
  ui: UiState;
  dniLookup: DniLookupState;
};

/** Discriminador exhaustivo para el reducer del checkout. */
export type CheckoutAction =
  | { type: "RESET"; initial: CheckoutState }
  | { type: "SET_STEP"; step: Step }
  | { type: "SET_CUSTOMER"; patch: Partial<CustomerInfoState> }
  | { type: "SET_ADDRESS"; patch: Partial<AddressState> }
  | { type: "SET_COUPON"; patch: Partial<CouponState> }
  | { type: "RESET_COUPON" }
  | { type: "SET_LOYALTY"; patch: Partial<LoyaltyState> }
  | { type: "SET_PAYMENT"; patch: Partial<PaymentState> }
  | { type: "SET_DELIVERY"; patch: Partial<DeliveryState> }
  | { type: "SET_UI"; patch: Partial<UiState> }
  | { type: "SET_DNI_LOOKUP"; patch: Partial<DniLookupState> };
