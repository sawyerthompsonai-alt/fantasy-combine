export type EventType =
  | 'forty' | 'bench' | 'vertical' | 'threecone'
  | 'shuttle' | 'gauntlet' | 'broad' | 'champ40';

export interface EventResult {
  type: EventType;
  competitors: number[];                 // athlete indices in this event
  ranking: number[];                     // best → worst finish (theater)
  performances: Record<number, number>;  // athleteIdx → stat value
  eliminated: number[];                  // reveal order: worst pick first
  picksLocked: { pick: number; athlete: number }[]; // same order as eliminated
  round?: number;                        // 2+ for a repeat appearance of this event type
}

export interface Outcomes {
  order: number[];        // order[k] = athlete index holding pick k+1
  events: EventResult[];  // chronological; last is always type 'champ40'
}

export type RoomStatus = 'lobby' | 'revealing' | 'complete';

export interface Room {
  id: string;
  adminToken: string;
  names: string[];
  colors: string[];
  status: RoomStatus;
  seedHash: string;
  seed: string;
  outcomes?: Outcomes;
  startTime?: number;   // epoch ms
  resetCount: number;
  createdAt: number;    // epoch ms
}

export const EVENT_META: Record<EventType, {
  label: string; unit: string; decimals: number; lowerBetter: boolean;
}> = {
  forty:     { label: '40-Yard Dash',     unit: 's',      decimals: 2, lowerBetter: true },
  champ40:   { label: 'Championship 40',  unit: 's',      decimals: 2, lowerBetter: true },
  threecone: { label: '3-Cone Drill',     unit: 's',      decimals: 2, lowerBetter: true },
  shuttle:   { label: '20-Yard Shuttle',  unit: 's',      decimals: 2, lowerBetter: true },
  bench:     { label: 'Bench Press',      unit: ' reps',  decimals: 0, lowerBetter: false },
  vertical:  { label: 'Vertical Jump',    unit: '"',      decimals: 1, lowerBetter: false },
  broad:     { label: 'Broad Jump',       unit: '"',      decimals: 0, lowerBetter: false },
  gauntlet:  { label: 'The Gauntlet',     unit: ' drops', decimals: 0, lowerBetter: true },
};
