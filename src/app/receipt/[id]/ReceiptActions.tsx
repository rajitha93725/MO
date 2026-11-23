"use client";

import { useEffect } from "react";
import { receiptPageCss, receiptPaperHeight } from "@/lib/receipt";

export interface PaperSize {
  widthMm: number;
  /** 0 = as long as the receipt (roll paper). */
  heightMm: number;
  fontPx: number;
  /** Longest page for roll paper (mm). */
  maxPageMm: number;
  leftMm: number;
}

/** Sets the paper size (same page length for every bill, so the text size never changes) and opens the print dialog. */
function printAtPaperSize({ widthMm, heightMm, fontPx, maxPageMm, leftMm }: PaperSize) {
  let style = document.getElementById("receipt-paper") as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = "receipt-paper";
    document.head.appendChild(style);
  }
  style.textContent = `@media print { ${receiptPageCss({ widthMm, heightMm: receiptPaperHeight(heightMm, maxPageMm), fontPx, leftMm })} }`;
  window.print();
}

/** Opens the print dialog once, right after the receipt has rendered. */
export function AutoPrint({ paper }: { paper: PaperSize }) {
  useEffect(() => {
    const t = setTimeout(() => printAtPaperSize(paper), 300);
    // Drop ?print=1 so a refresh or "back" does not print again.
    window.history.replaceState(null, "", window.location.pathname);
    return () => clearTimeout(t);
  }, [paper]);
  return null;
}

export function PrintReceiptButton({ paper }: { paper: PaperSize }) {
  return (
    <button type="button" onClick={() => printAtPaperSize(paper)}>
      🖨 Print receipt
    </button>
  );
}
