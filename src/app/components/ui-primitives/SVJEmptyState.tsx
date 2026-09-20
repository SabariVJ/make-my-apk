import React from "react";
import type { LucideIcon } from "lucide-react";

/**
 * Standard empty state — icon + title + description + optional CTA.
 */
export const SVJEmptyState: React.FC<{
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}> = ({ icon: Icon, title, description, action, className = "" }) => (
  <div className={`flex flex-col items-center justify-center py-10 px-4 text-center ${className}`}>
    <div className="w-12 h-12 rounded-2xl bg-[#1e1e22] border border-white/[0.06] flex items-center justify-center mb-4">
      <Icon className="w-5 h-5 text-[#8C8C90]" />
    </div>
    <h4 className="font-anton text-sm uppercase tracking-wider text-[#F4F2ED] mb-1">{title}</h4>
    <p className="text-xs text-[#8C8C90] max-w-xs leading-relaxed">{description}</p>
    {action && <div className="mt-4">{action}</div>}
  </div>
);
