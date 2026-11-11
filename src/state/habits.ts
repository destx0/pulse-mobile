// A habit write's follow-up: refresh the screens, and redraw any home-screen widgets without waiting for the next
// Android refresh. The widget module is native; tests never import this file, they call the actions directly.
import { refreshHabitWidgets } from "@/widgets/update";
import { dataChanged } from "./app";

export function habitsChanged(): void {
  dataChanged("habits");
  void refreshHabitWidgets();
}
