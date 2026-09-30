// Earlier color milestones; later stages deepen puzzles within each band.
// Every stage keeps a 60-second timer and two spare tubes.
export const DIFFICULTY_BANDS = [
  { colors: 3, first: 1, last: 2, minimumMoves: 4 },
  { colors: 4, first: 3, last: 5, minimumMoves: 9 },
  { colors: 5, first: 6, last: 15, minimumMoves: 13 },
  { colors: 6, first: 16, last: 35, minimumMoves: 17 },
  { colors: 7, first: 36, last: 65, minimumMoves: 21 },
  { colors: 8, first: 66, last: 100, minimumMoves: 24 },
] as const;
export const colorsFor = (level: number) => DIFFICULTY_BANDS.find(band => level <= band.last)?.colors ?? 8;
