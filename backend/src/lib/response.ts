export const ok = <T>(data: T) => ({ success: true as const, data });
export const fail = (message: string) => ({ success: false as const, message });
