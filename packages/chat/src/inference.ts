/**
 * Inference adapter (spec §7.2): OpenAI-compatible client, baseURL-selected
 * (hosted API or local rig, no code changes). Transcription and generation
 * are separate endpoints on the same interface.
 */

export interface TranscriptSegment {
  start: number; // seconds
  end: number;
  text: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface InferenceClient {
  transcribe(videoUrl: string): Promise<TranscriptSegment[]>;
  generate(messages: ChatMessage[], opts?: { json?: boolean }): Promise<string>;
}

/** Real client: OpenAI-compatible /v1/audio/transcriptions + /v1/chat/completions. */
export function createOpenAiClient(opts: {
  baseUrl: string;
  apiKey: string;
  chatModel?: string;
  transcribeModel?: string;
}): InferenceClient {
  const chatModel = opts.chatModel ?? "gpt-4o-mini";
  const transcribeModel = opts.transcribeModel ?? "whisper-1";
  const base = opts.baseUrl.replace(/\/$/, "");

  return {
    async transcribe(videoUrl) {
      const video = await fetch(videoUrl);
      if (!video.ok) throw new Error(`video fetch failed: ${video.status}`);
      const form = new FormData();
      form.append("file", await video.blob(), "video.mp4");
      form.append("model", transcribeModel);
      form.append("response_format", "verbose_json");
      form.append("timestamp_granularities[]", "segment");

      const res = await fetch(`${base}/v1/audio/transcriptions`, {
        method: "POST",
        headers: { authorization: `Bearer ${opts.apiKey}` },
        body: form,
      });
      if (!res.ok) throw new Error(`transcribe failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
      const json = (await res.json()) as { segments?: { start: number; end: number; text: string }[] };
      return (json.segments ?? []).map((s) => ({ start: s.start, end: s.end, text: s.text.trim() }));
    },

    async generate(messages, genOpts) {
      const res = await fetch(`${base}/v1/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${opts.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: chatModel,
          messages,
          temperature: 0.9,
          ...(genOpts?.json ? { response_format: { type: "json_object" } } : {}),
        }),
      });
      if (!res.ok) throw new Error(`generate failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
      const json = (await res.json()) as { choices: { message: { content: string } }[] };
      return json.choices[0].message.content;
    },
  };
}

/**
 * Mock client for development and e2e: deterministic transcript + templated
 * lines that reference the transcript (so grounding validation passes)
 * without any keys. Activated by INFERENCE_BASE_URL=mock.
 */
export function createMockClient(): InferenceClient {
  return {
    async transcribe() {
      return [
        { start: 0, end: 15, text: "Welcome everyone, thanks for joining the session today." },
        { start: 15, end: 40, text: "Over the last year we grew retention from 40 percent to 65 percent using this exact framework." },
        { start: 40, end: 80, text: "The framework has three steps: diagnose, design, and deploy. Diagnose first, always." },
        { start: 80, end: 120, text: "Let me tell you about Sarah, a client who was skeptical about the diagnose step." },
        { start: 120, end: 150, text: "So here is the offer: the One Time Suite, everything we covered, one price." },
        { start: 150, end: 180, text: "You get the templates, the replay, and the worksheet while it is available." },
      ];
    },
    async generate(messages) {
      // extract the last user message
      const last = messages[messages.length - 1]?.content ?? "";
      // mine mentions from the transcript slice in the prompt (mirrors the
      // real LLM being grounded by instruction); fall back to global terms
      const slice = last.match(/"""([\s\S]*?)"""/)?.[1] ?? last;
      const mined = (slice.toLowerCase().match(/[a-z0-9%]{5,}/g) ?? []).filter(
        (w, i, arr) =>
          arr.indexOf(w) === i &&
          !["welcome", "everyone", "thanks", "joining", "session", "today", "covered", "templates", "using", "their", "there", "which", "while", "available", "exactly", "would", "could", "should"].includes(w),
      );
      const mentions = mined.length > 0 ? mined : ["diagnose", "framework", "replay"];
      const beatType = last.match(/Beat type: (\w+)/)?.[1] ?? "teaching";
      const requested = Number(last.match(/Write exactly (\d+) lines/i)?.[1]);
      const count = Number.isFinite(requested) && requested > 0
        ? Math.min(requested, 12)
        : Math.max(2, Math.min(6, Math.floor(last.length % 5) + 2));

      const lines: { offset: number; name: string; mode: string; text: string }[] = [];
      for (let i = 0; i < count; i++) {
        const mention = mentions[i % mentions.length];
        const isQuestion = i % 3 === 1;
        lines.push({
          offset: 0,
          name: "{{persona}}",
          mode: isQuestion ? "question" : "chat",
          text: isQuestion
            ? `wait, did he say ${mention} or am I hearing that wrong?`
            : `the ${mention} point at this ${beatType} part is exactly what I needed (${i})`,
        });
      }
      return JSON.stringify({ lines });
    },
  };
}

/** Env-selected adapter: mock when INFERENCE_BASE_URL=mock or unset. */
export function createInferenceFromEnv(): InferenceClient {
  const baseUrl = process.env.INFERENCE_BASE_URL;
  const apiKey = process.env.INFERENCE_API_KEY;
  if (!baseUrl || baseUrl === "mock" || !apiKey) return createMockClient();
  return createOpenAiClient({
    baseUrl,
    apiKey,
    chatModel: process.env.INFERENCE_MODEL,
    transcribeModel: process.env.TRANSCRIBE_MODEL,
  });
}
