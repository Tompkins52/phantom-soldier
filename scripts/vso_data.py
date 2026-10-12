#!/usr/bin/env python3
"""Refresh data/vso-offices.json from the VA Office of General Counsel's public list of
VA-accredited VSO representatives (the same list behind the VA's own "find a representative" tool).

Source: https://www.va.gov/ogc/apps/accreditation/  ("Download Complete Lists": VSO Representatives)

The site only shows offices, never individual representatives: one entry per organization + street
address, with the office phone and how many accredited representatives work out of it.
"""
import io, json, re, sys, datetime, collections
import requests, pandas as pd

URL = "https://www.va.gov/ogc/apps/accreditation/repexcellist.asp"
OUT = "data/vso-offices.json"
LOG = "data/vso-offices.log.txt"
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) phantomsoldier.org VSO office finder (monthly refresh)"}

log_lines = []
def log(*a):
    s = " ".join(str(x) for x in a); print(s); log_lines.append(s)

def load_table(raw: bytes) -> pd.DataFrame:
    head = raw[:8]
    if head.startswith(b"PK"):
        log("format: xlsx"); return pd.read_excel(io.BytesIO(raw), dtype=str, engine="openpyxl")
    if head.startswith(b"\xd0\xcf\x11\xe0"):
        log("format: xls"); return pd.read_excel(io.BytesIO(raw), dtype=str, engine="xlrd")
    text = raw.decode("utf-8", "replace").lstrip("﻿")
    if "<table" in text.lower() or "<html" in text.lower():
        log("format: html table")
        tables = pd.read_html(io.StringIO(text), flavor="lxml")
        tables.sort(key=lambda t: -len(t))
        df = tables[0]
        if not any(isinstance(c, str) and re.search(r"[A-Za-z]", c) for c in df.columns):
            df.columns = [str(c).strip() for c in df.iloc[0]]; df = df.iloc[1:]
        return df.astype(str)
    log("format: delimited text")
    sep = "\t" if text.count("\t") > text.count(",") else ","
    return pd.read_csv(io.StringIO(text), sep=sep, dtype=str)

def pick(cols, *patterns):
    for p in patterns:
        for c in cols:
            if re.search(p, c, re.I): return c
    return None

def clean(v):
    if v is None: return ""
    s = str(v).strip()
    return "" if s.lower() in ("nan", "none", "null") else re.sub(r"\s+", " ", s)

ORG_URL = "https://www.va.gov/ogc/apps/accreditation/orgsexcellist.asp"

def probe(url):
    r = requests.get(url, headers=UA, timeout=120); r.raise_for_status()
    df = load_table(r.content); df.columns = [clean(c) for c in df.columns]
    log("PROBE", url, "rows:", len(df), "columns:", list(df.columns))
    for i in range(min(3, len(df))):
        log("  row", i, [clean(v) for v in df.iloc[i].tolist()])
    return df

def main():
    probe(ORG_URL)
    r = requests.get(URL, headers=UA, timeout=120)
    r.raise_for_status()
    raw = r.content
    log("downloaded", len(raw), "bytes, content-type:", r.headers.get("content-type"))
    df = load_table(raw)
    df.columns = [clean(c) for c in df.columns]
    log("rows:", len(df)); log("columns:", list(df.columns))
    cols = list(df.columns)
    c_org   = pick(cols, r"^org", r"organi", r"\bvso\b", r"accredit.*org")
    c_street= pick(cols, r"^address\b", r"address ?1", r"street", r"^addr")
    c_city  = pick(cols, r"^city")
    c_state = pick(cols, r"^state")
    c_zip   = pick(cols, r"zip", r"postal")
    c_phone = pick(cols, r"phone", r"telephone")
    c_last  = pick(cols, r"last ?name", r"^last")
    log("mapping:", {"org": c_org, "street": c_street, "city": c_city, "state": c_state, "zip": c_zip, "phone": c_phone, "last": c_last})
    if not (c_org and c_zip):
        log("ERROR: could not map organization/zip columns"); sys.exit(1)

    offices = collections.OrderedDict()
    for _, row in df.iterrows():
        org = clean(row.get(c_org)); z = clean(row.get(c_zip))
        z5 = re.sub(r"[^0-9]", "", z)[:5]
        if not org or len(z5) != 5: continue
        street = clean(row.get(c_street)) if c_street else ""
        city = clean(row.get(c_city)) if c_city else ""
        state = clean(row.get(c_state)) if c_state else ""
        phone = clean(row.get(c_phone)) if c_phone else ""
        key = (org.lower(), street.lower(), z5)
        o = offices.setdefault(key, {"org": org, "street": street, "city": city, "state": state, "zip": z5, "phones": collections.Counter(), "reps": 0})
        o["reps"] += 1
        digits = re.sub(r"[^0-9]", "", phone)
        if len(digits) >= 10: o["phones"][phone] += 1

    out = []
    for o in offices.values():
        phone = o["phones"].most_common(1)[0][0] if o["phones"] else ""
        out.append([o["org"], o["street"], o["city"], o["state"], o["zip"], phone, o["reps"]])
    out.sort(key=lambda x: (x[3], x[2], x[0]))
    today = datetime.date.today().isoformat()
    data = {"asof": today, "source": "VA Office of General Counsel, accredited VSO representatives list", "fields": ["org", "street", "city", "state", "zip", "phone", "reps"], "offices": out}
    json.dump(data, open(OUT, "w"), separators=(",", ":"))
    log("offices:", len(out), "written to", OUT)
    log("sample:", out[0] if out else None)
    open(LOG, "w").write(f"refreshed {today}\n" + "\n".join(log_lines) + "\n")

if __name__ == "__main__":
    ok = False
    try:
        main(); ok = True
    except SystemExit:
        pass
    except Exception as e:
        import traceback
        log("FAILED:", repr(e)); log(traceback.format_exc())
    finally:
        stamp = ("refreshed " if ok else "attempted ") + datetime.date.today().isoformat()
        open(LOG, "w").write(stamp + "\n" + "\n".join(log_lines) + "\n")
    sys.exit(0 if ok else 1)
