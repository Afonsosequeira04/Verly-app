export function normalizeCurrency(currency) {
  const value = String(currency || 'EUR').trim().toUpperCase();
  return value || 'EUR';
}

export function formatMoney(value, currency = 'EUR', options = {}) {
  const amount = Number(value || 0);
  const code = normalizeCurrency(currency);
  const maximumFractionDigits = options.maximumFractionDigits ?? 2;
  const minimumFractionDigits = options.minimumFractionDigits ?? Math.min(2, maximumFractionDigits);
  try {
    return new Intl.NumberFormat('pt-PT', {
      style: 'currency',
      currency: code,
      maximumFractionDigits,
      minimumFractionDigits,
    }).format(amount);
  } catch (_) {
    return `${amount.toFixed(maximumFractionDigits)} ${code}`;
  }
}

export function formatCompactMoney(value, currency = 'EUR') {
  const amount = Math.abs(Number(value || 0));
  const code = normalizeCurrency(currency);
  const signed = Number(value || 0) < 0 ? '-' : '';
  const shortValue = amount >= 1000000
    ? `${(amount / 1000000).toFixed(1)}M`
    : amount >= 1000
      ? `${(amount / 1000).toFixed(1)}k`
      : amount.toFixed(0);
  return `${signed}${shortValue} ${code}`;
}
