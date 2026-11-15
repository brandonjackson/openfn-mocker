import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import zata from '../src/systems/zata/plugin.js';

const config = { port: 0 };

const sale = {
  purchaseCode: '430341',
  paymentMethodID: 1,
  customerID: 1,
  transactionDate: '2024-03-05',
  customerTIN: '123456789',
  customerName: 'John Doe',
  customerPhone: '0788123456',
  items: [{ productID: 1, units: 2, unitPrice: 5900, discountRate: 0, batchNumber: 'MF-2401' }],
};

describe('zata', () => {
  it('records a sale (200) and returns its invoiceID, readable by id', async () => {
    const { app } = await createSystemServer(zata, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'POST', url: '/v1/transaction/sale', payload: sale });
    expect(res.statusCode).toBe(200);
    const { message, invoiceID } = res.json();
    expect(typeof message).toBe('string');
    expect(Number.isInteger(invoiceID)).toBe(true);

    const got = await app.inject({ method: 'GET', url: `/v1/transaction/${invoiceID}` });
    expect(got.statusCode).toBe(200);
    const txn = got.json();
    expect(txn.id).toBe(invoiceID);
    expect(txn.clientName).toBe('John Doe');
    expect(txn.clientTin).toBe('123456789');
    expect(txn.salesDate).toBe('2024-03-05');
    expect(txn.totAmt).toBe(11800);
    // VAT-inclusive 18% (tax type B): 11800 * 18 / 118 = 1800.
    expect(txn.taxblAmtB).toBe(11800);
    expect(txn.taxAmtB).toBe(1800);
    expect(txn.items).toHaveLength(1);
    expect(txn.items[0]).toMatchObject({ productName: 'Maize flour 5kg', units: 2, taxName: 'B', taxRate: 18 });
    await app.close();
  });

  it('rejects a sale missing required fields (422)', async () => {
    const { app } = await createSystemServer(zata, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'POST', url: '/v1/transaction/sale', payload: { note: 'x' } });
    expect(res.statusCode).toBe(422);
    expect(Object.keys(res.json().errors)).toEqual(
      expect.arrayContaining(['paymentMethodID', 'transactionDate', 'items'])
    );
    await app.close();
  });

  it('fetches the seeded transaction by id', async () => {
    const { app } = await createSystemServer(zata, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/v1/transaction/1001' });
    expect(res.statusCode).toBe(200);
    const txn = res.json();
    expect(txn.id).toBe(1001);
    expect(txn.receiptTypeCode).toBe('S');
    expect(Array.isArray(txn.items)).toBe(true);
    await app.close();
  });

  it('lists transactions with pagination and date filters', async () => {
    const { app } = await createSystemServer(zata, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/v1/transaction?perPage=1&page=1' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ currentPage: 1, itemsPerPage: 1, pageItems: 1, total: 2, lastPage: 2 });
    expect(body.data[0]).toMatchObject({ id: 1002, invoiceType: 'NS', invoiceNumber: '2', itemsCount: 1 });

    const filtered = await app.inject({ method: 'GET', url: '/v1/transaction?fromDate=2024-01-02' });
    expect(filtered.json().data.map((t: any) => t.id)).toEqual([1002]);
    await app.close();
  });

  it('lists EBM product types', async () => {
    const { app } = await createSystemServer(zata, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/v1/data/product-type' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(expect.arrayContaining([expect.objectContaining({ id: 3, name: 'Service' })]));
    await app.close();
  });

  it('returns 404 for an unknown transaction', async () => {
    const { app } = await createSystemServer(zata, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/v1/transaction/999999' });
    expect(res.statusCode).toBe(404);
    expect(typeof res.json().message).toBe('string');
    await app.close();
  });
});
