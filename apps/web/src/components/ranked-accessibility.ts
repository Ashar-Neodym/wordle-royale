export function wordTileLabel(letter: string, stateLabel: string, row: number, column: number): string {
  return `Row ${row}, column ${column}, ${letter ? letter.toUpperCase() : 'blank'}, ${stateLabel}`;
}
