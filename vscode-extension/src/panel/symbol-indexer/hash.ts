import { createHash } from 'crypto';

export const sha1 = (value: string): string => createHash('sha1').update(value).digest('hex');
