import { bootstrapUltron } from "@/lib/ultron/bootstrap";
import { runAssistant } from "@/lib/ultron/assistant";
import {
  addMessage,
  getConversation,
  listMessages,
  recordEvent,
  systemCounts,
} from "@/db/queries";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const rows = await listMessages(id).catch(() => []);
  return Response.json({ messages: rows });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    content?: string;
  };
  const content = (body.content ?? "").trim();
  if (!content || content.length > 4000) {
    return Response.json(
      { error: "Message content must be 1–4000 characters." },
      { status: 400 },
    );
  }

  const convo = await getConversation(id).catch(() => null);
  if (!convo) {
    return Response.json({ error: "Conversation not found." }, { status: 404 });
  }

  await recordEvent("message.received", { conversationId: id });
  await addMessage({ conversationId: id, role: "user", content });

  const ctx = await bootstrapUltron();
  const stats = (await systemCounts().catch(() => null)) ?? {
    events: 0,
    devices: 0,
    conversations: 0,
    messages: 0,
    migrationRuns: 0,
  };
  const reply = runAssistant({
    input: content,
    paths: ctx.paths,
    stats,
    legacyDetected:
      ctx.legacyScan.anythingPresent && ctx.paths.mode === "installed",
  });

  const assistantMessage = await addMessage({
    conversationId: id,
    role: "assistant",
    content: reply.content,
    meta: { intent: reply.intent, suggestions: reply.suggestions },
  });
  await recordEvent("assistant.replied", {
    conversationId: id,
    intent: reply.intent,
  });

  return Response.json({ reply, message: assistantMessage }, { status: 201 });
}
