import { useState } from "react";
import { todayKey, useItems } from "../../core";
import { AddTaskForm, TaskList } from "./components";
import { TASK } from "./model";

export function TasksPage() {
  const today = todayKey();
  const [showDone, setShowDone] = useState(false);

  const overdue = useItems({ type: TASK, status: "open", before: today });
  const dueToday = useItems({ type: TASK, status: "open", on: today });
  const upcoming = useItems({ type: TASK, status: "open", after: today });
  const someday = useItems({ type: TASK, status: "open", scheduled: false });
  const done = useItems({ type: TASK, status: "done" });

  const nothingOpen = overdue.length + dueToday.length + upcoming.length + someday.length === 0;

  return (
    <div className="page">
      <header className="page-header">
        <h1>Tasks</h1>
      </header>
      <AddTaskForm />

      {nothingOpen && <p className="muted empty-state">No open tasks. Add one above.</p>}
      <Section title="Overdue" tasks={overdue} />
      <Section title="Today" tasks={dueToday} />
      <Section title="Upcoming" tasks={upcoming} />
      <Section title="No date" tasks={someday} />

      {done.length > 0 && (
        <section className="section">
          <button className="link-btn" onClick={() => setShowDone((s) => !s)}>
            {showDone ? "Hide" : "Show"} completed ({done.length})
          </button>
          {showDone && <TaskList tasks={[...done].reverse()} />}
        </section>
      )}
    </div>
  );
}

function Section({ title, tasks }: { title: string; tasks: ReturnType<typeof useItems> }) {
  if (tasks.length === 0) return null;
  return (
    <section className="section">
      <h2 className="section-title">
        {title} <span className="count">{tasks.length}</span>
      </h2>
      <TaskList tasks={tasks} />
    </section>
  );
}
