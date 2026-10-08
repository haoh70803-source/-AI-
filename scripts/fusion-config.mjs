import { validateReview } from './local-profile.mjs';

export function validateFusionConfig(values) {
  validateReview(values);
  const key=values.INTEGRATION_ENCRYPTION_KEY ?? '';
  const decoded=Buffer.from(key,'base64');
  if(decoded.length!==32 || decoded.toString('base64')!==key)throw Error('FUSION_INVALID_ENCRYPTION_KEY');
  for(const name of ['AUTH_SECRET','S3_BUCKET','S3_ACCESS_KEY_ID','S3_SECRET_ACCESS_KEY'])if(!values[name] || values[name].includes('BUILD_ONLY'))throw Error('FUSION_CONFIGURATION_INCOMPLETE');
  return values;
}
