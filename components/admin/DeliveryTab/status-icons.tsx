import {
  ChefHat,
  Package,
  Bike,
  Truck,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { TrackingStatus } from "./types";

export const TRACKING_STATUS_ICON: Record<TrackingStatus, LucideIcon> = {
  preparing: ChefHat,
  ready: Package,
  picked_up: Bike,
  in_transit: Truck,
  nearby: MapPin,
  delivered: CheckCircle2,
  failed: AlertTriangle,
  cancelled: XCircle,
};
