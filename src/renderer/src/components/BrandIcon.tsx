/**
 * The brand mark for a model.
 *
 * Every `@lobehub/icons` import in this app is here, and each one reaches for a
 * single component rather than the package's front door. A brand's default
 * export carries an avatar variant that pulls in antd-style and emotion —
 * 254 kB for fourteen brands, against about 4 kB each for the plain mark, in an
 * app that has no emotion in it at all. The paths are internal, so if they ever
 * move the build says so rather than the app going quiet.
 *
 * The package's own `ModelIcon` would do this mapping for us, but it has to
 * carry every brand it knows to answer for an arbitrary name: 4.9 MB, against a
 * whole app of 1.1 MB. The table below is the same idea for the models pi
 * actually offers.
 *
 * Each mark is the brand's own colours where the brand has any, and the five
 * that do not are left to take their colour from the text beside them.
 */

import type { JSX } from "react";
import ChatGLM from "@lobehub/icons/es/ChatGLM/components/Color";
import Claude from "@lobehub/icons/es/Claude/components/Color";
import DeepSeek from "@lobehub/icons/es/DeepSeek/components/Color";
import Hunyuan from "@lobehub/icons/es/Hunyuan/components/Color";
import Kimi from "@lobehub/icons/es/Kimi/components/Color";
import Minimax from "@lobehub/icons/es/Minimax/components/Color";
import Qoder from "@lobehub/icons/es/Qoder/components/Color";
import Qwen from "@lobehub/icons/es/Qwen/components/Color";
// These five have no colour mark to import: their logos are one colour by
// design. Left in `currentColor`, they take the row's own — black on the day
// theme, white on the night one — which a hardcoded #000 would get wrong half
// the time.
import Anthropic from "@lobehub/icons/es/Anthropic/components/Mono";
import Grok from "@lobehub/icons/es/Grok/components/Mono";
import OpenAI from "@lobehub/icons/es/OpenAI/components/Mono";
import OpenCode from "@lobehub/icons/es/OpenCode/components/Mono";
import XiaomiMiMo from "@lobehub/icons/es/XiaomiMiMo/components/Mono";
import type { IconType } from "@lobehub/icons/es/types";

export interface Brand {
	/** Our own label, for reading the table by. The mark draws its own
	 *  `<title>` from the package, which spells a few of these differently. */
	readonly name: string;
	readonly Mark: IconType;
}

function brand(name: string, Mark: IconType): Brand {
	return { name, Mark };
}

/**
 * Matched against the model id, first prefix wins.
 *
 * This is read before the provider because a provider is often a reseller:
 * `opencode-go` serves Qwen, Kimi, GLM and Grok, and answering by provider
 * would put its own mark on all four.
 */
const BY_MODEL: readonly (readonly [string, Brand])[] = [
	["claude", brand("Claude", Claude)],
	["gpt", brand("OpenAI", OpenAI)],
	["deepseek", brand("DeepSeek", DeepSeek)],
	["qwen", brand("Qwen", Qwen)],
	// qoder names it `qmodel_38max` and calls it Qwen3.8-Max.
	["qmodel", brand("Qwen", Qwen)],
	["glm", brand("ChatGLM", ChatGLM)],
	["kimi", brand("Kimi", Kimi)],
	["minimax", brand("MiniMax", Minimax)],
	["grok", brand("Grok", Grok)],
	["mimo", brand("Xiaomi MiMo", XiaomiMiMo)],
	["hy", brand("Hunyuan", Hunyuan)],
];

/** For a model whose id does not say who made it — qoder's `lite`, and such. */
const BY_PROVIDER: Readonly<Record<string, Brand>> = {
	anthropic: brand("Anthropic", Anthropic),
	"openai-codex": brand("OpenAI", OpenAI),
	deepseek: brand("DeepSeek", DeepSeek),
	"opencode-go": brand("OpenCode", OpenCode),
	qoder: brand("Qoder", Qoder),
};

/** The provider's own mark, whatever it happens to resell. */
export function brandForProvider(provider: string): Brand | null {
	return BY_PROVIDER[provider.trim().toLowerCase()] ?? null;
}

/** The mark to draw for a model, or null when neither name is one we know. */
export function brandFor(provider: string, model: string): Brand | null {
	const id = model.trim().toLowerCase();
	const found = BY_MODEL.find(([prefix]) => id.startsWith(prefix));
	return found?.[1] ?? brandForProvider(provider);
}

/** Without a `model`, this is the provider's own mark — for a group heading. */
export function BrandIcon({ provider, model = "", size = 15 }: { provider: string; model?: string; size?: number }): JSX.Element {
	const found = brandFor(provider, model);
	// A blank of the same size, so a row we have no mark for still lines up.
	if (!found) return <span className="brand brand--none" style={{ width: size, height: size }} />;

	const Mark = found.Mark;
	return <Mark className="brand" size={size} />;
}
