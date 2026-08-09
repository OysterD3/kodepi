/**
 * The new-chat page.
 *
 * It takes the centre pane in place of a transcript, and asks the two things a
 * session needs before pi can start: where it runs, and what to say first.
 *
 * The chooser row reports as much as it sets. "Local" is a statement of fact —
 * kodepi runs pi on this machine and nowhere else — and the branch is read from
 * the directory. The worktree box is drawn because the row is not finished, and
 * disabled because nothing in this app writes to a repository.
 */

import type { JSX } from "react";
import { useState } from "react";
import { BranchIcon, FolderIcon, MachineIcon, SendIcon } from "./icons";
import { Menu, TwoLine } from "./primitives";
import { basename } from "@/lib/format";
import { actions, useStore } from "@/lib/store";

const WORKTREE_NOTE = "Nothing in kodepi writes to a repository. A chat runs in the directory itself, on the branch already checked out.";

function DirectoryChip(): JSX.Element {
	const cwd = useStore((s) => s.newCwd);
	const projects = useStore((s) => s.projects);
	const open = useStore((s) => s.menu === "newdir");

	return (
		<div className="menu-anchor">
			<button type="button" className="chip chip--framed" onClick={() => actions.toggleMenu("newdir")} title={cwd || "No directory chosen"}>
				<FolderIcon />
				<span className="chip__label chip__label--clip">{cwd ? basename(cwd) : "Choose a directory"}</span>
				<span className="chip__caret">▾</span>
			</button>

			{open ? (
				<Menu className="menu menu--below" width={320}>
					<div className="menu__head">PROJECTS</div>
					{projects.length === 0 ? <div className="menu__note">pi has not run anywhere yet. Use the folder button.</div> : null}
					<div className="newchat__picks">
						{projects.map((project) => (
							<button type="button" key={project.id} className="menu__row" onClick={() => void actions.setNewCwd(project.id)} title={project.id}>
								<TwoLine checked={project.id === cwd} name={project.name} sub={project.id} />
							</button>
						))}
					</div>
				</Menu>
			) : null}
		</div>
	);
}

export function NewChat(): JSX.Element {
	const cwd = useStore((s) => s.newCwd);
	const branch = useStore((s) => s.newBranch);
	const notice = useStore((s) => s.notice);
	const [draft, setDraft] = useState("");

	const send = (): void => {
		const message = draft.trim();
		if (!message || !cwd) return;
		void actions.startNewChat(message);
	};

	return (
		<div className="newchat">
			<div className="newchat__middle">
				<h1 className="newchat__hero">What should we build?</h1>

				{notice ? (
					<button type="button" className="composer__notice" title="Dismiss" onClick={() => actions.notice("")}>
						{notice}
					</button>
				) : null}

				<div className="newchat__row">
					<span className="chip chip--framed chip--static" title="kodepi runs pi on this machine">
						<MachineIcon />
						<span className="chip__label">Local</span>
					</span>

					<DirectoryChip />

					<span className="chip chip--framed chip--static" title={cwd ? `The branch checked out in ${cwd}` : ""}>
						<BranchIcon />
						<span className="chip__label chip__label--code">{branch ?? "no branch"}</span>
					</span>

					<label className="chip chip--framed chip--off" title={WORKTREE_NOTE}>
						<input type="checkbox" disabled checked={false} readOnly />
						<span className="chip__label">worktree</span>
					</label>

					<span className="spacer" />

					<button type="button" className="chip chip--framed chip--icon" title="Choose another directory…" onClick={() => void actions.chooseNewCwd()}>
						<FolderIcon />
					</button>
				</div>

				<div className="composer__box">
					<textarea
						className="composer__input"
						value={draft}
						placeholder={cwd ? "Ask pi to start something. ⏎ to send, ⇧⏎ for a new line." : "Choose a directory first."}
						disabled={!cwd}
						onChange={(e) => setDraft(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && !e.shiftKey) {
								e.preventDefault();
								send();
							}
						}}
					/>
					<div className="composer__bar">
						<span className="newchat__where">{cwd || "Nowhere to run yet"}</span>
						<span className="spacer" />
						<button
							type="button"
							className="send"
							title={cwd ? "Start the chat" : "Choose a directory first"}
							style={{ opacity: cwd && draft.trim() ? 1 : 0.4 }}
							disabled={!cwd || !draft.trim()}
							onClick={send}
						>
							<SendIcon />
						</button>
					</div>
				</div>

				<p className="newchat__note">{WORKTREE_NOTE}</p>
			</div>
		</div>
	);
}
