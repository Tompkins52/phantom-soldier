#!/usr/bin/env python3
"""Refresh data/vso-offices.json from the VA Office of General Counsel's public accreditation lists
(the same data behind the VA's own "find a representative" tool).

Source page: https://www.va.gov/ogc/apps/accreditation/  ("Download Complete Lists")
  orgsexcellist.asp  one row per representative + organization: org name, org phone, rep city/state/zip
  repexcellist.asp   one row per representative: registration number, city/state/zip, the rep's phone

The site only shows offices, never individual representatives: one entry per organization + ZIP,
with the local phone (the number most of that office's representatives list) and how many
accredited representatives work out of it.
"""
import io, json, re, sys, datetime, collections
import requests, pandas as pd

ORG_URL = "https://www.va.gov/ogc/apps/accreditation/orgsexcellist.asp"
REP_URL = "https://www.va.gov/ogc/apps/accreditation/repexcellist.asp"
OUT = "data/vso-offices.json"
LOG = "data/vso-offices.log.txt"
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) phantomsoldier.org VSO office finder (monthly refresh)"}

log_lines = []
def log(*a):
    s = " ".join(str(x) for x in a); print(s); log_lines.append(s)

def load_table(raw: bytes) -> pd.DataFrame:
    head = raw[:8]
    if head.startswith(b"PK"):
        return pd.read_excel(io.BytesIO(raw), dtype=str, engine="openpyxl")
    if head.startswith(b"\xd0\xcf\x11\xe0"):
        return pd.read_excel(io.BytesIO(raw), dtype=str, engine="xlrd")
    text = raw.decode("utf-8", "replace").lstrip("﻿")
    if "<table" in text.lower() or "<html" in text.lower():
        tables = pd.read_html(io.StringIO(text), flavor="lxml")
        tables.sort(key=lambda t: -len(t))
        df = tables[0]
        if not any(isinstance(c, str) and re.search(r"[A-Za-z]", c) for c in df.columns):
            df.columns = [str(c).strip() for c in df.iloc[0]]; df = df.iloc[1:]
        return df.astype(str)
    sep = "\t" if text.count("\t") > text.count(",") else ","
    return pd.read_csv(io.StringIO(text), sep=sep, dtype=str)

def clean(v):
    if v is None: return ""
    s = str(v).strip().lstrip("'")
    return "" if s.lower() in ("nan", "none", "null") else re.sub(r"\s+", " ", s)

def digits(s): return re.sub(r"[^0-9]", "", clean(s))

def fmt_phone(p):
    d = digits(p)
    if len(d) == 11 and d.startswith("1"): d = d[1:]
    if len(d) == 10: return f"{d[:3]}-{d[3:6]}-{d[6:]}"
    return clean(p)

def fetch(url):
    r = requests.get(url, headers=UA, timeout=180); r.raise_for_status()
    df = load_table(r.content)
    df.columns = [clean(c) for c in df.columns]
    log("downloaded", url.rsplit("/", 1)[-1], len(r.content), "bytes,", len(df), "rows, columns:", list(df.columns))
    return df

def main():
    orgs = fetch(ORG_URL)
    reps = fetch(REP_URL)
    need = ["Organization Name", "Org Phone", "Representative", "Rep City", "Rep State", "Rep Zip", "Registration Num"]
    missing = [c for c in need if c not in orgs.columns]
    if missing:
        log("ERROR: organizations list is missing columns", missing); sys.exit(1)

    # the representative's own phone, by registration number
    rep_phone = {}
    if "Registration Num" in reps.columns and "Phone" in reps.columns:
        for _, r in reps.iterrows():
            k = digits(r["Registration Num"]); p = fmt_phone(r["Phone"])
            if k and len(digits(p)) >= 10: rep_phone[k] = p
    log("representatives with a phone:", len(rep_phone))

    offices = {}
    for _, r in orgs.iterrows():
        org = clean(r["Organization Name"]); z = digits(r["Rep Zip"])[:5]
        if not org or len(z) != 5: continue
        key = (org.lower(), z)
        o = offices.setdefault(key, {"org": org, "city": clean(r["Rep City"]), "state": clean(r["Rep State"]), "zip": z,
                                     "phones": collections.Counter(), "main": fmt_phone(r["Org Phone"]), "reps": set()})
        reg = digits(r["Registration Num"])
        o["reps"].add(reg or clean(r["Representative"]))
        p = rep_phone.get(reg)
        if p: o["phones"][p] += 1

    out = []
    for o in offices.values():
        if o["phones"]:
            phone, is_main = o["phones"].most_common(1)[0][0], 0
        else:
            phone, is_main = (o["main"] if len(digits(o["main"])) >= 10 else ""), 1
        out.append([o["org"], o["city"], o["state"], o["zip"], phone, len(o["reps"]), is_main])
    out.sort(key=lambda x: (x[2], x[1], x[0]))
    today = datetime.date.today().isoformat()
    data = {"asof": today,
            "source": "VA Office of General Counsel accreditation lists (orgsexcellist.asp, repexcellist.asp)",
            "fields": ["org", "city", "state", "zip", "phone", "reps", "phone_is_org_main_line"],
            "offices": out}
    json.dump(data, open(OUT, "w"), separators=(",", ":"))
    log("offices:", len(out), "written to", OUT)
    log("sample:", out[0] if out else None)

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
