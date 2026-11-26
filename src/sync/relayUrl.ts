/**
 * The relay this build talks to, if any: VITE_RELAY_URL at build time
 * ("/relay" when the app is served by the EmperorsList server, or a full
 * wss:// URL to share one relay between addresses). Empty = PeerJS/WebRTC.
 */
export const RELAY_URL: string = (import.meta.env.VITE_RELAY_URL as string | undefined) ?? '';
