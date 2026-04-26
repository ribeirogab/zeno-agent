export interface Greeting {
  verb: string;
  name: string;
}

/**
 * Greeting verb chosen by hour of day. Designed to feed the home hero
 * (`<verb>, <name>`). Returns the name unchanged so the caller controls casing.
 */
export function greetingForHour(hour: number, name: string): Greeting {
  if (hour < 5) return { verb: 'Hey', name };
  if (hour < 12) return { verb: 'Good morning', name };
  if (hour < 18) return { verb: 'Good afternoon', name };
  if (hour < 22) return { verb: 'Good evening', name };
  return { verb: 'Hey', name };
}
