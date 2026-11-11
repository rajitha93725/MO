"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions";
import { toCsv } from "./csv";

export function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="MO">
      <rect width="100" height="100" rx="22" fill="#E8411E" />
      <g transform="rotate(-7 50 50)" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <g stroke="#111">
          <path d="M13 70 L21 29 L33 53 L45 29 L51 70" strokeWidth="17" />
          <ellipse cx="73" cy="50" rx="13" ry="19" strokeWidth="17" />
          <path d="M21 76 L21 84 M51 76 L51 88 M80 72 L80 80" strokeWidth="6" />
        </g>
        <g stroke="#fff">
          <path d="M13 70 L21 29 L33 53 L45 29 L51 70" strokeWidth="8.5" />
          <ellipse cx="73" cy="50" rx="13" ry="19" strokeWidth="8.5" />
        </g>
      </g>
    </svg>
  );
}

/** Tap-to-open formula tooltip (works on phones, unlike title=). */
export function Tip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open]);
  return (
    <span className="tip" ref={ref}>
      <button type="button" aria-label="How is this calculated?" aria-expanded={open} onClick={() => setOpen((o) => !o)} title={text}>
        i
      </button>
      {open && <span className="bubble" role="tooltip">{text}</span>}
    </span>
  );
}

export function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2200);
    return () => clearTimeout(t);
  }, [message, onDone]);
  return <div className="toast" role="status">{message}</div>;
}

export function Errors({ errors }: { errors: string[] }) {
  if (!errors.length) return null;
  return (
    <div className="errors" role="alert">
      <ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul>
    </div>
  );
}

/** Wraps a server action with pending state, error list and a toast. */
export function useAction() {
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<string[]>([]);
  const [toast, setToast] = useState("");
  const call = (fn: () => Promise<ActionResult>, onOk?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        setErrors([]);
        setToast(r.message ?? "Saved");
        onOk?.();
      } else setErrors(r.errors);
    });
  const ui = (
    <>
      <Errors errors={errors} />
      {toast && <Toast message={toast} onDone={() => setToast("")} />}
    </>
  );
  return { pending, call, ui, errors };
}

export function formToObject(form: HTMLFormElement): Record<string, string> {
  const o: Record<string, string> = {};
  new FormData(form).forEach((v, k) => (o[k] = String(v)));
  return o;
}

// ---------- CSV export ----------

export function CsvButton({ filename, headers, rows }: { filename: string; headers: string[]; rows: (string | number | boolean | null | undefined)[][] }) {
  const download = () => {
    const blob = new Blob(["﻿" + toCsv(headers, rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <button type="button" className="small" onClick={download}>
      ⤓ CSV
    </button>
  );
}
