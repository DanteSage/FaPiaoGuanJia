import { useReducer, useCallback, useMemo } from "react";
import type { InvoiceFileItem, OcrResult } from "../types";
import { useOfdPreload } from "./useOfdPreload";

export type BusyState =
  | { kind: "idle" }
  | { kind: "picking" }
  | { kind: "ocr"; fileId: string }
  | { kind: "batchOcr"; done: number; total: number }
  | { kind: "merge" }
  | { kind: "exporting"; step: string; done: number; total: number }
  | { kind: "printing"; step: string; done: number; total: number };

export type AppState = {
  files: InvoiceFileItem[];
  activeId: string | null;
  ocr: Record<string, OcrResult>;
  busy: BusyState;
  cellRotations: Record<number, number>;
  cellScales: Record<number, number>;
};

export type AppAction =
  | { type: "ADD_FILES"; payload: InvoiceFileItem[] }
  | { type: "REMOVE_FILE"; payload: string }
  | { type: "CLEAR_FILES" }
  | { type: "SET_ACTIVE"; payload: string | null }
  | { type: "SET_FILES"; payload: InvoiceFileItem[] }
  | { type: "SET_OCR"; payload: { id: string; result: OcrResult } }
  | { type: "CLEAR_OCR"; payload: string }
  | { type: "SET_BUSY"; payload: BusyState }
  | { type: "SET_CELL_ROTATION"; payload: { index: number; rotation: number } }
  | { type: "SET_CELL_SCALE"; payload: { index: number; scale: number } }
  | { type: "SET_CELL_ROTATIONS"; payload: Record<number, number> }
  | { type: "SET_CELL_SCALES"; payload: Record<number, number> }
  | { type: "RESET_CELL_TRANSFORMS" };

const initialState: AppState = {
  files: [],
  activeId: null,
  ocr: {},
  busy: { kind: "idle" },
  cellRotations: {},
  cellScales: {},
};

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "ADD_FILES": {
      const exists = new Set(state.files.map((x) => x.path));
      const newFiles = action.payload.filter((x) => !exists.has(x.path));
      return {
        ...state,
        files: [...state.files, ...newFiles],
        activeId: state.activeId ?? newFiles[0]?.id ?? null,
      };
    }
    case "REMOVE_FILE": {
      const fileId = action.payload;
      const newFiles = state.files.filter((f) => f.id !== fileId);
      const newOcr = { ...state.ocr };
      delete newOcr[fileId];
      return {
        ...state,
        files: newFiles,
        ocr: newOcr,
        activeId: state.activeId === fileId ? null : state.activeId,
      };
    }
    case "CLEAR_FILES":
      return { ...state, files: [], activeId: null, ocr: {}, cellRotations: {}, cellScales: {} };
    case "SET_ACTIVE":
      return { ...state, activeId: action.payload };
    case "SET_FILES":
      return { ...state, files: action.payload };
    case "SET_OCR":
      return { ...state, ocr: { ...state.ocr, [action.payload.id]: action.payload.result } };
    case "CLEAR_OCR": {
      const newOcr = { ...state.ocr };
      delete newOcr[action.payload];
      return { ...state, ocr: newOcr };
    }
    case "SET_BUSY":
      return { ...state, busy: action.payload };
    case "SET_CELL_ROTATION":
      return { ...state, cellRotations: { ...state.cellRotations, [action.payload.index]: action.payload.rotation } };
    case "SET_CELL_SCALE":
      return { ...state, cellScales: { ...state.cellScales, [action.payload.index]: action.payload.scale } };
    case "SET_CELL_ROTATIONS":
      return { ...state, cellRotations: action.payload };
    case "SET_CELL_SCALES":
      return { ...state, cellScales: action.payload };
    case "RESET_CELL_TRANSFORMS":
      return { ...state, cellRotations: {}, cellScales: {} };
    default:
      return state;
  }
}

export function useAppState() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const { preloadOfdFiles } = useOfdPreload();

  const addFiles = useCallback((files: InvoiceFileItem[]) => {
    dispatch({ type: "ADD_FILES", payload: files });
    preloadOfdFiles(files);
  }, [preloadOfdFiles]);

  const removeFile = useCallback((fileId: string) => {
    dispatch({ type: "REMOVE_FILE", payload: fileId });
  }, []);

  const clearFiles = useCallback(() => {
    dispatch({ type: "CLEAR_FILES" });
  }, []);

  const setActive = useCallback((id: string | null) => {
    dispatch({ type: "SET_ACTIVE", payload: id });
  }, []);

  const setFiles = useCallback((files: InvoiceFileItem[]) => {
    dispatch({ type: "SET_FILES", payload: files });
  }, []);

  const setOcr = useCallback((id: string, result: OcrResult) => {
    dispatch({ type: "SET_OCR", payload: { id, result } });
  }, []);

  const setBusy = useCallback((busy: BusyState) => {
    dispatch({ type: "SET_BUSY", payload: busy });
  }, []);

  const setCellRotations = useCallback((rotations: Record<number, number>) => {
    dispatch({ type: "SET_CELL_ROTATIONS", payload: rotations });
  }, []);

  const setCellScales = useCallback((scales: Record<number, number>) => {
    dispatch({ type: "SET_CELL_SCALES", payload: scales });
  }, []);

  const activeFile = useMemo(() => state.files.find((f) => f.id === state.activeId) ?? null, [state.files, state.activeId]);
  const activeOcr = useMemo(() => (state.activeId ? state.ocr[state.activeId] : undefined), [state.activeId, state.ocr]);
  const canRun = state.busy.kind === "idle";

  return {
    files: state.files,
    activeId: state.activeId,
    ocr: state.ocr,
    busy: state.busy,
    cellRotations: state.cellRotations,
    cellScales: state.cellScales,
    activeFile,
    activeOcr,
    canRun,
    addFiles,
    removeFile,
    clearFiles,
    setActive,
    setFiles,
    setOcr,
    setBusy,
    setCellRotations,
    setCellScales,
    dispatch,
  };
}

export type UseAppStateReturn = ReturnType<typeof useAppState>;
