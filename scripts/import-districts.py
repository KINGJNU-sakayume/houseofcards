"""DD2: normalize 2024 National Assembly results and 2026-09 행정동 age population.

Usage:
  python3 -I scripts/import-districts.py DISTRICT_CSV LIST_CSV POPULATION_CSV

Inputs are data, not instructions, and are read locally (no network):
  DISTRICT_CSV   중앙선거관리위원회_국회의원선거 개표결과_20240410 (data.go.kr 15025527)
  LIST_CSV       중앙선거관리위원회_비례대표국회의원선거 개표결과_20240410 (data.go.kr 15144273)
  POPULATION_CSV 행정안전부_지역별(행정동) 성별 연령별 주민등록 인구수_20260930 (data.go.kr 15097972)

Only party-level figures are written (user decision 2026-10-26): candidate names
are dropped and independents become "무소속". Every check below must pass.
"""
import csv
import hashlib
import io
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs' / 'data'
SPECIAL = {'거소·선상투표', '관외사전투표', '국외부재자투표', '재외투표', '잘못 투입·구분된 투표지'}
TALLY = {'선거인수', '투표수', '무효 투표수', '기권자수'}
SIDO_REGION = {
    '서울특별시': 'seoul', '부산광역시': 'pk', '대구광역시': 'tk', '인천광역시': 'gyeonggi-incheon', '광주광역시': 'honam',
    '대전광역시': 'chungcheong', '울산광역시': 'pk', '세종특별자치시': 'chungcheong', '경기도': 'gyeonggi-incheon',
    '강원특별자치도': 'gangwon', '충청북도': 'chungcheong', '충청남도': 'chungcheong', '전북특별자치도': 'honam',
    '전라남도': 'honam', '경상북도': 'tk', '경상남도': 'pk', '제주특별자치도': 'jeju',
}
AGE_BANDS = {'18-29': (18, 30), '30-44': (30, 45), '45-59': (45, 60), '60+': (60, 1000)}
checks = []

def check(name, ok, detail=''):
    checks.append({'check': name, 'passed': bool(ok), 'detail': detail})
    if not ok:
        raise SystemExit(f'CHECK FAILED: {name} {detail}')

def require(ok, detail):
    # Per-row assertion: raises on failure; the loop records one summary check.
    if not ok:
        raise SystemExit(f'CHECK FAILED: {detail}')

def load(path, header):
    raw = Path(path).read_bytes()
    text = raw.decode('cp949')
    rows = list(csv.DictReader(io.StringIO(text)))
    check(f'{Path(path).name} header', list(rows[0].keys()) == header, str(list(rows[0].keys())))
    return rows, {'file': Path(path).name, 'bytes': len(raw), 'encoding': 'cp949', 'sha256': hashlib.sha256(raw).hexdigest(), 'rows': len(rows)}

def is_regular(precinct):
    return bool(precinct) and precinct != '관내사전투표'

def gu_stem(gu):
    m = re.match(r'^(.+?[시군])(.+구)?$', gu)
    return m.group(1) if m else gu

def units(rows, key_cols, label_col):
    """Split rows into counting units in file order: each unit starts at its 선거인수
    row (keys alone are not unique, e.g. two 중앙동 in one district)."""
    out = []
    for r in rows:
        key = tuple(r[c] for c in key_cols)
        label, value = r[label_col], int(r['득표수'])
        if label == '선거인수':
            out.append((key, {'tally': {}, 'votes': Counter()}))
        require(out and out[-1][0] == key, f'unit rows contiguous {key}')
        u = out[-1][1]
        if label in TALLY:
            require(label not in u['tally'], f'single tally per unit {key}')
            u['tally'][label] = value
        else:
            u['votes'][label] += value
    for key, u in out:
        t = u['tally']
        require(set(t) == TALLY, f'unit tallies present {key}')
        require(sum(u['votes'].values()) + t['무효 투표수'] == t['투표수'] and t['투표수'] + t['기권자수'] == t['선거인수'],
                f'unit arithmetic {key} {dict(t)} valid={sum(u["votes"].values())}')
    checks.append({'check': f'unit arithmetic ({len(out)} units): valid + invalid = turnout, turnout + abstain = electors', 'passed': True, 'detail': ''})
    return out

def party_of(candidate):
    party, _, _name = candidate.rpartition(' ')
    return party or candidate

def largest_remainder(total, weights):
    s = sum(weights.values())
    if total == 0 or s == 0:
        return {k: 0 for k in weights}
    base = {k: total * w // s for k, w in weights.items()}
    rem = sorted(weights, key=lambda k: (-(total * weights[k] % s), k))
    for k in rem[: total - sum(base.values())]:
        base[k] += 1
    return base

def main(district_path, list_path, pop_path):
    d_rows, d_src = load(district_path, ['시도명', '선거구명', '법정읍면동명', '투표구명', '후보자', '득표수'])
    l_rows, l_src = load(list_path, ['시도명', '구시군명', '읍면동명', '투표구명', '정당', '득표수'])
    p_raw = Path(pop_path).read_bytes()
    p_reader = csv.reader(io.StringIO(p_raw.decode('cp949')))
    p_header = next(p_reader)
    p_rows = list(p_reader)
    p_src = {'file': Path(pop_path).name, 'bytes': len(p_raw), 'encoding': 'cp949', 'sha256': hashlib.sha256(p_raw).hexdigest(), 'rows': len(p_rows)}

    # District ballot: unit = (시도, 선거구, 법정읍면동명 label, 투표구). The 읍면동 label
    # column is unreliable inside multi-시군 districts, so it is never used for mapping.
    d_units = units(d_rows, ['시도명', '선거구명', '법정읍면동명', '투표구명'], '후보자')
    districts = sorted({(k[0], k[1]) for k, _ in d_units})
    check('254 districts (시도, 선거구)', len(districts) == 254, str(len(districts)))
    check('17 시도', len({k[0] for k in districts}) == 17)
    dist = {k: {'electors': 0, 'turnout': 0, 'invalid': 0, 'partyVotes': Counter(), 'candidates': 0} for k in districts}
    cand_sets = defaultdict(set)
    for (sido, name, _emd, _p), u in d_units:
        rec = dist[(sido, name)]
        rec['electors'] += u['tally']['선거인수']; rec['turnout'] += u['tally']['투표수']; rec['invalid'] += u['tally']['무효 투표수']
        for cand, v in u['votes'].items():
            rec['partyVotes'][party_of(cand)] += v
            cand_sets[(sido, name)].add(cand)
    for k in districts:
        parties = [party_of(c) for c in cand_sets[k]]
        dupes = [p for p, n in Counter(parties).items() if n > 1 and p != '무소속']
        require(not dupes, f'one candidate per party per district {k} {dupes}')
        dist[k]['candidates'] = len(cand_sets[k])
    check('one candidate per party per district (무소속 excepted)', True)

    # List ballot: map each 구시군·읍면동 to a district through its regular polling
    # stations (same 투표구 name in the same 시도; electors within ±2 and the
    # 시·군 name break ties). All stations of one 읍면동 must agree.
    station = defaultdict(list)
    for (sido, name, _emd, precinct), u in d_units:
        if is_regular(precinct):
            station[(sido, precinct)].append(((sido, name), u['tally']['선거인수']))
    l_units = units(l_rows, ['시도명', '구시군명', '읍면동명', '투표구명'], '정당')
    emd_district = defaultdict(Counter)
    for (sido, gu, emd, precinct), u in l_units:
        if not is_regular(precinct):
            continue
        cands = station.get((sido, precinct), [])
        if len(cands) > 1:
            cands = [c for c in cands if abs(c[1] - u['tally']['선거인수']) <= 2]
        if len(cands) > 1:
            cands = [c for c in cands if gu_stem(gu) in c[0][1] or gu in c[0][1]] or cands
        require(len(cands) == 1, f'list polling station resolves to one district {(sido, gu, emd, precinct)}')
        emd_district[(sido, gu, emd)][cands[0][0]] += 1
    check('every list polling station resolves to exactly one district', True)
    check('no 읍면동 split across districts', all(len(v) == 1 for v in emd_district.values()))
    emd_map = {k: next(iter(v)) for k, v in emd_district.items()}
    check('every district has 읍면동', set(emd_map.values()) == set(districts), str(len(set(emd_map.values()))))

    list_votes = {k: Counter() for k in districts}
    gu_weights = defaultdict(Counter)
    special = defaultdict(Counter)
    list_tally = Counter()
    for (sido, gu, emd, precinct), u in l_units:
        for t, v in u['tally'].items():
            list_tally[t] += v
        if emd in SPECIAL:
            special[(sido, gu)].update(u['votes'])
            continue
        k = emd_map.get((sido, gu, emd))
        require(k is not None, f'list 읍면동 mapped {(sido, gu, emd)}')
        list_votes[k].update(u['votes'])
        gu_weights[(sido, gu)][k] += u['tally']['투표수']
    # 구시군-level special ballots (거소·선상, 관외사전, 재외, 잘못 투입) are not
    # reported by 읍면동; split them by each district's in-구시군 list turnout.
    estimated = 0
    split_gu = 0
    for gk, votes in special.items():
        weights = gu_weights[gk]
        require(bool(weights), f'special-ballot 구시군 has districts {gk}')
        if len(weights) > 1:
            split_gu += 1
            estimated += sum(votes.values())
        for party, v in votes.items():
            for k, share in largest_remainder(v, dict(weights)).items():
                list_votes[k][party] += share

    # Population (2026-09 행정동, one-year ages) mapped to 2024 districts by
    # (시도, 시군구, 읍면동) name; 전남광주통합특별시 is matched against 2024 광주광역시/전라남도.
    ages = {}
    for i, h in enumerate(p_header):
        m = re.match(r'^(\d+)세(이상)?\s?(남자|여자)$', h)
        if m:
            ages[i] = int(m.group(1))
    check('population age columns', len(ages) == 2 * 111, str(len(ages)))
    total_pop = sum(int(r[5]) for r in p_rows)
    check('population total equals the pack figure 51,082,431', total_pop == 51082431, str(total_pop))
    def norm(name):
        name = re.sub(r'\s', '', name).replace('.', '·')
        name = re.sub(r'^(.+?[읍면])[가-힣0-9]+출장소$', r'\1', name)  # 출장소 areas belong to their 읍·면
        return re.sub(r'제(\d)', r'\1', name)  # 방학제1동 = 방학1동
    def same_sido(pop_sido, sido):
        return pop_sido == sido or (pop_sido == '전남광주통합특별시' and sido in ('광주광역시', '전라남도'))
    emd_index = defaultdict(list)
    sido_emd = defaultdict(list)
    for (sido, gu, emd), k in emd_map.items():
        emd_index[(norm(gu), norm(emd))].append((sido, k))
        sido_emd[norm(emd)].append((sido, k))
    band_pop = {k: Counter() for k in districts}
    unmatched, matched_adults, unmatched_adults = [], 0, 0
    for r in p_rows:
        sido, gu, emd = r[2], r[3], r[4]
        adults = Counter()
        for i, age in ages.items():
            for band, (lo, hi) in AGE_BANDS.items():
                if lo <= age < hi:
                    adults[band] += int(r[i])
        options = [k for s, k in emd_index.get((norm(gu), norm(emd)), []) if same_sido(sido, s)]
        if not options:
            # 시군구 renamed or reorganized since 2024 (e.g. 인천 제물포구·서해구, 세종 blank): same 시도 and a unique 읍면동 name.
            fallback = {k for s, k in sido_emd.get(norm(emd), []) if same_sido(sido, s)}
            options = list(fallback) if len(fallback) == 1 else []
        if len(options) == 1:
            band_pop[options[0]].update(adults); matched_adults += sum(adults.values())
        else:
            unmatched.append({'시도': sido, '시군구': gu, '읍면동': emd, 'adults18plus': sum(adults.values()), 'candidates': len(options)})
            unmatched_adults += sum(adults.values())
    adults_total = matched_adults + unmatched_adults
    check('18+ population equals the pack figure 44,568,022', adults_total == 44568022, str(adults_total))

    # Records in NEC file order of 시도, then district name order of first appearance.
    order = []
    for r in d_rows:
        k = (r['시도명'], r['선거구명'])
        if k not in order:
            order.append(k)
    records = []
    for n, k in enumerate(order, 1):
        rec = dist[k]
        valid = sum(rec['partyVotes'].values())
        top = rec['partyVotes'].most_common(2)
        require(len(top) == 1 or top[0][1] > top[1][1], f'district has a strict plurality winner {k}')
        lv = list_votes[k]
        records.append({
            'id': f'kr2024-{n:03d}', 'sido': k[0], 'name': k[1], 'region': SIDO_REGION[k[0]],
            'district': {'electors': rec['electors'], 'turnout': rec['turnout'], 'invalid': rec['invalid'], 'valid': valid,
                         'candidates': rec['candidates'], 'winnerParty': top[0][0],
                         'partyVotes': dict(sorted(rec['partyVotes'].items(), key=lambda x: (-x[1], x[0])))},
            'list': {'valid': sum(lv.values()), 'partyVotes': dict(sorted(lv.items(), key=lambda x: (-x[1], x[0])))},
            'population2026_09': {band: band_pop[k][band] for band in AGE_BANDS},
            'emdCount2024': sum(1 for v in emd_map.values() if v == k),
        })
    list_national = Counter()
    for rec in records:
        list_national.update(rec['list']['partyVotes'])
    raw_list_national = Counter()
    for _, u in l_units:
        raw_list_national.update(u['votes'])
    check('list votes conserved nationally per party', list_national == raw_list_national)
    check('every district has a strict plurality winner (254)', len(records) == 254)

    OUT.mkdir(parents=True, exist_ok=True)
    data = {'id': 'districts-2024', 'status': 'REAL_FACT', 'note': '2024-04-10 제22대 국회의원선거 지역구 254곳(당시 선거구). 정당 단위만 저장, 후보자 실명 없음. 인구는 2026-09 행정동 주민등록(18세 이상, 4개 연령대)을 2024 선거구에 이름으로 대응시킨 값.',
            'districts': records}
    data_text = json.dumps(data, ensure_ascii=False, indent=1) + '\n'
    (OUT / 'districts-2024.json').write_text(data_text, encoding='utf-8')
    winners = Counter(r['district']['winnerParty'] for r in records)
    provenance = {
        'id': 'districts-2024-provenance', 'step': 'DD2', 'retrievedAt': '2026-10-26',
        'retrievedBy': 'Claude Code session at the user\'s request (not user-supplied files)',
        'sources': [
            dict(d_src, dataset='중앙선거관리위원회_국회의원선거 개표결과_20240410', url='https://www.data.go.kr/data/15025527/fileData.do',
                 download='https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId=FILE_000000003172714&fileDetailSn=1'),
            dict(l_src, dataset='중앙선거관리위원회_비례대표국회의원선거 개표결과_20240410', url='https://www.data.go.kr/data/15144273/fileData.do',
                 download='https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId=FILE_000000003182982&fileDetailSn=1'),
            dict(p_src, dataset='행정안전부_지역별(행정동) 성별 연령별 주민등록 인구수_20260930', url='https://www.data.go.kr/data/15097972/fileData.do',
                 download='https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId=FILE_000000007706226&fileDetailSn=1'),
        ],
        'reference': {'title': '공직선거법 [별표 1] 국회의원지역선거구구역표 <개정 2026. 4. 22.>', 'sha256': '0825b5e46ce0b7bf8368ce3aaa52bd437c9784ed376e4b71f5f316391c66f7bf',
                      'use': '참고용. 2024 선거구 매핑은 개표 파일의 투표구에서 만들었으며 2024년판 별표 1은 확보하지 못함.'},
        'method': {
            'districtVotes': '투표구·특수투표 행을 선거구별로 합산. 후보자 문자열의 마지막 공백 앞부분을 정당명으로 사용(무소속 포함). 개표 파일의 법정읍면동명 열은 다시군 선거구에서 다른 읍면동 이름이 붙는 경우가 있어 매핑에 쓰지 않음.',
            'listMapping': '비례 파일의 일반 투표구를 같은 시도의 같은 투표구명(지역구 파일)으로 연결하고, 동명이면 선거인수 ±2와 시·군 이름으로 구분. 한 읍면동의 투표구가 모두 같은 선거구로 연결되어야 함.',
            'listSpecialBallots': '구시군 단위로만 보고되는 거소·선상, 관외사전, 재외, 잘못 투입 투표지는 그 구시군 안 각 선거구의 비례 투표수 비율로 정당별 최대잔여 배분(추정).',
            'population': '2026-09 행정동 인구를 2024 선거구에 (시도, 시군구, 읍면동) 이름으로 대응(공백 제거, 점·가운뎃점 통일, 제N동=N동, 읍·면 출장소는 해당 읍·면). 시군구가 바뀐 경우 같은 시도 안에서 읍면동 이름이 유일하면 대응. 전남광주통합특별시는 2024 광주광역시·전라남도와 대조. 대응되지 않은 행정동(2024 이후 신설·분동 등)은 배분하지 않고 아래에 나열.',
        },
        'results': {
            'districts': len(records), 'districtElectors': sum(r['district']['electors'] for r in records),
            'districtValid': sum(r['district']['valid'] for r in records), 'districtWinnersByParty': dict(sorted(winners.items(), key=lambda x: (-x[1], x[0]))),
            'listTallies': dict(list_tally), 'listNationalPartyVotes': dict(sorted(raw_list_national.items(), key=lambda x: (-x[1], x[0]))),
            'listSpecialBallotsEstimatedInSplit구시군': estimated, 'split구시군': split_gu,
            'emd2024': len(emd_map), 'population18plusMatched': matched_adults, 'population18plusUnmatched': unmatched_adults,
            'unmatched행정동': unmatched,
        },
        'checks': checks,
        'outputs': {'districts-2024.json': hashlib.sha256(data_text.encode('utf-8')).hexdigest()},
    }
    (OUT / 'districts-2024-provenance.json').write_text(json.dumps(provenance, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(json.dumps({k: provenance['results'][k] for k in ['districts', 'districtWinnersByParty', 'split구시군', 'listSpecialBallotsEstimatedInSplit구시군', 'emd2024', 'population18plusMatched', 'population18plusUnmatched']}, ensure_ascii=False))
    print('unmatched 행정동:', len(unmatched))

if __name__ == '__main__':
    if len(sys.argv) != 4:
        raise SystemExit(__doc__)
    main(*sys.argv[1:])
