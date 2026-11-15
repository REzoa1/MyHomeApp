export interface Chore {
  id: string;
  title: string;
  description: string;
  intervalDays: number;
  lastCompletedAt: string | null;
  nextDueDate: string;
  completionHistory: string[];
  active: boolean;
  demo?: boolean;
}

const MILLISECONDS_PER_DAY = 86_400_000;

export interface ChoreDraft {
  title: string;
  description: string;
  intervalDays: number;
  nextDueDate: string;
}

export const STORAGE_KEY = "myhomeapp.chores.v1";

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function fromDateKey(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

export function isDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = fromDateKey(value);
  return !Number.isNaN(date.getTime()) && toDateKey(date) === value;
}

export function addDays(value: string, days: number): string {
  const date = fromDateKey(value);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

export function daysBetween(from: string, to: string): number {
  return Math.round(
    (fromDateKey(to).getTime() - fromDateKey(from).getTime()) / MILLISECONDS_PER_DAY
  );
}

export function formatDate(value: string, options?: Intl.DateTimeFormatOptions): string {
  return fromDateKey(value).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    ...options,
  });
}

export function dateLabel(date: string, today: string): string {
  const difference = daysBetween(today, date);
  if (difference === 0) return "Сегодня";
  if (difference === 1) return "Завтра";
  if (difference === -1) return "Вчера";
  if (difference < 0) return `${Math.abs(difference)} дн. назад`;
  if (difference < 7) return `Через ${difference} дн.`;
  return formatDate(date);
}

export function createDemoChores(today: string): Chore[] {
  return [
    {
      id: "demo-towels",
      title: "Постирать полотенца",
      description: "Баня и кухня",
      intervalDays: 7,
      lastCompletedAt: addDays(today, -8),
      nextDueDate: addDays(today, -1),
      completionHistory: [addDays(today, -8), addDays(today, -15), addDays(today, -22)],
      active: true,
      demo: true,
    },
    {
      id: "demo-surfaces",
      title: "Протереть поверхности",
      description: "Кухня и основные комнаты",
      intervalDays: 5,
      lastCompletedAt: addDays(today, -6),
      nextDueDate: addDays(today, -1),
      completionHistory: [addDays(today, -6), addDays(today, -11), addDays(today, -16)],
      active: true,
      demo: true,
    },
    {
      id: "demo-vacuum",
      title: "Пропылесосить",
      description: "",
      intervalDays: 5,
      lastCompletedAt: addDays(today, -4),
      nextDueDate: today,
      completionHistory: [addDays(today, -4), addDays(today, -9), addDays(today, -14)],
      active: true,
      demo: true,
    },
    {
      id: "demo-bedding",
      title: "Постирать постельное бельё",
      description: "",
      intervalDays: 14,
      lastCompletedAt: addDays(today, -11),
      nextDueDate: addDays(today, 3),
      completionHistory: [addDays(today, -11), addDays(today, -25), addDays(today, -39)],
      active: true,
      demo: true,
    },
    {
      id: "demo-bathroom",
      title: "Помыть ванную",
      description: "",
      intervalDays: 10,
      lastCompletedAt: addDays(today, -3),
      nextDueDate: addDays(today, 7),
      completionHistory: [addDays(today, -3), addDays(today, -13)],
      active: true,
      demo: true,
    },
    {
      id: "demo-bed",
      title: "Сменить комплект белья",
      description: "Сейчас на кровати зелёный комплект",
      intervalDays: 14,
      lastCompletedAt: addDays(today, -7),
      nextDueDate: addDays(today, 7),
      completionHistory: [addDays(today, -7), addDays(today, -21)],
      active: false,
      demo: true,
    },
  ];
}

export function readChores(today: string): { chores: Chore[]; error: string | null } {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return { chores: createDemoChores(today), error: null };

    const parsed: unknown = JSON.parse(saved);
    if (!Array.isArray(parsed) || !parsed.every(isChore)) {
      throw new Error("Сохранённые данные имеют неверный формат.");
    }
    return { chores: parsed, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось прочитать данные.";
    return { chores: createDemoChores(today), error: message };
  }
}

function isChore(value: unknown): value is Chore {
  if (!value || typeof value !== "object") return false;
  const chore = value as Record<string, unknown>;
  return (
    typeof chore.id === "string" &&
    typeof chore.title === "string" &&
    typeof chore.description === "string" &&
    typeof chore.intervalDays === "number" &&
    Number.isInteger(chore.intervalDays) &&
    chore.intervalDays > 0 &&
    chore.intervalDays <= 365 &&
    (chore.lastCompletedAt === null || isDateKey(chore.lastCompletedAt)) &&
    isDateKey(chore.nextDueDate) &&
    Array.isArray(chore.completionHistory) &&
    chore.completionHistory.every(isDateKey) &&
    typeof chore.active === "boolean" &&
    (chore.demo === undefined || typeof chore.demo === "boolean")
  );
}

export function planRecovery(
  chores: Chore[],
  today: string
): Array<{ choreId: string; date: string }> {
  const overdue = chores
    .filter((chore) => chore.active && chore.nextDueDate <= today)
    .sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate));
  const assignments = new Map<string, number>();
  chores
    .filter((chore) => chore.active && chore.nextDueDate > today)
    .forEach((chore) => {
      assignments.set(chore.nextDueDate, (assignments.get(chore.nextDueDate) ?? 0) + 1);
    });

  let date = today;
  const plan: Array<{ choreId: string; date: string }> = [];
  overdue.forEach((chore) => {
    while (
      fromDateKey(date).getDay() === 0 ||
      fromDateKey(date).getDay() === 6 ||
      (assignments.get(date) ?? 0) >= 2
    ) {
      date = addDays(date, 1);
    }
    plan.push({ choreId: chore.id, date });
    assignments.set(date, (assignments.get(date) ?? 0) + 1);
  });
  return plan;
}
