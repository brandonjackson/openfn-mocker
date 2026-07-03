import { randomUUID } from 'node:crypto';
import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * OpenLMIS seed (logistics-management Digital Public Good). Seeds programs,
 * facilities, orderables (products) and a requisition — the OpenLMIS v3
 * reference-data + requisition resources the openlmis adaptor reads and writes.
 * OpenLMIS ids are uuids and paginated endpoints use the Spring Data
 * `{ content, totalElements, ... }` page envelope.
 */

export const IDS = {
  programEpi: '10845cb9-d365-4aaa-badd-b4fa39c6a26a',
  programEssMeds: '418bdc1d-c303-4bd0-b2d3-d8901150a983',
  facilityBo: 'e6799d64-d10d-4011-b8c2-0e4d4a3f0000',
  facilityNgelehun: 'a6799d64-d10d-4011-b8c2-0e4d4a3f0001',
  orderableAct: 'cd9e1412-8703-40e1-8b3c-0e4d4a3f0100',
  orderableRdt: 'cd9e1412-8703-40e1-8b3c-0e4d4a3f0101',
};

export function seed(store: DataStore, _config: SystemConfig): void {
  const programs = [
    { id: IDS.programEpi, code: 'PRG002', name: 'EPI', active: true },
    { id: IDS.programEssMeds, code: 'PRG001', name: 'Essential Meds', active: true },
  ];
  for (const p of programs) store.create('programs', p.id, p);

  const facilities = [
    { id: IDS.facilityBo, code: 'FAC001', name: 'Bo District Medical Store', active: true, geographicZone: { name: 'Bo' } },
    { id: IDS.facilityNgelehun, code: 'FAC002', name: 'Ngelehun CHC', active: true, geographicZone: { name: 'Bo' } },
  ];
  for (const f of facilities) store.create('facilities', f.id, f);

  const orderables = [
    { id: IDS.orderableAct, productCode: 'C100', fullProductName: 'Artemether/Lumefantrine 20/120mg', netContent: 1, packRoundingThreshold: 1 },
    { id: IDS.orderableRdt, productCode: 'C200', fullProductName: 'Malaria RDT', netContent: 1, packRoundingThreshold: 1 },
  ];
  for (const o of orderables) store.create('orderables', o.id, o);

  const reqId = randomUUID();
  store.create('requisitions', reqId, {
    id: reqId,
    status: 'INITIATED',
    emergency: false,
    program: { id: IDS.programEpi, name: 'EPI' },
    facility: { id: IDS.facilityNgelehun, name: 'Ngelehun CHC' },
    processingPeriod: { name: 'March 2024', startDate: '2024-03-01', endDate: '2024-03-31' },
    requisitionLineItems: [
      { orderable: { id: IDS.orderableAct }, requestedQuantity: 500, approvedQuantity: null },
      { orderable: { id: IDS.orderableRdt }, requestedQuantity: 300, approvedQuantity: null },
    ],
  });
}
