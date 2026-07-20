export class TokenBucketLimiter {
  private tokens: number;
  private lastRefill: number;
  private maxTokens: number;
  private refillRate: number; // tokens per millisecond

  constructor(maxTokens = 10, refillRatePerSec = 2) {
    this.maxTokens = maxTokens;
    this.refillRate = refillRatePerSec / 1000;
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  consume(tokensToConsume = 1): boolean {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;

    if (this.tokens >= tokensToConsume) {
      this.tokens -= tokensToConsume;
      return true;
    }
    return false;
  }
}
