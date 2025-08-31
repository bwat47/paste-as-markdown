// Mock Joplin API types
export enum ToastType {
    Error = 'error',
    Warning = 'warning',
    Info = 'info',
}

export interface Toast {
    message: string;
    type: ToastType;
    duration?: number;
}
