import cors from '@fastify/cors';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { z, type ZodType } from 'zod';
import { siteTypes } from './siteTypes.js';
type ProxyReq = { url: string; headers: Record<string, string | string[] | undefined>; method: string; body?: unknown };
type IdParams = { Params: { id: string } };
type IdVersionParams = { Params: { id: string; version: string } };
// analysis proxy prefix reused for layer/catalog endpoints
const requestSchema=z.object({profile_id:z.string().min(1),longitude:z.number().min(-180).max(180),latitude:z.number().min(-90).max(90),factor_values:z.record(z.string(),z.number().min(0).max(1)).optional(),weight_overrides:z.record(z.string(),z.number().min(0).max(1)).optional(),triggered_constraints:z.array(z.object({id:z.string(),effect:z.enum(['block','cap','warn']),cap:z.number().min(0).max(100).optional(),message:z.string()})).default([]),candidate_id:z.string().min(1).optional(),candidate_name:z.string().min(1).max(120).optional()});
const candidateSchema=z.object({name:z.string().min(1).max(120),longitude:z.number().min(-180).max(180),latitude:z.number().min(-90).max(90)});
const hotspotsSchema=z.object({profile_id:z.string().min(1),eps_km:z.number().min(1).max(100).optional()});
const h3Schema=z.object({profile_id:z.string().min(1),weight_overrides:z.record(z.string(),z.number().min(0).max(1)).optional(),resolution:z.number().int().min(3).max(7).optional(),bbox:z.tuple([z.number(),z.number(),z.number(),z.number()]).optional()});
const isochroneSchema=z.object({longitude:z.number().min(-180).max(180),latitude:z.number().min(-90).max(90),minutes:z.array(z.number().int().min(1).max(120)).min(1).max(5).optional()});
const reportSchema=z.object({items:z.array(z.object({analysis_run_id:z.string().min(1),candidate_site_id:z.string().min(1)})).min(1).max(10)});
export function buildServer(analysisUrl=process.env.ANALYSIS_URL??'http://localhost:8000'){const app=Fastify({logger:true});void app.register(cors,{origin:true});app.addContentTypeParser('multipart/form-data',function(req,payload,done){void req;void payload;done(null);});app.get('/health',async()=>({status:'ok',service:'geoready-api'}));app.get('/api/v1/site-types',async()=>({data:siteTypes,scope:'Gujarat',expansion:'India after validated state-level layers'}));app.post('/api/v1/scores',async(request,reply)=>{const parsed=requestSchema.safeParse(request.body);if(!parsed.success)return reply.code(400).send({error:'Invalid score request',details:parsed.error.flatten()});if(!siteTypes.some(p=>p.id===parsed.data.profile_id))return reply.code(404).send({error:'Unknown site type profile'});try{const response=await fetch(`${analysisUrl}/api/v1/score`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(parsed.data)});return reply.code(response.status).send(await response.json());}catch{return reply.code(503).send({error:'Spatial analysis service is unavailable. Start the analysis container and retry.'});}});
// layer/catalog proxy — JSON layers to analysis; multipart (GeoTIFF/Shapefile) goes direct to analysis
// NOTE: only req.url / req.headers / req.method are touched — never spread the
// fastify request (its getters are non-enumerable and vanish under {...req}).
async function proxy(req:ProxyReq, reply:FastifyReply, targetPath:string){
  try{
    const q = req.url.includes('?') ? '?' + req.url.split('?')[1] : '';
    const url = `${analysisUrl}${targetPath}${q}`;
    const headers:Record<string,string> = {};
    const ct = req.headers?.['content-type'];
    headers['content-type'] = Array.isArray(ct) ? ct.join(',') : (ct ?? 'application/json');
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
    let body:string|undefined = undefined;
    if(hasBody && req.body !== undefined) body = JSON.stringify(req.body);
    const resp = await fetch(url,{method:req.method, headers, body});
    const text = await resp.text();
    let data:unknown; try{ data = JSON.parse(text);}catch{ data = text; }
    return reply.code(resp.status).send(data);
  }catch{ return reply.code(503).send({error:'Spatial analysis service is unavailable for layers.'}); }
}
app.get('/api/v1/layers', async(req,reply)=>proxy(req,reply,'/api/v1/layers'));
app.get('/api/v1/layers/:id/versions/:version', async(req:FastifyRequest<IdVersionParams>,reply)=>proxy(req,reply,`/api/v1/layers/${req.params.id}/versions/${req.params.version}`));
app.get('/api/v1/layers/:id/features', async(req:FastifyRequest<IdParams>,reply)=>proxy(req,reply,`/api/v1/layers/${req.params.id}/features`));
app.post('/api/v1/layers', async(req,reply)=>proxy(req,reply,'/api/v1/layers'));
// multipart upload: stream the raw body straight through to analysis (same content-type/boundary)
app.post('/api/v1/layers/upload', async(req:FastifyRequest,reply:FastifyReply)=>{
  try{
    const chunks:Buffer[]=[];
    for await (const c of req.raw) chunks.push(c as Buffer);
    const ct = req.headers['content-type'];
    const resp = await fetch(`${analysisUrl}/api/v1/layers/upload`,{method:'POST',headers:{'content-type':Array.isArray(ct)?ct.join(','):(ct ?? 'application/octet-stream')},body:Buffer.concat(chunks),...({duplex:'half'} as Record<string,string>)});
    const text = await resp.text();
    let data:unknown; try{ data = JSON.parse(text);}catch{ data = text; }
    return reply.code(resp.status).send(data);
  }catch{ return reply.code(503).send({error:'Spatial analysis service is unavailable for upload.'}); }
});
function proxied(schema:ZodType|null, path:string|((req:FastifyRequest)=>string)){
  return async (req:FastifyRequest,reply:FastifyReply)=>{
    let body:unknown = req.body;
    if(schema){
      const parsed=schema.safeParse(req.body ?? {});
      if(!parsed.success) return reply.code(400).send({error:'Invalid request',details:parsed.error.flatten()});
      body = parsed.data;
    }
    return proxy({url:req.url, headers:req.headers, method:req.method, body}, reply, typeof path==='function'?path(req):path);
  };
}
app.post('/api/v1/candidates', proxied(candidateSchema,'/api/v1/candidates'));
app.get('/api/v1/candidates', async(req,reply)=>proxy(req,reply,'/api/v1/candidates'));
app.get('/api/v1/analysis-runs/:id', async(req:FastifyRequest<IdParams>,reply)=>proxy(req,reply,`/api/v1/analysis-runs/${req.params.id}`));
app.post('/api/v1/hotspots', proxied(hotspotsSchema,'/api/v1/hotspots'));
app.post('/api/v1/h3', proxied(h3Schema,'/api/v1/h3'));
app.post('/api/v1/isochrone', proxied(isochroneSchema,'/api/v1/isochrone'));
app.post('/api/v1/reports', proxied(reportSchema,'/api/v1/reports'));
return app;}
const app=buildServer();await app.listen({port:Number(process.env.API_PORT??3000),host:'0.0.0.0'});
