const adjectives = [
  'Swift', 'Skilled', 'Clever', 'Bold', 'Quiet', 'Sharp',
  'Bright', 'Brilliant', 'Modern', 'Classic', 'Efficient', 'Dynamic'
];

const nouns = [
  'Router', 'Architect', 'Builder', 'Coder', 'Draftsman', 'Designer',
  'Planner', 'Engineer', 'Artisan', 'Creator', 'Maker', 'Modeler'
];

export function generateRandomName(): string {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const hex = Math.random().toString(16).substring(2, 6);
  return `${adj}-${noun}-${hex}`;
}
