import type { JSX } from "react";
import { GearIcon, PlusIcon, SearchIcon, SkillIcon } from "./icons";
import { ProjectTree } from "./ProjectTree";
import { UsageMeters } from "./UsageMeters";
import { actions, useStore } from "@/lib/store";

export function LeftRail(): JSX.Element {
	const settings = useStore((s) => s.settings);
	const newChat = useStore((s) => s.newChat);
	// Absent rather than zero until the directories have been read.
	const skills = useStore((s) => s.skills?.skills.length ?? 0);

	return (
		<div className="rail">
			<button type="button" className="rail__search" onClick={actions.openPalette}>
				<SearchIcon />
				<span className="rail__search-label">Search</span>
				<span className="spacer" />
				<span className="hint">⌘K</span>
			</button>

			<div className="rail__nav">
				<button type="button" className={`rail__item${newChat ? " rail__item--on" : ""}`} onClick={() => void actions.openNewChat()}>
					<PlusIcon />
					<span className="rail__item-label">New</span>
				</button>
				<button type="button" className="rail__item" onClick={() => actions.openSettings("skills")}>
					<SkillIcon />
					<span className="rail__item-label">Skills</span>
					{skills ? <span className="rail__item-count">{skills}</span> : null}
				</button>
			</div>

			<div className="rail__head">
				<span className="section-label">PROJECTS</span>
				<span className="spacer" />
			</div>

			<ProjectTree />
			<UsageMeters />

			<button type="button" className="rail__settings" onClick={() => actions.openSettings()}>
				<GearIcon />
				<span className="rail__settings-label">Settings</span>
				<span className="spacer" />
				<span className="rail__user">{settings?.piVersion ? `pi ${settings.piVersion}` : "pi not found"}</span>
			</button>
		</div>
	);
}
