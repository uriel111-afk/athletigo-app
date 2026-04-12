import React from "react";
import { Loader2 } from "lucide-react";

/**
 * Consistent loading indicator for pages.
 * Shows a centered spinner with optional message.
 * Use this instead of inline Loader2 for page-level loading states.
 */
export default function PageLoader({ message = "טוען..." }) {
  return (
    <div className="flex flex-col items-center justify-center py-20" dir="rtl">
      <Loader2 className="w-10 h-10 animate-spin text-[#FF6F20] mb-3" />
      <p className="text-sm font-bold text-gray-400">{message}</p>
    </div>
  );
}
