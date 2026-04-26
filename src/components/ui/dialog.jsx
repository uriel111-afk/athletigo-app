"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"
import MiniTimerBar from "@/components/MiniTimerBar"

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogPortal = DialogPrimitive.Portal
const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef(({ className, style, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    // The `bottom: var(--timer-bar-height,0)` cutout leaves the
    // minimized timer bar fully exposed and tappable even though
    // the overlay otherwise sits at the same body-level stacking
    // context — the overlay literally doesn't cover the bar's
    // pixels, so taps on bar buttons reach the bar.
    style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 'var(--timer-bar-height, 0px)', ...style }}
    className={cn(
      "z-[11000] bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

// Any interaction that originates inside the minimized timer footer bar
// must NOT close the dialog. Radix fires onPointerDownOutside /
// onInteractOutside when the user taps outside DialogContent — calling
// e.preventDefault() on them cancels the close. We still honor any
// caller-supplied handlers first so per-dialog logic (e.g. "don't close
// while saving") keeps working.
const isFromTimerBar = (e) => {
  const t = e?.detail?.originalEvent?.target || e?.target;
  return !!(t && typeof t.closest === 'function' && t.closest('[data-timer-bar]'));
};

const DialogContent = React.forwardRef(({ className, children, style: callerStyle, onPointerDownOutside, onInteractOutside, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      dir="rtl"
      // Caller's style merges over the primitive's defaults, so an
      // override of `transform` (used by drag-positioned dialogs) wins
      // without wiping out position/zIndex/top/left. Earlier passes
      // had {...props} after style, which let any caller's style prop
      // clobber the entire centering — leaving the dialog invisibly
      // pinned at viewport (0,0).
      style={{ position: 'fixed', zIndex: 11001, left: '50%', top: '50%', transform: 'translate(-50%, -50%)', ...callerStyle }}
      className={cn(
        "bg-white rounded-xl shadow-xl flex flex-col overflow-hidden",
        "w-[calc(100vw-2rem)] max-w-lg",
        // 75vh leaves clearance for the 74px minimized timer bar
        // (z-index 12000). Without this, tall dialogs would extend
        // behind the bar on shorter screens.
        "max-h-[var(--modal-max-height,75vh)]",
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        className
      )}
      // Forms close ONLY via the X button (DialogPrimitive.Close
      // below) or by an explicit onClose call from the caller's save
      // handler. Outside-click and Escape are both prevented by
      // default. Callers can override by passing their own
      // onPointerDownOutside / onInteractOutside / onEscapeKeyDown
      // that DOES NOT preventDefault.
      onPointerDownOutside={(e) => {
        e.preventDefault();
        if (isFromTimerBar(e)) return;
        onPointerDownOutside?.(e);
      }}
      onInteractOutside={(e) => {
        e.preventDefault();
        if (isFromTimerBar(e)) return;
        onInteractOutside?.(e);
      }}
      onEscapeKeyDown={(e) => { e.preventDefault(); }}
      {...props}
    >
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-6" style={{ WebkitOverflowScrolling: 'touch' }}>
        {/* Mini timer controls inside the scroll area so they're always
            tappable when a tabata is minimized. Renders null otherwise. */}
        <MiniTimerBar />
        {children}
      </div>
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({ className, ...props }) => (
  <div className={cn("flex flex-col space-y-1.5 text-right", className)} {...props} />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({ className, ...props }) => (
  <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn("text-lg font-semibold leading-none tracking-tight", className)} {...props} />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
