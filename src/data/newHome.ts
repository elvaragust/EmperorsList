/** The address this app moved to, set at build time for the old address (VITE_NEW_HOME). Empty = not moved. */
export const NEW_HOME: string = ((import.meta.env.VITE_NEW_HOME as string | undefined) ?? '').replace(/\/+$/, '');
