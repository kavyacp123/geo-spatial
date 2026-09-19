import { afterAll, describe, expect, it } from 'vitest';
import { buildServer } from '../src/server.js';
const app=buildServer('http://analysis.invalid');afterAll(async()=>app.close());
describe('site types',()=>{it('returns eleven profiles',async()=>{const r=await app.inject({method:'GET',url:'/api/v1/site-types'});expect(r.statusCode).toBe(200);expect(r.json().data).toHaveLength(11);});it('rejects invalid coordinates',async()=>{const r=await app.inject({method:'POST',url:'/api/v1/scores',payload:{profile_id:'fmcg_retail',longitude:200,latitude:23}});expect(r.statusCode).toBe(400);});});
