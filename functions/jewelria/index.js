export async function onRequest(context) {
    const url = new URL(context.request.url);
    if (!['GET', 'HEAD'].includes(context.request.method) || url.searchParams.get('lang') !== 'en') {
        const response = await context.next();
        if (!url.hostname.endsWith('.pages.dev')) return response;
        const preview = new Response(response.body, response);
        preview.headers.set('X-Robots-Tag', 'noindex, follow');
        return preview;
    }
    url.pathname = '/jewelria/index-en';
    url.searchParams.delete('lang');
    return Response.redirect(url.href, 301);
}
