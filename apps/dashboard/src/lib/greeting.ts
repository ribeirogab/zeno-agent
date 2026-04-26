export interface Greeting {
  verb: string;
  name: string;
}

export function greetingForHour(hour: number, name: string): Greeting {
  const lower = name.toLowerCase();
  if (hour >= 5 && hour < 12) return { verb: 'Good morning,', name: lower };
  if (hour >= 12 && hour < 18) return { verb: 'Good afternoon,', name: lower };
  return { verb: 'Good evening,', name: lower };
}
