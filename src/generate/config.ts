import { readFileSync } from 'node:fs';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

/**
 * A generation config describes the *nature of a project* so the LLM can produce
 * seed data flavoured for it. It is deliberately separate from `mock.config.yaml`
 * (which is a runtime concern: ports, which systems are enabled). A copy of the
 * config that produced a dataset is stored alongside it in the dataset folder.
 *
 * Example (`datasets/dominican-republic/dataset.yaml`):
 *
 *   name: dominican-republic
 *   description: >
 *     A maternal-health demo set in the Dominican Republic. Patients and staff
 *     have Dominican Spanish names; facilities are real DR provinces/municipios;
 *     phone numbers use the +1-809 area code; messages are in Spanish.
 *   systems:
 *     dhis2:
 *       description: Org-unit hierarchy = country -> province -> municipio using real DR names.
 *       collections:
 *         organisationUnits: "Distrito Nacional, Santiago, Santo Domingo, etc."
 *     twilio:
 *       description: Appointment-reminder SMS written in Spanish, +1-809 numbers.
 */
export interface GenerationConfig {
  /** Dataset name (also the folder name under datasets/). */
  name: string;
  /** High-level prose describing the project/scenario. Fed to the LLM verbatim. */
  description: string;
  /** Optional per-system flavour hints, keyed by system name (dhis2, fhir, ...). */
  systems?: Record<string, SystemHint>;
}

export interface SystemHint {
  /** Prose guidance for this whole system. */
  description?: string;
  /** Per-collection guidance, keyed by collection name (e.g. organisationUnits). */
  collections?: Record<string, string>;
}

/** Parse + validate a generation config from YAML text. */
export function parseGenerationConfig(text: string): GenerationConfig {
  const raw = (parseYaml(text) ?? {}) as Record<string, unknown>;
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const description = typeof raw.description === 'string' ? raw.description.trim() : '';
  if (!name) throw new Error('Generation config is missing a `name`.');
  if (!description) throw new Error('Generation config is missing a `description`.');

  const systems: Record<string, SystemHint> = {};
  const rawSystems = (raw.systems ?? {}) as Record<string, unknown>;
  for (const [sys, hintRaw] of Object.entries(rawSystems)) {
    const hint = (hintRaw ?? {}) as Record<string, unknown>;
    const out: SystemHint = {};
    if (typeof hint.description === 'string') out.description = hint.description.trim();
    if (hint.collections && typeof hint.collections === 'object') {
      out.collections = {};
      for (const [col, guidance] of Object.entries(hint.collections as Record<string, unknown>)) {
        if (typeof guidance === 'string') out.collections[col] = guidance.trim();
      }
    }
    systems[sys] = out;
  }

  return { name, description, systems };
}

/** Load + validate a generation config file. */
export function loadGenerationConfig(path: string): GenerationConfig {
  return parseGenerationConfig(readFileSync(path, 'utf8'));
}

/** Serialize a generation config back to YAML (used to copy it into a dataset folder). */
export function serializeGenerationConfig(config: GenerationConfig): string {
  return stringifyYaml(config);
}
