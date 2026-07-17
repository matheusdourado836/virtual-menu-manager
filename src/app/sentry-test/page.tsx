import { notFound } from "next/navigation";
import { SentryTestPanel } from "@/components/sentry-test/SentryTestPanel";

export default function SentryTestPage() {
  const isEnabled = process.env.NODE_ENV === "development" || process.env.SENTRY_TEST_ENABLED === "true";

  if (!isEnabled) notFound();

  return <SentryTestPanel />;
}
