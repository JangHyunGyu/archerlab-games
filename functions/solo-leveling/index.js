export async function onRequest(context) {
    const url = new URL(context.request.url);
    if (!['GET', 'HEAD'].includes(context.request.method) || url.searchParams.get('lang') !== 'en') {
        const response = await context.next();
        if (!url.hostname.endsWith('.pages.dev')) return response;
        const preview = new Response(response.body, response);
        preview.headers.set('X-Robots-Tag', 'noindex, follow');
        return preview;
    }
    url.pathname = '/solo-leveling/index-en';
    url.searchParams.delete('lang');
    // Old browsers may still cache index-en -> ?lang=en as a permanent redirect.
    // A distinct request key prevents that old response from creating a loop.
    if (!url.searchParams.has('_lang_entry')) url.searchParams.set('_lang_entry', '20261012');
    return Response.redirect(url.href, 301);
}
