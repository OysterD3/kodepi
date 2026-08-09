import type { JSX } from "react";
import type { UserStep } from "@shared/model";

/**
 * The design puts a Rewind control on this card. Rewinding forks the session
 * and restores files, which only a live pi process can do — so the control is
 * absent until the RPC pass rather than present and inert.
 */
export function StepUser({ step }: { step: UserStep }): JSX.Element {
	return (
		<div className="card user">
			<div className="user__head">
				<span className="eyebrow">YOU</span>
			</div>
			<div className="user__text">{step.text}</div>
		</div>
	);
}
