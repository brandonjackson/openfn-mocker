import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * mSupply / Open mSupply seed (open-source pharmaceutical supply-chain &
 * inventory system). Open mSupply exposes a single GraphQL endpoint; the
 * msupply adaptor's getItemsWithStats reads `items { nodes { ... stats } }`, so
 * a few catalogue items (with consumption stats) are seeded, keyed by id, plus
 * an example store the queries are scoped to.
 */

export const STORE_ID = 'store-a';

interface ItemNode {
  __typename: 'ItemNode';
  id: string;
  code: string;
  name: string;
  unitName: string;
  defaultPackSize: number;
  availableStockOnHand: number;
  stats: {
    __typename: 'ItemStatsNode';
    averageMonthlyConsumption: number;
    availableStockOnHand: number;
    availableMonthsOfStockOnHand: number;
    monthsOfStockOnHand: number;
    totalConsumption: number;
    stockOnHand: number;
  };
}

function item(
  id: string,
  code: string,
  name: string,
  unitName: string,
  packSize: number,
  soh: number,
  amc: number
): ItemNode {
  return {
    __typename: 'ItemNode',
    id,
    code,
    name,
    unitName,
    defaultPackSize: packSize,
    availableStockOnHand: soh,
    stats: {
      __typename: 'ItemStatsNode',
      averageMonthlyConsumption: amc,
      availableStockOnHand: soh,
      availableMonthsOfStockOnHand: amc ? Number((soh / amc).toFixed(1)) : 0,
      monthsOfStockOnHand: amc ? Number((soh / amc).toFixed(1)) : 0,
      totalConsumption: amc * 12,
      stockOnHand: soh,
    },
  };
}

export function seed(store: DataStore, _config: SystemConfig): void {
  const items: ItemNode[] = [
    item('item-amox-500', 'AMX500', 'Amoxicillin 500mg Capsules', 'Capsule', 100, 4200, 700),
    item('item-para-500', 'PCM500', 'Paracetamol 500mg Tablets', 'Tablet', 1000, 15000, 2500),
    item('item-ors-sachet', 'ORS01', 'Oral Rehydration Salts Sachet', 'Sachet', 50, 800, 300),
  ];
  for (const it of items) store.create('items', it.id, it);
}
