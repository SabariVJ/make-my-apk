import React from "react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

/**
 * SVJ BottomSheet — the phone-native presentation layer.
 *
 * Dark surface (never the browser white sheet), grab handle, scrollable body
 * capped at 85dvh, and safe-area clearance so actions never sit under the
 * Android gesture bar. Powered by vaul via the shadcn drawer wrapper.
 */
export const SVJBottomSheet: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  /** Sticky action row; receives safe-area bottom padding automatically. */
  footer?: React.ReactNode;
}> = ({ open, onOpenChange, title, description, children, footer }) => (
  <Drawer open={open} onOpenChange={onOpenChange}>
    <DrawerContent className="bg-svj-surface border-white/[0.08] text-svj-text max-h-[85dvh]">
      <DrawerHeader className="px-4 pt-2 pb-3 text-left">
        <DrawerTitle className="svj-heading text-base">{title}</DrawerTitle>
        {description && (
          <DrawerDescription className="text-xs text-svj-secondary">
            {description}
          </DrawerDescription>
        )}
      </DrawerHeader>
      <div className="overflow-y-auto px-4 pb-2 min-h-0 flex-1">{children}</div>
      {footer && (
        <DrawerFooter className="px-4 pt-2 svj-safe-bottom border-t border-white/[0.06]">
          {footer}
        </DrawerFooter>
      )}
      {!footer && <div className="svj-safe-bottom" />}
    </DrawerContent>
  </Drawer>
);
