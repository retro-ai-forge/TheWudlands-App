export interface CharacterAttributes {
  // Physical
  str: number;
  kon: number;
  sta: number;
  dex: number;
  speed: number;
  // Mental
  pow: number;
  int: number;
  wis: number;
}

export interface CharacterData {
  id: number;
  name: string;
  race: string;
  profession: string;
  level: number;
  affiliation: string;
  attributes: CharacterAttributes;
  hp: { current: number; max: number };
  xp: { current: number; max: number };
  gold: number;
  inventory: string[];
  questLog: string[];
}
