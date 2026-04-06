const API = {
    async get(endpoint, params = {}) {
        const url = new URL(`/api/${endpoint}`, window.location.origin);
        Object.entries(params).forEach(([k, v]) => {
            if (v !== undefined && v !== null && v !== '') {
                url.searchParams.set(k, v);
            }
        });
        const res = await fetch(url);
        if (res.status === 304) return null;
        if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
        return res.json();
    },

    stats(params)    { return this.get('stats', params); },
    usage(params)    { return this.get('usage', params); },
    sessions(params) { return this.get('sessions', params); },
    tools(params)    { return this.get('tools', params); },
    system(params)   { return this.get('system', params); },
};
