import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { clsx } from "clsx";
import styles from "./Toast.module.css";

export type ToastType = "info" | "success" | "warning" | "error";

export interface ToastOptions {
  type?: ToastType;
  title?: string;
  message: string;
  details?: string[];
  durationMs?: number;
}

export interface ToastItem extends ToastOptions {
  id: string;
  type: ToastType;
}

interface ToastContextValue {
  show: (options: ToastOptions) => string;
  success: (
    message: string,
    options?: Omit<ToastOptions, "type" | "message">,
  ) => string;
  error: (
    message: string,
    options?: Omit<ToastOptions, "type" | "message">,
  ) => string;
  warning: (
    message: string,
    options?: Omit<ToastOptions, "type" | "message">,
  ) => string;
  info: (
    message: string,
    options?: Omit<ToastOptions, "type" | "message">,
  ) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATIONS: Record<ToastType, number> = {
  info: 4000,
  success: 3500,
  warning: 5000,
  error: 6500,
};

let toastCounter = 0;

function ToastIcon({ type }: { type: ToastType }): React.JSX.Element {
  switch (type) {
    case "success":
      return (
        <svg
          viewBox="0 0 20 20"
          width="22"
          height="22"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 10.5l4 4 8-8" />
        </svg>
      );
    case "warning":
      return (
        <svg
          viewBox="0 0 20 20"
          width="22"
          height="22"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M10 3l8 14H2L10 3z" />
          <path d="M10 8v4" />
          <circle cx="10" cy="14.5" r="0.75" fill="currentColor" />
        </svg>
      );
    case "error":
      return (
        <svg
          viewBox="0 0 20 20"
          width="22"
          height="22"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="10" cy="10" r="8" />
          <path d="M10 6v5" />
          <circle cx="10" cy="14" r="0.75" fill="currentColor" />
        </svg>
      );
    case "info":
    default:
      return (
        <svg
          viewBox="0 0 20 20"
          width="22"
          height="22"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="10" cy="10" r="8" />
          <path d="M10 9v5" />
          <circle cx="10" cy="6.5" r="0.75" fill="currentColor" />
        </svg>
      );
  }
}

function ToastElement({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}): React.JSX.Element {
  const [isPaused, setIsPaused] = useState(false);
  const remainingRef = useRef(
    toast.durationMs ?? DEFAULT_DURATIONS[toast.type],
  );
  const startTimeRef = useRef(0);

  useEffect(() => {
    if (isPaused || remainingRef.current <= 0) return;

    startTimeRef.current = Date.now();
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, remainingRef.current);

    return () => {
      clearTimeout(timer);
      if (startTimeRef.current > 0) {
        const elapsed = Date.now() - startTimeRef.current;
        remainingRef.current = Math.max(0, remainingRef.current - elapsed);
      }
    };
  }, [isPaused, onDismiss, toast.id]);

  const role =
    toast.type === "error" || toast.type === "warning" ? "alert" : "status";

  return (
    <div
      className={clsx(styles.item, styles[toast.type])}
      role={role}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className={styles.icon}>
        <ToastIcon type={toast.type} />
      </div>
      <div className={styles.body}>
        {toast.title && <div className={styles.title}>{toast.title}</div>}
        <div className={styles.message}>{toast.message}</div>
        {toast.details && toast.details.length > 0 && (
          <ul className={styles.details}>
            {toast.details.map((detail, idx) => (
              <li key={idx}>{detail}</li>
            ))}
          </ul>
        )}
      </div>
      <button
        type="button"
        className={styles.close}
        aria-label="关闭提示"
        onClick={() => onDismiss(toast.id)}
      >
        <svg
          viewBox="0 0 16 16"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 3l10 10M13 3L3 13" />
        </svg>
      </button>
    </div>
  );
}

export function ToastProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const show = useCallback((options: ToastOptions): string => {
    const id = `toast-${Date.now()}-${++toastCounter}`;
    const type = options.type ?? "info";
    const item: ToastItem = {
      ...options,
      id,
      type,
    };
    setToasts((current) => [...current, item]);
    return id;
  }, []);

  const success = useCallback(
    (
      message: string,
      options?: Omit<ToastOptions, "type" | "message">,
    ): string => {
      return show({ ...options, message, type: "success" });
    },
    [show],
  );

  const error = useCallback(
    (
      message: string,
      options?: Omit<ToastOptions, "type" | "message">,
    ): string => {
      return show({ ...options, message, type: "error" });
    },
    [show],
  );

  const warning = useCallback(
    (
      message: string,
      options?: Omit<ToastOptions, "type" | "message">,
    ): string => {
      return show({ ...options, message, type: "warning" });
    },
    [show],
  );

  const info = useCallback(
    (
      message: string,
      options?: Omit<ToastOptions, "type" | "message">,
    ): string => {
      return show({ ...options, message, type: "info" });
    },
    [show],
  );

  const value = useMemo(
    () => ({
      show,
      success,
      error,
      warning,
      info,
      dismiss,
    }),
    [show, success, error, warning, info, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toasts.length > 0 && (
        <div
          className={styles.container}
          aria-live="polite"
          aria-atomic="false"
        >
          {toasts.map((toast) => (
            <ToastElement
              key={toast.id}
              toast={toast}
              onDismiss={dismiss}
            />
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
