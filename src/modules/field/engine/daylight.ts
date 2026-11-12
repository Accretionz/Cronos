/**
 * How dark the field is at a given local time: 0 = day, 1 = night.
 * Dusk fades in from 6:00 to 8:30 pm, dawn fades out from 5:00 to 7:00 am.
 */
export function darknessAt(date: Date): number {
  const h = date.getHours() + date.getMinutes() / 60;
  if (h >= 7 && h < 18) return 0;
  if (h >= 18 && h < 20.5) return (h - 18) / 2.5;
  if (h >= 5 && h < 7) return 1 - (h - 5) / 2;
  return 1;
}

/** Pokémon behave as if it's night (sleep more) once it's mostly dark. */
export const isNight = (darkness: number) => darkness >= 0.6;

export function timeOfDayLabel(darkness: number, date: Date): "Day" | "Dusk" | "Night" | "Dawn" {
  if (darkness <= 0) return "Day";
  if (darkness >= 1) return "Night";
  return date.getHours() < 12 ? "Dawn" : "Dusk";
}
