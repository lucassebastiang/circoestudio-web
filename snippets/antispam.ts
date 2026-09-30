/**
 * Heurística antispam del formulario de contacto.
 * Marca el mensaje como spam, pero NO lo rechaza: el contacto se guarda igual
 * y se puede revisar en el panel. Así nunca se pierde un contacto legítimo.
 *
 * Fragmento recortado del código real (lista de frases abreviada).
 */

const OUTREACH_PHRASES = [
  // spam de SEO y "outreach"
  'guest post',
  'backlink',
  'link building',
  'first page of google',
  'seo services',
  'we can help you rank',
  'i visited your website',
  'dear sir or madam',
  // loterías y premios falsos
  'lottery',
  'claim your prize',
  'you have won',
  // …
];

export interface SpamResult {
  isSpam: boolean;
  score: number;
  reasons: string[];
}

export function scoreSpam(input: { nombre: string; mensaje: string }): SpamResult {
  const reasons: string[] = [];
  let score = 0;
  const msg = input.mensaje;
  const lower = `${input.nombre} ${msg}`.toLowerCase();

  // enlaces: raros en un formulario de contacto legítimo
  const links = (msg.match(/(https?:\/\/|www\.)/gi) || []).length;
  if (links > 0) {
    score += links;
    reasons.push(`${links} enlace(s)`);
  }

  // etiquetas HTML o BBCode de enlace
  if (/<a\s|<\/a>|\[url|\[link/i.test(msg)) {
    score += 2;
    reasons.push('etiquetas de enlace');
  }

  // frases típicas de spam: con una basta
  const phrase = OUTREACH_PHRASES.find((p) => lower.includes(p));
  if (phrase) {
    score += 2;
    reasons.push(`frase "${phrase}"`);
  }

  // alfabetos no latinos + enlaces (inusual en un formulario en español)
  if (links > 0 && /[Ѐ-ӿ一-鿿]/.test(msg)) {
    score += 2;
    reasons.push('alfabeto no latino');
  }

  // el "mensaje" es casi solo una URL
  if (links > 0 && msg.replace(/https?:\/\/\S+/gi, '').trim().length < 15) {
    score += 2;
    reasons.push('mensaje casi solo enlaces');
  }

  // mensaje mayormente en MAYÚSCULAS (plantillas de premios y loterías)
  const letters = msg.replace(/[^a-zA-ZÀ-ÿ]/g, '');
  const upper = msg.replace(/[^A-ZÀ-Ý]/g, '');
  if (letters.length >= 20 && upper.length / letters.length > 0.6) {
    score += 2;
    reasons.push('mensaje en mayúsculas');
  }

  return { isSpam: score >= 2, score, reasons };
}
