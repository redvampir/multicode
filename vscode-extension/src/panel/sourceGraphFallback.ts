import * as path from 'path';
import {
  createDefaultGraphState,
  type GraphDisplayLanguage,
  type GraphLanguage,
  type GraphState,
} from '../shared/graphState';

const normalizeSourcePath = (sourcePath: string): string => sourcePath.replace(/\\/g, '/');

const hashString = (value: string): string => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
};

const toSafeIdSegment = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'file';

const stripFileExtension = (fileName: string): string => fileName.replace(/\.[^/.]+$/, '');

export const createDetachedSourceGraphCacheKey = (sourcePath: string): string =>
  normalizeSourcePath(sourcePath).toLowerCase();

export const createDetachedSourceGraphId = (sourcePath: string): string => {
  const normalized = normalizeSourcePath(sourcePath);
  const stem = stripFileExtension(path.basename(normalized)) || 'file';
  return `graph-file-${toSafeIdSegment(stem)}-${hashString(normalized.toLowerCase())}`;
};

export const createDetachedSourceGraphState = (
  sourcePath: string,
  options: {
    language: GraphLanguage;
    displayLanguage: GraphDisplayLanguage;
  }
): GraphState => {
  const base = createDefaultGraphState();
  const fileName = path.basename(normalizeSourcePath(sourcePath));
  const graphName = stripFileExtension(fileName) || 'Untitled Graph';
  return {
    ...base,
    id: createDetachedSourceGraphId(sourcePath),
    name: graphName,
    language: options.language,
    displayLanguage: options.displayLanguage,
    updatedAt: new Date().toISOString(),
    dirty: false,
  };
};
