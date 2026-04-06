"use client";

import { useState } from "react";
import type { DbOrder } from "@/lib/jsondb";

interface UseDeliveryDriverProps {
  patchOrder: (id: string, patch: Partial<DbOrder>) => Promise<void>;
}

export function useDeliveryDriver({ patchOrder }: UseDeliveryDriverProps) {
  const [deliveryDriver, setDeliveryDriver] = useState("");
  const [customDriver, setCustomDriver] = useState("");
  const [savingDriver, setSavingDriver] = useState(false);
  const [filterByDelivery, setFilterByDelivery] = useState(false);
  const [selectedDriverFilter, setSelectedDriverFilter] = useState("");

  const saveDeliveryDriver = async (orderId: string) => {
    const driver = customDriver.trim() || deliveryDriver;
    if (!driver) return;
    setSavingDriver(true);
    await patchOrder(orderId, { deliveryDriver: driver } as Partial<DbOrder>);
    setDeliveryDriver("");
    setCustomDriver("");
    setSavingDriver(false);
  };

  const driverColor = (name: string): string => {
    const colors = ["#ef4444", "#f97316", "#f59e0b", "#65a30d", "#2dd4bf", "#0ea5e9", "#3b82f6", "#8b5cf6", "#ec4899"];
    let h = 0;
    for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
    return colors[Math.abs(h) % colors.length];
  };

  return {
    deliveryDriver,
    setDeliveryDriver,
    customDriver,
    setCustomDriver,
    savingDriver,
    filterByDelivery,
    setFilterByDelivery,
    selectedDriverFilter,
    setSelectedDriverFilter,
    saveDeliveryDriver,
    driverColor,
  };
}
