import { requirePage } from "@/lib/auth";
import { repo } from "@/lib/data/repo";
import { today } from "@/lib/today";
import { activeTodos, doneTodos, todoUrgency } from "@/lib/calc/daily";
import { addDays } from "@/lib/calc/dates";
import { StorageError } from "@/components/StorageError";
import { TodoManager } from "./TodoManager";

export default async function TodoPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const user = await requirePage("any");
  try {
    const [allTodos, settings, villaRows] = await Promise.all([repo.todos(), repo.settings(), repo.villa()]);
    // Villa bookings, and tasks linked to them, are for the owner only.
    const todos = user.owner ? allTodos : allTodos.filter((td) => !td.booking_id);
    const villa = user.owner ? villaRows : [];
    const t = today(settings);
    const view = (await searchParams).view === "done" ? "done" : "active";
    const list = (view === "done" ? doneTodos(todos) : activeTodos(todos)).map((td) => ({ ...td, urgency: todoUrgency(td, t, settings) }));
    // Bookings that can be linked to a task: not cancelled, checking out within the last 30 days or later.
    const bookings = villa
      .filter((r) => r.record_type === "Booking")
      .map((b) => ({
        id: b.record_id,
        label: `${b.room_number} · ${b.check_in} → ${b.check_out} · ${b.guest_name || b.platform}`,
        linkable: b.status !== "Cancelled" && b.check_out >= addDays(t, -30),
        month: b.check_in.slice(0, 7),
      }));
    return (
      <TodoManager
        list={list}
        view={view}
        today={t}
        amberDays={settings.todo_amber_days}
        isPartner={user.role === "partner"}
        counts={{ active: activeTodos(todos).length, done: doneTodos(todos).length }}
        bookings={bookings}
        showBookings={user.owner}
      />
    );
  } catch (e) {
    return <StorageError error={e} />;
  }
}
