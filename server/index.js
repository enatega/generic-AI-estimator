import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

const app = express();
const port = Number(process.env.PORT || 5174);
const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const openAiModel = process.env.OPENAI_MODEL || 'gpt-5.4-mini';

app.use(helmet());
app.use(cors({ origin: clientOrigin }));
app.use(express.json({ limit: '32kb' }));

const limiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please try again later.' },
});

const requestSchema = z.object({
  description: z.string().trim().min(20, 'Please enter a more detailed project description, at least 20 characters.').max(4000, 'Project description is too long. Please keep it under 4000 characters.'),
  hourly_rate: z.coerce.number().positive('Please enter a valid hourly charge.').max(10000, 'Hourly charge is too high.'),
  workforce: z.coerce.number().int().positive('Please enter a valid workforce number.').max(100, 'Workforce number is too high.'),
});

const estimateSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    project_type: { type: 'string' },
    complexity: { type: 'string', enum: ['Low', 'Medium', 'High', 'Very High'] },
    min_hours: { type: 'integer' },
    max_hours: { type: 'integer' },
    summary: { type: 'string' },
    assumptions: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 4 },
  },
  required: ['project_type', 'complexity', 'min_hours', 'max_hours', 'summary', 'assumptions'],
};

const developerPrompt = `You estimate software, web, app, ecommerce, SaaS, automation, marketplace, and general digital projects from brief project descriptions.

Rules:
- Return only data that matches the JSON schema exactly.
- Return a raw JSON object only. Do not wrap it in markdown, backticks, or explanation text.
- Be realistic and conservative.
- Always return a range for total project effort hours using min_hours and max_hours.
- min_hours and max_hours must represent total effort before workforce division.
- Do not calculate cost.
- Do not calculate workforce-based completion hours.
- Do not return timeline in days or weeks.
- If the project is vague, still provide a broad estimate based on the most likely interpretation.
- Assume professional implementation quality.
- Do not mention money.
- Do not ask follow-up questions.
- Keep summary concise and useful.
- assumptions should be short bullet-style strings.`;

function cleanJsonOutput(text) {
  let output = String(text || '').trim();
  output = output.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '').trim();
  const start = output.indexOf('{');
  const end = output.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    output = output.slice(start, end + 1);
  }
  return output.trim();
}

function extractOutputText(data) {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();
  if (!Array.isArray(data?.output)) return '';

  const chunks = [];
  for (const outputItem of data.output) {
    if (!Array.isArray(outputItem?.content)) continue;
    for (const contentItem of outputItem.content) {
      if (['output_text', 'text'].includes(contentItem?.type) && typeof contentItem?.text === 'string') {
        chunks.push(contentItem.text);
      }
    }
  }
  return chunks.join('\n').trim();
}

async function callOpenAiForEstimate(description) {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error('Server configuration error: OPENAI_API_KEY is not set.');
    error.status = 500;
    throw error;
  }

  const payload = {
    model: openAiModel,
    input: [
      { role: 'developer', content: [{ type: 'input_text', text: developerPrompt }] },
      { role: 'user', content: [{ type: 'input_text', text: description }] },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'project_estimate',
        strict: true,
        schema: estimateSchema,
      },
    },
    max_output_tokens: 500,
  };

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.error?.message || 'OpenAI request failed.');
    error.status = 500;
    throw error;
  }

  const textOutput = extractOutputText(data);
  if (!textOutput) {
    const error = new Error('OpenAI returned no text output.');
    error.status = 500;
    throw error;
  }

  try {
    return JSON.parse(cleanJsonOutput(textOutput));
  } catch {
    const error = new Error('OpenAI returned malformed JSON.');
    error.status = 500;
    throw error;
  }
}

app.post('/api/estimate', limiter, async (req, res) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid request.' });
  }

  try {
    const { description, hourly_rate: hourlyRate, workforce } = parsed.data;
    const openAiResult = await callOpenAiForEstimate(description);

    const minHours = Math.max(1, Number.parseInt(openAiResult.min_hours, 10));
    const maxHours = Math.max(minHours, Number.parseInt(openAiResult.max_hours, 10));
    const minCompletionHours = Number((minHours / workforce).toFixed(1));
    const maxCompletionHours = Number((maxHours / workforce).toFixed(1));
    const minCost = Number((minCompletionHours * hourlyRate).toFixed(2));
    const maxCost = Number((maxCompletionHours * hourlyRate).toFixed(2));

    return res.json({
      success: true,
      project_type: String(openAiResult.project_type || ''),
      complexity: String(openAiResult.complexity || ''),
      min_total_hours: minHours,
      max_total_hours: maxHours,
      min_completion_hours: minCompletionHours,
      max_completion_hours: maxCompletionHours,
      hourly_rate: hourlyRate,
      workforce,
      min_cost: minCost,
      max_cost: maxCost,
      summary: String(openAiResult.summary || ''),
      assumptions: Array.isArray(openAiResult.assumptions) ? openAiResult.assumptions.map(String) : [],
    });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || 'Something went wrong. Please try again.' });
  }
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.listen(port, () => {
  console.log(`AI Estimator API running on http://localhost:${port}`);
});
