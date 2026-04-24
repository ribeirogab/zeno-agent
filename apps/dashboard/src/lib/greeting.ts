export interface Greeting {
  /** The salutation verb — e.g. "Good afternoon" — styled as the single gold accent on Home. */
  verb: string;
  /** The person being addressed. */
  name: string;
}

export function greetingForHour(hour: number, name: string): Greeting {
  if (hour < 5 || hour >= 22) return { verb: 'Hey', name };
  if (hour < 12) return { verb: 'Good morning', name };
  if (hour < 18) return { verb: 'Good afternoon', name };
  return { verb: 'Good evening', name };
}
