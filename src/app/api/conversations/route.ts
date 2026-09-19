import { createConversation, listConversations, recordEvent } from "@/db/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await listConversations().catch(() => []);
  return Response.json({ conversations: rows });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { title?: string };
  const title = (body.title ?? "").trim() || `Session ${new Date().toISOString()}`;
  try {
    const convo = await createConversation(title.slice(0, 120));
    await recordEvent("conversation.created", { conversationId: convo.id });
    return Response.json({ conversation: convo }, { status: 201 });
  } catch {
    return Response.json({ error: "Database unavailable." }, { status: 503 });
  }
}
