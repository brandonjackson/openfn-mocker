import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the openmrs system: its blurb and the runnable example
 * requests shown on the sandbox "API" tab. Co-located with this system's seed
 * data and imported onto the plugin (`MockSystemPlugin.guide`); rendered by the
 * sandbox and referenced by usage examples' `apiRef` cross-links.
 */
export const guide: SystemGuide = {
  title: 'OpenMRS',
  docs: 'https://docs.openfn.org/adaptors/packages/openmrs-docs',
  blurb:
    'Medical record system exposed as a generic REST API ({ results, links }) and a FHIR R4 module. Any resource name works (with subresources like patient/{uuid}/identifier), updates POST to the uuid, and the same seeded patients appear in both representations.',
  auth: 'Basic',
  examples: [
    { method: 'GET', path: '/ws/rest/v1/session', label: 'Authenticated session' },
    { method: 'GET', path: '/ws/rest/v1/patient', label: 'Patient list ({ results, links })' },
    { method: 'GET', path: '/ws/rest/v1/patient?q=Doe', label: 'Search by name / identifier' },
    {
      method: 'GET',
      path: '/ws/rest/v1/patient?v=ref',
      label: 'Reference representation (?v=ref)',
    },
    { method: 'GET', path: '/ws/rest/v1/provider', label: 'Any resource name works (provider)' },
    {
      method: 'GET',
      path: '/ws/fhir2/R4/Patient',
      label: 'Same patients via the FHIR R4 module',
    },
    {
      method: 'GET',
      path: '/ws/fhir2/R4/Observation',
      label: 'FHIR Observations (fhir.get("Observation"))',
    },
    {
      method: 'POST',
      path: '/ws/rest/v1/patient',
      label: 'Register a patient: 201 with generated uuid',
      body: JSON.stringify(
        {
          identifiers: [
            {
              identifier: 'MRN-777',
              identifierType: '05a29f94-c0ed-11e2-94be-8c13b969e334',
              preferred: true,
            },
          ],
          person: {
            names: [{ givenName: 'Sandbox', familyName: 'Patient' }],
            gender: 'F',
            birthdate: '1990-01-01',
          },
        },
        null,
        2
      ),
    },
    {
      method: 'GET',
      path: '/ws/rest/v1/patient/1fdaa696-e759-4a7d-a066-f1ae557c151b',
      label: "Fetch one patient by uuid (get('patient/{uuid}'))",
    },
    {
      method: 'POST',
      path: '/ws/rest/v1/location/a2f1c6d8-4b7e-4f19-8c3a-6e5d0b9f7a21',
      label: 'Update a location: POST to its uuid (200)',
      body: JSON.stringify({ name: 'Outpatient Clinic', description: 'Main OPD block' }, null, 2),
    },
    {
      method: 'GET',
      path: '/ws/fhir2/R4/Patient/1fdaa696-e759-4a7d-a066-f1ae557c151b',
      label: 'FHIR read: the REST patient by the same uuid',
    },
    { method: 'GET', path: '/ws/fhir2/R4/Encounter', label: 'FHIR Encounters (fhir.get("Encounter"))' },
    {
      method: 'GET',
      path: '/ws/fhir2/R4/Encounter/e3a2c7d4-1b8f-4c5e-9a6d-2f7b0c1e8d93',
      label: 'FHIR read: one Encounter',
    },
    {
      method: 'GET',
      path: '/ws/fhir2/R4/Observation/0b6f4e2a-7c91-4d38-b5e2-9a1c3d8f6e47',
      label: 'FHIR read: one Observation',
    },
    { method: 'GET', path: '/ws/fhir2/R4/Condition', label: 'FHIR Conditions (fhir.get("Condition"))' },
    {
      method: 'GET',
      path: '/ws/fhir2/R4/Condition/c4d9e1f7-3a2b-4e6c-8d5f-1b7a9e0c2d64',
      label: 'FHIR read: one Condition',
    },
    {
      method: 'POST',
      path: '/ws/fhir2/R4/Patient',
      label: 'FHIR create a Patient (201 + Location)',
      body: JSON.stringify(
        {
          resourceType: 'Patient',
          identifier: [{ system: 'http://openmrs.org/identifier/OpenMRS-ID', value: 'MRN-778' }],
          name: [{ family: 'Patient', given: ['Fhir'] }],
          gender: 'female',
          birthDate: '1992-06-01',
        },
        null,
        2
      ),
    },
    {
      method: 'POST',
      path: '/ws/fhir2/R4/Encounter',
      label: 'FHIR create an Encounter',
      body: JSON.stringify(
        {
          resourceType: 'Encounter',
          status: 'finished',
          class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB' },
          subject: { reference: 'Patient/1fdaa696-e759-4a7d-a066-f1ae557c151b' },
          period: { start: '2026-01-15T09:00:00Z' },
        },
        null,
        2
      ),
    },
    {
      method: 'POST',
      path: '/ws/fhir2/R4/Observation',
      label: 'FHIR create an Observation (body weight)',
      body: JSON.stringify(
        {
          resourceType: 'Observation',
          status: 'final',
          code: { coding: [{ system: 'http://loinc.org', code: '29463-7', display: 'Body weight' }] },
          subject: { reference: 'Patient/1fdaa696-e759-4a7d-a066-f1ae557c151b' },
          effectiveDateTime: '2026-01-15T09:05:00Z',
          valueQuantity: { value: 61, unit: 'kg', system: 'http://unitsofmeasure.org', code: 'kg' },
        },
        null,
        2
      ),
    },
    {
      method: 'POST',
      path: '/ws/fhir2/R4/Condition',
      label: 'FHIR create a Condition',
      body: JSON.stringify(
        {
          resourceType: 'Condition',
          clinicalStatus: {
            coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }],
          },
          code: { coding: [{ system: 'http://snomed.info/sct', code: '61462000', display: 'Malaria' }] },
          subject: { reference: 'Patient/1fdaa696-e759-4a7d-a066-f1ae557c151b' },
        },
        null,
        2
      ),
    },
    {
      method: 'DELETE',
      path: '/ws/rest/v1/patient/5b0c9a8e-2f4d-4e6a-9c1b-7d3e8f2a4b65',
      label: 'Void a patient (destroy(); add ?purge=true to delete): 204',
    },
  ],
};
