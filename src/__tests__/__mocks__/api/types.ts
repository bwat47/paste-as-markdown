// Mock Joplin API types
export enum ToastType {
    Error = 'error',
    Warning = 'warning',
    Info = 'info',
}

export enum SettingItemType {
    String = 2,
    Bool = 3,
}

export interface Toast {
    message: string;
    type: ToastType;
    duration?: number;
}
