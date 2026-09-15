import { createFileRoute } from "@tanstack/react-router";
import { JobHistoryView } from "@/components/job-history-view";

export const Route = createFileRoute("/history")({ component: JobHistoryView });
