import {requireCoach} from './_auth.js';
export async function onRequestPost({request,env}){const a=await requireCoach(request,env);if(a.error)return a.error;await a.db.prepare(`UPDATE coach_sessions SET revoked_at=? WHERE token_hash=?`).bind(new Date().toISOString(),a.token_hash).run();return Response.json({ok:true});}
