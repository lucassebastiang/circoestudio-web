# Fragmentos

Trozos del código real de circoestudio.com, **recortados** para que se entiendan solos. No son el proyecto completo y no compilan por separado: faltan imports internos, el esquema de la base de datos y la configuración.

No contienen ningún valor del sistema real: los secretos se leen de variables de entorno y en la CSP de Nginx los dominios externos y los hashes se han sustituido por marcadores.

| Fichero | Qué enseña |
|---|---|
| [antispam.ts](antispam.ts) | Heurística del formulario de contacto: marca el spam, no lo descarta |
| [captcha-hmac.ts](captcha-hmac.ts) | Captcha propio sin sesión ni servicios externos, firmado con HMAC |
| [2fa-totp.ts](2fa-totp.ts) | 2FA con TOTP, códigos de recuperación con argon2id y cómo se engancha al inicio de sesión |
| [generacion-estatica.ts](generacion-estatica.ts) | Regeneración selectiva desde el panel e intercambio atómico del sitio |
| [nginx-sitio.conf](nginx-sitio.conf) | Cabeceras de seguridad, redirecciones del WordPress antiguo y los únicos dos puntos dinámicos |
