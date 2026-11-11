"use client";
import { useRef, useState } from "react";
import { saveTodo, setTodoDone } from "@/app/actions";
import { CsvButton, formToObject, useAction } from "@/components/ui";
import { HEADERS } from "@/lib/data/schema";
import { PRIORITIES, type Todo } from "@/lib/types";
import type { TodoUrgency } from "@/lib/calc/daily";

type Row = Todo & { urgency: TodoUrgency };

type BookingOption = { id: string; label: string; linkable: boolean; month: string };

export function TodoManager({ list, view, today, amberDays, isPartner, counts, bookings, showBookings }: {
  list: Row[]; view: "active" | "done"; today: string; amberDays: number; isPartner: boolean; counts: { active: number; done: number };
  bookings: BookingOption[];
  /** Only the owner sees villa bookings. */
  showBookings: boolean;
}) {
  const [editing, setEditing] = useState<Todo | null>(null);
  const ref = useRef<HTMLFormElement>(null);
  const { pending, call, ui } = useAction();
  return (
    <div className="stack">
      <div className="spread">
        <h1 style={{ margin: 0 }}>To-do</h1>
        <CsvButton filename={`todo-${view}`} headers={HEADERS.todo} rows={list.map((t) => HEADERS.todo.map((h) => (t as any)[h]))} />
      </div>
      <div className="seg">
        <a className={`btn ${view === "active" ? "primary" : ""}`} href="/todo">Active ({counts.active})</a>
        <a className={`btn ${view === "done" ? "primary" : ""}`} href="/todo?view=done">Done ({counts.done})</a>
      </div>

      {isPartner && view === "active" && (
        <form
          ref={ref}
          key={editing?.task_id ?? "new"}
          className="card form-grid"
          onSubmit={(e) => {
            e.preventDefault();
            const f = formToObject(e.currentTarget);
            call(() => saveTodo(f), () => { setEditing(null); ref.current?.reset(); });
          }}
        >
          <input type="hidden" name="task_id" defaultValue={editing?.task_id ?? ""} />
          <label className="field full"><span>{editing ? "Edit task" : "New task"}</span><input name="task" required defaultValue={editing?.task ?? ""} placeholder="What needs doing?" /></label>
          <label className="field"><span>Owner</span>
            <select name="owner" defaultValue={editing?.owner ?? "Rajitha"}>{["Rajitha", "Janith", "Staff"].map((o) => <option key={o}>{o}</option>)}</select>
          </label>
          <label className="field"><span>Priority</span>
            <select name="priority" defaultValue={editing?.priority ?? "Medium"}>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select>
          </label>
          <label className="field"><span>Due date</span><input type="date" name="due_date" required defaultValue={editing?.due_date ?? today} /></label>
          {showBookings && (
            <label className="field"><span>Villa booking (optional)</span>
              <select name="booking_id" defaultValue={editing?.booking_id ?? ""}>
                <option value="">— none —</option>
                {bookings.filter((b) => b.linkable || b.id === editing?.booking_id).map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
              </select>
            </label>
          )}
          <div className="row full">
            <button className="primary" disabled={pending} style={{ flex: 1 }}>{editing ? "Update task" : "Add task"}</button>
            {editing && <button type="button" onClick={() => setEditing(null)}>Cancel</button>}
          </div>
        </form>
      )}
      {ui}

      {view === "active" && <p className="small muted" style={{ margin: 0 }}>Red = overdue · amber = due within {amberDays} days (Settings: todo_amber_days).</p>}
      <div className="list">
        {list.length === 0 && <span className="muted">{view === "done" ? "No completed tasks." : "Nothing to do 🎉"}</span>}
        {list.map((t) => (
          <div key={t.task_id} className={`item ${t.urgency}`}>
            {isPartner && (
              <input
                type="checkbox"
                checked={t.done}
                disabled={pending}
                aria-label={t.done ? `Reopen ${t.task}` : `Mark ${t.task} done`}
                onChange={(e) => call(() => setTodoDone(t.task_id, e.target.checked))}
              />
            )}
            <div className="grow">
              <div style={{ textDecoration: t.done ? "line-through" : undefined }}>{t.task}</div>
              <div className="small muted">
                {t.owner} · due {t.due_date} · <span className={`badge ${t.priority === "High" ? "bad" : t.priority === "Medium" ? "warn" : ""}`}>{t.priority}</span>
                {t.done && <> · <span className="badge good">Done {t.done_date}</span></>}
              </div>
              {t.booking_id && (() => {
                const b = bookings.find((x) => x.id === t.booking_id);
                return (
                  <div className="small">
                    🛏 {b ? <a href={`/villa?view=bookings&month=${b.month}&edit=${b.id}`}>{b.label}</a> : <span className="muted">booking {t.booking_id} (deleted)</span>}
                  </div>
                );
              })()}
            </div>
            {t.urgency === "overdue" && <span className="badge bad">Overdue</span>}
            {t.urgency === "soon" && <span className="badge warn">Soon</span>}
            {isPartner && !t.done && <button className="small" onClick={() => { setEditing(t); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Edit</button>}
            {isPartner && t.done && <button className="small" disabled={pending} onClick={() => call(() => setTodoDone(t.task_id, false))}>Reopen</button>}
          </div>
        ))}
      </div>
    </div>
  );
}
