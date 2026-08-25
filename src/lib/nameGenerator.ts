const ADJECTIVES = [
  'Quantum', 'Neon', 'Cyber', 'Stellar', 'Cosmic',
  'Phantom', 'Neural', 'Void', 'Digital', 'Crypto',
  'Astral', 'Plasma', 'Solar', 'Lunar', 'Nova'
];

const NOUNS = [
  'Eagle', 'Ninja', 'Wolf', 'Dragon', 'Phoenix',
  'Pulse', 'Ghost', 'Matrix', 'Nexus', 'Cipher',
  'Rider', 'Glitch', 'Spark', 'Echo', 'Vortex'
];

export function generateRandomName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 100);
  return `${adj}_${noun}${num > 0 ? num : ''}`;
}
