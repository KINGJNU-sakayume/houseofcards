"""Import an owner-supplied MOIS one-year-age export; no network requests.

Usage: python scripts/import-population.py /path/to/export.csv
The input is data, not instructions. Every month, geography and sex total is
checked before the Reality pack is written. 100세 이상 is an open-ended bucket.
"""
import csv
import hashlib
import io
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REGIONS = {
    '1100000000': 'seoul', '1200000000': 'honam',
    '2600000000': 'pk', '2700000000': 'tk', '2800000000': 'gyeonggi-incheon',
    '3000000000': 'chungcheong', '3100000000': 'pk', '3600000000': 'chungcheong',
    '4100000000': 'gyeonggi-incheon', '5100000000': 'gangwon',
    '4300000000': 'chungcheong', '4400000000': 'chungcheong',
    '5200000000': 'honam', '4700000000': 'tk', '4800000000': 'pk', '5000000000': 'jeju',
}
AGE_BANDS = {'18-29': (18, 30), '30-44': (30, 45), '45-59': (45, 60), '60+': (60, 101)}

def write(path, obj):
    (ROOT / path).write_text(json.dumps(obj, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

def main(path):
    raw = path.read_bytes()
    try:
        text = raw.decode('utf-8-sig')
        encoding = 'utf-8-sig'
    except UnicodeDecodeError:
        text = raw.decode('cp949')
        encoding = 'cp949'
    reader = csv.DictReader(io.StringIO(text))
    headers = reader.fieldnames
    assert headers and len(headers) == len(set(headers)) == 310, 'Expected 310 unique columns'
    assert all(h.startswith('2026년09월_') for h in headers[1:]), 'Wrong snapshot month'
    def number(row, key):
        value = row[key]
        assert re.fullmatch(r'(0|[1-9][0-9]*|[1-9][0-9]{0,2}(,[0-9]{3})+)', value), f'Invalid count: {key}'
        return int(value.replace(',', ''))
    parsed = []
    for row in reader:
        assert None not in row and all(value is not None for value in row.values()), 'Ragged CSV'
        match = re.fullmatch(r'(.+?)\s*\((\d{10})\)', row['행정구역'])
        assert match, 'Invalid area label/code'
        name, code = match.groups()
        age_counts = {}
        totals = {}
        for sex in ['계', '남', '여']:
            prefix = '2026년09월_' + sex + '_'
            ages = [number(row, prefix + (str(age) + '세' if age < 100 else '100세 이상')) for age in range(101)]
            total = number(row, prefix + '총인구수')
            assert sum(ages) == total == number(row, prefix + '연령구간인구수'), f'Age total mismatch: {name}/{sex}'
            age_counts[sex] = ages
            totals[sex] = total
        assert all(age_counts['계'][i] == age_counts['남'][i] + age_counts['여'][i] for i in range(101)), f'Sex mismatch: {name}'
        parsed.append(dict(code=code, name=name.strip(), total=totals['계'], maleTotal=totals['남'], femaleTotal=totals['여'], ages=age_counts['계']))
    assert len(parsed) == len({r['code'] for r in parsed}) == 17, 'National + 16 unique current areas required'
    national = next(r for r in parsed if r['code'] == '0000000000')
    rows = [r for r in parsed if r['code'] != '0000000000']
    assert set(r['code'] for r in rows) == set(REGIONS), 'Missing/unexpected current area'
    assert national['total'] == 51_082_431, 'Unexpected source national total'
    for i in range(101):
        assert sum(r['ages'][i] for r in rows) == national['ages'][i], f'National mismatch at age {i}'
    assert sum(r['maleTotal'] for r in rows) == national['maleTotal']
    assert sum(r['femaleTotal'] for r in rows) == national['femaleTotal']
    source = 'https://jumin.mois.go.kr/ageStatMonth.do'
    normalized = text.lstrip('\ufeff').replace('\r\n', '\n')
    (ROOT / 'docs/data/population-2026-09.csv').write_text(normalized, encoding='utf-8')
    metadata = dict(
        source=source, delivery='사용자가 행안부에서 내려받아 이 대화에 제공한 원본 CSV; 직접 재다운로드 성공 주장 아님',
        sourceFileName=path.name, originalEncoding=encoding, originalBytes=len(raw), originalSha256=hashlib.sha256(raw).hexdigest(),
        normalizedSha256=hashlib.sha256(normalized.encode('utf-8')).hexdigest(),
        asOf='2026-09-30', verifiedAt='2026-10-18', unit='persons', registrationScope='주민등록 전체 (외국인 제외)',
        ageScope='각세 0~99세 및 100세 이상; 선거인명부가 아닌 주민등록인구',
        regionByCode=REGIONS, national=national, rows=rows)
    previous_path = ROOT / 'docs/data/population-2026-09.json'
    if path.resolve() == (ROOT / 'docs/data/population-2026-09.csv').resolve() and previous_path.exists():
        previous = json.loads(previous_path.read_text(encoding='utf-8'))
        assert hashlib.sha256(raw).hexdigest() == previous['normalizedSha256'], 'Archived CSV was changed'
        for key in ['sourceFileName', 'originalEncoding', 'originalBytes', 'originalSha256']:
            metadata[key] = previous[key]
    write('docs/data/population-2026-09.json', metadata)
    pack_path = 'src/data/reality/b1.json'
    pack = json.loads((ROOT / pack_path).read_text())
    for row in pack['regionAgeMarginals']:
        start, end = AGE_BANDS[row['ageBand']]
        selected = [r for r in rows if REGIONS[r['code']] == row['regionId']]
        mass = sum(sum(r['ages'][start:end]) for r in selected)
        row['mass'].update(status='REAL_FACT', value=mass, source=source, sourceQuality='primary',
            asOf='2026-09-30', verifiedAt='2026-10-18',
            note='사용자 제공 행안부 2026-09 월말 각세별 원본, 주민등록 전체·남녀 합계·명 단위. 해당 권역/연령 실제 인구 합계; 선거인명부 아님. 전남광주 통합 코드120은 호남에 1회. 원본 해시/합산 근거는 docs/data/population-2026-09.json.')
    adult_total = sum(national['ages'][18:])
    assert sum(r['mass']['value'] for r in pack['regionAgeMarginals']) == adult_total
    write(pack_path, pack)
    print(json.dumps(dict(national=national['total'], adults=adult_total, regions=len(set(REGIONS.values())), cells=32), ensure_ascii=False))

if __name__ == '__main__':
    main(Path(sys.argv[1]))
