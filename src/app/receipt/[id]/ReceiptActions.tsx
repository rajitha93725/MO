"use client";

import { useEffect } from "react";
import { RECEIPT_MARGIN_MM, pxToMm, receiptPageCss, receiptPaperHeight } from "@/lib/receipt";

export interface PaperSize {
  widthMm: number;
  /** 0 = as long as the receipt (roll paper). */
  heightMm: number;
  fontPx: number;
  /** Longest page for roll paper (mm). */
  maxPageMm: number;
}

/**
 * Sets the exact paper size (width × measured receipt length, or the label height) and opens the print dialog.
 * Without an exact length Chrome picks A4/Letter and shrinks the receipt.
 */
function printAtPaperSize({ widthMm, heightMm, fontPx, maxPageMm }: PaperSize) {
  const el = document.querySelector<HTMLElement>(".receipt");
  const inner = widthMm - 2 * RECEIPT_MARGIN_MM;
  let contentMm = 0;
  if (el) {
    // Measure at the printed width, without the on-screen border and padding.
    const old = el.getAttribute("style") ?? "";
    el.setAttribute("style", `width:${inner}mm;padding:0;border:0;--receipt-font:${fontPx}px`);
    contentMm = pxToMm(el.getBoundingClientRect().height);
    el.setAttribute("style", old);
  }
  const h = receiptPaperHeight(heightMm, contentMm, maxPageMm);
  let style = document.getElementById("receipt-paper") as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = "receipt-paper";
    document.head.appendChild(style);
  }
  style.textContent = `@media print { ${receiptPageCss(widthMm, h, fontPx)} html, body { width: ${inner}mm !important; min-width: 0 !important; margin: 0 !important; padding: 0 !important; background: #fff !important; } .receipt { width: ${inner}mm !important; max-width: none !important; } }`;
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
