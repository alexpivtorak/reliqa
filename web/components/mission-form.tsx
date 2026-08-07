"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { ReactFlow, ReactFlowProvider, Background, Controls, Position, Handle } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ChaosControlPanel, ChaosProfile } from "@/components/chaos-control";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import {
    Compass,
    Activity,
    ListTodo,
    Sparkles,
    Keyboard,
} from "lucide-react";
import { apiFetch, UnauthorizedError } from "@/lib/api";
import { useRouter } from "next/navigation";

interface StateNode {
    id: string;
    title: string;
    url: string;
    isActive: boolean;
    interactives: string[];
    customAssertion: string;
    x: number;
    y: number;
}

interface TestFlowProposal {
    id: string;
    name: string;
    description: string;
    steps: { name: string; goal: string }[];
    generatedGoalPrompt: string;
}

export interface MissionFormValues {
    url: string;
    model: string;
    goal: string;
    isChaos: boolean;
    chaosProfile: ChaosProfile | null;
    headless: boolean;
    disableCache: boolean;
}

interface MissionFormProps {
    initialValues?: Partial<MissionFormValues>;
    submitLabel?: string;
    onLaunched?: (runId: number) => void;
}

const DEFAULT_GOAL = `GOAL: Complete the Checkout Flow.
CRITICAL RULE: DO NOT EMIT 'DONE' UNTIL YOU SEE THE TEXT "THANK YOU FOR YOUR ORDER".
IF YOU EMIT 'DONE' BEFORE THAT, YOU FAIL.

PHASE 1: INVENTORY & CART
1. Login with "standard_user" / "secret_sauce".
2. Add "Sauce Labs Backpack".
3. Add "Sauce Labs Bike Light".
4. Click Shopping Cart Icon.
5. Click "Checkout".

PHASE 2: DATA ENTRY (MANDATORY)
6. INSPECT "First Name" field. IF EMPTY -> TYPE "Reli".
7. INSPECT "Last Name" field. IF EMPTY -> TYPE "QA".
8. INSPECT "Zip" field. IF EMPTY -> TYPE "90210".
(Do not assume these are filled. Look at the pixels.)

PHASE 3: FINISH
9. Click "Continue".
10. Click "Finish".
11. VERIFY "Thank you for your order" is visible.
12. ONLY NOW -> Emit "Done".`;

const CustomSitemapNode = ({ data }: any) => {
    return (
        <div className={`w-44 border p-2.5 rounded-lg bg-zinc-950 text-zinc-100 shadow-md transition-all ${data.isActive ? 'border-purple-500/50' : 'border-muted opacity-40'}`}>
            <Handle type="target" position={Position.Left} className="w-2.5 h-2.5 !bg-purple-500" />
            <div className="flex justify-between items-center mb-1.5 gap-1">
                <span className="text-[10px] font-mono text-zinc-400 truncate min-w-0 flex-1">
                    {data.url}
                </span>
                <input
                    type="checkbox"
                    checked={data.isActive}
                    onChange={(e) => {
                        e.stopPropagation();
                        data.onToggle(data.id);
                    }}
                    className="w-3.5 h-3.5 accent-purple-500 cursor-pointer shrink-0"
                    aria-label={`Toggle ${data.title}`}
                />
            </div>
            <h4 className="text-xs font-bold truncate">{data.title}</h4>
            <div className="flex justify-between items-center mt-2 gap-1">
                <span className="text-[10px] text-purple-400">
                    {data.interactives?.length || 0} fields
                </span>
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        data.onEdit(data.id);
                    }}
                    className="text-[10px] bg-purple-500/15 hover:bg-purple-500/30 text-purple-300 px-1.5 py-0.5 rounded font-mono"
                >
                    EDIT
                </button>
            </div>
            <Handle type="source" position={Position.Right} className="w-2.5 h-2.5 !bg-purple-500" />
        </div>
    );
};

const nodeTypes = { sitemapNode: CustomSitemapNode };

export function MissionForm({
    initialValues,
    submitLabel = "🚀 Launch Mission",
    onLaunched,
}: MissionFormProps) {
    const router = useRouter();
    const [url, setUrl] = useState(initialValues?.url ?? "https://saucedemo.com");
    const [model, setModel] = useState(initialValues?.model ?? "gemini-2.5-flash");
    const [strategy, setStrategy] = useState<"manual" | "autonomous">("manual");

    const [depth] = useState(3);
    const [isCrawling, setIsCrawling] = useState(false);
    const [progress, setProgress] = useState(0);
    const [logs, setLogs] = useState<string[]>([]);
    const logsContainerRef = useRef<HTMLDivElement>(null);
    const [showSitemap, setShowSitemap] = useState(false);
    const [selectedNode, setSelectedNode] = useState<StateNode | null>(null);
    const [showNodeDialog, setShowNodeDialog] = useState(false);

    const [sitemapEdges, setSitemapEdges] = useState<{ from: string; to: string; action: string }[]>([
        { from: "1", to: "2", action: "click login" },
        { from: "2", to: "3", action: "click cart" },
        { from: "3", to: "4", action: "click checkout" },
        { from: "3", to: "5", action: "click checkout overview" },
        { from: "4", to: "6", action: "finish checkout" },
        { from: "5", to: "6", action: "finish checkout" }
    ]);
    const [jsonText, setJsonText] = useState("");
    const [jsonError, setJsonError] = useState<string | null>(null);

    const [nodes, setNodes] = useState<StateNode[]>([
        {
            id: "1",
            title: "Login Screen",
            url: "/",
            isActive: true,
            interactives: ["#user-name", "#password", "#login-button"],
            customAssertion: "Verify standard login fields exist and form inputs are visible.",
            x: 50,
            y: 120,
        },
        {
            id: "2",
            title: "Inventory Dashboard",
            url: "/inventory.html",
            isActive: true,
            interactives: [".inventory_item", ".btn_primary", ".shopping_cart_link"],
            customAssertion: "Ensure at least 6 products are displayed on page.",
            x: 220,
            y: 120,
        },
        {
            id: "3",
            title: "Cart Overview",
            url: "/cart.html",
            isActive: true,
            interactives: [".cart_item", "#checkout", "#continue-shopping"],
            customAssertion: "Ensure cart list shows exact items added in previous state.",
            x: 390,
            y: 120,
        },
        {
            id: "4",
            title: "Checkout Info Entry",
            url: "/checkout-step-one.html",
            isActive: true,
            interactives: ["#first-name", "#last-name", "#postal-code", "#continue"],
            customAssertion: "Validate that ZIP code input is numerical only.",
            x: 560,
            y: 40,
        },
        {
            id: "5",
            title: "Checkout Overview",
            url: "/checkout-step-two.html",
            isActive: true,
            interactives: ["#finish", "#cancel", ".summary_total_label"],
            customAssertion: "Check that Total matches Sum of items + Tax.",
            x: 560,
            y: 200,
        },
        {
            id: "6",
            title: "Checkout Complete",
            url: "/checkout-complete.html",
            isActive: true,
            interactives: ["#back-to-products"],
            customAssertion: "Ensure success message 'THANK YOU FOR YOUR ORDER' is visible.",
            x: 730,
            y: 120,
        },
    ]);

    const [flows, setFlows] = useState<TestFlowProposal[]>([
        {
            id: "sauce-flow",
            name: "Standard Checkout E2E",
            description: "Primary purchase flow covering items selection, cart inspection, data input, and checkout receipt.",
            steps: [
                { name: "Login Step", goal: "Log in with standard user credentials." },
                { name: "Add to Cart", goal: "Select the first product and click Add to Cart." },
                { name: "Verify Cart", goal: "Navigate to shopping cart and ensure item displays." },
                { name: "Data Entry", goal: "Input first name, last name, and ZIP code." },
                { name: "Purchase Finish", goal: "Click Finish and verify complete ordering screen." }
            ],
            generatedGoalPrompt: `GOAL: Complete the Checkout Flow.
CRITICAL RULE: DO NOT EMIT 'DONE' UNTIL YOU SEE THE TEXT "THANK YOU FOR YOUR ORDER".
IF YOU EMIT 'DONE' BEFORE THAT, YOU FAIL.

PHASE 1: INVENTORY & CART
1. Login with "standard_user" / "secret_sauce".
2. Add "Sauce Labs Backpack" to cart.
3. Click Shopping Cart Icon.
4. Click "Checkout".

PHASE 2: DATA ENTRY (MANDATORY)
5. Type "Reli" in First Name field.
6. Type "QA" in Last Name field.
7. Type "90210" in Zip field.

PHASE 3: FINISH
8. Click "Continue".
9. Click "Finish".
10. VERIFY "Thank you for your order" text is visible on the screen.
11. ONLY THEN -> Emit "Done".`
        },
        {
            id: "chaos-fuzz",
            name: "Chaos input Fuzzing",
            description: "Chaos Stress test injecting nasty strings (SQLi, buffer overflows) on form pages to find crashes.",
            steps: [
                { name: "Navigate to Login", goal: "Go to login." },
                { name: "Fuzz Username", goal: "Inject SQL payloads into username field." },
                { name: "Fuzz Checkout Info", goal: "Inject special characters inside checkout forms." }
            ],
            generatedGoalPrompt: `GOAL: Stress-test inputs using fuzzed strings to identify potential validation crashes.

PHASE 1: AUTH FUZZ
1. Go to Login screen.
2. In the Username field, inject the SQL syntax: ' OR 1=1--.
3. Attempt submit. Verify the page displays an error rather than breaking or logging in.

PHASE 2: CHECKOUT FUZZ
4. Go to Checkout screen.
5. In First Name, inject a buffer payload of 1000 'A' characters.
6. In Postal Code, inject HTML payload: <script>alert(1)</script>.
7. Click Continue. Ensure server handles input validation gracefully without throwing a 500 error.`
        }
    ]);

    const [activeFlowId, setActiveFlowId] = useState("sauce-flow");
    const [isGeneratingGoal, setIsGeneratingGoal] = useState(false);
    const [goal, setGoal] = useState(initialValues?.goal ?? DEFAULT_GOAL);
    const [isChaos, setIsChaos] = useState(initialValues?.isChaos ?? false);
    const [chaosProfile, setChaosProfile] = useState<ChaosProfile | null>(
        initialValues?.chaosProfile ?? null
    );
    const [isLoading, setIsLoading] = useState(false);
    const [headless, setHeadless] = useState(initialValues?.headless ?? true);
    const [disableCache, setDisableCache] = useState(initialValues?.disableCache ?? false);

    const isUpdatingFromJson = useRef(false);

    useEffect(() => {
        if (isUpdatingFromJson.current) return;
        try {
            const currentGraph = {
                nodes: nodes.map(n => ({
                    id: n.id,
                    title: n.title,
                    url: n.url,
                    isActive: n.isActive,
                    interactives: n.interactives,
                    customAssertion: n.customAssertion,
                    x: n.x,
                    y: n.y
                })),
                edges: sitemapEdges
            };
            setJsonText(JSON.stringify(currentGraph, null, 2));
            setJsonError(null);
        } catch (err) {
            console.error("Failed to serialize sitemap graph:", err);
        }
    }, [nodes, sitemapEdges]);

    useEffect(() => {
        const container = logsContainerRef.current;
        if (!container) return;
        container.scrollTop = container.scrollHeight;
    }, [logs]);

    const handleJsonChange = (val: string) => {
        setJsonText(val);
        try {
            const parsed = JSON.parse(val);
            if (parsed.nodes && Array.isArray(parsed.nodes)) {
                const validatedNodes = parsed.nodes.map((n: any, idx: number) => ({
                    id: n.id || (idx + 1).toString(),
                    title: n.title || "Untitled",
                    url: n.url || "/",
                    isActive: typeof n.isActive === "boolean" ? n.isActive : true,
                    interactives: Array.isArray(n.interactives) ? n.interactives : [],
                    customAssertion: n.customAssertion || "",
                    x: typeof n.x === "number" ? n.x : 50 + (idx * 170),
                    y: typeof n.y === "number" ? n.y : 120
                }));
                isUpdatingFromJson.current = true;
                setNodes(validatedNodes);
                Promise.resolve().then(() => { isUpdatingFromJson.current = false; });
                setJsonError(null);
            }
            if (parsed.edges && Array.isArray(parsed.edges)) {
                setSitemapEdges(parsed.edges);
            }
        } catch (err: any) {
            setJsonError(err.message);
        }
    };

    const startDiscovery = async () => {
        let crawlUrl = url.trim();
        try {
            const parsed = new URL(crawlUrl);
            const isLocal = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
            if (isLocal && parsed.protocol === "https:") {
                parsed.protocol = "http:";
                crawlUrl = parsed.toString();
                setUrl(crawlUrl);
            }
        } catch {
            // keep as typed; server will report errors
        }

        setIsCrawling(true);
        setProgress(5);
        setLogs([`🔍 Opening SSE connection to trigger crawler for: ${crawlUrl}`]);
        setShowSitemap(false);
        setNodes([]);
        setSitemapEdges([]);

        const encodedUrl = encodeURIComponent(crawlUrl);
        const sseUrl = `/api/crawl-stream?url=${encodedUrl}&depth=${depth}`;
        const eventSource = new EventSource(sseUrl);

        const activeNodesList: any[] = [];
        let settled = false;

        const finishWithFailure = (message: string) => {
            if (settled) return;
            settled = true;
            eventSource.close();
            setIsCrawling(false);
            setProgress(100);
            setShowSitemap(false);
            setLogs((prev) => [...prev, `❌ ${message}`]);
            setGoal(`GOAL: Crawl failed. ${message}`);
        };

        eventSource.addEventListener("log", (e) => {
            try {
                const logMsg = JSON.parse(e.data);
                setLogs((prev) => [...prev, logMsg]);
                setProgress((prev) => Math.min(prev + 5, 95));
            } catch (err) {
                console.error("Failed to parse log SSE:", err);
            }
        });

        eventSource.addEventListener("node", (e) => {
            try {
                const discoveredNode = JSON.parse(e.data);
                activeNodesList.push(discoveredNode);
                setNodes((prev) => [...prev, discoveredNode]);
            } catch (err) {
                console.error("Failed to parse node SSE:", err);
            }
        });

        eventSource.addEventListener("edge", (e) => {
            try {
                const discoveredEdge = JSON.parse(e.data);
                setSitemapEdges((prev) => [...prev, discoveredEdge]);
            } catch (err) {
                console.error("Failed to parse edge SSE:", err);
            }
        });

        eventSource.addEventListener("error", (e) => {
            try {
                const payload = JSON.parse((e as MessageEvent).data);
                finishWithFailure(payload.error || "Crawl failed with an unknown error.");
            } catch {
                finishWithFailure("Crawl failed with an unknown error.");
            }
        });

        eventSource.addEventListener("complete", () => {
            if (settled) return;
            settled = true;
            eventSource.close();
            setProgress(100);
            setIsCrawling(false);

            if (activeNodesList.length === 0) {
                setShowSitemap(false);
                setLogs((prev) => [
                    ...prev,
                    "❌ Discovery finished with 0 pages. Use http:// for local apps (not https://) and confirm the site is up."
                ]);
                setGoal("GOAL: Crawl found 0 pages. Fix the Target URL and scan again.");
                return;
            }

            setLogs((prev) => [...prev, `🎉 Discovery completed successfully! Discovered ${activeNodesList.length} page states.`]);

            const stepsList = activeNodesList.map((n: any, idx: number) => ({
                name: `Step ${idx + 1}: ${n.title}`,
                goal: `Navigate to ${n.url} and verify assertions.`
            }));

            const generatedE2EPrompt = `GOAL: Validate the user flow on ${crawlUrl}.

PHASE 1: NAVIGATION & ACTIONS
${activeNodesList.map((n: any, idx: number) => {
    let step = `${idx + 1}. Go to page "${n.title}" (${n.url}).\n`;
    if (n.interactives && n.interactives.length > 0) {
        step += `   - Inspect elements: ${n.interactives.slice(0, 3).join(', ')}\n`;
    }
    return step;
}).join('\n')}
PHASE 2: VERIFICATION
${activeNodesList.map((n: any) => `On page "${n.title}", ensure: ${n.customAssertion}`).join('\n')}

PHASE 3: COMPLETE
${activeNodesList.length + 1}. Once all active nodes are successfully verified, emit "Done".`;

            setFlows([
                {
                    id: "crawled-e2e",
                    name: "Discovered Sitemap E2E Plan",
                    description: `Automated test covering the ${activeNodesList.length} crawled pages.`,
                    steps: stepsList,
                    generatedGoalPrompt: generatedE2EPrompt
                },
                {
                    id: "chaos-fuzz",
                    name: "Chaos Input Fuzzing",
                    description: "Fuzz input forms and inputs detected on crawled pages.",
                    steps: stepsList.slice(0, 3),
                    generatedGoalPrompt: `GOAL: Fuzz interactive forms discovered during crawling on ${crawlUrl}.\n\n` +
                        activeNodesList.slice(0, 3).map((n: any, idx: number) => {
                            if (n.interactives && n.interactives.length > 0) {
                                return `${idx + 1}. Go to "${n.title}" and inject SQL/XSS payloads into fields: ${n.interactives.slice(0, 2).join(', ')}`;
                            }
                            return `${idx + 1}. Navigate to "${n.title}" (${n.url}).`;
                        }).join('\n') + `\n\nEnsure no raw exception trace or 500 error is thrown.`
                }
            ]);
            setActiveFlowId("crawled-e2e");
            setShowSitemap(true);
        });

        eventSource.onerror = () => {
            if (settled) return;
            finishWithFailure(
                "Lost connection to the crawl API. Is the API server running?"
            );
        };
    };

    const handleGenerateGoal = async () => {
        setIsGeneratingGoal(true);
        try {
            const response = await apiFetch("/api/analyze-sitemap", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    url,
                    nodes,
                    flowType: activeFlowId,
                }),
            });

            if (!response.ok) {
                throw new Error("Failed to generate goal from sitemap");
            }

            const data = await response.json();
            setGoal(data.prompt);
        } catch (error) {
            if (error instanceof UnauthorizedError) return;
            console.error("Failed to generate goal prompt:", error);
            const selectedFlow = flows.find((f) => f.id === activeFlowId);
            if (selectedFlow) {
                setGoal(selectedFlow.generatedGoalPrompt);
            }
        } finally {
            setIsGeneratingGoal(false);
        }
    };

    const handleToggleNode = useCallback((nodeId: string) => {
        setNodes((prev) =>
            prev.map((node) => (node.id === nodeId ? { ...node, isActive: !node.isActive } : node))
        );
    }, []);

    const handleEditNode = useCallback((id: string) => {
        setNodes((prev) => {
            const targetNode = prev.find(n => n.id === id);
            if (targetNode) {
                setSelectedNode(targetNode);
                setShowNodeDialog(true);
            }
            return prev;
        });
    }, []);

    const handleSaveNode = () => {
        if (selectedNode) {
            setNodes((prev) =>
                prev.map((node) => (node.id === selectedNode.id ? selectedNode : node))
            );
            setShowNodeDialog(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const response = await apiFetch("/api/jobs", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    url,
                    goal,
                    mode: isChaos ? "chaos" : "standard",
                    chaosProfile: isChaos ? chaosProfile : undefined,
                    model,
                    headless,
                    disableCache,
                }),
            });

            if (!response.ok) {
                throw new Error("Failed to start mission");
            }

            const data = await response.json();
            if (onLaunched) {
                onLaunched(data.runId);
            } else {
                router.push(`/run/${data.runId}`);
            }
        } catch (error) {
            if (error instanceof UnauthorizedError) return;
            console.error(error);
            alert("Failed to start mission. Check server logs.");
            setIsLoading(false);
        }
    };

    const reactFlowNodes = useMemo(() => nodes.map(node => ({
        id: node.id,
        type: 'sitemapNode',
        position: { x: node.x, y: node.y },
        data: {
            id: node.id,
            title: node.title,
            url: node.url,
            isActive: node.isActive,
            interactives: node.interactives,
            customAssertion: node.customAssertion,
            onToggle: handleToggleNode,
            onEdit: handleEditNode,
        }
    })), [nodes, handleToggleNode, handleEditNode]);

    const reactFlowEdges = useMemo(() => sitemapEdges.map((edge, idx) => ({
        id: `e-${edge.from}-${edge.to}-${idx}`,
        source: edge.from,
        target: edge.to,
        animated: true,
        style: { stroke: '#8b5cf6', strokeWidth: 1.5 },
    })), [sitemapEdges]);

    return (
        <>
            <form onSubmit={handleSubmit} className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <Label htmlFor="mission-url">Target URL</Label>
                        <Input
                            id="mission-url"
                            placeholder="http://localhost:3000"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            required
                        />
                        <p className="text-xs text-muted-foreground">
                            Local apps need <code className="bg-muted px-1 rounded">http://</code>, not https.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="mission-model">AI Model</Label>
                        <Select value={model} onValueChange={setModel}>
                            <SelectTrigger id="mission-model">
                                <SelectValue placeholder="Select Model" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="gemini-2.5-flash">
                                    ⚡ Gemini 2.5 Flash (Recommended)
                                </SelectItem>
                                <SelectItem value="gemini-3.6-flash">
                                    🚀 Gemini 3.6 Flash (Newest)
                                </SelectItem>
                                <SelectItem value="gemini-2.5-pro">
                                    🧠 Gemini 2.5 Pro (High Reasoning)
                                </SelectItem>
                                <SelectItem value="gemini-2.5-flash-lite">
                                    🏎️ Gemini 2.5 Flash Lite (Fastest)
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="space-y-3">
                    <Label>Testing Strategy</Label>
                    <div className="grid grid-cols-2 gap-4" role="group" aria-label="Testing strategy">
                        <button
                            type="button"
                            aria-pressed={strategy === "manual"}
                            className={`flex items-center justify-center gap-2 p-4 border-2 rounded-xl text-sm font-semibold transition-all ${
                                strategy === "manual"
                                    ? "border-purple-600 bg-purple-500/10 text-purple-700 dark:text-purple-300"
                                    : "border-muted hover:border-muted-foreground/30 text-muted-foreground"
                            }`}
                            onClick={() => setStrategy("manual")}
                        >
                            <Keyboard className="w-4 h-4" aria-hidden="true" /> Manual Goal / Prompt
                        </button>
                        <button
                            type="button"
                            aria-pressed={strategy === "autonomous"}
                            className={`flex items-center justify-center gap-2 p-4 border-2 rounded-xl text-sm font-semibold transition-all ${
                                strategy === "autonomous"
                                    ? "border-purple-600 bg-purple-500/10 text-purple-700 dark:text-purple-300"
                                    : "border-muted hover:border-muted-foreground/30 text-muted-foreground"
                            }`}
                            onClick={() => setStrategy("autonomous")}
                        >
                            <Compass className="w-4 h-4" aria-hidden="true" /> Autonomous Discovery
                        </button>
                    </div>
                </div>

                {strategy === "autonomous" && (
                    <div className="border border-purple-500/20 bg-purple-500/5 rounded-xl p-6 space-y-6 animate-in fade-in slide-in-from-top duration-300">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="space-y-1">
                                <h3 className="text-base font-bold flex items-center gap-1.5">
                                    <Activity className="w-4 h-4 text-purple-500" aria-hidden="true" /> Explore Application Sitemap
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                    Find all paths, pages, and fields automatically to let the AI write the goal.
                                </p>
                            </div>
                            <Button
                                type="button"
                                size="sm"
                                className="bg-purple-600 hover:bg-purple-500 shrink-0"
                                onClick={startDiscovery}
                                disabled={isCrawling}
                                aria-busy={isCrawling}
                            >
                                {isCrawling ? "Scanning..." : "🔍 Scan Application"}
                            </Button>
                        </div>

                        {(isCrawling || logs.length > 0) && (
                            <div className="space-y-3">
                                <div
                                    className="w-full bg-muted rounded-full h-2 overflow-hidden"
                                    role="progressbar"
                                    aria-valuenow={Math.round(progress)}
                                    aria-valuemin={0}
                                    aria-valuemax={100}
                                    aria-label="Crawl progress"
                                >
                                    <div
                                        className="bg-gradient-to-r from-purple-500 to-blue-500 h-2 rounded-full transition-all duration-300"
                                        style={{ width: `${progress}%` }}
                                    ></div>
                                </div>
                                <div
                                    ref={logsContainerRef}
                                    className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 font-mono text-sm leading-relaxed text-zinc-200 h-56 max-h-[50vh] overflow-y-auto space-y-1.5"
                                    aria-live="polite"
                                    aria-label="Crawl logs"
                                >
                                    {logs.map((log, idx) => (
                                        <div key={idx} className={log?.startsWith("🎉") ? "text-green-400" : log?.startsWith("❌") || log?.startsWith("⚠️") ? "text-red-400" : log?.startsWith("👉") ? "text-blue-400" : ""}>
                                            {log}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {showSitemap && (
                            <div className="space-y-6 animate-in zoom-in-95 duration-300">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div className="md:col-span-2 border border-muted/50 rounded-xl bg-zinc-950 p-1 relative h-[360px] overflow-hidden flex flex-col shadow-inner">
                                        <div className="absolute top-2 left-2 z-20 bg-black/80 border border-purple-500/20 text-xs text-purple-300 font-semibold px-2.5 py-1 rounded-full select-none">
                                            Live Flow Canvas
                                        </div>
                                        <ReactFlowProvider>
                                            <ReactFlow
                                                nodes={reactFlowNodes}
                                                edges={reactFlowEdges}
                                                nodeTypes={nodeTypes}
                                                fitView
                                                colorMode="dark"
                                                className="w-full h-full"
                                            >
                                                <Background color="#8b5cf6" gap={16} size={1} style={{ opacity: 0.15 }} />
                                                <Controls
                                                    className="!m-3 !rounded-md !overflow-hidden !border !border-zinc-600 !shadow-lg"
                                                    showInteractive={false}
                                                />
                                            </ReactFlow>
                                        </ReactFlowProvider>
                                    </div>

                                    <div className="md:col-span-1 border border-muted/50 rounded-xl bg-zinc-950 p-4 flex flex-col space-y-2 h-[360px]">
                                        <div className="flex justify-between items-center">
                                            <Label className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5 select-none">
                                                <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span> JSON Graph Schema
                                            </Label>
                                            {jsonError ? (
                                                <Badge variant="destructive" className="text-[10px] px-1.5 py-0.5 leading-none">
                                                    Syntax Error
                                                </Badge>
                                            ) : (
                                                <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px] px-1.5 py-0.5 leading-none">
                                                    Sync OK
                                                </Badge>
                                            )}
                                        </div>
                                        <textarea
                                            value={jsonText}
                                            onChange={(e) => handleJsonChange(e.target.value)}
                                            className={`flex-1 w-full bg-zinc-900 border rounded-lg p-2.5 font-mono text-xs leading-relaxed text-zinc-100 placeholder:text-zinc-500 resize-none focus:outline-none focus:ring-1 transition-all ${
                                                jsonError ? 'border-red-500/40 focus:ring-red-500/30' : 'border-zinc-700 focus:ring-purple-500/40'
                                            }`}
                                            placeholder="Type sitemap JSON here..."
                                            aria-label="JSON graph schema"
                                        />
                                        {jsonError && (
                                            <p className="text-xs text-red-400 font-mono line-clamp-2">
                                                {jsonError}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4" role="listbox" aria-label="Proposed test flows">
                                    {flows.map((flow) => (
                                        <button
                                            type="button"
                                            key={flow.id}
                                            role="option"
                                            aria-selected={activeFlowId === flow.id}
                                            className={`border p-3.5 rounded-xl text-left cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 ${
                                                activeFlowId === flow.id
                                                    ? "border-purple-600 bg-purple-500/10"
                                                    : "border-muted bg-card/30 hover:border-muted-foreground/20"
                                            }`}
                                            onClick={() => setActiveFlowId(flow.id)}
                                        >
                                            <div className="flex justify-between items-center mb-1 gap-2">
                                                <h4 className="font-bold text-sm text-foreground">
                                                    {flow.name}
                                                </h4>
                                                <span className="text-xs text-muted-foreground shrink-0">
                                                    {flow.steps.length} steps
                                                </span>
                                            </div>
                                            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                                                {flow.description}
                                            </p>
                                        </button>
                                    ))}
                                </div>

                                <Button
                                    type="button"
                                    className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-sm font-bold gap-1.5"
                                    onClick={handleGenerateGoal}
                                    disabled={isGeneratingGoal}
                                >
                                    <Sparkles className="w-3.5 h-3.5" />
                                    {isGeneratingGoal ? "Analyzing sitemap graph..." : "Analyze Sitemap & Generate Prompt"}
                                </Button>
                            </div>
                        )}
                    </div>
                )}

                <div className="space-y-2">
                    <Label htmlFor="mission-goal" className="font-bold text-sm flex items-center gap-1.5">
                        <ListTodo className="w-4 h-4 text-purple-500" aria-hidden="true" /> Mission Goal / Prompt
                    </Label>
                    <Textarea
                        id="mission-goal"
                        placeholder="e.g. Login, search for 'shoes', and add the first one to cart."
                        value={goal}
                        onChange={(e) => setGoal(e.target.value)}
                        required
                        className="min-h-[220px]"
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="flex items-start gap-3 border border-border p-4 rounded-xl bg-muted/40">
                        <Switch
                            id="chaos-mode"
                            checked={isChaos}
                            onCheckedChange={setIsChaos}
                            className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0 space-y-0.5">
                            <Label htmlFor="chaos-mode" className="font-bold text-sm">
                                Chaos Mode 😈
                            </Label>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                Inject packet loss, latency, and inputs fuzzing.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-start gap-3 border border-border p-4 rounded-xl bg-muted/40">
                        <Switch
                            id="headless-mode"
                            checked={headless}
                            onCheckedChange={setHeadless}
                            className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0 space-y-0.5">
                            <Label htmlFor="headless-mode" className="font-bold text-sm">
                                Headless Mode 👻
                            </Label>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                Run browser in background. Disable to watch live.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-start gap-3 border border-border p-4 rounded-xl bg-muted/40">
                        <Switch
                            id="disable-cache"
                            checked={disableCache}
                            onCheckedChange={setDisableCache}
                            className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0 space-y-0.5">
                            <Label htmlFor="disable-cache" className="font-bold text-sm">
                                Disable Cache 🧠
                            </Label>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                Force AI reasoning on every single step.
                            </p>
                        </div>
                    </div>
                </div>

                {isChaos && (
                    <ChaosControlPanel
                        onChange={setChaosProfile}
                        initialProfile={chaosProfile}
                    />
                )}

                <Button
                    type="submit"
                    className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 py-6 text-sm font-bold"
                    disabled={isLoading}
                    aria-busy={isLoading}
                >
                    {isLoading ? "Deploying Agent..." : submitLabel}
                </Button>
            </form>

            {selectedNode && (
                <Dialog open={showNodeDialog} onOpenChange={setShowNodeDialog}>
                    <DialogContent className="border-muted bg-card/95 backdrop-blur text-foreground">
                        <DialogHeader>
                            <DialogTitle className="text-base font-bold">Edit Node: {selectedNode.title}</DialogTitle>
                            <DialogDescription className="text-xs text-muted-foreground">
                                Path: {selectedNode.url}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-3 text-sm">
                            <div className="space-y-1.5">
                                <Label htmlFor="node-title">Node Title</Label>
                                <Input
                                    id="node-title"
                                    value={selectedNode.title}
                                    onChange={(e) =>
                                        setSelectedNode({ ...selectedNode, title: e.target.value })
                                    }
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label>Interactive Element Selectors Found</Label>
                                <div className="border border-muted/50 rounded-lg p-2.5 bg-black/25 space-y-0.5 max-h-40 overflow-y-auto">
                                    {selectedNode.interactives.map((item, idx) => (
                                        <div key={idx} className="font-mono text-xs text-purple-400">
                                            {item}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="node-assertion">Validation Assertions (LLM Guided)</Label>
                                <Input
                                    id="node-assertion"
                                    value={selectedNode.customAssertion}
                                    onChange={(e) =>
                                        setSelectedNode({
                                            ...selectedNode,
                                            customAssertion: e.target.value,
                                        })
                                    }
                                />
                            </div>

                            <div className="flex items-center space-x-2 border p-3 rounded-lg bg-black/10">
                                <Switch
                                    id="node-active"
                                    checked={selectedNode.isActive}
                                    onCheckedChange={(val) =>
                                        setSelectedNode({ ...selectedNode, isActive: val })
                                    }
                                />
                                <div className="flex-1">
                                    <Label htmlFor="node-active" className="font-bold">
                                        Enable State Testing
                                    </Label>
                                    <p className="text-xs text-muted-foreground">
                                        Include this page/node in the generated E2E flow.
                                    </p>
                                </div>
                            </div>
                        </div>
                        <DialogFooter className="gap-2">
                            <Button size="sm" variant="outline" onClick={() => setShowNodeDialog(false)}>
                                Cancel
                            </Button>
                            <Button size="sm" className="bg-purple-600 hover:bg-purple-500 font-bold" onClick={handleSaveNode}>
                                Save Changes
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
        </>
    );
}
