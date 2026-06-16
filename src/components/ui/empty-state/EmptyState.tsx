import type { ReactNode } from "react";
import "./empty-state.scss";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  text: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, text, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      {icon ? <div className="empty-state__icon">{icon}</div> : null}
      <h2 className="empty-state__title">{title}</h2>
      <p className="empty-state__text">{text}</p>
      {action ? <div className="empty-state__action">{action}</div> : null}
    </div>
  );
}
