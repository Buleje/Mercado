import { Suspense } from "react";
import { OrdersClient } from "./OrdersClient";

export default function SuperadminOrdersPage() {
  return (
    <Suspense fallback={null}>
      <OrdersClient />
    </Suspense>
  );
}
