import { ToastProvider } from "./components/Toast";
import { BubbleShell } from "./windows/BubbleShell";
import { PetShell } from "./windows/PetShell";
import { SettingsShell } from "./windows/SettingsShell";

export function App(): React.JSX.Element {
  const kind = window.dearCompanion.getWindowKind();
  // This trusted preload value selects the renderer window mode before it paints.
  // eslint-disable-next-line react-hooks/immutability
  document.documentElement.dataset.window = kind;

  return (
    <ToastProvider>
      {kind === "pet" ? (
        <PetShell api={window.dearCompanion} />
      ) : kind === "bubble" ? (
        <BubbleShell api={window.dearCompanion} />
      ) : (
        <SettingsShell api={window.dearCompanion} />
      )}
    </ToastProvider>
  );
}
