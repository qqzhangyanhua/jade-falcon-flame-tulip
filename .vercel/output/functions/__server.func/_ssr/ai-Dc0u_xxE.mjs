import { n as TSS_SERVER_FUNCTION, t as createServerFn } from "./ssr.mjs";
import { n as fallbackBoardSvg, t as PRESETS } from "./presets-CUK2UyIj.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/ai-Dc0u_xxE.js
var createServerRpc = (serverFnMeta, splitImportFn) => {
	const url = "/_serverFn/" + serverFnMeta.id;
	return Object.assign(splitImportFn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
function candidatePrompt(dna, product) {
	return [
		`A single cinematic presentation board, 16:9, split cleanly in two halves.`,
		`LEFT HALF: a realistic high-fidelity smartphone UI screenshot of "${product}" home screen.`,
		`Real mobile app interface, status bar, navigation, cards, typography, not a 3D phone mock floating in space.`,
		`RIGHT HALF: a brand key visual / campaign poster for the same product, large type, one hero still-life or figure, generous composition.`,
		`Both halves share ONE visual system: ${dna.promptPositive}.`,
		`Palette strictly: background ${dna.colors.bg}, surface ${dna.colors.surface}, text ${dna.colors.text}, primary ${dna.colors.primary}, accent ${dna.colors.accent}.`,
		`Mood: ${dna.mood.join(", ")}. Lighting: ${dna.light}. Material: ${dna.material}. Density: ${dna.density}. Geometry: ${dna.geometry}.`,
		`Style name feeling: ${dna.name} — ${dna.oneLiner}.`,
		`No logos of real brands. No watermark. No split-screen device photo studio. Avoid: ${dna.promptNegative}, ${dna.forbidden.join(", ")}.`
	].join(" ");
}
function slotPrompt(dna, slot, product, content) {
	const extra = content.trim() ? `Headline / offer: "${content.trim()}".` : "";
	const shared = [
		`Visual system: ${dna.promptPositive}.`,
		`Palette: bg ${dna.colors.bg}, surface ${dna.colors.surface}, text ${dna.colors.text}, primary ${dna.colors.primary}, accent ${dna.colors.accent}.`,
		`Lighting ${dna.light}, material ${dna.material}, density ${dna.density}, geometry ${dna.geometry}.`,
		extra,
		`Avoid: ${dna.promptNegative}, ${dna.forbidden.join(", ")}. No real-brand logos, no watermark.`
	].join(" ");
	if (slot === "ui_hero") return `High-fidelity mobile app UI screenshot of "${product}" flagship home screen, full-bleed interface, realistic iOS/Android UI, readable Chinese or English UI copy, not a poster. ${shared}`;
	if (slot === "kv") return `Brand key visual poster for "${product}", cinematic still, large refined typography, one hero subject, campaign-quality, 16:9. ${shared}`;
	return `Website homepage hero, 16:9 desktop screenshot of "${product}" marketing site, navigation, headline, CTA, hero image, realistic web UI. ${shared}`;
}
function tunePrompt(dna, instruction) {
	return `Edit this design image. Keep the same product, layout structure, and brand. ${instruction}. Stay inside the visual system: ${dna.promptPositive}. Palette ${dna.colors.bg} / ${dna.colors.primary} / ${dna.colors.accent}. Avoid ${dna.promptNegative}.`;
}
var SLOT_ASPECT = {
	candidate: "16:9",
	ui_hero: "9:16",
	kv: "16:9",
	web_home: "16:9"
};
var IMAGE_MODEL = "grok-imagine-image-2.0";
var CHAT_MODEL = "grok-4.5";
function key() {
	return process.env.XAI_API_KEY?.trim() || void 0;
}
async function chatJson(prompt) {
	const apiKey = key();
	if (!apiKey) return null;
	const res = await fetch("https://api.x.ai/v1/chat/completions", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`
		},
		body: JSON.stringify({
			model: CHAT_MODEL,
			temperature: .3,
			max_tokens: 500,
			response_format: { type: "json_object" },
			messages: [{
				role: "system",
				content: "Return only valid JSON. No markdown."
			}, {
				role: "user",
				content: prompt
			}]
		})
	});
	if (!res.ok) return null;
	const text = (await res.json()).choices?.[0]?.message?.content ?? "";
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}
async function generateImage(opts) {
	const apiKey = key();
	if (!apiKey) return { error: "missing-key" };
	const res = await fetch("https://api.x.ai/v1/images/generations", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`
		},
		body: JSON.stringify({
			model: IMAGE_MODEL,
			prompt: opts.prompt,
			n: opts.n ?? 1,
			resolution: "1K",
			aspect_ratio: opts.aspect,
			response_format: "url"
		})
	});
	if (!res.ok) {
		const t = await res.text().catch(() => "");
		return { error: `image ${res.status} ${t.slice(0, 180)}` };
	}
	const urls = ((await res.json()).data ?? []).map((d) => d.url || (d.b64_json ? `data:image/png;base64,${d.b64_json}` : "")).filter(Boolean);
	if (!urls.length) return { error: "empty-image" };
	return { urls };
}
async function editImage(opts) {
	const apiKey = key();
	if (!apiKey) return { error: "missing-key" };
	const res = await fetch("https://api.x.ai/v1/images/edits", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`
		},
		body: JSON.stringify({
			model: IMAGE_MODEL,
			prompt: opts.prompt,
			image: {
				url: opts.imageUrl,
				type: "image_url"
			},
			resolution: "1K",
			aspect_ratio: opts.aspect,
			response_format: "url"
		})
	});
	if (!res.ok) {
		const t = await res.text().catch(() => "");
		return { error: `edit ${res.status} ${t.slice(0, 180)}` };
	}
	const urls = ((await res.json()).data ?? []).map((d) => d.url || (d.b64_json ? `data:image/png;base64,${d.b64_json}` : "")).filter(Boolean);
	if (!urls.length) return { error: "empty-edit" };
	return { urls };
}
var parseBrief_createServerFn_handler = createServerRpc({
	id: "e9d121d1b037414d46ecf32dedea334ef6b22a469e132e04705f0407494c798a",
	name: "parseBrief",
	filename: "src/lib/ai.ts"
}, (opts) => parseBrief.__executeServer(opts));
var parseBrief = createServerFn({ method: "POST" }).validator((input) => input).handler(parseBrief_createServerFn_handler, async ({ data }) => {
	const parsed = await chatJson(`Extract a product visual brief from this Chinese/English description. JSON keys: productName, category, audience, platform ("app"|"web"), mood (2 short english words), forbidden (up to 3 english style words to avoid).\nText: ${data.brief}`);
	return {
		productName: parsed?.productName || data.brief.slice(0, 20) || "未命名产品",
		category: parsed?.category || "product",
		audience: parsed?.audience || "general",
		platform: parsed?.platform === "web" ? "web" : "app",
		mood: parsed?.mood?.length ? parsed.mood : ["clear", "modern"],
		forbidden: parsed?.forbidden ?? []
	};
});
var generateCandidate_createServerFn_handler = createServerRpc({
	id: "672765f2db7341b5f238eac3313e40b0af23a28231e08935ac1b706da87acb1b",
	name: "generateCandidate",
	filename: "src/lib/ai.ts"
}, (opts) => generateCandidate.__executeServer(opts));
var generateCandidate = createServerFn({ method: "POST" }).validator((input) => input).handler(generateCandidate_createServerFn_handler, async ({ data }) => {
	const preset = PRESETS.find((p) => p.id === data.presetId) ?? PRESETS[0];
	const result = await generateImage({
		prompt: candidatePrompt(preset.dna, data.product),
		aspect: SLOT_ASPECT.candidate,
		n: 1
	});
	if ("urls" in result) return {
		ok: true,
		url: result.urls[0],
		source: "ai"
	};
	return {
		ok: true,
		url: fallbackBoardSvg({
			dna: preset.dna,
			title: data.product,
			kind: "candidate"
		}),
		source: "fallback"
	};
});
var generateSlotFn_createServerFn_handler = createServerRpc({
	id: "9c74c699c1113db6d4609095f993dc78c82fee8a6f8dc50b22a2845bd0712d46",
	name: "generateSlotFn",
	filename: "src/lib/ai.ts"
}, (opts) => generateSlotFn.__executeServer(opts));
var generateSlotFn = createServerFn({ method: "POST" }).validator((input) => input).handler(generateSlotFn_createServerFn_handler, async ({ data }) => {
	const prompt = slotPrompt(data.dna, data.slot, data.product, data.content);
	const aspect = SLOT_ASPECT[data.slot];
	if (data.refUrl && !data.refUrl.startsWith("data:image/svg")) {
		const edited = await editImage({
			prompt: `${prompt} Keep the same visual DNA as the reference. ${data.slot === "ui_hero" ? "Preserve layout structure if the reference is a wireframe." : "Match color, light, and material of the reference."}`,
			imageUrl: data.refUrl,
			aspect
		});
		if ("urls" in edited) return {
			ok: true,
			urls: edited.urls.slice(0, 2)
		};
	}
	const result = await generateImage({
		prompt,
		aspect,
		n: 2
	});
	if ("urls" in result) return {
		ok: true,
		urls: result.urls.slice(0, 2)
	};
	return {
		ok: true,
		urls: [fallbackBoardSvg({
			dna: data.dna,
			title: data.product,
			kind: data.slot
		}), fallbackBoardSvg({
			dna: data.dna,
			title: `${data.product} · B`,
			kind: data.slot
		})]
	};
});
var tuneImageFn_createServerFn_handler = createServerRpc({
	id: "8f78fdd82cddce23b9a0e70db9cb5ba3f957b88e9fbd86c49ca15c628d372d1a",
	name: "tuneImageFn",
	filename: "src/lib/ai.ts"
}, (opts) => tuneImageFn.__executeServer(opts));
var tuneImageFn = createServerFn({ method: "POST" }).validator((input) => input).handler(tuneImageFn_createServerFn_handler, async ({ data }) => {
	const prompt = tunePrompt(data.dna, data.instruction);
	if (!data.imageUrl.startsWith("data:image/svg")) {
		const edited = await editImage({
			prompt,
			imageUrl: data.imageUrl,
			aspect: SLOT_ASPECT[data.slot]
		});
		if ("urls" in edited) return {
			ok: true,
			url: edited.urls[0],
			source: "ai"
		};
	}
	return {
		ok: true,
		url: fallbackBoardSvg({
			dna: data.dna,
			title: data.instruction.slice(0, 18) || "tune",
			kind: data.slot
		}),
		source: "fallback"
	};
});
//#endregion
export { generateCandidate_createServerFn_handler, generateSlotFn_createServerFn_handler, parseBrief_createServerFn_handler, tuneImageFn_createServerFn_handler };
