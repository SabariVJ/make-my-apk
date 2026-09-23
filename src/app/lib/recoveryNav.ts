// SVJ Recovery V2 — Recovery destination section model.
//
// Kept out of the component file so the view only exports components (the
// project's react-refresh convention), mirroring ../lib/utilityNav.
import { BatteryCharging, CalendarDays, ChartLine, HeartPulse, Target, Trophy } from "lucide-react";

export type RecoverySection = "overview" | "history" | "goals" | "records" | "progress" | "devices";

export interface RecoverySectionDef {
  id: RecoverySection;
  label: string;
  icon: typeof HeartPulse;
}

/**
 * Section order is part of the founder Recovery information architecture.
 * Devices means future wearable/sleep connectors ONLY — never the existing
 * GPS route/record device list.
 */
export const RECOVERY_SECTIONS: RecoverySectionDef[] = [
  { id: "overview", label: "Overview", icon: HeartPulse },
  { id: "history", label: "History", icon: CalendarDays },
  { id: "goals", label: "Goals", icon: Target },
  { id: "records", label: "Records", icon: Trophy },
  { id: "progress", label: "Progress", icon: ChartLine },
  { id: "devices", label: "Devices", icon: BatteryCharging },
];
