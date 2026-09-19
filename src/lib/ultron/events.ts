/**
 * Typed event vocabulary for the ULTRON event log — v2 "Presence".
 * Every value is emitted or ingested from a real code path; the
 * architecture suite (ARCH-EV-01) fails on dead vocabulary.
 *
 * This module has NO node imports so client components (voice layer,
 * presence visual) may safely import the vocabulary.
 */
export const ULTRON_EVENT_TYPES = [
  // system/config (v1 lineage)
  "system.boot",
  "system.migration.detected",
  "migration.completed",
  "migration.failed",
  "device.issued",
  "device.allowed",
  "device.blocked",
  "device.revoked",
  "conversation.created",
  "message.received",
  "assistant.replied",
  "sandbox.violation",
  "security.permission_hardened",
  "config.loaded",
  // presence + voice (v2)
  "wake_detected",
  "listening_started",
  "speech_detected",
  "transcription_ready",
  "thinking_started",
  "thinking_finished",
  "speaking_started",
  "speaking_finished",
  // brain + interaction
  "interaction_started",
  "interaction_responded",
  "brain.selected",
  "brain.degraded",
  // orchestration
  "task_started",
  "task_paused",
  "task_resumed",
  "task_stopped",
  "task_completed",
  "task_failed",
  "plan_created",
  "tool_started",
  "tool_finished",
  "confirmation_required",
  "confirmation_granted",
  "confirmation_denied",
  // memory + diagnostics
  "memory_updated",
  "doctor_completed",
] as const;

export type UltronEventType = (typeof ULTRON_EVENT_TYPES)[number];

export type EventSeverity = "info" | "warning" | "critical";

export interface UltronEventPayload {
  [key: string]:
    | string
    | number
    | boolean
    | null
    | undefined;
}

/** Presence visual states — the visual state machine consumes these. */
export const PRESENCE_STATES = [
  "IDLE",
  "LISTENING",
  "THINKING",
  "SPEAKING",
  "EXECUTING",
  "WARNING",
  "CONFIRMATION",
  "SUCCESS",
  "ERROR",
] as const;

export type PresenceState = (typeof PRESENCE_STATES)[number];

/** Maps event types to the presence state they should induce. */
export const EVENT_STATE_MAP: Partial<Record<UltronEventType, PresenceState>> = {
  wake_detected: "LISTENING",
  listening_started: "LISTENING",
  speech_detected: "LISTENING",
  transcription_ready: "THINKING",
  thinking_started: "THINKING",
  thinking_finished: "SPEAKING",
  speaking_started: "SPEAKING",
  speaking_finished: "IDLE",
  task_started: "EXECUTING",
  plan_created: "EXECUTING",
  tool_started: "EXECUTING",
  task_paused: "CONFIRMATION",
  confirmation_required: "CONFIRMATION",
  task_resumed: "EXECUTING",
  task_completed: "SUCCESS",
  interaction_responded: "SUCCESS",
  task_failed: "ERROR",
  task_stopped: "IDLE",
  "sandbox.violation": "WARNING",
  "migration.failed": "ERROR",
};
