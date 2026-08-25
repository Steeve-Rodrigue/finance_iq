import {
  Bot,
  CircleHelp,
  ClipboardList,
  Home,
  LineChart,
  type LucideIcon,
  PieChart,
  ReceiptText,
  Store,
} from "lucide-react";

export type DashboardNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  // Overview's "/dashboard" would otherwise prefix-match every other route.
  exact?: boolean;
};

// Order and pages mirror frontend/CLAUDE.md's Sidebar section exactly.
export const DASHBOARD_NAV_ITEMS: DashboardNavItem[] = [
  { label: "Overview", href: "/dashboard", icon: Home, exact: true },
  { label: "Spend Analytics", href: "/dashboard/spend", icon: LineChart },
  { label: "Categories", href: "/dashboard/categories", icon: PieChart },
  { label: "Vendors", href: "/dashboard/vendors", icon: Store },
  { label: "Agent Insights", href: "/dashboard/agent-insights", icon: Bot },
  { label: "Elicitations", href: "/dashboard/elicitations", icon: CircleHelp },
  { label: "Bills Explorer", href: "/dashboard/bills", icon: ClipboardList },
  { label: "Line Items", href: "/dashboard/line-items", icon: ReceiptText },
];
