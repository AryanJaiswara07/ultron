import { PresenceApp } from "@/components/presence/presence-app";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "ULTRON — Presence",
  description:
    "Voice-first AI presence: wake word, live golden core, real tools, real event stream.",
};

export default function PresencePage() {
  return <PresenceApp />;
}
