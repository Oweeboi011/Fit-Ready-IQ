import { NextRequest, NextResponse } from "next/server";

import { getFirestoreAdmin } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequestBody {
  messages?: ChatMessage[];
  sessionId?: string;
}

const SYSTEM_PROMPT = `You are an adventure readiness assistant for Fit Ready IQ — an outdoor fitness and route planning platform.
You help users:
- Assess fitness readiness for trails, mountains, and camping trips
- Discover nearby hiking trails, peaks, and campsites
- Plan adventures with safety and fitness in mind
- Understand route difficulty, elevation gain, and gear requirements
- Get training advice for upcoming outdoor challenges

Keep responses concise, friendly, and safety-conscious. Use bullet points for lists.
Never exceed 150 words unless the user explicitly asks for detailed information.`;

async function persistConversation(
  sessionId: string,
  messages: ChatMessage[],
  assistantReply: string
): Promise<void> {
  try {
    const db = getFirestoreAdmin();
    const now = new Date().toISOString();

    await db.collection("chat_sessions").doc(sessionId).set(
      {
        updatedAt: now,
        source: "fit-ready-iq",
      },
      { merge: true }
    );

    await db
      .collection("chat_sessions")
      .doc(sessionId)
      .collection("messages")
      .add({
        messages,
        assistantReply,
        createdAt: now,
      });
  } catch (error) {
    console.error("Firestore persistence skipped:", error);
  }
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "AI assistant is not configured. Add GEMINI_API_KEY to your environment." },
      { status: 503 }
    );
  }

  let requestBody: ChatRequestBody;
  try {
    requestBody = (await request.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const messages = requestBody.messages;
  const sessionId = requestBody.sessionId ?? crypto.randomUUID();

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "Messages array required" }, { status: 400 });
  }

  const hasInvalidMessage = messages.some(
    (m) =>
      (m.role !== "assistant" && m.role !== "user") ||
      typeof m.content !== "string" ||
      m.content.trim().length === 0
  );

  if (hasInvalidMessage) {
    return NextResponse.json({ error: "Invalid message format" }, { status: 400 });
  }

  const contents = messages.map((msg) => ({
    role: msg.role === "assistant" ? "model" : "user",
    parts: [{ text: msg.content }],
  }));

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 512,
          },
        }),
      }
    );

    if (!response.ok) {
      console.error("Gemini API error:", await response.text());
      return NextResponse.json({ error: "AI service unavailable" }, { status: 502 });
    }

    const data = await response.json();
    const text =
      data.candidates?.[0]?.content?.parts?.[0]?.text ??
      "I couldn't generate a response. Please try again.";

    await persistConversation(sessionId, messages, text);

    return NextResponse.json({ message: text, sessionId });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json({ error: "Failed to reach AI service" }, { status: 500 });
  }
}
