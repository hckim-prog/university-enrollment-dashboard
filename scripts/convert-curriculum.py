"""Sequential XLSX extraction; bounded worksheet memory, gzip JSONL server datasets."""
import pathlib,json,gzip,hashlib,collections,re,sys,shutil,datetime,importlib.util
spec=importlib.util.spec_from_file_location('probe',pathlib.Path(__file__).with_name('probe-inputs.py')); probe=importlib.util.module_from_spec(spec); spec.loader.exec_module(probe)
ROOT=pathlib.Path.cwd(); OUT=ROOT/'data/processed'; TARGETS={'가천대학교','가톨릭관동대학교','가톨릭대학교'}
def digest(p):
    with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def key(r):return '|'.join(str(r[k]) for k in ['year','universityCategory','schoolCode','campus','departmentCode','dayNight','departmentFeature'])
def main():
    sample='--sample' in sys.argv
    students=json.load(gzip.open(OUT/'enrollment.json.gz','rt',encoding='utf8')); index={key(r):r for r in students}
    assert len(index)==len(students)
    byCode=collections.defaultdict(list); byName=collections.defaultdict(list)
    for r in students:
        byCode[(r['year'],r['schoolCode'],r['departmentCode'])].append(r)
        byName[(r['year'],r['schoolCode'],r['department'])].append(r)
    enrollmentVersion=digest(OUT/'enrollment.json.gz')
    sources=json.loads((OUT/'methodology.json').read_text(encoding='utf8'))['sourceFiles']
    studentSources={(y,c):s for s in sources for y in s['years'] for c in s['universityCategories']}
    availableYears=sorted({r['year'] for r in students}); del students
    probeData=json.loads((ROOT/'output/data-refresh/probe.json').read_text(encoding='utf8'))
    dest=ROOT/'curriculum_input'; dest.mkdir(exist_ok=True)
    manifest={'version':'','enrollmentVersion':enrollmentVersion,'studentYears':availableYears,'sources':[],'years':[], 'sample':sample,'warnings':[], 'joinRule':'조사년도=기준연도 + 학교구분 + 학교코드 + 본분교명 + 학과코드 + 주야 + 학과특성 완전일치; 이름 유사 연결 없음'}
    handles={}; summaries={}; sampleRows=[]; sourceRanges=set()
    for file in probeData:
        if not file['file'].startswith('교육과정'):continue
        if sample and '전문대학' in file['file']:continue
        source=pathlib.Path(r'C:\Users\user\Downloads')/file['file']
        if not sample:
            shutil.copy2(source,dest/source.name); source=dest/source.name
        sha=digest(source); sheet=list(file['samples'])[0]; sheetName=file['sheets'][0]['name']
        headers={}; counts=collections.Counter(); links=collections.Counter(); samples=[]; headerNotes=[]; deptStats={}; seen=set(); duplicates=0; emptyCourses=0; emptyExamples=[]
        for rownum,cells in probe.rows(source,sheet):
            values={re.sub(r'\d','',c):v.strip() for c,v in cells}
            if '조사년도' in values.values():headers={v:c for c,v in values.items()}; continue
            if not headers:
                headerNotes.extend(v for v in values.values() if v); continue
            def v(*names):return next((values.get(headers[n],'') for n in names if n in headers),'')
            if not v('조사년도'):continue
            school=v('학교명')
            if sample and school not in TARGETS:
                # Files are school sorted; stop after the three requested schools.
                if samples and not school.startswith('가'):break
                continue
            year=int(v('조사년도')); category=v('학교구분'); round_=v('조사차수','차수')
            r=dict(year=year,round=round_,schoolCode=v('학교코드'),school=school,campus=v('본분교명'),universityCategory=category,departmentCode=v('학부·과(전공)코드'),department=v('학부·과(전공)명'),dayNight=v('주야구분명'),departmentFeature=v('학과특성','학부특성명'),departmentStatus=v('학과상태'),course=v('교과목명','교육과정'),division=v('이수구분') or '미기재',credits=v('학점') or None,description=v('교과목해설'),sourceFile=source.name,sourceSheet=sheetName,sourceRow=rownum,sourceVersion=sha)
            if not r['course']:
                emptyCourses+=1
                if len(emptyExamples)<5:emptyExamples.append(dict(row=rownum,school=school,department=r['department']))
                continue
            assert all(r[k] for k in ['schoolCode','departmentCode','campus','dayNight']), (source.name,rownum,'required dimension',r)
            r['departmentKey']=key(r); student=index.get(r['departmentKey'])
            r['enrolled']=student['enrolled'] if student else None
            r['linkStatus']='연결' if student else '미연결: 동일 연도·코드·본분교·주야·특성 없음'
            if not student:
                if byCode.get((year,r['schoolCode'],r['departmentCode'])):r['linkStatus']='검토: 본분교·주야·학과특성 불일치'
                elif byName.get((year,r['schoolCode'],r['department'])):r['linkStatus']='검토: 같은 학과명에 다른 코드 관측(자동 연결 안 함)'
                else:r['linkStatus']='미연결: 해당 연도 학과코드 미관측(개편·조사범위 확인 필요)'
            ss=studentSources.get((year,category))
            r['studentSource']=dict(file=ss['sourceFile'],sheet='Sheet 1',row=student['sourceRow'],version=ss['sha256']) if student and ss else None
            r['id']=sha[:12]+':'+str(rownum)
            r['descriptionHash']=hashlib.sha256(r['description'].encode()).hexdigest()
            semantic=tuple(r[k] for k in ['departmentKey','round','course','division','credits','descriptionHash'])
            if semantic in seen:duplicates+=1
            seen.add(semantic) # registration rows are retained, never mislabeled as distinct classes
            counts[(year,category,round_)]+=1; links[r['linkStatus']]+=1
            deptStats[r['departmentKey']]=dict(school=school,department=r['department'],enrolled=r['enrolled'],status=r['linkStatus'])
            if school in TARGETS and len([x for x in samples if x['school']==school])<3:samples.append(r)
            if not sample:
                if year not in handles:handles[year]=gzip.open(OUT/f'curriculum-{year}.jsonl.gz.tmp','wt',encoding='utf8',compresslevel=6)
                handles[year].write(json.dumps(r,ensure_ascii=False,separators=(',',':'))+'\n')
            if sample:sampleRows.append(r)
        ranges=[dict(year=y,category=c,round=t,rows=n) for (y,c,t),n in sorted(counts.items())]
        for range_ in ranges:
            scope=(range_['year'],range_['category'])
            if scope in sourceRanges:raise ValueError(f'Overlapping curriculum source scope: {scope}')
            sourceRanges.add(scope)
        noteYears=re.findall(r'(20\d{2})학년도',' '.join(headerNotes))
        if noteYears and any(int(n)!=x['year'] for n in noteYears for x in ranges):manifest['warnings'].append(source.name+': 상단 학년도 설명과 행 조사년도 불일치; 행 조사년도 사용')
        summary=dict(file=source.name,sha256=sha,sheet=sheetName,headerRow=9,headers=list(headers),ranges=ranges,emptyCourses=emptyCourses,emptyExamples=emptyExamples,exactDuplicateRegistrations=duplicates,links=dict(links),departments=len(deptStats),linkedDepartments=sum(x['enrolled'] is not None for x in deptStats.values()),unlinkedDepartments=sum(x['enrolled'] is None for x in deptStats.values()),unlinkedExamples=[dict(key=k,**d) for k,d in deptStats.items() if d['enrolled'] is None][:20],samples=samples,notes=headerNotes)
        manifest['sources'].append(summary)
        print(json.dumps({k:summary[k] for k in ['file','ranges','departments','linkedDepartments','unlinkedDepartments','exactDuplicateRegistrations']},ensure_ascii=False),flush=True)
    for year,h in handles.items():h.close(); (OUT/f'curriculum-{year}.jsonl.gz.tmp').replace(OUT/f'curriculum-{year}.jsonl.gz')
    manifest['years']=sorted({y for y,c in sourceRanges})
    manifest['version']=hashlib.sha256((enrollmentVersion+''.join(s['sha256'] for s in manifest['sources'])).encode()).hexdigest()
    manifest['generatedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
    location=ROOT/'output/data-refresh/curriculum-sample.json' if sample else OUT/'curriculum-manifest.json'
    location.write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
    if sample:
        (ROOT/'output/data-refresh/sample-rows.json').write_text(json.dumps(sampleRows,ensure_ascii=False),encoding='utf8')
if __name__=='__main__':main()
