import type { Store } from "@/types/menu";

const storeTimezone = "America/Sao_Paulo";
const weekdayLabelByShortName: Record<string, string> = {
  Sun: "Dom",
  Mon: "Seg",
  Tue: "Ter",
  Wed: "Qua",
  Thu: "Qui",
  Fri: "Sex",
  Sat: "Sáb",
};

interface OpeningEntry {
  dayLabel: string;
  opensAt: number;
  closesAt: number;
}

export interface StoreOpenState {
  isOpen: boolean;
  message: string;
}

const timeToMinutes = (value: string) => {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
};

const parseOpeningHours = (openingHours?: string): OpeningEntry[] => {
  if (!openingHours || openingHours.trim() === "Fechado") {
    return [];
  }

  return openingHours
    .split(",")
    .map((rawPart) => {
      const match = rawPart.trim().match(/^(Seg|Ter|Qua|Qui|Sex|Sáb|Dom)\s+(\d{2}:\d{2})-(\d{2}:\d{2})$/u);

      if (!match) {
        return null;
      }

      const [, dayLabel, opensAt, closesAt] = match;

      return {
        dayLabel,
        opensAt: timeToMinutes(opensAt),
        closesAt: timeToMinutes(closesAt),
      };
    })
    .filter((entry): entry is OpeningEntry => Boolean(entry));
};

const getZonedDayAndMinutes = (date: Date) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: storeTimezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const weekday = parts.find((part) => part.type === "weekday")?.value || "";
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);

  return {
    dayLabel: weekdayLabelByShortName[weekday] || "",
    minutes: hour * 60 + minute,
  };
};

export const isWithinOpeningHours = (openingHours?: string, date = new Date()) => {
  const entries = parseOpeningHours(openingHours);
  const current = getZonedDayAndMinutes(date);
  const today = entries.find((entry) => entry.dayLabel === current.dayLabel);

  return Boolean(today && current.minutes >= today.opensAt && current.minutes < today.closesAt);
};

export const getStoreOpenState = (store: Store, date = new Date()): StoreOpenState => {
  if (!store.isActive) {
    return {
      isOpen: false,
      message: "A loja está fechada no momento.",
    };
  }

  if (!store.isAcceptingOrders) {
    return {
      isOpen: false,
      message: store.pausedMessage,
    };
  }

  if (!isWithinOpeningHours(store.openingHours, date)) {
    return {
      isOpen: false,
      message: "A loja está fechada no momento. Tente novamente dentro do horário de funcionamento.",
    };
  }

  return {
    isOpen: true,
    message: "",
  };
};
