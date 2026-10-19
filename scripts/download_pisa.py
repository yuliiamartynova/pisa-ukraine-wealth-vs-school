"""Download the official OECD PISA 2025 data files and extract Ukraine.

Usage:
    uv run python scripts/download_pisa.py

What it does:
  1. Downloads the international student and school questionnaire files
     (SPSS format) from the OECD servers into data/raw/2025/.
     About 1 GB in total. Files that already exist are not downloaded again.
  2. Checks the SHA-256 checksum of every archive against the values below,
     so you can be sure you analyse exactly the same files.
  3. Reads only the columns we need, keeps only Ukrainian students and schools
     and writes small CSV files to data/processed/.

In PISA 2025 Ukraine took part in 17 of 27 regions (schools in occupied and
unsafe territories were not sampled). Its country code is "QUA",
"Ukrainian regions (17 of 27)".

Source: OECD (2026), PISA 2025 Database,
https://www.oecd.org/en/data/datasets/pisa-2025-database.html
"""

from __future__ import annotations

import hashlib
import struct
import sys
import zipfile
import zlib
from pathlib import Path

import inflate64
import pandas as pd
import pyreadstat
import requests

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "2025"
OUT = ROOT / "data" / "processed"

COUNTRY = "QUA"
BASE = "https://webfs.oecd.org/pisa2022/2025"
FILES = {
    "student": ("CY09_MS_STU_PUF.zip", "ef5a76cc20215c09308a541cb3c6ee66583d068ede8535c0b735288e0a71f985"),
    "school": ("CY09_MS_SCH_PUF.zip", "50d8bd2045949f5da0badd6e601b429b1b5279559596a23eb9d097a55fa7e3a7"),
}

DOMAINS = ["MATH", "READ", "SCIE"]
PVS = [f"PV{i}{d}" for d in DOMAINS for i in range(1, 11)]
REPLICATE_WEIGHTS = [f"W_FSTURWT{i}" for i in range(1, 81)]

STUDENT_COLS = ["CNT", "CNTSCHID", "CNTSTUID", "ESCS", "W_FSTUWT"] + PVS + REPLICATE_WEIGHTS
# SC001Q01TA: size of the community where the school is located (village ... large city)
SCHOOL_COLS = ["CNT", "CNTSCHID", "SC001Q01TA"]

CHUNK_ROWS = 50_000
DEFLATE64 = 9  # zip compression method used by the OECD for the student file


def download(url: str, dest: Path) -> None:
    if dest.exists():
        print(f"  already downloaded: {dest.relative_to(ROOT)}")
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    print(f"  downloading {url}")
    with requests.get(url, stream=True, timeout=60, headers={"User-Agent": "Mozilla/5.0"}) as r:
        r.raise_for_status()
        total = int(r.headers.get("Content-Length", 0))
        done, last = 0, -1
        with open(tmp, "wb") as f:
            for block in r.iter_content(chunk_size=1 << 20):
                f.write(block)
                done += len(block)
                pct = int(100 * done / total) if total else 0
                if pct // 10 != last:
                    last = pct // 10
                    print(f"    {pct}% of {total / 1e6:,.0f} MB", flush=True)
    tmp.rename(dest)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def inflate64_member(archive: Path, info: zipfile.ZipInfo, target: Path) -> None:
    """Extract a Deflate64-compressed zip member, which Python's zipfile cannot read."""
    with open(archive, "rb") as f:
        f.seek(info.header_offset)
        header = f.read(30)
        if header[:4] != b"PK\x03\x04":
            sys.exit(f"Bad local file header in {archive}")
        name_len, extra_len = struct.unpack("<HH", header[26:30])
        f.seek(info.header_offset + 30 + name_len + extra_len)
        inflater = inflate64.Inflater()
        crc, remaining = 0, info.compress_size
        with open(target, "wb") as dst:
            while remaining:
                block = f.read(min(1 << 22, remaining))
                remaining -= len(block)
                out = inflater.inflate(block)
                crc = zlib.crc32(out, crc)
                dst.write(out)
    if crc != info.CRC:
        target.unlink()
        sys.exit(f"CRC check failed for {info.filename}")


def extract_sav(archive: Path) -> Path:
    """Unzip the .sav file from the archive next to it and return its path."""
    with zipfile.ZipFile(archive) as z:
        members = [i for i in z.infolist() if i.filename.lower().endswith(".sav")]
        if len(members) != 1:
            sys.exit(f"Expected exactly one .sav file in {archive}, found {[i.filename for i in members]}")
        info = members[0]
        target = archive.parent / Path(info.filename).name
        if not target.exists():
            print(f"  extracting {info.filename}")
            tmp = target.with_suffix(".part")
            if info.compress_type == DEFLATE64:
                inflate64_member(archive, info, tmp)
            else:
                with z.open(info) as src, open(tmp, "wb") as dst:
                    while block := src.read(1 << 20):
                        dst.write(block)
            tmp.rename(target)
    return target


def read_country(sav: Path, columns: list[str]) -> pd.DataFrame:
    """Read the SPSS file in chunks, keeping only the given columns and Ukrainian rows."""
    _, meta = pyreadstat.read_sav(str(sav), metadataonly=True)
    missing = [c for c in columns if c not in set(meta.column_names)]
    if missing:
        sys.exit(f"Columns missing from {sav.name}: {missing}")
    reader = pyreadstat.read_file_in_chunks(
        pyreadstat.read_sav, str(sav), chunksize=CHUNK_ROWS, usecols=columns
    )
    df = pd.concat([chunk[chunk["CNT"] == COUNTRY] for chunk, _ in reader], ignore_index=True)
    if df.empty:
        sys.exit(f"No rows with CNT == {COUNTRY!r} in {sav.name}")
    return df


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for kind, (name, expected) in FILES.items():
        archive = RAW / name
        download(f"{BASE}/{name}", archive)
        digest = sha256(archive)
        status = "OK" if digest == expected else f"differs from the expected {expected}"
        print(f"  sha256 {name}: {digest} ({status})")
        sav = extract_sav(archive)
        df = read_country(sav, STUDENT_COLS if kind == "student" else SCHOOL_COLS)
        out = OUT / f"pisa2025_ukr_{kind}s.csv"
        df.to_csv(out, index=False)
        print(f"  wrote {out.relative_to(ROOT)} ({len(df):,} rows)")


if __name__ == "__main__":
    main()
