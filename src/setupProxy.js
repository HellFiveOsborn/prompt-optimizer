import { createProxyMiddleware } from 'http-proxy-middleware';

export default function (app) {
    app.use(
        '/api/proxy',
        createProxyMiddleware({
            target: 'http://localhost', // Fallback, router overrides this
            changeOrigin: true,
            router: (req) => {
                // Dynamic target based on header
                // The client must send 'x-target-url' with the base endpoint
                const targetUrl = req.headers['x-target-url'];
                if (targetUrl) {
                    // Ensure we don't double up or miss protocol
                    try {
                        new URL(targetUrl); // Validate URL
                        return targetUrl;
                    } catch (e) {
                        console.error('Invalid target URL for proxy:', targetUrl);
                    }
                }
                return 'http://localhost';
            },
            pathRewrite: {
                '^/api/proxy': '', // Strip the /api/proxy prefix
            },
            onProxyRes: (proxyRes, req, res) => {
                // Ensure CORS headers are set for the browser to accept the response from localhost
                proxyRes.headers['Access-Control-Allow-Origin'] = '*';
                proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, PATCH, OPTIONS';
                proxyRes.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, x-target-url';
            },
            logger: console,
        })
    );
};