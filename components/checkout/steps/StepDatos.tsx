"use client";

import { type FormEvent } from "react";
import { m } from "framer-motion";
import {
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  User,
  MapPin,
  Clock,
} from "@buleje/design-system/icons";
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
 * Rediseño 2026-05-05 v3 — BRAND-FIRST: cada sección con SectionHeader
 * brand-tinted (icono en cuadrado brand + título brand-dark), separador
 * BrandHair sutil entre secciones, CTA matching StepConfirmar/StepPago.
 */

export type StepDatosProps = {
  state: CheckoutState;
  dispatch: CheckoutDispatch;
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

function BrandHair() {
  return (
    <div
      className="h-px"
      aria-hidden="true"
      style={{
        background:
          "color-mix(in oklch, var(--color-primary, #00B4A6) 18%, transparent)",
      }}
    />
  );
}

function SectionHeader({
  icon: Icon,
  title,
  hint,
}: {
  icon: React.ComponentType<{
    className?: string;
    strokeWidth?: number;
    style?: React.CSSProperties;
  }>;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="h-8 w-8 rounded-xl flex items-center justify-center shrink-0"
        style={{
          background:
            "color-mix(in oklch, var(--color-primary, #00B4A6) 12%, transparent)",
        }}
      >
        <Icon
          className="h-4 w-4"
          strokeWidth={2.25}
          style={{ color: "var(--color-primary-dark, #009690)" }}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-extrabold leading-tight"
          style={{ color: "var(--color-primary-dark, #009690)" }}
        >
          {title}
        </p>
        {hint && <p className="text-xs text-muted mt-0.5">{hint}</p>}
      </div>
    </div>
  );
}

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

  const updateDetailedLocation = (
    overrides: { type?: string; name?: string; number?: string } = {},
  ) => {
    const type = overrides.type ?? state.address.streetType;
    const name = overrides.name ?? state.address.streetName;
    const number = overrides.number ?? state.address.streetNumber;
    if (!name) return;
    const loc = `${type} ${name}${number ? " " + number : ""}`;
    dispatch({ type: "SET_ADDRESS", patch: { location: loc } });
  };

  const showAddressInput =
    (locations.length === 0 || state.address.useNewAddress) &&
    !showVerifiedCard;

  return (
    <m.div
      key="datos"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
    >
      <form
        onSubmit={onSubmit}
        data-testid="datos-form"
        className="px-5 sm:px-6 py-5 space-y-5"
      >
        {showVerifiedCard ? (
          <section className="space-y-3">
            <SectionHeader
              icon={User}
              title="Tus datos"
              hint="Reconocimos tu cuenta — puedes confirmar o usar otra"
            />
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
            {/* "Usar otra cuenta" — vuelve al selector de cuenta (CheckoutAccountStep)
                para que el cliente pueda entrar con otro teléfono o Google. */}
            <button
              type="button"
              onClick={onBack}
              data-testid="usar-otra-cuenta"
              className="w-full inline-flex items-center justify-center gap-1.5 h-11 rounded-xl text-sm font-bold transition-colors hover:bg-[var(--surface-sunken)]/40"
              style={{
                color: "var(--color-primary-dark, #009690)",
                border:
                  "1px dashed color-mix(in oklch, var(--color-primary, #00B4A6) 35%, transparent)",
              }}
            >
              ← Usar otra cuenta
            </button>
          </section>
        ) : (
          <>
            <section className="space-y-3">
              <SectionHeader
                icon={User}
                title="¿Quién recibe el pedido?"
                hint="Necesitamos tus datos para el envío"
              />
              <CustomerFormFields
                dni={state.customer.dni}
                name={state.customer.name}
                phone={state.customer.phone}
                dniLookup={state.dniLookup}
                phoneValidation={phoneValidation}
                onDniChange={(dni) =>
                  dispatch({ type: "SET_CUSTOMER", patch: { dni } })
                }
                onNameChange={(name) =>
                  dispatch({ type: "SET_CUSTOMER", patch: { name } })
                }
                onPhoneChange={(phone) =>
                  dispatch({ type: "SET_CUSTOMER", patch: { phone } })
                }
              />
            </section>

            {locations.length > 0 && !state.address.useNewAddress && (
              <>
                <BrandHair />
                <section className="space-y-3">
                  <SectionHeader
                    icon={MapPin}
                    title="Dirección de entrega"
                    hint="Elige una guardada o agrega nueva"
                  />
                  <SavedAddressList
                    locations={locations}
                    selectedLocId={state.address.selectedLocId}
                    onSelect={onSelectLocation}
                    onAddNew={onUseNewAddress}
                  />
                </section>
              </>
            )}

            {showAddressInput && (
              <>
                <BrandHair />
                <section className="space-y-3">
                  <SectionHeader
                    icon={MapPin}
                    title="¿A dónde entregamos?"
                    hint="Dirección, referencia y mensaje"
                  />
                  <AddressInput
                    address={state.address}
                    ui={state.ui}
                    onLocationChange={(location) =>
                      dispatch({
                        type: "SET_ADDRESS",
                        patch: { location },
                      })
                    }
                    onReferenceChange={(reference) =>
                      dispatch({
                        type: "SET_ADDRESS",
                        patch: { reference },
                      })
                    }
                    onToggleDetailed={() => {
                      const next = !state.address.detailed;
                      dispatch({
                        type: "SET_ADDRESS",
                        patch: { detailed: next },
                      });
                      if (next && state.address.streetName) {
                        updateDetailedLocation();
                      }
                    }}
                    onStreetTypeChange={(type) => {
                      dispatch({
                        type: "SET_ADDRESS",
                        patch: { streetType: type },
                      });
                      updateDetailedLocation({ type });
                    }}
                    onStreetNameChange={(name) => {
                      dispatch({
                        type: "SET_ADDRESS",
                        patch: { streetName: name },
                      });
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
                      dispatch({
                        type: "SET_ADDRESS",
                        patch: { reference: s },
                      });
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
                </section>
              </>
            )}
          </>
        )}

        {showVerifiedCard && (
          <>
            <BrandHair />
            <section className="space-y-3">
              <CheckoutNotesField
                notes={state.address.notes}
                onNotesChange={(notes) =>
                  dispatch({ type: "SET_ADDRESS", patch: { notes } })
                }
                rows={2}
              />
            </section>
          </>
        )}

        <BrandHair />

        <section className="space-y-3">
          <SectionHeader
            icon={Clock}
            title="Horario de entrega"
            hint="Cuándo quieres recibirlo"
          />
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
        </section>

        {state.ui.dataError && (
          <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-red-50 dark:bg-red-950/20 border-2 border-red-200/60 dark:border-red-800/30">
            <AlertCircle
              className="h-4 w-4 shrink-0 text-[var(--data-error-600)]"
              strokeWidth={2.5}
            />
            <p className="text-sm font-medium text-[var(--data-error-700)] dark:text-red-300">
              {state.ui.dataError}
            </p>
          </div>
        )}

        <div className="flex items-center gap-2.5 pt-1">
          <button
            type="button"
            onClick={onBack}
            data-testid="datos-back"
            className="flex h-14 w-14 items-center justify-center rounded-2xl transition-all shrink-0"
            style={{
              border:
                "2px solid color-mix(in oklch, var(--color-primary, #00B4A6) 25%, transparent)",
              color: "var(--color-primary-dark, #009690)",
            }}
            aria-label="Volver"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="submit"
            data-testid="datos-submit"
            className="flex-1 flex items-center justify-center gap-2 h-14 rounded-2xl font-extrabold text-base text-white transition-all active:scale-[0.98]"
            style={{
              background:
                "linear-gradient(135deg, var(--color-primary, #00B4A6) 0%, var(--color-primary-dark, #009690) 100%)",
              boxShadow:
                "0 12px 28px color-mix(in oklch, var(--color-primary, #00B4A6) 40%, transparent), 0 2px 6px rgba(0,0,0,0.06)",
            }}
          >
            <span className="tracking-wide">Continuar al pago</span>
            <ChevronRight className="h-5 w-5" strokeWidth={2.25} />
          </button>
        </div>
      </form>
    </m.div>
  );
}
