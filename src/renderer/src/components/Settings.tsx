import type { JSX, ReactNode } from "react";
import { TwoLine } from "./primitives";
import { type SettingsSection, actions, useStore } from "@/lib/store";

const SECTIONS: { key: SettingsSection; label: string }[] = [
	{ key: "model", label: "Model" },
	{ key: "permissions", label: "Permissions" },
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
							<Group title="Defaults" desc="What pi starts a new session with, from its own settings.json.">
								<Row name="Provider" value={settings?.defaultProvider || "not set"} />
								<Row name="Model" value={settings?.defaultModel || "not set"} />
								<Row name="Thinking level" value={settings?.defaultThinkingLevel ?? "medium"} />
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

						{section === "about" ? (
							<Group title="kodepi" desc="A reader for pi's own session store. Nothing is written to it.">
								<Row name="pi version" value={settings?.piVersion ?? "not found on this machine"} />
								<Row name="Agent directory" value={settings?.agentDir ?? ""} />
								<Row name="Sending prompts" value="Needs a live pi process — the next pass" />
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
