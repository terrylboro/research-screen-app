export function publicAsset(path: string): string {
  if (/^https?:\/\//.test(path)) {
    return path;
  }

  return `${process.env.PUBLIC_URL || ''}/${path.replace(/^\/+/, '')}`;
}
