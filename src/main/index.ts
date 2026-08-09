/**
 * App lifecycle, the window, and the security posture.
 *
 * The preload is sandboxed, so `electron.vite.config.ts` forces it to CJS. A
 * sandboxed preload is loaded as a classic script: an ESM one dies on its first
 * `import` and leaves `window.api` undefined with no visible error.
 */

import { join } from "node:path";
import { BrowserWindow, app, session, shell } from "electron";
import { registerIpc } from "./ipc";
import { killAgents } from "./services/agent";
import { killShells } from "./services/terminal";

const isDev = !app.isPackaged;

/**
 * The design draws a fixed 1600×1000 card. A real window is resizable, so the
 * card becomes the window itself; the minimum is the width below which the
 * 268px rail, the 880px transcript and the 408px inspector start to collide.
 */
const WINDOW = { width: 1600, height: 1000, minWidth: 1120, minHeight: 720 };

function csp(): string {
	const connect = isDev ? "connect-src 'self' ws: http://localhost:*" : "connect-src 'self'";
	return [
		"default-src 'self'",
		// Vite injects styles as <style> tags in dev, and every component here
		// sets computed values (widths, tints) with the style attribute.
		"style-src 'self' 'unsafe-inline'",
		isDev ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self'",
		"img-src 'self' data:",
		"font-src 'self' data:",
		connect,
		"object-src 'none'",
		"frame-src 'none'",
		"base-uri 'none'",
		"form-action 'none'",
	].join("; ");
}

function createWindow(): void {
	const win = new BrowserWindow({
		...WINDOW,
		show: false,
		backgroundColor: "#1c1c1c",
		titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
		trafficLightPosition: { x: 16, y: 20 },
		webPreferences: {
			preload: join(__dirname, "../preload/index.cjs"),
			sandbox: true,
			contextIsolation: true,
			nodeIntegration: false,
			webviewTag: false,
		},
	});

	win.once("ready-to-show", () => win.show());

	// Nothing in this app navigates. Links go to the OS browser, and only if
	// they are http(s) — anything else is a way to launch a local handler.
	win.webContents.on("will-navigate", (event) => event.preventDefault());
	win.webContents.setWindowOpenHandler(({ url }) => {
		if (url.startsWith("https://") || url.startsWith("http://")) void shell.openExternal(url);
		return { action: "deny" };
	});

	const devServer = process.env["ELECTRON_RENDERER_URL"];
	if (isDev && devServer) void win.loadURL(devServer);
	else void win.loadFile(join(__dirname, "../renderer/index.html"));
}

app.whenReady().then(() => {
	session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
		callback({ responseHeaders: { ...details.responseHeaders, "Content-Security-Policy": [csp()] } });
	});

	registerIpc();
	createWindow();

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});

// A pty is not a child of the renderer: without this the shells outlive the app.
app.on("will-quit", () => {
	killShells();
	killAgents();
});
