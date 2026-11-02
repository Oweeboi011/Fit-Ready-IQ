import { NextRequest, NextResponse } from 'next/server';

import { GET as weatherRoute } from '@/app/api/weather/route';
import {
  TOOL_DECLARATIONS,
  parseChatContext,
  runTool,
  type ChatContext,
  type SaveProposal,
} from '@/lib/chatTools';
import { createLogger, serializeError, upstreamSnippet, type Logger } from '@/lib/logger';
import { getFirestoreAdmin, isFirebaseAdminConfigured } from '@/lib/firebaseAdmin';
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
  /** The open place and the user's location, for tools. See `lib/chatTools.ts`. */
  context?: unknown;
}

const SYSTEM_PROMPT = `You are an adventure readiness assistant for Fit Ready IQ — an outdoor fitness and route planning platform.
You help users:
- Assess fitness readiness for trails, mountains, and camping trips
- Discover nearby hiking trails, peaks, and campsites
- Plan adventures with safety and fitness in mind
- Understand route difficulty, elevation gain, and gear requirements
- Get training advice for upcoming outdoor challenges

Keep responses concise, friendly, and safety-conscious. Use bullet points for lists.
Never exceed 150 words unless the user explicitly asks for detailed information.

You have tools. When the user asks about "this route", "this peak" or the place they are
looking at, call analyze_open_place and use only the numbers it returns; anything it lists
as unknown, say is unknown — never estimate it. For conditions or when to go, call
analyze_weather. If the user asks to save or bookmark the open place, call
propose_save_open_place; it only offers a Save button, so never say the place is saved.`;

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
 * The raw body, checked before it is parsed. The per-message and per-count caps
 * above still let a body reach 1.6 MB, all of it parsed before being trimmed to
 * the 20 turns actually used. The client sends only those 20.
 */
const MAX_BODY_BYTES = 256 * 1024;

/** How much context goes to the model, in messages (ten exchanges). */
const MAX_HISTORY = 20;

/** Upper bound on one Gemini call. The route's own budget is 30 s (vercel.json). */
const GEMINI_TIMEOUT_MS = 20_000;

/**
 * Model calls per turn: the answer, plus up to two rounds of tool use. Each
 * round is another billed call inside one rate-limited turn, so the ceiling
 * keeps a turn's cost bounded; the tools are cheap enough that two rounds
 * cover "analyze this and check the weather".
 */
const MAX_MODEL_CALLS = 3;

/** The whole turn, tool rounds included, must finish inside the 30 s function budget. */
const TURN_BUDGET_MS = 26_000;

interface ResolvedSession {
  id: string;
  /** True when this request must create the session document. */
  isNew: boolean;
}

/**
 * Decides which transcript this turn belongs to.
 *
 * A session's owner is fixed when the server creates it and never changes. The
 * route used to `set({ user_id }, { merge: true })` on every turn, so whoever
 * last posted to a session id became its owner: anyone holding someone else's
 * id could re-file that transcript under their own uid and then read it back
 * through `/api/account/export`, or post signed-out and knock it back to
 * anonymous, out of reach of erasure.
 *
 * So a requested id is honoured only when it exists and belongs to this caller
 * (the same uid, or anonymous for anonymous). Anything else — unknown, someone
 * else's, malformed — gets a fresh id minted here, never one the client chose,
 * and the client adopts it from the response. A refused id is not a reason to
 * refuse the user an answer, so this never errors.
 */
async function resolveSession(
  requested: unknown,
  uid: string | null,
  log: Logger
): Promise<ResolvedSession> {
  const fresh = { id: crypto.randomUUID(), isNew: true };
  // Signed-out conversations are not stored (see POST), so there is no
  // session of theirs to find.
  if (uid === null) return fresh;

  // `sessionId` is interpolated into a Firestore document path, and `.doc()`
  // splits on "/" — an id of "a/messages/b" would resolve to a different
  // collection entirely. Only ids we could have minted ourselves are looked up.
  if (typeof requested !== 'string' || !SESSION_ID_PATTERN.test(requested)) return fresh;
  if (!isFirebaseAdminConfigured()) return fresh;

  try {
    const snapshot = await getFirestoreAdmin().collection('chat_sessions').doc(requested).get();
    if (!snapshot.exists) return fresh;

    const owner = (snapshot.data()?.user_id as string | null | undefined) ?? null;
    if (owner !== uid) {
      // Expected when someone signs in or out mid-conversation, so info, not
      // warn. Neither id is logged: a session id is a bearer capability.
      log.info('chat_session_not_owned', { signedIn: uid !== null });
      return fresh;
    }
    return { id: requested, isNew: false };
  } catch (error) {
    log.warn('chat_session_lookup_failed', { error: serializeError(error) });
    return fresh;
  }
}

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
  session: ResolvedSession,
  prompt: string,
  assistantReply: string,
  uid: string,
  log: Logger
): Promise<void> {
  if (!isFirebaseAdminConfigured()) return;

  try {
    const db = getFirestoreAdmin();
    const now = new Date().toISOString();
    const ref = db.collection('chat_sessions').doc(session.id);

    if (session.isNew) {
      // `create`, not `set`: it fails if the document already exists, so an
      // owner can only ever be written once.
      await ref.create({
        createdAt: now,
        updatedAt: now,
        source: 'fit-ready-iq',
        // Stamped so erasure can find these. What a user types into the
        // assistant is, in a fitness product, routinely health information.
        user_id: uid,
        expiresAt: chatExpiry(),
      });
    } else {
      // No `user_id` here — see resolveSession for why ownership is immutable.
      await ref.update({ updatedAt: now, expiresAt: chatExpiry() });
    }

    await ref.collection('messages').add({
      prompt,
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
 * docs/guides/runbooks/firestore-ttl.md — without the policy configured this field is
 * inert and nothing is ever deleted.
 */
const CHAT_RETENTION_DAYS = 90;

function chatExpiry(): Date {
  return new Date(Date.now() + CHAT_RETENTION_DAYS * 86_400_000);
}

/**
 * The stored transcript of a session, oldest first, as model context.
 *
 * For a session we already hold, the context comes from here rather than the
 * request. The client posts its history on every turn, and it used to go to
 * Gemini as sent — so a caller could write the assistant's side of the
 * conversation for it, and a transcript "resumed" from the browser need not be
 * the one we actually had.
 */
async function storedHistory(sessionId: string): Promise<ChatMessage[]> {
  const snapshot = await getFirestoreAdmin()
    .collection('chat_sessions')
    .doc(sessionId)
    .collection('messages')
    .orderBy('createdAt', 'desc')
    .limit(MAX_HISTORY / 2)
    .get();

  return snapshot.docs.reverse().flatMap((doc) => {
    const { prompt, assistantReply } = doc.data() as { prompt?: unknown; assistantReply?: unknown };
    return typeof prompt === 'string' && typeof assistantReply === 'string'
      ? [
          { role: 'user' as const, content: prompt },
          { role: 'assistant' as const, content: assistantReply },
        ]
      : [];
  });
}

/**
 * The client's own history, for a conversation we hold no record of — a new
 * session, or a signed-out caller. It is unverifiable, but it only ever shapes
 * that caller's own reply, and nothing of it is stored beyond their last turn.
 * Trimmed to start on a user turn, which Gemini requires.
 */
function clientHistory(messages: ChatMessage[]): ChatMessage[] {
  const recent = messages.slice(-MAX_HISTORY);
  const firstUser = recent.findIndex((m) => m.role === 'user');
  return firstUser === -1 ? [] : recent.slice(firstUser);
}

function isValidMessage(m: ChatMessage): boolean {
  return (
    (m?.role === 'assistant' || m?.role === 'user') &&
    typeof m.content === 'string' &&
    m.content.trim().length > 0
  );
}

/** Parses and validates the body; returns the error response when it is unusable. */
async function parseMessages(
  request: NextRequest
): Promise<{ messages: ChatMessage[]; sessionId: unknown; context: ChatContext } | NextResponse> {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Request too large' }, { status: 413 });
  }

  let requestBody: ChatRequestBody;
  try {
    requestBody = JSON.parse(raw) as ChatRequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const messages = requestBody?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'Messages array required' }, { status: 400 });
  }
  if (messages.length > MAX_MESSAGES) {
    return NextResponse.json({ error: 'Too many messages' }, { status: 413 });
  }

  // The turn being asked must be the user's. It is the one part of the body
  // that is stored, so it has to be something the user actually said.
  if (!messages.every(isValidMessage) || messages[messages.length - 1].role !== 'user') {
    return NextResponse.json({ error: 'Invalid message format' }, { status: 400 });
  }

  // The history cap bounds the *number* of turns but not their size, so a
  // single long message could still carry a book's worth of tokens into a paid
  // model — and into a Firestore document, which hard-fails above 1 MiB anyway.
  if (messages.some((m) => m.content.length > MAX_MESSAGE_CHARS)) {
    return NextResponse.json({ error: 'Message too long' }, { status: 413 });
  }

  return {
    messages,
    sessionId: requestBody.sessionId,
    context: parseChatContext(requestBody.context),
  };
}

/** What goes to the model: our record for a session we hold, else the client's. */
async function modelContext(
  session: ResolvedSession,
  messages: ChatMessage[],
  log: Logger
): Promise<ChatMessage[]> {
  const turn = messages[messages.length - 1];
  if (session.isNew) return clientHistory(messages);
  try {
    return [...(await storedHistory(session.id)), turn];
  } catch (error) {
    // Without the record, answer the question alone rather than fall back to
    // trusting the client's version of it.
    log.warn('chat_history_unavailable', { error: serializeError(error) });
    return [turn];
  }
}

export async function POST(request: NextRequest) {
  const log = createLogger('/api/chat', request);

  // Identity first, because the limiter keys on it. A bearer string that fails
  // verification is simply anonymous, and anonymous is budgeted per IP — a
  // made-up token no longer buys a fresh allowance of paid inference.
  const caller = await optionalUser(request);
  const uid = caller?.uid ?? null;

  // Before the API key check and before reading the body: a rejected caller
  // should cost us as little as possible.
  const limit = await rateLimit(request, CHAT_RATE_LIMIT, caller);
  if (!limit.ok) return tooManyRequests(limit);

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: 'AI assistant is not configured. Add GEMINI_API_KEY to your environment.' },
      { status: 503 }
    );
  }

  const parsed = await parseMessages(request);
  if (parsed instanceof NextResponse) return parsed;
  const { messages } = parsed;

  const session = await resolveSession(parsed.sessionId, uid, log);
  const contents = (await modelContext(session, messages, log)).map((msg) => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }));

  try {
    const turn = await converse(contents, parsed.context, apiKey, request, log);
    if (turn instanceof NextResponse) return turn;
    const { text, proposal } = turn;

    // Only signed-in conversations are kept. A signed-out transcript has no
    // owner to hand it back to or erase it for — it would sit for ninety days
    // as health information nobody could ask us to delete. The browser keeps
    // its own copy for the next turn.
    if (uid === null) return NextResponse.json({ message: text, proposal });

    await persistConversation(session, messages[messages.length - 1].content, text, uid, log);
    return NextResponse.json({ message: text, sessionId: session.id, proposal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      log.error('gemini_timeout', error, { timeoutMs: GEMINI_TIMEOUT_MS });
      return NextResponse.json({ error: 'AI service timed out' }, { status: 504 });
    }
    log.error('chat_failed', error);
    return NextResponse.json({ error: 'Failed to reach AI service' }, { status: 500 });
  }
}

type GeminiPart = {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
};
type GeminiContent = { role: string; parts: GeminiPart[] };

/**
 * One Gemini call. Returns the model's content, or the response to send when
 * the call failed — a refusal is a 502 the client can retry, never a guess.
 */
async function callGemini(
  contents: GeminiContent[],
  apiKey: string,
  deadline: number,
  log: Logger
): Promise<GeminiContent | NextResponse> {
  const response = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    {
      method: 'POST',
      // The key rides in a header, not `?key=`: URLs are what proxies, APM
      // agents and fetch error messages record, and headers are what the
      // logger redacts.
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      // Without a deadline a stalled upstream holds the function until the
      // platform kills it, and the user gets a bare 504 instead of a retry.
      signal: AbortSignal.timeout(
        Math.max(1_000, Math.min(GEMINI_TIMEOUT_MS, deadline - Date.now()))
      ),
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
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
  return (
    (data.candidates?.[0]?.content as GeminiContent | undefined) ?? { role: 'model', parts: [] }
  );
}

/**
 * The weather tool, answered by the weather route itself with the caller's own
 * headers: the same providers, failover and window logic as the details view,
 * charged to the caller's weather budget rather than to a shared server bucket.
 */
function weatherFor(request: NextRequest) {
  return async (lat: number, lng: number, hours: number | null) => {
    const url = new URL('/api/weather', request.url);
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lng', String(lng));
    if (hours) url.searchParams.set('hours', String(hours));
    const res = await weatherRoute(new NextRequest(url, { headers: request.headers }));
    if (!res.ok) throw new Error(`weather ${res.status}`);
    return res.json();
  };
}

/** The text of a model reply, joined across parts. */
function replyText(reply: GeminiContent): string {
  return reply.parts
    .map((p) => p.text ?? '')
    .join('')
    .trim();
}

const NO_ANSWER = "I couldn't generate a response. Please try again.";

const TOOL_RESPONSE_MAX_DEPTH = 4;
const TOOL_RESPONSE_MAX_ARRAY = 20;
const TOOL_RESPONSE_MAX_KEYS = 40;
const TOOL_RESPONSE_MAX_STRING = 500;

function looksInstructionLike(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes('ignore previous') ||
    t.includes('system prompt') ||
    t.includes('developer message') ||
    t.includes('tool instructions') ||
    t.includes('you must') ||
    t.includes('call tool')
  );
}

function sanitizeToolValue(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;

  if (typeof value === 'string') {
    const clipped = value.length > TOOL_RESPONSE_MAX_STRING
      ? `${value.slice(0, TOOL_RESPONSE_MAX_STRING)}…`
      : value;
    return looksInstructionLike(clipped)
      ? '[redacted instruction-like tool text]'
      : clipped;
  }

  if (depth >= TOOL_RESPONSE_MAX_DEPTH) return '[truncated]';

  if (Array.isArray(value)) {
    return value.slice(0, TOOL_RESPONSE_MAX_ARRAY).map((v) => sanitizeToolValue(v, depth + 1));
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, TOOL_RESPONSE_MAX_KEYS);
    const out: Record<string, unknown> = {};
    for (const [k, v] of entries) out[k] = sanitizeToolValue(v, depth + 1);
    return out;
  }

  return String(value);
}

/**
 * A turn: ask the model, run any tools it asks for, and ask again with their
 * results, until it answers in text or the round limit is reached.
 */
async function converse(
  contents: GeminiContent[],
  context: ChatContext,
  apiKey: string,
  request: NextRequest,
  log: Logger
): Promise<{ text: string; proposal?: SaveProposal } | NextResponse> {
  const deadline = Date.now() + TURN_BUDGET_MS;
  const deps = { weather: weatherFor(request) };
  let proposal: SaveProposal | undefined;

  for (let call = 1; call <= MAX_MODEL_CALLS; call++) {
    const reply = await callGemini(contents, apiKey, deadline, log);
    if (reply instanceof NextResponse) return reply;

    const calls = reply.parts.flatMap((p) => (p.functionCall ? [p.functionCall] : []));
    if (calls.length === 0 || call === MAX_MODEL_CALLS) {
      return { text: replyText(reply) || NO_ANSWER, proposal };
    }

    const results: GeminiPart[] = [];
    for (const fc of calls) {
      const outcome = await runTool(fc.name, fc.args ?? {}, context, deps);
      proposal = outcome.proposal ?? proposal;
      log.info('chat_tool_called', { tool: fc.name, ok: !('error' in outcome.response) });
      const safeResponse = sanitizeToolValue(outcome.response);
      results.push({ functionResponse: { name: fc.name, response: safeResponse } });
    }
    contents = [...contents, reply, { role: 'user', parts: results }];
  }
  return { text: NO_ANSWER, proposal };
}
