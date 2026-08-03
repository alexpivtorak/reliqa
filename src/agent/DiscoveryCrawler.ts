import { BrowserController } from './BrowserController.js';

export interface DiscoveredNode {
    id: string;
    title: string;
    url: string;
    isActive: boolean;
    interactives: string[];
    customAssertion: string;
    x: number;
    y: number;
}

export interface DiscoveredEdge {
    from: string;
    to: string;
    action: string;
}

/** Local Next.js / Vite apps are usually HTTP. HTTPS on localhost often causes ERR_SSL_PROTOCOL_ERROR. */
export function normalizeCrawlUrl(rawUrl: string): { url: string; rewritten: boolean } {
    try {
        const parsed = new URL(rawUrl);
        const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
        if (isLocal && parsed.protocol === 'https:') {
            parsed.protocol = 'http:';
            return { url: parsed.toString(), rewritten: true };
        }
    } catch {
        // keep original
    }
    return { url: rawUrl, rewritten: false };
}

const MAX_SELECTORS_PER_NODE = 12;

/**
 * Turns a distilled element into a selector the test plan can rely on.
 * Ranked so the sturdiest selectors survive the cap, and elements with no
 * stable handle are dropped instead of padding the list with bare tag names.
 */
function toRankedSelector(el: any): { selector: string; rank: number } | null {
    if (el.s) return { selector: el.s, rank: 0 };
    if (el.dt && el.da) return { selector: `[${el.da}='${el.dt}']`, rank: 0 };
    if (el.id) return { selector: `#${el.id}`, rank: 1 };

    const text = typeof el.txt === 'string' ? el.txt.trim() : '';
    const isTextTarget = el.t === 'a' || el.t === 'button';
    if (isTextTarget && text && text.length <= 30 && !text.includes("'")) {
        return { selector: `${el.t}:has-text('${text}')`, rank: 2 };
    }

    return null;
}

export class DiscoveryCrawler {
    async discover(
        url: string, 
        maxDepth: number = 3,
        onEvent?: (event: { type: 'log' | 'node' | 'edge'; data: any }) => void
    ): Promise<{ nodes: DiscoveredNode[], edges: DiscoveredEdge[] }> {
        const browser = new BrowserController();
        const nodes: DiscoveredNode[] = [];
        const edges: DiscoveredEdge[] = [];
        const visitedUrls = new Set<string>();

        try {
            const normalized = normalizeCrawlUrl(url);
            if (normalized.rewritten) {
                const rewriteMsg = `↪️ Rewrote HTTPS localhost URL to HTTP: ${normalized.url}`;
                console.log(rewriteMsg);
                onEvent?.({ type: 'log', data: rewriteMsg });
            }
            url = normalized.url;

            const startMsg = `🔍 DiscoveryCrawler launching on: ${url} (Max Depth: ${maxDepth})`;
            console.log(startMsg);
            onEvent?.({ type: 'log', data: startMsg });

            await browser.launch(true); // run headless for speed
            await browser.startSession('crawl');
            
            // Queue for BFS traversal
            const queue: { url: string; depth: number; parentId?: string }[] = [{ url, depth: 0 }];
            let nodeIdCounter = 1;

            const targetHost = new URL(url).host;

            while (queue.length > 0 && nodes.length < 8) {
                const current = queue.shift()!;
                
                // Normalize and validate URL host matching
                let normalizedUrl = current.url;
                try {
                    const parsed = new URL(current.url);
                    if (parsed.host !== targetHost) continue;
                    normalizedUrl = parsed.pathname;
                } catch {
                    continue;
                }

                // Check if already visited URL path
                if (visitedUrls.has(normalizedUrl)) {
                    const existingNode = nodes.find(n => n.url === normalizedUrl);
                    if (existingNode && current.parentId) {
                        if (!edges.some(e => e.from === current.parentId && e.to === existingNode.id)) {
                            const newEdge = { from: current.parentId, to: existingNode.id, action: 'navigate' };
                            edges.push(newEdge);
                            onEvent?.({ type: 'edge', data: newEdge });
                        }
                    }
                    continue;
                }
                visitedUrls.add(normalizedUrl);

                const navMsg = `🕷️ Crawl: Navigating to ${current.url}`;
                console.log(navMsg);
                onEvent?.({ type: 'log', data: navMsg });

                try {
                    await browser.navigate(current.url);
                    await browser.page?.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
                } catch (err) {
                    const errStr = `Failed to navigate to ${current.url}: ${(err as Error).message}`;
                    console.warn(errStr);
                    onEvent?.({ type: 'log', data: `⚠️ ${errStr}` });
                    continue;
                }

                // Extract page properties
                const title = await browser.page?.title() || normalizedUrl;
                const contextStr = await browser.getPageContext();
                let interactives: string[] = [];

                if (contextStr === null) {
                    // A silent failure here produces a test plan full of invented selectors
                    const distillErr = `Could not read the DOM of ${normalizedUrl}. Selectors for this page will be missing.`;
                    console.warn(distillErr);
                    onEvent?.({ type: 'log', data: `⚠️ ${distillErr}` });
                } else {
                    try {
                        const parsedContext = JSON.parse(contextStr);
                        const ranked = (parsedContext.items || [])
                            .map(toRankedSelector)
                            .filter((entry: any): entry is { selector: string; rank: number } => entry !== null)
                            .sort((a: any, b: any) => a.rank - b.rank)
                            .map((entry: any) => entry.selector);

                        // Sort is stable, so DOM order still decides within a rank
                        interactives = [...new Set<string>(ranked)].slice(0, MAX_SELECTORS_PER_NODE);
                    } catch (err) {
                        const parseErr = `Could not parse page context for ${normalizedUrl}: ${(err as Error).message}`;
                        console.warn(parseErr);
                        onEvent?.({ type: 'log', data: `⚠️ ${parseErr}` });
                    }
                }

                const pageMsg = `📄 Crawled '${normalizedUrl}' - Found ${interactives.length} interactive fields (${interactives.join(', ') || 'none'}).`;
                onEvent?.({ type: 'log', data: pageMsg });

                const nodeId = (nodeIdCounter++).toString();
                
                // Position nodes automatically inside layout grid
                const depthOffset = current.depth * 170;
                const siblingIndex = nodes.filter(n => n.x === depthOffset).length;
                const yPosition = 120 + (siblingIndex * 80);

                const node: DiscoveredNode = {
                    id: nodeId,
                    title: title || `Page ${normalizedUrl}`,
                    url: normalizedUrl,
                    isActive: true,
                    interactives,
                    customAssertion: `Verify page loads successfully and interactive elements are visible.`,
                    x: 50 + depthOffset,
                    y: yPosition
                };

                nodes.push(node);
                onEvent?.({ type: 'node', data: node });

                if (current.parentId) {
                    const newEdge = { from: current.parentId, to: nodeId, action: 'click link' };
                    edges.push(newEdge);
                    onEvent?.({ type: 'edge', data: newEdge });
                }

                // Find outbound page links
                if (current.depth < maxDepth) {
                    const links = await browser.page?.evaluate(() => {
                        return Array.from(document.querySelectorAll('a'))
                            .map(a => a.href)
                            .filter(href => href && href.startsWith('http'));
                    }) || [];

                    for (const link of links) {
                        queue.push({ url: link, depth: current.depth + 1, parentId: nodeId });
                    }
                }
            }
        } catch (err) {
            const errStr = `Crawl process encountered error: ${(err as Error).message}`;
            console.error(errStr);
            onEvent?.({ type: 'log', data: `❌ ${errStr}` });
        } finally {
            await browser.closeSession().catch(() => {});
            await browser.cleanup().catch(() => {});
        }

        return { nodes, edges };
    }
}
