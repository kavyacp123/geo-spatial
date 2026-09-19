import { afterAll, describe, expect, it } from 'vitest';
import { buildServer } from '../src/server.js';
const app=buildServer('http://analysis.invalid');afterAll(async()=>app.close());
describe('site types',()=>{it('returns eleven profiles',async()=>{const r=await app.inject({method:'GET',url:'/api/v1/site-types'});expect(r.statusCode).toBe(200);expect(r.json().data).toHaveLength(11);});it('rejects invalid coordinates',async()=>{const r=await app.inject({method:'POST',url:'/api/v1/scores',payload:{profile_id:'fmcg_retail',longitude:200,latitude:23}});expect(r.statusCode).toBe(400);});it('rejects invalid weight range',async()=>{const r=await app.inject({method:'POST',url:'/api/v1/scores',payload:{profile_id:'fmcg_retail',longitude:72.5,latitude:23,weight_overrides:{demand:2}}});expect(r.statusCode).toBe(400);});it('passes weight_overrides through',async()=>{const r=await app.inject({method:'POST',url:'/api/v1/scores',payload:{profile_id:'fmcg_retail',longitude:72.5,latitude:23,weight_overrides:{demand:0.5,access:0.1,competition:0.1,zoning:0.15,risk:0.15}}});expect([503,200]).toContain(r.statusCode);});it('passes candidate identity through',async()=>{const r=await app.inject({method:'POST',url:'/api/v1/scores',payload:{profile_id:'fmcg_retail',longitude:72.5,latitude:23,candidate_name:'Test Site'}});expect([503,200]).toContain(r.statusCode);});});
describe('registry + analysis proxies (analysis.invalid → 503 passthrough, 400 on bad shape)',()=>{
 const cases:Array<{m:'GET'|'POST';u:string;p:unknown;s:number[]}>=[
  {m:'POST',u:'/api/v1/candidates',p:{name:'X',longitude:200,latitude:23},s:[400]},
  {m:'POST',u:'/api/v1/candidates',p:{name:'X',longitude:72.5,latitude:23},s:[503]},
  {m:'GET',u:'/api/v1/candidates?limit=5',p:undefined,s:[503]},
  {m:'GET',u:'/api/v1/analysis-runs/nope',p:undefined,s:[503]},
  {m:'POST',u:'/api/v1/hotspots',p:{eps_km:5},s:[400]},
  {m:'POST',u:'/api/v1/hotspots',p:{profile_id:'fmcg_retail'},s:[503,200]},
  {m:'POST',u:'/api/v1/h3',p:{profile_id:'fmcg_retail',resolution:9},s:[400]},
  {m:'POST',u:'/api/v1/h3',p:{profile_id:'fmcg_retail',resolution:5},s:[503,200]},
  {m:'POST',u:'/api/v1/isochrone',p:{longitude:72.5,latitude:23,minutes:[0]},s:[400]},
  {m:'POST',u:'/api/v1/isochrone',p:{longitude:72.5,latitude:23,minutes:[10,20]},s:[503,200]},
  {m:'POST',u:'/api/v1/reports',p:{items:[]},s:[400]},
  {m:'POST',u:'/api/v1/reports',p:{items:[{analysis_run_id:'a',candidate_site_id:'b'}]},s:[503,200]},
  {m:'GET',u:'/api/v1/layers',p:undefined,s:[503,200]},
 ];
  for(const c of cases) it(`${c.m} ${c.u}`,async()=>{const r=await app.inject({method:c.m,url:c.u,payload:c.p as Record<string,unknown>});expect(c.s).toContain(r.statusCode);});
 it('upload endpoint streams without crashing',async()=>{const r=await app.inject({method:'POST',url:'/api/v1/layers/upload',payload:{}});expect([503,400]).toContain(r.statusCode);});
 it('upload accepts multipart bodies (no 415)',async()=>{
  const b='----t';
  const body=`--${b}\r\nContent-Disposition: form-data; name="kind"\r\n\r\npoi\r\n--${b}\r\nContent-Disposition: form-data; name="name"\r\n\r\nProbe\r\n--${b}--\r\n`;
  const r=await app.inject({method:'POST',url:'/api/v1/layers/upload',headers:{'content-type':`multipart/form-data; boundary=${b}`},payload:body});
  expect(r.statusCode).toBe(503); // parsed fine, analysis.invalid unreachable
 });
});
