import { NextRequest, NextResponse } from 'next/server';

import { createLogger, serializeError, upstreamSnippet, type Logger } from '@/lib/logger';
import { getFirestoreAdmin } from '@/lib/firebaseAdmin';
import { rateLimit, tooManyRequests } from '@/lib/rateLimit';
import { CHAT_RATE_LIMIT } from '@/lib/rateLimitRules';
import { optionalUser } from '@/lib/serverAuth';

export const runtime = 'nodejs';

interface ChatMessage {
  role: 'user' | 'assistant';
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

/**
 * Session ids we mint are `crypto.randomUUID()`. Accept that shape and nothing
 * else: it excludes the "/" that would turn the id into a Firestore path.
 */
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Roughly a long page of text — far past any real question about a trail. */
const MAX_MESSAGE_CHARS = 8_000;

/** The client sends the whole transcript; anything beyond this is not a client. */
const MAX_MESSAGES = 200;

/**
 * Appends one turn to the session transcript.
 *
 * Only the turn, not the transcript: the client posts its whole history on every
 * request, and writing that array each time stored the conversation once per
 * turn — an n-turn chat cost n²/2 messages of storage, and a long one would
 * eventually hit Firestore's 1 MiB document ceiling and start failing outright.
 * The documents already carry `createdAt`, so the transcript reassembles in
 * order without each row repeating the ones before it.
 */
async function persistConversation(
  sessionId: string,
  messages: ChatMessage[],
  assistantReply: string,
  uid: string | null,
  log: Logger
): Promise<void> {
  try {
    const db = getFirestoreAdmin();
    const now = new Date().toISOString();
    const session = db.collection('chat_sessions').doc(sessionId);

    await session.set(
      {
        updatedAt: now,
        source: 'fit-ready-iq',
        // Stamped so erasure can find these. Transcripts used to carry no
        // identity at all: the session id was minted by the browser and kept in
        // localStorage, so what a user typed into the assistant — which in a
        // fitness product is routinely health information — was retained
        // indefinitely with no server-side way to answer "delete my data".
        // Null for signed-out callers, who genuinely have no identity to bind.
        user_id: uid,
        expiresAt: chatExpiry(),
      },
      { merge: true }
    );

    await session.collection('messages').add({
      prompt: messages[messages.length - 1]?.content ?? '',
      assistantReply,
      createdAt: now,
      user_id: uid,
      // On the message too, not only the session: a Firestore TTL policy acts
      // on one collection, and deleting a parent document does not touch its
      // subcollection. Without this the messages outlive the session forever.
      expiresAt: chatExpiry(),
    });
  } catch (error) {
    // Deliberately non-fatal: the caller already has their answer, and losing
    // the transcript must not turn a working reply into an error. Logged at
    // warn so a persistent failure is still visible as a trend.
    log.warn('chat_persistence_failed', { error: serializeError(error) });
  }
}

/**
 * How long a transcript lives.
 *
 * Chat history exists to let someone resume a conversation, which is a
 * days-to-weeks need, not a permanent one. Ninety days keeps the feature honest
 * while bounding how much free-text health information sits in the database —
 * the least any of this is worth is the retention limit on it.
 *
 * Enforced by a Firestore TTL policy on `expiresAt` for both `chat_sessions`
 * and `chat_sessions/{id}/messages` (collection-group scope). See
 * docs/runbooks/firestore-ttl.md — without the policy configured this field is
 * inert and nothing is ever deleted.
 */
const CHAT_RETENTION_DAYS = 90;

function chatExpiry(): Date {
  return new Date(Date.now() + CHAT_RETENTION_DAYS * 86_400_000);
}

export async function POST(request: NextRequest) {
  const log = createLogger('/api/chat', request);
  // Before the API key check and before reading the body: a rejected caller
  // should cost us as little as possible.
  const limit = await rateLimit(request, CHAT_RATE_LIMIT);
  if (!limit.ok) return tooManyRequests(limit);

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: 'AI assistant is not configured. Add GEMINI_API_KEY to your environment.' },
      { status: 503 }
    );
  }

  let requestBody: ChatRequestBody;
  try {
    requestBody = (await request.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const messages = requestBody.messages;

  // `sessionId` is interpolated into a Firestore document path, and `.doc()`
  // splits on "/" — an id of "a/messages/b" would resolve to a different
  // collection entirely. Only ids we could have minted ourselves are accepted;
  // anything else gets a fresh one rather than an error, since a bad id is not
  // a reason to refuse the user an answer.
  const requested = requestBody.sessionId;
  const sessionId =
    typeof requested === 'string' && SESSION_ID_PATTERN.test(requested)
      ? requested
      : crypto.randomUUID();

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'Messages array required' }, { status: 400 });
  }

  if (messages.length > MAX_MESSAGES) {
    return NextResponse.json({ error: 'Too many messages' }, { status: 413 });
  }

  const hasInvalidMessage = messages.some(
    (m) =>
      (m.role !== 'assistant' && m.role !== 'user') ||
      typeof m.content !== 'string' ||
      m.content.trim().length === 0
  );

  if (hasInvalidMessage) {
    return NextResponse.json({ error: 'Invalid message format' }, { status: 400 });
  }

  // The history cap below bounds the *number* of turns but not their size, so a
  // single long message could still carry a book's worth of tokens into a paid
  // model — and into a Firestore document, which hard-fails above 1 MiB anyway.
  if (messages.some((m) => m.content.length > MAX_MESSAGE_CHARS)) {
    return NextResponse.json({ error: 'Message too long' }, { status: 413 });
  }

  // Cap context to bound per-request token cost.
  // Slice the most recent MAX_HISTORY messages, then drop one more if needed so the
  // array always starts with a user turn — Gemini requires strict user/model alternation.
  const MAX_HISTORY = 20;
  let trimmed = messages;
  if (messages.length > MAX_HISTORY) {
    const recent = messages.slice(-MAX_HISTORY);
    trimmed = recent[0].role === 'user' ? recent : recent.slice(1);
  }

  const contents = trimmed.map((msg) => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }));

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      log.error('gemini_rejected', undefined, {
        status: response.status,
        upstream: upstreamSnippet(await response.text()),
      });
      return NextResponse.json({ error: 'AI service unavailable' }, { status: 502 });
    }

    const data = await response.json();
    const text =
      data.candidates?.[0]?.content?.parts?.[0]?.text ??
      "I couldn't generate a response. Please try again.";

    await persistConversation(
      sessionId,
      messages,
      text,
      (await optionalUser(request))?.uid ?? null,
      log
    );

    return NextResponse.json({ message: text, sessionId });
  } catch (error) {
    log.error('chat_failed', error);
    return NextResponse.json({ error: 'Failed to reach AI service' }, { status: 500 });
  }
}
