import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * DAGU seed: one hospital's outpatient dispensing unit (OPD pharmacy) as the
 * dagu adaptor's four documented paths see it.
 *
 *   - `stockOuts`     rows of GET /DispensingUnit/Dashboard/StockOutReport, in
 *                     the report's `{ itemName, unitName, itemAmc }` shape.
 *   - `requests`      the dispensing unit's requisitions to the main store, the
 *                     rows POST /DispensingUnit/Request/History pages through.
 *   - `prescriptions` patient prescription rows, paged by POST
 *                     /Patient/Prescription/History and looked up by
 *                     `prescriptionRowGuid` in POST /Patient/CheckPrescription.
 *
 * Item names follow the Ethiopian essential medicines list. Patient names and
 * MRNs are fictional. The row fields inside `requests` / `prescriptions` are
 * the mock's model: the spec leaves DataTables `data` rows untyped (the vendor
 * Swagger example only shows "string"), so these follow the dispensing-unit
 * screens rather than a documented schema.
 */

/** The seeded prescription the guide and usage CheckPrescription examples target. */
export const SEEDED_PRESCRIPTION_GUID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

const guid = (n: number, prefix: string): string => `${prefix}-4b1e-4c2a-9d3f-${String(n).padStart(12, '0')}`;

const stockOuts = [
  { itemName: 'Amoxicillin 250mg Capsule', unitName: 'Strip of 10', itemAmc: 420 },
  { itemName: 'Oral Rehydration Salts (ORS) 20.5g', unitName: 'Sachet', itemAmc: 310 },
  { itemName: 'Zinc Sulphate 20mg Dispersible Tablet', unitName: 'Strip of 10', itemAmc: 185 },
  { itemName: 'Artemether + Lumefantrine 20mg/120mg Tablet', unitName: 'Pack of 24', itemAmc: 96 },
  { itemName: 'Oxytocin 10 IU/ml Injection', unitName: 'Ampoule', itemAmc: 64 },
  { itemName: 'Ceftriaxone 1g Powder for Injection', unitName: 'Vial', itemAmc: 150 },
  { itemName: 'Salbutamol 100mcg/dose Inhaler', unitName: 'Inhaler', itemAmc: 38 },
  { itemName: 'Ferrous Sulphate + Folic Acid 200mg/0.4mg Tablet', unitName: 'Tin of 1000', itemAmc: 4.5 },
  { itemName: 'Metformin 500mg Tablet', unitName: 'Strip of 10', itemAmc: 270 },
  { itemName: 'Gentamicin 40mg/ml Injection', unitName: 'Ampoule', itemAmc: 52 },
];

const requests = [
  ['DU-REQ-2026-0141', '2026-11-12', 'Requested', 6, 'Hirut Bekele'],
  ['DU-REQ-2026-0140', '2026-11-10', 'Approved', 9, 'Hirut Bekele'],
  ['DU-REQ-2026-0139', '2026-11-06', 'Issued', 12, 'Yonas Tadesse'],
  ['DU-REQ-2026-0138', '2026-11-03', 'Received', 8, 'Yonas Tadesse'],
  ['DU-REQ-2026-0137', '2026-10-30', 'Received', 15, 'Hirut Bekele'],
  ['DU-REQ-2026-0136', '2026-10-27', 'Rejected', 3, 'Selam Getachew'],
  ['DU-REQ-2026-0135', '2026-10-23', 'Received', 11, 'Selam Getachew'],
  ['DU-REQ-2026-0134', '2026-10-20', 'Received', 7, 'Yonas Tadesse'],
  ['DU-REQ-2026-0133', '2026-10-16', 'Received', 10, 'Hirut Bekele'],
  ['DU-REQ-2026-0132', '2026-10-13', 'Received', 5, 'Selam Getachew'],
  ['DU-REQ-2026-0131', '2026-10-09', 'Received', 14, 'Yonas Tadesse'],
  ['DU-REQ-2026-0130', '2026-10-06', 'Received', 9, 'Hirut Bekele'],
].map(([requestNumber, requestedDate, status, itemCount, requestedBy], i) => ({
  requestGuid: guid(141 - i, '7c9e6679'),
  requestNumber,
  requestedDate,
  fromUnit: 'OPD Pharmacy',
  toStore: 'Main Medical Store',
  status,
  itemCount,
  requestedBy,
}));

const patients = [
  ['MRN-004512', 'Abebe Kebede', 'Male', 34],
  ['MRN-004587', 'Tigist Alemu', 'Female', 27],
  ['MRN-004603', 'Dawit Mekonnen', 'Male', 5],
  ['MRN-004619', 'Meron Haile', 'Female', 41],
  ['MRN-004655', 'Kebede Worku', 'Male', 62],
  ['MRN-004671', 'Almaz Desta', 'Female', 19],
] as const;

/** [patientIndex, itemName, unitName, quantity, dosage, prescribedBy, date, status, dispensed] */
const prescriptionRows: [number, string, string, number, string, string, string, string, number][] = [
  [0, 'Amoxicillin 250mg Capsule', 'Capsule', 21, '500mg three times daily for 7 days', 'Dr. Mulugeta Assefa', '2026-11-13', 'Pending', 0],
  [0, 'Paracetamol 500mg Tablet', 'Tablet', 20, '1g every 6 hours as needed', 'Dr. Mulugeta Assefa', '2026-11-13', 'Dispensed', 20],
  [1, 'Ferrous Sulphate + Folic Acid 200mg/0.4mg Tablet', 'Tablet', 30, '1 tablet daily', 'Dr. Rahel Tesfaye', '2026-11-12', 'Dispensed', 30],
  [2, 'Oral Rehydration Salts (ORS) 20.5g', 'Sachet', 10, '1 sachet in 1L water after each loose stool', 'Dr. Rahel Tesfaye', '2026-11-12', 'PartiallyDispensed', 4],
  [2, 'Zinc Sulphate 20mg Dispersible Tablet', 'Tablet', 10, '20mg daily for 10 days', 'Dr. Rahel Tesfaye', '2026-11-12', 'Pending', 0],
  [3, 'Metformin 500mg Tablet', 'Tablet', 60, '500mg twice daily with meals', 'Dr. Mulugeta Assefa', '2026-11-11', 'Dispensed', 60],
  [3, 'Enalapril 5mg Tablet', 'Tablet', 30, '5mg once daily', 'Dr. Mulugeta Assefa', '2026-11-11', 'Dispensed', 30],
  [4, 'Salbutamol 100mcg/dose Inhaler', 'Inhaler', 1, '2 puffs as needed', 'Dr. Bethlehem Girma', '2026-11-10', 'Pending', 0],
  [4, 'Amlodipine 5mg Tablet', 'Tablet', 30, '5mg once daily', 'Dr. Bethlehem Girma', '2026-11-10', 'Dispensed', 30],
  [5, 'Artemether + Lumefantrine 20mg/120mg Tablet', 'Tablet', 24, '4 tablets twice daily for 3 days', 'Dr. Bethlehem Girma', '2026-11-09', 'Pending', 0],
  [5, 'Paracetamol 500mg Tablet', 'Tablet', 12, '1g every 8 hours as needed', 'Dr. Bethlehem Girma', '2026-11-09', 'Dispensed', 12],
  [1, 'Cotrimoxazole 960mg Tablet', 'Tablet', 14, '1 tablet twice daily for 7 days', 'Dr. Rahel Tesfaye', '2026-11-08', 'Dispensed', 14],
];

const prescriptions = prescriptionRows.map(
  ([p, itemName, unitName, quantity, dosage, prescribedBy, prescribedDate, status, dispensed], i) => {
    const [mrn, patientName, gender, age] = patients[p];
    return {
      // The first row keeps the GUID from the adaptor's own CheckPrescription example.
      prescriptionRowGuid: i === 0 ? SEEDED_PRESCRIPTION_GUID : guid(i + 1, '9b2f4d10'),
      prescriptionNumber: `RX-2026-${String(8812 - i).padStart(6, '0')}`,
      mrn,
      patientName,
      gender,
      age,
      itemName,
      unitName,
      quantityPrescribed: quantity,
      quantityDispensed: dispensed,
      dosage,
      prescribedBy,
      prescribedDate,
      status,
    };
  }
);

export function seed(store: DataStore, _config: SystemConfig): void {
  stockOuts.forEach((s, i) => store.create('stockOuts', String(i + 1), s));
  for (const r of requests) store.create('requests', r.requestGuid, r);
  for (const p of prescriptions) store.create('prescriptions', p.prescriptionRowGuid, p);
}
