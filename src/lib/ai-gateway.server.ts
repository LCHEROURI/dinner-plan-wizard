// Server-only Lovable AI Gateway helper.
export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export async function callLovableAiJSON<T = unknown>(params: {
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}): Promise<T> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
    },
    body: JSON.stringify({
      model: params.model ?? "google/gemini-2.5-flash",
      messages: params.messages,
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens ?? 8192,
      response_format: { type: "json_object" },
    }),
  });

  if (res.status === 429) throw new Error("Rate limited — please try again in a moment.");
  if (res.status === 402) throw new Error("AI credits exhausted — add credits in workspace billing.");
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AI Gateway error ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI returned no content");

  // Gemini sometimes wraps json in ```json ... ```
  const cleaned = content.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new Error("AI response was not valid JSON");
  }
}
