"""DD3: derive 254 Light district records and the Active 30 selection.

Usage: python3 -I scripts/derive-districts.py
Reads docs/data/districts-2024.json (DD2), docs/data/party-mapping-2024.json and
src/data/seeds/b1.json (profile conditionals); writes docs/data/districts-light-2024.json.
Deterministic, stdlib only, no network. Not loaded into the Reality pack (D2).
"""
import hashlib
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'docs' / 'data'
SCALE = 1_000_000
AGE_BANDS = ['18-29', '30-44', '45-59', '60+']
PROFILE_IDS = ['housing-pressure', 'family-work', 'asset-retirement']  # order of profileConditionals masses
QUOTAS = {'seoul': 6, 'gyeonggi-incheon': 8, 'chungcheong': 4, 'pk': 4, 'tk': 2, 'honam': 2, 'gangwon': 2, 'jeju': 2}

def fail(msg):
    raise SystemExit(f'CHECK FAILED: {msg}')

def normalize(masses, total=SCALE):
    """Largest remainder to an integer total; ties by key (same rule as engine normalizeMasses)."""
    keys = sorted(masses)
    s = sum(masses[k] for k in keys)
    if s <= 0:
        fail('zero mass')
    base = {k: masses[k] * total // s for k in keys}
    order = sorted(keys, key=lambda k: (-(masses[k] * total % s), k))
    for k in order[: total - sum(base.values())]:
        base[k] += 1
    return base

def shares(votes, mapping):
    game = Counter()
    for party, v in votes.items():
        if party not in mapping:
            fail(f'party not in mapping: {party}')
        game[mapping[party]] += v
    return normalize(dict(game)), dict(game)

def main():
    dd2 = json.loads((DATA / 'districts-2024.json').read_text(encoding='utf-8'))
    mapping_doc = json.loads((DATA / 'party-mapping-2024.json').read_text(encoding='utf-8'))
    mapping = {row['party2024']: row['gameParty'] for row in mapping_doc['parties']}
    seeds = json.loads((ROOT / 'src' / 'data' / 'seeds' / 'b1.json').read_text(encoding='utf-8'))
    conditionals = {(r['regionId'], r['ageBand']): r['masses'] for r in seeds['profileConditionals']}
    districts = dd2['districts']
    if len(districts) != 254:
        fail('254 districts')
    light = []
    for d in districts:
        age = normalize(d['population2026_09'])
        cells = {}
        for band in AGE_BANDS:
            masses = conditionals[(d['region'], band)]
            within = normalize({p: masses[i] for i, p in enumerate(PROFILE_IDS)}, age[band])
            for p in PROFILE_IDS:
                cells[f'{band}/{p}'] = within[p]
        if sum(cells.values()) != SCALE:
            fail(f'composition sum {d["id"]}')
        district_share, district_votes = shares(d['district']['partyVotes'], mapping)
        list_share, _ = shares(d['list']['partyVotes'], mapping)
        ranked = sorted(district_votes.items(), key=lambda x: (-x[1], x[0]))
        margin = ranked[0][1] - (ranked[1][1] if len(ranked) > 1 else 0)
        light.append({
            'id': d['id'], 'sido': d['sido'], 'name': d['name'], 'regionId': d['region'],
            'electors2024': d['district']['electors'], 'turnout2024': d['district']['turnout'],
            'cohortComposition': cells,
            'baseline2024': {'districtShare': district_share, 'listShare': list_share,
                             'winnerGameParty': mapping[d['district']['winnerParty']], 'winnerParty2024': d['district']['winnerParty'],
                             'marginShare': margin * SCALE // d['district']['valid']},
        })
    # Active 30: per region quota, the closest 2024 contests first (smallest
    # top-two margin share, ties by id), at most one district per base name
    # (e.g. 강남구갑/을/병 share "강남구") until the quota cannot be met otherwise.
    def base(name):
        return name[:-1] if name[-1:] in '갑을병정무' else name
    active = []
    for region, quota in sorted(QUOTAS.items()):
        pool = sorted((r for r in light if r['regionId'] == region), key=lambda r: (r['baseline2024']['marginShare'], r['id']))
        if len(pool) < quota:
            fail(f'region {region} has {len(pool)} districts for quota {quota}')
        chosen, bases = [], set()
        for r in pool:
            if len(chosen) < quota and base(r['name']) not in bases:
                chosen.append(r); bases.add(base(r['name']))
        for r in pool:
            if len(chosen) < quota and r not in chosen:
                chosen.append(r)
        active += [{'id': r['id'], 'regionId': region, 'name': r['name'], 'marginShare': r['baseline2024']['marginShare']} for r in chosen]
    if len(active) != 30 or len({a['id'] for a in active}) != 30:
        fail('active 30')
    out = {
        'id': 'districts-light-2024', 'status': 'DERIVED', 'step': 'DD3',
        'label': '이 세이브의 지역구는 2024년 기준입니다. 2028년 선거구는 미확정입니다.',
        'sources': {'districts': 'docs/data/districts-2024.json', 'partyMapping': 'docs/data/party-mapping-2024.json', 'profileConditionals': 'src/data/seeds/b1.json'},
        'method': {
            'cohortComposition': '연령 4구간은 2026-09 행정동 인구를 2024 선거구에 대응한 값(미대응 1.3% 제외)의 구성비. 각 연령 안의 생활조건 프로필 3개는 지역구별 근거가 없어 권역×연령 조건부 질량(profileConditionals)을 그대로 씀. Q6, 합 1,000,000, 최대잔여.',
            'baseline2024': '2024 지역구·비례 득표를 정당 매핑표로 게임 정당(dp, ppp, reform, rkp, minor-bloc, independent)에 합산한 Q6 점유율. marginShare는 지역구 1·2위(게임 정당 기준) 차이 / 유효투표.',
            'active30': '권역 쿼터(서울6, 경기·인천8, 충청4, PK4, TK2, 호남2, 강원2, 제주2) 안에서 2024 접전도(marginShare 오름차순, 동률은 id) 순으로 고르되, 같은 기본 이름(갑·을·병 제외)의 선거구는 쿼터를 채울 수 없을 때만 두 번째로 고름.',
            'names': '후보·현역 실명은 저장하지 않음. winnerParty2024는 정당명.',
        },
        'active30': active,
        'districts': light,
    }
    text = json.dumps(out, ensure_ascii=False, indent=1) + '\n'
    (DATA / 'districts-light-2024.json').write_text(text, encoding='utf-8')
    print(json.dumps({'districts': len(light), 'active': Counter(a['regionId'] for a in active), 'sha256': hashlib.sha256(text.encode()).hexdigest()}, ensure_ascii=False, default=dict))

if __name__ == '__main__':
    main()
