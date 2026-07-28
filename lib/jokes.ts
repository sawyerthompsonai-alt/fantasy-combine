import { seededShuffle } from './shuffle';
import { createRng } from './rng';

// G-rated ribbing about fantasy football habits only, never about the real
// person beyond their name — no gendered honorifics or pronouns anywhere in
// this pool (see tests/jokes.test.ts's regression test).
const NICKNAMES = [
  'The Waiver Wire Wizard', 'Captain Autodraft', 'The Trade Machine', 'Captain Hindsight',
  'The Bye-Week Gambler', "The Commissioner's Nightmare", 'The Sleeper Whisperer',
  'The Panic Trader', 'FAAB Baron', 'The Injury-Report Scholar', 'The Mock Draft Legend',
  'Bench Warmer General', 'The Vulture', 'The Two-QB Truther', 'Sunday Scaries',
  'The Handcuff Collector', 'The Group Chat Menace', 'Old Reliable (Allegedly)',
  'The Kicker Enthusiast', 'The Comeback Kid (Week 14)', 'The Trash Talk Titan',
];
const COLLEGES = [
  'Gridiron State', 'University of Mock Drafts', 'Waiver Wire Tech', 'Autodraft A&M',
  'Bye Week Community College', 'Garbage Time University', 'Snake Draft State',
  'Redraft U', 'Points-Against Polytechnic', 'Fantasy Island Institute',
  'Southern Regression', 'Boom-or-Bust College', 'Vegas Line University',
  'Sleeper App State', 'Championship Window CC', 'Taco Tech', 'PPR Polytechnic',
  'Handcuff Hills', 'Start-Em Sit-Em Seminary', 'The Trenches School of Mines',
  'Upside University',
];
const HANDS = ['17 inches', 'buttery', 'unmeasurable', '9¾" (gloves on)', 'a matching pair'];
const VERTS = ['undisclosed', '3" (off the couch)', 'declined', 'still pending review', '"plenty"'];
const BENCHES = ['declined to answer', '225 lbs of snacks', 'one (1) rep', 'asked for a spot, left', 'emotional only'];
const SCOUTING = [
  'Elite trash talker. Questionable roster management.',
  'Drafts kickers early. Scouts concerned.',
  'Has never once read an injury report.',
  'League-winning upside, group-chat motor.',
  'Sets the lineup from the parking lot at kickoff.',
  'Once benched a 40-point game. Never recovered.',
  'Film shows exceptional couch speed.',
  'Starts players on bye at an elite rate.',
  'Trades in bulk. Wins in theory.',
  'High football IQ, low football GPA.',
  'Runs hot after one good waiver claim.',
  'Blames the schedule. Every year.',
  'All gas, no bench depth.',
  'Undefeated in leagues that no longer exist.',
  'Draft-day legend. Season-long mystery.',
  'Plays matchups. Loses anyway.',
];
const ROASTS = [
  '{name}\'s combine ends here — scouts cite "vibes."',
  '{name} is out. The group chat goes quiet.',
  'Scouts loved the effort from {name}. The stopwatch did not.',
  '{name} has officially declared for the couch.',
  'A quiet exit for {name} — sources say snacks were a factor.',
  '{name} will be back next year. Same strategy, probably.',
  '{name} — the tape does not lie. Unfortunately.',
  '{name} exits — draft stock: "ask again later."',
  '{name} is gone, but the trash talk lives forever.',
  '{name} out. Scouts point to the film. There is no film.',
];

export interface AthleteBio {
  nickname: string;
  college: string;
  measurables: { label: string; value: string }[];
  scoutingLine: string;
}

export function athleteBios(seed: string, n: number): AthleteBio[] {
  const nicks = seededShuffle(NICKNAMES, seed, 'joke:nick');
  const colleges = seededShuffle(COLLEGES, seed, 'joke:college');
  return Array.from({ length: n }, (_, i) => {
    const rng = createRng(`${seed}:joke:bio:${i}`);
    const pick = <T,>(pool: readonly T[]): T => pool[Math.floor(rng() * pool.length)];
    return {
      nickname: nicks[i % nicks.length],
      college: colleges[i % colleges.length],
      measurables: [
        { label: 'HANDS', value: pick(HANDS) },
        { label: 'VERTICAL', value: pick(VERTS) },
        { label: 'BENCH', value: pick(BENCHES) },
      ],
      scoutingLine: pick(SCOUTING),
    };
  });
}

export function farewellLine(seed: string, athlete: number, name: string): string {
  const order = seededShuffle(ROASTS, seed, 'joke:roast');
  return order[athlete % order.length].replaceAll('{name}', name);
}

/** Test-only access to the raw joke pools (see tests/jokes.test.ts's
 * gendered-language regression test) — every pool entry is assigned by
 * seeded shuffle to a real manager by name, so none of them may carry their
 * own gendered honorific/pronoun regardless of who ends up with it. */
export const JOKE_POOLS = { NICKNAMES, COLLEGES, HANDS, VERTS, BENCHES, SCOUTING, ROASTS };
