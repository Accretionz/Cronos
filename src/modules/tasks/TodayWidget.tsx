import { todayKey, useItems } from "../../core";
import { AddTaskForm, TaskList } from "./components";
import { TASK } from "./model";

/** Dashboard tile: overdue + today's open tasks, with quick add. */
export function TodayTasksWidget() {
  const today = todayKey();
  const overdue = useItems({ type: TASK, status: "open", before: today });
  const dueToday = useItems({ type: TASK, status: "open", on: today });
  const doneToday = useItems({ type: TASK, status: "done", completedOn: today });

  return (
    <div>
      <AddTaskForm defaultDate={today} compact />
      <TaskList tasks={[...overdue, ...dueToday]} empty="Nothing due today." />
      {doneToday.length > 0 && <TaskList tasks={doneToday} />}
    </div>
  );
}
