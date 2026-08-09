import type { JSX, ReactNode } from "react";
import type { SkillMode } from "@shared/model";
import { SKILL_MODES, SKILL_MODE_HELP, SKILL_MODE_LABEL, THINKING_LEVELS, modelRef } from "@shared/model";
import { BrandIcon } from "./BrandIcon";
import { EffortSlider, LEVEL_LABEL } from "./EffortSlider";
import { TwoLine } from "./primitives";
import { type SettingsSection, actions, useStore } from "@/lib/store";

const SECTIONS: { key: SettingsSection; label: string }[] = [
	{ key: "model", label: "Model" },
	{ key: "permissions", label: "Permissions" },
	{ key: "skills", label: "Skills" },
	{ key: "workflows", label: "Workflows" },
	{ key: "about", label: "About" },
];

function Row({ name, value }: { name: string; value: string }): JSX.Element {
	return (
		<div className="menu__row setoption">
			<TwoLine name={name} sub={value} />
		</div>
	);
}

function Group({ title, desc, children }: { title: string; desc: string; children: ReactNode }): JSX.Element {
	return (
		<div className="setgroup">
			<div className="setgroup__head">
				<span className="setgroup__title">{title}</span>
				<span className="setgroup__desc">{desc}</span>
			</div>
			<div className="setgroup__options">{children}</div>
		</div>
	);
}

/**
 * How hard pi thinks in a session it has not started yet.
 *
 * The same groove as the composer's chip, on purpose — one control for one
 * idea. What it writes is different, and the footnote says so: the chip moves a
 * pi that is running, this writes the line a new one starts from.
 */
function ThinkingPicker(): JSX.Element {
	const level = useStore((s) => s.settings?.defaultThinkingLevel ?? "medium");

	return (
		<div className="setpick">
			<div className="effort__head">
				<span className="effort__head-label">Thinking level</span>
				<span className="effort__head-name">{LEVEL_LABEL[level]}</span>
			</div>
			<EffortSlider level={level} levels={THINKING_LEVELS} writable onPick={(picked) => void actions.setDefaultThinkingLevel(picked)} />
			<div className="effort__note">All seven of pi&apos;s. Which of them a model actually offers is a running pi&apos;s answer — the chat panel&apos;s chip shows those.</div>
		</div>
	);
}

/** One model to choose, with the mark of whoever made it. */
function ModelRow({ provider, id, name, current }: { provider: string; id: string; name: string; current: string }): JSX.Element {
	const ref = modelRef(provider, id);

	return (
		<button
			type="button"
			className={`menu__row modelrow${ref === current ? " modelrow--on" : ""}`}
			// The pair, never the id alone: `deepseek-v4-flash` is offered by two
			// providers here, and only the pair says which one bills for it.
			data-model={ref}
			onClick={() => void actions.setDefaultModel(provider, id)}
		>
			<span className="menu__check">{ref === current ? "✓" : ""}</span>
			<BrandIcon provider={provider} model={id} />
			<span className="menu__body">
				<span className="menu__name">{name}</span>
				<span className="menu__sub">{ref}</span>
			</span>
		</button>
	);
}

/**
 * The model a new session starts on: shut until asked, then a list to pick from.
 *
 * Built rather than a native `<select>` because an `<option>` cannot hold a
 * logo, and the logo is the point — `opencode-go` alone resells Qwen, Kimi, GLM
 * and Grok, which the model id says and the provider does not. It opens in the
 * flow rather than over it: the settings sheet scrolls and clips, so a floating
 * panel would be cut off at the first group.
 *
 * Chosen as a pair, `provider/id`. That literal string is under each name, so
 * the panel and pi's settings file can never look like they disagree.
 */
function ModelPicker(): JSX.Element {
	const settings = useStore((s) => s.settings);
	const models = useStore((s) => s.models);
	const busy = useStore((s) => s.modelsBusy);
	const open = useStore((s) => s.menu === "defmodel");

	const provider = settings?.defaultProvider ?? "";
	const id = settings?.defaultModel ?? "";
	const current = modelRef(provider, id);
	const list = models ?? [];
	const known = list.find((model) => modelRef(model.provider, model.id) === current);
	const providers = [...new Set(list.map((model) => model.provider))];

	return (
		<div className="modelpick">
			<button type="button" className="menu__row modelpick__now" onClick={() => actions.toggleMenu("defmodel")}>
				<BrandIcon provider={provider} model={id} />
				<span className="menu__body">
					<span className="menu__name">{known?.name || id || "Not set"}</span>
					<span className="menu__sub">{busy ? "asking pi which models it is configured for…" : current || "pi chooses for itself"}</span>
				</span>
				<span className="modelpick__caret">▾</span>
			</button>

			{open ? (
				<div className="modelpick__list">
					{!busy && list.length === 0 ? <div className="modelpick__note">pi did not answer with a model list.</div> : null}

					{/* What the file says outlives what pi still offers. Dropping this
					    row would leave the panel looking as though nothing were set. */}
					{current && !known ? (
						<>
							<div className="modelpick__head">
								<BrandIcon provider={provider} model={id} size={13} />
								set in pi&apos;s settings
							</div>
							<ModelRow provider={provider} id={id} name={id} current={current} />
						</>
					) : null}

					{providers.map((name) => (
						<div key={name}>
							<div className="modelpick__head">
								{/* The provider's own mark, not the model's: this heading is
								    about who serves them, whoever made them. */}
								<BrandIcon provider={name} size={13} />
								{name}
							</div>
							{list
								.filter((model) => model.provider === name)
								.map((model) => (
									<ModelRow key={modelRef(model.provider, model.id)} provider={model.provider} id={model.id} name={model.name} current={current} />
								))}
						</div>
					))}
				</div>
			) : null}
		</div>
	);
}

/**
 * The skills on disk, and what each is costing the prompt.
 *
 * A table because these are one row of the same shape repeated, and because the
 * mode is the point: the description is truncated to one line so the column
 * that matters stays where the eye can run down it.
 */
function SkillTable(): JSX.Element {
	const list = useStore((s) => s.skills);
	const busy = useStore((s) => s.skillsBusy);
	const cwd = useStore((s) => s.skillsCwd);

	if (busy && !list) return <Group title="Skills" desc="Reading the skill directories."><Row name="Reading…" value={cwd} /></Group>;

	const skills = list?.skills ?? [];

	return (
		<div className="setgroup">
			<div className="setgroup__head">
				<span className="setgroup__title">Skills</span>
				<span className="setgroup__desc">
					{skills.length === 0
						? `No SKILL.md found for ${cwd || "this directory"}.`
						: `${skills.length} for ${cwd}. A mode takes effect on pi's next request.`}
				</span>
			</div>

			{skills.length > 0 ? (
				<div className="sktable">
					<div className="sktable__head">
						<span>Skill</span>
						<span>What it does</span>
						<span>Where</span>
						<span>Loading</span>
					</div>

					{skills.map((skill) => (
						<div className="sktable__row" key={skill.path}>
							<span className="sktable__name" title={skill.path}>
								{skill.name}
							</span>
							<span className="sktable__desc" title={skill.description}>
								{skill.description || "—"}
							</span>
							<span className="sktable__scope">{skill.scope}</span>
							<select
								className={`sktable__mode${skill.inherited ? " sktable__mode--inherited" : ""}`}
								value={skill.mode}
								title={`${SKILL_MODE_HELP[skill.mode]}${skill.inherited ? " Inherited from the default — nothing is set for this skill." : ""}`}
								onChange={(e) => void actions.setSkillMode(skill.name, e.target.value as SkillMode)}
							>
								{SKILL_MODES.map((mode) => (
									<option key={mode} value={mode}>
										{SKILL_MODE_LABEL[mode]}
									</option>
								))}
							</select>
						</div>
					))}
				</div>
			) : null}

			<div className="sktable__foot">
				{list ? `Default for anything unset: ${SKILL_MODE_LABEL[list.fallback]}, kept in ${list.store}. ` : ""}
				Off is pi's own: it stops the skill loading at all, so it has no prompt entry and no /skill: command. "When asked" keeps
				the command and costs nothing.
				{list && !list.enabled ? " Skill loading is switched off in pi, so every skill it does load is listed whatever this column says." : ""}
			</div>
		</div>
	);
}

export function Settings(): JSX.Element {
	const section = useStore((s) => s.settingsSection);
	const settings = useStore((s) => s.settings);
	const workflows = useStore((s) => s.workflows);
	const notice = useStore((s) => s.notice);

	return (
		<div className="scrim scrim--settings" onClick={actions.closeSettings}>
			<div className="settings" onClick={(e) => e.stopPropagation()}>
				<div className="settings__head">
					<span className="settings__title">Settings</span>
					<span className="spacer" />
					<button type="button" className="settings__close" onClick={actions.closeSettings}>
						✕
					</button>
				</div>

				<div className="settings__body">
					<div className="settings__nav">
						{SECTIONS.map((s) => (
							<button
								type="button"
								key={s.key}
								className={section === s.key ? "on" : ""}
								onClick={() => actions.setSettingsSection(s.key)}
							>
								{s.label}
							</button>
						))}
					</div>

					<div className="settings__panel">
						{section === "model" ? (
							<Group
								title="Defaults"
								desc="What pi starts a new session with, from its own settings.json. A chat already running keeps the model it started on."
							>
								<ModelPicker />
								<ThinkingPicker />
								<Row name="Advisor model" value={settings?.advisorModel ?? "not configured"} />
							</Group>
						) : null}

						{section === "permissions" ? (
							<Group
								title="Permission rules"
								desc="pi decides what runs without asking. These are counts — the patterns stay in pi's settings. pi's own documentation says this is not a sandbox."
							>
								<Row name="Default mode" value={settings?.permissionMode ?? "auto"} />
								<Row name="Allow rules" value={String(settings?.allowRules ?? 0)} />
								<Row name="Ask rules" value={String(settings?.askRules ?? 0)} />
								<Row name="Deny rules" value={String(settings?.denyRules ?? 0)} />
							</Group>
						) : null}

						{section === "workflows" ? (
							<Group title="Workflow runs" desc={`Read from ${settings?.agentDir ?? "pi's agent directory"}/workflow-runs.`}>
								<Row name="Runs recorded" value={String(workflows.length)} />
								<Row name="Runs with agents" value={String(workflows.filter((w) => w.agentCount > 0).length)} />
								<Row
									name="Total cost"
									value={`$${workflows.reduce((n, w) => n + w.costUsd, 0).toFixed(2)} — pi's estimate`}
								/>
							</Group>
						) : null}

						{section === "skills" ? <SkillTable /> : null}

						{section === "about" ? (
							<Group title="kodepi" desc="Reads pi's session store, and drives pi itself. Only pi writes to the store.">
								<Row name="pi version" value={settings?.piVersion ?? "not found on this machine"} />
								<Row name="Agent directory" value={settings?.agentDir ?? ""} />
								<Row name="Sending prompts" value="Start a session, or continue one — pi runs it" />
								<Row name="Writable settings" value="The default model, a skill's mode, and a live pi's thinking level" />
							</Group>
						) : null}
					</div>
				</div>

				<div className="settings__foot">
					<button type="button" className="btn btn--outline btn--sm" onClick={actions.revealAgentDir}>
						Reveal agent directory
					</button>
					{notice ? <span className="settings__notice">{notice}</span> : null}
					<span className="spacer" />
					<span>esc close</span>
				</div>
			</div>
		</div>
	);
}
