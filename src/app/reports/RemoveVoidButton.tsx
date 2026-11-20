"use client";
import { deleteVoidedItem } from "@/app/actions";
import { useAction } from "@/components/ui";

export function RemoveVoidButton({ lineId, item }: { lineId: string; item: string }) {
  const { pending, call, ui } = useAction();
  return (
    <>
      <button
        className="small danger"
        disabled={pending}
        onClick={() => confirm(`Remove the voided "${item}" from the record?`) && call(() => deleteVoidedItem(lineId))}
        aria-label="Remove voided item"
      >
        ✕
      </button>
      {ui}
    </>
  );
}
