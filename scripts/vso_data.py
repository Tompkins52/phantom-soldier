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

US = set("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR GU VI AS MP".split())

def fmt_phone(p):
    """Returns (display, tel_digits) or ("", "") when it is not a 10-digit US number."""
    raw = clean(p)
    m = re.match(r"^\s*(.*?)(?:\s*(?:x|ext\.?|extension)\s*(\d{1,6}))?\s*$", raw, re.I)
    main, ext = (m.group(1), m.group(2)) if m else (raw, None)
    d = digits(main)
    if len(d) == 11 and d.startswith("1"): d = d[1:]
    if len(d) != 10: return "", ""
    disp = f"{d[:3]}-{d[3:6]}-{d[6:]}" + (f" ext. {ext}" if ext else "")
    return disp, d

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
            k = digits(r["Registration Num"]); disp, tel = fmt_phone(r["Phone"])
            if k and tel: rep_phone[k] = (disp, tel)
    log("representatives with a phone:", len(rep_phone))

    # pass 1: one entry per organization + ZIP
    offices = {}
    for _, r in orgs.iterrows():
        org = clean(r["Organization Name"]); z = digits(r["Rep Zip"])[:5]; st = clean(r["Rep State"]).upper()
        if not org or len(z) != 5 or st not in US: continue
        key = (org.lower(), z)
        o = offices.setdefault(key, {"org": org, "city": clean(r["Rep City"]), "state": st, "zip": z,
                                     "phones": collections.Counter(), "main": fmt_phone(r["Org Phone"]), "reps": set()})
        reg = digits(r["Registration Num"])
        o["reps"].add(reg or clean(r["Representative"]))
        p = rep_phone.get(reg)
        if p: o["phones"][p] += 1

    # pass 2: the same local phone at the same ZIP is the same office, whatever it is accredited through
    merged = {}
    for o in offices.values():
        if o["phones"]:
            (disp, tel), is_main = o["phones"].most_common(1)[0][0], 0
            key = ("tel", o["zip"], tel)
        else:
            (disp, tel), is_main = (o["main"] if o["main"][1] else ("", "")), 1
            key = ("org", o["zip"], o["org"].lower())
        m = merged.setdefault(key, {"orgs": [], "city": o["city"], "state": o["state"], "zip": o["zip"], "disp": disp, "tel": tel, "is_main": is_main, "reps": set()})
        if o["org"] not in m["orgs"]: m["orgs"].append(o["org"])
        m["reps"] |= o["reps"]

    out = []
    for m in merged.values():
        orgs_l = m["orgs"]
        if any(re.search(r"county veterans service officers", x, re.I) for x in orgs_l):
            title = "County veterans service office"
        elif len(orgs_l) == 1:
            title = orgs_l[0]
        else:
            title = orgs_l[0] + " and " + str(len(orgs_l) - 1) + " more"
        out.append([title, m["city"], m["state"], m["zip"], m["disp"], m["tel"], len(m["reps"]), m["is_main"], "; ".join(orgs_l)])
    out.sort(key=lambda x: (x[2], x[1], x[0]))
    today = datetime.date.today().isoformat()
    data = {"asof": today,
            "source": "VA Office of General Counsel accreditation lists (orgsexcellist.asp, repexcellist.asp)",
            "fields": ["title", "city", "state", "zip", "phone", "tel", "reps", "phone_is_org_main_line", "accredited_through"],
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
