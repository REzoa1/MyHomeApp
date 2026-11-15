import { FormEvent, useMemo, useState } from "react";
import {
  addDays,
  Chore,
  ChoreDraft,
  dateLabel,
  daysBetween,
  formatDate,
  isDateKey,
  planRecovery,
  readChores,
  STORAGE_KEY,
  toDateKey,
} from "./model/chores";
import "./chores.css";

type ModalState =
  | { type: "edit"; chore?: Chore }
  | { type: "history"; chore: Chore }
  | { type: "reschedule"; chore: Chore }
  | { type: "recovery" }
  | null;

const today = toDateKey(new Date());
const weekday = new Intl.DateTimeFormat("ru-RU", { weekday: "long" }).format(new Date());

function ChoresPage() {
  const [initial] = useState(() => readChores(today));
  const [chores, setChores] = useState(initial.chores);
  const [storageError, setStorageError] = useState(initial.error);
  const [activeView, setActiveView] = useState<"today" | "all">("today");
  const [modal, setModal] = useState<ModalState>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const activeChores = chores.filter((chore) => chore.active);
  const todayChores = activeChores.filter((chore) => chore.nextDueDate === today);
  const overdueChores = activeChores.filter((chore) => chore.nextDueDate < today);
  const upcomingChores = activeChores
    .filter((chore) => chore.nextDueDate > today && chore.nextDueDate <= addDays(today, 7))
    .sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate));
  const doneToday = activeChores.filter((chore) => chore.lastCompletedAt === today).length;

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
            }
          : item
      )
    );
    setOpenMenuId(null);
  }

  function skipCycle(chore: Chore) {
    saveChores(
      chores.map((item) =>
        item.id === chore.id ? { ...item, nextDueDate: addDays(today, item.intervalDays) } : item
      )
    );
    setOpenMenuId(null);
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
      chores.map((item) => (item.id === chore.id ? { ...item, nextDueDate: date } : item))
    );
    setModal(null);
  }

  function applyRecoveryPlan(plan: Array<{ choreId: string; date: string }>) {
    const plannedDates = new Map(plan.map((item) => [item.choreId, item.date]));
    saveChores(
      chores.map((chore) =>
        plannedDates.has(chore.id) ? { ...chore, nextDueDate: plannedDates.get(chore.id)! } : chore
      )
    );
    setModal(null);
  }

  const recoveryPlan = useMemo(() => planRecovery(chores, today), [chores]);
  const recoveryKey = recoveryPlan.map((item) => item.choreId).join(",");

  return (
    <>
      <main className="page">
        <section className="welcome-row">
          <div>
            <p className="eyebrow">
              {weekday} · {formatDate(today, { day: "numeric", month: "long" })}
            </p>
            <h1>Дом в своём ритме</h1>
            <p className="welcome-copy">
              Не нужно успевать всё. Достаточно выбрать то, на что есть силы сегодня.
            </p>
          </div>
          <button
            className="button button-primary add-main"
            onClick={() => setModal({ type: "edit" })}
          >
            <span className="plus" aria-hidden="true">
              +
            </span>{" "}
            Новое дело
          </button>
        </section>

        {storageError && (
          <div className="notice" role="status">
            <span>{storageError}</span>
            <button className="text-button" onClick={() => setStorageError(null)}>
              Скрыть
            </button>
          </div>
        )}

        <section className="summary-strip" aria-label="Сводка">
          <div className="summary-main">
            <span className="summary-icon" aria-hidden="true">
              ✳
            </span>
            <span>
              {todayChores.length === 0
                ? "Сегодня можно выдохнуть"
                : `${todayChores.length} ${todayChores.length === 1 ? "дело" : "дела"} на сегодня`}
            </span>
          </div>
          <span className="summary-divider" />
          <span className="summary-muted">
            {doneToday > 0 ? `Уже сделано сегодня: ${doneToday}` : "Выходные остаются свободными"}
          </span>
          <span className="summary-active">{activeChores.length} активных</span>
        </section>

        <nav className="view-tabs" aria-label="Разделы дел">
          <button
            className={activeView === "today" ? "view-tab active" : "view-tab"}
            onClick={() => setActiveView("today")}
          >
            Обзор
          </button>
          <button
            className={activeView === "all" ? "view-tab active" : "view-tab"}
            onClick={() => setActiveView("all")}
          >
            Все дела <span className="tab-count">{chores.length}</span>
          </button>
        </nav>

        {activeView === "today" ? (
          <div className="dashboard-grid">
            <div className="main-column">
              <section className="section-block">
                <div className="section-heading">
                  <div>
                    <p className="section-kicker">План на день</p>
                    <h2>Сегодня</h2>
                  </div>
                  <span className="section-count">{todayChores.length}</span>
                </div>
                {todayChores.length > 0 ? (
                  <div className="chore-list">
                    {todayChores.map((chore) => (
                      <ChoreCard
                        key={chore.id}
                        chore={chore}
                        onComplete={completeChore}
                        onEdit={() => setModal({ type: "edit", chore })}
                        onHistory={() => setModal({ type: "history", chore })}
                        onReschedule={() => setModal({ type: "reschedule", chore })}
                        openMenuId={openMenuId}
                        setOpenMenuId={setOpenMenuId}
                        onSkip={skipCycle}
                        onSave={saveChores}
                        chores={chores}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="empty-card">
                    <span className="empty-sun" aria-hidden="true">
                      ☼
                    </span>
                    <h3>На сегодня всё спокойно</h3>
                    <p>Можно оставить день свободным или добавить дело, если хочется.</p>
                    <button className="text-button" onClick={() => setModal({ type: "edit" })}>
                      Добавить дело <span aria-hidden="true">↗</span>
                    </button>
                  </div>
                )}
              </section>

              {overdueChores.length > 0 && (
                <section className="section-block attention-section">
                  <div className="section-heading">
                    <div>
                      <p className="section-kicker">Без спешки</p>
                      <h2>Можно перераспределить</h2>
                    </div>
                    <span className="section-count">{overdueChores.length}</span>
                  </div>
                  <p className="section-description">
                    Эти дела просто ждут удобного момента. Ничего не нужно наверстывать за один
                    день.
                  </p>
                  <div className="chore-list compact-list">
                    {overdueChores.map((chore) => (
                      <ChoreCard
                        key={chore.id}
                        chore={chore}
                        onComplete={completeChore}
                        onEdit={() => setModal({ type: "edit", chore })}
                        onHistory={() => setModal({ type: "history", chore })}
                        onReschedule={() => setModal({ type: "reschedule", chore })}
                        openMenuId={openMenuId}
                        setOpenMenuId={setOpenMenuId}
                        onSkip={skipCycle}
                        onSave={saveChores}
                        chores={chores}
                      />
                    ))}
                  </div>
                  <button
                    className="button button-soft recovery-button"
                    onClick={() => setModal({ type: "recovery" })}
                  >
                    <span aria-hidden="true">↗</span> Составить мягкий план
                  </button>
                </section>
              )}
            </div>

            <aside className="side-column">
              <section className="section-block upcoming-section">
                <div className="section-heading">
                  <div>
                    <p className="section-kicker">Ближайшая неделя</p>
                    <h2>Предстоит</h2>
                  </div>
                  <span className="section-count">{upcomingChores.length}</span>
                </div>
                {upcomingChores.length > 0 ? (
                  <div className="upcoming-list">
                    {upcomingChores.map((chore) => (
                      <button
                        className="upcoming-item"
                        key={chore.id}
                        onClick={() => setModal({ type: "reschedule", chore })}
                      >
                        <span className="upcoming-date">
                          <strong>{fromDateNumber(chore.nextDueDate)}</strong>
                          <small>
                            {new Intl.DateTimeFormat("ru-RU", { month: "short" })
                              .format(new Date(`${chore.nextDueDate}T12:00:00`))
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
                  <p className="side-empty">
                    Пока ничего не запланировано. Можно отдохнуть или заняться делами в своём темпе.
                  </p>
                )}
              </section>

              <section className="rhythm-card">
                <span className="rhythm-spark" aria-hidden="true">
                  ✳
                </span>
                <p className="section-kicker">Ваш ритм</p>
                <h3>
                  Будни — для дел,
                  <br />
                  выходные — для себя
                </h3>
                <p>Предложенный план не меняет расписание, пока вы его не подтвердите.</p>
                <span className="rhythm-decoration" aria-hidden="true">
                  ✳
                </span>
              </section>

              <button
                className="demo-link"
                onClick={() => {
                  const demos = chores.filter((chore) => chore.demo);
                  if (demos.length === 0) return;
                  if (
                    window.confirm(
                      "Удалить только демонстрационные дела? Ваши собственные дела останутся."
                    )
                  ) {
                    saveChores(chores.filter((chore) => !chore.demo));
                  }
                }}
              >
                Очистить демоданные <span aria-hidden="true">↗</span>
              </button>
            </aside>
          </div>
        ) : (
          <section className="all-chores">
            <div className="all-header">
              <div>
                <p className="section-kicker">Ваш список</p>
                <h2>Все дела</h2>
              </div>
              <button
                className="button button-secondary"
                onClick={() => {
                  const demos = chores.filter((chore) => chore.demo);
                  if (
                    demos.length &&
                    window.confirm(
                      "Удалить только демонстрационные дела? Ваши собственные дела останутся."
                    )
                  ) {
                    saveChores(chores.filter((chore) => !chore.demo));
                  }
                }}
              >
                Очистить демоданные
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
                  .map((chore) => (
                    <ChoreCard
                      key={chore.id}
                      chore={chore}
                      onComplete={completeChore}
                      onEdit={() => setModal({ type: "edit", chore })}
                      onHistory={() => setModal({ type: "history", chore })}
                      onReschedule={() => setModal({ type: "reschedule", chore })}
                      openMenuId={openMenuId}
                      setOpenMenuId={setOpenMenuId}
                      onSkip={skipCycle}
                      onSave={saveChores}
                      chores={chores}
                    />
                  ))}
              </div>
            ) : (
              <div className="empty-card empty-wide">
                <span className="empty-sun" aria-hidden="true">
                  ☼
                </span>
                <h3>Начните с одного дела</h3>
                <p>Добавьте то, о чём не хочется помнить вручную.</p>
                <button
                  className="button button-primary"
                  onClick={() => setModal({ type: "edit" })}
                >
                  Добавить дело
                </button>
              </div>
            )}
          </section>
        )}
      </main>

      {modal?.type === "edit" && (
        <ChoreForm
          chore={modal.chore}
          onClose={() => setModal(null)}
          onSave={(draft) => saveDraft(draft, modal.chore)}
        />
      )}
      {modal?.type === "reschedule" && (
        <RescheduleDialog
          chore={modal.chore}
          onClose={() => setModal(null)}
          onSave={(date) => saveRescheduledDate(modal.chore, date)}
        />
      )}
      {modal?.type === "history" && (
        <HistoryDialog chore={modal.chore} onClose={() => setModal(null)} />
      )}
      {modal?.type === "recovery" && (
        <RecoveryDialog
          chores={chores}
          plan={recoveryPlan}
          today={today}
          planKey={recoveryKey}
          onClose={() => setModal(null)}
          onApply={applyRecoveryPlan}
        />
      )}
    </>
  );
}

function fromDateNumber(value: string): string {
  return String(Number(value.slice(8, 10))).padStart(2, "0");
}

interface ChoreCardProps {
  chore: Chore;
  chores: Chore[];
  onComplete: (chore: Chore) => void;
  onEdit: () => void;
  onHistory: () => void;
  onReschedule: () => void;
  onSkip: (chore: Chore) => void;
  onSave: (chores: Chore[]) => void;
  openMenuId: string | null;
  setOpenMenuId: (id: string | null) => void;
}

function ChoreCard({
  chore,
  chores,
  onComplete,
  onEdit,
  onHistory,
  onReschedule,
  onSkip,
  onSave,
  openMenuId,
  setOpenMenuId,
}: ChoreCardProps) {
  const isOverdue = chore.active && chore.nextDueDate < today;
  const daysUntil = daysBetween(today, chore.nextDueDate);
  return (
    <article className={`chore-card${!chore.active ? " is-paused" : ""}`}>
      <span className={`chore-indicator${isOverdue ? " overdue" : ""}`} aria-hidden="true" />
      <div className="chore-info">
        <div className="chore-title-row">
          <h3>{chore.title}</h3>
          {!chore.active && <span className="paused-badge">На паузе</span>}
        </div>
        <p className="chore-meta">
          {isOverdue
            ? `Планировалось ${dateLabel(chore.nextDueDate, today).toLowerCase()}`
            : chore.active
              ? `Раз в ${chore.intervalDays} ${chore.intervalDays === 1 ? "день" : "дней"}${daysUntil > 0 ? ` · ${dateLabel(chore.nextDueDate, today).toLowerCase()}` : ""}`
              : `Раз в ${chore.intervalDays} ${chore.intervalDays === 1 ? "день" : "дней"}`}
          {chore.description && <span className="meta-separator"> · {chore.description}</span>}
        </p>
        {chore.lastCompletedAt && (
          <button className="last-done" onClick={onHistory}>
            Последний раз · {formatDate(chore.lastCompletedAt)}
          </button>
        )}
      </div>
      <div className="chore-actions">
        {chore.active && (
          <button className="button button-done" onClick={() => onComplete(chore)}>
            <span aria-hidden="true">✓</span> Готово
          </button>
        )}
        <div className="menu-wrap">
          <button
            className="icon-button"
            aria-label={`Действия: ${chore.title}`}
            aria-expanded={openMenuId === chore.id}
            onClick={() => setOpenMenuId(openMenuId === chore.id ? null : chore.id)}
          >
            ···
          </button>
          {openMenuId === chore.id && (
            <div className="action-menu">
              <button
                onClick={() => {
                  setOpenMenuId(null);
                  onReschedule();
                }}
              >
                Перенести дату
              </button>
              <button
                onClick={() => {
                  setOpenMenuId(null);
                  onHistory();
                }}
              >
                История выполнений
              </button>
              <button
                onClick={() => {
                  setOpenMenuId(null);
                  onEdit();
                }}
              >
                Изменить дело
              </button>
              <button
                onClick={() => {
                  onSave(
                    chores.map((item) =>
                      item.id === chore.id ? { ...item, active: !item.active } : item
                    )
                  );
                  setOpenMenuId(null);
                }}
              >
                {chore.active ? "Приостановить" : "Возобновить"}
              </button>
              {chore.active && <button onClick={() => onSkip(chore)}>Пропустить цикл</button>}
              <button
                className="menu-danger"
                onClick={() => {
                  if (window.confirm(`Удалить дело «${chore.title}» и его историю?`)) {
                    onSave(chores.filter((item) => item.id !== chore.id));
                  }
                  setOpenMenuId(null);
                }}
              >
                Удалить
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
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
      className="modal-backdrop"
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
  onClose,
  onSave,
}: DialogProps & { chore?: Chore; onSave: (draft: ChoreDraft) => void }) {
  const [title, setTitle] = useState(chore?.title ?? "");
  const [description, setDescription] = useState(chore?.description ?? "");
  const [interval, setInterval] = useState(String(chore?.intervalDays ?? 7));
  const [date, setDate] = useState(chore?.nextDueDate ?? today);
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
      <p className="section-kicker">{chore ? "Настроить дело" : "Новая привычка"}</p>
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
  onClose,
  onSave,
}: DialogProps & { chore: Chore; onSave: (date: string) => void }) {
  const [date, setDate] = useState(chore.nextDueDate);
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

function RecoveryDialog({
  chores,
  plan,
  today: currentDate,
  planKey,
  onClose,
  onApply,
}: DialogProps & {
  chores: Chore[];
  plan: Array<{ choreId: string; date: string }>;
  today: string;
  planKey: string;
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
    (item) => item.date && [0, 6].includes(new Date(`${item.date}T12:00:00`).getDay())
  );
  const overCapacity = [...groups.values()].some((items) => items.length > 2);

  return (
    <DialogFrame onClose={onClose} className="recovery-dialog">
      <p className="section-kicker">План без спешки</p>
      <h2>Вернуться к рутине</h2>
      <p className="dialog-intro">
        Распределили дела по будням, не больше двух в день. Проверьте даты — расписание изменится
        только после подтверждения.
      </p>
      {currentPlan.length > 0 ? (
        <div className="plan-list">
          {currentPlan.map((item) => {
            const chore = chores.find((candidate) => candidate.id === item.choreId);
            if (!chore) return null;
            return (
              <label className="plan-item" key={`${planKey}-${item.choreId}`}>
                <span className="plan-item-name">{chore.title}</span>
                <input
                  type="date"
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
      ) : (
        <div className="empty-plan">
          <span aria-hidden="true">✳</span>
          <p>Сейчас нет дел, которые нужно перераспределить.</p>
        </div>
      )}
      {(hasInvalidDate || hasWeekend || overCapacity) && (
        <p className="form-error">
          {hasInvalidDate ? "Выберите дату не раньше сегодняшнего дня для каждого дела. " : ""}
          {hasWeekend || overCapacity
            ? "В плане есть выходной или больше двух дел в один день."
            : ""}
        </p>
      )}
      <div className="dialog-actions">
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
    </DialogFrame>
  );
}

export default ChoresPage;
