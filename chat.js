// Netlify Serverless Function: netlify/functions/chat.js
// Powered by Google Gemini API (Free Tier friendly — zero npm dependencies required)

const SYSTEM_INSTRUCTION = `You are lioncouch, the elite AI Discipline Mentor & Program Architect inside LIONhabits.
Tone: Direct, ruthless about excuses, stoic, concise, and actionable. Respond in English.

CAPABILITIES:
1. Coaching: Give sharp, concrete discipline, habit, deep work, dopamine control, and training advice.
2. Create New Plan: When the user asks to create/generate a new plan (e.g. 7, 14, 21, 30, or up to 90 days), reply with a brief motivating summary AND include a JSON block in \`\`\`json ... \`\`\` format with "action": "create".
3. Edit Existing Tracker: You are given the user's CURRENT TRACKER in the prompt. When the user asks to modify, add, remove, or adjust tasks or days in their existing plan (e.g. "Add cold shower to Day 3", "Remove running from all days", "Make Day 4 harder"), reply with a short confirmation of what you changed AND include the FULL updated tracker inside a \`\`\`json ... \`\`\` block with "action": "edit".

CRITICAL RULES FOR EDITING:
- ALWAYS preserve every existing task's exact "done": true/false value unless the user explicitly asks to reset it.
- Keep all unchanged days and tasks intact. Do not drop days unless asked.

EXACT JSON SCHEMA (include inside \`\`\`json ... \`\`\` ONLY when creating or editing a plan):
\`\`\`json
{
  "action": "create" | "edit",
  "title": "Plan Title",
  "overview": "Short program philosophy and execution rule",
  "emoji": "🦁",
  "days": [
    {
      "day": 1,
      "title": "Day 1 Focus Title",
      "standard": "Core daily standard",
      "tasks": [
        {
          "title": "Actionable task title",
          "note": "Brief explanation of how/why to execute it",
          "done": false
        }
      ]
    }
  ]
}
\`\`\`
If the user is just chatting or asking for advice (not creating or editing a plan), do NOT output a JSON block.`;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Missing GEMINI_API_KEY in Netlify Environment Variables.' })
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const userMessage = String(body.message || '').trim();
    const history = Array.isArray(body.messages) ? body.messages : [];
    const currentPlan = body.currentPlan || null;

    if (!userMessage) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Message is required.' }) };
    }

    // Build Gemini conversation history
    const contents = [];

    if (currentPlan && Array.isArray(currentPlan.days)) {
      contents.push({
        role: 'user',
        parts: [{
          text: `[SYSTEM CONTEXT — USER'S CURRENT ACTIVE TRACKER]
${JSON.stringify(currentPlan)}`
        }]
      });
      contents.push({
        role: 'model',
        parts: [{
          text: 'Understood. I have your current tracker loaded and will preserve your completed progress if you ask me to edit it.'
        }]
      });
    }

    // Append recent messages (excluding the very last one if duplicated)
    const recent = history.slice(-10);
    for (const msg of recent) {
      if (!msg || !msg.content) continue;
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: String(msg.content) }]
      });
    }

    // Ensure the latest user message is at the end
    const lastContent = contents[contents.length - 1];
    if (!lastContent || lastContent.role !== 'user' || lastContent.parts[0].text !== userMessage) {
      contents.push({
        role: 'user',
        parts: [{ text: userMessage }]
      });
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;

    const geminiRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: SYSTEM_INSTRUCTION }]
        },
        contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 4096
        }
      })
    });

    const data = await geminiRes.json();

    if (!geminiRes.ok) {
      return {
        statusCode: geminiRes.status,
        headers,
        body: JSON.stringify({ error: data?.error?.message || 'Gemini API request failed' })
      };
    }

    const reply = data?.candidates?.[0]?.content?.parts
      ?.map(p => p.text || '')
      .join('
')
      .trim() || '';

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ reply })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message || 'Internal Server Error' })
    };
  }
};
