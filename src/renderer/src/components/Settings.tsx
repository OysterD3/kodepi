import type { JSX, ReactNode } from "react";
import { useState } from "react";
import type { ModelRole, SkillMode } from "@shared/model";
import { SKILL_MODES, SKILL_MODE_HELP, SKILL_MODE_LABEL, THINKING_LEVELS, activeRoles, modelRef, parseRef } from "@shared/model";
import { BrandIcon } from "./BrandIcon";
import { EffortSlider, LEVEL_LABEL } from "./EffortSlider";
import { TwoLine } from "./primitives";
import { type MenuId, type SettingsSection, actions, useStore } from "@/lib/store";

const SECTIONS: { key: SettingsSection; label: string }[] = [
	{ key: "model", label: "Model" },
	{ key: "combos", label: "Combinations" },
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

/**
 * Which model the advisor extension consults.
 *
 * The choices are roles rather than models. `models.providers.<active>` in pi's
 * settings maps names like `frontier` and `cheap` onto real references, and
 * `/provider` moves the whole profile at once — so a role here follows the
 * provider everything else is on, and a model would be left behind by the next
 * switch. What each role resolves to today is under the name, because the role
 * alone does not say what will be billed.
 */
function AdvisorPicker(): JSX.Element {
	const settings = useStore((s) => s.settings);
	const roles = activeRoles(settings);
	const current = settings?.advisorModel ?? "";
	const known = roles.find((role) => role.name === current);

	const sub = known
		? known.ref
		: current
			? `${current} — no role of that name in this profile, so pi reads it as a model`
			: "not set, and the advisor tool is not offered until it is";

	// With no combination in force there is no role to name, and pi resolves
	// this key the way it resolves --model — so the model list is the choice,
	// rather than a row that says what is missing and offers nothing.
	if (roles.length === 0) {
		return (
			<div className="setrole">
				<div className="setrole__label">Advisor model</div>
				<ModelPicker menu="advisor" set={current} onPick={(provider, id) => void actions.setAdvisorModel(modelRef(provider, id))} />
				<div className="effort__note">
					A model, because no combination is in force to take a role from. Put one in force and this becomes a role, which follows it.
				</div>
			</div>
		);
	}

	return (
		<div className="setrole">
			<div className="menu__row setoption setrole__row">
				<span className="menu__body">
					<span className="menu__name">Advisor model</span>
					<span className="menu__sub">{sub}</span>
				</span>

				<select
					className="setrole__select setrole__pick"
					value={known ? known.name : ""}
					aria-label="Advisor model"
					onChange={(e) => {
						if (e.target.value) void actions.setAdvisorModel(e.target.value);
					}}
				>
					{/* What the file holds, kept in view rather than silently
					    redrawn as whichever role happens to come first. */}
					{known ? null : <option value="">{current || "not set"}</option>}
					{roles.map((role) => (
						<option key={role.name} value={role.name}>
							{role.name}
						</option>
					))}
				</select>
			</div>

			<div className="effort__note">
				{`The ${settings?.modelProfile ?? ""} combination's roles. "session" is the model you are already talking to, so an advisor pointed at it gives up the second opinion.`}
			</div>
		</div>
	);
}

/** One model to choose, with the mark of whoever made it. */
function ModelRow({ provider, id, name, current, onPick }: { provider: string; id: string; name: string; current: string; onPick: (provider: string, id: string) => void }): JSX.Element {
	const ref = modelRef(provider, id);

	return (
		<button
			type="button"
			className={`menu__row modelrow${ref === current ? " modelrow--on" : ""}`}
			// The pair, never the id alone: `deepseek-v4-flash` is offered by two
			// providers here, and only the pair says which one bills for it.
			data-model={ref}
			onClick={() => onPick(provider, id)}
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
 * One model, chosen from what pi has: shut until asked, then a list.
 *
 * Built rather than a native `<select>` because an `<option>` cannot hold a
 * logo, and the logo is the point — `opencode-go` alone resells Qwen, Kimi, GLM
 * and Grok, which the model id says and the provider does not. It opens in the
 * flow rather than over it: the settings sheet scrolls and clips, so a floating
 * panel would be cut off at the first group.
 *
 * Chosen as a pair, `provider/id`. That literal string is under each name, so
 * the panel and pi's settings file can never look like they disagree. What is
 * set may carry a `:level` pin, which is shown and not matched on: the level is
 * the reference's, not the model's.
 */
function ModelPicker({ menu, set, onPick }: { menu: MenuId; set: string; onPick: (provider: string, id: string) => void }): JSX.Element {
	const models = useStore((s) => s.models);
	const busy = useStore((s) => s.modelsBusy);
	const open = useStore((s) => s.menu === menu);

	const { provider, id } = parseRef(set);
	const current = modelRef(provider, id);
	const list = models ?? [];
	const known = list.find((model) => modelRef(model.provider, model.id) === current);
	const providers = [...new Set(list.map((model) => model.provider))];

	return (
		<div className="modelpick">
			<button type="button" className="menu__row modelpick__now" onClick={() => actions.toggleMenu(menu)}>
				<BrandIcon provider={provider} model={id} />
				<span className="menu__body">
					<span className="menu__name">{known?.name || id || "Not set"}</span>
					{/* The whole reference, level and all, because that is the line
					    in the file this row stands for. */}
					<span className="menu__sub">{busy ? "asking pi which models it is configured for…" : set || "pi chooses for itself"}</span>
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
							<ModelRow provider={provider} id={id} name={id} current={current} onPick={onPick} />
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
									<ModelRow key={modelRef(model.provider, model.id)} provider={model.provider} id={model.id} name={model.name} current={current} onPick={onPick} />
								))}
						</div>
					))}
				</div>
			) : null}
		</div>
	);
}

/**
 * The model a new session starts on — pi's own `defaultProvider`/`defaultModel`.
 *
 * A picker only while nothing else owns those two keys. Where a combination
 * carries a `session` role they are that role written out, so this reports them
 * and sends the choosing where the choice belongs: two controls writing one
 * setting would take turns undoing each other.
 *
 * It takes a `session` role, not merely a combination. `session` is the only
 * reserved role and nothing makes a profile define one, and a combination
 * without it leaves these two keys nobody's — which has to mean the picker,
 * or they could not be set at all.
 */
function DefaultModel(): JSX.Element {
	const settings = useStore((s) => s.settings);
	const set = modelRef(settings?.defaultProvider ?? "", settings?.defaultModel ?? "");
	const owner = activeRoles(settings).some((role) => role.name === "session") ? settings?.modelProfile : "";

	if (!settings || !owner) {
		return <ModelPicker menu="defmodel" set={set} onPick={(provider, id) => void actions.setDefaultModel(provider, id)} />;
	}

	return (
		<div className="setrole">
			<div className="menu__row setoption setrole__row">
				<BrandIcon provider={settings.defaultProvider} model={settings.defaultModel} />
				<span className="menu__body">
					<span className="menu__name">{set || "Not set"}</span>
					<span className="menu__sub">the session role of {owner}</span>
				</span>
				<button type="button" className="btn btn--outline btn--sm setrole__pick" onClick={() => actions.setSettingsSection("combos")}>
					Combinations
				</button>
			</div>
			<div className="effort__note">
				Kept on the combination in force. Change it there — as its <code>session</code> role, or by putting another combination in force.
			</div>
		</div>
	);
}

/**
 * One role of one combination, and the model it names.
 *
 * A picked model keeps the reference's `:level` pin only where the new model
 * has levels at all. Carrying `max` onto a model that does not reason would be
 * asking for a setting it cannot take, and the extensions that read a role pass
 * that level on to a process rather than clamping it.
 */
function RoleRow({ profile, role }: { profile: string; role: ModelRole }): JSX.Element {
	const models = useStore((s) => s.models);
	const { level } = parseRef(role.ref);

	const pick = (provider: string, id: string): void => {
		// Dropped only where pi has said the model has no levels. A model pi did
		// not list is a model pi has said nothing about, and the pin is the
		// user's — throwing it away on silence would edit a role they only
		// re-confirmed.
		const model = models?.find((m) => m.provider === provider && m.id === id);
		const pin = level && model?.reasoning !== false ? `:${level}` : "";
		void actions.setRoleModel(profile, role.name, `${modelRef(provider, id)}${pin}`);
	};

	return (
		<div className="combo__role">
			<span className="combo__role-name">{role.name}</span>
			{/* Keyed by the combination as well as the role: the same role name is
			    in every one of them, and one open list must not follow the tabs. */}
			<ModelPicker menu={`role:${profile}:${role.name}`} set={role.ref} onPick={pick} />
		</div>
	);
}

/**
 * The combinations, and which one is in force.
 *
 * A combination names a model for every job this configuration does — the one
 * you talk to, the one the advisor consults, the cheap one a classifier runs on
 * — so moving provider is one choice rather than eight. That is the `models`
 * block of pi's settings, which the `/provider` extension owns and calls a
 * profile; the settings that use it name a *role*, never a model.
 *
 * Looking at a combination and using one are kept apart. A switch rewrites the
 * model every new session starts on, which is not what wanting to read one is
 * asking for.
 */
function Combinations(): JSX.Element {
	const settings = useStore((s) => s.settings);
	const profiles = settings?.modelProfiles ?? [];
	const active = settings?.modelProfile ?? "";
	const [viewing, setViewing] = useState("");

	const shown = profiles.find((profile) => profile.name === (viewing || active)) ?? profiles[0];

	if (!shown) {
		return (
			<Group title="Combinations" desc="A model for every job, under one name, so moving provider is one choice rather than eight.">
				<div className="modelpick__note">
					pi&apos;s settings.json has no <code>models</code> block, so there is nothing here to switch between. The /provider extension writes
					that block; without it, the Model panel sets pi&apos;s own default and each extension keeps its own.
				</div>
			</Group>
		);
	}

	return (
		<Group
			title="Combinations"
			desc="A model for every job, under one name. Whatever names a role — the advisor, a classifier, pi's own default — follows the one in force."
		>
			<div className="combo__tabs">
				{profiles.map((profile) => (
					<button
						type="button"
						key={profile.name}
						className={`combo__tab${profile.name === shown.name ? " combo__tab--on" : ""}`}
						onClick={() => setViewing(profile.name)}
					>
						{profile.name}
						{profile.name === active ? <span className="combo__live">in force</span> : null}
					</button>
				))}
			</div>

			{shown.roles.map((role) => (
				<RoleRow key={role.name} profile={shown.name} role={role} />
			))}

			<div className="combo__foot">
				{shown.name === active ? (
					<span className="effort__note">
						In force. <code>session</code> is what a new chat starts on, and pi&apos;s own defaultProvider and defaultModel are kept on it. A
						chat already running keeps the model it started on.
					</span>
				) : (
					<>
						<button type="button" className="btn btn--outline btn--sm" onClick={() => void actions.setActiveProfile(shown.name)}>
							Use {shown.name}
						</button>
						<span className="effort__note">
							Switching moves every role at once, and pi&apos;s own default model to this combination&apos;s <code>session</code> — with the thinking
							level too, where that role pins one. Changing a single role above leaves the level alone.
						</span>
					</>
				)}
			</div>
		</Group>
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
								<DefaultModel />
								<ThinkingPicker />
								<AdvisorPicker />
							</Group>
						) : null}

						{section === "combos" ? <Combinations /> : null}

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
								<Row name="Writable settings" value="The combinations and which is in force, the default thinking level, the advisor's role, a skill's mode, and a live pi's thinking level" />
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
