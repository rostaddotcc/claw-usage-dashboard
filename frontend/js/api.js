const API = {
    _cache: {},
    
    async get(endpoint, params = {}) {
        const url = new URL(`/api/${endpoint}`, window.location.origin);
        Object.entries(params).forEach(([k, v]) => {
            if (v !== undefined && v !== null && v !== '') {
                url.searchParams.set(k, v);
            }
        });
        
        const cacheKey = url.toString();
        
        try {
            const res = await fetch(url);
            
            // On 304, return cached data if available
            if (res.status === 304) {
                return this._cache[cacheKey] || {};
            }
            
            if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
            
            const data = await res.json();
            
            // Cache the successful response
            this._cache[cacheKey] = data;
            
            return data;
        } catch (err) {
            // On error, return cached data if available, otherwise empty object
            console.error(`API error for ${endpoint}:`, err);
            return this._cache[cacheKey] || {};
        }
    },

    stats(params)    { return this.get('stats', params); },
    usage(params)    { return this.get('usage', params); },
    sessions(params) { return this.get('sessions', params); },
    tools(params)    { return this.get('tools', params); },
    system(params)   { return this.get('system', params); },
};
