/**
 * Captcha autoalojado para el formulario de contacto: una suma de dos números
 * pequeños, firmada con HMAC. Se verifica sin sesión ni base de datos, y sin
 * servicios de terceros.
 *
 * Frena a los bots genéricos. No está pensado para un ataque hecho a medida:
 * para eso están el límite de peticiones, el tiempo mínimo de rellenado y la
 * heurística antispam.
 */
import { createHmac, randomInt } from 'node:crypto';

const TTL_MS = 10 * 60 * 1000; // margen amplio para rellenar el formulario con calma
const SECRET = process.env.SESSION_SECRET!; // nunca en el código

function sign(payload: string): string {
  return createHmac('sha256', SECRET).update(payload).digest('hex');
}

export interface Captcha {
  a: number;
  b: number;
  token: string;
}

export function generateCaptcha(): Captcha {
  const a = randomInt(2, 10);
  const b = randomInt(2, 10);
  const expires = Date.now() + TTL_MS;
  const payload = `${a}.${b}.${expires}`;
  return { a, b, token: `${payload}.${sign(payload)}` };
}

export function verifyCaptcha(token: unknown, answer: unknown): boolean {
  if (typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 4) return false;
  const [aStr, bStr, expiresStr, sig] = parts;
  if (sign(`${aStr}.${bStr}.${expiresStr}`) !== sig) return false;

  const expires = Number(expiresStr);
  if (!Number.isFinite(expires) || Date.now() > expires) return false;

  return Number(answer) === Number(aStr) + Number(bStr);
}

/*
 * En la ruta de contacto, el orden de las comprobaciones es:
 *   1. esquema con Zod (y un campo trampa `web` que debe llegar vacío)
 *   2. captcha
 *   3. tiempo mínimo de rellenado (menos de 3 s → rechazo)
 *   4. heurística antispam → el contacto se guarda marcado, no se descarta
 * y la ruta tiene su propio límite: 5 envíos por hora e IP.
 */
