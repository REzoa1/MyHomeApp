import { PropsWithChildren } from "react";
import "./app-shell.css";

const weekday = new Intl.DateTimeFormat("ru-RU", { weekday: "long" }).format(new Date());

export default function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Дом — на главную">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="m3.75 10.5 8.25-7 8.25 7M5.75 9v11h12.5V9M9.25 20v-6.5h5.5V20" />
            </svg>
          </span>
          <span>
            дом<span className="brand-dot">.</span>
          </span>
        </a>
        <div className="topbar-right">
          <span className="topbar-date">{weekday}</span>
          <span className="avatar" aria-label="Личный профиль">
            М
          </span>
        </div>
      </header>
      {children}
      <footer className="footer">
        <span>меньше держать в голове</span>
        <span className="footer-dot">·</span>
        <span>больше жить</span>
      </footer>
    </div>
  );
}
