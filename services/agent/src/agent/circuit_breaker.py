"""LLM Circuit Breaker implementation using pybreaker."""

import os
from typing import Dict, Any, Callable
from datetime import datetime, timezone, timedelta
import pybreaker
from prometheus_client import Gauge

# Prometheus gauge reflecting circuit state: 0=closed, 1=open, 2=half-open
llm_circuit_state = Gauge(
    "llm_circuit_state",
    "State of the LLM circuit breaker (0=closed, 1=open, 2=half-open)",
    ["provider"]
)


class MetricCircuitBreakerListener(pybreaker.CircuitBreakerListener):
    """Listener that updates Prometheus llm_circuit_state gauge on changes."""

    def __init__(self, provider: str) -> None:
        """Initialize listener and set state to closed."""
        super().__init__()
        self.provider = provider
        # Initialize to closed (0)
        llm_circuit_state.labels(provider=self.provider).set(0)

    def state_change(
        self,
        cb: pybreaker.CircuitBreaker,
        old_state: pybreaker.CircuitBreakerState,
        new_state: pybreaker.CircuitBreakerState
    ) -> None:
        """Update Prometheus gauge with the new state value."""
        state_val = 0
        if new_state.name == 'open':
            state_val = 1
        elif new_state.name == 'half-open':
            state_val = 2
        elif new_state.name == 'closed':
            state_val = 0

        llm_circuit_state.labels(provider=self.provider).set(state_val)


class CircuitBreakerManager:
    """Manages per-provider pybreaker.CircuitBreaker instances.

    Provides async-safe execution avoiding buggy/Tornado dependencies.
    """

    def __init__(self) -> None:
        """Initialize CircuitBreakerManager settings."""
        self.breakers: Dict[str, pybreaker.CircuitBreaker] = {}
        # Fetch configurations from environment
        self.fail_max = int(os.getenv("CIRCUIT_FAIL_MAX", 5))
        self.reset_timeout = float(os.getenv("CIRCUIT_RESET_TIMEOUT", 30.0))

    def get_breaker(self, provider: str) -> pybreaker.CircuitBreaker:
        """Retrieves or creates a pybreaker.CircuitBreaker for the provider."""
        provider = provider.lower()
        if provider not in self.breakers:
            listener = MetricCircuitBreakerListener(provider)
            # NOTE: pybreaker uses thread locks under the hood. For asyncio, we
            # bypass its call_async since it pulls in legacy tornado imports.
            breaker = pybreaker.CircuitBreaker(
                fail_max=self.fail_max,
                reset_timeout=self.reset_timeout,
                listeners=[listener],
                throw_new_error_on_trip=False
            )
            self.breakers[provider] = breaker
        return self.breakers[provider]

    async def call_async(
        self,
        provider: str,
        func: Callable[..., Any],
        *args: Any,
        **kwargs: Any
    ) -> Any:
        """Async-safe execution wrapper.

        Avoids Tornado-dependent call_async inside pybreaker.
        """
        breaker = self.get_breaker(provider)
        with breaker._lock:
            state = breaker.state
            if state.name == 'open':
                timeout = timedelta(seconds=breaker.reset_timeout)
                opened_at = breaker._state_storage.opened_at
                now = datetime.now(timezone.utc)
                if opened_at and opened_at.tzinfo is None:
                    now = datetime.now()
                if opened_at and now < opened_at + timeout:
                    raise pybreaker.CircuitBreakerError(
                        "Timeout not elapsed yet, circuit breaker still open"
                    )
                breaker.half_open()
                state = breaker.state

            for listener in breaker.listeners:
                listener.before_call(breaker, func, *args, **kwargs)

        try:
            ret = await func(*args, **kwargs)
        except BaseException as e:
            with breaker._lock:
                if breaker.is_system_error(e):
                    breaker._inc_counter()
                    for listener in breaker.listeners:
                        listener.failure(breaker, e)
                    breaker.state.on_failure(e)
                else:
                    breaker._state_storage.reset_counter()
                    breaker.state.on_success()
                    for listener in breaker.listeners:
                        listener.success(breaker)
            raise
        else:
            with breaker._lock:
                breaker._state_storage.reset_counter()
                breaker.state.on_success()
                for listener in breaker.listeners:
                    listener.success(breaker)
            return ret


# Global instance of CircuitBreakerManager
circuit_breaker_manager = CircuitBreakerManager()
