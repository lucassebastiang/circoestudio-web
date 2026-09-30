/**
 * Generación estática desde el panel.
 * La web pública son ficheros HTML que sirve Nginx. Cuando se guarda algo en el
 * panel, la API vuelve a generar solo las páginas afectadas; los cambios
 * globales regeneran el sitio entero con un intercambio atómico.
 *
 * Fragmento recortado del código real.
 */
import { cp, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/* ---------- 1. Qué páginas toca cada cambio -------------------------------- */

export async function regenerateFor(entity: Entity, hint: Hint = {}) {
  if (entity === 'settings') return regenerateAll('settings'); // colores, datos de contacto…

  const data = await siteDataFromDb();
  const jobs = buildPages(data);
  const paths = new Set<string>();

  switch (entity) {
    case 'project':
      if (hint.slug) paths.add(`/proyectos/${hint.slug}/`);
      paths.add('/proyectos/');
      paths.add('/'); // "trabajo reciente" puede cambiar también al despublicar
      for (const s of hint.serviceSlugs ?? []) paths.add(`/servicios/${s}/`);
      break;
    case 'pricing':
      paths.add('/precios/');
      paths.add('/');
      break;
    case 'testimonial':
      paths.add('/');
      break;
    // …servicios, pagos y páginas legales siguen el mismo patrón
  }

  const res = await writePages(jobs.filter((j) => paths.has(j.path)), data);
  // el sitemap se rehace siempre, también con escritura atómica
  const tmp = join(SITE_DIR, 'sitemap.xml.tmp');
  await writeFile(tmp, renderSitemap(jobs, data));
  await rename(tmp, join(SITE_DIR, 'sitemap.xml'));

  await db.insert(regenLog).values({ tipo: 'selectiva', paginas: res.pages, ms: res.ms });
  return res;
}

/* ---------- 2. Regeneración completa sin dejar la web a medias ------------- */

/**
 * En Docker, la carpeta del sitio es un volumen montado: no se puede renombrar
 * ni escribir junto a ella. Por eso se construye DENTRO, en `.build-tmp`, y se
 * cambian las entradas una a una con renames, que son instantáneos.
 * Nginx nunca sirve una página a medio escribir.
 */
export async function writeSiteAtomic(jobs: PageJob[], data: SiteData) {
  const t0 = Date.now();
  const tmp = join(SITE_DIR, '.build-tmp');
  const old = join(SITE_DIR, '.build-old');
  await rm(tmp, { recursive: true, force: true });
  await rm(old, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });

  await cp(join(WEB_DIR, 'assets'), join(tmp, 'assets'), { recursive: true });
  // los colores de la marca se editan en el panel y se escriben como CSS
  await writeFile(join(tmp, 'assets/css/tokens.css'), await renderTokensCss(data.settings.tokens));

  for (const job of jobs) {
    const out = join(tmp, job.outFile);
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, await renderPage(job, data));
  }
  await writeFile(join(tmp, 'sitemap.xml'), renderSitemap(jobs, data));
  await writeFile(join(tmp, 'robots.txt'), renderRobots());
  await writeFile(join(tmp, 'rss.xml'), renderRss(data));

  // intercambio: se aparta cada entrada vieja y se pone la nueva
  await mkdir(old, { recursive: true });
  const fresh = await readdir(tmp);
  for (const name of fresh) {
    const target = join(SITE_DIR, name);
    try {
      await rename(target, join(old, name));
    } catch {
      /* la entrada aún no existía */
    }
    await rename(join(tmp, name), target);
  }
  // limpieza: páginas que ya no existen y carpetas temporales
  for (const name of await readdir(SITE_DIR)) {
    if (name === '.build-tmp' || name === '.build-old') continue;
    if (!fresh.includes(name)) await rm(join(SITE_DIR, name), { recursive: true, force: true });
  }
  await rm(tmp, { recursive: true, force: true });
  await rm(old, { recursive: true, force: true });

  return { pages: jobs.length, ms: Date.now() - t0 };
}

/* ---------- 3. CSS en línea por página ------------------------------------- */

/**
 * Cada página lleva su CSS dentro del HTML: tokens + base + componentes + el de
 * la página. Cero hojas de estilo que bloqueen el pintado.
 */
async function inlineCssFor(pageCss: string[] | undefined, tokens: Record<string, string>) {
  const files = ['base.css', 'components.css', ...(pageCss ?? []).map((c) => `pages/${c}.css`)];
  const key = files.join('|');
  let rest = cssCache.get(key);
  if (rest === undefined) {
    const parts = await Promise.all(files.map((f) => readFile(join(WEB_DIR, 'assets/css', f), 'utf8')));
    rest = parts.join('\n');
    cssCache.set(key, rest);
  }
  return (await renderTokensCss(tokens)) + '\n' + rest;
}
