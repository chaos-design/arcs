/** 嵌入器契约：由集成方注入；core 不内置任何网络调用 */
export interface Embedder {
  embed(text: string): number[];
}

/** 词表化：拉丁词 + CJK 单字 */
function tokenize(text: string): string[] {
  const tokens: string[] = [];
  for (const m of text.toLowerCase().matchAll(/[a-z0-9]+|[\u4e00-\u9fff]/g)) {
    tokens.push(m[0]);
  }
  return tokens;
}

function hash32(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

/**
 * 默认端侧嵌入器：哈希词袋（确定性、无网络、无依赖）。
 * 生产可替换为真实向量模型实现的 Embedder。
 */
export class HashingEmbedder implements Embedder {
  constructor(readonly dims: number = 256) {}

  embed(text: string): number[] {
    const vec = new Array<number>(this.dims).fill(0);
    for (const tok of tokenize(text)) {
      vec[hash32(tok) % this.dims] += 1;
    }
    let norm = 0;
    for (const v of vec) norm += v * v;
    norm = Math.sqrt(norm);
    if (norm === 0) return vec;
    return vec.map((v) => v / norm);
  }
}

export function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
