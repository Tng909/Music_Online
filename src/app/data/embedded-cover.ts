/**
 * Cover art stored inside a song file, read in the browser:
 * MP3 (ID3v2.2 / 2.3 / 2.4 APIC/PIC), FLAC (PICTURE block) and M4A/MP4 (covr).
 * Used when a song is added without a cover of its own.
 */

/** The embedded picture as an image File, or null when the song has none. */
export async function readEmbeddedCover(song: File): Promise<File | null> {
  try {
    const head = new Uint8Array(await song.slice(0, 12).arrayBuffer());
    const text = (b: Uint8Array, from: number, len: number) => String.fromCharCode(...b.subarray(from, from + len));
    let found: { data: Uint8Array; mime: string } | null = null;
    if (text(head, 0, 3) === 'ID3') found = await fromId3(song);
    else if (text(head, 0, 4) === 'fLaC') found = fromFlac(new Uint8Array(await song.arrayBuffer()));
    else if (text(head, 4, 4) === 'ftyp') found = fromMp4(new Uint8Array(await song.arrayBuffer()));
    if (!found || found.data.length < 16) return null;
    const mime = sniffMime(found.data) ?? found.mime;
    if (!mime.startsWith('image/')) return null;
    const ext = mime.split('/')[1].replace('jpeg', 'jpg');
    const base = song.name.replace(/\.[^.]+$/, '');
    // Copy into a plain ArrayBuffer-backed array so the Blob owns its bytes.
    return new File([found.data.slice()], `${base} cover.${ext}`, { type: mime });
  } catch {
    return null; // Unreadable tag: the song simply has no cover.
  }
}

/** Trust the image bytes over the tag's declared type. */
function sniffMime(d: Uint8Array): string | null {
  if (d[0] === 0xff && d[1] === 0xd8) return 'image/jpeg';
  if (d[0] === 0x89 && d[1] === 0x50 && d[2] === 0x4e && d[3] === 0x47) return 'image/png';
  if (d[0] === 0x47 && d[1] === 0x49 && d[2] === 0x46) return 'image/gif';
  if (d[0] === 0x52 && d[1] === 0x49 && d[2] === 0x46 && d[3] === 0x46 && d[8] === 0x57 && d[9] === 0x45) return 'image/webp';
  return null;
}

const be32 = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const syncsafe = (b: Uint8Array, i: number) => (b[i] << 21) | (b[i + 1] << 14) | (b[i + 2] << 7) | b[i + 3];

/** Undo ID3 "unsynchronisation" (every FF 00 was written for FF). */
function unsync(b: Uint8Array): Uint8Array {
  const out = new Uint8Array(b.length);
  let n = 0;
  for (let i = 0; i < b.length; i++) {
    out[n++] = b[i];
    if (b[i] === 0xff && b[i + 1] === 0x00) i++;
  }
  return out.subarray(0, n);
}

/** End of a text field: one zero byte, or two aligned zero bytes for UTF-16 encodings. */
function skipText(b: Uint8Array, i: number, encoding: number): number {
  if (encoding === 1 || encoding === 2) {
    while (i + 1 < b.length && !(b[i] === 0 && b[i + 1] === 0)) i += 2;
    return i + 2;
  }
  while (i < b.length && b[i] !== 0) i++;
  return i + 1;
}

async function fromId3(song: File): Promise<{ data: Uint8Array; mime: string } | null> {
  const header = new Uint8Array(await song.slice(0, 10).arrayBuffer());
  const version = header[3];
  const flags = header[5];
  const size = syncsafe(header, 6);
  let tag: Uint8Array = new Uint8Array(await song.slice(10, 10 + size).arrayBuffer());
  if (version < 4 && flags & 0x80) tag = unsync(tag);

  let i = 0;
  if (flags & 0x40) i = version === 4 ? syncsafe(tag, 0) : be32(tag, 0) + 4; // extended header
  const idLen = version === 2 ? 3 : 4;
  const headLen = version === 2 ? 6 : 10;
  let fallback: { data: Uint8Array; mime: string } | null = null;

  while (i + headLen <= tag.length) {
    const id = String.fromCharCode(...tag.subarray(i, i + idLen));
    if (!/^[A-Z0-9]+$/.test(id)) break; // padding
    const frameSize =
      version === 2 ? (tag[i + 3] << 16) | (tag[i + 4] << 8) | tag[i + 5] : version === 4 ? syncsafe(tag, i + 4) : be32(tag, i + 4);
    const formatFlags = version === 2 ? 0 : tag[i + 9];
    let frame: Uint8Array = tag.subarray(i + headLen, i + headLen + frameSize);
    i += headLen + frameSize;
    if (id !== 'APIC' && id !== 'PIC') continue;
    if (version === 4) {
      if (formatFlags & 0x01) frame = frame.subarray(4); // data length indicator
      if (formatFlags & 0x02) frame = unsync(frame);
    }

    const encoding = frame[0];
    let p = 1;
    let mime: string;
    if (id === 'PIC') {
      const fmt = String.fromCharCode(...frame.subarray(1, 4)).toLowerCase();
      mime = fmt === 'png' ? 'image/png' : 'image/jpeg';
      p = 4;
    } else {
      const end = frame.indexOf(0, p);
      mime = String.fromCharCode(...frame.subarray(p, end)).toLowerCase() || 'image/jpeg';
      if (!mime.includes('/')) mime = `image/${mime.replace('jpg', 'jpeg')}`;
      p = end + 1;
    }
    const pictureType = frame[p];
    p = skipText(frame, p + 1, encoding); // description
    const pic = { data: frame.subarray(p), mime };
    if (pictureType === 3) return pic; // front cover
    fallback ??= pic;
  }
  return fallback;
}

function fromFlac(b: Uint8Array): { data: Uint8Array; mime: string } | null {
  let i = 4;
  let fallback: { data: Uint8Array; mime: string } | null = null;
  while (i + 4 <= b.length) {
    const last = b[i] & 0x80;
    const type = b[i] & 0x7f;
    const len = (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3];
    const block = b.subarray(i + 4, i + 4 + len);
    i += 4 + len;
    if (type === 6) {
      const pictureType = be32(block, 0);
      const mimeLen = be32(block, 4);
      const mime = String.fromCharCode(...block.subarray(8, 8 + mimeLen));
      let p = 8 + mimeLen;
      p += 4 + be32(block, p); // description
      p += 16; // width, height, depth, colours
      const dataLen = be32(block, p);
      const pic = { data: block.subarray(p + 4, p + 4 + dataLen), mime };
      if (pictureType === 3) return pic;
      fallback ??= pic;
    }
    if (last) break;
  }
  return fallback;
}

/** moov > udta > meta > ilst > covr > data */
function fromMp4(b: Uint8Array): { data: Uint8Array; mime: string } | null {
  const path = ['moov', 'udta', 'meta', 'ilst', 'covr', 'data'];
  let start = 0;
  let end = b.length;
  for (const name of path) {
    let i = start;
    let hit = -1;
    let hitEnd = -1;
    while (i + 8 <= end) {
      let size = be32(b, i);
      const type = String.fromCharCode(...b.subarray(i + 4, i + 8));
      let headerLen = 8;
      if (size === 1) {
        size = be32(b, i + 12); // 64-bit size (low word is enough here)
        headerLen = 16;
      } else if (size === 0) size = end - i;
      if (size < headerLen) return null;
      if (type === name) {
        hit = i + headerLen + (name === 'meta' ? 4 : 0); // meta is a full box
        hitEnd = i + size;
        break;
      }
      i += size;
    }
    if (hit < 0) return null;
    start = hit;
    end = hitEnd;
  }
  const kind = be32(b, start); // 13 = JPEG, 14 = PNG
  return { data: b.subarray(start + 8, end), mime: kind === 14 ? 'image/png' : 'image/jpeg' };
}
