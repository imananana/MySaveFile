import { createContext, useContext, useState, useCallback } from 'react';
import { useEscapeToClose } from './useEscapeToClose';
import { btn } from './btn';

interface ConfirmOptions {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn>(null!);

export function useConfirm(): ConfirmFn {
  return useContext(ConfirmContext);
}

interface State {
  options: Required<ConfirmOptions>;
  resolve: (v: boolean) => void;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State | null>(null);

  const confirm = useCallback((optionsOrMessage: ConfirmOptions | string): Promise<boolean> => {
    const raw = typeof optionsOrMessage === 'string' ? { message: optionsOrMessage } : optionsOrMessage;
    const options: Required<ConfirmOptions> = {
      message: raw.message,
      confirmLabel: raw.confirmLabel ?? 'Confirm',
      cancelLabel: raw.cancelLabel ?? 'Cancel',
      danger: raw.danger ?? false,
    };
    return new Promise((resolve) => setState({ options, resolve }));
  }, []);

  function respond(value: boolean) {
    state?.resolve(value);
    setState(null);
  }

  // Escape answers "no". It has to RESOLVE, not just unmount — a caller is
  // awaiting this promise and would hang forever otherwise. Registering here
  // also puts the confirm on top of the Escape stack, so a confirm raised from
  // inside a modal takes the keypress instead of the modal behind it.
  useEscapeToClose(() => respond(false), !!state);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div
          className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-5"
          onClick={() => respond(false)}
        >
          <div
            className="bg-c-card border border-c-border shadow-2xl rounded-[10px] w-full max-w-[340px] p-6 flex flex-col gap-5"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[14px] text-c-text leading-snug whitespace-pre-line">{state.options.message}</p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => respond(false)}
                className={btn('ghost')}
              >
                {state.options.cancelLabel}
              </button>
              <button
                onClick={() => respond(true)}
                /* Both branches used to tint themselves with an opacity
                   modifier on a var() token, which compiles to nothing — so the
                   destructive button had no resting tint AND no hover response
                   at all. Clicking Delete looked identical to not hovering it. */
                className={btn(state.options.danger ? 'danger' : 'primary')}
              >
                {state.options.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
