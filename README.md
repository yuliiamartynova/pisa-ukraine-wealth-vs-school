# Family or school? PISA 2025 in Ukraine

**Live site: https://yuliiamartynova.github.io/pisa-ukraine-wealth-vs-school/**

An interactive analysis of the question: *what is more strongly associated with a
Ukrainian student's achievement: their family's socio-economic status, or the school
they attend?* It focuses on the social segregation of schools: how much the average
background of a student's schoolmates matters, beyond the student's own family.

Data: OECD PISA 2025, Ukrainian students (country code `QUA`, 17 of 27 regions;
7,105 students in 294 schools).

## Main results (mathematics)

| | |
|---|---|
| Variance in scores between schools | 32% (ESCS: 22%) |
| Student ESCS alone, per SD | +24.1 points, R² 7.6% |
| Student ESCS / school mean ESCS in one model, per SD | +11.3 / +27.1 points, R² 15.1% |
| Gap large city vs village: raw → + ESCS → + school mean ESCS | 59 → 43 → 9 points (n.s.) |

Results for reading and science, standard errors and all model estimates are on the site.

## Method in short

- **Family status:** ESCS, the PISA index of economic, social and cultural status.
  **School composition:** weighted mean ESCS of the sampled students in each school.
- **Models:** M1 score ~ ESCS; M2 score ~ ESCS + school mean ESCS; M3 school fixed
  effects; M4 ESCS + school fixed effects; location models with settlement-size
  dummies (SC001), adding ESCS and school mean ESCS step by step.
- **Estimation:** final student weights, all 10 plausible values, 80 Fay BRR
  replicate weights, Rubin's rules (OECD *PISA Data Analysis Manual*).
- These are descriptive associations, not causal effects.

## Reproduce

Requirements: [uv](https://docs.astral.sh/uv/). It installs the pinned Python
(3.12) and the exact package versions from `uv.lock`.

```bash
uv sync
uv run python scripts/download_pisa.py     # ~1 GB from OECD -> data/raw/, writes data/processed/*.csv
uv run python scripts/analyze.py           # writes docs/data/*.json
uv run python -m http.server -d docs 8000  # open http://localhost:8000
```

The data files are not in the repository: neither the OECD archives (`data/raw/`)
nor the extracted Ukrainian subset (`data/processed/`). Run the download script
first to recreate them.

The download script checks the SHA-256 of the OECD archives:

| File | SHA-256 |
|---|---|
| `CY09_MS_STU_PUF.zip` | `ef5a76cc20215c09308a541cb3c6ee66583d068ede8535c0b735288e0a71f985` |
| `CY09_MS_SCH_PUF.zip` | `50d8bd2045949f5da0badd6e601b429b1b5279559596a23eb9d097a55fa7e3a7` |

The student archive uses Deflate64 compression, which Python's `zipfile` cannot
read. The script decompresses it with `inflate64` and verifies the CRC.

## Repository layout

```
scripts/download_pisa.py   download OECD PISA 2025 files, extract Ukraine (QUA)
scripts/analyze.py         variance decomposition, regression models -> JSON
data/processed/            Ukrainian students and schools (CSV, created by the download script, not committed)
docs/                      the website (GitHub Pages): index.html, app.js, style.css, data/
```

## Source

OECD (2026), *PISA 2025 Database*. https://www.oecd.org/en/data/datasets/pisa-2025-database.html
