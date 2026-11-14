import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed, buildTransaction, type SaleInput } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * Zata (Rwanda EBM tax compliance). The zata adaptor exposes generic get /
 * post / put / request verbs and builds every URL as
 * `${baseUrl}/${apiVersion}/${path}`, with a default baseUrl of
 * `https://ebm.zata.rw/api`. The mock's mount stands for that baseUrl (which
 * already carries `/api`), so routes live under `/v1/...`; the conformance
 * ledger's `pathPrefix: "/api"` maps them onto the spec's `/api/v1/...` paths.
 *
 * Shapes follow Zata's own OpenAPI (openfn-api-specs `specs/adaptors/zata`):
 *   POST /v1/transaction/sale             -> 200 { message, invoiceID }
 *   GET  /v1/transaction/{transactionId}  -> the invoice (EBM codes, tax split, items)
 *   GET  /v1/transaction                  -> { data, currentPage, lastPage, itemsPerPage, pageItems, total }
 *   GET  /v1/data/product-type            -> [{ id, name, description }]
 *
 * The real API also requires `companyId` / `branchId` headers on transaction
 * calls. The mock does not enforce them: adaptor 1.1.3's `post()` drops its
 * options argument, so a job using `post('transaction/sale', body)` cannot send
 * headers at all.
 */

const DEFAULT_PER_PAGE = 20;

/** The by-id shape (`Transaction_1b4b..._Response_200`). */
function toDetail(t: any) {
  const { synced: _s, status: _st, payment_status: _p, ...detail } = t;
  return detail;
}

/** The list-row shape (`ApiV1TransactionGetResponsesContentApplicationJsonSchemaDataItems`). */
function toRow(t: any) {
  return {
    id: t.id,
    invoiceType: t.type,
    invoiceNumber: String(t.invoiceNumber),
    clientName: t.clientName,
    clientTin: t.clientTin,
    salesDate: t.salesDate,
    totalAmount: t.totAmt,
    synced: t.synced,
    isRefunded: t.isRefunded,
    status: t.status,
    payment_status: t.payment_status,
    itemsCount: t.items.length,
    paymentTypeCode: t.paymentTypeCode,
    taxAmtB: t.taxAmtB,
    taxblAmtB: t.taxblAmtB,
    totTaxAmt: t.totTaxAmt,
    totTaxblAmt: t.totTaxblAmt,
  };
}

/** Laravel-style validation of the documented required fields; null when valid. */
function validateSale(body: any): Record<string, string[]> | null {
  const errors: Record<string, string[]> = {};
  if (!Number.isInteger(body.paymentMethodID) || body.paymentMethodID < 1)
    errors.paymentMethodID = ['The payment method i d field is required.'];
  if (typeof body.transactionDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.transactionDate))
    errors.transactionDate = ['The transaction date field must be a valid date (YYYY-MM-DD).'];
  if (body.purchaseCode != null && String(body.purchaseCode).length !== 6)
    errors.purchaseCode = ['The purchase code field must be 6 characters.'];
  if (!Array.isArray(body.items) || body.items.length === 0) {
    errors.items = ['The items field is required.'];
  } else {
    body.items.forEach((item: any, i: number) => {
      for (const f of ['productID', 'units', 'unitPrice'])
        if (typeof item?.[f] !== 'number' || item[f] < 1) errors[`items.${i}.${f}`] = [`The items.${i}.${f} field is required.`];
    });
  }
  return Object.keys(errors).length ? errors : null;
}

const plugin: MockSystemPlugin = {
  name: 'zata',
  auth: { required: true, schemes: ['bearer'] },
  credential: {
    type: 'apikey',
    authHeader: { scheme: 'bearer', value: 'mock-token' },
    fields: [
      { name: 'baseUrl', role: 'url' },
      { name: 'apiToken', role: 'secret', secret: { charset: 'hex', length: 32 } },
      { name: 'apiVersion', role: 'static', value: 'v1' },
    ],
  },

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // --- Create a sale invoice ---
    app.post('/v1/transaction/sale', async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const errors = validateSale(body);
      if (errors) {
        reply.code(422);
        return { message: Object.values(errors)[0][0], errors };
      }
      const all = store.list('transactions');
      const id = all.reduce((max, t) => Math.max(max, t.id), 1000) + 1;
      const invoiceNumber = all.reduce((max, t) => Math.max(max, t.invoiceNumber), 0) + 1;
      store.create('transactions', String(id), buildTransaction(id, invoiceNumber, body as SaleInput, store));
      return { message: 'Sale transaction created successfully', invoiceID: id };
    });

    // --- Read one transaction by id ---
    app.get('/v1/transaction/:transactionId', async (req, reply) => {
      const id = String((req.params as Record<string, string>).transactionId);
      const found = store.get('transactions', id);
      if (!found) {
        reply.code(404);
        return { message: 'Transaction not found' };
      }
      return toDetail(found);
    });

    // --- List transactions (paginated, filterable by date range and invoice type) ---
    app.get('/v1/transaction', async (req) => {
      const q = req.query as Record<string, string | undefined>;
      const perPage = Math.max(1, Number.parseInt(q.perPage ?? '', 10) || DEFAULT_PER_PAGE);
      const page = Math.max(1, Number.parseInt(q.page ?? '', 10) || 1);
      const rows = store
        .list(
          'transactions',
          (t) =>
            (!q.fromDate || t.salesDate >= q.fromDate) &&
            (!q.toDate || t.salesDate <= q.toDate) &&
            (!q.invoiceType || t.type === q.invoiceType)
        )
        .sort((a, b) => b.id - a.id)
        .map(toRow);
      const data = rows.slice((page - 1) * perPage, page * perPage);
      return {
        data,
        currentPage: page,
        lastPage: Math.max(1, Math.ceil(rows.length / perPage)),
        itemsPerPage: perPage,
        pageItems: data.length,
        total: rows.length,
      };
    });

    // --- EBM product types (the adaptor's own get() example) ---
    app.get('/v1/data/product-type', async () => store.list('productTypes'));
  },

  seed,
};

export default plugin;
