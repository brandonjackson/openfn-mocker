import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * Google Sheets v4 (sheets.googleapis.com/v4). The googlesheets adaptor
 * authenticates with a Bearer access token and calls the spreadsheets.values
 * resource: read a range, append rows, and batch-update values.
 *
 * Two of those endpoints put a colon-suffixed verb in the URL —
 * `.../values/{range}:append` and `.../values:batchUpdate`. In Fastify's router
 * a colon only starts a named param at the START of a segment, so these are
 * ambiguous to match with named params. We therefore register the write routes
 * as a single POST wildcard (`.../values/*` won't help because batchUpdate has no
 * `/values/` slash, so the wildcard sits above `values`) and branch on the tail:
 *   - tail ends with `:batchUpdate` -> batchUpdate
 *   - otherwise                     -> append (strip a leading `values/` and a
 *                                       trailing `:append` to recover the range)
 * The read route uses a normal named param — an A1 range like `Sheet1!A1:C2` is a
 * single whole segment, so `:range` captures it verbatim (its inner colon is data).
 */

/** Rows / columns / cells implied by a 2-D values array. */
function dims(values: any): { rows: number; cols: number; cells: number } {
  const rows = Array.isArray(values) ? values.length : 0;
  const cols = rows && Array.isArray(values[0]) ? values[0].length : 0;
  return { rows, cols, cells: rows * cols };
}

const plugin: MockSystemPlugin = {
  name: 'googlesheets',
  auth: { required: true, schemes: ['bearer'] },
  credential: {
    type: 'apikey',
    authHeader: { scheme: 'bearer', value: 'mock-access-token' },
    fields: [
      { name: 'baseUrl', role: 'url' },
      { name: 'access_token', role: 'secret', secret: { charset: 'hex', length: 40 } },
    ],
  },

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // GET /v4/spreadsheets/:sid/values/:range — read a range's values.
    app.get('/v4/spreadsheets/:sid/values/:range', async (req) => {
      const { range } = req.params as Record<string, any>;
      const record = store.get('sheetData', String(range));
      return {
        range: String(range),
        majorDimension: 'ROWS',
        values: record?.values ?? [],
      };
    });

    // POST /v4/spreadsheets/:sid/* — append + batchUpdate (colon-suffixed verbs).
    app.post('/v4/spreadsheets/:sid/*', async (req) => {
      const params = req.params as Record<string, any>;
      const sid = String(params.sid);
      const tail = String(params['*'] ?? '');
      const body = (req.body ?? {}) as Record<string, any>;

      if (tail.endsWith(':batchUpdate')) {
        // batchUpdate: body is { valueInputOption, data: [{ range, values }, ...] }.
        const data: Record<string, any>[] = Array.isArray(body.data)
          ? body.data
          : body.values
            ? [{ range: body.range, values: body.values }]
            : [];
        let totalUpdatedRows = 0;
        let totalUpdatedColumns = 0;
        let totalUpdatedCells = 0;
        const responses = data.map((d) => {
          const { rows, cols, cells } = dims(d.values);
          totalUpdatedRows += rows;
          totalUpdatedColumns += cols;
          totalUpdatedCells += cells;
          return {
            spreadsheetId: sid,
            updatedRange: d.range,
            updatedRows: rows,
            updatedColumns: cols,
            updatedCells: cells,
          };
        });
        return {
          spreadsheetId: sid,
          totalUpdatedRows,
          totalUpdatedColumns,
          totalUpdatedCells,
          totalUpdatedSheets: responses.length ? 1 : 0,
          responses,
        };
      }

      // append: tail looks like `values/{range}:append`.
      const range = tail.replace(/^values\//, '').replace(/:append$/, '');
      const { rows, cols, cells } = dims(body.values);
      return {
        spreadsheetId: sid,
        tableRange: range,
        updates: {
          spreadsheetId: sid,
          updatedRange: range,
          updatedRows: rows,
          updatedColumns: cols,
          updatedCells: cells,
        },
      };
    });
  },

  seed,
};

export default plugin;
