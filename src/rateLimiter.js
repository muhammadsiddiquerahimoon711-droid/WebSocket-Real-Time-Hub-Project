// Sliding-window limiter: allows `max` events per `windowMs` (one instance per socket).
function createLimiter(max, windowMs, now = () => Date.now()) {
  let stamps = [];
  return {
    allow() {
      const t = now();
      stamps = stamps.filter((s) => t - s < windowMs);
      if (stamps.length >= max) return false;
      stamps.push(t);
      return true;
    }
  };
}

module.exports = { createLimiter };
