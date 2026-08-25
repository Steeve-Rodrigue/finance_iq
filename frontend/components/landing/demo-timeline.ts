import { useEffect, useReducer } from "react";

export type DemoPhase = "upload" | "analyze" | "dashboard";

type FieldState = { visible: boolean; checked: boolean };

export type DemoState = {
  phase: DemoPhase;
  phaseDot: 1 | 2 | 3;
  upload: {
    pillVisible: boolean;
    zoneState: "idle" | "dropping" | "done";
    icon: string;
    text: string;
    successVisible: boolean;
  };
  analyze: {
    pdfLinesVisible: number;
    highlightIndex: number | null;
    fields: [FieldState, FieldState, FieldState, FieldState];
    confVisible: boolean;
    confPercent: number;
    aiStatus: string;
  };
  dashboard: {
    metricsVisible: [boolean, boolean, boolean];
    chartsVisible: [boolean, boolean];
    barHeights: [number, number, number, number, number, number];
    catVisible: [boolean, boolean, boolean, boolean];
    catWidths: [number, number, number, number];
    taglineVisible: boolean;
  };
};

const FILENAME = "invoice_february.pdf";

const INITIAL_STATE: DemoState = {
  phase: "upload",
  phaseDot: 1,
  upload: {
    pillVisible: false,
    zoneState: "idle",
    icon: "📁",
    text: "Drop to upload",
    successVisible: false,
  },
  analyze: {
    pdfLinesVisible: 0,
    highlightIndex: null,
    fields: [
      { visible: false, checked: false },
      { visible: false, checked: false },
      { visible: false, checked: false },
      { visible: false, checked: false },
    ],
    confVisible: false,
    confPercent: 0,
    aiStatus: "AI analyzing...",
  },
  dashboard: {
    metricsVisible: [false, false, false],
    chartsVisible: [false, false],
    barHeights: [0, 0, 0, 0, 0, 0],
    catVisible: [false, false, false, false],
    catWidths: [0, 0, 0, 0],
    taglineVisible: false,
  },
};

type Patch = Partial<{
  phase: DemoPhase;
  phaseDot: 1 | 2 | 3;
  upload: Partial<DemoState["upload"]>;
  analyze: Partial<DemoState["analyze"]>;
  dashboard: Partial<DemoState["dashboard"]>;
}>;

type Action = { type: "patch"; patch: Patch } | { type: "reset" };

function reducer(state: DemoState, action: Action): DemoState {
  if (action.type === "reset") return INITIAL_STATE;
  const { patch } = action;
  return {
    ...state,
    ...patch,
    upload: { ...state.upload, ...patch.upload },
    analyze: { ...state.analyze, ...patch.analyze },
    dashboard: { ...state.dashboard, ...patch.dashboard },
  };
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** Faithful port of docs/a's animate() timeline into a React-driven state machine. */
export function useDemoTimeline(): DemoState {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  useEffect(() => {
    const cancelled = { current: false };

    async function countConfidence() {
      for (let value = 0; value <= 94; value += 2) {
        if (cancelled.current) return;
        dispatch({ type: "patch", patch: { analyze: { confPercent: value } } });
        await sleep(30);
      }
      if (cancelled.current) return;
      dispatch({ type: "patch", patch: { analyze: { confPercent: 94 } } });
    }

    async function run() {
      while (!cancelled.current) {
        dispatch({ type: "reset" });

        // ===== PHASE 1: UPLOAD =====
        await sleep(400);
        if (cancelled.current) return;
        dispatch({ type: "patch", patch: { upload: { pillVisible: true } } });

        await sleep(600);
        if (cancelled.current) return;
        dispatch({
          type: "patch",
          patch: { upload: { zoneState: "dropping" } },
        });

        await sleep(800);
        if (cancelled.current) return;
        dispatch({
          type: "patch",
          patch: {
            upload: {
              zoneState: "done",
              icon: "✅",
              text: FILENAME,
              pillVisible: false,
            },
          },
        });

        await sleep(300);
        if (cancelled.current) return;
        dispatch({
          type: "patch",
          patch: { upload: { successVisible: true } },
        });

        await sleep(800);
        if (cancelled.current) return;

        // ===== PHASE 2: ANALYZE =====
        dispatch({ type: "patch", patch: { phase: "analyze", phaseDot: 2 } });

        for (let i = 1; i <= 11; i++) {
          if (cancelled.current) return;
          dispatch({
            type: "patch",
            patch: { analyze: { pdfLinesVisible: i } },
          });
          await sleep(80);
        }

        await sleep(900);
        if (cancelled.current) return;

        // Vendor (highlights pdf line 0)
        dispatch({
          type: "patch",
          patch: {
            analyze: {
              highlightIndex: 0,
              fields: [
                { visible: true, checked: false },
                INITIAL_STATE.analyze.fields[1],
                INITIAL_STATE.analyze.fields[2],
                INITIAL_STATE.analyze.fields[3],
              ],
            },
          },
        });
        await sleep(400);
        if (cancelled.current) return;
        dispatch({
          type: "patch",
          patch: {
            analyze: {
              highlightIndex: null,
              fields: [
                { visible: true, checked: true },
                INITIAL_STATE.analyze.fields[1],
                INITIAL_STATE.analyze.fields[2],
                INITIAL_STATE.analyze.fields[3],
              ],
            },
          },
        });

        await sleep(300);
        if (cancelled.current) return;

        // Date (highlights pdf line 2)
        dispatch({
          type: "patch",
          patch: {
            analyze: {
              highlightIndex: 2,
              fields: [
                { visible: true, checked: true },
                { visible: true, checked: false },
                INITIAL_STATE.analyze.fields[2],
                INITIAL_STATE.analyze.fields[3],
              ],
            },
          },
        });
        await sleep(400);
        if (cancelled.current) return;
        dispatch({
          type: "patch",
          patch: {
            analyze: {
              highlightIndex: null,
              fields: [
                { visible: true, checked: true },
                { visible: true, checked: true },
                INITIAL_STATE.analyze.fields[2],
                INITIAL_STATE.analyze.fields[3],
              ],
            },
          },
        });

        await sleep(300);
        if (cancelled.current) return;

        // Total (highlights pdf line 10)
        dispatch({
          type: "patch",
          patch: {
            analyze: {
              highlightIndex: 10,
              fields: [
                { visible: true, checked: true },
                { visible: true, checked: true },
                { visible: true, checked: false },
                INITIAL_STATE.analyze.fields[3],
              ],
            },
          },
        });
        await sleep(400);
        if (cancelled.current) return;
        dispatch({
          type: "patch",
          patch: {
            analyze: {
              highlightIndex: null,
              fields: [
                { visible: true, checked: true },
                { visible: true, checked: true },
                { visible: true, checked: true },
                INITIAL_STATE.analyze.fields[3],
              ],
            },
          },
        });

        await sleep(300);
        if (cancelled.current) return;

        // Category (no PDF highlight)
        dispatch({
          type: "patch",
          patch: {
            analyze: {
              fields: [
                { visible: true, checked: true },
                { visible: true, checked: true },
                { visible: true, checked: true },
                { visible: true, checked: false },
              ],
            },
          },
        });
        await sleep(400);
        if (cancelled.current) return;
        dispatch({
          type: "patch",
          patch: {
            analyze: {
              fields: [
                { visible: true, checked: true },
                { visible: true, checked: true },
                { visible: true, checked: true },
                { visible: true, checked: true },
              ],
            },
          },
        });

        await sleep(200);
        if (cancelled.current) return;
        dispatch({ type: "patch", patch: { analyze: { confVisible: true } } });
        await sleep(100);
        if (cancelled.current) return;
        countConfidence(); // fire-and-forget, matches the reference's un-awaited interval

        await sleep(1600);
        if (cancelled.current) return;
        dispatch({
          type: "patch",
          patch: { analyze: { aiStatus: "Extraction complete ✓" } },
        });

        await sleep(800);
        if (cancelled.current) return;

        // ===== PHASE 3: DASHBOARD =====
        dispatch({ type: "patch", patch: { phase: "dashboard", phaseDot: 3 } });

        await sleep(200);
        if (cancelled.current) return;
        dispatch({
          type: "patch",
          patch: { dashboard: { metricsVisible: [true, false, false] } },
        });
        await sleep(150);
        if (cancelled.current) return;
        dispatch({
          type: "patch",
          patch: { dashboard: { metricsVisible: [true, true, false] } },
        });
        await sleep(150);
        if (cancelled.current) return;
        dispatch({
          type: "patch",
          patch: { dashboard: { metricsVisible: [true, true, true] } },
        });

        await sleep(300);
        if (cancelled.current) return;
        dispatch({
          type: "patch",
          patch: { dashboard: { chartsVisible: [true, true] } },
        });

        await sleep(200);
        if (cancelled.current) return;
        dispatch({
          type: "patch",
          patch: { dashboard: { barHeights: [50, 55, 65, 80, 70, 90] } },
        });

        await sleep(200);
        if (cancelled.current) return;
        dispatch({
          type: "patch",
          patch: {
            dashboard: {
              catVisible: [true, false, false, false],
              catWidths: [140, 0, 0, 0],
            },
          },
        });
        await sleep(150);
        if (cancelled.current) return;
        dispatch({
          type: "patch",
          patch: {
            dashboard: {
              catVisible: [true, true, false, false],
              catWidths: [140, 90, 0, 0],
            },
          },
        });
        await sleep(150);
        if (cancelled.current) return;
        dispatch({
          type: "patch",
          patch: {
            dashboard: {
              catVisible: [true, true, true, false],
              catWidths: [140, 90, 65, 0],
            },
          },
        });
        await sleep(150);
        if (cancelled.current) return;
        dispatch({
          type: "patch",
          patch: {
            dashboard: {
              catVisible: [true, true, true, true],
              catWidths: [140, 90, 65, 40],
            },
          },
        });

        await sleep(600);
        if (cancelled.current) return;
        dispatch({
          type: "patch",
          patch: { dashboard: { taglineVisible: true } },
        });

        await sleep(1000);
        if (cancelled.current) return;
      }
    }

    run();

    return () => {
      cancelled.current = true;
    };
  }, []);

  return state;
}
