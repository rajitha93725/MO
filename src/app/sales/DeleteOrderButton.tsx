"use client";
import { deleteOrder } from "@/app/actions";
import { useAction } from "@/components/ui";

export function DeleteOrderButton({ orderId }: { orderId: string }) {
  const { pending, call, ui } = useAction();
  return (
    <>
      <button className="small danger" disabled={pending} onClick={() => confirm("Delete this whole order?") && call(() => deleteOrder(orderId))} aria-label="Delete order">
        ✕
      </button>
      {ui}
    </>
  );
}
