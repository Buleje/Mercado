import { stripe } from "@/lib/stripe";
import type Stripe from "stripe";

export async function fetchSubscription(id: string): Promise<Stripe.Subscription> {
  return stripe.subscriptions.retrieve(id, {
    expand: ["items.data.price"],
  });
}
