import zipfile, xml.etree.ElementTree as E, json, pathlib, itertools,sqlite3,hashlib,functools
NS='{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
def rows(p, sheet):
    with zipfile.ZipFile(p) as z:
        names={n.replace('\\','/'):n for n in z.namelist()}
        shared=None
        if 'xl/sharedStrings.xml' in names:
            cache=pathlib.Path('output/data-refresh/shared');cache.mkdir(parents=True,exist_ok=True)
            info=z.getinfo(names['xl/sharedStrings.xml'])
            db=cache/(hashlib.sha256(f'{info.CRC}:{info.file_size}'.encode()).hexdigest()+'.sqlite')
            exists=db.exists();shared=sqlite3.connect(db)
            if not exists:
                shared.execute('CREATE TABLE strings (id INTEGER PRIMARY KEY, value TEXT)');batch=[];i=0
                context=E.iterparse(z.open(names['xl/sharedStrings.xml']),events=('start','end'));_,root=next(context)
                for event,e in context:
                    if event=='end' and e.tag==NS+'si':
                        batch.append((i,''.join(t.text or '' for t in e.iter(NS+'t'))));i+=1;e.clear();root.clear()
                        if len(batch)==500:shared.executemany('INSERT INTO strings VALUES (?,?)',batch);batch=[]
                shared.executemany('INSERT INTO strings VALUES (?,?)',batch);shared.commit()
            @functools.lru_cache(maxsize=2048)
            def lookup(i):return shared.execute('SELECT value FROM strings WHERE id=?',(i,)).fetchone()[0]
        with z.open(names[sheet]) as f:
            context=E.iterparse(f,events=('start','end'));_,root=next(context)
            for event,e in context:
                if event=='end' and e.tag==NS+'row':
                    vals=[]
                    for c in e.findall(NS+'c'):
                        v=c.find(NS+'v'); s=v.text if v is not None else ''.join(t.text or '' for t in c.iter(NS+'t'))
                        if c.get('t')=='s': s=lookup(int(s))
                        vals.append([c.get('r'),s or ''])
                    yield int(e.get('r')),vals
                    e.clear();root.clear()
        if shared:shared.close()
def probe():
    out=[]
    for p in pathlib.Path(r'C:\Users\user\Downloads').glob('*.xlsx'):
        if not ('교육과정' in p.name or '재적 학생 현황' in p.name):continue
        with zipfile.ZipFile(p) as z:
            names={n.replace('\\','/'):n for n in z.namelist()}
            wb=E.fromstring(z.read(names['xl/workbook.xml']))
            sheets=[e.attrib for e in wb.iter(NS+'sheet')]
            sheetpaths=[n for n in names if n.startswith('xl/worksheets/sheet') and n.endswith('.xml')]
        item={'file':p.name,'sheets':sheets,'samples':{s:list(itertools.islice(rows(p,s),10)) for s in sheetpaths}}
        out.append(item)
        print(json.dumps(item,ensure_ascii=False),flush=True)
    pathlib.Path('output/data-refresh/probe.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8')
if __name__=='__main__':probe()
