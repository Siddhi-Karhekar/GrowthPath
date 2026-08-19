"""
Very deliberately simple forecasting: a linear fit over a student's recent
attempt scores, projected one step forward. This is not meant to be a
sophisticated time-series model - it's meant to answer one practical
question ("is this student trending up or down, and where might they land
next") using something transparent enough to explain in an interview,
rather than a black-box model nobody (including the student) can trust.
"""
import numpy as np

MIN_POINTS_FOR_FORECAST = 3


def linear_forecast(values: list[float]) -> float | None:
    if len(values) < MIN_POINTS_FOR_FORECAST:
        return None
    x = np.arange(len(values))
    slope, intercept = np.polyfit(x, values, 1)
    next_x = len(values)
    forecast = slope * next_x + intercept
    return round(float(max(0.0, min(100.0, forecast))), 1)


def trend_slope(values: list[float]) -> float:
    """Normalized slope for a short series - used to flag 'declining' topics.
    Positive = improving, negative = declining, ~0 = flat."""
    if len(values) < 2:
        return 0.0
    x = np.arange(len(values))
    slope, _ = np.polyfit(x, values, 1)
    return round(float(slope), 4)
