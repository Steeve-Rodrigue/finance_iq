"use client";

import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Html, RoundedBox } from "@react-three/drei";
import * as THREE from "three";

import {
  useDemoTimeline,
  type DemoState,
} from "@/components/landing/demo-timeline";

const GOLD = "#e5b85c";
const SUCCESS = "#199e70";
const WARNING = "#c98500";
const ORANGE = "#eb6834";

const PDF_LINES = [
  { width: 60 },
  { width: 80 },
  { width: 45 },
  { width: 70, divider: true },
  { width: 90 },
  { width: 75 },
  { width: 85 },
  { width: 50 },
  { width: 70, divider: true },
  { width: 40 },
  { width: 30, bold: true },
];

const FIELDS = [
  { label: "Vendor", value: "Carrefour" },
  { label: "Date", value: "12/02/2026" },
  { label: "Total", value: "€248.50" },
  { label: "Category", value: "Groceries" },
];

const METRICS = [
  { label: "Total spent", value: "€4,820", delta: "↑ 12% this month" },
  { label: "Bills processed", value: "47", delta: "3 pending" },
  { label: "Auto-resolved", value: "91%", delta: "↑ from 84%" },
];

const CATEGORIES = [
  { name: "Groceries", color: GOLD, amount: "€1,840" },
  { name: "Utilities", color: ORANGE, amount: "€920" },
  { name: "Transport", color: SUCCESS, amount: "€680" },
  { name: "Software", color: WARNING, amount: "€380" },
];

const MONTH_LABELS = ["Sep", "Oct", "Nov", "Dec", "Jan", "Feb"];

function reveal(visible: boolean, translate = "translate-y-2.5") {
  return visible ? "opacity-100 translate-y-0" : `opacity-0 ${translate}`;
}

function DemoScreens({ state }: { state: DemoState }) {
  return (
    <div
      className="flex flex-col overflow-hidden rounded-2xl shadow-2xl"
      style={{
        width: 800,
        height: 500,
        background: "#ffffff",
        border: "0.5px solid #e2e8f0",
        color: "#0f172a",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div
        className="flex h-9 items-center gap-2 px-3"
        style={{ background: "#f8fafc", borderBottom: "0.5px solid #e2e8f0" }}
      >
        <div
          className="size-2.5 rounded-full"
          style={{ background: "#e66767" }}
        />
        <div
          className="size-2.5 rounded-full"
          style={{ background: WARNING }}
        />
        <div
          className="size-2.5 rounded-full"
          style={{ background: SUCCESS }}
        />
        <div
          className="ml-3 flex-1 rounded px-3 py-1 text-xs"
          style={{ background: "#ffffff", color: "#64748b" }}
        >
          app.financeiq.io
        </div>
      </div>

      <div className="relative flex-1">
        {/* Screen 1: Upload */}
        <div
          className={`absolute inset-0 flex flex-col items-center justify-center gap-6 p-8 transition-opacity duration-500 ${
            state.phase === "upload"
              ? "opacity-100"
              : "pointer-events-none opacity-0"
          }`}
        >
          <div
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] transition-all duration-500 ${reveal(state.upload.pillVisible, "-translate-y-5")}`}
            style={{ background: "#f8fafc", border: "0.5px solid #e2e8f0" }}
          >
            📄 invoice_february.pdf
          </div>
          <div
            className="flex h-[200px] w-[400px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed transition-all duration-400"
            style={{
              borderColor:
                state.upload.zoneState === "dropping"
                  ? GOLD
                  : state.upload.zoneState === "done"
                    ? SUCCESS
                    : "#e2e8f0",
              background:
                state.upload.zoneState === "dropping"
                  ? "rgba(229,184,92,0.06)"
                  : state.upload.zoneState === "done"
                    ? "rgba(25,158,112,0.06)"
                    : "transparent",
            }}
          >
            <div className="text-4xl opacity-90">{state.upload.icon}</div>
            <div className="text-sm" style={{ color: "#64748b" }}>
              {state.upload.text}
            </div>
          </div>
          <div
            className={`text-sm transition-opacity duration-400 ${state.upload.successVisible ? "opacity-100" : "opacity-0"}`}
            style={{ color: SUCCESS }}
          >
            ✓ Document uploaded
          </div>
        </div>

        {/* Screen 2: Analyze */}
        <div
          className={`absolute inset-0 flex gap-6 p-6 transition-opacity duration-500 ${
            state.phase === "analyze"
              ? "opacity-100"
              : "pointer-events-none opacity-0"
          }`}
        >
          <div
            className="flex flex-1 flex-col gap-2 rounded-xl p-6"
            style={{ background: "#f8fafc", border: "0.5px solid #e2e8f0" }}
          >
            {PDF_LINES.map((line, i) => (
              <div
                key={i}
                className={`rounded transition-opacity duration-300 ${i < state.analyze.pdfLinesVisible ? "opacity-100" : "opacity-0"}`}
                style={{
                  width: `${line.width}%`,
                  height: line.divider ? 1 : line.bold ? 14 : 8,
                  margin: line.divider ? "8px 0" : undefined,
                  background:
                    state.analyze.highlightIndex === i
                      ? "rgba(229,184,92,0.35)"
                      : "#e2e8f0",
                }}
              />
            ))}
          </div>

          <div className="flex flex-1 flex-col gap-4">
            <div
              className="flex items-center gap-2 text-sm font-medium"
              style={{ color: "#475569" }}
            >
              <span>🤖</span>
              <span>{state.analyze.aiStatus}</span>
            </div>

            {FIELDS.map((field, i) => {
              const fieldState = state.analyze.fields[i];
              return (
                <div
                  key={field.label}
                  className={`flex items-center justify-between rounded-lg px-4 py-3 transition-all duration-500 ${reveal(fieldState.visible, "translate-x-5")}`}
                  style={{
                    background: "#f8fafc",
                    border: "0.5px solid #e2e8f0",
                  }}
                >
                  <span className="text-xs" style={{ color: "#64748b" }}>
                    {field.label}
                  </span>
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {field.value}
                    <span
                      className={`transition-opacity duration-300 ${fieldState.checked ? "opacity-100" : "opacity-0"}`}
                      style={{ color: SUCCESS }}
                    >
                      ✓
                    </span>
                  </span>
                </div>
              );
            })}

            <div
              className={`mt-auto rounded-lg p-4 transition-opacity duration-500 ${state.analyze.confVisible ? "opacity-100" : "opacity-0"}`}
              style={{ background: "#f8fafc", border: "0.5px solid #e2e8f0" }}
            >
              <div
                className="mb-2 flex justify-between text-xs"
                style={{ color: "#64748b" }}
              >
                <span>Confidence</span>
                <span>{state.analyze.confPercent}%</span>
              </div>
              <div
                className="h-2 overflow-hidden rounded"
                style={{ background: "#e2e8f0" }}
              >
                <div
                  className="h-full rounded transition-[width] duration-[1500ms] ease-out"
                  style={{
                    width: `${state.analyze.confPercent}%`,
                    background: SUCCESS,
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Screen 3: Dashboard */}
        <div
          className={`absolute inset-0 flex flex-col gap-4 p-6 transition-opacity duration-500 ${
            state.phase === "dashboard"
              ? "opacity-100"
              : "pointer-events-none opacity-0"
          }`}
        >
          <div className="grid grid-cols-3 gap-3">
            {METRICS.map((metric, i) => (
              <div
                key={metric.label}
                className={`rounded-xl p-4 transition-all duration-500 ${reveal(state.dashboard.metricsVisible[i])}`}
                style={{ background: "#f8fafc", border: "0.5px solid #e2e8f0" }}
              >
                <div
                  className="mb-1.5 text-[11px]"
                  style={{ color: "#64748b" }}
                >
                  {metric.label}
                </div>
                <div className="text-[22px] font-medium">{metric.value}</div>
                <div className="mt-1 text-[11px]" style={{ color: SUCCESS }}>
                  {metric.delta}
                </div>
              </div>
            ))}
          </div>

          <div className="grid flex-1 grid-cols-[1.5fr_1fr] gap-3">
            <div
              className={`rounded-xl p-4 transition-all duration-500 ${reveal(state.dashboard.chartsVisible[0])}`}
              style={{ background: "#f8fafc", border: "0.5px solid #e2e8f0" }}
            >
              <div className="mb-3 text-xs" style={{ color: "#64748b" }}>
                Spending trend
              </div>
              <div className="flex h-[120px] items-end gap-1.5 pt-2">
                {MONTH_LABELS.map((label, i) => (
                  <div
                    key={label}
                    className="flex flex-1 flex-col items-stretch"
                  >
                    <div
                      className="rounded-t transition-[height] duration-[800ms] ease-out"
                      style={{
                        height: `${state.dashboard.barHeights[i]}%`,
                        background: GOLD,
                        opacity: i === MONTH_LABELS.length - 1 ? 0.8 : 1,
                      }}
                    />
                    <div
                      className="mt-1 text-center text-[9px]"
                      style={{ color: "#64748b" }}
                    >
                      {label}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div
              className={`rounded-xl p-4 transition-all duration-500 ${reveal(state.dashboard.chartsVisible[1])}`}
              style={{ background: "#f8fafc", border: "0.5px solid #e2e8f0" }}
            >
              <div className="mb-3 text-xs" style={{ color: "#64748b" }}>
                Categories
              </div>
              {CATEGORIES.map((category, i) => (
                <div
                  key={category.name}
                  className={`mb-2.5 flex items-center gap-3 transition-opacity duration-400 ${state.dashboard.catVisible[i] ? "opacity-100" : "opacity-0"}`}
                >
                  <span
                    className="w-[70px] text-xs"
                    style={{ color: "#475569" }}
                  >
                    {category.name}
                  </span>
                  <div
                    className="h-4 rounded transition-[width] duration-[800ms] ease-out"
                    style={{
                      width: state.dashboard.catWidths[i],
                      background: category.color,
                    }}
                  />
                  <span
                    className="ml-2 text-[11px]"
                    style={{ color: "#64748b" }}
                  >
                    {category.amount}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div
            className={`p-3 text-center text-sm italic transition-opacity duration-700 ${state.dashboard.taglineVisible ? "opacity-100" : "opacity-0"}`}
            style={{ color: "#475569" }}
          >
            Your bill just became actionable insight.
          </div>
        </div>
      </div>

      <div className="flex justify-center gap-2 pb-4">
        {[1, 2, 3].map((dot) => (
          <div
            key={dot}
            className="size-2 rounded-full transition-colors duration-300"
            style={{ background: state.phaseDot === dot ? GOLD : "#e2e8f0" }}
          />
        ))}
      </div>
    </div>
  );
}

function Scene({ state }: { state: DemoState }) {
  const root = useRef<THREE.Group>(null!);

  useFrame((frameState, delta) => {
    root.current.rotation.y +=
      (frameState.pointer.x * 0.18 - root.current.rotation.y) *
      Math.min(1, delta * 2);
    root.current.rotation.x +=
      (-frameState.pointer.y * 0.1 - root.current.rotation.x) *
      Math.min(1, delta * 2);
    root.current.position.y =
      Math.sin(frameState.clock.elapsedTime * 0.6) * 0.06;
  });

  return (
    <group ref={root}>
      <RoundedBox
        args={[4.7, 3.05, 0.12]}
        radius={0.05}
        smoothness={4}
        receiveShadow
        castShadow
      >
        <meshStandardMaterial
          color="#0b0b0b"
          roughness={0.6}
          metalness={0.15}
        />
      </RoundedBox>
      <Html
        transform
        occlude={false}
        distanceFactor={1.72}
        position={[0, 0, 0.07]}
        style={{ pointerEvents: "none" }}
      >
        <DemoScreens state={state} />
      </Html>
    </group>
  );
}

export function WorkflowDemo({ className }: { className?: string }) {
  const state = useDemoTimeline();

  return (
    <div className={className}>
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        shadows
        camera={{ position: [0, 0, 6.2], fov: 38 }}
      >
        <ambientLight intensity={0.7} />
        <directionalLight position={[3, 4, 5]} intensity={0.9} castShadow />
        <pointLight position={[-3, -1, 2]} intensity={0.3} color={GOLD} />
        <Scene state={state} />
        <ContactShadows
          position={[0, -1.7, 0]}
          opacity={0.4}
          scale={9}
          blur={2.6}
          far={3}
          color="#000000"
        />
      </Canvas>
    </div>
  );
}
