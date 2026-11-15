import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * Zata seed, shaped after Zata's own OpenAPI (openfn-api-specs
 * `specs/adaptors/zata/openapi.json`): Rwanda EBM sale invoices, the catalog
 * products they reference, and the EBM product types served at
 * `GET /api/v1/data/product-type`.
 *
 * Transactions are stored as one internal record per invoice; the plugin
 * projects it to the by-id shape (`Transaction_..._Response_200`: EBM codes,
 * per-tax-type taxable/tax amounts, line items) or to the list-row shape
 * (`invoiceType`, `totalAmount`, `itemsCount`, ...). Ids are integers, as the
 * spec's `{transactionId}` path parameter is. Amounts are whole Rwandan francs
 * and prices are VAT-inclusive, as on an EBM receipt.
 */

/** Seed transaction id, referenced by the guide's getTxn example and the usage snippets. */
export const SEED_TXN_ID = 1001;

/** EBM tax types: A exempt, B 18% VAT, C zero-rated (exports), D non-VAT. */
const TAX_RATES: Record<string, number> = { A: 0, B: 18, C: 0, D: 0 };

export interface SaleItemInput {
  productID: number;
  units: number;
  unitPrice: number;
  discountRate?: number;
  batchNumber?: string;
}

/** The documented `POST /api/v1/transaction/sale` body (subset the mock uses). */
export interface SaleInput {
  purchaseCode?: string;
  paymentMethodID: number;
  customerID?: number | null;
  customerTIN?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  transactionDate: string;
  note?: string | null;
  payment_status?: string | null;
  items: SaleItemInput[];
}

export const products = [
  { id: 1, name: 'Maize flour 5kg', taxName: 'B' },
  { id: 2, name: 'Cooking oil 1L', taxName: 'B' },
  { id: 3, name: 'Fresh milk 1L', taxName: 'A' },
  { id: 4, name: 'Delivery service', taxName: 'B' },
];

/** EBM item type codes (RRA): what `GET /api/v1/data/product-type` lists. */
export const productTypes = [
  { id: 1, name: 'Raw Material', description: 'Raw material used to produce other goods' },
  { id: 2, name: 'Finished Product', description: 'Finished goods ready for sale' },
  { id: 3, name: 'Service', description: 'Service without stock' },
];

const pad = (n: number): string => String(n).padStart(2, '0');

/** 'YYYY-MM-DD HH:mm:ss' (UTC), the timestamp style of an EBM confirmation. */
export function ebmTimestamp(d = new Date()): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(
    d.getUTCMinutes()
  )}:${pad(d.getUTCSeconds())}`;
}

/**
 * Turn a sale request into the stored invoice: resolve product names and tax
 * types, apply discounts, and split VAT-inclusive totals per EBM tax type.
 */
export function buildTransaction(id: number, invoiceNumber: number, sale: SaleInput, store: DataStore) {
  const taxbl: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
  const tax: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
  const items = sale.items.map((item) => {
    const product = store.get('products', String(item.productID));
    const taxName: string = product?.taxName ?? 'B';
    const taxRate = TAX_RATES[taxName] ?? 0;
    const discountRate = item.discountRate ?? 0;
    const gross = Math.round(item.units * item.unitPrice);
    const totalDiscount = Math.round((gross * discountRate) / 100);
    const totalAmount = gross - totalDiscount;
    const taxAmount = Math.round((totalAmount * taxRate) / (100 + taxRate));
    taxbl[taxName] += totalAmount;
    tax[taxName] += taxAmount;
    return {
      productName: product?.name ?? `Product ${item.productID}`,
      units: item.units,
      unitPrice: item.unitPrice,
      taxAmount,
      taxRate,
      taxName,
      totalAmount,
      totalDiscount,
      discountRate,
    };
  });
  const totAmt = items.reduce((sum, i) => sum + i.totalAmount, 0);
  const totTaxAmt = tax.A + tax.B + tax.C + tax.D;
  return {
    id,
    invoiceNumber,
    originalInvoiceNumber: 0,
    clientTin: sale.customerTIN ?? '',
    clientName: sale.customerName ?? '',
    clientPhoneNumber: sale.customerPhone ?? '',
    salesTypeCode: 'N',
    receiptTypeCode: 'S',
    paymentTypeCode: pad(sale.paymentMethodID),
    salesStatusCode: '02',
    confirmationDate: ebmTimestamp(),
    type: 'NS',
    isRefunded: false,
    taxblAmtA: taxbl.A,
    taxblAmtB: taxbl.B,
    taxblAmtC: taxbl.C,
    taxblAmtD: taxbl.D,
    taxAmtA: tax.A,
    taxAmtB: tax.B,
    taxAmtC: tax.C,
    taxAmtD: tax.D,
    totTaxblAmt: totAmt,
    totTaxAmt,
    totAmt,
    salesDate: sale.transactionDate,
    note: sale.note ?? '',
    items,
    // List-row only fields.
    synced: true,
    status: 'approved',
    payment_status: sale.payment_status ?? 'paid',
  };
}

export function seed(store: DataStore, _config: SystemConfig): void {
  for (const p of products) store.create('products', String(p.id), p);
  for (const t of productTypes) store.create('productTypes', String(t.id), t);

  const sales: Array<[number, number, SaleInput]> = [
    [
      SEED_TXN_ID,
      1,
      {
        purchaseCode: '430341',
        paymentMethodID: 1,
        customerID: 1,
        customerTIN: '123456789',
        customerName: 'John Doe',
        customerPhone: '0788123456',
        transactionDate: '2024-01-01',
        note: 'Weekly stock order',
        items: [
          { productID: 1, units: 10, unitPrice: 5900, discountRate: 0, batchNumber: 'MF-2401' },
          { productID: 3, units: 12, unitPrice: 800, discountRate: 0, batchNumber: 'FM-2401' },
        ],
      },
    ],
    [
      1002,
      2,
      {
        purchaseCode: '518276',
        paymentMethodID: 2,
        customerName: 'Walk-in customer',
        transactionDate: '2024-01-02',
        items: [{ productID: 2, units: 3, unitPrice: 2950, discountRate: 10, batchNumber: 'CO-2401' }],
      },
    ],
  ];
  for (const [id, invoiceNumber, sale] of sales) {
    store.create('transactions', String(id), buildTransaction(id, invoiceNumber, sale, store));
  }
}
