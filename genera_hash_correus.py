#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Genera un CSV amb "hash curt" determinista a partir d'una llista de correus.

Algorisme (mateix que l'app web):
- email (normalitzat) -> SHA-256 (UTF-8) -> Base32 "friendly" -> primers N caràcters

Entrada:
- correus.csv: una única columna, 1 correu per línia (pot tenir capçalera o no)

Sortida:
- correus_hash.csv: email,hash

Ús:
  python genera_hash_correus.py
  python genera_hash_correus.py --input correus.csv --output correus_hash.csv --len 8 --domain digitechfp.com
"""

from __future__ import annotations

import argparse
import base64
import csv
import hashlib
import re
import sys
from pathlib import Path
from typing import List, Tuple


FRIENDLY_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"  # 32 chars
STANDARD_B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"


def normalize_email(s: str) -> str:
    return (s or "").strip().lower()


def is_valid_email(email: str) -> bool:
    # validació bàsica; suficient per neteja de llista
    return bool(re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", email))


def base32_friendly_from_sha256(email: str) -> str:
    """
    Retorna Base32 'friendly' (sense I, O, 0, 1) a partir del SHA-256(email).
    Implementació:
      - hashlib.sha256(email.encode('utf-8')).digest()
      - base64.b32encode(...) -> string amb alphabet estàndard
      - translate alphabet estàndard -> friendly alphabet (posició a posició)
    """
    digest = hashlib.sha256(email.encode("utf-8")).digest()
    std_b32 = base64.b32encode(digest).decode("ascii").rstrip("=")  # sense padding

    trans = str.maketrans(STANDARD_B32_ALPHABET, FRIENDLY_ALPHABET)
    return std_b32.translate(trans)


def short_hash(email: str, length: int) -> str:
    return base32_friendly_from_sha256(email)[:length]


def read_emails_csv(path: Path) -> List[str]:
    """
    Llegeix correus.csv assumint:
      - 1 columna per línia
      - pot tenir capçalera o no
    """
    if not path.exists():
        raise FileNotFoundError(f"No existeix el fitxer: {path}")

    lines: List[str] = []
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f)
        for row in reader:
            if not row:
                continue
            lines.append(row[0])

    # Si la primera línia sembla capçalera típica, la saltem.
    if lines:
        first = normalize_email(lines[0])
        if first in {"email", "correu", "correus", "mail"}:
            lines = lines[1:]

    return lines


def write_output_csv(path: Path, rows: List[Tuple[str, str]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["email", "hash"])
        w.writerows(rows)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", default="correus.csv", help="Fitxer d'entrada (1 correu per línia)")
    ap.add_argument("--output", default="correus_hash.csv", help="Fitxer de sortida CSV")
    ap.add_argument("--len", type=int, default=8, help="Longitud del hash curt (6 o 8 recomanat)")
    ap.add_argument("--domain", default="digitechfp.com", help="Domini obligatori (ex: digitechfp.com). Posa '' per desactivar.")
    ap.add_argument("--allow-invalid", action="store_true", help="Si s'activa, manté correus invàlids al CSV (hash buit).")
    args = ap.parse_args()

    in_path = Path(args.input)
    out_path = Path(args.output)
    hlen = args.len

    if hlen < 4 or hlen > 16:
        print("❌ --len fora de rang raonable (4..16).", file=sys.stderr)
        return 2

    domain = args.domain.strip().lower()
    require_domain = bool(domain)

    raw = read_emails_csv(in_path)
    if not raw:
        print("❌ No s'han trobat correus a l'entrada.", file=sys.stderr)
        return 2

    normalized: List[str] = [normalize_email(x) for x in raw if normalize_email(x)]
    if not normalized:
        print("❌ Totes les línies són buides després de normalitzar.", file=sys.stderr)
        return 2

    # Duplicats exactes
    seen = set()
    deduped: List[str] = []
    dups = 0
    for e in normalized:
        if e in seen:
            dups += 1
            continue
        seen.add(e)
        deduped.append(e)

    if dups:
        print(f"ℹ️ Eliminats {dups} duplicats exactes (mateix correu repetit).")

    rows: List[Tuple[str, str]] = []
    invalids: List[str] = []
    wrong_domain: List[str] = []

    for email in deduped:
        ok = is_valid_email(email)
        if not ok:
            invalids.append(email)
            if args.allow_invalid:
                rows.append((email, ""))
            continue

        if require_domain and not email.endswith(f"@{domain}"):
            wrong_domain.append(email)
            if args.allow_invalid:
                rows.append((email, ""))
            continue

        rows.append((email, short_hash(email, hlen)))

    # Col·lisions (hash igual per emails diferents)
    collisions = {}
    for email, h in rows:
        if not h:
            continue
        collisions.setdefault(h, []).append(email)
    collision_groups = {h: ems for h, ems in collisions.items() if len(ems) > 1}

    write_output_csv(out_path, rows)

    print(f"✅ Sortida generada: {out_path} ({len(rows)} files)")
    if invalids:
        print(f"⚠️ Correus invàlids (ignorats): {len(invalids)}")
        for e in invalids[:10]:
            print(f"   - {e}")
        if len(invalids) > 10:
            print("   ...")

    if wrong_domain:
        print(f"⚠️ Correus fora del domini @{domain} (ignorats): {len(wrong_domain)}")
        for e in wrong_domain[:10]:
            print(f"   - {e}")
        if len(wrong_domain) > 10:
            print("   ...")

    if collision_groups:
        print("🚨 ATENCIÓ: s'han detectat col·lisions de hash curt:")
        for h, ems in sorted(collision_groups.items()):
            print(f"   {h}: {', '.join(ems)}")
        print("👉 Recomanació: usa --len 8 (o més) per reduir col·lisions.")
    else:
        print("✅ Sense col·lisions detectades amb aquesta longitud de hash.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())