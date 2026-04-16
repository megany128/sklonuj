// Evaluated once at module load (i.e. when the worker boots after a deploy),
// so it reflects the current deployment's build/boot date rather than lying
// that every page changes on every request.
const lastmod = new Date().toISOString().split('T')[0];

export function GET() {
	const pages = [
		{ url: 'https://sklonuj.com', priority: '1.0', changefreq: 'weekly' },
		{ url: 'https://sklonuj.com/resources', priority: '0.8', changefreq: 'monthly' },
		{ url: 'https://sklonuj.com/resources/czech-cases', priority: '0.8', changefreq: 'monthly' },
		{ url: 'https://sklonuj.com/resources/paradigms', priority: '0.8', changefreq: 'monthly' },
		{ url: 'https://sklonuj.com/resources/pronouns', priority: '0.7', changefreq: 'monthly' },
		{ url: 'https://sklonuj.com/resources/tips', priority: '0.7', changefreq: 'monthly' },
		{ url: 'https://sklonuj.com/privacy', priority: '0.2', changefreq: 'yearly' },
		{ url: 'https://sklonuj.com/contact', priority: '0.3', changefreq: 'monthly' }
	];

	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
	.map(
		(p) => `  <url>
    <loc>${p.url}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`
	)
	.join('\n')}
</urlset>`;

	return new Response(xml, {
		headers: {
			'Content-Type': 'application/xml',
			'Cache-Control': 'max-age=3600'
		}
	});
}
