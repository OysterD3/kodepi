import type { JSX } from "react";
import type { QuestionStep } from "@shared/model";

/**
 * pi records the reply as the tool result, so a question read off disk is
 * always settled. The unanswered state needs a live run and is not reachable
 * here; the options are listed for context, and the answer is marked.
 */
export function StepQuestion({ step }: { step: QuestionStep }): JSX.Element {
	return (
		<div className="question">
			<div className="question__head">
				<span className="question__label">QUESTION</span>
				<span className="question__meta">{step.meta}</span>
			</div>
			<div className="question__text">{step.text}</div>

			{step.options.length > 0 ? (
				<div className="question__options">
					{step.options.map((option) => (
						<div className="question__option" key={option.name}>
							<span className={`question__radio${step.answer?.includes(option.name) ? " question__radio--on" : ""}`} />
							<span className="question__name">{option.name}</span>
							<span className="spacer" />
							<span className="question__key">{option.key}</span>
						</div>
					))}
				</div>
			) : null}

			{step.answer ? (
				<div className="question__answer">
					<span className="question__radio question__radio--on" />
					<span className="question__name">{step.answer}</span>
					<span className="spacer" />
					<span className="hint">recorded answer</span>
				</div>
			) : null}
		</div>
	);
}
