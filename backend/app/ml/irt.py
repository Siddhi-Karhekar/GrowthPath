"""
Lightweight IRT-inspired (Elo-style) calibration: every time a question is
answered, both the student's "ability" estimate and that specific question's
"difficulty" estimate are nudged based on whether the outcome was surprising.
Getting an easy question right barely moves anything; getting a
supposedly-hard question right pulls the question's difficulty down and the
student's ability up. This is what lets adaptive testing (task 8) pick
genuinely well-targeted next questions instead of using static difficulty.
"""
import math

K_FACTOR = 0.15  # how aggressively estimates move per observation


def expected_success_probability(ability: float, difficulty: float) -> float:
    """Logistic curve, same shape as classic Elo/2-parameter IRT."""
    return 1 / (1 + math.exp(-4 * (ability - difficulty)))


def update_ability_and_difficulty(ability: float, difficulty: float, correct_fraction: float) -> tuple[float, float]:
    """correct_fraction: 1.0 for fully correct, 0.0 for wrong, or partial
    credit (e.g. 0.6) for a partially-correct theory answer.
    Returns (new_ability, new_difficulty), both clamped to [0, 1]."""
    expected = expected_success_probability(ability, difficulty)
    surprise = correct_fraction - expected

    new_ability = ability + K_FACTOR * surprise
    new_difficulty = difficulty - K_FACTOR * surprise  # doing better than expected implies it was easier than tagged

    return clamp(new_ability), clamp(new_difficulty)


def clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))
