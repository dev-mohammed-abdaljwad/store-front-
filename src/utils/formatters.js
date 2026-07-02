export const formatCurrency = (amount) =>
  new Intl.NumberFormat('ar-EG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount) || 0) + ' جنيه';

export const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (!isFinite(d.getTime())) return '—';
  return d.toLocaleDateString('ar-EG');
};

export const getBalanceColor = (balance) => {
  if (balance > 0) return 'text-red-600';
  if (balance < 0) return 'text-green-600';
  return 'text-gray-500';
};

export const getBalanceLabel = (balance) => {
  if (balance > 0) return 'مدين';
  if (balance < 0) return 'دائن';
  return 'متسوي';
};