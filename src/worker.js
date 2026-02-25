export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        // Serve area-page.html for /area/:code routes while keeping the browser URL intact.
        // This avoids Cloudflare's pretty-URL redirect behaviour that strips the postcode.
        if (/^\/area\/[^/]+\/?$/.test(url.pathname)) {
            return env.ASSETS.fetch(url.origin + '/area-page.html');
        }

        return env.ASSETS.fetch(request);
    }
};
