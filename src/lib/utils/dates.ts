export const formatTime = (isoDate: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoDate));

export const formatDateTime = (isoDate: string) =>
  `${new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(isoDate))} ${formatTime(isoDate)}`;

export const formatElapsedTime = (isoDate: string) => {
  const diffSeconds = Math.max(0, Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000));

  if (diffSeconds < 10) {
    return "Agora";
  }

  if (diffSeconds < 60) {
    return `${diffSeconds} s`;
  }

  const diffMinutes = Math.floor(diffSeconds / 60);

  if (diffMinutes < 60) {
    return `${diffMinutes} min`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours} h`;
  }

  const diffDays = Math.floor(diffHours / 24);

  if (diffDays < 30) {
    return `${diffDays} d`;
  }

  const diffMonths = Math.floor(diffDays / 30);

  if (diffMonths < 12) {
    return `${diffMonths} mês${diffMonths === 1 ? "" : "es"}`;
  }

  const diffYears = Math.floor(diffMonths / 12);
  return `${diffYears} ano${diffYears === 1 ? "" : "s"}`;
};

export const minutesSince = (isoDate: string) => {
  const diff = Date.now() - new Date(isoDate).getTime();
  return Math.max(0, Math.floor(diff / 60000));
};
