import "./loading-state.scss";

interface LoadingStateProps {
  label?: string;
}

export function LoadingState({ label = "Carregando" }: LoadingStateProps) {
  return (
    <div className="loading-state" aria-live="polite">
      <span className="loading-state__bar" />
      <span className="loading-state__bar" />
      <span className="loading-state__bar" />
      <span className="loading-state__label">{label}</span>
    </div>
  );
}
