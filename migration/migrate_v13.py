"""MORO v13 (Excel) -> MORO PWA (Google Sheets) migration.

Reads the v13 workbook read-only, normalises names/units, assigns stable IDs and
writes one CSV per target sheet into migration/out/, plus a reconciliation
report that compares every item's balance with v13's PivotSheet.

Usage:  python migrate_v13.py "<path to DataEnteyFace v13 ...xlsm>"
The script never writes to the source workbook. It can be re-run at cutover.
"""
import csv
import datetime as dt
import os
import sys
from collections import Counter, OrderedDict, defaultdict

import openpyxl

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')

# v13 store columns (1-based in Excel, 0-based here)
C_DATE, C_PARTY, C_ITEM, C_QTY, C_UNIT, C_PRICE, C_PER, C_AMOUNT, C_DISC, C_FINAL, \
    C_DOC, C_CAT, C_LOC, C_EXP, C_IMG, C_PURPOSE = range(1, 17)

OPENING_PARTY = 'رصيد'          # carry-forward rows written by the v13 archive
PRODUCTION_PARTIES = {'PRODUCTION', 'FINAL PRODUCTION'}


def clean(v):
    """Trim and collapse inner whitespace runs (keeps the text otherwise as typed)."""
    if v is None:
        return ''
    return ' '.join(str(v).split())


def key(v):
    return clean(v).upper()


def num(v):
    if v is None or v == '':
        return ''
    try:
        f = float(v)
        return int(f) if f == int(f) else round(f, 6)
    except (TypeError, ValueError):
        return ''


def iso(d):
    return d.strftime('%Y-%m-%d') if isinstance(d, (dt.datetime, dt.date)) else ''


def write_csv(name, header, rows):
    path = os.path.join(OUT, name + '.csv')
    with open(path, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)
    return len(rows)


def main(src):
    os.makedirs(OUT, exist_ok=True)
    wb = openpyxl.load_workbook(src, read_only=True, data_only=True)
    issues = []                                   # notes for the reconciliation report

    # ------------------------------------------------------------------ items
    units = {}                                    # key(name) -> unit, from ItemPack
    for r in wb['ItemPack'].iter_rows(min_row=2, values_only=True):
        if r[0] and r[1]:
            units[key(r[0])] = clean(r[1]).upper()
        if len(r) > 3 and r[2] and r[3]:
            units[key(r[2])] = clean(r[3]).upper()

    items = OrderedDict()                         # key -> dict
    for sheet, cat in (('F.ItemSRC', 'Food'), ('P.ItemSRC', 'Packaging')):
        for r in wb[sheet].iter_rows(min_row=2, max_col=2, values_only=True):
            if not r[0]:
                continue
            k = key(r[0])
            if k in items:
                issues.append(f'Item listed twice: "{clean(r[0])}" ({items[k]["category"]} and {cat}); kept {items[k]["category"]}.')
                continue
            items[k] = dict(name=clean(r[0]), category=cat, unit=units.get(k, ''),
                            min_stock=num(r[1]) or 0, aliases=set([str(r[0])]), source='list')

    # ------------------------------------------------------------------ movements (current store)
    store_rows = [r for r in wb['store'].iter_rows(min_row=2, values_only=True)
                  if r[C_ITEM] is not None and r[C_QTY] is not None]
    for r in store_rows:
        k = key(r[C_ITEM])
        if k not in items:
            cat = clean(r[C_CAT]) or 'Packaging'
            items[k] = dict(name=clean(r[C_ITEM]), category=cat, unit=clean(r[C_UNIT]).upper(),
                            min_stock=0, aliases=set(), source='store')
            issues.append(f'Item used in store but missing from the item lists: "{clean(r[C_ITEM])}" -> added as {cat}.')
        items[k]['aliases'].add(str(r[C_ITEM]))
        if not items[k]['unit'] and r[C_UNIT]:
            items[k]['unit'] = clean(r[C_UNIT]).upper()

    arch_ws = wb['store_archive']
    arch_rows = [r for r in arch_ws.iter_rows(min_row=4, values_only=True) if r[C_ITEM] is not None and r[C_QTY] is not None]
    for r in arch_rows:                       # archived items may be gone from the lists
        k = key(r[C_ITEM])
        if k not in items:
            cat = 'Food' if 'FOOD' in key(r[C_CAT]) else 'Packaging'
            items[k] = dict(name=clean(r[C_ITEM]), category=cat, unit=clean(r[C_UNIT]).upper(),
                            min_stock=0, aliases=set(), source='archive', inactive=True)
        items[k]['aliases'].add(str(r[C_ITEM]))

    # stable IDs: Food first, then Packaging, alphabetical
    ordered = sorted(items.values(), key=lambda it: (it['category'] != 'Food', it['name'].upper()))
    for i, it in enumerate(ordered, 1):
        it['id'] = f'I{i:04d}'

    # ------------------------------------------------------------------ parties
    src_sheet = wb['source']
    sections = set(key(r[1]) for r in src_sheet.iter_rows(min_row=2, values_only=True) if r[1])
    parties = OrderedDict()

    def party(name):
        k = key(name)
        if not k:
            k = 'UNKNOWN'
        if k not in parties:
            if k == key(OPENING_PARTY):
                kind = 'opening'
            elif k in PRODUCTION_PARTIES:
                kind = 'production'
            elif k in sections or k.startswith('SECTION') or k.startswith('SHOPS'):
                kind = 'section'
            else:
                kind = 'supplier'
            parties[k] = dict(name=clean(name) or 'Unknown', kind=kind)
        return parties[k]

    for r in src_sheet.iter_rows(min_row=2, values_only=True):
        if r[0]:
            party(r[0])
    for r in store_rows:
        party(r[C_PARTY])
    for r in arch_rows:
        party(r[C_PARTY])
    kind_order = {'section': 0, 'supplier': 1, 'production': 2, 'opening': 3}
    for i, p in enumerate(sorted(parties.values(), key=lambda p: (kind_order[p['kind']], p['name'].upper())), 1):
        p['id'] = f'P{i:03d}'

    # ------------------------------------------------------------------ locations / purposes
    locations = []
    for col, cat in ((5, 'Food'), (4, 'Packaging')):
        for r in src_sheet.iter_rows(min_row=2, values_only=True):
            if r[col]:
                locations.append((clean(r[col]), cat))
    purposes = [clean(r[8]) for r in src_sheet.iter_rows(min_row=2, values_only=True) if r[8]]

    # ------------------------------------------------------------------ movement rows
    def kind_of(r):
        loc = clean(r[C_LOC])
        pk = key(r[C_PARTY])
        q = float(r[C_QTY])
        if pk == key(OPENING_PARTY):
            return 'OPENING'
        if loc == 'Production Output':
            return 'PROD_CONSUME'
        if loc == 'Our Production':
            return 'PROD_OUTPUT'
        if loc == 'Out':
            return 'ISSUE' if q < 0 else 'DEPT_RETURN'
        return 'RECEIPT' if q >= 0 else 'SUPPLIER_RETURN'

    def expiry(v, legacy, note_list):
        if isinstance(v, (dt.datetime, dt.date)):
            return iso(v)
        s = clean(v)
        if s and s != '/':
            note_list.append(f'Unreadable expiry "{s}" kept as text on movement {legacy}.')
        return ''

    def movement_rows(rows, prefix, start_index, note_list, archived):
        out = []
        for n, r in enumerate(rows, start_index):
            it = items[key(r[C_ITEM])]
            p = party(r[C_PARTY])
            legacy = f'{"archive" if archived else "store"} row {n}'
            exp_raw = clean(r[C_EXP]) if not isinstance(r[C_EXP], (dt.datetime, dt.date)) else ''
            loc = clean(r[C_LOC])
            if loc in ('Out', 'Production Output', 'Our Production'):
                loc = ''
            out.append([
                '',                                   # movement_id, filled after sorting
                iso(r[C_DATE]),
                kind_of(r),
                p['id'],
                it['id'],
                num(r[C_QTY]),
                clean(r[C_UNIT]).upper() or it['unit'],
                num(r[C_PRICE]), clean(r[C_PER]).upper(), num(r[C_AMOUNT]), num(r[C_DISC]), num(r[C_FINAL]),
                clean(r[C_DOC]),
                it['category'],
                loc,
                expiry(r[C_EXP], legacy, note_list),
                exp_raw if exp_raw not in ('', '/') else '',
                clean(r[C_IMG]) if len(r) > C_IMG else '',
                clean(r[C_PURPOSE]) if len(r) > C_PURPOSE else '',
                'migration', '', legacy, 'active',
            ])
        return out

    exp_notes = []
    movements = movement_rows(store_rows, 'M', 1, exp_notes, False)
    # oldest first, keep v13's top-to-bottom order inside the same day (v13 lists newest at the top)
    movements = list(reversed(movements))
    movements.sort(key=lambda m: m[1])
    for i, m in enumerate(movements, 1):
        m[0] = f'M{i:06d}'

    arch_notes = []
    archive = movement_rows(arch_rows, 'A', 1, arch_notes, True)
    archive.sort(key=lambda m: m[1])
    for i, m in enumerate(archive, 1):
        m[0] = f'A{i:06d}'

    # ------------------------------------------------------------------ balances
    bal = defaultdict(float)
    last_exp = {}
    for m in movements:
        bal[m[4]] += float(m[5] or 0)
        if m[2] == 'RECEIPT' and m[15]:
            last_exp[m[4]] = m[15]          # rows are in date order, so the last receipt wins
    by_id = {it['id']: it for it in items.values()}

    # ------------------------------------------------------------------ recipes
    fsrc = wb['F.ItemSRC']
    hdr = next(fsrc.iter_rows(min_row=1, max_row=1, values_only=True))
    recipes = []
    for r in fsrc.iter_rows(min_row=2, max_row=600, values_only=True):
        if not r[0]:
            continue
        for c in range(2, len(hdr)):
            if hdr[c] and isinstance(r[c], (int, float)) and r[c] > 0:
                recipes.append([clean(hdr[c]), items[key(r[0])]['id'], num(r[c])])

    # ------------------------------------------------------------------ lists, contacts, reminders, settings
    lists = []
    for sheet, lst in (('FastMovingList', 'FAST'), ('SensitiveList', 'SENSITIVE')):
        if sheet in wb.sheetnames:
            for r in wb[sheet].iter_rows(min_row=2, values_only=True):
                if r[0]:
                    k = key(r[0])
                    if k in items:
                        lists.append([lst, items[k]['id']])
                    else:
                        issues.append(f'{lst} list item not found: "{clean(r[0])}"')
    contacts = [[clean(r[0]), clean(r[1]).replace('.0', '')] for r in wb['Contacts'].iter_rows(min_row=2, values_only=True) if r[0]]
    reminders = [[iso(r[0]), clean(r[1])] for r in wb['ReminderSheet'].iter_rows(min_row=2, values_only=True) if r[1]]
    lang = 'en'
    for r in wb['AppSettings'].iter_rows(values_only=True):
        if r[0] == 'Language' and r[1]:
            lang = clean(r[1])

    # ------------------------------------------------------------------ write CSVs
    counts = OrderedDict()
    counts['Items'] = write_csv('Items', ['item_id', 'name', 'category', 'unit', 'min_stock', 'image', 'active', 'aliases', 'created_at'], [
        [it['id'], it['name'], it['category'], it['unit'], it['min_stock'], '', 'FALSE' if it.get('inactive') else 'TRUE',
         ' | '.join(sorted(a for a in it['aliases'] if a != it['name'])), 'migration']
        for it in sorted(items.values(), key=lambda x: x['id'])])
    counts['Parties'] = write_csv('Parties', ['party_id', 'name', 'kind', 'active'],
                                  [[p['id'], p['name'], p['kind'], 'TRUE'] for p in sorted(parties.values(), key=lambda x: x['id'])])
    counts['Locations'] = write_csv('Locations', ['location_id', 'name', 'category', 'active'],
                                    [[f'L{i:02d}', n, c, 'TRUE'] for i, (n, c) in enumerate(locations, 1)])
    counts['Purposes'] = write_csv('Purposes', ['purpose_id', 'name', 'active'],
                                   [[f'U{i:02d}', n, 'TRUE'] for i, n in enumerate(purposes, 1)])
    mv_header = ['movement_id', 'date', 'kind', 'party_id', 'item_id', 'qty', 'unit', 'price', 'per', 'amount', 'discount',
                 'final_amount', 'doc_no', 'category', 'location', 'expiry', 'expiry_text', 'image', 'purpose',
                 'created_by', 'created_at', 'legacy_ref', 'status']
    counts['Movements'] = write_csv('Movements', mv_header, movements)
    counts['Archive'] = write_csv('Archive', mv_header, archive)
    counts['Balances'] = write_csv('Balances', ['item_id', 'qty', 'unit', 'last_expiry', 'updated_at'], [
        [iid, num(round(q, 6)), by_id[iid]['unit'], last_exp.get(iid, ''), 'migration'] for iid, q in sorted(bal.items())])
    counts['Recipes'] = write_csv('Recipes', ['product', 'item_id', 'qty_per_unit'], recipes)
    counts['Lists'] = write_csv('Lists', ['list', 'item_id'], lists)
    counts['Contacts'] = write_csv('Contacts', ['name', 'phone'], contacts)
    counts['Reminders'] = write_csv('Reminders', ['date', 'message'], reminders)
    counts['Settings'] = write_csv('Settings', ['key', 'value'], [
        ['company_name', 'ALAKER SWEETS'], ['default_language', lang], ['near_expiry_days', 90],
        ['migrated_from', os.path.basename(src)], ['migrated_at', dt.datetime.now().strftime('%Y-%m-%d %H:%M')]])

    # ------------------------------------------------------------------ reconciliation with v13 PivotSheet
    pivot = defaultdict(float)
    for r in wb['PivotSheet'].iter_rows(min_row=4, values_only=True):
        if r[0] and str(r[0]).strip().lower() not in ('grand total', '(blank)'):
            pivot[key(r[0])] += float(r[2] or 0)
    mism = []
    for k, it in items.items():
        a = round(bal.get(it['id'], 0), 6)
        b = round(pivot.get(k, 0), 6)
        if abs(a - b) > 1e-6:
            mism.append((it['id'], it['name'], a, b))
    for k in pivot:
        if k not in items:
            mism.append(('-', k, 0, pivot[k]))

    rep = [f'# Migration reconciliation — {os.path.basename(src)}', '',
           f'Run at {dt.datetime.now():%Y-%m-%d %H:%M}', '', '## Row counts', '',
           '| Sheet | Rows |', '|---|---|']
    rep += [f'| {k} | {v} |' for k, v in counts.items()]
    rep += ['', f'Source: {len(store_rows)} store rows, {len(arch_rows)} archive rows.', '',
            '## Movement kinds', '', '| Kind | Rows |', '|---|---|']
    rep += [f'| {k} | {v} |' for k, v in Counter(m[2] for m in movements).most_common()]
    rep += ['', '## Balance check against v13 PivotSheet', '',
            f'Items compared: {len(items)}. Mismatches: **{len(mism)}**.', '']
    if mism:
        rep += ['| Item | Name | Migrated | v13 pivot |', '|---|---|---|---|']
        rep += [f'| {a} | {b} | {c} | {d} |' for a, b, c, d in mism]
    rep += ['', '## Notes', '']
    rep += [f'- {x}' for x in issues] or ['- none']
    rep += ['', f'## Expiry values that are not dates ({len(exp_notes)} in store, {len(arch_notes)} in archive)', '']
    rep += [f'- {x}' for x in exp_notes]
    with open(os.path.join(OUT, 'RECONCILIATION.md'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(rep) + '\n')
    print('\n'.join(f'{k}: {v}' for k, v in counts.items()))
    print(f'mismatches: {len(mism)}  notes: {len(issues)}  bad expiry: {len(exp_notes)}')


if __name__ == '__main__':
    main(sys.argv[1])
