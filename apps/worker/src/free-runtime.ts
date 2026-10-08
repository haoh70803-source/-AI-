let pending: Promise<void> = Promise.resolve();
export function freeWorkerMode() { return process.env.FREE_WORKER_MODE === "true"; }
/** One media/research task at a time across both queues in the small demo instance. */
export async function runFreeTask<T>(task: () => Promise<T>): Promise<T> {
  if(!freeWorkerMode()) return task();
  const previous=pending; let release!: () => void;
  pending=new Promise<void>(resolve=>{release=resolve});
  await previous;
  try{return await task()}finally{release()}
}
