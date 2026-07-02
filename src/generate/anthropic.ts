import Anthropic from '@anthropic-ai/sdk';
import type { DatasetDump } from '../datasets.js';
import type { GenerationConfig, SystemHint } from './config.js';

/** Default model. Override with --model or ANTHROPIC_MODEL. */
export const DEFAULT_MODEL = 'claude-opus-4-8';

/** Resolve the model to use: explicit arg > ANTHROPIC_MODEL env > default. */
export function resolveModel(explicit?: string): string {
  return explicit || process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
}

const SYSTEM_PROMPT = [
  'You generate synthetic seed data for openfn-mocker, a mock server that impersonates',
  'external systems (DHIS2, FHIR, CommCare, Twilio, ...) so OpenFn workflows can be tested.',
  'You are given the DEFAULT seed data for one system as a concrete example, plus a',
  'description of a project. Produce a NEW dataset for that system, re-flavoured for the',
  'project, that is structurally identical to the example.',
  '',
  'Hard requirements:',
  '- Output a single JSON object of the exact shape { "<collection>": { "<id>": <record> } }.',
  '- Keep the SAME collection names and the SAME set of record fields as the example.',
  '- Keep each id in the SAME format as the example ids (e.g. DHIS2 11-char uids, "pat-1",',
  '  "case-0001", "SM"+32 hex). Reuse the example ids where they are referenced across',
  '  records so cross-references stay valid.',
  '- Preserve every cross-reference relationship shown in the example (e.g. a FHIR',
  '  Observation.subject pointing at a Patient id, a parent org-unit id, an incident that',
  '  references a case id). If you rename an id, update every reference to it.',
  '- Keep roughly the same number of records per collection as the example.',
  '- Only change the human-facing content (names, places, phone numbers, dates, free text,',
  '  code displays) to fit the project. Keep enums, systems/URLs, and structural codes valid.',
  '- Output ONLY the JSON object. No prose, no markdown fences, no comments.',
].join('\n');

function buildUserPrompt(
  system: string,
  exampleDump: DatasetDump,
  config: GenerationConfig,
  hint: SystemHint | undefined
): string {
  const parts: string[] = [];
  parts.push(`PROJECT: ${config.name}`);
  parts.push('');
  parts.push('PROJECT DESCRIPTION:');
  parts.push(config.description);
  parts.push('');
  parts.push(`SYSTEM TO GENERATE: ${system}`);
  if (hint?.description) {
    parts.push('');
    parts.push(`GUIDANCE FOR ${system}:`);
    parts.push(hint.description);
  }
  if (hint?.collections && Object.keys(hint.collections).length) {
    parts.push('');
    parts.push('PER-COLLECTION GUIDANCE:');
    for (const [col, guidance] of Object.entries(hint.collections)) {
      parts.push(`- ${col}: ${guidance}`);
    }
  }
  parts.push('');
  parts.push('EXAMPLE (the DEFAULT dataset for this system — match its shape exactly):');
  parts.push(JSON.stringify(exampleDump, null, 2));
  parts.push('');
  parts.push('Now output the re-flavoured JSON object for this system.');
  return parts.join('\n');
}

/** Pull all text out of a message's content blocks. */
function extractText(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

/** Extract a JSON object from a model response (tolerating stray fences/prose). */
export function parseDumpResponse(text: string): DatasetDump {
  let body = text.trim();
  const fence = body.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) body = fence[1].trim();
  const first = body.indexOf('{');
  const last = body.lastIndexOf('}');
  if (first === -1 || last === -1 || last < first) {
    throw new Error('No JSON object found in model response.');
  }
  const parsed = JSON.parse(body.slice(first, last + 1));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Model response was not a JSON object.');
  }
  return normalizeDump(parsed as Record<string, unknown>);
}

/**
 * Coerce a parsed object into `{ collection: { id: record } }`. If the model
 * returned a collection as an array, key it by a plausible id field (falling
 * back to the index) so the loader stays dumb.
 */
function normalizeDump(parsed: Record<string, unknown>): DatasetDump {
  const out: DatasetDump = {};
  for (const [collection, value] of Object.entries(parsed)) {
    if (Array.isArray(value)) {
      const byId: Record<string, unknown> = {};
      value.forEach((record, i) => {
        const r = (record ?? {}) as Record<string, unknown>;
        const id = r.id ?? r.uuid ?? r.uid ?? r.case_id ?? r.sid ?? r._id ?? String(i);
        byId[String(id)] = record;
      });
      out[collection] = byId;
    } else if (value && typeof value === 'object') {
      out[collection] = value as Record<string, unknown>;
    }
  }
  return out;
}

export interface GenerateSystemOptions {
  client: Anthropic;
  model: string;
  system: string;
  exampleDump: DatasetDump;
  config: GenerationConfig;
  hint?: SystemHint;
}

/**
 * Ask the model to generate one system's dump. Streams (large outputs), parses,
 * and retries once with the parse error fed back if the first response is not
 * valid JSON.
 */
export async function generateSystemDump(opts: GenerateSystemOptions): Promise<DatasetDump> {
  const { client, model, system, exampleDump, config, hint } = opts;
  const userPrompt = buildUserPrompt(system, exampleDump, config, hint);

  const call = async (messages: Anthropic.MessageParam[]): Promise<string> => {
    const stream = client.messages.stream({
      model,
      max_tokens: 32000,
      system: SYSTEM_PROMPT,
      output_config: { effort: 'medium' },
      messages,
    });
    return extractText(await stream.finalMessage());
  };

  const firstText = await call([{ role: 'user', content: userPrompt }]);
  try {
    return parseDumpResponse(firstText);
  } catch (err) {
    // One repair attempt: show the model its output and the parse error.
    const repairText = await call([
      { role: 'user', content: userPrompt },
      { role: 'assistant', content: firstText },
      {
        role: 'user',
        content:
          `That was not valid JSON (${(err as Error).message}). ` +
          'Reply with ONLY the corrected JSON object of shape { "<collection>": { "<id>": <record> } } — no prose, no fences.',
      },
    ]);
    return parseDumpResponse(repairText);
  }
}
