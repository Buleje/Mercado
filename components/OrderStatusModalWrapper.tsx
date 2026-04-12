"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { useCustomer } from "@/contexts/customer-context";

const OrderStatusModalComponent = dynamic(() => import("@/components/OrderStatusModal"));

export default function OrderStatusModalWrapper() {
  const { orderStatusModalOpen, closeOrderStatusModal, openOrderStatusModal } = useCustomer();

  useEffect(() => {
    const handler = () => openOrderStatusModal();
    window.addEventListener("buleje:orderCreated", handler);
    return () => window.removeEventListener("buleje:orderCreated", handler);
  }, [openOrderStatusModal]);

  return <OrderStatusModalComponent isOpen={orderStatusModalOpen} onClose={closeOrderStatusModal} />;
}
