const API = {
    async get(endpoint, params = {}) {
        const url = new URL(`/api/${endpoint}`, window.location.origin);
        Object.entries(params).forEach(([k, v]) => {
            if (v !== undefined && v !== null && v !== '') {
                url.searchParams.set(k, v);
            }
        });
        const res = await fetch(url);
        if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
        return res.json();
    },

    overview(params) { return this.get('overview', params); },
    usage(params)    { return this.get('usage', params); },
    cache(params)    { return this.get('cache', params); },
    errors(params)   { return this.get('errors', params); },
    sessions(params) { return this.get('sessions', params); },
};
