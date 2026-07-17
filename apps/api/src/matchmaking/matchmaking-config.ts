export function standardQueueEnabled(): boolean {
  const value = process.env.STANDARD_1V1_QUEUE_ENABLED;
  return value === undefined
    || value === ''
    || value === '1'
    || value.toLowerCase() === 'true'
    || value.toLowerCase() === 'yes';
}

export function speedQueueEnabled(): boolean {
  const value = process.env.SPEED_1V1_QUEUE_ENABLED?.toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}
