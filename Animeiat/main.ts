(function() {
    const API = manifest.baseUrl;
    const SITE = "https://www.animeiat.tv";

    function decodeBase64(str: string): string { try { return atob(str); } catch { return str; } }

    async function getHome(cb: (r: any) => void) {
        const categories: Record<string, string> = {
            "حلقات مثبتة": "/home/sticky-episodes",
            "يعرض حاليا": "/home/currently-airing-animes",
            "مكتمل": "/home/completed-animes"
        };
        const data: Record<string, any[]> = {};

        for (const [name, path] of Object.entries(categories)) {
            try {
                const json = await (await fetch(API + path)).json();
                const items = (json.data || []).map((it: any) => {
                    const type = it.type === "movie" ? "anime" : "anime";
                    return new MultimediaItem({
                        title: it.name || "", url: `${SITE}/anime/${it.slug}`,
                        posterUrl: it.poster?.url || "", type, status: it.episodes ? "ongoing" : "completed"
                    });
                });
                if (items.length) data[name] = items;
            } catch (e) { console.error("Animeiat getHome error:", e); }
        }
        cb({ success: true, data });
    }

    async function search(query: string, cb: (r: any) => void) {
        try {
            const json = await (await fetch(`${API}/anime?search=${encodeURIComponent(query)}`)).json();
            const items = (json.data || []).map((it: any) => new MultimediaItem({
                title: it.name || "", url: `${SITE}/anime/${it.slug}`,
                posterUrl: it.poster?.url || "", type: "anime"
            }));
            cb({ success: true, data: items });
        } catch (e) { cb({ success: false, errorCode: "FETCH_ERROR", message: String(e) }); }
    }

    async function load(url: string, cb: (r: any) => void) {
        try {
            let slug = url.substringAfter("/anime/").substringAfter("/watch/");
            const epMatch = slug.match(/(.*)-episode-\d+$/);
            if (epMatch) slug = epMatch[1];

            const animeJson = await (await fetch(`${API}/anime/${slug}`)).json();
            const anime = animeJson.data;
            if (!anime) return cb({ success: false, errorCode: "NOT_FOUND" });

            const episodesJson = await (await fetch(`${API}/anime/${anime.id}/episodes`)).json();
            const episodes = (episodesJson.data || []).map((it: any) => new Episode({
                name: it.title || "", url: `${SITE}/watch/${anime.slug}-episode-${it.number}`,
                episode: it.number, posterUrl: it.poster?.url
            }));

            cb({ success: true, data: new MultimediaItem({
                title: anime.name || "", url, posterUrl: anime.poster?.url || "",
                type: anime.type === "movie" ? "anime" : "anime",
                plot: anime.synopsis || "", tags: (anime.genres || []).map((g: any) => g.name),
                status: anime.status === "finished_airing" ? "completed" : "ongoing", episodes
            })});
        } catch (e) { cb({ success: false, errorCode: "LOAD_ERROR", message: String(e) }); }
    }

    async function loadStreams(url: string, cb: (r: any) => void) {
        try {
            const payloadUrl = url.endsWith("/_payload.json") ? url : url + "/_payload.json";
            const text = await (await fetch(payloadUrl)).text();
            const rawJson = JSON.parse(text);

            function findVideo(obj: any): string | null {
                if (!obj || typeof obj === "string") return null;
                if (Array.isArray(obj)) { for (const item of obj) { const r = findVideo(item); if (r) return r; } return null; }
                if (typeof obj === "object") {
                    for (const [k, v] of Object.entries(obj)) {
                        if (typeof v === "string" && (v.includes(".mp4") || v.includes(".m3u8"))) return decodeBase64(v) || v;
                        if (typeof v === "object") { const r = findVideo(v); if (r) return r; }
                    }
                }
                return null;
            }

            const videoUrl = findVideo(rawJson);
            if (videoUrl) {
                cb({ success: true, data: [new StreamResult({ url: videoUrl, headers: { Referer: SITE } })] });
            } else {
                cb({ success: true, data: [] });
            }
        } catch (e) { cb({ success: false, errorCode: "STREAM_ERROR", message: String(e) }); }
    }

    String.prototype.substringAfter = function(search: string) { const i = this.indexOf(search); return i >= 0 ? this.substring(i + search.length) : this; };
    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
