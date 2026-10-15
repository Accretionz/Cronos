import { useState, type FormEvent } from "react";
import { formatDay, todayKey, useCore, dayOf, type Item } from "../../core";
import { TASK, type Priority, type Task, type TaskData } from "./model";

export function AddTaskForm({ defaultDate = "", compact = false }: { defaultDate?: string; compact?: boolean }) {
  const { store } = useCore();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [priority, setPriority] = useState<Priority>("normal");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await store.create<TaskData>({
      type: TASK,
      title,
      scheduledFor: date || undefined,
      data: { priority },
    });
    setTitle("");
  };

  return (
    <form className="add-form" onSubmit={submit}>
      <input
        className="add-input"
        placeholder={compact ? "Add a task for today…" : "Add a task…"}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        aria-label="Task title"
      />
      {!compact && (
        <>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
          <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} aria-label="Priority">
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
          </select>
        </>
      )}
      <button type="submit" className="btn-primary" disabled={!title.trim()}>
        Add
      </button>
    </form>
  );
}

export function TaskRow({ task }: { task: Item }) {
  const { store } = useCore();
  const t = task as Task;
  const done = t.status === "done";
  const day = t.scheduledFor ? dayOf(t.scheduledFor) : null;
  const overdue = !done && day !== null && day < todayKey();
  const priority = t.data.priority ?? "normal";

  return (
    <li className={`task-row${done ? " is-done" : ""}`}>
      <button
        className="check"
        role="checkbox"
        aria-checked={done}
        aria-label={done ? "Mark as not done" : "Mark as done"}
        onClick={() => (done ? store.reopen(t.id) : store.complete(t.id))}
      >
        {done ? "✓" : ""}
      </button>
      <span className="task-title">{t.title}</span>
      {priority !== "normal" && <span className={`pill pill-${priority}`}>{priority}</span>}
      {day && <span className={`pill${overdue ? " pill-overdue" : ""}`}>{formatDay(day)}</span>}
      <button className="icon-btn" aria-label="Delete task" onClick={() => store.remove(t.id)}>
        ×
      </button>
    </li>
  );
}

export function TaskList({ tasks, empty }: { tasks: Item[]; empty?: string }) {
  if (tasks.length === 0) return empty ? <p className="muted">{empty}</p> : null;
  return (
    <ul className="task-list">
      {tasks.map((t) => (
        <TaskRow key={t.id} task={t} />
      ))}
    </ul>
  );
}
