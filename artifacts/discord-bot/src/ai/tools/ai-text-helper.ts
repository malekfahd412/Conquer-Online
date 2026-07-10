const GEMINI_API_KEY = process.env['GEMINI_API_KEY'];
const OPENAI_API_KEY = process.env['OPENAI_API_KEY'];
const AI_PROVIDER = process.env['AI_PROVIDER'] ?? 'gemini';

export async function aiTransform(instruction: string, text: string): Promise<string> {
  const prompt = `${instruction}\n\nText:\n"""\n${text}\n"""\n\nRespond with ONLY the transformed text, no explanations or extra commentary.`;

  try {
    if (AI_PROVIDER === 'gemini' && GEMINI_API_KEY) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        },
      );
      const json = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      return json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? text;
    }

    if (OPENAI_API_KEY) {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1000,
        }),
      });
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return json?.choices?.[0]?.message?.content?.trim() ?? text;
    }
  } catch {
    // fall through
  }

  return `[AI unavailable — no provider configured]\n\nOriginal: ${text}`;
}
