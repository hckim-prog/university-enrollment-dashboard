import gzip,json,pathlib,collections,hashlib,shutil,datetime
root=pathlib.Path.cwd(); candidate=root/'output/data-refresh/enrollment-candidate'
old=json.load(gzip.open(root/'data/processed/enrollment.json.gz','rt',encoding='utf8'))
new=json.load(gzip.open(candidate/'enrollment.json.gz','rt',encoding='utf8'))
def key(r):return tuple(r[k] for k in ['year','schoolCode','campus','departmentCode','dayNight','departmentFeature'])
a={key(r):r for r in old}; b={key(r):r for r in new}
assert len(b)==len(new)
assert {(r['year'],r['universityCategory']) for r in old} <= {(r['year'],r['universityCategory']) for r in new}
stats=[]
for y in sorted({r['year'] for r in new}):
    ak={k for k in a if k[0]==y}; bk={k for k in b if k[0]==y}
    changed=[k for k in ak&bk if any(a[k][m]!=b[k][m] for m in ['enrolled','leave','deferment','total','capacity'])]
    stats.append(dict(year=y,oldRows=len(ak),newRows=len(bk),added=len(bk-ak),removed=len(ak-bk),numericChanged=len(changed),enrolledDelta=sum(b[k]['enrolled'] for k in bk)-sum(a[k]['enrolled'] for k in ak),examples=[dict(key=k,school=b[k]['school'],department=b[k]['department'],old=a[k]['enrolled'],new=b[k]['enrolled']) for k in sorted(changed,key=lambda k:abs(b[k]['enrolled']-a[k]['enrolled']),reverse=True)[:10]]))
stamp=datetime.datetime.now().strftime('%Y-%m-%d_%H%M%S'); backup=root/'backups'/stamp; backup.mkdir(parents=True)
for folder in ['origin_data','data/processed']:
    shutil.copytree(root/folder,backup/folder)
actions=[]
for p in (root/'origin_data').glob('*.xlsx'):
    source=pathlib.Path(r'C:\Users\user\Downloads')/p.name
    same=hashlib.file_digest(p.open('rb'),'sha256').hexdigest()==hashlib.file_digest(source.open('rb'),'sha256').hexdigest()
    if not same:shutil.copy2(source,p)
    actions.append(dict(file=p.name,action='maintained-identical' if same else 'replaced',sha256=hashlib.file_digest(p.open('rb'),'sha256').hexdigest()))
for p in candidate.iterdir():shutil.copy2(p,root/'data/processed'/p.name)
report=dict(backup=str(backup),files=actions,years=stats)
(root/'data/processed/refresh-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(report,ensure_ascii=False,indent=2))
