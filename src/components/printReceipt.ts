"use client";

import { RECEIPT_MARGIN_MM, kitchenTicketHtml, pxToMm, receiptHtml, receiptPageCss, receiptPaperHeight, type ReceiptOrder, type ReceiptSettings } from "@/lib/receipt";

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
  const w = settings.receipt_width_mm;
  const inner = w - 2 * RECEIPT_MARGIN_MM;
  // On screen the receipt is laid out off-screen at the paper width, so its length can be measured.
  const screenCss = `#bg-print { position: fixed; left: -10000px; top: 0; width: ${inner}mm; visibility: hidden; }
    #bg-print .receipt { width: auto; max-width: none; border: 0; padding: 0;${settings.receipt_font_px ? ` --receipt-font: ${settings.receipt_font_px}px;` : ""} }`;
  const printCss = (h: number) => `
    @media print {
      ${receiptPageCss(w, h, settings.receipt_font_px)}
      html, body { width: ${inner}mm !important; min-width: 0 !important; }
      body > *:not(#bg-print) { display: none !important; }
      body { background: #fff !important; padding: 0 !important; margin: 0 !important; }
      #bg-print { position: static !important; left: auto; width: ${inner}mm; visibility: visible; display: block !important; }
    }`;
  style.textContent = screenCss;
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
    requestAnimationFrame(() =>
      setTimeout(() => {
        const h = receiptPaperHeight(settings.receipt_height_mm, pxToMm(box.getBoundingClientRect().height));
        style.textContent = screenCss + printCss(h);
        window.print();
      }, 50),
    ),
  );
}
