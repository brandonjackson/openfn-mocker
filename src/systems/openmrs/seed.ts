import { randomUUID } from 'node:crypto';
import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * Stable-ish reference uuid for the default "OpenMRS ID" identifier type.
 * (Real instances use a persistent uuid; a fixed value keeps seed data
 * self-consistent across a run.)
 */
const OPENMRS_ID_TYPE_UUID = '05a29f94-c0ed-11e2-94be-8c13b969e334';

interface PatientSeed {
  mrn: string;
  given: string;
  family: string;
  gender: 'M' | 'F';
  birthdate: string;
  city: string;
  country: string;
}

const PATIENTS: PatientSeed[] = [
  { mrn: 'MRN-001', given: 'Jane', family: 'Doe', gender: 'F', birthdate: '1996-03-15', city: 'Ngelehun', country: 'Sierra Leone' },
  { mrn: 'MRN-002', given: 'John', family: 'Smith', gender: 'M', birthdate: '1985-07-22', city: 'Bo', country: 'Sierra Leone' },
  { mrn: 'MRN-003', given: 'Aminata', family: 'Kamara', gender: 'F', birthdate: '2001-11-02', city: 'Kenema', country: 'Sierra Leone' },
  { mrn: 'MRN-004', given: 'Mohamed', family: 'Bangura', gender: 'M', birthdate: '1978-01-30', city: 'Makeni', country: 'Sierra Leone' },
  { mrn: 'MRN-005', given: 'Fatmata', family: 'Sesay', gender: 'F', birthdate: '2010-05-19', city: 'Freetown', country: 'Sierra Leone' },
];

const ENCOUNTER_TYPES = [
  { name: 'Vitals', description: 'Collection of vital signs' },
  { name: 'Admission', description: 'Patient admission to a ward' },
  { name: 'Consultation', description: 'Outpatient clinical consultation' },
];

const CONCEPTS = [
  { display: 'Weight (kg)', datatype: 'Numeric', conceptClass: 'Finding' },
  { display: 'Height (cm)', datatype: 'Numeric', conceptClass: 'Finding' },
  { display: 'Temperature (C)', datatype: 'Numeric', conceptClass: 'Finding' },
  { display: 'Pulse', datatype: 'Numeric', conceptClass: 'Finding' },
  { display: 'Systolic blood pressure', datatype: 'Numeric', conceptClass: 'Finding' },
  { display: 'Diastolic blood pressure', datatype: 'Numeric', conceptClass: 'Finding' },
  { display: 'Respiratory rate', datatype: 'Numeric', conceptClass: 'Finding' },
  { display: 'HIV positive', datatype: 'Coded', conceptClass: 'Diagnosis' },
  { display: 'Malaria smear', datatype: 'Coded', conceptClass: 'Test' },
  { display: 'Chief complaint', datatype: 'Text', conceptClass: 'Symptom' },
];

const LOCATIONS = [
  { name: 'Outpatient Clinic' },
  { name: 'Inpatient Ward' },
];

/** Map a REST person/patient seed into a FHIR R4 Patient resource. */
function toFhirPatient(patientUuid: string, p: PatientSeed): Record<string, any> {
  return {
    resourceType: 'Patient',
    id: patientUuid,
    active: true,
    identifier: [
      { system: 'http://openmrs.org/identifier/OpenMRS-ID', value: p.mrn },
    ],
    name: [{ family: p.family, given: [p.given], text: `${p.given} ${p.family}` }],
    gender: p.gender === 'F' ? 'female' : 'male',
    birthDate: p.birthdate,
    address: [{ city: p.city, country: p.country }],
  };
}

export function seed(store: DataStore, _config: SystemConfig): void {
  // Encounter types (needed before encounters reference them).
  const encTypeRefs: Array<{ uuid: string; display: string }> = [];
  for (const et of ENCOUNTER_TYPES) {
    const uuid = randomUUID();
    store.create('encountertype', uuid, {
      uuid,
      display: et.name,
      name: et.name,
      description: et.description,
    });
    encTypeRefs.push({ uuid, display: et.name });
  }

  // Locations.
  const locationRefs: Array<{ uuid: string; display: string }> = [];
  for (const loc of LOCATIONS) {
    const uuid = randomUUID();
    store.create('location', uuid, { uuid, display: loc.name, name: loc.name });
    locationRefs.push({ uuid, display: loc.name });
  }

  // Concepts.
  const conceptRefs: Array<{ uuid: string; display: string }> = [];
  for (const c of CONCEPTS) {
    const uuid = randomUUID();
    store.create('concept', uuid, {
      uuid,
      display: c.display,
      datatype: { uuid: randomUUID(), display: c.datatype },
      conceptClass: { uuid: randomUUID(), display: c.conceptClass },
    });
    conceptRefs.push({ uuid, display: c.display });
  }

  // Patients (REST) + matching person records + matching FHIR Patients.
  const patientRefs: Array<{ uuid: string; display: string }> = [];
  PATIENTS.forEach((p) => {
    const personUuid = randomUUID();
    const patientUuid = randomUUID();
    const fullName = `${p.given} ${p.family}`;

    const person = {
      uuid: personUuid,
      display: fullName,
      gender: p.gender,
      birthdate: p.birthdate,
      age: null,
      dead: false,
      names: [
        {
          uuid: randomUUID(),
          display: fullName,
          givenName: p.given,
          familyName: p.family,
          preferred: true,
        },
      ],
      addresses: [
        { uuid: randomUUID(), cityVillage: p.city, country: p.country, preferred: true },
      ],
    };

    const patient = {
      uuid: patientUuid,
      display: `${p.mrn} - ${fullName}`,
      identifiers: [
        {
          uuid: randomUUID(),
          identifier: p.mrn,
          identifierType: { uuid: OPENMRS_ID_TYPE_UUID, display: 'OpenMRS ID' },
          preferred: true,
        },
      ],
      person,
    };

    store.create('person', personUuid, person);
    store.create('patient', patientUuid, patient);
    // FHIR Patient uses the same uuid so the two representations correspond.
    store.create('fhir_patient', patientUuid, toFhirPatient(patientUuid, p));

    patientRefs.push({ uuid: patientUuid, display: patient.display });
  });

  // A few encounters + observations for the first patients.
  const now = Date.now();
  patientRefs.slice(0, 3).forEach((patientRef, i) => {
    const encUuid = randomUUID();
    const encType = encTypeRefs[i % encTypeRefs.length];
    const location = locationRefs[i % locationRefs.length];
    const when = new Date(now - i * 86_400_000).toISOString();

    store.create('encounter', encUuid, {
      uuid: encUuid,
      display: `${encType.display} ${when.slice(0, 10)}`,
      encounterDatetime: when,
      encounterType: encType,
      patient: patientRef,
      location,
    });

    // FHIR Encounter mirroring the REST encounter.
    store.create('fhir_encounter', encUuid, {
      resourceType: 'Encounter',
      id: encUuid,
      status: 'finished',
      class: {
        system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
        code: 'AMB',
        display: 'ambulatory',
      },
      subject: { reference: `Patient/${patientRef.uuid}`, display: patientRef.display },
      period: { start: when },
    });

    // One weight observation per encounter.
    const weightConcept = conceptRefs[0];
    const obsUuid = randomUUID();
    const weight = 55 + i * 3;
    store.create('obs', obsUuid, {
      uuid: obsUuid,
      display: `${weightConcept.display}: ${weight}`,
      concept: weightConcept,
      value: weight,
      obsDatetime: when,
      encounter: { uuid: encUuid },
      person: { uuid: patientRef.uuid, display: patientRef.display },
    });

    // FHIR Observation mirroring the REST obs (so fhir.get('Observation') works).
    store.create('fhir_observation', obsUuid, {
      resourceType: 'Observation',
      id: obsUuid,
      status: 'final',
      code: { coding: [{ system: 'http://loinc.org', code: '29463-7', display: 'Body weight' }], text: 'Weight (kg)' },
      subject: { reference: `Patient/${patientRef.uuid}`, display: patientRef.display },
      encounter: { reference: `Encounter/${encUuid}` },
      effectiveDateTime: when,
      valueQuantity: { value: weight, unit: 'kg', system: 'http://unitsofmeasure.org', code: 'kg' },
    });
  });

  // A FHIR Condition for the first patient so fhir.get('Condition') returns data.
  if (patientRefs[0]) {
    const condUuid = randomUUID();
    store.create('fhir_condition', condUuid, {
      resourceType: 'Condition',
      id: condUuid,
      clinicalStatus: {
        coding: [
          { system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active', display: 'Active' },
        ],
      },
      code: {
        coding: [{ system: 'http://snomed.info/sct', code: '61462000', display: 'Malaria' }],
        text: 'Malaria',
      },
      subject: { reference: `Patient/${patientRefs[0].uuid}`, display: patientRefs[0].display },
    });
  }

  // A patient-identifier type so get('patientidentifiertype') returns data.
  store.create('patientidentifiertype', OPENMRS_ID_TYPE_UUID, {
    uuid: OPENMRS_ID_TYPE_UUID,
    display: 'OpenMRS ID',
    name: 'OpenMRS ID',
    description: 'OpenMRS patient identifier',
    required: false,
  });

  // A provider so get('provider') returns data.
  const providerUuid = randomUUID();
  store.create('provider', providerUuid, {
    uuid: providerUuid,
    display: 'Dr. Jane Provider',
    person: { display: 'Jane Provider' },
    identifier: 'PROV-001',
  });
}
