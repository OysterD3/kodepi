import type { PiApi } from "@shared/ipc";

declare global {
	interface Window {
		readonly api: PiApi;
	}
}

export {};
