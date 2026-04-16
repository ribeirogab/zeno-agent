export interface Greeting {
  /** The salutation verb — e.g. "Boa tarde" — styled as the single coral accent on Home. */
  verb: string;
  /** The person being addressed. */
  name: string;
}

export function greetingForHour(hour: number, name: string): Greeting {
  if (hour < 5 || hour >= 22) return { verb: 'Boa madrugada', name };
  if (hour < 12) return { verb: 'Bom dia', name };
  if (hour < 18) return { verb: 'Boa tarde', name };
  return { verb: 'Boa noite', name };
}
