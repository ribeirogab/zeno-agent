export function greetingForHour(hour: number, name: string): string {
  if (hour < 5 || hour >= 22) return `Boa madrugada, ${name}.`;
  if (hour < 12) return `Bom dia, ${name}.`;
  if (hour < 18) return `Boa tarde, ${name}.`;
  return `Boa noite, ${name}.`;
}
