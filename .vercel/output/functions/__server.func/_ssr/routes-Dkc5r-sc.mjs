import { i as __toESM } from "../_runtime.mjs";
import { y as require_jsx_runtime, z as require_react } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as TSS_SERVER_FUNCTION, r as getServerFnById, t as createServerFn } from "./ssr.mjs";
import { n as fallbackBoardSvg, t as PRESETS } from "./presets-CUK2UyIj.mjs";
import { a as Download, i as ImagePlus, n as PanelLeft, o as Check, r as LoaderCircle, s as ArrowRight } from "../_libs/lucide-react.mjs";
import { n as toast } from "../_libs/sonner.mjs";
import { t as clsx } from "../_libs/clsx.mjs";
import { t as twMerge } from "../_libs/tailwind-merge.mjs";
import { n as create, t as persist } from "../_libs/zustand.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-Dkc5r-sc.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function cn(...inputs) {
	return twMerge(clsx(inputs));
}
function uid(prefix = "id") {
	return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}
var variants = {
	primary: "bg-accent text-accent-fg hover:opacity-90 disabled:opacity-40",
	ghost: "bg-transparent text-fg hover:bg-surface-2 disabled:opacity-40",
	outline: "border border-border bg-transparent text-fg hover:bg-surface-2 disabled:opacity-40",
	danger: "bg-danger text-fg hover:opacity-90 disabled:opacity-40"
};
var sizes = {
	sm: "h-9 px-3 text-sm",
	md: "h-11 px-4 text-sm",
	lg: "h-12 px-5 text-base"
};
function Button({ className, variant = "primary", size = "md", ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		className: cn("inline-flex items-center justify-center gap-2 rounded-md font-medium tracking-tight transition-opacity duration-150 active:scale-[0.98]", variants[variant], sizes[size], className),
		...props
	});
}
function Wordmark({ className = "" }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: `flex items-baseline gap-2 ${className}`,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "font-display text-xl tracking-tight text-fg",
			children: "Keystone"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "text-xs uppercase tracking-[0.18em] text-subtle",
			children: "定调"
		})]
	});
}
var createSsrRpc = (functionId) => {
	const url = "/_serverFn/" + functionId;
	const serverFnMeta = { id: functionId };
	const fn = async (...args) => {
		return (await getServerFnById(functionId, { origin: "server" }))(...args);
	};
	return Object.assign(fn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
var parseBrief = createServerFn({ method: "POST" }).validator((input) => input).handler(createSsrRpc("e9d121d1b037414d46ecf32dedea334ef6b22a469e132e04705f0407494c798a"));
var generateCandidate = createServerFn({ method: "POST" }).validator((input) => input).handler(createSsrRpc("672765f2db7341b5f238eac3313e40b0af23a28231e08935ac1b706da87acb1b"));
var generateSlotFn = createServerFn({ method: "POST" }).validator((input) => input).handler(createSsrRpc("9c74c699c1113db6d4609095f993dc78c82fee8a6f8dc50b22a2845bd0712d46"));
var tuneImageFn = createServerFn({ method: "POST" }).validator((input) => input).handler(createSsrRpc("8f78fdd82cddce23b9a0e70db9cb5ba3f957b88e9fbd86c49ca15c628d372d1a"));
async function fileToDataUrl(file, max = 1024) {
	const bitmap = await createImageBitmap(file);
	const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
	const w = Math.round(bitmap.width * scale);
	const h = Math.round(bitmap.height * scale);
	const canvas = document.createElement("canvas");
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("canvas");
	ctx.drawImage(bitmap, 0, 0, w, h);
	return canvas.toDataURL("image/jpeg", .86);
}
var SLOTS = [
	{
		id: "ui_hero",
		label: "产品旗舰页",
		hint: "有原型则保结构"
	},
	{
		id: "kv",
		label: "品牌主视觉",
		hint: "KV / 海报"
	},
	{
		id: "web_home",
		label: "官网首屏",
		hint: "延展页"
	}
];
function emptyAsset(slot) {
	return {
		slot,
		adoptedId: null,
		revs: []
	};
}
function emptyAssets() {
	return {
		ui_hero: emptyAsset("ui_hero"),
		kv: emptyAsset("kv"),
		web_home: emptyAsset("web_home")
	};
}
function currentDna(branch) {
	const rec = branch.revs.find((r) => r.rev === branch.currentRev) ?? branch.revs.at(-1);
	if (!rec) throw new Error("style has no rev");
	return rec.dna;
}
function adoptedRev(asset) {
	if (!asset.adoptedId) return asset.revs.at(-1) ?? null;
	return asset.revs.find((r) => r.id === asset.adoptedId) ?? asset.revs.at(-1) ?? null;
}
function patchProject(projects, id, fn) {
	return projects.map((p) => p.id === id ? fn(p) : p);
}
var useStudio = create()(persist((set, get) => ({
	projects: [],
	currentId: null,
	current: () => get().projects.find((p) => p.id === get().currentId) ?? null,
	currentStyle: () => {
		const p = get().current();
		if (!p?.currentStyleId) return null;
		return p.styles.find((s) => s.id === p.currentStyleId) ?? null;
	},
	createProject: ({ brief, prototypeDataUrl }) => {
		const id = uid("prj");
		const project = {
			id,
			name: brief.trim().slice(0, 24) || "未命名项目",
			brief: brief.trim(),
			prototypeDataUrl,
			createdAt: Date.now(),
			currentStyleId: null,
			currentSlot: "kv",
			phase: "direction",
			intent: null,
			candidates: [],
			styles: [],
			mode: "idle"
		};
		set((s) => ({
			projects: [project, ...s.projects],
			currentId: id
		}));
		return id;
	},
	setPhase: (phase) => {
		const id = get().currentId;
		if (!id) return;
		set((s) => ({ projects: patchProject(s.projects, id, (p) => ({
			...p,
			phase
		})) }));
	},
	setIntent: (intent) => {
		const id = get().currentId;
		if (!id) return;
		set((s) => ({ projects: patchProject(s.projects, id, (p) => ({
			...p,
			intent,
			name: intent.productName || p.name
		})) }));
	},
	setCandidates: (candidates) => {
		const id = get().currentId;
		if (!id) return;
		set((s) => ({ projects: patchProject(s.projects, id, (p) => ({
			...p,
			candidates
		})) }));
	},
	patchCandidate: (cid, patch) => {
		const id = get().currentId;
		if (!id) return;
		set((s) => ({ projects: patchProject(s.projects, id, (p) => ({
			...p,
			candidates: p.candidates.map((c) => c.id === cid ? {
				...c,
				...patch
			} : c)
		})) }));
	},
	lockCandidate: (candidateId) => {
		const id = get().currentId;
		if (!id) return;
		set((s) => ({ projects: patchProject(s.projects, id, (p) => {
			const chosen = p.candidates.find((c) => c.id === candidateId);
			if (!chosen) return p;
			const rest = p.candidates.filter((c) => c.id !== candidateId).slice(0, 2);
			const mk = (c, status) => ({
				id: uid("sty"),
				name: c.dna.name,
				origin: "candidate",
				status,
				currentRev: 1,
				candidateUrl: c.url,
				revs: [{
					rev: 1,
					parentRev: null,
					dna: c.dna,
					changeLog: "锁定",
					createdAt: Date.now()
				}],
				assets: emptyAssets()
			});
			const active = mk(chosen, "active");
			const standbys = rest.map((c) => mk(c, "standby"));
			return {
				...p,
				phase: "studio",
				currentStyleId: active.id,
				currentSlot: "kv",
				styles: [active, ...standbys],
				mode: "idle"
			};
		}) }));
	},
	setCurrentStyle: (styleId) => {
		const id = get().currentId;
		if (!id) return;
		set((s) => ({ projects: patchProject(s.projects, id, (p) => ({
			...p,
			currentStyleId: styleId,
			styles: p.styles.map((st) => st.status === "archived" ? st : {
				...st,
				status: st.id === styleId ? "active" : "standby"
			})
		})) }));
	},
	setSlot: (slot) => {
		const id = get().currentId;
		if (!id) return;
		set((s) => ({ projects: patchProject(s.projects, id, (p) => ({
			...p,
			currentSlot: slot
		})) }));
	},
	setMode: (mode) => {
		const id = get().currentId;
		if (!id) return;
		set((s) => ({ projects: patchProject(s.projects, id, (p) => ({
			...p,
			mode
		})) }));
	},
	addImageRevs: ({ styleId, slot, urls, action, diff, parentId, writeback = "none" }) => {
		const ids = [];
		const pid = get().currentId;
		if (!pid) return ids;
		set((s) => ({ projects: patchProject(s.projects, pid, (p) => ({
			...p,
			styles: p.styles.map((st) => {
				if (st.id !== styleId) return st;
				const asset = st.assets[slot];
				const nextRevs = [...asset.revs];
				for (const url of urls) {
					const iid = uid("img");
					ids.push(iid);
					nextRevs.push({
						id: iid,
						parentId,
						url,
						createdAt: Date.now(),
						action,
						diff,
						writeback,
						styleRev: st.currentRev
					});
				}
				const trimmed = nextRevs.slice(-10);
				return {
					...st,
					assets: {
						...st.assets,
						[slot]: {
							...asset,
							revs: trimmed,
							adoptedId: asset.adoptedId ?? ids[0] ?? null
						}
					}
				};
			})
		})) }));
		return ids;
	},
	adoptImage: (styleId, slot, imageId) => {
		const id = get().currentId;
		if (!id) return;
		set((s) => ({ projects: patchProject(s.projects, id, (p) => ({
			...p,
			styles: p.styles.map((st) => st.id !== styleId ? st : {
				...st,
				assets: {
					...st.assets,
					[slot]: {
						...st.assets[slot],
						adoptedId: imageId
					}
				}
			})
		})) }));
	},
	writebackStyle: ({ styleId, changeLog, dna }) => {
		const id = get().currentId;
		if (!id) return;
		set((s) => ({ projects: patchProject(s.projects, id, (p) => ({
			...p,
			styles: p.styles.map((st) => {
				if (st.id !== styleId) return st;
				const nextRev = st.currentRev + 1;
				return {
					...st,
					currentRev: nextRev,
					revs: [...st.revs, {
						rev: nextRev,
						parentRev: st.currentRev,
						dna,
						changeLog,
						createdAt: Date.now()
					}]
				};
			})
		})) }));
	},
	setStyleRev: (styleId, rev) => {
		const id = get().currentId;
		if (!id) return;
		set((s) => ({ projects: patchProject(s.projects, id, (p) => ({
			...p,
			styles: p.styles.map((st) => st.id === styleId ? {
				...st,
				currentRev: rev
			} : st)
		})) }));
	},
	archiveStyle: (styleId) => {
		const id = get().currentId;
		if (!id) return;
		set((s) => ({ projects: patchProject(s.projects, id, (p) => {
			const remaining = p.styles.filter((st) => st.id !== styleId && st.status !== "archived");
			const nextCurrent = p.currentStyleId === styleId ? remaining[0]?.id ?? null : p.currentStyleId;
			return {
				...p,
				currentStyleId: nextCurrent,
				styles: p.styles.map((st) => st.id === styleId ? {
					...st,
					status: "archived"
				} : st)
			};
		}) }));
	}
}), { name: "keystone-v1" }));
var EXAMPLES = [
	"面向都市年轻人的春季训练营健身 App",
	"独立设计师用的极简记账工具",
	"新中式茶空间的品牌官网"
];
function BriefView() {
	const [brief, setBrief] = (0, import_react.useState)("");
	const [proto, setProto] = (0, import_react.useState)(null);
	const [busy, setBusy] = (0, import_react.useState)(false);
	const createProject = useStudio((s) => s.createProject);
	const setIntent = useStudio((s) => s.setIntent);
	const setCandidates = useStudio((s) => s.setCandidates);
	const patchCandidate = useStudio((s) => s.patchCandidate);
	const projects = useStudio((s) => s.projects);
	async function onFile(file) {
		try {
			setProto(await fileToDataUrl(file));
		} catch {
			toast.error("图片读取失败");
		}
	}
	async function start() {
		const text = brief.trim();
		if (!text) {
			toast.error("先写一句产品描述");
			return;
		}
		setBusy(true);
		createProject({
			brief: text,
			prototypeDataUrl: proto
		});
		const seeds = PRESETS.map((p) => ({
			id: uid("can"),
			presetId: p.id,
			dna: p.dna,
			url: null,
			status: "pending"
		}));
		setCandidates(seeds);
		try {
			let product = text;
			try {
				const intent = await parseBrief({ data: { brief: text } });
				setIntent(intent);
				product = intent.productName || text;
			} catch {}
			await Promise.all(seeds.map(async (c) => {
				try {
					const res = await generateCandidate({ data: {
						presetId: c.presetId,
						product
					} });
					patchCandidate(c.id, {
						url: res.url,
						status: "ready"
					});
				} catch {
					patchCandidate(c.id, {
						url: fallbackBoardSvg({
							dna: c.dna,
							title: product,
							kind: "candidate"
						}),
						status: "ready"
					});
				}
			}));
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "生成失败");
		} finally {
			setBusy(false);
		}
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "min-h-dvh bg-bg",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("header", {
			className: "flex items-center justify-between px-5 py-3 md:px-8",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Wordmark, {})
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
			className: "mx-auto flex max-w-2xl flex-col gap-6 px-5 pb-12 pt-4 md:pt-8",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "space-y-3",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-xs uppercase tracking-[0.22em] text-subtle",
							children: "Style lock-in"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
							className: "font-display text-3xl leading-[1.12] tracking-tight text-fg md:text-4xl",
							children: "先锁定方向，再出同一品牌的图"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "max-w-lg text-sm leading-relaxed text-muted md:text-base",
							children: "结构和气质拆开。一次锁定，产品界面、品牌主视觉、官网首屏共用一套视觉 DNA。"
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "rounded-xl border border-border bg-surface p-4 md:p-5",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
							className: "text-sm font-medium text-fg",
							children: "产品或品牌描述"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
							value: brief,
							onChange: (e) => setBrief(e.target.value),
							rows: 3,
							placeholder: "例如：面向都市年轻人的春季训练营健身 App，要干净、有运动感，不要游戏风",
							className: "mt-2 w-full resize-none rounded-md border border-border bg-bg px-3 py-3 text-base text-fg outline-none placeholder:text-subtle focus:border-accent"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "mt-3 flex flex-wrap gap-2",
							children: EXAMPLES.map((ex) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => setBrief(ex),
								className: "rounded-full border border-border px-3 py-1.5 text-xs text-muted hover:border-accent hover:text-fg",
								children: ex
							}, ex))
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "mt-4 flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-dashed border-border px-3 py-2.5 text-sm text-muted hover:border-accent",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ImagePlus, { className: "size-4 shrink-0" }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: proto ? "已上传原型，将作为结构参考" : "可选：上传线框 / 草图 / 截图" }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									type: "file",
									accept: "image/*",
									className: "hidden",
									onChange: (e) => {
										const f = e.target.files?.[0];
										if (f) onFile(f);
									}
								})
							]
						}),
						proto ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
							src: proto,
							alt: "原型",
							className: "mt-3 max-h-24 rounded-md border border-border object-contain"
						}) : null,
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
							className: "mt-4 w-full",
							size: "lg",
							disabled: busy,
							onClick: () => void start(),
							children: [busy ? "正在解析并出四个方向…" : "生成四个方向", !busy ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowRight, { className: "size-4" }) : null]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-2 text-center text-xs text-subtle",
							children: "每次出图会调用模型，请确认描述后再点。"
						})
					]
				}),
				projects.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mb-3 text-xs uppercase tracking-[0.18em] text-subtle",
					children: "已有项目"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "space-y-2",
					children: projects.map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						className: "flex min-h-11 w-full items-center justify-between rounded-md border border-border bg-surface px-4 py-3 text-left hover:border-accent",
						onClick: () => useStudio.setState({ currentId: p.id }),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-sm text-fg",
							children: p.name
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-xs text-subtle",
							children: p.phase === "studio" ? "出图工作台" : p.phase === "direction" ? "选方向" : "草稿"
						})]
					}) }, p.id))
				})] }) : null
			]
		})]
	});
}
function DirectionView() {
	const project = useStudio((s) => s.current());
	const lockCandidate = useStudio((s) => s.lockCandidate);
	if (!project) return null;
	const pending = project.candidates.some((c) => c.status === "pending");
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "min-h-dvh bg-bg",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
			className: "flex items-center justify-between px-5 py-4 md:px-8",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Wordmark, {}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				className: "text-sm text-muted hover:text-fg",
				onClick: () => useStudio.setState({ currentId: null }),
				children: "返回"
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
			className: "mx-auto max-w-6xl px-5 pb-16",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mb-8 max-w-2xl",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-xs uppercase tracking-[0.22em] text-subtle",
							children: "Step 1 · 定方向"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
							className: "mt-2 font-display text-3xl tracking-tight md:text-4xl",
							children: project.name
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-2 text-sm leading-relaxed text-muted",
							children: "四个正交方向，同一主题。锁定一张作为当前工作风格，其余最多保留两条备选。确认卡会同时看界面气质和品牌 KV。"
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "grid gap-4 sm:grid-cols-2",
					children: project.candidates.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
						className: "overflow-hidden rounded-lg border border-border bg-surface",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "relative aspect-video bg-surface-2",
							children: [c.url ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
								src: c.url,
								alt: c.dna.name,
								className: "size-full object-cover"
							}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "flex size-full items-center justify-center text-subtle",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, { className: "size-6 animate-spin" })
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "absolute left-3 top-3 flex gap-1.5",
								children: Object.values(c.dna.colors).slice(0, 5).map((hex) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "size-3 rounded-full border border-border",
									style: { background: hex }
								}, hex))
							})]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "space-y-3 p-4",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
									className: "font-display text-xl text-fg",
									children: c.dna.name
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-sm text-muted",
									children: c.dna.oneLiner
								})] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
									className: "text-xs text-subtle",
									children: [
										c.dna.material,
										" · ",
										c.dna.light,
										" · ",
										c.dna.density
									]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
									className: "w-full",
									disabled: c.status !== "ready" || pending,
									onClick: () => {
										lockCandidate(c.id);
										toast.success(`已锁定 ${c.dna.name}，其余方向保留为备选`);
									},
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, { className: "size-4" }), "锁定为当前风格"]
								})
							]
						})]
					}, c.id))
				}),
				pending ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-6 text-center text-sm text-muted",
					children: "正在出四个方向，卡片会逐张亮起。"
				}) : null
			]
		})]
	});
}
var TUNE_PRESETS = [
	{
		id: "like",
		label: "更像风格卡",
		instruction: "Push colors, materials, and lighting closer to the locked brand system. Keep composition."
	},
	{
		id: "clean",
		label: "更干净",
		instruction: "Remove clutter, increase whitespace, simplify backgrounds. Keep the same layout."
	},
	{
		id: "compose",
		label: "换构图",
		instruction: "Change composition and camera, keep the same subject, palette, and brand feeling."
	}
];
function StudioView() {
	const project = useStudio((s) => s.current());
	const setCurrentStyle = useStudio((s) => s.setCurrentStyle);
	const setSlot = useStudio((s) => s.setSlot);
	const setMode = useStudio((s) => s.setMode);
	const addImageRevs = useStudio((s) => s.addImageRevs);
	const adoptImage = useStudio((s) => s.adoptImage);
	const writebackStyle = useStudio((s) => s.writebackStyle);
	const setStyleRev = useStudio((s) => s.setStyleRev);
	const [content, setContent] = (0, import_react.useState)("");
	const [tab, setTab] = (0, import_react.useState)("image");
	const [mobile, setMobile] = (0, import_react.useState)("canvas");
	const [confirmWrite, setConfirmWrite] = (0, import_react.useState)(null);
	const [sliders, setSliders] = (0, import_react.useState)({
		brightness: 50,
		warmth: 50,
		contrast: 50
	});
	const [beforeUrl, setBeforeUrl] = (0, import_react.useState)(null);
	const [busyLabel, setBusyLabel] = (0, import_react.useState)(null);
	const style = project?.styles.find((s) => s.id === project.currentStyleId) ?? null;
	const dna = style ? currentDna(style) : null;
	const slot = project?.currentSlot ?? "kv";
	const asset = style?.assets[slot];
	const currentImg = asset ? adoptedRev(asset) : null;
	const generating = project?.mode === "generating";
	const pair = (0, import_react.useMemo)(() => {
		if (!asset) return [];
		const last = asset.revs.slice(-2);
		if (last.length === 2 && last.every((r) => r.action === "generate")) return last;
		return currentImg ? [currentImg] : last;
	}, [asset, currentImg]);
	if (!project || !style || !dna) return null;
	const product = project.intent?.productName || project.name;
	async function runGenerate() {
		if (!project || !style || !dna) return;
		setMode("generating");
		setBusyLabel("出图中");
		try {
			const ref = slot === "ui_hero" ? project.prototypeDataUrl : style.candidateUrl;
			const res = await generateSlotFn({ data: {
				dna,
				slot,
				product,
				content,
				refUrl: ref
			} });
			addImageRevs({
				styleId: style.id,
				slot,
				urls: res.urls,
				action: "generate",
				diff: content.trim() || "首次生成",
				parentId: currentImg?.id ?? null
			});
			toast.success("已生成 2 张变体，点「采用」选定");
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "出图失败");
		} finally {
			setMode("idle");
			setBusyLabel(null);
		}
	}
	async function runTune(instruction, writeback) {
		if (!currentImg) {
			toast.error("先出图并采用一张");
			return;
		}
		if (writeback) {
			setConfirmWrite({ instruction });
			return;
		}
		await applyTune(instruction, false);
	}
	async function applyTune(instruction, writeback) {
		if (!project || !style || !dna || !currentImg) return;
		setBeforeUrl(currentImg.url);
		setMode("generating");
		setBusyLabel("微调中");
		setConfirmWrite(null);
		try {
			const res = await tuneImageFn({ data: {
				dna,
				imageUrl: currentImg.url,
				instruction,
				slot
			} });
			const ids = addImageRevs({
				styleId: style.id,
				slot,
				urls: [res.url],
				action: "tune",
				diff: instruction.slice(0, 24),
				parentId: currentImg.id,
				writeback: writeback ? "promoted" : "none"
			});
			if (ids[0]) adoptImage(style.id, slot, ids[0]);
			if (writeback) {
				writebackStyle({
					styleId: style.id,
					changeLog: instruction.slice(0, 32),
					dna: { ...dna }
				});
				toast.success("已写回风格。旧图保留，之后新图会带上这次修改。");
			} else toast.success("只改了这一张，风格 DNA 未动");
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "微调失败");
		} finally {
			setMode("idle");
			setBusyLabel(null);
		}
	}
	function sliderInstruction() {
		const bits = [];
		if (sliders.brightness !== 50) bits.push(sliders.brightness > 50 ? "brighter" : "darker");
		if (sliders.warmth !== 50) bits.push(sliders.warmth > 50 ? "warmer color temperature" : "cooler color temperature");
		if (sliders.contrast !== 50) bits.push(sliders.contrast > 50 ? "higher contrast" : "softer contrast");
		return bits.length ? `Adjust: ${bits.join(", ")}. Keep composition.` : "Subtle polish, keep composition.";
	}
	const standby = project.styles.filter((s) => s.status === "standby");
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex h-dvh flex-col bg-bg text-fg",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
				className: "grid h-14 shrink-0 grid-cols-[1fr_auto] items-center gap-2 border-b border-border px-3 md:grid-cols-[auto_1fr_auto] md:px-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						onClick: () => useStudio.setState({ currentId: null }),
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Wordmark, {})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "hidden min-w-0 items-center gap-2 overflow-x-auto md:flex",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
								className: "h-9 rounded-md border border-border bg-surface px-2 text-sm",
								value: style.id,
								disabled: generating,
								onChange: (e) => setCurrentStyle(e.target.value),
								children: project.styles.filter((s) => s.status !== "archived").map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", {
									value: s.id,
									children: [s.name, s.status === "active" ? " · 当前" : " · 备选"]
								}, s.id))
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
								className: "h-9 rounded-md border border-border bg-surface px-2 text-sm",
								value: style.currentRev,
								disabled: generating,
								onChange: (e) => setStyleRev(style.id, Number(e.target.value)),
								children: style.revs.map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", {
									value: r.rev,
									children: [
										"rev",
										r.rev,
										" · ",
										r.changeLog
									]
								}, r.rev))
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "truncate text-sm text-muted",
								children: [
									SLOTS.find((s) => s.id === slot)?.label,
									" · ",
									currentImg ? `v${asset.revs.findIndex((r) => r.id === currentImg.id) + 1}` : "未出图"
								]
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("a", {
						className: cn("inline-flex h-9 items-center gap-1 rounded-md border border-border px-3 text-sm", !currentImg && "pointer-events-none opacity-40"),
						href: currentImg?.url,
						target: "_blank",
						rel: "noreferrer",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Download, { className: "size-3.5" }), "下载"]
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex min-h-0 flex-1",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
						className: "hidden w-[260px] shrink-0 flex-col gap-4 overflow-y-auto border-r border-border p-4 md:flex",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StyleCard, { dna }),
							standby.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mb-2 text-xs uppercase tracking-[0.16em] text-subtle",
								children: "备选风格"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "flex gap-2",
								children: standby.map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									disabled: generating,
									onClick: () => setCurrentStyle(s.id),
									className: "overflow-hidden rounded-md border border-border",
									title: s.name,
									children: s.candidateUrl ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
										src: s.candidateUrl,
										alt: s.name,
										className: "h-14 w-20 object-cover"
									}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "block h-14 w-20 bg-surface-2" })
								}, s.id))
							})] }) : null,
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mb-2 text-xs uppercase tracking-[0.16em] text-subtle",
								children: "物料槽"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "flex flex-col gap-1",
								children: SLOTS.map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
									disabled: generating,
									onClick: () => setSlot(s.id),
									className: cn("rounded-md px-3 py-2 text-left text-sm", slot === s.id ? "bg-accent text-accent-fg" : "text-muted hover:bg-surface-2 hover:text-fg"),
									children: [s.label, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: cn("mt-0.5 block text-xs", slot === s.id ? "text-accent-fg/70" : "text-subtle"),
										children: s.hint
									})]
								}, s.id))
							})] })
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
						className: "flex min-w-0 flex-1 flex-col",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "flex gap-2 border-b border-border px-3 py-2 md:hidden",
								children: [
									"canvas",
									"style",
									"history"
								].map((k) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									onClick: () => setMobile(k),
									className: cn("h-9 flex-1 rounded-md text-sm", mobile === k ? "bg-surface-2 text-fg" : "text-muted"),
									children: k === "canvas" ? "画布" : k === "style" ? "风格" : "版本"
								}, k))
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: cn("min-h-0 flex-1 overflow-auto p-4", mobile !== "canvas" && "hidden md:block"),
								children: [pair.length === 0 && !currentImg ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex h-full min-h-[280px] flex-col items-center justify-center rounded-lg border border-dashed border-border text-center",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PanelLeft, { className: "mb-3 size-5 text-subtle" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "text-sm text-muted",
										children: "选物料槽，填一句内容，出两张变体"
									})]
								}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "grid h-full gap-3 md:grid-cols-2",
									children: [beforeUrl ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("figure", {
										className: "overflow-hidden rounded-lg border border-border bg-surface",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("figcaption", {
											className: "border-b border-border px-3 py-2 text-xs text-subtle",
											children: "改前"
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
											src: beforeUrl,
											alt: "改前",
											className: "max-h-[62vh] w-full object-contain"
										})]
									}) : null, pair.map((rev, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("figure", {
										className: "overflow-hidden rounded-lg border border-border bg-surface",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("figcaption", {
											className: "flex items-center justify-between border-b border-border px-3 py-2 text-xs text-subtle",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
												rev.diff,
												" · rev",
												rev.styleRev,
												asset?.adoptedId === rev.id ? " · 采用" : ""
											] }), asset?.adoptedId !== rev.id ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
												className: "text-accent",
												onClick: () => adoptImage(style.id, slot, rev.id),
												children: "采用"
											}) : null]
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
											src: rev.url,
											alt: `变体 ${i + 1}`,
											className: "max-h-[62vh] w-full object-contain"
										})]
									}, rev.id))]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "mt-4 rounded-lg border border-border bg-surface p-3",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "flex flex-wrap gap-2",
											children: TUNE_PRESETS.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
												size: "sm",
												variant: "outline",
												disabled: generating || !currentImg,
												onClick: () => void runTune(t.instruction, false),
												children: t.label
											}, t.id))
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "mt-3 grid gap-3 sm:grid-cols-3",
											children: [
												["brightness", "明暗"],
												["warmth", "冷暖"],
												["contrast", "对比"]
											].map(([k, label]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
												className: "text-xs text-muted",
												children: [label, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
													type: "range",
													min: 0,
													max: 100,
													value: sliders[k],
													disabled: generating || !currentImg,
													onChange: (e) => setSliders((s) => ({
														...s,
														[k]: Number(e.target.value)
													})),
													className: "mt-1 w-full accent-accent"
												})]
											}, k))
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "mt-3 flex flex-wrap gap-2",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
												disabled: generating || !currentImg,
												onClick: () => void runTune(sliderInstruction(), false),
												children: "只改此图"
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
												variant: "outline",
												disabled: generating || !currentImg,
												onClick: () => void runTune(sliderInstruction(), true),
												children: "写回风格…"
											})]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
											className: "mt-2 text-xs text-subtle",
											children: "默认只改这一张。写回才会影响以后出的新图，已采用的旧图不变脸。"
										})
									]
								})]
							}),
							mobile === "style" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "overflow-auto p-4 md:hidden",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StyleCard, { dna })
							}) : null
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
						className: cn("w-full shrink-0 overflow-y-auto border-l border-border md:w-[300px]", mobile !== "history" && "hidden md:block"),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex border-b border-border",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								className: cn("flex-1 py-3 text-sm", tab === "image" ? "text-fg" : "text-muted"),
								onClick: () => setTab("image"),
								children: "图版本"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								className: cn("flex-1 py-3 text-sm", tab === "style" ? "text-fg" : "text-muted"),
								onClick: () => setTab("style"),
								children: "风格版本"
							})]
						}), tab === "image" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
							className: "p-3",
							children: [(asset?.revs ?? []).slice().reverse().map((r, idx, arr) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								className: "flex w-full gap-3 rounded-md p-2 text-left hover:bg-surface-2",
								onClick: () => adoptImage(style.id, slot, r.id),
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
									src: r.url,
									alt: "",
									className: "h-12 w-16 rounded-sm object-cover"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "min-w-0",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
										className: "block truncate text-sm text-fg",
										children: [
											"v",
											arr.length - idx,
											" · ",
											r.diff
										]
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
										className: "text-xs text-subtle",
										children: [r.action, asset?.adoptedId === r.id ? " · 采用" : ""]
									})]
								})]
							}) }, r.id)), !asset?.revs.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "p-3 text-sm text-subtle",
								children: "这个槽还没有图版本"
							}) : null]
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
							className: "p-3",
							children: style.revs.slice().reverse().map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								className: "w-full rounded-md p-2 text-left hover:bg-surface-2",
								onClick: () => setStyleRev(style.id, r.rev),
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "block text-sm text-fg",
									children: [
										"rev",
										r.rev,
										" · ",
										r.changeLog,
										style.currentRev === r.rev ? " · 当前" : ""
									]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-xs text-subtle",
									children: "之后新图跟这个 DNA，旧图不变"
								})]
							}) }, r.rev))
						})]
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("footer", {
				className: "grid shrink-0 gap-2 border-t border-border p-3 md:grid-cols-[1fr_auto]",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "flex gap-1 overflow-x-auto md:hidden",
						children: SLOTS.map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							onClick: () => setSlot(s.id),
							className: cn("h-10 shrink-0 rounded-md px-3 text-sm", slot === s.id ? "bg-accent text-accent-fg" : "bg-surface text-muted"),
							children: s.label
						}, s.id))
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						value: content,
						onChange: (e) => setContent(e.target.value),
						placeholder: "一句内容：产品名 / 卖点 / 活动名",
						disabled: generating,
						className: "h-11 rounded-md border border-border bg-surface px-3 text-sm outline-none placeholder:text-subtle focus:border-accent"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						className: "h-11",
						disabled: generating,
						onClick: () => void runGenerate(),
						children: generating ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, { className: "size-4 animate-spin" }), busyLabel ?? "生成中"] }) : "出 2 张"
					})
				]
			}),
			confirmWrite ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "fixed inset-0 z-50 flex items-end justify-center bg-bg/70 p-4 md:items-center",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "w-full max-w-md rounded-lg border border-border bg-surface p-5",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							className: "font-display text-xl",
							children: "写回风格？"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-2 text-sm leading-relaxed text-muted",
							children: "会影响这条风格线以后出的新图。已采用的图不会自动变。确定要把这次修改升为新的风格版本吗？"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-5 flex gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								className: "flex-1",
								onClick: () => void applyTune(confirmWrite.instruction, true),
								children: "写回并微调"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								variant: "outline",
								className: "flex-1",
								onClick: () => setConfirmWrite(null),
								children: "取消"
							})]
						})
					]
				})
			}) : null
		]
	});
}
function StyleCard({ dna }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "rounded-lg border border-border bg-surface p-3",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "font-display text-lg",
				children: dna.name
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 text-xs leading-relaxed text-muted",
				children: dna.oneLiner
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-3 flex gap-1",
				children: Object.values(dna.colors).map((hex) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "h-6 flex-1 rounded-sm",
					style: { background: hex },
					title: hex
				}, hex))
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "mt-3 text-xs text-subtle",
				children: ["不要：", dna.forbidden.join(" / ")]
			})
		]
	});
}
function Home() {
	const [mounted, setMounted] = (0, import_react.useState)(false);
	(0, import_react.useEffect)(() => setMounted(true), []);
	const project = useStudio((s) => s.current());
	if (!mounted || !project) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BriefView, {});
	if (project.phase === "studio") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StudioView, {});
	if (project.phase === "direction") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DirectionView, {});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BriefView, {});
}
//#endregion
export { Home as component };
