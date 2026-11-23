"use client";

import { kitchenTicketHtml, receiptHtml, receiptPageCss, receiptPaperHeight, type ReceiptOrder, type ReceiptSettings } from "@/lib/receipt";

/**
 * Print a receipt without leaving the current screen.
 * The receipt is placed in a print-only box; while printing, everything else on the page is hidden.
 * The box is removed when the print dialog closes.
 */
export function printReceipt(order: ReceiptOrder, settings: ReceiptSettings, kind: "receipt" | "kitchen" | "kitchen-addon" = "receipt") {
  document.getElementById("bg-print")?.remove();
  document.getElementById("bg-print-style")?.remove();

  const style = document.createElement("style");
  style.id = "bg-print-style";
  const h = receiptPaperHeight(settings.receipt_height_mm, settings.receipt_max_page_mm);
  style.textContent = `
    #bg-print { display: none; }
    @media print {
      ${receiptPageCss({ widthMm: settings.receipt_width_mm, heightMm: h, fontPx: settings.receipt_font_px, leftMm: settings.receipt_left_mm })}
      body > *:not(#bg-print) { display: none !important; }
      #bg-print { display: block !important; }
    }`;
  const box = document.createElement("div");
  box.id = "bg-print";
  box.innerHTML = `<div class="receipt">${kind === "receipt" ? receiptHtml(order, settings) : kitchenTicketHtml(order, kind === "kitchen-addon")}</div>`;
  document.head.appendChild(style);
  document.body.appendChild(box);

  const cleanup = () => {
    box.remove();
    style.remove();
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  // Wait for the logo (at most 2 s), let the browser lay out the receipt, then open the dialog.
  const imgs = Array.from(box.querySelectorAll("img"));
  const loaded = Promise.all(imgs.map((img) => (img.complete ? Promise.resolve() : new Promise<void>((res) => { img.onload = img.onerror = () => res(); }))));
  Promise.race([loaded, new Promise((res) => setTimeout(res, 2000))]).then(() =>
    requestAnimationFrame(() => setTimeout(() => window.print(), 50)),
  );
}
