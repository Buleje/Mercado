import { useReducer, useCallback, type Dispatch } from "react";
import type {
  CheckoutState,
  CheckoutAction,
  CustomerInfoState,
  AddressState,
  CouponState,
  LoyaltyState,
  PaymentState,
  DeliveryState,
  UiState,
  DniLookupState,
} from "../types";

/**
 * useCheckoutState — useReducer central que reemplaza ~50 useState del
 * antiguo CheckoutModal. El estado se agrupa por dominio (customer,
 * address, coupon, payment...) y todas las mutaciones se hacen vía
 * acciones tipadas con discriminador.
 */

const INITIAL_CUSTOMER: CustomerInfoState = { dni: "", name: "", phone: "" };

const INITIAL_ADDRESS: AddressState = {
  location: "",
  reference: "",
  notes: "",
  mapLat: -8.3791,
  mapLon: -74.5539,
  detailed: false,
  streetType: "Calle",
  streetName: "",
  streetNumber: "",
  selectedLocId: null,
  useNewAddress: false,
  distanceKm: undefined,
};

const INITIAL_COUPON: CouponState = {
  code: "",
  discount: 0,
  msg: "",
  applied: false,
  validating: false,
};

const INITIAL_LOYALTY: LoyaltyState = { points: null, tier: null };

const INITIAL_PAYMENT: PaymentState = {
  method: null,
  yapeOpNumber: "",
  showHint: false,
  tip: 0,
};

const INITIAL_DELIVERY: DeliveryState = {
  slot: "lo-antes-posible",
  date: "",
  time: "",
  custom: false,
};

const INITIAL_UI: UiState = {
  submitting: false,
  orderId: "",
  submitError: "",
  dataError: "",
  loadingGeo: false,
  geoError: "",
  geoSuggested: false,
  showMap: false,
  refSuggestions: [],
  showRefSuggestions: false,
  pendingOrdersCount: 0,
  stockWarnings: [],
};

const INITIAL_DNI_LOOKUP: DniLookupState = {
  status: "idle",
  message: "Escribe 8 números y traeremos el nombre desde RENIEC.",
};

export const INITIAL_CHECKOUT_STATE: CheckoutState = {
  step: "cuenta",
  customer: INITIAL_CUSTOMER,
  address: INITIAL_ADDRESS,
  coupon: INITIAL_COUPON,
  loyalty: INITIAL_LOYALTY,
  payment: INITIAL_PAYMENT,
  delivery: INITIAL_DELIVERY,
  ui: INITIAL_UI,
  dniLookup: INITIAL_DNI_LOOKUP,
};

export function checkoutReducer(
  state: CheckoutState,
  action: CheckoutAction
): CheckoutState {
  switch (action.type) {
    case "RESET":
      return action.initial;
    case "SET_STEP":
      return { ...state, step: action.step };
    case "SET_CUSTOMER":
      return { ...state, customer: { ...state.customer, ...action.patch } };
    case "SET_ADDRESS":
      return { ...state, address: { ...state.address, ...action.patch } };
    case "SET_COUPON":
      return { ...state, coupon: { ...state.coupon, ...action.patch } };
    case "RESET_COUPON":
      return { ...state, coupon: INITIAL_COUPON };
    case "SET_LOYALTY":
      return { ...state, loyalty: { ...state.loyalty, ...action.patch } };
    case "SET_PAYMENT":
      return { ...state, payment: { ...state.payment, ...action.patch } };
    case "SET_DELIVERY":
      return { ...state, delivery: { ...state.delivery, ...action.patch } };
    case "SET_UI":
      return { ...state, ui: { ...state.ui, ...action.patch } };
    case "SET_DNI_LOOKUP":
      return { ...state, dniLookup: { ...state.dniLookup, ...action.patch } };
    default: {
      // Exhaustiveness check
      const _never: never = action;
      return state;
    }
  }
}

export type CheckoutDispatch = Dispatch<CheckoutAction>;

/**
 * Hook envoltorio que también expone helpers tipados para reset.
 * El estado base puede ser sobreescrito (útil en tests).
 */
export function useCheckoutState(initial: CheckoutState = INITIAL_CHECKOUT_STATE) {
  const [state, dispatch] = useReducer(checkoutReducer, initial);

  const reset = useCallback(
    (next: CheckoutState = INITIAL_CHECKOUT_STATE) =>
      dispatch({ type: "RESET", initial: next }),
    []
  );

  return { state, dispatch, reset };
}
