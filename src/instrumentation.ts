export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { startTallyScheduler } = await import('./lib/tally/scheduler');
  startTallyScheduler();
}
