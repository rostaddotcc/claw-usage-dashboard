"""
Model pricing configuration for cost calculation fallback.
Prices are in USD per 1M tokens.
"""

from typing import TypedDict


class ModelCost(TypedDict):
    input: float
    output: float
    cache_read: float
    cache_write: float


# Fallback pricing for models not reporting costs in logs
# Prices in USD per 1M tokens
MODEL_PRICING: dict[str, ModelCost] = {
    # Qwen models (via Bailian/Alibaba Cloud)
    "qwen3.6-plus": {
        "input": 0.35,
        "output": 1.05,
        "cache_read": 0.035,
        "cache_write": 0.0,
    },
    "qwen/qwen3.6-plus": {
        "input": 0.35,
        "output": 1.05,
        "cache_read": 0.035,
        "cache_write": 0.0,
    },
    "qwen/qwen3.6-plus-preview": {
        "input": 0.35,
        "output": 1.05,
        "cache_read": 0.035,
        "cache_write": 0.0,
    },

    # StepFun models
    "step-3.5-flash": {
        "input": 0.10,
        "output": 0.30,
        "cache_read": 0.0,
        "cache_write": 0.0,
    },
    "step-3.5-flash-2603": {
        "input": 0.10,
        "output": 0.30,
        "cache_read": 0.0,
        "cache_write": 0.0,
    },
    "stepfun/step-3.5-flash": {
        "input": 0.10,
        "output": 0.30,
        "cache_read": 0.0,
        "cache_write": 0.0,
    },
    "stepfun/step-3.5-flash-2603": {
        "input": 0.10,
        "output": 0.30,
        "cache_read": 0.0,
        "cache_write": 0.0,
    },

    # StepFun Plan (paid tier)
    "step-3.5-flash-plan": {
        "input": 0.10,
        "output": 0.30,
        "cache_read": 0.0,
        "cache_write": 0.0,
    },
    "stepfun-plan/step-3.5-flash": {
        "input": 0.10,
        "output": 0.30,
        "cache_read": 0.0,
        "cache_write": 0.0,
    },
    "stepfun-plan/step-3.5-flash-2603": {
        "input": 0.10,
        "output": 0.30,
        "cache_read": 0.0,
        "cache_write": 0.0,
    },
}


def get_model_cost(model_id: str) -> ModelCost | None:
    """Get pricing for a model by ID. Returns None if not found."""
    # Try exact match first
    if model_id in MODEL_PRICING:
        return MODEL_PRICING[model_id]

    # Try case-insensitive match
    model_id_lower = model_id.lower()
    for key, cost in MODEL_PRICING.items():
        if key.lower() == model_id_lower:
            return cost

    # Try matching by suffix (e.g., "bailian/qwen3.6-plus" should match "qwen3.6-plus")
    for key, cost in MODEL_PRICING.items():
        if model_id_lower.endswith(key.lower()) or key.lower().endswith(model_id_lower):
            return cost

    return None


def calculate_cost(
    model_id: str,
    input_tokens: int,
    output_tokens: int,
    cache_read_tokens: int = 0,
    cache_write_tokens: int = 0,
) -> dict[str, float]:
    """
    Calculate cost for a model usage.
    Returns dict with input_cost, output_cost, cache_read_cost, cache_write_cost, total_cost.
    All costs in USD.
    """
    pricing = get_model_cost(model_id)

    if pricing is None:
        return {
            "input": 0.0,
            "output": 0.0,
            "cache_read": 0.0,
            "cache_write": 0.0,
            "total": 0.0,
        }

    # Calculate costs (prices are per 1M tokens)
    input_cost = (input_tokens / 1_000_000) * pricing["input"]
    output_cost = (output_tokens / 1_000_000) * pricing["output"]
    cache_read_cost = (cache_read_tokens / 1_000_000) * pricing["cache_read"]
    cache_write_cost = (cache_write_tokens / 1_000_000) * pricing["cache_write"]

    return {
        "input": round(input_cost, 6),
        "output": round(output_cost, 6),
        "cache_read": round(cache_read_cost, 6),
        "cache_write": round(cache_write_cost, 6),
        "total": round(input_cost + output_cost + cache_read_cost + cache_write_cost, 6),
    }
