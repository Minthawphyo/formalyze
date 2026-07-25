const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== 'FORMALIZE') return;
  handleFormalize(message.text, message.tone)
    .then(sendResponse)
    .catch((err) => sendResponse({ error: err.message }));
  return true; // keep the message channel open for the async response
});

const REQUEST_TIMEOUT_MS = 45000;

async function handleFormalize(text, tone) {
  const { openaiApiKey } = await chrome.storage.local.get('openaiApiKey');
  if (!openaiApiKey) {
    throw new Error('No OpenAI API key set. Click the Formalyze extension icon to add one.');
  }
  if (!text || !text.trim()) {
    throw new Error('Draft is empty — write something first.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startedAt = performance.now();

  let res;
  try {
    res = await fetch(OPENAI_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiApiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.4,
        messages: [
          { role: 'system', content: buildSystemPrompt(tone) },
          { role: 'user', content: text }
        ]
      })
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`OpenAI request timed out after ${REQUEST_TIMEOUT_MS / 1000}s.`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  console.log(`[Formalyze] OpenAI request took ${Math.round(performance.now() - startedAt)}ms`);

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody?.error?.message || `OpenAI request failed (${res.status})`);
  }

  const data = await res.json();
  const rewritten = data.choices?.[0]?.message?.content?.trim();
  if (!rewritten) throw new Error('OpenAI returned an empty response.');
  return { text: normalizeSpacing(rewritten) };
}

// Gmail's own compose editor already adds visual spacing per line/paragraph
// when rendering — an actual blank line on top of that reads as a much
// bigger gap than intended. Collapse any blank-line breaks down to single
// line breaks so the model's paragraphing doesn't get doubled up visually.
function normalizeSpacing(text) {
  return text.replace(/\n{2,}/g, '\n').trim();
}

function buildSystemPrompt(tone) {
  const toneInstructions = {
    formal: 'Rewrite the email in clear, formal, professional English suitable for a workplace or academic context.',
    veryFormal:
      'Rewrite the email in highly formal, polished English suitable for official correspondence (e.g. addressing a client, professor, or executive).'
  };

  return [
    toneInstructions[tone] || toneInstructions.formal,
    'Preserve the original meaning, facts, and intent exactly — do not add or remove information.',
    'Remove slang, texting abbreviations, and overly casual phrasing.',
    'Keep it concise. Do not add a greeting or sign-off unless the original already had one.',
    'Preserve the original line structure as closely as possible. Use a single line break between paragraphs — never a blank line — and do not introduce new line breaks within a sentence.',
    'Return ONLY the rewritten email text, with no explanation, preamble, or quotation marks.'
  ].join(' ');
}
