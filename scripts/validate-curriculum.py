"""Independent reconciliation of every normalized registration against enrollment and source samples."""
import pathlib,gzip,json,hashlib,collections,importlib.util,re
root=pathlib.Path.cwd();out=root/'data/processed'
manifest=json.loads((out/'curriculum-manifest.json').read_text(encoding='utf8'))
def digest(p):
    with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
assert digest(out/'enrollment.json.gz')==manifest['enrollmentVersion']
def key(r):return '|'.join(str(r[k]) for k in ['year','universityCategory','schoolCode','campus','departmentCode','dayNight','departmentFeature'])
students={key(r):r for r in json.load(gzip.open(out/'enrollment.json.gz','rt',encoding='utf8'))}
sources={s['file']:s for s in manifest['sources']};totals=collections.Counter();summaries=[];samplesChecked=0
for y in manifest['years']:
    seen=set();depts={};count=0;sampleStats=collections.defaultdict(dict)
    for line in gzip.open(out/f'curriculum-{y}.jsonl.gz','rt',encoding='utf8'):
        r=json.loads(line);assert r['id'] not in seen;seen.add(r['id']);assert r['year']==y
        assert r['departmentKey']==key(r);assert r['schoolCode'].isdigit() and r['departmentCode'].isdigit()
        student=students.get(key(r));assert r['enrolled']==(student['enrolled'] if student else None)
        if student:assert r['studentSource']['row']==student['sourceRow']
        else:assert r['studentSource'] is None
        assert r['division'] and r['course'];assert r['sourceVersion']==sources[r['sourceFile']]['sha256']
        assert r['descriptionHash']==hashlib.sha256(r['description'].encode()).hexdigest()
        depts[key(r)]=r['enrolled'];totals[r['sourceFile']]+=1;count+=1
        if r['universityCategory']=='전문대학' and totals[r['sourceFile']]<=3:sources[r['sourceFile']].setdefault('auditSamples',[]).append(r)
        if r['school'] in {'가천대학교','가톨릭관동대학교','가톨릭대학교'}:sampleStats[r['school']][key(r)]=r['enrolled']
    linked=[n for n in depts.values() if n is not None]
    summary=dict(year=y,registrations=count,departments=len(depts),linkedDepartments=len(linked),unlinkedDepartments=len(depts)-len(linked),enrolled=sum(linked),sampleSchools={s:dict(departments=len(ds),linked=sum(n is not None for n in ds.values()),unlinked=sum(n is None for n in ds.values()),enrolled=sum(n for n in ds.values() if n is not None)) for s,ds in sampleStats.items()})
    summaries.append(summary);print(json.dumps(summary,ensure_ascii=False),flush=True)
spec=importlib.util.spec_from_file_location('probe',root/'scripts/probe-inputs.py');probe=importlib.util.module_from_spec(spec);spec.loader.exec_module(probe)
for name,s in sources.items():
    original=root/'curriculum_input'/name;assert digest(original)==s['sha256'];assert digest(pathlib.Path(r'C:\Users\user\Downloads')/name)==s['sha256']
    assert totals[name]==sum(r['rows'] for r in s['ranges'])
    expected={r['sourceRow']:r for r in s.get('samples',[])+s.get('auditSamples',[])}
    if not expected:continue
    for rownum,cells in probe.rows(original,'xl/worksheets/sheet1.xml'):
        vals={re.sub(r'\d','',c):v.strip() for c,v in cells}
        if rownum==9:headers={v:c for c,v in vals.items()}
        if rownum in expected:
            r=expected[rownum]
            for field,labels in {'year':['조사년도'],'schoolCode':['학교코드'],'departmentCode':['학부·과(전공)코드'],'course':['교과목명','교육과정'],'description':['교과목해설'],'campus':['본분교명'],'dayNight':['주야구분명'],'departmentFeature':['학과특성','학부특성명']}.items():
                raw=next(vals.get(headers[n],'') for n in labels if n in headers);assert str(r[field])==raw,(name,rownum,field)
            samplesChecked+=1
        if rownum>=max(expected):break
report=dict(valid=True,version=manifest['version'],years=summaries,totalRows=sum(totals.values()),sourceSampleRowsChecked=samplesChecked,checks=['전체 학생 복합키·재학생·근거 행 일치','학교·학과 코드 문자열 보존','행 ID 중복 없음','과목명·이수구분 비어 있지 않음','원본별·연도별 등록 건수 일치','해설 SHA256 일치','Downloads와 복사본 SHA256 일치','엑셀 표본 행 대조'])
(out/'curriculum-validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print('PASS',report['totalRows'],samplesChecked,flush=True)
