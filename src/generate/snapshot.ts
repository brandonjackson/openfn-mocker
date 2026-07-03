import { mkdirSync, writeFileSync } from 'node:fs';
import { loadConfig } from '../config.js';
import { plugins } from '../systems/index.js';
import { datasetDir, datasetSystemFile, DEFAULT_DATASET } from '../datasets.js';
import type { SystemConfig } from '../systems/types.js';
import { dumpPluginSeed, dumpRecordCount } from './dump.js';
import { serializeGenerationConfig, type GenerationConfig } from './config.js';

/**
 * Write the committed `datasets/default/` folder: a JSON dump per system plus a
 * `dataset.yaml` that describes the canonical scenario. This snapshot is NOT
 * loaded at runtime — the server always seeds `default` straight from the
 * per-system TypeScript seeds (fresh timestamps every boot). The
 * snapshot exists as (a) the few-shot template `pnpm generate-seed` shows the
 * model and (b) human-readable documentation of each system's shape. Regenerate
 * it whenever the seeds change: `pnpm snapshot-default`.
 */

/** Generation config describing the built-in default (Sierra Leone health) scenario. */
const DEFAULT_CONFIG: GenerationConfig = {
  name: DEFAULT_DATASET,
  description:
    'The canonical openfn-mocker scenario: a public-health program in Sierra Leone. ' +
    'One coherent cast of people (Jane Doe, John Smith, Amina Kamara, and family) and ' +
    'places (Ngelehun, Bo, Kenema, Makeni, Freetown) recurs across every system: DHIS2 ' +
    'metadata, FHIR clinical resources, CommCare patient cases, OpenMRS records, ' +
    'Kobotoolbox field submissions, Primero child-protection cases, and the Mailgun / ' +
    'Twilio / Airtable operational tools that support them. Data is synthetic and safe to ' +
    'commit. This is the dataset CI tests run against and the Docker image ships with — ' +
    'keep it legible, stable, and covering every system.',
  systems: {
    dhis2: {
      description: 'Sierra Leone org-unit hierarchy (country -> region -> facility), a Child Programme, ANC data elements.',
    },
    fhir: { description: 'R4 Patients/Encounters/Observations/Condition/Claim for the Sierra Leone cast, with valid cross-references.' },
    commcare: { description: 'Patient-registration cases and form submissions in the test-project domain.' },
    openmrs: { description: 'Patients mirrored as REST + FHIR records sharing UUIDs; vitals and diagnosis concepts.' },
    kobotoolbox: { description: 'Household survey, clinic-visit, and water-point assets with field submissions.' },
    primero: { description: 'Child-protection cases (CP-YYYY-NNN) and incidents (IN-YYYY-NNN).' },
    mailgun: { description: 'Notification-email events and 7-day stats for a sandbox domain.' },
    twilio: { description: 'Appointment/verification SMS messages and a couple of calls.' },
    airtable: { description: 'A clinic CRM: Contacts and Tasks tables.' },
    godata: { description: 'A COVID-19 outbreak with cases, contacts, locations and reference-data.' },
    rapidpro: { description: 'Contacts, groups, fields and flows for ANC reminder messaging.' },
    odk: { description: 'A project with two forms and OData submissions.' },
    openlmis: { description: 'Programs, facilities, orderables and a requisition (v3).' },
    openimis: { description: 'Insurees (FHIR Patients), policies (Contracts) and Coverages/Claims.' },
    openspp: { description: 'Odoo res.partner households/individuals, g2p.program enrolments, spp areas.' },
    opencrvs: { description: 'Birth/death registration events and a location tree.' },
    openelis: { description: 'FHIR lab orders, specimens, observations and diagnostic reports.' },
    cht: { description: 'CouchDB contact hierarchy, a pregnancy report and app settings.' },
    openhim: { description: 'OpenHIM channels, clients, tasks and transactions.' },
    openboxes: { description: 'Depots, products and a stock movement.' },
    ihris: { description: 'FHIR health-workforce Practitioners, roles, org and location.' },
  },
};

function systemConfigFor(name: string): SystemConfig {
  const mockConfig = loadConfig();
  return mockConfig.systems[name] ?? { port: mockConfig.port };
}

function main(): void {
  const dir = datasetDir(DEFAULT_DATASET);
  mkdirSync(dir, { recursive: true });

  let total = 0;
  for (const [name, plugin] of Object.entries(plugins)) {
    const dump = dumpPluginSeed(plugin, systemConfigFor(name));
    const count = dumpRecordCount(dump);
    if (count === 0) continue; // e.g. http-generic seeds nothing
    writeFileSync(datasetSystemFile(DEFAULT_DATASET, name), JSON.stringify(dump, null, 2) + '\n');
    total += count;
    // eslint-disable-next-line no-console
    console.log(`  ${name.padEnd(14)} ${count} records`);
  }

  writeFileSync(`${dir}/dataset.yaml`, serializeGenerationConfig(DEFAULT_CONFIG));
  writeFileSync(
    `${dir}/README.md`,
    [
      '# default dataset',
      '',
      'A snapshot of the built-in seed data, generated from `src/systems/*/seed.ts` via',
      '`pnpm snapshot-default`. It documents each system\'s shape and is the few-shot',
      'template used by `pnpm generate-seed`.',
      '',
      '**The running server does not load these files for `default`** — it seeds `default`',
      'directly from the TypeScript seeds (so timestamps are always fresh). To change the',
      'default data, edit the `seed.ts` files, not this folder. To generate a *new* dataset,',
      'see the "Seed datasets" section of the top-level README.',
      '',
    ].join('\n')
  );

  // eslint-disable-next-line no-console
  console.log(`\n  wrote ${dir} (${total} records + dataset.yaml)`);
}

main();
