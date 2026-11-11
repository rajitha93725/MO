"use client";

import { useEffect } from "react";

/** Opens the print dialog once, right after the receipt has rendered. */
export function AutoPrint() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 300);
    // Drop ?print=1 so a refresh or "back" does not print again.
    window.history.replaceState(null, "", window.location.pathname);
    return () => clearTimeout(t);
  }, []);
  return null;
}

export function PrintReceiptButton() {
  return (
    <button type="button" onClick={() => window.print()}>
      🖨 Print receipt
    </button>
  );
}
