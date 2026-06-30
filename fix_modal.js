const fs = require('fs');
const file = '/home/mohmaed/Downloads/store-front-/src/pages/store/purchase-invoices/PurchaseInvoicesPage.jsx';
let content = fs.readFileSync(file, 'utf8');
const lines = content.split('\n');

// The lines we want to delete are 633 to 770
// In array index that is 632 to 769
lines.splice(632, 138); // 769 - 632 + 1 = 138

const newModal = `
      {/* Edit Payment Modal */}
      <Dialog
        open={paymentsModalOpen}
        onOpenChange={(open) => {
          setPaymentsModalOpen(open);
          if (!open) {
            setEditingPayment(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تعديل السند</DialogTitle>
          </DialogHeader>

          {editingPayment ? (
            <div className="space-y-4 pt-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-text">المبلغ</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editingPayment.amount ?? editingPayment.debit ?? editingPayment.credit ?? ''}
                    onChange={(e) => setEditingPayment((s) => ({ ...s, amount: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-text">التاريخ</label>
                  <Input
                    type="date"
                    value={editingPayment.date ?? editingPayment.transaction_date ?? editingPayment.payment_date ?? ''}
                    onChange={(e) => setEditingPayment((s) => ({ ...s, date: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-text">رقم السند</label>
                  <Input
                    value={editingPayment.receipt_number ?? editingPayment.receiptNumber ?? ''}
                    onChange={(e) => setEditingPayment((s) => ({ ...s, receipt_number: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-text">البيان</label>
                  <Input
                    value={editingPayment.notes ?? editingPayment.description ?? ''}
                    onChange={(e) => setEditingPayment((s) => ({ ...s, notes: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-3">
                <Button
                  type="button"
                  onClick={() => handleSavePayment(editingPayment)}
                  disabled={editingSaving}
                >
                  {editingSaving ? 'جاري الحفظ...' : 'حفظ'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setPaymentsModalOpen(false);
                    setEditingPayment(null);
                  }}
                  disabled={editingSaving}
                >
                  إلغاء
                </Button>
              </div>
            </div>
          ) : (
            <div className="py-4 text-center text-sm text-text-muted">
              لم يتم تحديد سند للتعديل
            </div>
          )}
        </DialogContent>
      </Dialog>
`;

// Insert the new modal just before the last </div> (which is now at length - 2 or -3)
const divIndex = lines.findIndex((l, i) => i > lines.length - 10 && l.includes('</div>'));
lines.splice(divIndex, 0, newModal);

fs.writeFileSync(file, lines.join('\n'));
console.log('Fixed file');
