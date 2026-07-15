import { createContext, useContext, useMemo, useCallback, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getPathBySection, getSectionByPath, type SectionId } from "../routes";

type NavigationContextValue = {
  section: SectionId;
  navigate: (section: SectionId) => void;
};

const NavigationContext = createContext<NavigationContextValue | null>(null);

export function useNavigation(): NavigationContextValue {
  const ctx = useContext(NavigationContext);
  if (!ctx) {
    throw new Error("useNavigation must be used within NavigationProvider");
  }
  return ctx;
}

export function NavigationProvider({
  children,
  onSectionChange,
}: {
  children: ReactNode;
  onSectionChange?: (section: SectionId) => void;
}) {
  const location = useLocation();
  const routerNavigate = useNavigate();
  const section = getSectionByPath(location.pathname) ?? "workspace";

  const navigate = useCallback(
    (newSection: SectionId) => {
      routerNavigate(getPathBySection(newSection));
      onSectionChange?.(newSection);
    },
    [onSectionChange, routerNavigate]
  );

  const value = useMemo(
    () => ({
      section,
      navigate,
    }),
    [section, navigate]
  );

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}
