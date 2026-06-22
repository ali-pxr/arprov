(function() {
    const BASE = manifest.baseUrl;
    async function getHome(cb: (r: any) => void) { cb({ success: true, data: {} }); }
    async function search(query: string, cb: (r: any) => void) {
        try {
            const html = await fetch(`${BASE}/?s=${encodeURIComponent(query)}`).then(r => r.text());
            const doc = new DOMParser().parseFromString(html, "text/html");
            const items = Array.from(doc.querySelectorAll(".result-item > article")).map(el => {
                const titleEl = el.querySelector("div.thumbnail > a, img"); if (!titleEl) return null;
                const title = titleEl.getAttribute("alt") || titleEl.textContent || "";
                const href = el.querySelector("div.thumbnail > a")?.getAttribute("href") || "";
                return new MultimediaItem({ title, url: href, posterUrl: titleEl.getAttribute("src") || "", type: href.includes("/movies/") ? "movie" : "series" });
            }).filter(Boolean);
            cb({ success: true, data: items });
        } catch (e) { cb({ success: false, errorCode: "FETCH_ERROR", message: String(e) }); }
    async function load(url: string, cb: (r: any) => void) { cb({ success: false, errorCode: "BLOCKED", message: "This source is currently blocked by Cloudflare protection." }); }
    async function loadStreams(url: string, cb: (r: any) => void) {
        try {
            const html = await fetch(url).then(r => r.text());
            const doc = new DOMParser().parseFromString(html, "text/html");
            const streams: any[] = [];
            doc.querySelectorAll("li.vid_source_option:not([data-nume='trailer'])").forEach(async (source: any) => {
                try {
                    const resp = await fetch(`${BASE}/wp-admin/admin-ajax.php`, {
                        method: "POST", body: `action=doo_player_ajax&post=${source.getAttribute("data-post")}&nume=${source.getAttribute("data-nume")}&type=${source.getAttribute("data-type")}`
                    });
                    const rDoc = new DOMParser().parseFromString(await resp.text(), "text/html");
                    const iframeSrc = rDoc.querySelector("iframe")?.getAttribute("src") || "";
                    if (iframeSrc.includes("show.alfajertv.com")) {
                        const urlObj = new URL(iframeSrc);
                        streams.push(new StreamResult({ url: urlObj.search.replace(/&.*|source=/g, ""), quality: "Unknown" }));
                    } else if (iframeSrc.includes("fajer.live")) {
                        const id = iframeSrc.split("/v/")[1]?.split("/")[0];
                        const apiResp = await fetch(`https://${new URL(iframeSrc).host}/api/source/${id}`, { method: "POST", body: "r=&d=" + new URL(iframeSrc).host });
                        const fj = await apiResp.json();
                        for (const it of (fj.data || [])) {
                            if (it.file) streams.push(new StreamResult({ url: it.file, quality: (it.label || "").match(/\d+/)?.[0] || "Unknown" }));
                        }
                    } else { try { const r = await loadExtractor(iframeSrc); if (r?.length) streams.push(...r); } catch {} }
                } catch {}
            });
            cb({ success: true, data: streams });
        } catch (e) { cb({ success: false, errorCode: "STREAM_ERROR", message: String(e) }); }
    }
    globalThis.getHome = getHome; globalThis.search = search; globalThis.load = load; globalThis.loadStreams = loadStreams;
})();
