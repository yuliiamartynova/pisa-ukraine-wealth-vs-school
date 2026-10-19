"""Family background vs. school: social segregation of Ukrainian schools in PISA 2025.

Usage:
    uv run python scripts/analyze.py

Reads data/processed/*.csv (made by download_pisa.py) and writes the JSON files
that the website in docs/ loads.

Estimates, for mathematics, reading and science:
  1. Between-school share of variance (school fixed effects R^2) of scores and of ESCS.
  2. Regression models
       M1  score ~ ESCS
       M2  score ~ ESCS + school mean ESCS            (contextual model)
       M3  score ~ school fixed effects
       M4  score ~ ESCS + school fixed effects
     Coefficients are reported per unit and per standard deviation (SD of
     student ESCS for ESCS; SD of school mean ESCS across students for the
     school mean). M1-M4 R^2 give a commonality analysis:
       family only = R2(M4) - R2(M3), school only = R2(M4) - R2(M1),
       overlap     = R2(M1) + R2(M3) - R2(M4)
  3. School location (SC001): mean score by settlement size, and the gap to
     village schools in three models: no controls, + ESCS, + ESCS and school
     mean ESCS.

Every statistic follows PISA methodology: estimated with the final student
weight for each of the 10 plausible values, sampling variance from the 80
Fay BRR replicate weights (k = 0.5), and combined with Rubin's rules. School
mean ESCS is recomputed with each replicate weight.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "processed"
OUT = ROOT / "docs" / "data"

DOMAINS = {"MATH": "math", "READ": "reading", "SCIE": "science"}
SHORT = {"math": "m", "reading": "r", "science": "sc"}  # compact keys in the website JSON
N_PV = 10
N_REP = 80
FAY = 0.5

# SC001Q01TA, size of the community where the school is located
LOCATIONS = {
    1: "Village (< 3k)",
    2: "Small town (3–15k)",
    3: "Town (15–100k)",
    4: "City (100k–1m)",
    5: "Large city (1m+)",
}


# ---------------------------------------------------------------- weighted tools

def wmean(x: np.ndarray, w: np.ndarray) -> float:
    return float(np.sum(w * x) / np.sum(w))


def wsd(x: np.ndarray, w: np.ndarray) -> float:
    return float(np.sqrt(np.sum(w * (x - wmean(x, w)) ** 2) / np.sum(w)))


def group_wmean(x: np.ndarray, w: np.ndarray, g: np.ndarray, n_groups: int) -> np.ndarray:
    """Weighted mean of x within each group, broadcast back to every row."""
    num = np.bincount(g, weights=w * x, minlength=n_groups)
    den = np.bincount(g, weights=w, minlength=n_groups)
    return (num / den)[g]


def wls(X: np.ndarray, y: np.ndarray, w: np.ndarray) -> tuple[np.ndarray, float]:
    """Weighted least squares. Returns coefficients and weighted R^2."""
    sw = np.sqrt(w)
    beta, *_ = np.linalg.lstsq(X * sw[:, None], y * sw, rcond=None)
    resid = y - X @ beta
    ss_tot = np.sum(w * (y - wmean(y, w)) ** 2)
    return beta, 1.0 - np.sum(w * resid**2) / ss_tot


def between_share(y: np.ndarray, w: np.ndarray, g: np.ndarray, n_groups: int) -> float:
    """R^2 of school fixed effects = share of variance lying between schools."""
    ss_tot = np.sum(w * (y - wmean(y, w)) ** 2)
    return 1.0 - np.sum(w * (y - group_wmean(y, w, g, n_groups)) ** 2) / ss_tot


def weighted_quantiles(x: np.ndarray, w: np.ndarray, probs=(0.05, 0.1, 0.5, 0.9, 0.95)) -> dict:
    order = np.argsort(x)
    cum = np.cumsum(w[order]) / np.sum(w)
    return {f"p{round(p * 100)}": round(float(x[order][np.searchsorted(cum, p)]), 3) for p in probs}


def pisa_combine(df: pd.DataFrame, ycols: list[str], stat) -> dict:
    """Run stat(y, w) -> dict over plausible values and replicate weights; combine with Rubin's rules.

    ycols holds the 10 plausible-value columns, or a single column for variables
    without plausible values (then there is no imputation variance).
    """
    w_final = df["W_FSTUWT"].to_numpy()
    w_reps = [df[f"W_FSTURWT{r}"].to_numpy() for r in range(1, N_REP + 1)]
    per_pv, sampling_var = [], []
    for col in ycols:
        y = df[col].to_numpy()
        full = stat(y, w_final)
        reps = [stat(y, wr) for wr in w_reps]
        per_pv.append(full)
        sampling_var.append(
            {k: sum((r[k] - full[k]) ** 2 for r in reps) / (N_REP * (1 - FAY) ** 2) for k in full}
        )
    m = len(ycols)
    result = {}
    for k in per_pv[0]:
        values = np.array([pv[k] for pv in per_pv])
        imputation_var = values.var(ddof=1) if m > 1 else 0.0
        total_var = np.mean([sv[k] for sv in sampling_var]) + (1 + 1 / m) * imputation_var
        result[k] = {"est": round(float(values.mean()), 4), "se": round(float(np.sqrt(total_var)), 4)}
    return result


# ---------------------------------------------------------------- statistics

def score_models(y, w, escs, g, n_groups):
    ones = np.ones_like(y)
    escs_school = group_wmean(escs, w, g, n_groups)
    sd_escs = wsd(escs, w)
    sd_school = wsd(escs_school, w)

    (a1, b1), r2_m1 = wls(np.column_stack([ones, escs]), y, w)
    (a2, b_own, b_comp), r2_m2 = wls(np.column_stack([ones, escs, escs_school]), y, w)
    r2_m3 = between_share(y, w, g, n_groups)

    # ESCS + school fixed effects, via within-school deviations (Frisch-Waugh)
    y_dm = y - group_wmean(y, w, g, n_groups)
    e_dm = escs - escs_school
    b_fe = np.sum(w * e_dm * y_dm) / np.sum(w * e_dm**2)
    ss_tot = np.sum(w * (y - wmean(y, w)) ** 2)
    r2_m4 = 1.0 - np.sum(w * (y_dm - b_fe * e_dm) ** 2) / ss_tot

    return {
        "mean": wmean(y, w),
        "sd": wsd(y, w),
        "between_share": r2_m3,
        # M1
        "m1_b": b1, "m1_b_sd": b1 * sd_escs, "m1_r2": r2_m1,
        # M2 (contextual)
        "m2_a": a2,
        "m2_b_own": b_own, "m2_b_own_sd": b_own * sd_escs,
        "m2_b_comp": b_comp, "m2_b_comp_sd": b_comp * sd_school,
        "m2_r2": r2_m2,
        # M3 / M4
        "m3_r2": r2_m3, "m4_r2": r2_m4, "m4_b": b_fe,
        # commonality
        "family_only": r2_m4 - r2_m3,
        "school_only": r2_m4 - r2_m1,
        "overlap": r2_m1 + r2_m3 - r2_m4,
        "unexplained": 1.0 - r2_m4,
    }


def location_models(y, w, escs, loc, g, n_groups):
    """Mean score by location and gaps to village schools in three models."""
    out = {}
    for k in LOCATIONS:
        mask = loc == k
        out[f"mean_{k}"] = wmean(y[mask], w[mask])
    ones = np.ones_like(y)
    dummies = np.column_stack([(loc == k).astype(float) for k in list(LOCATIONS)[1:]])
    escs_school = group_wmean(escs, w, g, n_groups)
    designs = {
        "raw": np.column_stack([ones, dummies]),
        "escs": np.column_stack([ones, dummies, escs]),
        "comp": np.column_stack([ones, dummies, escs, escs_school]),
    }
    for name, X in designs.items():
        beta, r2 = wls(X, y, w)
        for i, k in enumerate(list(LOCATIONS)[1:]):
            out[f"gap_{name}_{k}"] = beta[1 + i]
        out[f"r2_{name}"] = r2
    return out


def escs_stats(y, w, g, n_groups):
    escs_school = group_wmean(y, w, g, n_groups)
    return {
        "mean": wmean(y, w),
        "sd": wsd(y, w),
        "school_sd": wsd(escs_school, w),
        "between_share": between_share(y, w, g, n_groups),
    }


# ---------------------------------------------------------------- main

def groups(df: pd.DataFrame) -> tuple[np.ndarray, int]:
    ids = np.sort(df["CNTSCHID"].unique())
    return np.searchsorted(ids, df["CNTSCHID"].to_numpy()), len(ids)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    students = pd.read_csv(DATA / "pisa2025_ukr_students.csv")
    schools = pd.read_csv(DATA / "pisa2025_ukr_schools.csv")

    df = students.dropna(subset=["ESCS"]).merge(
        schools[["CNTSCHID", "SC001Q01TA"]], on="CNTSCHID", how="left"
    ).reset_index(drop=True).copy()
    g, n_groups = groups(df)
    escs = df["ESCS"].to_numpy()

    dl = df.dropna(subset=["SC001Q01TA"]).reset_index(drop=True)
    gl, n_groups_l = groups(dl)
    escs_l = dl["ESCS"].to_numpy()
    loc_l = dl["SC001Q01TA"].astype(int).to_numpy()

    print(
        f"PISA 2025 Ukraine: {len(students):,} students, {students['CNTSCHID'].nunique()} schools; "
        f"{len(df):,} with ESCS; {len(dl):,} with ESCS and school location"
    )

    results = {
        "sample": {
            "n_students": int(len(students)),
            "n_schools": int(students["CNTSCHID"].nunique()),
            "n_escs": int(len(df)),
            "n_location": int(len(dl)),
            "n_location_schools": int(dl["CNTSCHID"].nunique()),
            "location_counts": {
                str(k): int((loc_l == k).sum()) for k in LOCATIONS
            },
        },
        "locations": {str(k): v for k, v in LOCATIONS.items()},
        "escs": pisa_combine(df, ["ESCS"], lambda y, w: escs_stats(y, w, g, n_groups)),
        "escs_quantiles": weighted_quantiles(escs, df["W_FSTUWT"].to_numpy()),
        # quantiles of school mean ESCS across students (the school each student attends)
        "school_escs_quantiles": weighted_quantiles(
            group_wmean(escs, df["W_FSTUWT"].to_numpy(), g, n_groups), df["W_FSTUWT"].to_numpy()
        ),
        "domains": {},
    }

    for code, name in DOMAINS.items():
        pvs = [f"PV{p}{code}" for p in range(1, N_PV + 1)]
        r = pisa_combine(df, pvs, lambda y, w: score_models(y, w, escs, g, n_groups))
        r["mean_all"] = pisa_combine(students, pvs, lambda y, w: {"m": wmean(y, w)})["m"]
        r.update(pisa_combine(dl, pvs, lambda y, w: location_models(y, w, escs_l, loc_l, gl, n_groups_l)))
        results["domains"][name] = r
        print(
            f"  {name:8s} mean {r['mean_all']['est']:.1f} | between {r['between_share']['est']:.3f}"
            f" | M1 b/SD {r['m1_b_sd']['est']:.1f} R2 {r['m1_r2']['est']:.3f}"
            f" | M2 own {r['m2_b_own_sd']['est']:.1f} comp {r['m2_b_comp_sd']['est']:.1f} R2 {r['m2_r2']['est']:.3f}"
            f" | gap village-large city {r['gap_raw_5']['est']:.1f} -> {r['gap_escs_5']['est']:.1f}"
            f" -> {r['gap_comp_5']['est']:.1f}"
        )
    e = results["escs"]
    print(f"  ESCS between-school share {e['between_share']['est']:.3f}, mean {e['mean']['est']:.2f}")

    with open(OUT / "results.json", "w", encoding="utf-8") as f:
        json.dump(results, f, indent=1, ensure_ascii=False)

    # Student points and school averages for the explorer. Scores are the mean of
    # the 10 plausible values: for display only, all statistics above use the
    # proper method. School ids are replaced by an index.
    df = df.assign(school=g)
    points = pd.DataFrame({"s": g, "e": df["ESCS"].round(2)})
    for code, name in DOMAINS.items():
        cols = [f"PV{p}{code}" for p in range(1, N_PV + 1)]
        points[SHORT[name]] = df[cols].mean(axis=1).round(0).astype(int)

    w = df["W_FSTUWT"]
    school_rows = []
    for idx, sub in df.groupby("school"):
        ws = w.loc[sub.index]
        loc = sub["SC001Q01TA"].iloc[0]
        row = {
            "id": int(idx),
            "n": int(len(sub)),
            "e": round(float(np.average(sub["ESCS"], weights=ws)), 2),
            "loc": None if pd.isna(loc) else int(loc),
        }
        for code, name in DOMAINS.items():
            pv_mean = sub[[f"PV{p}{code}" for p in range(1, N_PV + 1)]].mean(axis=1)
            row[SHORT[name]] = round(float(np.average(pv_mean, weights=ws)), 1)
        school_rows.append(row)

    with open(OUT / "students.json", "w", encoding="utf-8") as f:
        json.dump(
            {"columns": list(points.columns), "rows": points.to_numpy().tolist(), "schools": school_rows},
            f,
            separators=(",", ":"),
        )
    print(f"wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
