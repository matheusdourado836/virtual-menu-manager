import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn:
    process.env.NEXT_PUBLIC_SENTRY_DSN ||
    "https://50688dedc482a8d0f1dc3cd2de1eb9fa@o4507963534147584.ingest.us.sentry.io/4511497390850048",
  tracesSampleRate: 0.1,
  enabled: process.env.NODE_ENV === "production" || Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
});
