import { useItems, useToday } from "../../core";
import { CompletedGroup, useDoubleClickGuard } from "../../ui";
import { AddTaskForm, TaskList } from "./components";
import { TASK } from "./model";

/**
 * Dashboard tile: overdue + today's open tasks, with quick add. A checked task leaves the
 * list at once (the next moves up into its place) and folds into "✓ N completed".
 */
export function TodayTasksWidget() {
  const today = useToday();
  const overdue = useItems({ type: TASK, status: "open", before: today });
  const dueToday = useItems({ type: TASK, status: "open", on: today });
  const doneToday = useItems({ type: TASK, status: "done", completedOn: today });
  const guard = useDoubleClickGuard();

  return (
    <div>
      <AddTaskForm defaultDate={today} compact />
      <div {...guard}>
        <TaskList tasks={[...overdue, ...dueToday]} empty={doneToday.length ? "All done for today." : "Nothing due today."} />
      </div>
      <CompletedGroup count={doneToday.length} id="tasks-done">
        <TaskList tasks={doneToday} />
      </CompletedGroup>
    </div>
  );
}
