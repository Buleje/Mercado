"use client";

import { type FormEvent } from "react";
import { m } from "framer-motion";
import { ChevronRight } from "lucide-react";
import type { SavedLocation, Customer } from "@/contexts/customer-context";
import { CheckoutDeliverySchedule, CheckoutNotesField } from "..";
import { CustomerVerifiedCard } from "../parts/CustomerVerifiedCard";
import { CustomerFormFields } from "../parts/CustomerFormFields";
import { AddressInput } from "../parts/AddressInput";
import { SavedAddressList } from "../parts/SavedAddressList";
import { validatePhone } from "../parts/phone-validation";
import type { CheckoutState } from "../types";
import type { CheckoutDispatch } from "../hooks/useCheckoutState";

/**
 * StepDatos — segundo paso del wizard. Captura nombre, DNI, teléfono,
 * dirección, referencia, notas y horario de entrega.
 *
 * Toda la lógica de validación / GPS / RENIEC vive en hooks pasados
 * por props. El componente solo orquesta UI.
 */

export type StepDatosProps = {
  state: CheckoutState;
  dispatch: CheckoutDispatch;
  /**
   * El cliente "efectivo" (foundCustomer ?? customer del context).
   * Se acepta para mantener simetría con el orquestador aunque
   * StepDatos no lo lee directo — sirve para detectar el modo "card".
   */
  effectiveCustomer: Customer | null;
  customer: Customer | null;
  foundCustomer: Customer | null;
  skippedAccount: boolean;
  editingCustomerData: boolean;
  setEditingCustomerData: (v: boolean) => void;
  locations: SavedLocation[];
  onSelectLocation: (loc: SavedLocation) => void;
  onUseNewAddress: () => void;
  onRequestGeo: () => void;
  onMapPick: (lat: number, lon: number, addr: string) => void;
  onSubmit: (e: FormEvent) => void;
  onBack: () => void;
};

export function StepDatos({
  state,
  dispatch,
  effectiveCustomer: _effectiveCustomer,
  customer,
  foundCustomer,
  skippedAccount,
  editingCustomerData,
  setEditingCustomerData,
  locations,
  onSelectLocation,
  onUseNewAddress,
  onRequestGeo,
  onMapPick,
  onSubmit,
  onBack,
}: StepDatosProps) {
  const showVerifiedCard =
    (foundCustomer !== null || (customer !== null && !skippedAccount)) &&
    !editingCustomerData;

  const phoneValidation = validatePhone(state.customer.phone);

  // Construye el location string al cambiar streetName/Number/Type en modo detallado
  const updateDetailedLocation = (overrides: {
    type?: string;
    name?: string;
    number?: string;
  } = {}) => {
    const type = overrides.type ?? state.address.streetType;
    const name = overrides.name ?? state.address.streetName;
    const number = overrides.number ?? state.address.streetNumber;
    if (!name) return;
    const loc = `${type} ${name}${number ? " " + number : ""}`;
    dispatch({ type: "SET_ADDRESS", patch: { location: loc } });
  };

  return (
    <m.div
      key="datos"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.2 }}
    >
      <form onSubmit={onSubmit} className="px-5 py-4 space-y-4">
        {showVerifiedCard ? (
          <CustomerVerifiedCard
            variant={foundCustomer ? "found" : "saved"}
            name={state.customer.name}
            phone={state.customer.phone}
            location={state.address.location}
            reference={state.address.reference}
            loyaltyPoints={state.loyalty.points}
            locations={locations}
            selectedLocId={state.address.selectedLocId}
            onEditData={() => setEditingCustomerData(true)}
            onSelectLocation={onSelectLocation}
            onAddNewAddress={() => {
              setEditingCustomerData(true);
              onUseNewAddress();
            }}
          />
        ) : (
          <>
            <CustomerFormFields
              dni={state.customer.dni}
              name={state.customer.name}
              phone={state.customer.phone}
              dniLookup={state.dniLookup}
              phoneValidation={phoneValidation}
              onDniChange={(dni) => dispatch({ type: "SET_CUSTOMER", patch: { dni } })}
              onNameChange={(name) =>
                dispatch({ type: "SET_CUSTOMER", patch: { name } })
              }
              onPhoneChange={(phone) =>
                dispatch({ type: "SET_CUSTOMER", patch: { phone } })
              }
            />

            {locations.length > 0 && !state.address.useNewAddress && (
              <SavedAddressList
                locations={locations}
                selectedLocId={state.address.selectedLocId}
                onSelect={onSelectLocation}
                onAddNew={onUseNewAddress}
              />
            )}

            {(locations.length === 0 || state.address.useNewAddress) && (
              <>
                <AddressInput
                  address={state.address}
                  ui={state.ui}
                  onLocationChange={(location) =>
                    dispatch({ type: "SET_ADDRESS", patch: { location } })
                  }
                  onReferenceChange={(reference) =>
                    dispatch({
                      type: "SET_ADDRESS",
                      patch: { reference },
                    })
                  }
                  onToggleDetailed={() => {
                    const next = !state.address.detailed;
                    dispatch({ type: "SET_ADDRESS", patch: { detailed: next } });
                    if (next && state.address.streetName) {
                      updateDetailedLocation();
                    }
                  }}
                  onStreetTypeChange={(type) => {
                    dispatch({ type: "SET_ADDRESS", patch: { streetType: type } });
                    updateDetailedLocation({ type });
                  }}
                  onStreetNameChange={(name) => {
                    dispatch({ type: "SET_ADDRESS", patch: { streetName: name } });
                    updateDetailedLocation({ name });
                  }}
                  onStreetNumberChange={(num) => {
                    dispatch({
                      type: "SET_ADDRESS",
                      patch: { streetNumber: num },
                    });
                    updateDetailedLocation({ number: num });
                  }}
                  onMapPick={onMapPick}
                  onToggleMap={() =>
                    dispatch({
                      type: "SET_UI",
                      patch: { showMap: !state.ui.showMap },
                    })
                  }
                  onRequestGeo={onRequestGeo}
                  onSelectSuggestion={(s) => {
                    dispatch({ type: "SET_ADDRESS", patch: { reference: s } });
                    dispatch({
                      type: "SET_UI",
                      patch: { showRefSuggestions: false },
                    });
                  }}
                />

                <CheckoutNotesField
                  notes={state.address.notes}
                  onNotesChange={(notes) =>
                    dispatch({ type: "SET_ADDRESS", patch: { notes } })
                  }
                  rows={3}
                />
              </>
            )}
          </>
        )}

        {showVerifiedCard && (
          <CheckoutNotesField
            notes={state.address.notes}
            onNotesChange={(notes) =>
              dispatch({ type: "SET_ADDRESS", patch: { notes } })
            }
            rows={2}
          />
        )}

        <CheckoutDeliverySchedule
          deliverySlot={state.delivery.slot}
          onDeliverySlotChange={(slot) =>
            dispatch({ type: "SET_DELIVERY", patch: { slot } })
          }
          deliveryDate={state.delivery.date}
          onDeliveryDateChange={(date) =>
            dispatch({ type: "SET_DELIVERY", patch: { date } })
          }
          deliveryTime={state.delivery.time}
          onDeliveryTimeChange={(time) =>
            dispatch({ type: "SET_DELIVERY", patch: { time } })
          }
          useCustomDateTime={state.delivery.custom}
          onUseCustomDateTimeChange={(custom) =>
            dispatch({ type: "SET_DELIVERY", patch: { custom } })
          }
        />

        {state.ui.dataError && (
          <p className="text-red-600 dark:text-red-400 text-sm text-center flex items-center justify-center gap-1.5">
            <span aria-hidden>!</span>
            {state.ui.dataError}
          </p>
        )}

        <div className="flex gap-3 pt-1">
          <m.button
            type="button"
            onClick={onBack}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.96 }}
            className="flex-1 py-3 rounded-xl border-2 border-gray-200 dark:border-zinc-700 text-sm font-semibold text-gray-600 dark:text-muted hover:bg-gray-50 dark:hover:bg-surface transition-colors"
          >
            Volver
          </m.button>
          <m.button
            type="submit"
            data-testid="datos-submit"
            whileHover={{ scale: 1.03, y: -1 }}
            whileTap={{ scale: 0.96 }}
            className="flex-1 py-3.5 rounded-xl bg-linear-to-r from-primary to-primary-dark text-white font-extrabold text-sm transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
          >
            Continuar al pago <ChevronRight className="h-4 w-4" />
          </m.button>
        </div>
      </form>
    </m.div>
  );
}
