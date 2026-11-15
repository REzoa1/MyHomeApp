import { FormEvent, useMemo, useState } from "react";
import {
  addDays,
  Chore,
  ChoreDraft,
  dateLabel,
  daysBetween,
  formatDate,
  fromDateKey,
  isDateKey,
  planRecovery,
  readChores,
  startOfWeek,
  STORAGE_KEY,
  toDateKey,
} from "./model/chores";
import quietCat from "./assets/quiet-cat.png";
import "./chores.css";

type ModalState =
  | { type: "edit"; chore?: Chore; initialDate?: string }
  | { type: "history"; chore: Chore }
  | { type: "reschedule"; chore: Chore; initialDate?: string }
  | { type: "move"; date: string }
  | { type: "details"; chore: Chore }
  | null;

type ActiveView = "today" | "week" | "history" | "settings" | "all" | "recovery";
type NavigationView = "today" | "week" | "history" | "settings";

const today = toDateKey(new Date());
const weekday = new Intl.DateTimeFormat("ru-RU", { weekday: "long" }).format(new Date());
const shortWeekday = new Intl.DateTimeFormat("ru-RU", { weekday: "short" });

function choreCountLabel(count: number): string {
  const lastTwoDigits = count % 100;
  const lastDigit = count % 10;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return `${count} дел`;
  if (lastDigit === 1) return `${count} дело`;
  if (lastDigit >= 2 && lastDigit <= 4) return `${count} дела`;
  return `${count} дел`;
}

function ChoresPage() {
  const [initial] = useState(() => readChores(today));
  const [chores, setChores] = useState(initial.chores);
  const [storageError, setStorageError] = useState(initial.error);
  const [activeView, setActiveView] = useState<ActiveView>("today");
  const [modal, setModal] = useState<ModalState>(null);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(today));
  const [selectedDate, setSelectedDate] = useState(today);
  const [returnView, setReturnView] = useState<ActiveView>("today");

  const activeChores = chores.filter((chore) => chore.active);
  const todayChores = activeChores.filter(
    (chore) => chore.nextDueDate === today || chore.lastCompletedAt === today
  );
  const overdueChores = activeChores.filter((chore) => chore.nextDueDate < today);
  const upcomingChores = activeChores
    .filter((chore) => chore.nextDueDate > today && chore.nextDueDate <= addDays(today, 7))
    .sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate));
  const doneToday = activeChores.filter((chore) => chore.lastCompletedAt === today).length;
  const currentWeekStart = startOfWeek(today);
  const currentWeekDays = Array.from({ length: 7 }, (_, index) => addDays(currentWeekStart, index));
  const completedThisWeek = chores.reduce(
    (total, chore) =>
      total +
      chore.completionHistory.filter((date) => date >= currentWeekStart && date <= today).length,
    0
  );
  const pendingThisWeek = activeChores.filter(
    (chore) => chore.nextDueDate >= today && chore.nextDueDate <= currentWeekDays[6]
  ).length;
  const totalThisWeek = completedThisWeek + pendingThisWeek;
  const dailyCompletionCounts = currentWeekDays.map((date) =>
    chores.reduce(
      (total, chore) => total + chore.completionHistory.filter((item) => item === date).length,
      0
    )
  );
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
    [weekStart]
  );
  const selectedDayChores = activeChores.filter((chore) => chore.nextDueDate === selectedDate);
  const weekRange = `${formatDate(weekStart, { day: "numeric", month: "short" })} — ${formatDate(
    weekDays[6],
    { day: "numeric", month: "short" }
  )}`;

  function saveChores(next: Chore[]) {
    setChores(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setStorageError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось сохранить данные.";
      setStorageError(`Изменения пока не сохранены: ${message}`);
    }
  }

  function completeChore(chore: Chore) {
    saveChores(
      chores.map((item) =>
        item.id === chore.id
          ? {
              ...item,
              lastCompletedAt: today,
              nextDueDate: addDays(today, item.intervalDays),
              completionHistory: [today, ...item.completionHistory],
              completionUndo: {
                completedAt: today,
                previousNextDueDate: item.nextDueDate,
                previousLastCompletedAt: item.lastCompletedAt,
              },
            }
          : item
      )
    );
    setModal(null);
  }

  function undoCompleteChore(chore: Chore) {
    if (chore.lastCompletedAt !== today || chore.completionHistory[0] !== today) {
      setStorageError("Не удалось снять отметку: последнее выполнение не найдено в истории.");
      return;
    }

    saveChores(
      chores.map((item) => {
        if (item.id !== chore.id) return item;
        const undo = item.completionUndo?.completedAt === today ? item.completionUndo : undefined;
        return {
          ...item,
          lastCompletedAt: undo
            ? undo.previousLastCompletedAt
            : (item.completionHistory[1] ?? null),
          nextDueDate: undo ? undo.previousNextDueDate : today,
          completionHistory: item.completionHistory.slice(1),
          completionUndo: undefined,
        };
      })
    );
    setModal(null);
  }

  function skipCycle(chore: Chore) {
    saveChores(
      chores.map((item) =>
        item.id === chore.id
          ? {
              ...item,
              nextDueDate: addDays(today, item.intervalDays),
              completionUndo: undefined,
            }
          : item
      )
    );
    setModal(null);
  }

  function toggleChore(chore: Chore) {
    saveChores(
      chores.map((item) =>
        item.id === chore.id ? { ...item, active: !item.active, completionUndo: undefined } : item
      )
    );
    setModal(null);
  }

  function deleteChore(chore: Chore) {
    saveChores(chores.filter((item) => item.id !== chore.id));
    setModal(null);
  }

  function saveDraft(draft: ChoreDraft, existing?: Chore) {
    if (existing) {
      saveChores(
        chores.map((chore) =>
          chore.id === existing.id
            ? {
                ...chore,
                title: draft.title.trim(),
                description: draft.description.trim(),
                intervalDays: draft.intervalDays,
                nextDueDate: draft.nextDueDate,
                completionUndo: undefined,
              }
            : chore
        )
      );
    } else {
      const created: Chore = {
        id: crypto.randomUUID(),
        ...draft,
        title: draft.title.trim(),
        description: draft.description.trim(),
        lastCompletedAt: null,
        completionHistory: [],
        active: true,
      };
      saveChores([created, ...chores]);
    }
    setModal(null);
  }

  function saveRescheduledDate(chore: Chore, date: string) {
    if (!date) return;
    saveChores(
      chores.map((item) =>
        item.id === chore.id ? { ...item, nextDueDate: date, completionUndo: undefined } : item
      )
    );
    setModal(null);
  }

  function applyRecoveryPlan(plan: Array<{ choreId: string; date: string }>) {
    const plannedDates = new Map(plan.map((item) => [item.choreId, item.date]));
    saveChores(
      chores.map((chore) =>
        plannedDates.has(chore.id)
          ? {
              ...chore,
              nextDueDate: plannedDates.get(chore.id)!,
              completionUndo: undefined,
            }
          : chore
      )
    );
    setModal(null);
  }

  function openNewChore() {
    const initialDate = activeView === "week" && selectedDate > today ? selectedDate : today;
    setModal({ type: "edit", initialDate });
  }

  function openDetails(chore: Chore) {
    setModal({ type: "details", chore });
  }

  function openHistory(chore: Chore) {
    setModal({ type: "history", chore });
  }

  function openRecovery() {
    setReturnView(activeView === "all" ? "today" : activeView);
    setActiveView("recovery");
    setModal(null);
  }

  function closeRecovery() {
    setActiveView(returnView);
  }

  function openReschedule(chore: Chore) {
    const initialDate =
      activeView === "week" && selectedDate >= today
        ? selectedDate
        : chore.nextDueDate < today
          ? today
          : chore.nextDueDate;
    setModal({ type: "reschedule", chore, initialDate });
  }

  function moveWeek(amount: number) {
    const dayOffset = daysBetween(weekStart, selectedDate);
    const nextStart = addDays(weekStart, amount * 7);
    setWeekStart(nextStart);
    setSelectedDate(addDays(nextStart, dayOffset));
  }

  function returnToCurrentWeek() {
    setWeekStart(startOfWeek(today));
    setSelectedDate(today);
  }

  function clearDemoChores() {
    const demos = chores.filter((chore) => chore.demo);
    if (
      demos.length > 0 &&
      window.confirm("Удалить только демонстрационные дела? Ваши собственные дела останутся.")
    ) {
      saveChores(chores.filter((chore) => !chore.demo));
    }
  }

  const recoveryPlan = useMemo(() => planRecovery(chores, today), [chores]);
  const navigationView: NavigationView =
    activeView === "all" || activeView === "recovery" ? "today" : activeView;
  const renderChoreCard = (chore: Chore) => (
    <ChoreCard
      key={chore.id}
      chore={chore}
      today={today}
      onOpen={() => openDetails(chore)}
      onComplete={() => completeChore(chore)}
      onUndo={() => undoCompleteChore(chore)}
    />
  );

  return (
    <>
      <main className={`page page-${activeView}`}>
        {activeView === "recovery" ? (
          <RecoveryPage
            chores={chores}
            plan={recoveryPlan}
            today={today}
            onClose={closeRecovery}
            onApply={applyRecoveryPlan}
          />
        ) : (
          <>
            {activeView === "today" && (
              <section className="welcome-row">
                <div>
                  <p className="eyebrow">
                    {weekday} · {formatDate(today, { day: "numeric", month: "long" })}
                  </p>
                  <h1>Дом в своём ритме</h1>
                  <p className="welcome-copy">
                    Небольшие дела сегодня — для большего спокойствия завтра.
                  </p>
                </div>
              </section>
            )}

            {storageError && (
              <div className="notice" role="status">
                <span>{storageError}</span>
                <button className="text-button" onClick={() => setStorageError(null)}>
                  Скрыть
                </button>
              </div>
            )}

            <nav className="view-tabs" aria-label="Разделы приложения">
              <NavTab
                view="today"
                activeView={navigationView}
                onSelect={setActiveView}
                label="Дом"
              />
              <NavTab
                view="week"
                activeView={navigationView}
                onSelect={setActiveView}
                label="План"
              />
              <NavTab
                view="history"
                activeView={navigationView}
                onSelect={setActiveView}
                label="История"
              />
              <NavTab
                view="settings"
                activeView={navigationView}
                onSelect={setActiveView}
                label="Настройки"
              />
            </nav>

            {activeView === "today" ? (
              <HomeDashboard
                today={today}
                todayChores={todayChores}
                overdueChores={overdueChores}
                upcomingChores={upcomingChores}
                doneToday={doneToday}
                weeklyDone={completedThisWeek}
                weeklyTotal={totalThisWeek}
                dailyCompletionCounts={dailyCompletionCounts}
                renderChoreCard={renderChoreCard}
                onOpenChore={openDetails}
                onAdd={openNewChore}
                onOpenAll={() => setActiveView("all")}
                onOpenWeek={() => setActiveView("week")}
                onRecovery={openRecovery}
              />
            ) : activeView === "week" ? (
              <section className="week-page">
                <header className="week-heading">
                  <div>
                    <p className="section-kicker">Планирование</p>
                    <h1>План на неделю</h1>
                    <p className="week-range">{weekRange}</p>
                  </div>
                  <div className="week-controls">
                    <button
                      className="week-control"
                      aria-label="Предыдущая неделя"
                      onClick={() => moveWeek(-1)}
                    >
                      ‹
                    </button>
                    <button
                      className="button button-secondary week-today"
                      onClick={returnToCurrentWeek}
                    >
                      Сегодня
                    </button>
                    <button
                      className="week-control"
                      aria-label="Следующая неделя"
                      onClick={() => moveWeek(1)}
                    >
                      ›
                    </button>
                  </div>
                </header>

                {overdueChores.length > 0 && (
                  <div className="week-recovery">
                    <div>
                      <strong>Дела можно распределить по будням</strong>
                      <p>Проверьте предложение — даты изменятся только после подтверждения.</p>
                    </div>
                    <button className="button button-soft" onClick={openRecovery}>
                      План восстановления
                    </button>
                  </div>
                )}

                <div className="week-picker" role="group" aria-label="Дни недели">
                  {weekDays.map((date) => {
                    const count = activeChores.filter((chore) => chore.nextDueDate === date).length;
                    const isSelected = selectedDate === date;
                    const isToday = date === today;
                    const isWeekend = [0, 6].includes(fromDateKey(date).getDay());
                    return (
                      <button
                        key={date}
                        className={`week-day${isSelected ? " selected" : ""}${isToday ? " is-today" : ""}${isWeekend ? " is-weekend" : ""}`}
                        aria-label={`${formatDate(date, { weekday: "long", day: "numeric", month: "long" })}, ${choreCountLabel(count)}`}
                        aria-pressed={isSelected}
                        onClick={() => setSelectedDate(date)}
                      >
                        <span className="week-day-name">
                          {shortWeekday.format(fromDateKey(date)).replace(".", "")}
                        </span>
                        <strong>{Number(date.slice(8, 10))}</strong>
                        <span className="week-day-count">{count > 0 ? count : "·"}</span>
                      </button>
                    );
                  })}
                </div>

                <section className="week-day-panel">
                  <div className="section-heading">
                    <div>
                      <p className="section-kicker">
                        {selectedDate === today ? "Ваш план" : "Выбранный день"}
                      </p>
                      <h2>
                        {formatDate(selectedDate, {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                        })}
                      </h2>
                    </div>
                    <div className="week-day-actions">
                      <span className="section-count">{selectedDayChores.length}</span>
                      <button
                        className="button button-secondary"
                        title={
                          selectedDate < today
                            ? "Выберите сегодня или будущую дату"
                            : activeChores.every((chore) => chore.nextDueDate === selectedDate)
                              ? "Нет других активных дел для переноса"
                              : undefined
                        }
                        disabled={
                          selectedDate < today ||
                          activeChores.every((chore) => chore.nextDueDate === selectedDate)
                        }
                        onClick={() => setModal({ type: "move", date: selectedDate })}
                      >
                        Перенести сюда
                      </button>
                    </div>
                  </div>
                  {selectedDayChores.length > 0 ? (
                    <div className="chore-list">{selectedDayChores.map(renderChoreCard)}</div>
                  ) : (
                    <div className="week-empty">
                      <img className="empty-illustration" src={quietCat} alt="" />
                      <div>
                        <h3>Пока свободно</h3>
                        <p>Оставьте день таким или добавьте дело, когда будет удобно.</p>
                        <button className="button button-secondary" onClick={openNewChore}>
                          Запланировать дело
                        </button>
                      </div>
                    </div>
                  )}
                </section>
              </section>
            ) : activeView === "history" ? (
              <HistoryPage chores={chores} onOpenChore={openHistory} />
            ) : activeView === "settings" ? (
              <SettingsPage
                activeCount={activeChores.length}
                totalCount={chores.length}
                demoCount={chores.filter((chore) => chore.demo).length}
                onOpenAll={() => setActiveView("all")}
                onClearDemo={clearDemoChores}
              />
            ) : (
              <section className="all-chores">
                <div className="all-header">
                  <div>
                    <p className="section-kicker">Ваш список</p>
                    <h1>Все дела</h1>
                  </div>
                  <button className="button button-secondary" onClick={openNewChore}>
                    Добавить дело
                  </button>
                </div>
                {chores.length > 0 ? (
                  <div className="chore-list all-list">
                    {[...chores]
                      .sort(
                        (a, b) =>
                          Number(b.active) - Number(a.active) ||
                          a.nextDueDate.localeCompare(b.nextDueDate)
                      )
                      .map(renderChoreCard)}
                  </div>
                ) : (
                  <div className="empty-card empty-wide">
                    <img className="empty-illustration" src={quietCat} alt="" />
                    <h3>Начните с одного дела</h3>
                    <p>Добавьте то, о чём не хочется помнить вручную.</p>
                    <button className="button button-primary" onClick={openNewChore}>
                      Добавить дело
                    </button>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </main>

      {modal?.type === "edit" && (
        <ChoreForm
          chore={modal.chore}
          initialDate={modal.initialDate}
          onClose={() => setModal(null)}
          onSave={(draft) => saveDraft(draft, modal.chore)}
        />
      )}
      {modal?.type === "reschedule" && (
        <RescheduleDialog
          chore={modal.chore}
          initialDate={modal.initialDate}
          onClose={() => setModal(null)}
          onSave={(date) => saveRescheduledDate(modal.chore, date)}
          onSkip={() => skipCycle(modal.chore)}
          onToggle={() => toggleChore(modal.chore)}
        />
      )}
      {modal?.type === "history" && (
        <HistoryDialog chore={modal.chore} onClose={() => setModal(null)} />
      )}
      {modal?.type === "move" && (
        <MoveChoreDialog
          chores={activeChores}
          date={modal.date}
          today={today}
          onClose={() => setModal(null)}
          onMove={(chore) => saveRescheduledDate(chore, modal.date)}
        />
      )}
      {modal?.type === "details" && (
        <ChoreDetailsSheet
          chore={modal.chore}
          today={today}
          onClose={() => setModal(null)}
          onComplete={() => completeChore(modal.chore)}
          onUndo={() => undoCompleteChore(modal.chore)}
          onEdit={() => setModal({ type: "edit", chore: modal.chore })}
          onReschedule={() => openReschedule(modal.chore)}
          onDelete={() => deleteChore(modal.chore)}
        />
      )}
    </>
  );
}

function NavTab({
  view,
  activeView,
  onSelect,
  label,
}: {
  view: NavigationView;
  activeView: NavigationView;
  onSelect: (view: NavigationView) => void;
  label: string;
}) {
  return (
    <button
      className={`view-tab${activeView === view ? " active" : ""}`}
      aria-current={activeView === view ? "page" : undefined}
      onClick={() => onSelect(view)}
    >
      <NavIcon view={view} />
      <span>{label}</span>
    </button>
  );
}

function NavIcon({ view }: { view: NavigationView }) {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {view === "today" ? (
        <path d="m3.75 10.5 8.25-7 8.25 7M5.75 9v11h12.5V9M9.25 20v-6.5h5.5V20" />
      ) : view === "week" ? (
        <>
          <rect x="4" y="5.5" width="16" height="15" rx="2.5" />
          <path d="M8 3.5v4M16 3.5v4M4 10h16M8 13.5h2M14 13.5h2M8 17h2" />
        </>
      ) : view === "history" ? (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7v5l3 2" />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="m19.4 15 .1.1 1.4 1.1-1.6 2.8-1.7-.7a8 8 0 0 1-1.5.9l-.3 1.8h-3.2l-.3-1.8a8 8 0 0 1-1.5-.9l-1.7.7-1.6-2.8L7 15a7 7 0 0 1 0-1.8l-1.4-1.1 1.6-2.8 1.7.7a8 8 0 0 1 1.5-.9l.3-1.8h3.2l.3 1.8a8 8 0 0 1 1.5.9l1.7-.7 1.6 2.8-1.4 1.1a7 7 0 0 1 0 1.8Z" />
        </>
      )}
    </svg>
  );
}

function HomeDashboard({
  today,
  todayChores,
  overdueChores,
  upcomingChores,
  doneToday,
  weeklyDone,
  weeklyTotal,
  dailyCompletionCounts,
  renderChoreCard,
  onOpenChore,
  onAdd,
  onOpenAll,
  onOpenWeek,
  onRecovery,
}: {
  today: string;
  todayChores: Chore[];
  overdueChores: Chore[];
  upcomingChores: Chore[];
  doneToday: number;
  weeklyDone: number;
  weeklyTotal: number;
  dailyCompletionCounts: number[];
  renderChoreCard: (chore: Chore) => React.ReactNode;
  onOpenChore: (chore: Chore) => void;
  onAdd: () => void;
  onOpenAll: () => void;
  onOpenWeek: () => void;
  onRecovery: () => void;
}) {
  const circumference = 2 * Math.PI * 43;
  const progress = weeklyTotal > 0 ? weeklyDone / weeklyTotal : 0;
  const upcomingPreview = upcomingChores.slice(0, 2);

  return (
    <>
      <section className="weekly-progress-card" aria-label="Прогресс на этой неделе">
        <div
          className="weekly-progress-ring"
          role="img"
          aria-label={`${weeklyDone} из ${weeklyTotal} дел выполнено на этой неделе`}
        >
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle className="progress-ring-track" cx="50" cy="50" r="43" />
            <circle
              className="progress-ring-fill"
              cx="50"
              cy="50"
              r="43"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - progress)}
            />
          </svg>
          <span>
            <strong>{weeklyDone}</strong>
            <small>/{weeklyTotal}</small>
          </span>
        </div>
        <div className="weekly-progress-copy">
          <p className="section-kicker">Ваш ритм на неделе</p>
          <h2>
            {weeklyTotal === 0
              ? "Неделя пока свободна"
              : weeklyDone === weeklyTotal
                ? "Отличный ритм!"
                : "Дела идут своим чередом"}
          </h2>
          <p>
            {doneToday > 0
              ? `Сегодня выполнено ${choreCountLabel(doneToday)}`
              : `${choreCountLabel(todayChores.length)} на сегодня`}
          </p>
        </div>
        <div className="weekly-progress-bars" aria-hidden="true">
          {dailyCompletionCounts.map((count, index) => (
            <span
              className={count > 0 ? "has-completions" : ""}
              key={index}
              style={{ height: `${Math.min(27, count > 0 ? 9 + count * 6 : 4)}px` }}
            />
          ))}
        </div>
      </section>

      <button className="button button-primary add-full-button" onClick={onAdd}>
        <span className="plus" aria-hidden="true">
          +
        </span>
        Добавить дело
      </button>

      <div className="home-content-grid">
        <div className="home-main-column">
          <section className="home-section">
            <div className="section-heading">
              <div className="home-heading-title">
                <h2>Сегодня</h2>
                <span className="home-count-badge">{choreCountLabel(todayChores.length)}</span>
              </div>
              <button className="home-link" onClick={onOpenAll}>
                Все дела <span aria-hidden="true">→</span>
              </button>
            </div>
            {todayChores.length > 0 ? (
              <div className="chore-list">{todayChores.map(renderChoreCard)}</div>
            ) : (
              <div className="empty-card home-empty">
                <img className="empty-illustration" src={quietCat} alt="" />
                <h3>Всё в порядке</h3>
                <p>Сегодня можно оставить день свободным.</p>
                <button className="text-button" onClick={onAdd}>
                  Добавить дело <span aria-hidden="true">↗</span>
                </button>
              </div>
            )}
          </section>

          {overdueChores.length > 0 && (
            <section className="home-section attention-section">
              <div className="attention-callout">
                <span className="attention-icon" aria-hidden="true">
                  ↗
                </span>
                <div>
                  <strong>
                    {overdueChores.length === 1
                      ? "Одно дело ждёт удобного момента"
                      : "Пара дел давно не выполнялась"}
                  </strong>
                  <p>Можно распределить их на ближайшие дни</p>
                </div>
                <button
                  className="icon-button attention-open"
                  aria-label="Открыть план восстановления"
                  onClick={onRecovery}
                >
                  ›
                </button>
              </div>
              <div className="section-heading attention-heading">
                <h2>Требуют внимания</h2>
                <span className="home-count-badge">{overdueChores.length}</span>
              </div>
              <div className="chore-list compact-list">
                {overdueChores.slice(0, 2).map(renderChoreCard)}
              </div>
              <button className="button button-soft recovery-button" onClick={onRecovery}>
                Распределить дела
              </button>
            </section>
          )}
        </div>

        <aside className="home-side-column">
          <section className="home-section upcoming-section">
            <div className="section-heading">
              <h2>Предстоящие</h2>
              <button className="home-link" onClick={onOpenWeek}>
                Все планы <span aria-hidden="true">→</span>
              </button>
            </div>
            {upcomingPreview.length > 0 ? (
              <div className="upcoming-list">
                {upcomingPreview.map((chore) => (
                  <button
                    className="upcoming-item"
                    key={chore.id}
                    onClick={() => onOpenChore(chore)}
                  >
                    <span className="upcoming-date">
                      <strong>{Number(chore.nextDueDate.slice(8, 10))}</strong>
                      <small>
                        {fromDateKey(chore.nextDueDate)
                          .toLocaleDateString("ru-RU", { month: "short" })
                          .replace(".", "")}
                      </small>
                    </span>
                    <span className="upcoming-name">
                      <strong>{chore.title}</strong>
                      <small>{dateLabel(chore.nextDueDate, today)}</small>
                    </span>
                    <span className="chevron" aria-hidden="true">
                      ›
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="side-empty">Ближайшие дела появятся здесь.</p>
            )}
            {upcomingChores.length > upcomingPreview.length && (
              <button className="upcoming-more" onClick={onOpenWeek}>
                Ещё {choreCountLabel(upcomingChores.length - upcomingPreview.length)} в плане
                <span aria-hidden="true">→</span>
              </button>
            )}
          </section>

          <button className="week-shortcut" onClick={onOpenWeek}>
            <NavIcon view="week" />
            <span>
              <strong>План на неделю</strong>
              <small>Посмотреть и изменить расписание</small>
            </span>
            <span className="chevron" aria-hidden="true">
              ›
            </span>
          </button>
        </aside>
      </div>
    </>
  );
}

function HistoryPage({
  chores,
  onOpenChore,
}: {
  chores: Chore[];
  onOpenChore: (chore: Chore) => void;
}) {
  const entries = chores
    .flatMap((chore) => chore.completionHistory.map((date, index) => ({ chore, date, index })))
    .sort((a, b) => b.date.localeCompare(a.date));
  const groupedEntries = new Map<string, typeof entries>();
  entries.forEach((entry) =>
    groupedEntries.set(entry.date, [...(groupedEntries.get(entry.date) ?? []), entry])
  );

  return (
    <section className="history-page">
      <header className="page-title-block">
        <p className="section-kicker">Ваши маленькие победы</p>
        <h1>История</h1>
      </header>
      {entries.length === 0 ? (
        <div className="empty-card history-empty-state">
          <img className="empty-illustration" src={quietCat} alt="" />
          <h2>Здесь появятся выполненные дела</h2>
          <p>Отмечайте дела на главном экране — история сохранит их даты.</p>
        </div>
      ) : (
        <div className="history-groups">
          {[...groupedEntries.entries()].map(([date, dayEntries]) => (
            <section className="history-group" key={date}>
              <h2>{formatDate(date, { weekday: "long", day: "numeric", month: "long" })}</h2>
              <div className="history-group-list">
                {dayEntries.map(({ chore, index }) => (
                  <button
                    className="history-entry"
                    key={`${chore.id}-${date}-${index}`}
                    onClick={() => onOpenChore(chore)}
                  >
                    <span className="history-check">✓</span>
                    <span className="history-entry-name">{chore.title}</span>
                    <span className="chevron" aria-hidden="true">
                      ›
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

function SettingsPage({
  activeCount,
  totalCount,
  demoCount,
  onOpenAll,
  onClearDemo,
}: {
  activeCount: number;
  totalCount: number;
  demoCount: number;
  onOpenAll: () => void;
  onClearDemo: () => void;
}) {
  return (
    <section className="settings-page">
      <header className="page-title-block">
        <p className="section-kicker">Ваш дом</p>
        <h1>Настройки</h1>
      </header>
      <section className="settings-card">
        <div className="settings-card-heading">
          <span className="settings-icon" aria-hidden="true">
            ◷
          </span>
          <div>
            <h2>Данные приложения</h2>
            <p>Расписание хранится на этом устройстве.</p>
          </div>
        </div>
        <button className="settings-row" onClick={onOpenAll}>
          <span>
            <strong>Все дела</strong>
            <small>
              {activeCount} активных из {totalCount}
            </small>
          </span>
          <span className="chevron" aria-hidden="true">
            ›
          </span>
        </button>
      </section>
      <section className="settings-card">
        <div className="settings-card-heading">
          <span className="settings-icon" aria-hidden="true">
            ✳
          </span>
          <div>
            <h2>Планирование</h2>
            <p>
              Просроченные дела можно распределить по будням. Расписание меняется только после
              подтверждения.
            </p>
          </div>
        </div>
      </section>
      <section className="settings-card settings-danger-card">
        <div>
          <h2>Демонстрационные дела</h2>
          <p>
            {demoCount > 0
              ? `${choreCountLabel(demoCount)} для знакомства с приложением`
              : "Демонстрационных дел нет"}
          </p>
        </div>
        <button
          className="button button-secondary"
          disabled={demoCount === 0}
          onClick={onClearDemo}
        >
          Удалить демоданные
        </button>
      </section>
    </section>
  );
}

function ChoreCard({
  chore,
  today: currentDate,
  onOpen,
  onComplete,
  onUndo,
}: {
  chore: Chore;
  today: string;
  onOpen: () => void;
  onComplete: () => void;
  onUndo: () => void;
}) {
  const isOverdue = chore.active && chore.nextDueDate < currentDate;
  const completedToday = chore.lastCompletedAt === currentDate;
  const intervalLabel = `раз в ${chore.intervalDays} ${chore.intervalDays === 1 ? "день" : "дней"}`;
  const dueLabel = completedToday
    ? "выполнено сегодня"
    : dateLabel(chore.nextDueDate, currentDate).toLowerCase();

  return (
    <article
      className={`chore-card${!chore.active ? " is-paused" : ""}${isOverdue ? " is-overdue" : ""}`}
    >
      <button className="chore-open" onClick={onOpen} aria-label={`Подробнее: ${chore.title}`}>
        <span className="chore-indicator" aria-hidden="true" />
        <span className="chore-info">
          <span className="chore-title-row">
            <strong>{chore.title}</strong>
            {!chore.active && <span className="paused-badge">На паузе</span>}
          </span>
          <span className="chore-meta">
            {intervalLabel} <span aria-hidden="true">·</span>{" "}
            {isOverdue ? `можно перенести · ${dueLabel}` : dueLabel}
          </span>
        </span>
      </button>
      <div className="chore-actions">
        {chore.active && (
          <button
            className={`button-done${completedToday ? " is-completed" : ""}`}
            aria-label={
              completedToday
                ? `Снять отметку о выполнении: «${chore.title}»`
                : `Отметить «${chore.title}» выполненным`
            }
            onClick={completedToday ? onUndo : onComplete}
          >
            <span aria-hidden="true">✓</span>
          </button>
        )}
        <button
          className="icon-button"
          aria-label={`Дополнительные действия: ${chore.title}`}
          onClick={onOpen}
        >
          <span aria-hidden="true">···</span>
        </button>
      </div>
    </article>
  );
}

function ChoreDetailsSheet({
  chore,
  today: currentDate,
  onClose,
  onComplete,
  onUndo,
  onEdit,
  onReschedule,
  onDelete,
}: {
  chore: Chore;
  today: string;
  onClose: () => void;
  onComplete: () => void;
  onUndo: () => void;
  onEdit: () => void;
  onReschedule: () => void;
  onDelete: () => void;
}) {
  const overdue = chore.active && chore.nextDueDate < currentDate;
  const completedToday = chore.lastCompletedAt === currentDate;

  return (
    <DialogFrame onClose={onClose} className="details-sheet">
      <p className="section-kicker">{chore.active ? "В ритме дома" : "Дело на паузе"}</p>
      <h2>{chore.title}</h2>
      {chore.description && <p className="dialog-intro details-description">{chore.description}</p>}
      <div className="details-meta">
        <div>
          <span>Следующая дата</span>
          <strong>{formatDate(chore.nextDueDate, { day: "numeric", month: "long" })}</strong>
          <small>
            {overdue
              ? `Можно перенести · ${dateLabel(chore.nextDueDate, currentDate)}`
              : dateLabel(chore.nextDueDate, currentDate)}
          </small>
        </div>
        <div>
          <span>Последнее выполнение</span>
          <strong>
            {chore.lastCompletedAt ? formatDate(chore.lastCompletedAt) : "Ещё не было"}
          </strong>
          <small>
            Повторять каждые {chore.intervalDays} {chore.intervalDays === 1 ? "день" : "дней"}
          </small>
        </div>
      </div>
      <div className="details-actions">
        {completedToday ? (
          <button className="button button-primary details-primary" onClick={onUndo}>
            Снять отметку
          </button>
        ) : (
          chore.active && (
            <button className="button button-primary details-primary" onClick={onComplete}>
              Отметить выполненным
            </button>
          )
        )}
        <button className="button button-secondary" onClick={onReschedule}>
          Перенести дату
        </button>
        <button className="button button-secondary" onClick={onEdit}>
          Изменить дело
        </button>
        <details className="details-more-actions">
          <summary>Ещё</summary>
          <button
            className="button details-delete"
            onClick={() => {
              if (window.confirm(`Удалить дело «${chore.title}» и его историю?`)) onDelete();
            }}
          >
            Удалить дело
          </button>
        </details>
      </div>
    </DialogFrame>
  );
}

function MoveChoreDialog({
  chores,
  date,
  today: currentDate,
  onClose,
  onMove,
}: DialogProps & {
  chores: Chore[];
  date: string;
  today: string;
  onMove: (chore: Chore) => void;
}) {
  const availableChores = chores
    .filter((chore) => chore.nextDueDate !== date)
    .sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate));

  return (
    <DialogFrame onClose={onClose} className="small-dialog">
      <p className="section-kicker">Планирование недели</p>
      <h2>Перенести дело</h2>
      <p className="dialog-intro">
        Выберите дело для {formatDate(date, { day: "numeric", month: "long" })}. Остальные даты не
        изменятся.
      </p>
      {availableChores.length > 0 ? (
        <div className="move-list">
          {availableChores.map((chore) => (
            <button
              className="move-item"
              key={chore.id}
              onClick={() => onMove(chore)}
              aria-label={`Перенести «${chore.title}» на ${formatDate(date, { day: "numeric", month: "long" })}`}
            >
              <span>
                <strong>{chore.title}</strong>
                <small>
                  {chore.nextDueDate < currentDate
                    ? `Просрочено · ${dateLabel(chore.nextDueDate, currentDate).toLowerCase()}`
                    : `По плану · ${dateLabel(chore.nextDueDate, currentDate).toLowerCase()}`}
                </small>
              </span>
              <span className="move-item-label">Перенести</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="side-empty">
          Все активные дела уже запланированы на этот день. Можно оставить его свободным.
        </p>
      )}
    </DialogFrame>
  );
}

interface DialogProps {
  onClose: () => void;
}

function DialogFrame({
  children,
  onClose,
  className = "",
}: DialogProps & { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`modal-backdrop${className === "details-sheet" ? " sheet-backdrop" : ""}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={`dialog ${className}`}
        role="dialog"
        aria-modal="true"
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        <button className="dialog-close" aria-label="Закрыть" onClick={onClose}>
          ×
        </button>
        {children}
      </section>
    </div>
  );
}

function ChoreForm({
  chore,
  initialDate,
  onClose,
  onSave,
}: DialogProps & {
  chore?: Chore;
  initialDate?: string;
  onSave: (draft: ChoreDraft) => void;
}) {
  const [title, setTitle] = useState(chore?.title ?? "");
  const [description, setDescription] = useState(chore?.description ?? "");
  const [interval, setInterval] = useState(String(chore?.intervalDays ?? 7));
  const [date, setDate] = useState(chore?.nextDueDate ?? initialDate ?? today);
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const intervalDays = Number(interval);
    if (!title.trim()) {
      setError("Введите название дела.");
      return;
    }
    if (!Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > 365) {
      setError("Периодичность должна быть от 1 до 365 дней.");
      return;
    }
    onSave({ title: title.trim(), description, intervalDays, nextDueDate: date });
  }

  return (
    <DialogFrame onClose={onClose} className="form-dialog">
      <p className="section-kicker">{chore ? "Настроить дело" : "Новое дело"}</p>
      <h2>{chore ? "Изменить дело" : "Добавить дело"}</h2>
      <p className="dialog-intro">Задайте понятный ритм. Расписание всегда можно поменять.</p>
      <form className="chore-form" onSubmit={submit}>
        <label>
          Название
          <input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Например, постирать полотенца"
            maxLength={80}
          />
        </label>
        <label>
          Описание <span className="optional">необязательно</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Что важно помнить"
            rows={2}
            maxLength={240}
          />
        </label>
        <div className="form-row">
          <label>
            Повторять каждые
            <div className="input-suffix">
              <input
                type="number"
                min="1"
                max="365"
                value={interval}
                onChange={(event) => setInterval(event.target.value)}
              />
              <span>дней</span>
            </div>
          </label>
          <label>
            Следующая дата
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              required
            />
          </label>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="button button-secondary" onClick={onClose}>
            Отмена
          </button>
          <button type="submit" className="button button-primary">
            Сохранить
          </button>
        </div>
      </form>
    </DialogFrame>
  );
}

function RescheduleDialog({
  chore,
  initialDate,
  onClose,
  onSave,
  onSkip,
  onToggle,
}: DialogProps & {
  chore: Chore;
  initialDate?: string;
  onSave: (date: string) => void;
  onSkip: () => void;
  onToggle: () => void;
}) {
  const [date, setDate] = useState(initialDate ?? chore.nextDueDate);
  return (
    <DialogFrame onClose={onClose} className="small-dialog">
      <p className="section-kicker">Без изменений в истории</p>
      <h2>Когда будет удобно?</h2>
      <p className="dialog-intro">Переносим только плановую дату для дела «{chore.title}».</p>
      <label className="standalone-label">
        Новая дата
        <input
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          min={today}
        />
      </label>
      <details className="reschedule-more-actions">
        <summary>Другие действия</summary>
        <div>
          {chore.active && (
            <button className="button button-secondary" onClick={onSkip}>
              Пропустить цикл
            </button>
          )}
          <button className="button button-secondary" onClick={onToggle}>
            {chore.active ? "Приостановить" : "Возобновить"}
          </button>
        </div>
      </details>
      <div className="dialog-actions">
        <button className="button button-secondary" onClick={onClose}>
          Оставить как есть
        </button>
        <button className="button button-primary" onClick={() => onSave(date)}>
          Перенести
        </button>
      </div>
    </DialogFrame>
  );
}

function HistoryDialog({ chore, onClose }: DialogProps & { chore: Chore }) {
  return (
    <DialogFrame onClose={onClose} className="small-dialog">
      <p className="section-kicker">История выполнений</p>
      <h2>{chore.title}</h2>
      <p className="dialog-intro">Фактические даты — без пропусков и переносов.</p>
      {chore.completionHistory.length > 0 ? (
        <ol className="history-list">
          {chore.completionHistory.map((date, index) => (
            <li key={`${date}-${index}`}>
              <span className="history-check">✓</span>
              <span>{formatDate(date, { year: "numeric" })}</span>
              {index === 0 && <span className="history-latest">последнее</span>}
            </li>
          ))}
        </ol>
      ) : (
        <p className="side-empty history-empty">
          Пока нет записей. Они появятся после первого выполнения.
        </p>
      )}
      <div className="dialog-actions">
        <button className="button button-primary" onClick={onClose}>
          Понятно
        </button>
      </div>
    </DialogFrame>
  );
}

function RecoveryPage({
  chores,
  plan,
  today: currentDate,
  onClose,
  onApply,
}: DialogProps & {
  chores: Chore[];
  plan: Array<{ choreId: string; date: string }>;
  today: string;
  onApply: (plan: Array<{ choreId: string; date: string }>) => void;
}) {
  const [dates, setDates] = useState(() => new Map(plan.map((item) => [item.choreId, item.date])));
  const currentPlan = plan.map((item) => ({ ...item, date: dates.get(item.choreId) ?? item.date }));
  const groups = new Map<string, Array<{ choreId: string; date: string }>>();
  currentPlan.forEach((item) => groups.set(item.date, [...(groups.get(item.date) ?? []), item]));
  const hasInvalidDate = currentPlan.some(
    (item) => !isDateKey(item.date) || item.date < currentDate
  );
  const hasWeekend = currentPlan.some(
    (item) => item.date && [0, 6].includes(fromDateKey(item.date).getDay())
  );
  const overCapacity = [...groups.values()].some((items) => items.length > 2);

  return (
    <section className="recovery-page">
      <header className="recovery-page-header">
        <button className="recovery-back" onClick={onClose}>
          <span aria-hidden="true">←</span> Назад
        </button>
        <p className="section-kicker">План без спешки</p>
        <h1>Вернуться к рутине</h1>
        <p>
          Бережно распределили дела по ближайшим будням. Проверьте даты — расписание изменится
          только после подтверждения.
        </p>
      </header>
      <div className="recovery-note">
        <span className="recovery-note-icon" aria-hidden="true">
          ✳
        </span>
        <span>
          <strong>Это только предложение</strong>
          <small>Ни одна дата не изменится, пока вы не подтвердите план.</small>
        </span>
      </div>
      {currentPlan.length > 0 ? (
        <div className="recovery-plan-groups">
          {[...groups.entries()]
            .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
            .map(([date, items]) => (
              <section className="recovery-day-group" key={date}>
                <h2>
                  {isDateKey(date)
                    ? formatDate(date, { weekday: "long", day: "numeric", month: "long" })
                    : "Выберите дату"}
                </h2>
                <div className="recovery-day-list">
                  {items.map((item) => {
                    const chore = chores.find((candidate) => candidate.id === item.choreId);
                    if (!chore) return null;
                    return (
                      <label className="recovery-plan-item" key={item.choreId}>
                        <span className="recovery-plan-name">
                          <span className="chore-indicator" aria-hidden="true" />
                          <strong>{chore.title}</strong>
                        </span>
                        <input
                          type="date"
                          aria-label={`Дата для дела «${chore.title}»`}
                          min={currentDate}
                          value={dates.get(item.choreId) ?? item.date}
                          onChange={(event) =>
                            setDates(new Map(dates).set(item.choreId, event.target.value))
                          }
                        />
                      </label>
                    );
                  })}
                </div>
              </section>
            ))}
        </div>
      ) : (
        <div className="empty-card recovery-empty">
          <img className="empty-illustration" src={quietCat} alt="" />
          <h2>Пока всё спокойно</h2>
          <p>Нет просроченных дел, которым нужен новый план.</p>
        </div>
      )}
      {(hasInvalidDate || hasWeekend || overCapacity) && (
        <p className="form-error recovery-warning">
          {hasInvalidDate ? "Выберите дату не раньше сегодняшнего дня для каждого дела. " : ""}
          {hasWeekend || overCapacity
            ? "В плане есть выходной или больше двух дел в один день."
            : ""}
        </p>
      )}
      <div className="recovery-page-actions">
        <button className="button button-secondary" onClick={onClose}>
          Не сейчас
        </button>
        <button
          className="button button-primary"
          disabled={currentPlan.length === 0 || hasInvalidDate}
          onClick={() => onApply(currentPlan)}
        >
          Подтвердить план
        </button>
      </div>
    </section>
  );
}

export default ChoresPage;
