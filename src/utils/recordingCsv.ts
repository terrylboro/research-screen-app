/** RFC-style CSV escaping; null/undefined values are empty cells. */
export function samplesToCsv<T extends object>(samples: T[]): string {
  if (!samples.length) return '';
  const columns = Object.keys(samples[0]) as (keyof T)[];
  const escape = (value: unknown) => {
    const text = value == null ? '' : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [columns.map(escape).join(','), ...samples.map(sample => columns.map(key => escape(sample[key])).join(','))].join('\r\n') + '\r\n';
}
