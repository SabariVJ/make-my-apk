import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SVJBottomSheet } from "./SVJBottomSheet";
import { useIsTabletOrDesktop } from "@/app/hooks/useMediaQuery";

/**
 * SVJ ResponsiveDialog — one API, two native-feeling presentations.
 *
 * Phones (<768px): bottom sheet with grab handle + safe-area footer.
 * Tablets/desktop (≥768px): centered dark dialog. Content is identical, so
 * screens never hand-roll (or ship) a white browser-style dialog again.
 */
export const SVJResponsiveDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  /** Action row; right-aligned in the dialog, full-width in the sheet. */
  footer?: React.ReactNode;
}> = ({ open, onOpenChange, title, description, children, footer }) => {
  const isDesktop = useIsTabletOrDesktop();

  if (!isDesktop) {
    return (
      <SVJBottomSheet
        open={open}
        onOpenChange={onOpenChange}
        title={title}
        description={description}
        footer={footer}
      >
        {children}
      </SVJBottomSheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-svj-surface border-white/[0.08] text-svj-text sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="svj-heading text-base">{title}</DialogTitle>
          {description && (
            <DialogDescription className="text-xs text-svj-secondary">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="py-2">{children}</div>
        {footer && <DialogFooter className="sm:justify-end gap-2">{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
};
