import { readFile, writeFile } from 'node:fs/promises';
import { gzipSync, gunzipSync } from 'node:zlib';
import { curriculumManifest, curriculumRows } from '../src/lib/curriculum-data';
async function main(){
 const manifest=await curriculumManifest(),file='data/processed/curriculum-catalog.json.gz';
 try{if(JSON.parse(gunzipSync(await readFile(file)).toString()).version===manifest.version){console.log('Curriculum catalog current');return;}}catch{}
 const years:Record<number,object[]>={};
 for(const year of manifest.years){
   const unique=new Map<string,object>();
   for await(const r of curriculumRows(year)){
     const {schoolCode,school,departmentCode,department,universityCategory,division}=r;
     unique.set(JSON.stringify([universityCategory,schoolCode,departmentCode,division]),{schoolCode,school,departmentCode,department,universityCategory,division});
   }
   years[year]=[...unique.values()];console.log(year,unique.size);
 }
 await writeFile(file,gzipSync(JSON.stringify({version:manifest.version,years})));console.log('Catalog saved');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
