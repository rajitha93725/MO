"use client";

import { receiptHtml, receiptPageCss, type ReceiptOrder, type ReceiptSettings } from "@/lib/receipt";

/**
 * Print a receipt without leaving the current screen.
 * The receipt is placed in a print-only box; while printing, everything else on the page is hidden.
 * The box is removed when the print dialog closes.
 */
export function printReceipt(order: ReceiptOrder, settings: ReceiptSettings) {
  document.getElementById("bg-print")?.remove();
  document.getElementById("bg-print-style")?.remove();

  const style = document.createElement("style");
  style.id = "bg-print-style";
  style.textContent = `
    #bg-print { display: none; }
    @media print {
      ${receiptPageCss(settings.receipt_width_mm)}
      body > *:not(#bg-print) { display: none !important; }
      body { background: #fff !important; padding: 0 !important; margin: 0 !important; }
      #bg-print { display: block !important; }
      #bg-print .receipt { width: auto; max-width: none; border: 0; padding: 0; }
    }`;
  const box = document.createElement("div");
  box.id = "bg-print";
  box.innerHTML = `<div class="receipt">${receiptHtml(order, settings)}</div>`;
  document.head.appendChild(style);
  document.body.appendChild(box);

  const cleanup = () => {
    box.remove();
    style.remove();
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  // Let the browser lay out the receipt before opening the dialog.
  requestAnimationFrame(() => setTimeout(() => window.print(), 50));
}
