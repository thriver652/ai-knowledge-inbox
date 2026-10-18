// Minimal in-process async job queue with bounded concurrency.
// Good enough for a single process; jobs are lost on crash (items stay "pending" and are
// re-enqueued at startup by the ingest service). Production: BullMQ/SQS/etc. with retries.

export function createJobQueue({ concurrency = 2, logger }) {
  const queue = [];
  let running = 0;
  const idleWaiters = [];

  const notifyIdle = () => {
    if (running === 0 && queue.length === 0) idleWaiters.splice(0).forEach((resolve) => resolve());
  };

  const pump = () => {
    while (running < concurrency && queue.length) {
      const { name, fn } = queue.shift();
      running++;
      Promise.resolve()
        .then(fn)
        .catch((err) => logger.error({ job: name, err: err.message }, 'job crashed'))
        .finally(() => {
          running--;
          pump();
          notifyIdle();
        });
    }
  };

  return {
    enqueue(name, fn) {
      queue.push({ name, fn });
      pump();
    },
    // Used by tests and graceful shutdown.
    onIdle() {
      if (running === 0 && queue.length === 0) return Promise.resolve();
      return new Promise((resolve) => idleWaiters.push(resolve));
    },
    stats: () => ({ running, queued: queue.length }),
  };
}
