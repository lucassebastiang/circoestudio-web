/**
 * 2FA con TOTP (Google Authenticator y compatibles) y códigos de recuperación
 * de un solo uso. Lo usan el panel de administración y el portal de clientes.
 *
 * Fragmento recortado del código real: primero las utilidades, después cómo
 * se engancha al inicio de sesión.
 */
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';

const RECOVERY_CODES_COUNT = 8;

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

/** El QR va como data-URI: nada de servicios externos, lo exige la CSP del panel. */
export async function totpQrDataUri(email: string, secret: string): Promise<string> {
  const uri = authenticator.keyuri(email, 'circo estudio', secret);
  return QRCode.toDataURL(uri, { margin: 1, width: 220 });
}

export function verifyTotpToken(token: string, secret: string): boolean {
  try {
    return authenticator.verify({ token: token.replace(/\s/g, ''), secret });
  } catch {
    return false;
  }
}

/** Códigos de recuperación: se enseñan una vez en claro y solo se guarda su hash argon2id. */
export async function generateRecoveryCodes(): Promise<{ plain: string[]; hashed: string[] }> {
  const plain = Array.from({ length: RECOVERY_CODES_COUNT }, () =>
    randomBytes(5).toString('hex').match(/.{1,5}/g)!.join('-'),
  );
  const hashed = await Promise.all(plain.map((c) => argon2.hash(c, { type: argon2.argon2id })));
  return { plain, hashed };
}

/** Si el código coincide, devuelve la lista sin él (cada código sirve una sola vez). */
export async function consumeRecoveryCode(code: string, hashed: string[]): Promise<string[] | null> {
  const normalized = code.trim().toLowerCase();
  for (let i = 0; i < hashed.length; i++) {
    if (await argon2.verify(hashed[i]!, normalized)) {
      return [...hashed.slice(0, i), ...hashed.slice(i + 1)];
    }
  }
  return null;
}

/* ------------------------------------------------------------------------
 * Cómo se usa en el inicio de sesión (Fastify, recortado):
 *
 * 1. POST /admin/login  (límite: 5 intentos cada 15 min por IP)
 *    - contraseña verificada con argon2
 *    - si el usuario tiene 2FA, la sesión nace con `pending2fa = true`
 *
 * 2. Un hook protege todo /admin/*: con `pending2fa` solo se puede ir a la
 *    pantalla del código o salir.
 */
app.addHook('onRequest', async (req, reply) => {
  if (!req.url.startsWith('/admin') || req.url.startsWith('/admin/login')) return;
  const user = await getSessionUser(req);
  if (!user) return reply.redirect('/admin/login', 303);
  req.adminUser = user;
  if (user.pending2fa && !req.url.startsWith('/admin/2fa') && !req.url.startsWith('/admin/logout')) {
    return reply.redirect('/admin/2fa', 303);
  }
  // primer inicio de sesión: obliga a cambiar la contraseña
  if (user.mustChangePassword && !req.url.startsWith('/admin/password') && !req.url.startsWith('/admin/logout')) {
    return reply.redirect('/admin/password', 303);
  }
});

/*
 * 3. POST /admin/2fa  (límite: 8 intentos cada 15 min)
 *    - vale un código TOTP o un código de recuperación, que se consume
 *    - si es correcto, se quita `pending2fa` de la sesión
 */
app.post('/admin/2fa', { config: { rateLimit: { max: 8, timeWindow: '15 minutes' } } }, async (req, reply) => {
  const user = await getSessionUser(req);
  if (!user) return reply.redirect('/admin/login', 303);
  if (!user.pending2fa) return reply.redirect('/admin', 303);

  const code = String((req.body as Record<string, string>).code ?? '').trim();
  const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!row) return reply.redirect('/admin/login', 303);

  let ok = row.totpSecret ? verifyTotpToken(code, row.totpSecret) : false;
  if (!ok) {
    const remaining = await consumeRecoveryCode(code, row.totpRecoveryCodes);
    if (remaining) {
      ok = true;
      await db.update(users).set({ totpRecoveryCodes: remaining }).where(eq(users.id, user.id));
    }
  }
  if (!ok) return reply.redirect('/admin/2fa?err=' + encodeURIComponent('Código no válido'), 303);

  await clearPending2fa(user.sessionId);
  return reply.redirect(row.mustChangePassword ? '/admin/password' : '/admin', 303);
});
