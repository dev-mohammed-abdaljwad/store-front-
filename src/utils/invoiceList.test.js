import { removeDeletedInvoiceFromQueryData } from './invoiceList';

describe('removeDeletedInvoiceFromQueryData', () => {
  it('removes the deleted invoice from paginated query data', () => {
    const currentData = {
      items: [
        { id: 1, invoice_number: 'INV-1' },
        { id: 2, invoice_number: 'INV-2' },
      ],
      meta: { total: 2, page: 1, lastPage: 1, perPage: 10 },
    };

    const result = removeDeletedInvoiceFromQueryData(currentData, 2);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe(1);
    expect(result.meta.total).toBe(1);
  });

  it('returns the existing data when there is no matching invoice', () => {
    const currentData = {
      items: [{ id: 1, invoice_number: 'INV-1' }],
      meta: { total: 1, page: 1, lastPage: 1, perPage: 10 },
    };

    const result = removeDeletedInvoiceFromQueryData(currentData, 99);

    expect(result).toEqual(currentData);
  });
});
