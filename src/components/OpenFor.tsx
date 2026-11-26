"use client";

import { useEffect, useState } from "react";
import { durationLabel } from "@/lib/calc/bills";

/** How long a bill has been open. Starts from the server's minutes and keeps counting while the page is open. */
export function OpenFor({ minutes }: { minutes: number }) {
  const [extra, setExtra] = useState(0);
  useEffect(() => {
    const start = Date.now();
    setExtra(0);
    const id = setInterval(() => setExtra(Math.floor((Date.now() - start) / 60000)), 30000);
    return () => clearInterval(id);
  }, [minutes]);
  const m = minutes + extra;
  return <span title={`Open for ${durationLabel(m)}`} className={`open-for${m >= 90 ? " open-long" : ""}`}><span className="ico" aria-hidden>⏱ </span>{durationLabel(m)}</span>;
}
