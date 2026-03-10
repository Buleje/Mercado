"use client";

import dynamic from "next/dynamic";
import { useCustomer } from "@/contexts/customer-context";

const OrderStatusModalComponent = dynamic(() => import("@/components/OrderStatusModal"));

export default function OrderStatusModalWrapper() {
  const { orderStatusModalOpen, closeOrderStatusModal } = useCustomer();
  
  return <OrderStatusModalComponent isOpen={orderStatusModalOpen} onClose={closeOrderStatusModal} />;
}
