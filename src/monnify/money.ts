export const formatAgentNaira = (kobo: number): string =>
  `₦${(kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
