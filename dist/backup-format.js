// Personal launcher additions, 2026-10-28. SPDX-License-Identifier: GPL-2.0-or-later
// This format contains browser saves/settings only; it never contains the imported game data.
export const MAX_FILES = 5000;
export const MAX_RAW_BYTES = 128 * 1024 * 1024;
export const MAX_BACKUP_BYTES = 192 * 1024 * 1024;
const KIND = 'heroes3-personal-backup';

export function validPath(path) {
  return typeof path === 'string' && path.length > 0 && path.length <= 512
    && !/[\\:\x00-\x1f\x7f]/.test(path)
    && path.split('/').every(part => part !== '' && part !== '.' && part !== '..');
}

function toBase64(bytes) {
  const chunks = [];
  for (let i = 0; i < bytes.length; i += 32768)
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + 32768)));
  return btoa(chunks.join(''));
}

async function hash(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, b => b.toString(16).padStart(2, '0')).join('');
}

export async function createBackup(entries) {
  if (!Array.isArray(entries) || !entries.length) throw new Error('There are no saves or settings to export yet. Save a game first.');
  if (entries.length > MAX_FILES) throw new Error('Too many save files for one backup.');
  const files = [];
  const seen = new Set();
  let total = 0;
  for (const {path, bytes} of entries) {
    if (!validPath(path) || !(bytes instanceof Uint8Array) || seen.has(path.toLowerCase()))
      throw new Error('The save folder contains an invalid or duplicate filename.');
    seen.add(path.toLowerCase());
    total += bytes.byteLength;
    if (total > MAX_RAW_BYTES) throw new Error('Saves exceed the 128 MiB backup limit.');
    files.push({path, size: bytes.byteLength, sha256: await hash(bytes), base64: toBase64(bytes)});
  }
  const backup = {kind: KIND, version: 1, engine: 'VCMI 1.7.5', createdAt: new Date().toISOString(), files};
  return new TextEncoder().encode(JSON.stringify(backup));
}

// Validate every path, size, and checksum before the caller opens anything for writing.
export async function parseBackup(bytes) {
  if (bytes.byteLength > MAX_BACKUP_BYTES) throw new Error('This backup exceeds the 192 MiB file limit.');
  let data;
  try { data = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes)); }
  catch { throw new Error('This is not a valid Heroes III backup file.'); }
  if (data?.kind !== KIND || data.version !== 1 || !Array.isArray(data.files))
    throw new Error('This backup format is not supported. Choose a .h3backup exported by this launcher.');
  if (!data.files.length || data.files.length > MAX_FILES)
    throw new Error('The backup has an invalid number of files.');
  const entries = [];
  const seen = new Set();
  let total = 0;
  for (const file of data.files) {
    if (!validPath(file?.path) || seen.has(file.path.toLowerCase()))
      throw new Error('The backup contains an unsafe or duplicate filename. Nothing was restored.');
    seen.add(file.path.toLowerCase());
    if (!Number.isSafeInteger(file.size) || file.size < 0 || (total += file.size) > MAX_RAW_BYTES)
      throw new Error('The backup contains invalid file sizes. Nothing was restored.');
    if (typeof file.base64 !== 'string' || file.base64.length !== 4 * Math.ceil(file.size / 3)
        || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.base64)
        || !/^[a-f0-9]{64}$/.test(file.sha256 ?? ''))
      throw new Error('The backup contains damaged file data. Nothing was restored.');
    const binary = atob(file.base64);
    const contents = Uint8Array.from(binary, char => char.charCodeAt(0));
    if (contents.length !== file.size || await hash(contents) !== file.sha256)
      throw new Error('A backup checksum did not match. Nothing was restored.');
    entries.push({path: file.path, bytes: contents});
  }
  return entries;
}
