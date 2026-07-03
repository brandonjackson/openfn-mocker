import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * OpenBoxes seed (supply-chain / inventory Digital Public Good). Seeds a couple
 * of depots (locations), products, and a stock movement — the resources the
 * openboxes adaptor reads and writes. OpenBoxes ids are 32-char hex strings and
 * every response nests payloads under a `data` key.
 */

export function id32(seed: string): string {
  let hex = '';
  for (let i = 0; i < seed.length && hex.length < 32; i++) hex += seed.charCodeAt(i).toString(16);
  return (hex + '00000000000000000000000000000000').slice(0, 32);
}

export function seed(store: DataStore, _config: SystemConfig): void {
  const locations = [
    { id: id32('loc-depot-bo'), name: 'Bo District Medical Store', locationType: { name: 'Depot' }, active: true },
    { id: id32('loc-ngelehun'), name: 'Ngelehun CHC', locationType: { name: 'Ward' }, active: true },
  ];
  for (const l of locations) store.create('locations', l.id, l);

  const products = [
    { id: id32('prod-act'), productCode: 'MAL-ACT-001', name: 'Artemether/Lumefantrine 20/120mg', category: { name: 'Antimalarials' }, unitOfMeasure: 'EA', active: true },
    { id: id32('prod-ors'), productCode: 'ORS-001', name: 'Oral Rehydration Salts', category: { name: 'Essential Medicines' }, unitOfMeasure: 'EA', active: true },
    { id: id32('prod-rdt'), productCode: 'MAL-RDT-001', name: 'Malaria Rapid Diagnostic Test', category: { name: 'Diagnostics' }, unitOfMeasure: 'EA', active: true },
  ];
  for (const p of products) store.create('products', p.id, p);

  store.create('stockMovements', id32('sm-0001'), {
    id: id32('sm-0001'),
    name: 'SL-2024-0001',
    identifier: 'SL-2024-0001',
    origin: { id: id32('loc-depot-bo'), name: 'Bo District Medical Store' },
    destination: { id: id32('loc-ngelehun'), name: 'Ngelehun CHC' },
    dateRequested: '2024-03-10',
    statusCode: 'DISPATCHED',
    lineItems: [
      { product: { productCode: 'MAL-ACT-001' }, quantityRequested: 500, quantityShipped: 500 },
      { product: { productCode: 'MAL-RDT-001' }, quantityRequested: 300, quantityShipped: 300 },
    ],
  });
}
