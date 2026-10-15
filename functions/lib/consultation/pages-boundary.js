// Deployment identity, not customer authorization. No network or activation.
export const PAGES_PROJECT='qy-c1-consultation-preview';
export const PREVIEW_BRANCH='c1-bazi-consultation-development';
export const PREVIEW_ORIGIN='https://'+PREVIEW_BRANCH+'.'+PAGES_PROJECT+'.pages.dev';
export function requirePagesPreview(env,config){
 if(env.CONSULTATION_DEPLOYMENT_SLOT!=='preview'||env.CF_PAGES!=='1'||
  env.CF_PAGES_BRANCH!==PREVIEW_BRANCH||config.isolatedPreviewProject!==PAGES_PROJECT||
  config.previewBranch!==PREVIEW_BRANCH||config.origin!==PREVIEW_ORIGIN)throw Error('Preview deployment identity rejected');
 for(const name of ['CONSULTATION_CONFIG','CONSULTATION_KEYRING'])
  if(typeof env[name]!=='string'||new TextEncoder().encode(env[name]).length>5000)throw Error('Preview binding size rejected');
}
