(function() {
    const BASE = manifest.baseUrl;
    const desktopUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

    function fixUrl(u: string): string {
        if (!u) return "";
        if (u.startsWith("http")) return u;
        if (u.startsWith("//")) return "https:" + u;
        if (u.startsWith("/")) return BASE + u;
        return BASE + "/" + u;
    }

    async function getHome(cb: (r: any) => void) {
        // hasMainPage = false in original - source is blocked by Cloudflare
        cb([]);
    }

    async function search(query: string, cb: (r: any) => void) {
        const url = BASE + "/?search=" + encodeURIComponent(query);
        try {
            const doc = await fetch(url, {
                headers: {
                    "User-Agent": desktopUA,
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "ar,en-US;q=0.9,en;q=0.8"
                }
            }).then(r => r.text()).then(html => new DOMParser().parseFromString(html, "text/html"));

            const items = doc.querySelectorAll(".content .item");
            const results: any[] = [];
            items.forEach(el => {
                const nameEl = el.querySelector(".name");
                const title = nameEl ? nameEl.textContent.trim() : "";
                const aEl = el.querySelector("a");
                const href = aEl ? fixUrl(aEl.getAttribute("href")) : "";
                const img = el.querySelector("img");
                const poster = img ? (img.getAttribute("data-original") || img.getAttribute("src") || "") : "";

                if (title && href) {
                    results.push(new MultimediaItem({
                        title, url: href, posterUrl: poster, type: "anime"
                    }));
                }
            });
            cb(results);
        } catch (e) {
            cb([]);
        }
    }

    async function load(url: string) {
        // Original throws ErrorLoadingException for load - blocked by Cloudflare
        throw new Error("This source is currently blocked by Cloudflare protection.");
    }

    async function loadStreams(url: string, cb: (r: any) => void) {
        const doc = await fetch(url, {
            headers: {
                "User-Agent": desktopUA,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "ar,en-US;q=0.9,en;q=0.8"
            }
        }).then(r => r.text()).then(html => new DOMParser().parseFromString(html, "text/html"));

        const streams: any[] = [];

        // Direct downloads
        doc.querySelectorAll("#download a.btn").forEach(a => {
            const link = a.getAttribute("href") || "";
            const qualityText = (a.textContent || "").replace(/[^0-9]/g, "");
            const quality = parseInt(qualityText) || 0;
            if (link) {
                streams.push(new StreamItem({
                    name: "Download " + (quality > 0 ? quality + "p" : ""),
                    url: link,
                    quality: quality > 0 ? quality.toString() : "unknown",
                    type: "video"
                }));
            }
        });

        // Streaming servers
        doc.querySelectorAll(".servers a[data-src]").forEach(a => {
            const link = a.getAttribute("data-src") || "";
            if (link) {
                streams.push(new StreamItem({
                    name: "Server",
                    url: link,
                    type: "video"
                }));
            }
        });

        cb(streams);
    }

    registerPlugin({
        getHome, search, load, loadStreams
    });
})();