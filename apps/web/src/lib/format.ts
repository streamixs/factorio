const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const relativeFormatter = new Intl.RelativeTimeFormat("fr-FR", {
  numeric: "auto",
});

function parseDate(value: string | null | undefined): Date | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Formats a date as `JJ/MM/AAAA`, or an em dash when absent/invalid. */
export function formatDate(value: string | null | undefined): string {
  const date = parseDate(value);
  return date === undefined ? "—" : dateFormatter.format(date);
}

/** Formats a date and time as `JJ/MM/AAAA HH:mm`. */
export function formatDateTime(value: string | null | undefined): string {
  const date = parseDate(value);
  return date === undefined ? "—" : dateTimeFormatter.format(date);
}

/**
 * Formats a timestamp relative to `now` (`il y a 2 minutes`, `dans 3 heures`).
 * The comparison is deterministic when `now` is provided, which keeps tests
 * independent of the clock.
 */
export function formatRelativeTime(value: string, now = Date.now()): string {
  const date = parseDate(value);
  if (date === undefined) {
    return "—";
  }

  const deltaSeconds = Math.round((date.getTime() - now) / 1000);
  const absoluteSeconds = Math.abs(deltaSeconds);

  if (absoluteSeconds < 60) {
    return relativeFormatter.format(deltaSeconds, "second");
  }
  if (absoluteSeconds < 60 * 60) {
    return relativeFormatter.format(Math.round(deltaSeconds / 60), "minute");
  }
  if (absoluteSeconds < 24 * 60 * 60) {
    return relativeFormatter.format(Math.round(deltaSeconds / 3600), "hour");
  }

  return relativeFormatter.format(Math.round(deltaSeconds / 86400), "day");
}

/**
 * Formats an elapsed time in seconds using short French units, for example
 * `3 h 12 min` or `2 j 4 h`. Returns an em dash for missing or invalid values.
 */
export function formatUptime(seconds: number | null | undefined): string {
  if (
    seconds === null ||
    seconds === undefined ||
    !Number.isFinite(seconds) ||
    seconds < 0
  ) {
    return "—";
  }

  const totalSeconds = Math.floor(seconds);
  if (totalSeconds < 60) {
    return "< 1 min";
  }

  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) {
    return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours === 0 ? `${days} j` : `${days} j ${remainingHours} h`;
}
