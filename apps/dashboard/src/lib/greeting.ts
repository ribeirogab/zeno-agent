export interface Greeting {
  verb: string;
  name: string;
}

export function greetingForHour(hour: number, name: string): Greeting {
  const lower = name.toLowerCase();
  if (hour >= 5 && hour < 12) return { verb: 'Bom dia,', name: lower };
  if (hour >= 12 && hour < 18) return { verb: 'Boa tarde,', name: lower };
  return { verb: 'Boa noite,', name: lower };
}
