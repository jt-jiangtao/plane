import { createContext, useContext, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

export type DesktopHistoryControls = {
  canGoBack: boolean;
  canGoForward: boolean;
  back: () => void;
  forward: () => void;
};

const DesktopHistoryControlsContext = createContext<DesktopHistoryControls | null>(null);
const DesktopHistoryPublishContext = createContext<(controls: DesktopHistoryControls | null) => void>(() => undefined);

export function DesktopHistoryProvider({ children }: { children: React.ReactNode }) {
  const [controls, setControls] = useState<DesktopHistoryControls | null>(null);
  return (
    <DesktopHistoryPublishContext.Provider value={setControls}>
      <DesktopHistoryControlsContext.Provider value={controls}>{children}</DesktopHistoryControlsContext.Provider>
    </DesktopHistoryPublishContext.Provider>
  );
}

export function usePublishDesktopHistory(controls: DesktopHistoryControls) {
  const setControls = useContext(DesktopHistoryPublishContext);
  const { canGoBack, canGoForward, back, forward } = controls;
  useEffect(() => {
    setControls({ canGoBack, canGoForward, back, forward });
  }, [setControls, canGoBack, canGoForward, back, forward]);
  useEffect(() => () => setControls(null), [setControls]);
}

export function DesktopHistoryButtons() {
  const controls = useContext(DesktopHistoryControlsContext);
  if (!controls) return null;
  return (
    <div className="flex translate-y-[3px] items-center">
      <button
        type="button"
        aria-label="返回"
        title="返回 (⌘[)"
        disabled={!controls.canGoBack}
        onClick={controls.back}
        className="grid size-7 place-items-center rounded-md text-secondary hover:bg-layer-transparent-hover disabled:opacity-30"
      >
        <ArrowLeft className="size-4" />
      </button>
      <button
        type="button"
        aria-label="前进"
        title="前进 (⌘])"
        disabled={!controls.canGoForward}
        onClick={controls.forward}
        className="grid size-7 place-items-center rounded-md text-secondary hover:bg-layer-transparent-hover disabled:opacity-30"
      >
        <ArrowRight className="size-4" />
      </button>
    </div>
  );
}
