"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { ReactFlow, ReactFlowProvider, Background, Controls, Position, Handle } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
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
    Layers,
    ListTodo,
    Edit3,
    CheckCircle,
    Play,
    Sparkles,
    Keyboard,
} from "lucide-react";
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

const CustomSitemapNode = ({ data }: any) => {
    return (
        <div className={`w-36 border p-2 rounded-lg bg-black/80 text-foreground shadow-md transition-all ${data.isActive ? 'border-purple-500/50' : 'border-muted opacity-40'}`}>
            <Handle type="target" position={Position.Left} className="w-2 h-2 !bg-purple-500" />
            <div className="flex justify-between items-center mb-1">
                <span className="text-[7px] font-mono text-muted-foreground truncate w-24">
                    {data.url}
                </span>
                <input
                    type="checkbox"
                    checked={data.isActive}
                    onChange={(e) => {
                        e.stopPropagation();
                        data.onToggle(data.id);
                    }}
                    className="w-3 h-3 accent-purple-500 cursor-pointer"
                />
            </div>
            <h4 className="text-[9px] font-bold truncate">{data.title}</h4>
            <div className="flex justify-between items-center mt-2">
                <span className="text-[7px] text-purple-400">
                    {data.interactives?.length || 0} fields
                </span>
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        data.onEdit(data.id);
                    }}
                    className="text-[7px] bg-purple-500/15 hover:bg-purple-500/30 text-purple-300 px-1 py-0.5 rounded font-mono"
                >
                    EDIT
                </button>
            </div>
            <Handle type="source" position={Position.Right} className="w-2 h-2 !bg-purple-500" />
        </div>
    );
};

const nodeTypes = { sitemapNode: CustomSitemapNode };

export default function NewMission() {
    const router = useRouter();
    const [url, setUrl] = useState("https://saucedemo.com");
    const [model, setModel] = useState("gemini-2.5-flash");
    const [strategy, setStrategy] = useState<"manual" | "autonomous">("manual");
    
    // Discovery/Crawl states
    const [depth, setDepth] = useState(3);
    const [isCrawling, setIsCrawling] = useState(false);
    const [progress, setProgress] = useState(0);
    const [logs, setLogs] = useState<string[]>([]);
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

    // Initial mock nodes representation
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

    // Mock AI flows proposals with pre-crafted goal prompts
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

    // Goal Prompt state
    const [goal, setGoal] = useState(`GOAL: Complete the Checkout Flow.
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
12. ONLY NOW -> Emit "Done".`);

    const [isChaos, setIsChaos] = useState(false);
    const [chaosProfile, setChaosProfile] = useState<ChaosProfile | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [headless, setHeadless] = useState(true);
    const [disableCache, setDisableCache] = useState(false);

    // Guard: true while handleJsonChange is applying parsed JSON back into nodes
    // so the useEffect below doesn't immediately overwrite what the user just typed.
    const isUpdatingFromJson = useRef(false);

    // Sync graph state → JSON text (one direction only, guarded by ref)
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

    // Handle user modifying raw JSON → nodes (guarded to prevent loop back into useEffect)
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
                // Raise the guard before mutating nodes so the sync useEffect skips this cycle
                isUpdatingFromJson.current = true;
                setNodes(validatedNodes);
                // Lower the guard after the current microtask queue flushes
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

    // State crawler discovery calling backend crawler via SSE
    const startDiscovery = async () => {
        setIsCrawling(true);
        setProgress(5);
        setLogs([`🔍 Opening SSE connection to trigger crawler for: ${url}`]);
        setShowSitemap(false);
        setNodes([]); // Reset sitemap layout nodes
        setSitemapEdges([]); // Reset sitemap layout edges

        // Set up EventSource
        const encodedUrl = encodeURIComponent(url);
        const sseUrl = `http://localhost:3001/api/crawl-stream?url=${encodedUrl}&depth=${depth}`;
        const eventSource = new EventSource(sseUrl);

        let activeNodesList: any[] = [];

        eventSource.addEventListener("log", (e) => {
            try {
                const logMsg = JSON.parse(e.data);
                setLogs((prev) => [...prev, logMsg]);
                // Smoothly increment progress bar on each log entry
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

        eventSource.addEventListener("complete", () => {
            eventSource.close();
            setProgress(100);
            setIsCrawling(false);
            setLogs((prev) => [...prev, `🎉 Discovery completed successfully! Discovered ${activeNodesList.length} page states.`]);

            // Generate E2E flow choices based on discovered nodes
            const stepsList = activeNodesList.map((n: any, idx: number) => ({
                name: `Step ${idx + 1}: ${n.title}`,
                goal: `Navigate to ${n.url} and verify assertions.`
            }));

            // Dynamically build the flows proposal based on what the crawler outputted!
            const generatedE2EPrompt = `GOAL: Validate the user flow on ${url}.

PHASE 1: NAVIGATION & ACTIONS
${activeNodesList.map((n: any, idx: number) => {
    let step = `${idx + 1}. Go to page "${n.title}" (${n.url}).\n`;
    if (n.interactives && n.interactives.length > 0) {
        step += `   - Inspect elements: ${n.interactives.slice(0, 3).join(', ')}\n`;
    }
    return step;
}).join('\n')}
PHASE 2: VERIFICATION
${activeNodesList.map((n: any, idx: number) => `On page "${n.title}", ensure: ${n.customAssertion}`).join('\n')}

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
                    generatedGoalPrompt: `GOAL: Fuzz interactive forms discovered during crawling on ${url}.\n\n` + 
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

        eventSource.onerror = (err) => {
            console.error("SSE stream error:", err);
            eventSource.close();
            setIsCrawling(false);

            // Fallback mock logic if server is rate limited/offline
            setLogs((prev) => [
                ...prev,
                "⚠️ Crawler connection issue. Using cached mockup sitemap instead."
            ]);
            setProgress(100);

            const isSauce = url.includes("saucedemo") || url.includes("sauce");
            if (isSauce) {
                setNodes([
                    { id: "1", title: "Login Screen", url: "/", isActive: true, interactives: ["#user-name", "#password", "#login-button"], customAssertion: "Verify standard login fields exist and form inputs are visible.", x: 50, y: 120 },
                    { id: "2", title: "Inventory Dashboard", url: "/inventory.html", isActive: true, interactives: [".inventory_item", ".btn_primary", ".shopping_cart_link"], customAssertion: "Ensure at least 6 products are displayed on page.", x: 220, y: 120 },
                    { id: "3", title: "Cart Overview", url: "/cart.html", isActive: true, interactives: [".cart_item", "#checkout", "#continue-shopping"], customAssertion: "Ensure cart list shows exact items added in previous state.", x: 390, y: 120 },
                    { id: "4", title: "Checkout Info Entry", url: "/checkout-step-one.html", isActive: true, interactives: ["#first-name", "#last-name", "#postal-code", "#continue"], customAssertion: "Validate that ZIP code input is numerical only.", x: 560, y: 40 },
                    { id: "5", title: "Checkout Overview", url: "/checkout-step-two.html", isActive: true, interactives: ["#finish", "#cancel", ".summary_total_label"], customAssertion: "Check that Total matches Sum of items + Tax.", x: 560, y: 200 },
                    { id: "6", title: "Checkout Complete", url: "/checkout-complete.html", isActive: true, interactives: ["#back-to-products"], customAssertion: "Ensure success message 'THANK YOU FOR YOUR ORDER' is visible.", x: 730, y: 120 }
                ]);
            } else {
                setNodes([
                    { id: "1", title: "Landing Page", url: "/", isActive: true, interactives: [".cta-button", "a.nav-link"], customAssertion: "Verify main call-to-action button is visible.", x: 50, y: 120 },
                    { id: "2", title: "Auth Portal", url: "/login", isActive: true, interactives: ["#email", "#password", "button[type='submit']"], customAssertion: "Ensure username/password credentials fields render properly.", x: 220, y: 120 },
                    { id: "3", title: "Dashboard Panel", url: "/dashboard", isActive: true, interactives: [".sidebar-menu", "button#logout", "a.profile-link"], customAssertion: "Verify widgets and analytics summary are rendered.", x: 390, y: 120 },
                    { id: "4", title: "Settings Info", url: "/dashboard/settings", isActive: true, interactives: ["#notifications-toggle", "#dark-mode-switch", "#save-btn"], customAssertion: "Verify configuration switches are functional.", x: 560, y: 40 },
                    { id: "5", title: "Transactions Log", url: "/dashboard/transactions", isActive: true, interactives: [".transactions-table", "button#filter"], customAssertion: "Ensure records log contains at least one recent item.", x: 560, y: 200 },
                    { id: "6", title: "Workspace Finished", url: "/dashboard/complete", isActive: true, interactives: ["button#back-home"], customAssertion: "Verify workspace successfully saved banner displays.", x: 730, y: 120 }
                ]);
            }
            setShowSitemap(true);
        };
    };

    const handleGenerateGoal = async () => {
        setIsGeneratingGoal(true);
        try {
            const response = await fetch("http://localhost:3001/api/analyze-sitemap", {
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
            console.error("Failed to generate goal prompt:", error);
            // Fallback mock logic if server is unreachable
            const selectedFlow = flows.find((f) => f.id === activeFlowId);
            if (selectedFlow) {
                setGoal(selectedFlow.generatedGoalPrompt);
            }
        } finally {
            setIsGeneratingGoal(false);
        }
    };

    // Stable callbacks — useCallback prevents new references on every render,
    // which would otherwise cause ReactFlow to diff all nodes as "changed".
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
            return prev; // no mutation
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
            const response = await fetch("http://localhost:3001/api/jobs", {
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
            router.push(`/run/${data.runId}`);
        } catch (error) {
            console.error(error);
            alert("Failed to start mission. Check server logs.");
            setIsLoading(false);
        }
    };

    // Memoised so ReactFlow only re-diffs when nodes/edges actually change.
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
        <div className="flex flex-col items-center p-6 md:p-12 space-y-8 max-w-5xl mx-auto w-full">
            <Card className="w-full border-muted-foreground/20 bg-card/60 backdrop-blur">
                <CardHeader>
                    <CardTitle className="text-xl flex items-center gap-2">
                        <Play className="w-5 h-5 text-purple-400" /> Launch New Mission
                    </CardTitle>
                    <CardDescription>
                        Configure an autonomous testing campaign via Manual Goal or Autonomous Discovery.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-8">
                        {/* URL & Model Section */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="url">Target URL</Label>
                                <Input
                                    id="url"
                                    placeholder="https://example.com"
                                    value={url}
                                    onChange={(e) => setUrl(e.target.value)}
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="model">AI Model</Label>
                                <Select value={model} onValueChange={setModel}>
                                    <SelectTrigger id="model">
                                        <SelectValue placeholder="Select Model" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="gemini-2.5-flash">
                                            ⚡ Gemini 2.5 Flash (Recommended)
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

                        {/* Strategy Toggle */}
                        <div className="space-y-3">
                            <Label>Testing Strategy</Label>
                            <div className="grid grid-cols-2 gap-4">
                                <button
                                    type="button"
                                    className={`flex items-center justify-center gap-2 p-4 border-2 rounded-xl text-sm font-semibold transition-all ${
                                        strategy === "manual"
                                            ? "border-purple-500 bg-purple-500/5 text-purple-300"
                                            : "border-muted hover:border-muted-foreground/30 text-muted-foreground"
                                    }`}
                                    onClick={() => setStrategy("manual")}
                                >
                                    <Keyboard className="w-4 h-4" /> Manual Goal / Prompt
                                </button>
                                <button
                                    type="button"
                                    className={`flex items-center justify-center gap-2 p-4 border-2 rounded-xl text-sm font-semibold transition-all ${
                                        strategy === "autonomous"
                                            ? "border-purple-500 bg-purple-500/5 text-purple-300"
                                            : "border-muted hover:border-muted-foreground/30 text-muted-foreground"
                                    }`}
                                    onClick={() => setStrategy("autonomous")}
                                >
                                    <Compass className="w-4 h-4" /> Autonomous Discovery
                                </button>
                            </div>
                        </div>

                        {/* Strategy A: Autonomous Discovery Block */}
                        {strategy === "autonomous" && (
                            <div className="border border-purple-500/20 bg-purple-500/5 rounded-xl p-6 space-y-6 animate-in fade-in slide-in-from-top duration-300">
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <h3 className="text-sm font-bold flex items-center gap-1.5">
                                            <Activity className="w-4 h-4 text-purple-400" /> Explore Application Sitemap
                                        </h3>
                                        <p className="text-xs text-muted-foreground">
                                            Find all paths, pages, and fields automatically to let the AI write the goal.
                                        </p>
                                    </div>
                                    <Button
                                        type="button"
                                        size="sm"
                                        className="bg-purple-600 hover:bg-purple-500"
                                        onClick={startDiscovery}
                                        disabled={isCrawling}
                                    >
                                        {isCrawling ? "Scanning..." : "🔍 Scan Application"}
                                    </Button>
                                </div>

                                {/* Progress Simulation */}
                                {isCrawling && (
                                    <div className="space-y-3">
                                        <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                                            <div
                                                className="bg-gradient-to-r from-purple-500 to-blue-500 h-2 rounded-full transition-all duration-300"
                                                style={{ width: `${progress}%` }}
                                            ></div>
                                        </div>
                                        <div className="bg-black/50 border rounded-lg p-3 font-mono text-[10px] text-muted-foreground h-32 overflow-y-auto space-y-1">
                                            {logs.map((log, idx) => (
                                                <div key={idx} className={log?.startsWith("🎉") ? "text-green-400" : log?.startsWith("👉") ? "text-blue-400" : ""}>
                                                    {log}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Graph Map & Flow Selector */}
                                {showSitemap && (
                                    <div className="space-y-6 animate-in zoom-in-95 duration-300">
                                        {/* Dynamic Node Graph Layout */}
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                            {/* Live Flow Canvas (React Flow) */}
                                            <div className="md:col-span-2 border border-muted/50 rounded-xl bg-black/60 p-1 relative h-[320px] overflow-hidden flex flex-col shadow-inner">
                                                <div className="absolute top-2 left-2 z-20 bg-black/80 border border-purple-500/20 text-[9px] text-purple-300 font-semibold px-2 py-0.5 rounded-full select-none">
                                                    Live Flow Canvas
                                                </div>
                                                <ReactFlowProvider>
                                                    <ReactFlow
                                                        nodes={reactFlowNodes}
                                                        edges={reactFlowEdges}
                                                        nodeTypes={nodeTypes}
                                                        fitView
                                                        className="w-full h-full"
                                                    >
                                                        <Background color="#8b5cf6" gap={16} size={1} style={{ opacity: 0.15 }} />
                                                        <Controls className="!bg-black !border-muted/30 !text-foreground !fill-foreground" />
                                                    </ReactFlow>
                                                </ReactFlowProvider>
                                            </div>

                                            {/* JSON Graph Schema Editor */}
                                            <div className="md:col-span-1 border border-muted/50 rounded-xl bg-black/40 p-4 flex flex-col space-y-2 h-[320px]">
                                                <div className="flex justify-between items-center">
                                                    <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 select-none">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span> JSON Graph Schema
                                                    </Label>
                                                    {jsonError ? (
                                                        <Badge variant="destructive" className="text-[8px] px-1.5 py-0.5 leading-none">
                                                            Syntax Error
                                                        </Badge>
                                                    ) : (
                                                        <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[8px] px-1.5 py-0.5 leading-none">
                                                            Sync OK
                                                        </Badge>
                                                    )}
                                                </div>
                                                <textarea
                                                    value={jsonText}
                                                    onChange={(e) => handleJsonChange(e.target.value)}
                                                    className={`flex-1 w-full bg-black/60 border rounded-lg p-2.5 font-mono text-[9px] leading-relaxed resize-none focus:outline-none focus:ring-1 transition-all ${
                                                        jsonError ? 'border-red-500/40 focus:ring-red-500/30' : 'border-muted/40 focus:ring-purple-500/40'
                                                    }`}
                                                    placeholder="Type sitemap JSON here..."
                                                />
                                                {jsonError && (
                                                    <p className="text-[8px] text-red-400 font-mono line-clamp-1">
                                                        {jsonError}
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        {/* Proposals selection */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {flows.map((flow) => (
                                                <div
                                                    key={flow.id}
                                                    className={`border p-3.5 rounded-xl cursor-pointer transition-all ${
                                                        activeFlowId === flow.id
                                                            ? "border-purple-500 bg-purple-500/5"
                                                            : "border-muted bg-card/30 hover:border-muted-foreground/20"
                                                    }`}
                                                    onClick={() => setActiveFlowId(flow.id)}
                                                >
                                                    <div className="flex justify-between items-center mb-1">
                                                        <h4 className="font-bold text-xs text-foreground">
                                                            {flow.name}
                                                        </h4>
                                                        <span className="text-[10px] text-muted-foreground">
                                                            {flow.steps.length} steps
                                                        </span>
                                                    </div>
                                                    <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-2">
                                                        {flow.description}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Analyze Button */}
                                        <Button
                                            type="button"
                                            className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-xs font-bold gap-1.5"
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

                        {/* Step 3: Goal Prompt Area */}
                        <div className="space-y-2">
                            <Label htmlFor="goal" className="font-bold flex items-center gap-1.5">
                                <ListTodo className="w-4 h-4 text-purple-400" /> Mission Goal / Prompt
                            </Label>
                            <Textarea
                                id="goal"
                                placeholder="e.g. Login, search for 'shoes', and add the first one to cart."
                                value={goal}
                                onChange={(e) => setGoal(e.target.value)}
                                required
                                className="min-h-[220px]"
                            />
                        </div>

                        {/* Standard Controls */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="flex items-center space-x-2 border p-3.5 rounded-xl bg-muted/40">
                                <Switch
                                    id="chaos-mode"
                                    checked={isChaos}
                                    onCheckedChange={setIsChaos}
                                />
                                <div className="flex-1">
                                    <Label htmlFor="chaos-mode" className="font-bold text-xs">
                                        Chaos Mode 😈
                                    </Label>
                                    <p className="text-[9px] text-muted-foreground">
                                        Inject packet loss, latency, and inputs fuzzing.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center space-x-2 border p-3.5 rounded-xl bg-muted/40">
                                <Switch
                                    id="headless-mode"
                                    checked={headless}
                                    onCheckedChange={setHeadless}
                                />
                                <div className="flex-1">
                                    <Label htmlFor="headless-mode" className="font-bold text-xs">
                                        Headless Mode 👻
                                    </Label>
                                    <p className="text-[9px] text-muted-foreground">
                                        Run browser in background. Disable to watch live.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center space-x-2 border p-3.5 rounded-xl bg-muted/40">
                                <Switch
                                    id="disable-cache"
                                    checked={disableCache}
                                    onCheckedChange={setDisableCache}
                                />
                                <div className="flex-1">
                                    <Label htmlFor="disable-cache" className="font-bold text-xs">
                                        Disable Cache 🧠
                                    </Label>
                                    <p className="text-[9px] text-muted-foreground">
                                        Force AI reasoning on every single step.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {isChaos && (
                            <ChaosControlPanel onChange={setChaosProfile} />
                        )}

                        <Button type="submit" className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 py-6 text-sm font-bold" disabled={isLoading}>
                            {isLoading ? "Deploying Agent..." : "🚀 Launch Mission"}
                        </Button>
                    </form>
                </CardContent>
            </Card>

            {/* Interactive dialog to edit node properties */}
            {selectedNode && (
                <Dialog open={showNodeDialog} onOpenChange={setShowNodeDialog}>
                    <DialogContent className="border-muted bg-card/95 backdrop-blur text-foreground">
                        <DialogHeader>
                            <DialogTitle className="text-sm font-bold">Edit Node: {selectedNode.title}</DialogTitle>
                            <DialogDescription className="text-[10px] text-muted-foreground">
                                Path: {selectedNode.url}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-3 text-xs">
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
                                <div className="border border-muted/50 rounded-lg p-2.5 bg-black/25 space-y-0.5">
                                    {selectedNode.interactives.map((item, idx) => (
                                        <div key={idx} className="font-mono text-[10px] text-purple-400">
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
                                    <p className="text-[9px] text-muted-foreground">
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
        </div>
    );
}
